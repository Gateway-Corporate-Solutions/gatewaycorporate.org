import type { JobApplicationValues, JobPosting } from "./careers.ts";

const CAREERS_INBOX = "office@gatewaycorporate.org";
const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const ALLOWED_RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "",
]);
const BLOCKED_EMAILS = new Set([
  "mike7778uk@gmail.com",
]);

export interface ApplicationSubmissionResult {
  ok: boolean;
  status: number;
  message?: string;
  values?: Partial<JobApplicationValues>;
}

interface ParsedApplication {
  values: JobApplicationValues;
  recaptchaToken: string;
  resume: {
    bytes: Uint8Array;
    filename: string;
    contentType: string;
  };
}

interface MailProvider {
  sendApplicationEmail(job: JobPosting, application: ParsedApplication): Promise<void>;
}

class ResendMailProvider implements MailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly to: string,
  ) {}

  async sendApplicationEmail(job: JobPosting, application: ParsedApplication): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [this.to],
        reply_to: application.values.email,
        subject: `Career application: ${job.title} - ${application.values.name}`,
        text: renderPlainTextEmail(job, application),
        html: renderHtmlEmail(job, application),
        attachments: [
          {
            filename: application.resume.filename,
            content: bytesToBase64(application.resume.bytes),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend request failed with ${response.status}: ${errorText}`);
    }
  }
}

export async function submitJobApplication(
  job: JobPosting,
  form: FormData,
): Promise<ApplicationSubmissionResult> {
  if (job.status.toLowerCase() !== "open") {
    return {
      ok: false,
      status: 409,
      message: "Applications are currently closed for this role.",
    };
  }

  const parsed = await parseApplication(job, form);
  if ("error" in parsed) {
    return {
      ok: false,
      status: parsed.status,
      message: parsed.error,
      values: parsed.values,
    };
  }

  try {
    await verifyRecaptcha(parsed.recaptchaToken);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      message: error instanceof Error ? error.message : "reCAPTCHA validation failed.",
      values: parsed.values,
    };
  }

  try {
    const provider = createMailProvider();
    await provider.sendApplicationEmail(job, parsed);
    console.log("Submitted application", {
      job: job.slug,
      applicant: parsed.values.email,
    });
    return { ok: true, status: 302 };
  } catch (error) {
    console.error("Failed to deliver application email", {
      job: job.slug,
      applicant: parsed.values.email,
      error,
    });
    return {
      ok: false,
      status: 502,
      message: "We could not route your application right now. Please try again in a few minutes or email office@gatewaycorporate.org directly.",
      values: parsed.values,
    };
  }
}

function createMailProvider(): MailProvider {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const from = Deno.env.get("CAREERS_EMAIL_FROM") || "";
  const to = Deno.env.get("CAREERS_EMAIL_TO") || CAREERS_INBOX;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!from) {
    throw new Error("CAREERS_EMAIL_FROM is not configured");
  }

  return new ResendMailProvider(apiKey, from, to);
}

async function parseApplication(
  job: JobPosting,
  form: FormData,
): Promise<ParsedApplication | { error: string; status: number; values: Partial<JobApplicationValues> }> {
  const values: JobApplicationValues = {
    name: sanitizeText(form.get("name"), 120),
    email: sanitizeText(form.get("email"), 160),
    phone: sanitizeText(form.get("phone"), 40),
    linkedinUrl: sanitizeUrl(form.get("linkedinUrl"), 200),
    portfolioUrl: sanitizeUrl(form.get("portfolioUrl"), 200),
    whyInterested: sanitizeText(form.get("whyInterested"), 1200),
    fitSummary: sanitizeText(form.get("fitSummary"), 1200),
  };

  if (!values.name || !values.email || !values.whyInterested || !values.fitSummary) {
    return {
      error: "Please complete all required application fields.",
      status: 400,
      values,
    };
  }

  if (!isValidEmail(values.email)) {
    return {
      error: "Please provide a valid email address.",
      status: 400,
      values,
    };
  }

  if (isBlockedEmail(values.email)) {
    return {
      error: "Please use a different email address.",
      status: 400,
      values,
    };
  }

  const recaptchaToken = sanitizeText(form.get("g-recaptcha-response"), 4000);
  if (!recaptchaToken) {
    return {
      error: "Please complete the reCAPTCHA check before submitting.",
      status: 400,
      values,
    };
  }

  const resume = form.get("resume");
  if (!(resume instanceof File) || resume.size === 0) {
    return {
      error: "Please attach your resume as a PDF.",
      status: 400,
      values,
    };
  }

  if (resume.size > MAX_RESUME_BYTES) {
    return {
      error: "Your resume exceeds the 5 MB upload limit.",
      status: 400,
      values,
    };
  }

  const safeFilename = sanitizeFilename(resume.name || `${job.slug}-resume.pdf`);
  const lowerFilename = safeFilename.toLowerCase();
  if (!lowerFilename.endsWith(".pdf") || !ALLOWED_RESUME_MIME_TYPES.has(resume.type)) {
    return {
      error: "Resume uploads must be PDF files.",
      status: 400,
      values,
    };
  }

  const bytes = new Uint8Array(await resume.arrayBuffer());
  if (!looksLikePdf(bytes)) {
    return {
      error: "The uploaded file does not appear to be a valid PDF.",
      status: 400,
      values,
    };
  }

  return {
    values,
    recaptchaToken,
    resume: {
      bytes,
      filename: safeFilename,
      contentType: resume.type || "application/pdf",
    },
  };
}

async function verifyRecaptcha(token: string): Promise<void> {
  const recaptchaSecret = Deno.env.get("RECAPTCHA_SECRET_KEY") || "";
  if (!recaptchaSecret) {
    throw new Error("reCAPTCHA is not configured on the server.");
  }

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret: recaptchaSecret,
      response: token,
    }),
  });

  if (!response.ok) {
    throw new Error("We could not verify the reCAPTCHA challenge.");
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error("reCAPTCHA verification failed. Please try again.");
  }
}

function sanitizeText(value: FormDataEntryValue | null, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/<[^>]+>/g, "")
    .replace(/[\r\n]+/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function sanitizeUrl(value: FormDataEntryValue | null, maxLength: number): string {
  const sanitized = sanitizeText(value, maxLength);
  if (!sanitized) {
    return "";
  }

  try {
    const parsed = new URL(sanitized);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function sanitizeFilename(value: string): string {
  const trimmed = value.trim().replace(/[\\/]+/g, "-").replace(/\.{2,}/g, ".");
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return sanitized || "resume.pdf";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isBlockedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return BLOCKED_EMAILS.has(normalized);
}

function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) {
    return false;
  }

  const header = new TextDecoder().decode(bytes.slice(0, 5));
  return header === "%PDF-";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.slice(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPlainTextEmail(job: JobPosting, application: ParsedApplication): string {
  return [
    `New application for ${job.title}`,
    "",
    `Role: ${job.title}`,
    `Department: ${job.department}`,
    `Location: ${job.location}`,
    `Employment type: ${job.employmentType}`,
    `Submitted: ${new Date().toISOString()}`,
    "",
    `Name: ${application.values.name}`,
    `Email: ${application.values.email}`,
    `Phone: ${application.values.phone || "Not provided"}`,
    `LinkedIn: ${application.values.linkedinUrl || "Not provided"}`,
    `Portfolio: ${application.values.portfolioUrl || "Not provided"}`,
    "",
    "Why are you interested in this role?",
    application.values.whyInterested,
    "",
    "What relevant experience would you bring?",
    application.values.fitSummary,
    "",
    `Resume attachment: ${application.resume.filename}`,
  ].join("\n");
}

function renderHtmlEmail(job: JobPosting, application: ParsedApplication): string {
  return `
    <h1>New application for ${escapeHtml(job.title)}</h1>
    <p><strong>Department:</strong> ${escapeHtml(job.department)}<br>
    <strong>Location:</strong> ${escapeHtml(job.location)}<br>
    <strong>Employment type:</strong> ${escapeHtml(job.employmentType)}</p>
    <hr>
    <p><strong>Name:</strong> ${escapeHtml(application.values.name)}<br>
    <strong>Email:</strong> ${escapeHtml(application.values.email)}<br>
    <strong>Phone:</strong> ${escapeHtml(application.values.phone || "Not provided")}<br>
    <strong>LinkedIn:</strong> ${escapeHtml(application.values.linkedinUrl || "Not provided")}<br>
    <strong>Portfolio:</strong> ${escapeHtml(application.values.portfolioUrl || "Not provided")}</p>
    <h2>Why are you interested in this role?</h2>
    <p>${escapeHtml(application.values.whyInterested).replaceAll("\n", "<br>")}</p>
    <h2>What relevant experience would you bring?</h2>
    <p>${escapeHtml(application.values.fitSummary).replaceAll("\n", "<br>")}</p>
    <p><strong>Resume attachment:</strong> ${escapeHtml(application.resume.filename)}</p>
  `;
}