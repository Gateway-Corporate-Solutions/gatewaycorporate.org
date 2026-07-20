export type VariantName = string;

export interface ExperimentDefinition {
  id: string;
  variants: VariantName[];
  weights?: number[];
  enabledInProduction?: boolean;
}

export interface ExperimentAssignment {
  experimentId: string;
  variant: VariantName;
}

export interface ExperimentContext {
  assignments: ExperimentAssignment[];
  scriptTag: string;
}

export interface ExperimentRequestContext {
  cookieHeader: string | null;
  sessionHeader: string | null;
}

export interface ExperimentEvent {
  eventName: string;
  path: string;
  sessionId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface VariantGuardrailMetrics {
  experimentId: string;
  variant: string;
  totalVisits: number;
  exposures: number;
  contactSubmits: number;
  clickthroughs: number;
  buyClickthroughs: number;
  whitepaperClickthroughs: number;
  contactClickthroughs: number;
  formStarts: number;
  captchaCompletes: number;
  formValidationErrors: number;
  formSubmitAttempts: number;
  formSubmitSuccesses: number;
  formSubmitErrors: number;
  conversionRate: number;
}

export interface GuardrailSummary {
  generatedAt: string;
  lookbackDays: number;
  metrics: VariantGuardrailMetrics[];
}

export interface GuardrailEvaluationResult {
  generatedAt: string;
  lookbackDays: number;
  dropThreshold: number;
  minExposures: number;
  disabledExperimentIds: string[];
  comparisons: Array<{
    experimentId: string;
    controlRate: number;
    treatmentVariant: string;
    treatmentRate: number;
    relativeDrop: number;
    treatmentExposures: number;
    action: "none" | "disable";
  }>;
}

const EXPERIMENT_COOKIE = "gcx_sid";
const EXPERIMENT_HEADER = "x-gcx-session";
const SESSION_ID_LENGTH = 24;

const experimentDefinitions: ExperimentDefinition[] = [
  {
    id: "homepage-layout-v1",
    variants: ["control", "compact-hero", "proof-first"],
    weights: [0.6, 0.2, 0.2],
    enabledInProduction: false,
  },
  {
    id: "homepage-cta-v1",
    variants: ["control", "consultation-first", "product-first"],
    weights: [0.5, 0.25, 0.25],
    enabledInProduction: false,
  },
  {
    id: "product-devicer-layout-v1",
    variants: ["control", "pricing-first", "comparison-first"],
    weights: [0.5, 0.25, 0.25],
    enabledInProduction: false,
  },
  {
    id: "product-hyperlocal-layout-v1",
    variants: ["control", "whitepaper-first", "runtime-first"],
    weights: [0.5, 0.25, 0.25],
    enabledInProduction: false,
  },
  {
    id: "product-nashtwin-layout-v1",
    variants: ["control", "pricing-first", "comparison-first"],
    weights: [0.5, 0.25, 0.25],
    enabledInProduction: false,
  },
  {
    id: "services-whitepaper-cta-v1",
    variants: ["control"],
    weights: [1.0],
    enabledInProduction: false,
  },
  {
    id: "products-whitepaper-cta-v1",
    variants: ["control"],
    weights: [1.0],
    enabledInProduction: false,
  },
];

const PRODUCTS_PAGE_EXPERIMENT_IDS = new Set([
  "product-devicer-layout-v1",
  "product-hyperlocal-layout-v1",
  "product-nashtwin-layout-v1",
  "products-whitepaper-cta-v1",
]);

const SERVICES_PAGE_EXPERIMENT_IDS = new Set([
  "services-whitepaper-cta-v1",
]);

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function chooseVariant(definition: ExperimentDefinition, seed: string): string {
  const { variants, weights } = definition;
  if (!variants.length) {
    return "control";
  }

  const normalizedWeights =
    weights && weights.length === variants.length
      ? weights
      : variants.map(() => 1 / variants.length);

  const totalWeight = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    return variants[0];
  }

  const target = (hashString(seed) / 0xffffffff) * totalWeight;
  let cumulative = 0;

  for (let index = 0; index < variants.length; index++) {
    cumulative += normalizedWeights[index];
    if (target <= cumulative) {
      return variants[index];
    }
  }

  return variants[variants.length - 1];
}

function createSessionId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, SESSION_ID_LENGTH);
}

function parseCookies(rawCookieHeader: string | null): Record<string, string> {
  if (!rawCookieHeader) {
    return {};
  }

  return rawCookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, chunk) => {
      const [name, ...rest] = chunk.split("=");
      if (!name || !rest.length) {
        return accumulator;
      }

      accumulator[name] = decodeURIComponent(rest.join("="));
      return accumulator;
    }, {});
}

function serializeAssignments(assignments: ExperimentAssignment[]): string {
  return JSON.stringify(assignments);
}

function toBase64Url(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function shouldEnableExperiments(isProduction: boolean): boolean {
  const explicitFlag = Deno.env.get("EXPERIMENTS_ENABLED");
  if (explicitFlag === "1" || explicitFlag === "true") {
    return true;
  }

  if (explicitFlag === "0" || explicitFlag === "false") {
    return false;
  }

  return !isProduction;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }

  return undefined;
}

function isExperimentEnabledByPageToggles(experimentId: string): boolean {
  const productsToggle = parseBooleanEnv(Deno.env.get("EXPERIMENTS_PRODUCTS_PAGE_ENABLED"));
  const servicesToggle = parseBooleanEnv(Deno.env.get("EXPERIMENTS_SERVICES_PAGE_ENABLED"));

  if (PRODUCTS_PAGE_EXPERIMENT_IDS.has(experimentId)) {
    return productsToggle ?? true;
  }

  if (SERVICES_PAGE_EXPERIMENT_IDS.has(experimentId)) {
    return servicesToggle ?? true;
  }

  return true;
}

function getDisabledExperimentsFilePath(): string {
  return Deno.env.get("EXPERIMENTS_DISABLED_FILE") || "./content/experiment-control/disabled-experiments.json";
}

function parseDisabledExperimentIds(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function getDisabledExperimentIdsFromEnv(): Set<string> {
  const raw = Deno.env.get("EXPERIMENTS_DISABLED_IDS") || "";
  return parseDisabledExperimentIds(raw);
}

function getDisabledExperimentIdsFromFile(): Set<string> {
  try {
    const filePath = getDisabledExperimentsFilePath();
    const raw = Deno.readTextFileSync(filePath);
    const parsed = JSON.parse(raw) as { disabled?: string[] };
    const disabled = Array.isArray(parsed.disabled)
      ? parsed.disabled.map((value) => value.trim()).filter(Boolean)
      : [];

    return new Set(disabled);
  } catch {
    return new Set<string>();
  }
}

export function getDisabledExperimentIds(): Set<string> {
  const fromEnv = getDisabledExperimentIdsFromEnv();
  const fromFile = getDisabledExperimentIdsFromFile();

  return new Set([...fromEnv, ...fromFile]);
}

export async function writeDisabledExperimentIds(ids: string[]): Promise<void> {
  const filePath = getDisabledExperimentsFilePath();
  const directory = filePath.slice(0, filePath.lastIndexOf("/"));

  if (directory) {
    await Deno.mkdir(directory, { recursive: true });
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    disabled: [...new Set(ids.map((value) => value.trim()).filter(Boolean))],
  };

  await Deno.writeTextFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function buildExperimentContext(request: ExperimentRequestContext, isProduction: boolean): ExperimentContext {
  const enabled = shouldEnableExperiments(isProduction);
  const disabledExperimentIds = getDisabledExperimentIds();

  if (!enabled) {
    return {
      assignments: [],
      scriptTag: '<script>window.__GCX__ = Object.assign({}, window.__GCX__ || {}, { enabled: false, assignments: [] });</script>',
    };
  }

  const cookies = parseCookies(request.cookieHeader);
  const sessionId = cookies[EXPERIMENT_COOKIE] || request.sessionHeader || createSessionId();

  const assignments = experimentDefinitions
    .filter((definition) => !isProduction || definition.enabledInProduction)
    .filter((definition) => isExperimentEnabledByPageToggles(definition.id))
    .filter((definition) => !disabledExperimentIds.has(definition.id))
    .map((definition) => ({
      experimentId: definition.id,
      variant: chooseVariant(definition, `${definition.id}:${sessionId}`),
    }));

  const payload = {
    enabled: true,
    sessionId,
    assignments,
    emittedAt: new Date().toISOString(),
  };

  const encoded = toBase64Url(serializeAssignments(assignments));

  const scriptTag = [
    "<script>",
    `window.__GCX__ = Object.assign({}, window.__GCX__ || {}, ${JSON.stringify(payload)});`,
    "window.__GCX__.assignmentsHash = \"" + encoded + "\";",
    "</script>",
  ].join("");

  return { assignments, scriptTag };
}

function getEventsDirectory(): string {
  return Deno.env.get("EXPERIMENT_EVENTS_DIR") || "./content/experiment-events";
}

export async function writeExperimentEvent(event: ExperimentEvent): Promise<void> {
  const directory = getEventsDirectory();
  await Deno.mkdir(directory, { recursive: true });

  const date = event.timestamp.slice(0, 10);
  const filePath = `${directory}/${date}.jsonl`;
  const line = JSON.stringify(event) + "\n";

  await Deno.writeTextFile(filePath, line, { append: true, create: true });
}

async function readEventFilesForLookback(lookbackDays: number): Promise<string[]> {
  const directory = getEventsDirectory();
  const today = new Date();
  const filePaths: string[] = [];

  for (let offset = 0; offset < lookbackDays; offset++) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const dateKey = date.toISOString().slice(0, 10);
    filePaths.push(`${directory}/${dateKey}.jsonl`);
  }

  return filePaths;
}

function extractAssignments(event: ExperimentEvent): ExperimentAssignment[] {
  const assignmentsRaw = event.metadata?.assignments;
  if (!Array.isArray(assignmentsRaw)) {
    return [];
  }

  return assignmentsRaw
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return null;
      }

      const record = candidate as Record<string, unknown>;
      const experimentId = typeof record.experimentId === "string" ? record.experimentId.trim() : "";
      const variant = typeof record.variant === "string" ? record.variant.trim() : "";
      if (!experimentId || !variant) {
        return null;
      }

      return { experimentId, variant } satisfies ExperimentAssignment;
    })
    .filter((item): item is ExperimentAssignment => item !== null);
}

function getClickIntent(event: ExperimentEvent): "buy" | "whitepaper" | "contact" | "other" {
  if (event.eventName !== "cta_click") {
    return "other";
  }

  const metadata = event.metadata;
  if (!metadata || typeof metadata !== "object") {
    return "other";
  }

  const explicitIntent = typeof metadata.clickIntent === "string" ? metadata.clickIntent.trim().toLowerCase() : "";
  if (explicitIntent === "buy" || explicitIntent === "whitepaper" || explicitIntent === "contact") {
    return explicitIntent;
  }

  const label = typeof metadata.label === "string" ? metadata.label.toLowerCase() : "";
  const target = typeof metadata.target === "string" ? metadata.target.toLowerCase() : "";
  const isAccentButton = metadata.isAccentButton === true;
  const classList = Array.isArray(metadata.classList)
    ? metadata.classList.filter((entry): entry is string => typeof entry === "string")
    : [];
  const hasAccentClass = classList.some((entry) => entry.toLowerCase() === "btn-accent");
  const combined = `${label} ${target}`;

  if (
    combined.includes("whitepaper") ||
    target.includes("/papers/") ||
    target.endsWith(".pdf")
  ) {
    return "whitepaper";
  }

  if (
    target.startsWith("#contact") ||
    combined.includes("contact") ||
    combined.includes("consultation") ||
    combined.includes("architecture review")
  ) {
    return "contact";
  }

  if (
    isAccentButton ||
    hasAccentClass ||
    combined.includes("buy") ||
    combined.includes("checkout") ||
    combined.includes("polar.sh")
  ) {
    return "buy";
  }

  return "other";
}

function getFormSubmitResultStatus(event: ExperimentEvent): "success" | "error" | "other" {
  if (event.eventName !== "form_submit_result") {
    return "other";
  }

  const metadata = event.metadata;
  if (!metadata || typeof metadata !== "object") {
    return "other";
  }

  const status = typeof metadata.status === "string" ? metadata.status.trim().toLowerCase() : "";
  if (status === "success" || status === "error") {
    return status;
  }

  return "other";
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "/";
  }

  const normalized = trimmed.replace(/\/$/, "");
  return normalized || "/";
}

function getActiveExperimentIdsForPath(path: string): Set<string> {
  const normalizedPath = normalizePath(path);

  if (normalizedPath === "/" || normalizedPath === "/index.html") {
    return new Set(["homepage-layout-v1", "homepage-cta-v1"]);
  }

  if (normalizedPath === "/products/devicer") {
    return new Set(["product-devicer-layout-v1"]);
  }

  if (normalizedPath === "/products/hyperlocal") {
    return new Set(["product-hyperlocal-layout-v1"]);
  }

  if (normalizedPath === "/products/nashtwin") {
    return new Set(["product-nashtwin-layout-v1"]);
  }

  if (normalizedPath === "/services") {
    return new Set(["services-whitepaper-cta-v1"]);
  }

  if (normalizedPath === "/products") {
    return new Set(["products-whitepaper-cta-v1"]);
  }

  return new Set<string>();
}

export async function generateGuardrailSummary(lookbackDays = 1): Promise<GuardrailSummary> {
  const paths = await readEventFilesForLookback(Math.max(1, lookbackDays));
  const aggregates = new Map<string, {
    exposures: number;
    contactSubmits: number;
    clickthroughs: number;
    buyClickthroughs: number;
    whitepaperClickthroughs: number;
    contactClickthroughs: number;
    formStarts: number;
    captchaCompletes: number;
    formValidationErrors: number;
    formSubmitAttempts: number;
    formSubmitSuccesses: number;
    formSubmitErrors: number;
    visitSessions: Set<string>;
    conversionSessions: Set<string>;
  }>();

  for (const filePath of paths) {
    let contents = "";

    try {
      contents = await Deno.readTextFile(filePath);
    } catch {
      continue;
    }

    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      let rawEvent: unknown;
      try {
        rawEvent = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const event = parseExperimentEventPayload(rawEvent);
      if (!event) {
        continue;
      }

      const assignments = extractAssignments(event);
      if (!assignments.length) {
        continue;
      }

      const activeExperimentIds = getActiveExperimentIdsForPath(event.path);

      for (const assignment of assignments) {
        const key = `${assignment.experimentId}::${assignment.variant}`;
        const current = aggregates.get(key) || {
          exposures: 0,
          contactSubmits: 0,
          clickthroughs: 0,
          buyClickthroughs: 0,
          whitepaperClickthroughs: 0,
          contactClickthroughs: 0,
          formStarts: 0,
          captchaCompletes: 0,
          formValidationErrors: 0,
          formSubmitAttempts: 0,
          formSubmitSuccesses: 0,
          formSubmitErrors: 0,
          visitSessions: new Set<string>(),
          conversionSessions: new Set<string>(),
        };

        const isActiveOnPath = activeExperimentIds.has(assignment.experimentId);

        if (event.eventName === "page_view" && isActiveOnPath) {
          current.visitSessions.add(event.sessionId);
        }

        if (event.eventName === "experiment_exposure") {
          const exposedExperimentId = typeof event.metadata?.experimentId === "string"
            ? event.metadata.experimentId
            : "";
          const exposedVariant = typeof event.metadata?.variant === "string"
            ? event.metadata.variant
            : "";

          if (assignment.experimentId === exposedExperimentId && assignment.variant === exposedVariant) {
            current.exposures += 1;
          }
        }

        if (event.eventName === "contact_submit" && isActiveOnPath) {
          current.contactSubmits += 1;
          current.conversionSessions.add(event.sessionId);
        }

        const clickIntent = getClickIntent(event);
        if (clickIntent !== "other" && isActiveOnPath) {
          current.clickthroughs += 1;
          if (clickIntent === "buy") {
            current.buyClickthroughs += 1;
          } else if (clickIntent === "whitepaper") {
            current.whitepaperClickthroughs += 1;
          } else if (clickIntent === "contact") {
            current.contactClickthroughs += 1;
          }
          current.conversionSessions.add(event.sessionId);
        }

        if (isActiveOnPath) {
          if (event.eventName === "form_start") {
            current.formStarts += 1;
          } else if (event.eventName === "captcha_complete") {
            current.captchaCompletes += 1;
          } else if (event.eventName === "form_validation_error") {
            current.formValidationErrors += 1;
          } else if (event.eventName === "form_submit_attempt") {
            current.formSubmitAttempts += 1;
          }

          const submitStatus = getFormSubmitResultStatus(event);
          if (submitStatus === "success") {
            current.formSubmitSuccesses += 1;
            current.conversionSessions.add(event.sessionId);
          } else if (submitStatus === "error") {
            current.formSubmitErrors += 1;
          }
        }

        aggregates.set(key, current);
      }
    }
  }

  const metrics: VariantGuardrailMetrics[] = [...aggregates.entries()]
    .map(([key, counts]) => {
      const [experimentId, variant] = key.split("::");
      const totalVisits = counts.visitSessions.size;
      const conversionRate = totalVisits > 0
        ? counts.conversionSessions.size / totalVisits
        : 0;

      return {
        experimentId,
        variant,
        totalVisits,
        exposures: counts.exposures,
        contactSubmits: counts.contactSubmits,
        clickthroughs: counts.clickthroughs,
        buyClickthroughs: counts.buyClickthroughs,
        whitepaperClickthroughs: counts.whitepaperClickthroughs,
        contactClickthroughs: counts.contactClickthroughs,
        formStarts: counts.formStarts,
        captchaCompletes: counts.captchaCompletes,
        formValidationErrors: counts.formValidationErrors,
        formSubmitAttempts: counts.formSubmitAttempts,
        formSubmitSuccesses: counts.formSubmitSuccesses,
        formSubmitErrors: counts.formSubmitErrors,
        conversionRate,
      };
    })
    .sort((left, right) => {
      if (left.experimentId !== right.experimentId) {
        return left.experimentId.localeCompare(right.experimentId);
      }

      return left.variant.localeCompare(right.variant);
    });

  return {
    generatedAt: new Date().toISOString(),
    lookbackDays: Math.max(1, lookbackDays),
    metrics,
  };
}

function getNumberEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shouldAutoDisable(): boolean {
  const explicit = parseBooleanEnv(Deno.env.get("EXPERIMENTS_AUTO_DISABLE"));
  return explicit ?? false;
}

export async function evaluateAndOptionallyDisableExperiments(
  lookbackDays = 1,
): Promise<GuardrailEvaluationResult> {
  const summary = await generateGuardrailSummary(lookbackDays);
  const dropThreshold = getNumberEnv("EXPERIMENT_GUARDRAIL_DROP_THRESHOLD", 0.2);
  const minExposures = getNumberEnv("EXPERIMENT_GUARDRAIL_MIN_EXPOSURES", 50);

  const metricsByExperiment = new Map<string, VariantGuardrailMetrics[]>();
  for (const metric of summary.metrics) {
    const bucket = metricsByExperiment.get(metric.experimentId) || [];
    bucket.push(metric);
    metricsByExperiment.set(metric.experimentId, bucket);
  }

  const comparisons: GuardrailEvaluationResult["comparisons"] = [];
  const toDisable = new Set<string>(getDisabledExperimentIds());

  for (const [experimentId, metrics] of metricsByExperiment.entries()) {
    const control = metrics.find((item) => item.variant === "control");
    if (!control || control.totalVisits < minExposures || control.conversionRate <= 0) {
      continue;
    }

    for (const treatment of metrics) {
      if (treatment.variant === "control") {
        continue;
      }

      const relativeDrop = (control.conversionRate - treatment.conversionRate) / control.conversionRate;
      const shouldDisableExperiment =
        treatment.totalVisits >= minExposures && relativeDrop >= dropThreshold;

      comparisons.push({
        experimentId,
        controlRate: control.conversionRate,
        treatmentVariant: treatment.variant,
        treatmentRate: treatment.conversionRate,
        relativeDrop,
        treatmentExposures: treatment.totalVisits,
        action: shouldDisableExperiment ? "disable" : "none",
      });

      if (shouldDisableExperiment) {
        toDisable.add(experimentId);
      }
    }
  }

  if (shouldAutoDisable()) {
    await writeDisabledExperimentIds([...toDisable]);
  }

  return {
    generatedAt: new Date().toISOString(),
    lookbackDays: summary.lookbackDays,
    dropThreshold,
    minExposures,
    disabledExperimentIds: [...toDisable].sort((left, right) => left.localeCompare(right)),
    comparisons,
  };
}

export function parseExperimentEventPayload(raw: unknown): ExperimentEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const eventName = typeof candidate.eventName === "string" ? candidate.eventName.trim() : "";
  const path = typeof candidate.path === "string" ? candidate.path.trim() : "";
  const sessionId = typeof candidate.sessionId === "string" ? candidate.sessionId.trim() : "";
  const timestamp = typeof candidate.timestamp === "string" ? candidate.timestamp.trim() : "";

  if (!eventName || !path || !sessionId || !timestamp) {
    return null;
  }

  return {
    eventName,
    path,
    sessionId,
    timestamp,
    metadata: typeof candidate.metadata === "object" && candidate.metadata ? candidate.metadata as Record<string, unknown> : undefined,
  };
}
