import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { renderSiteFooter } from "./footer.ts";

const JOBS_DIR = new URL("./content/jobs/", import.meta.url);
const SITE_URL = "https://gatewaycorporate.org";
const DEFAULT_SOCIAL_IMAGE = `${SITE_URL}/embed.png`;
const RECAPTCHA_SITE_KEY = "6LcIVHArAAAAAPZ1scQS8vrN_JRhCBzjOoJHuw2i";
const RESUME_SIZE_LIMIT_MB = 5;

export interface JobPosting {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  department: string;
  location: string;
  employmentType: string;
  status: string;
  team?: string;
  remote?: string;
  order?: number;
  tags: string[];
  html: string;
}

export interface JobApplicationValues {
  name: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  portfolioUrl: string;
  whyInterested: string;
  fitSummary: string;
}

export interface JobApplicationState {
  errorMessage?: string;
  values?: Partial<JobApplicationValues>;
}

interface FrontMatter {
  title?: string;
  slug?: string;
  date?: string;
  excerpt?: string;
  department?: string;
  location?: string;
  employmentType?: string;
  status?: string;
  team?: string;
  remote?: string;
  order?: number;
  tags?: string[];
}

marked.setOptions({
  gfm: true,
  breaks: false,
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function parseValue(rawValue: string): string | string[] {
  const value = rawValue.trim().replace(/^['\"]|['\"]$/g, "");
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^['\"]|['\"]$/g, ""))
      .filter(Boolean);
  }

  return value;
}

function parseFrontMatter(raw: string): { metadata: FrontMatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { metadata: {}, body: raw };
  }

  const metadata: FrontMatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1);
    const value = parseValue(rawValue);

    if (key === "tags") {
      metadata.tags = Array.isArray(value)
        ? value
        : value.split(",").map((item) => item.trim()).filter(Boolean);
      continue;
    }

    if (typeof value !== "string") {
      continue;
    }

    switch (key) {
      case "title":
        metadata.title = value;
        break;
      case "slug":
        metadata.slug = value;
        break;
      case "date":
        metadata.date = value;
        break;
      case "excerpt":
        metadata.excerpt = value;
        break;
      case "department":
        metadata.department = value;
        break;
      case "location":
        metadata.location = value;
        break;
      case "employmentType":
        metadata.employmentType = value;
        break;
      case "status":
        metadata.status = value;
        break;
      case "team":
        metadata.team = value;
        break;
      case "remote":
        metadata.remote = value;
        break;
      case "order": {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) {
          metadata.order = parsed;
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    metadata,
    body: raw.slice(match[0].length),
  };
}

function formatDate(date: string): string {
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsedDate);
}

function buildExcerpt(markdown: string, providedExcerpt?: string): string {
  if (providedExcerpt?.trim()) {
    return providedExcerpt.trim();
  }

  const plainText = markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_>~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return plainText.slice(0, 180).trimEnd() + (plainText.length > 180 ? "..." : "");
}

function isJobOpen(job: JobPosting): boolean {
  return job.status.toLowerCase() === "open";
}

function renderTags(tags: string[]): string {
  if (!tags.length) {
    return "";
  }

  return `
    <div class="post-tags">
      ${tags.map((tag) => `<span class="post-tag">${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;
}

function renderStatus(status: string): string {
  const normalized = status.toLowerCase();
  const modifier = normalized === "open" ? " is-open" : " is-closed";

  return `<span class="job-status${modifier}">${escapeHtml(status)}</span>`;
}

function renderMetadataChips(job: JobPosting): string {
  const chips = [job.department, job.location, job.employmentType];
  if (job.remote?.trim()) {
    chips.push(job.remote.trim());
  }

  return `
    <div class="job-meta-list">
      ${chips.map((value) => `<span class="job-meta-chip">${escapeHtml(value)}</span>`).join("")}
    </div>
  `;
}

function renderJobCard(job: JobPosting): string {
  return `
    <article class="card card-primary blog-card job-card">
      <div class="card-header blog-card-header">
        <div class="job-card-headline">
          ${renderStatus(job.status)}
          <p class="blog-card-meta">${escapeHtml(formatDate(job.date))}</p>
        </div>
        <h3 class="card-title blog-card-title">${escapeHtml(job.title)}</h3>
      </div>
      <div class="card-body">
        ${renderMetadataChips(job)}
        <p class="card-text">${escapeHtml(job.excerpt)}</p>
        ${renderTags(job.tags)}
      </div>
      <div class="card-footer blog-card-footer">
        <a href="/careers/${encodeURIComponent(job.slug)}" class="btn btn-primary btn-sm">View role</a>
      </div>
    </article>
  `;
}

function renderApplicationValues(values?: Partial<JobApplicationValues>): JobApplicationValues {
  return {
    name: values?.name ?? "",
    email: values?.email ?? "",
    phone: values?.phone ?? "",
    linkedinUrl: values?.linkedinUrl ?? "",
    portfolioUrl: values?.portfolioUrl ?? "",
    whyInterested: values?.whyInterested ?? "",
    fitSummary: values?.fitSummary ?? "",
  };
}

function renderApplicationForm(job: JobPosting, state?: JobApplicationState): string {
  const values = renderApplicationValues(state?.values);
  const disabled = !isJobOpen(job);
  const closedMessage = disabled
    ? `<div class="form-banner">This role is currently closed. You can review the description, but applications are disabled.</div>`
    : "";
  const errorMessage = state?.errorMessage
    ? `<div class="form-banner form-banner-error">${escapeHtml(state.errorMessage)}</div>`
    : "";
  const disabledAttribute = disabled ? " disabled aria-disabled=\"true\"" : "";
  const recaptchaMarkup = disabled
    ? ""
    : `
      <div class="form-group form-actions-row">
        <div class="g-recaptcha" data-sitekey="${RECAPTCHA_SITE_KEY}"></div>
      </div>
    `;

  return `
    <section class="card card-primary application-card">
      <div class="card-header">
        <p class="article-kicker">Apply</p>
        <h2 class="card-title">Send your application</h2>
        <p class="card-text">Submit a short introduction and a PDF resume. Applications are sent directly to Gateway Corporate.</p>
      </div>
      <div class="card-body">
        ${closedMessage}
        ${errorMessage}
        <form class="form careers-form" method="post" action="/careers/${encodeURIComponent(job.slug)}/apply" enctype="multipart/form-data" aria-label="Application form">
          <div class="form-group">
            <label class="form-label" for="name">Full name</label>
            <input class="form-input" type="text" id="name" name="name" value="${escapeHtml(values.name)}" maxlength="120" required${disabledAttribute}>
          </div>
          <div class="form-group">
            <label class="form-label" for="email">Email</label>
            <input class="form-input" type="email" id="email" name="email" value="${escapeHtml(values.email)}" maxlength="160" required${disabledAttribute}>
          </div>
          <div class="form-group">
            <label class="form-label" for="phone">Phone</label>
            <input class="form-input" type="tel" id="phone" name="phone" value="${escapeHtml(values.phone)}" maxlength="40" placeholder="Optional"${disabledAttribute}>
          </div>
          <div class="form-group">
            <label class="form-label" for="linkedinUrl">LinkedIn</label>
            <input class="form-input" type="url" id="linkedinUrl" name="linkedinUrl" value="${escapeHtml(values.linkedinUrl)}" maxlength="200" placeholder="Optional"${disabledAttribute}>
          </div>
          <div class="form-group">
            <label class="form-label" for="portfolioUrl">Portfolio or website</label>
            <input class="form-input" type="url" id="portfolioUrl" name="portfolioUrl" value="${escapeHtml(values.portfolioUrl)}" maxlength="200" placeholder="Optional"${disabledAttribute}>
          </div>
          <div class="form-group">
            <label class="form-label" for="whyInterested">Why are you interested in this role?</label>
            <textarea class="form-textarea" id="whyInterested" name="whyInterested" maxlength="1200" required${disabledAttribute}>${escapeHtml(values.whyInterested)}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="fitSummary">What relevant experience would you bring?</label>
            <textarea class="form-textarea" id="fitSummary" name="fitSummary" maxlength="1200" required${disabledAttribute}>${escapeHtml(values.fitSummary)}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="resume">Resume (PDF only, up to ${RESUME_SIZE_LIMIT_MB} MB)</label>
            <input class="form-input form-input-file" type="file" id="resume" name="resume" accept="application/pdf,.pdf" required${disabledAttribute}>
          </div>
          ${recaptchaMarkup}
          <div class="form-group form-actions-row">
            <button class="btn btn-primary w-full btn-lg" type="submit"${disabledAttribute}>Submit application</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function sanitizeRenderedHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "span",
    ]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
      code: ["class"],
      span: ["class"],
      "*": ["id"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}

function renderPageShell(options: {
  title: string;
  description: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  content: string;
  canonicalUrl: string;
  imageUrl: string;
  includeRecaptcha?: boolean;
  ogType?: "website" | "article";
  jsonLd?: Record<string, unknown>;
  noindex?: boolean;
}): string {
  const recaptchaScript = options.includeRecaptcha
    ? "\n    <script src=\"https://www.google.com/recaptcha/api.js\" async defer></script>"
    : "";
  const jsonLdScript = options.jsonLd
    ? `\n    <script type="application/ld+json">${JSON.stringify(options.jsonLd)}</script>`
    : "";
  const robotsMeta = options.noindex
    ? `\n    <meta name="robots" content="noindex, nofollow">`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(options.title)}</title>
    <meta name="description" content="${escapeHtml(options.description)}">
      <meta name="author" content="Gateway Corporate">
    <link rel="canonical" href="${escapeHtml(options.canonicalUrl)}">
    <meta property="og:locale" content="en_US">
    <meta property="og:type" content="${options.ogType || "website"}">
      <meta property="og:site_name" content="Gateway Corporate">
    <meta property="og:title" content="${escapeHtml(options.title)}">
    <meta property="og:description" content="${escapeHtml(options.description)}">
    <meta property="og:url" content="${escapeHtml(options.canonicalUrl)}">
    <meta property="og:image" content="${escapeHtml(options.imageUrl)}">
    <meta property="og:image:alt" content="${escapeHtml(options.title)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(options.title)}">
    <meta name="twitter:description" content="${escapeHtml(options.description)}">
    <meta name="twitter:image" content="${escapeHtml(options.imageUrl)}">${recaptchaScript}${jsonLdScript}${robotsMeta}
    <link rel="stylesheet" href="/components.css">
    <link rel="stylesheet" href="/enhancements.css">
    <script src="/bundle.js" defer></script>
    <script src="/index.js" defer></script>
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
  </head>
  <body class="careers-page">
    <header>
      <nav class="navbar">
        <div class="nav-content">
          <a href="/" class="nav-brand">
            <img src="/logo.png" alt="Gateway Corporate Logo" class="nav-logo">
            Gateway Corporate
          </a>
          <div class="nav-indicator"></div>
        </div>
      </nav>
      <div class="scroll-progress"></div>

      <section class="hero hero-compact">
        <canvas id="network-graph" aria-hidden="true"></canvas>
        <div class="hero-content">
          <p class="eyebrow">${escapeHtml(options.heroEyebrow)}</p>
          <h1 class="hero-title">${escapeHtml(options.heroTitle)}</h1>
          <h3 class="hero-subtitle">${escapeHtml(options.heroSubtitle)}</h3>
        </div>
      </section>

      <button id="menu-btn" class="menu-icon" aria-label="Open Menu" aria-controls="dropdown-menu" aria-expanded="false">
        <div class="hamburger">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </button>

      <div id="dropdown-menu" class="dropdown-menu">
        <div class="menu-container">
          <ul class="nav-list">
            <li><a href="/#about" class="nav-link">About Us</a></li>
            <li><a href="/services" class="nav-link">Services</a></li>
            <li><a href="/products" class="nav-link">Products</a></li>
            <li><a href="/demos" class="nav-link">Demos</a></li>
            <li><a href="/faq" class="nav-link">FAQ</a></li>
            <li><a href="/careers" class="nav-link">Careers</a></li>
            <li><a href="/blog" class="nav-link">Blog</a></li>
            <li><a href="/#team" class="nav-link">Our Team</a></li>
            <li><a href="/contact" class="nav-link">Contact</a></li>
          </ul>
        </div>
      </div>
    </header>
    <main>
      ${options.content}
    </main>
${renderSiteFooter()}
  </body>
</html>`;
}

export async function getJobPostings(): Promise<JobPosting[]> {
  const jobs: JobPosting[] = [];

  try {
    for await (const entry of Deno.readDir(JOBS_DIR)) {
      if (!entry.isFile || !entry.name.endsWith(".md")) {
        continue;
      }

      const fileUrl = new URL(entry.name, JOBS_DIR);
      const raw = await Deno.readTextFile(fileUrl);
      const { metadata, body } = parseFrontMatter(raw);
      const title = metadata.title?.trim() || entry.name.replace(/\.md$/, "");
      const slug = slugify(metadata.slug?.trim() || title);
      const date = metadata.date?.trim() || new Date().toISOString().slice(0, 10);
      const html = sanitizeRenderedHtml(marked.parse(body) as string);

      jobs.push({
        slug,
        title,
        date,
        excerpt: buildExcerpt(body, metadata.excerpt),
        department: metadata.department?.trim() || "General",
        location: metadata.location?.trim() || "Location not specified",
        employmentType: metadata.employmentType?.trim() || "Full-time",
        status: metadata.status?.trim() || "open",
        team: metadata.team?.trim(),
        remote: metadata.remote?.trim(),
        order: metadata.order,
        tags: metadata.tags || [],
        html,
      });
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }

  jobs.sort((left, right) => {
    if (isJobOpen(left) !== isJobOpen(right)) {
      return isJobOpen(left) ? -1 : 1;
    }

    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return new Date(right.date).getTime() - new Date(left.date).getTime();
  });

  return jobs;
}

export async function getJobPostingBySlug(slug: string): Promise<JobPosting | undefined> {
  const jobs = await getJobPostings();
  return jobs.find((job) => job.slug === slug);
}

export function renderCareersIndexPage(jobs: JobPosting[]): string {
  const openJobs = jobs.filter(isJobOpen);
  const jobMarkup = openJobs.length
    ? `<div class="grid careers-grid gap-lg card-grid">${openJobs.map((job) => renderJobCard(job)).join("")}</div>`
    : `<div class="card card-primary blog-empty"><p class="card-text">No open roles are published right now. Check back soon or email <a href="mailto:office@gatewaycorporate.org" class="careers-inline-link">office@gatewaycorporate.org</a>.</p></div>`;

  return renderPageShell({
    title: "Careers | Gateway Corporate",
    description: "Open roles at Gateway Corporate.",
    heroEyebrow: "Careers",
    heroTitle: "Build with Gateway Corporate",
    heroSubtitle: "Browse current openings and apply directly with a short questionnaire and resume.",
    canonicalUrl: absoluteUrl("/careers"),
    imageUrl: DEFAULT_SOCIAL_IMAGE,
    content: `
      <section class="section section-tight">
        <div class="section-header">
          <h2 class="section-title">Open roles</h2>
          <p class="text-lead careers-intro">View the positions we are currently hiring for below.</p>
        </div>
        ${jobMarkup}
      </section>
    `,
  });
}

export function renderJobPostingPage(
  job: JobPosting,
  allJobs: JobPosting[],
  state?: JobApplicationState,
): string {
  const relatedJobs = allJobs
    .filter((candidate) => candidate.slug !== job.slug && isJobOpen(candidate))
    .slice(0, 3);
  const relatedMarkup = relatedJobs.length
    ? `
      <section class="section section-tight">
        <div class="section-header">
          <h2 class="section-title">More open roles</h2>
        </div>
        <div class="grid careers-grid gap-lg card-grid">${relatedJobs.map((candidate) => renderJobCard(candidate)).join("")}</div>
      </section>
    `
    : "";

  return renderPageShell({
    title: `${job.title} | Gateway Corporate Careers`,
    description: job.excerpt,
    heroEyebrow: "Careers",
    heroTitle: job.title,
    heroSubtitle: `${job.department} • ${job.location} • ${job.employmentType}`,
    canonicalUrl: absoluteUrl(`/careers/${job.slug}`),
    imageUrl: DEFAULT_SOCIAL_IMAGE,
    includeRecaptcha: isJobOpen(job),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      "title": job.title,
      "description": job.excerpt,
      "datePosted": job.date,
      "hiringOrganization": {
        "@type": "Organization",
        "name": "Gateway Corporate",
        "sameAs": SITE_URL,
      },
      "jobLocation": {
        "@type": "Place",
        "name": job.location,
      },
      "employmentType": job.employmentType.toUpperCase().replace(/[-\s]+/g, "_"),
      "url": absoluteUrl(`/careers/${job.slug}`),
      ...(job.remote ? { "jobLocationType": "TELECOMMUTE" } : {}),
    },
    content: `
      <section class="section section-tight careers-shell">
        <div class="careers-detail-stack">
          <article class="card card-primary article-card careers-article-card">
            <div class="article-header">
              <p class="article-kicker">${escapeHtml(formatDate(job.date))}</p>
              <div class="job-detail-meta">
                ${renderStatus(job.status)}
                ${renderMetadataChips(job)}
                ${renderTags(job.tags)}
              </div>
            </div>
            <div class="prose">${job.html}</div>
            <div class="article-nav">
              <a href="/careers" class="btn btn-secondary btn-sm">Back to careers</a>
              <a href="/contact" class="btn btn-primary btn-sm">Contact Gateway Corporate</a>
            </div>
          </article>
          <div class="careers-sidebar">
            ${renderApplicationForm(job, state)}
          </div>
        </div>
      </section>
      ${relatedMarkup}
    `,
  });
}

export function renderCareersNotFoundPage(slug: string): string {
  return renderPageShell({
    title: "Role not found | Gateway Corporate Careers",
    description: "The requested role could not be found.",
    heroEyebrow: "Careers",
    heroTitle: "Role not found",
    heroSubtitle: `No published role matched ${slug}.`,
    canonicalUrl: absoluteUrl(`/careers/${slug}`),
    imageUrl: DEFAULT_SOCIAL_IMAGE,
    content: `
      <section class="section section-tight">
        <div class="card card-primary blog-empty">
          <p class="card-text">The role you requested is not available. Browse the careers page to see the current openings.</p>
          <div class="blog-home-actions">
            <a href="/careers" class="btn btn-primary">View careers</a>
          </div>
        </div>
      </section>
    `,
  });
}

export function renderCareersSuccessPage(job?: JobPosting): string {
  const followUpLink = job
    ? `<a href="/careers/${encodeURIComponent(job.slug)}" class="btn btn-secondary btn-sm">Back to role</a>`
    : "";
  const followUpCopy = job
    ? `Your application for ${job.title} has been routed to Gateway Corporate.`
    : "Your application has been routed to Gateway Corporate.";

  return renderPageShell({
    title: "Application received | Gateway Corporate Careers",
    description: followUpCopy,
    heroEyebrow: "Careers",
    heroTitle: "Application received",
    heroSubtitle: "The team will review your submission and follow up directly if there is a fit.",
    canonicalUrl: absoluteUrl("/careers/success"),
    imageUrl: DEFAULT_SOCIAL_IMAGE,
    noindex: true,
    content: `
      <section class="section section-tight">
        <div class="card card-primary blog-empty careers-success-card">
          <p class="card-text">${escapeHtml(followUpCopy)}</p>
          <div class="article-nav careers-success-actions">
            <a href="/careers" class="btn btn-primary btn-sm">View open roles</a>
            ${followUpLink}
          </div>
        </div>
      </section>
    `,
  });
}
