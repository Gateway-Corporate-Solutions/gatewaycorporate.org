import { Application, Router } from "oak";
import {
    bbasDevicer,
    devicer,
    ipDevicer,
    peerDevicer,
    tlsDevicer,
} from "devicer-suite";
import {
    getBlogPostBySlug,
    getBlogPosts,
    renderBlogIndexPage,
    renderBlogNotFoundPage,
    renderBlogPostPage,
    renderHomepageBlogSection,
} from "./blog.ts";
import {
    getJobPostingBySlug,
    getJobPostings,
    renderCareersIndexPage,
    renderCareersNotFoundPage,
    renderCareersSuccessPage,
    renderJobPostingPage,
} from "./careers.ts";
import {
    addForumBannedWord,
    banForumIdentity,
    createForumReply,
    createForumThread,
    evaluateForumSubmission,
    FORUM_BOARDS,
    getForumModerationQueue,
    getForumModerationState,
    getForumBoardBySlug,
    parseForumPageParam,
    removeForumBannedWord,
    removeForumPost,
    renderForumBoardNotFoundPage,
    renderForumBoardPage,
    renderForumIndexPage,
    renderForumThreadPage,
    verifyForumRecaptcha,
} from "./forum.ts";
import { submitJobApplication } from "./applications.ts";
import { getAvailableAppointmentSlots, handleUserRequest } from "./contact.ts";
import {
    buildExperimentContext,
    evaluateAndOptionallyDisableExperiments,
    generateGuardrailSummary,
    parseExperimentEventPayload,
    writeExperimentEvent,
} from "./experimentation.ts";
import { injectFooterIntoHtml, resolveFooterVariant } from "./footer.ts";
import {
    createBbasManagerSqliteAdapter,
    createDevManagerSqliteAdapter,
    createIpManagerSqliteAdapter,
    createPeerManagerSqliteAdapter,
    createTlsManagerSqliteAdapter,
} from "./sqlite.ts";
import { clusterFingerprints } from "./libs/clustering.ts";
import {
    applySecurityHeaders,
    buildSessionCookieHeader,
    injectSessionToken,
    isExternalOriginSecure,
    isOriginAllowed,
    parseClientMessage,
    parseConfiguredOrigins,
    parseTrustedProxyIps,
    RateLimiter,
    resolveClientIp,
    resolveExternalOrigin,
    sanitizeUserId,
    SESSION_COOKIE_NAME,
    SessionStore,
} from "./libs/security.ts";

const router = new Router();
const app = new Application();
const port = parseInt(Deno.env.get("PORT") || "8000");
const siteOrigin = "https://gatewaycorporate.org";
const isProduction = Deno.env.get("DENO_ENV") === "production";
const trustedProxyIps = parseTrustedProxyIps(Deno.env.get("FP_CICIS_TRUSTED_PROXIES"));
const configuredOrigins = parseConfiguredOrigins(Deno.env.get("FP_CICIS_ALLOWED_ORIGINS"));
const configuredPublicOrigin = Deno.env.get("FP_CICIS_PUBLIC_ORIGIN");
const devicerSnippetKey = (
    Deno.env.get("DEVICER_SNIPPET_KEY") ||
    Deno.env.get("DEVICER_PUBLISHABLE_KEY") ||
    ""
).trim();
const sessionStore = new SessionStore();
const rateLimiter = new RateLimiter();
const FORUM_MOD_COOKIE_NAME = "forum_mod_session";
const FORUM_MOD_SESSION_TTL_SECONDS = 60 * 60 * 12;
const moderatorSessions = new Map<string, number>();

function getForumModeratorPassword(): string {
    return (
        Deno.env.get("FORUM_MOD_PASSWORD") ||
        Deno.env.get("MODERATOR_PASSWORD") ||
        ""
    ).trim();
}

function isForumModerationEnabled(): boolean {
    return getForumModeratorPassword().length > 0;
}

function pruneModeratorSessions(): void {
    const now = Date.now();
    for (const [token, expiresAt] of moderatorSessions.entries()) {
        if (expiresAt <= now) {
            moderatorSessions.delete(token);
        }
    }
}

function createModeratorSession(): string {
    pruneModeratorSessions();
    const token = crypto.randomUUID();
    moderatorSessions.set(token, Date.now() + FORUM_MOD_SESSION_TTL_SECONDS * 1000);
    return token;
}

function isModeratorSessionValid(token: string | undefined): boolean {
    if (!token) {
        return false;
    }

    pruneModeratorSessions();
    const expiresAt = moderatorSessions.get(token);
    if (!expiresAt || expiresAt <= Date.now()) {
        moderatorSessions.delete(token);
        return false;
    }

    return true;
}

function clearModeratorSession(token: string | undefined): void {
    if (!token) {
        return;
    }

    moderatorSessions.delete(token);
}

function toHex(bytes: Uint8Array): string {
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function buildForumAuthorFingerprint(headers: Headers, clientIp: string): Promise<string> {
    const userAgent = headers.get("user-agent") || "";
    const source = `${clientIp}|${userAgent.trim().toLowerCase()}`;
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    return toHex(new Uint8Array(hash));
}

type DevicerRuntime = {
    adapters: {
        device: ReturnType<typeof createDevManagerSqliteAdapter>;
        ip: ReturnType<typeof createIpManagerSqliteAdapter>;
        tls: ReturnType<typeof createTlsManagerSqliteAdapter>;
        peer: ReturnType<typeof createPeerManagerSqliteAdapter>;
        bbas: ReturnType<typeof createBbasManagerSqliteAdapter>;
    };
    confidenceThreshold: number;
    deviceManager: devicer.DeviceManager;
};

type AnalyticsState = {
    fingerprints: devicer.StoredFingerprint[];
    clusters: devicer.StoredFingerprint[][];
    uniques: devicer.StoredFingerprint[];
};

const analytics: AnalyticsState = {
    fingerprints: [],
    clusters: [],
    uniques: [],
};

// deno-lint-ignore no-unused-vars prefer-const
let analyticsRefreshTimer: ReturnType<typeof setInterval> | undefined;
let analyticsLastRefreshedAt = 0;
let analyticsRefreshInFlight: Promise<void> | null = null;
const fingerprintIngestStats = {
    messagesReceived: 0,
    identifySucceeded: 0,
    identifyFailed: 0,
    tlshComplexityFallbacks: 0,
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isLoopbackHost(host: string | null): boolean {
    if (!host) {
        return false;
    }

    const normalized = host.trim().toLowerCase();
    const withoutPort = normalized.startsWith("[")
        ? normalized.slice(1, normalized.indexOf("]") > 0 ? normalized.indexOf("]") : undefined)
        : normalized.split(":")[0];

    return withoutPort === "localhost" || withoutPort === "127.0.0.1" || withoutPort === "::1";
}

function isLocalhostRequest(url: URL, headers: Headers): boolean {
    const hostHeader = headers.get("host");
    return isLoopbackHost(hostHeader) || isLoopbackHost(url.host) || isLoopbackHost(url.hostname);
}

function getForwardedClientIp(headers: Headers): string | null {
    return headers.get("CF-Connecting-IP") ||
        headers.get("X-Forwarded-For") ||
        headers.get("X-Real-IP");
}

function isTlsComplexityError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    return message.includes("input data hasn't enough complexity") ||
        message.includes("not enough complexity") ||
        message.includes("tlsh");
}

function buildAnalyticsMessage(state: AnalyticsState): string {
    return JSON.stringify({
        type: "analytics",
        data: {
            totalFingerprints: state.fingerprints.length,
            uniqueFingerprints: state.uniques.length,
            clusters: state.clusters.length,
            averageClusterSize: state.clusters.length > 0
                ? Math.floor((state.fingerprints.length - state.uniques.length) / state.clusters.length)
                : 0,
        },
    });
}

function sendSocketJson(socket: WebSocket, payload: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
    }
}

async function exists(path: string): Promise<boolean> {
    try {
        await Deno.stat(path);
        return true;
    } catch {
        return false;
    }
}

async function buildDevicerRuntime(): Promise<DevicerRuntime> {
    const adapters = {
        device: createDevManagerSqliteAdapter("./data/fp.db"),
        ip: createIpManagerSqliteAdapter("./data/ip.db"),
        tls: createTlsManagerSqliteAdapter("./data/tls.db"),
        peer: createPeerManagerSqliteAdapter("./data/peer.db"),
        bbas: createBbasManagerSqliteAdapter("./data/bbas.db"),
    };

    for (const adapter of Object.values(adapters)) {
        await adapter.init();
    }

    const confidenceThreshold = 85;
    const licenseKey = Deno.env.get("DEVICER_LICENSE_KEY");
    const deviceManager = new devicer.DeviceManager(adapters.device, {
        matchThreshold: confidenceThreshold,
        candidateMinScore: 40,
        logger: console,
    });

    try {
        const geoPath = "./data/GeoLite2-City.mmdb";
        const asnPath = "./data/GeoLite2-ASN.mmdb";
        const ipManager = new ipDevicer.IpManager({
            licenseKey,
            maxmindPath: geoPath,
            asnPath,
            enableReputation: await exists(geoPath) && await exists(asnPath),
            storage: adapters.ip,
        });
        deviceManager.use(ipManager);
    } catch (error) {
        console.warn("Failed to initialize ip-devicer plugin:", error);
    }

    try {
        const tlsManager = new tlsDevicer.TlsManager({
            licenseKey,
            storage: adapters.tls,
        });
        deviceManager.use(tlsManager);
    } catch (error) {
        console.warn("Failed to initialize tls-devicer plugin:", error);
    }

    try {
        const peerManager = new peerDevicer.PeerManager({
            licenseKey,
            storage: adapters.peer,
        });
        deviceManager.use(peerManager);
    } catch (error) {
        console.warn("Failed to initialize peer-devicer plugin:", error);
    }

    try {
        const bbasManager = new bbasDevicer.BbasManager({
            licenseKey,
            storage: adapters.bbas,
            enableBehavioralAnalysis: true,
            enableCrossPlugin: true,
        });
        deviceManager.use(bbasManager);
    } catch (error) {
        console.warn("Failed to initialize bbas-devicer plugin:", error);
    }

    return {
        adapters,
        confidenceThreshold,
        deviceManager,
    };
}

async function refreshFingerprintAnalytics(state: DevicerRuntime): Promise<void> {
    analytics.fingerprints = await state.adapters.device.getAllFingerprints();
    [analytics.clusters, analytics.uniques] = await clusterFingerprints(
        state.adapters.device,
        1 - state.confidenceThreshold / 100,
        2,
    );
    analyticsLastRefreshedAt = Date.now();
}

async function refreshFingerprintAnalyticsIfNeeded(
    state: DevicerRuntime,
    minIntervalMs = 0,
): Promise<void> {
    const now = Date.now();
    if (minIntervalMs > 0 && now - analyticsLastRefreshedAt < minIntervalMs) {
        return;
    }

    if (!analyticsRefreshInFlight) {
        analyticsRefreshInFlight = refreshFingerprintAnalytics(state)
            .catch((error) => {
                console.error("Fingerprint analytics refresh failed", error);
            })
            .finally(() => {
                analyticsRefreshInFlight = null;
            });
    }

    await analyticsRefreshInFlight;
}

const devicerRuntime = await buildDevicerRuntime();
await refreshFingerprintAnalytics(devicerRuntime);
analyticsRefreshTimer = setInterval(() => {
    void refreshFingerprintAnalyticsIfNeeded(devicerRuntime, 30_000);
}, 600_000);

function escapeHtml(value: string): string {
        return value
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#39;");
}

function isExperimentAdminAuthorized(headers: Headers, url: string): boolean {
        const expectedKey = Deno.env.get("EXPERIMENT_ADMIN_KEY") || "";
        if (!expectedKey) {
                return true;
        }

    const providedHeader = headers.get("x-experiment-admin-key") || "";
    const providedQuery = new URL(url).searchParams.get("key") || "";

        return providedHeader === expectedKey || providedQuery === expectedKey;
}

function renderGuardrailsDashboardHtml(summary: Awaited<ReturnType<typeof generateGuardrailSummary>>): string {
    const fingerprintSnapshot = {
        totalFingerprints: analytics.fingerprints.length,
        uniqueFingerprints: analytics.uniques.length,
        clusters: analytics.clusters.length,
        averageClusterSize: analytics.clusters.length > 0
            ? Math.floor((analytics.fingerprints.length - analytics.uniques.length) / analytics.clusters.length)
            : 0,
    };

        const rows = summary.metrics
                .map((metric) => {
                        const rate = `${(metric.conversionRate * 100).toFixed(2)}%`;
                return `<tr data-experiment="${escapeHtml(metric.experimentId)}" data-variant="${escapeHtml(metric.variant)}">
    <td>${escapeHtml(metric.experimentId)}</td>
    <td>${escapeHtml(metric.variant)}</td>
    <td>${metric.totalVisits}</td>
    <td>${metric.contactSubmits}</td>
    <td>${metric.clickthroughs}</td>
        <td>${metric.buyClickthroughs}</td>
        <td>${metric.whitepaperClickthroughs}</td>
        <td>${metric.contactClickthroughs}</td>
        <td>${metric.formStarts}</td>
        <td>${metric.captchaCompletes}</td>
        <td>${metric.formValidationErrors}</td>
        <td>${metric.formSubmitAttempts}</td>
        <td>${metric.formSubmitSuccesses}</td>
        <td>${metric.formSubmitErrors}</td>
    <td>${rate}</td>
</tr>`;
                })
                .join("\n");

        const content = rows || `<tr><td colspan="15">No experiment events available for this time range.</td></tr>`;

        return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Experiment Guardrails Dashboard</title>
        <style>
            body {
                margin: 0;
                padding: 2rem;
                background: #0f172a;
                color: #e2e8f0;
                font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
            }
            h1 {
                margin: 0 0 0.5rem;
                font-size: 1.6rem;
            }
            p {
                margin: 0 0 1rem;
                color: #94a3b8;
            }
            .panel {
                background: #111827;
                border: 1px solid #334155;
                border-radius: 14px;
                overflow: hidden;
            }
            .controls {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 0.75rem;
                margin: 0 0 1rem;
            }
            .control {
                display: flex;
                flex-direction: column;
                gap: 0.35rem;
            }
            .control label {
                font-size: 0.72rem;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                color: #94a3b8;
            }
            .control select {
                appearance: none;
                border: 1px solid #334155;
                border-radius: 10px;
                background: #0b1220;
                color: #e2e8f0;
                padding: 0.55rem 0.65rem;
                font-size: 0.92rem;
            }
            .table-empty {
                color: #94a3b8;
                text-align: center;
                padding: 1rem;
            }
            .stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 0.75rem;
                margin: 0 0 1rem;
            }
            .stat {
                background: #111827;
                border: 1px solid #334155;
                border-radius: 12px;
                padding: 0.8rem 0.9rem;
            }
            .stat-label {
                font-size: 0.72rem;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                color: #94a3b8;
            }
            .stat-value {
                margin-top: 0.25rem;
                font-size: 1.15rem;
                color: #e2e8f0;
                font-weight: 700;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                padding: 0.75rem 0.9rem;
                text-align: left;
                border-bottom: 1px solid #1f2937;
            }
            th {
                font-size: 0.8rem;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                color: #93c5fd;
                background: #0b1220;
            }
            tr:last-child td {
                border-bottom: none;
            }
        </style>
    </head>
    <body>
        <h1>Experiment Guardrails</h1>
        <p>Generated at ${escapeHtml(summary.generatedAt)} for lookback ${summary.lookbackDays} day(s).</p>
        <div class="stats">
            <div class="stat">
                <div class="stat-label">Fingerprint Rows</div>
                <div class="stat-value">${fingerprintSnapshot.totalFingerprints}</div>
            </div>
            <div class="stat">
                <div class="stat-label">Unique Fingerprints</div>
                <div class="stat-value">${fingerprintSnapshot.uniqueFingerprints}</div>
            </div>
            <div class="stat">
                <div class="stat-label">Fingerprint Clusters</div>
                <div class="stat-value">${fingerprintSnapshot.clusters}</div>
            </div>
            <div class="stat">
                <div class="stat-label">Avg Cluster Size</div>
                <div class="stat-value">${fingerprintSnapshot.averageClusterSize}</div>
            </div>
        </div>
        <div class="controls">
            <div class="control">
                <label for="sort-by">Sort By</label>
                <select id="sort-by">
                    <option value="conversion_desc">Conversion Rate (High to Low)</option>
                    <option value="conversion_asc">Conversion Rate (Low to High)</option>
                    <option value="visits_desc">Total Visits (High to Low)</option>
                    <option value="visits_asc">Total Visits (Low to High)</option>
                    <option value="contacts_desc">Contact Submits (High to Low)</option>
                    <option value="contacts_asc">Contact Submits (Low to High)</option>
                    <option value="clicks_desc">Clickthroughs (High to Low)</option>
                    <option value="clicks_asc">Clickthroughs (Low to High)</option>
                    <option value="buy_clicks_desc">Buy Clickthroughs (High to Low)</option>
                    <option value="buy_clicks_asc">Buy Clickthroughs (Low to High)</option>
                    <option value="whitepaper_clicks_desc">Whitepaper Clickthroughs (High to Low)</option>
                    <option value="whitepaper_clicks_asc">Whitepaper Clickthroughs (Low to High)</option>
                    <option value="contact_clicks_desc">Contact Clickthroughs (High to Low)</option>
                    <option value="contact_clicks_asc">Contact Clickthroughs (Low to High)</option>
                    <option value="form_attempts_desc">Form Submit Attempts (High to Low)</option>
                    <option value="form_attempts_asc">Form Submit Attempts (Low to High)</option>
                    <option value="form_success_desc">Form Submit Successes (High to Low)</option>
                    <option value="form_success_asc">Form Submit Successes (Low to High)</option>
                    <option value="form_errors_desc">Form Validation Errors (High to Low)</option>
                    <option value="form_errors_asc">Form Validation Errors (Low to High)</option>
                    <option value="experiment_asc">Experiment (A-Z)</option>
                    <option value="experiment_desc">Experiment (Z-A)</option>
                </select>
            </div>
            <div class="control">
                <label for="filter-experiment">Filter Experiment</label>
                <select id="filter-experiment">
                    <option value="all">All Experiments</option>
                </select>
            </div>
            <div class="control">
                <label for="filter-variant">Filter Variant</label>
                <select id="filter-variant">
                    <option value="all">All Variants</option>
                </select>
            </div>
        </div>
        <div class="panel">
            <table>
                <thead>
                    <tr>
                        <th>Experiment</th>
                        <th>Variant</th>
                        <th>Total Visits</th>
                        <th>Contact Submits</th>
                        <th>Clickthroughs</th>
                        <th>Buy Clicks</th>
                        <th>Whitepaper Clicks</th>
                        <th>Contact Clicks</th>
                        <th>Form Starts</th>
                        <th>Captcha Completes</th>
                        <th>Validation Errors</th>
                        <th>Submit Attempts</th>
                        <th>Submit Successes</th>
                        <th>Submit Errors</th>
                        <th>Conversion Rate</th>
                    </tr>
                </thead>
                <tbody id="guardrails-rows">
                    ${content}
                </tbody>
            </table>
        </div>
        <script>
            (function () {
                const tableBody = document.getElementById("guardrails-rows");
                const sortBy = document.getElementById("sort-by");
                const filterExperiment = document.getElementById("filter-experiment");
                const filterVariant = document.getElementById("filter-variant");

                if (!tableBody || !sortBy || !filterExperiment || !filterVariant) {
                    return;
                }

                const originalRows = Array.from(tableBody.querySelectorAll("tr"));
                const emptyState = document.createElement("tr");
                emptyState.innerHTML = '<td class="table-empty" colspan="15">No rows match the selected filters.</td>';

                function toNumber(value) {
                    const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
                    return Number.isFinite(parsed) ? parsed : 0;
                }

                function readCells(row) {
                    const cells = row.querySelectorAll("td");
                    return {
                        experiment: (cells[0]?.textContent || "").trim(),
                        variant: (cells[1]?.textContent || "").trim(),
                        visits: toNumber(cells[2]?.textContent || "0"),
                        contacts: toNumber(cells[3]?.textContent || "0"),
                        clicks: toNumber(cells[4]?.textContent || "0"),
                        buyClicks: toNumber(cells[5]?.textContent || "0"),
                        whitepaperClicks: toNumber(cells[6]?.textContent || "0"),
                        contactClicks: toNumber(cells[7]?.textContent || "0"),
                        formStarts: toNumber(cells[8]?.textContent || "0"),
                        captchaCompletes: toNumber(cells[9]?.textContent || "0"),
                        validationErrors: toNumber(cells[10]?.textContent || "0"),
                        formSubmitAttempts: toNumber(cells[11]?.textContent || "0"),
                        formSubmitSuccesses: toNumber(cells[12]?.textContent || "0"),
                        formSubmitErrors: toNumber(cells[13]?.textContent || "0"),
                        conversion: toNumber(cells[14]?.textContent || "0"),
                    };
                }

                function unique(values) {
                    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
                }

                function fillSelect(select, label, values) {
                    select.innerHTML = "";
                    const allOption = document.createElement("option");
                    allOption.value = "all";
                    allOption.textContent = label;
                    select.appendChild(allOption);

                    for (const value of values) {
                        const option = document.createElement("option");
                        option.value = value;
                        option.textContent = value;
                        select.appendChild(option);
                    }
                }

                fillSelect(
                    filterExperiment,
                    "All Experiments",
                    unique(originalRows.map((row) => readCells(row).experiment).filter(Boolean)),
                );
                fillSelect(
                    filterVariant,
                    "All Variants",
                    unique(originalRows.map((row) => readCells(row).variant).filter(Boolean)),
                );

                function applyControls() {
                    const selectedExperiment = filterExperiment.value;
                    const selectedVariant = filterVariant.value;
                    const sortMode = sortBy.value;

                    const filtered = originalRows.filter((row) => {
                        const cells = readCells(row);
                        if (selectedExperiment !== "all" && cells.experiment !== selectedExperiment) {
                            return false;
                        }
                        if (selectedVariant !== "all" && cells.variant !== selectedVariant) {
                            return false;
                        }
                        return true;
                    });

                    filtered.sort((left, right) => {
                        const a = readCells(left);
                        const b = readCells(right);
                        switch (sortMode) {
                            case "conversion_asc": return a.conversion - b.conversion;
                            case "conversion_desc": return b.conversion - a.conversion;
                            case "visits_asc": return a.visits - b.visits;
                            case "visits_desc": return b.visits - a.visits;
                            case "contacts_asc": return a.contacts - b.contacts;
                            case "contacts_desc": return b.contacts - a.contacts;
                            case "clicks_asc": return a.clicks - b.clicks;
                            case "clicks_desc": return b.clicks - a.clicks;
                            case "buy_clicks_asc": return a.buyClicks - b.buyClicks;
                            case "buy_clicks_desc": return b.buyClicks - a.buyClicks;
                            case "whitepaper_clicks_asc": return a.whitepaperClicks - b.whitepaperClicks;
                            case "whitepaper_clicks_desc": return b.whitepaperClicks - a.whitepaperClicks;
                            case "contact_clicks_asc": return a.contactClicks - b.contactClicks;
                            case "contact_clicks_desc": return b.contactClicks - a.contactClicks;
                            case "form_attempts_asc": return a.formSubmitAttempts - b.formSubmitAttempts;
                            case "form_attempts_desc": return b.formSubmitAttempts - a.formSubmitAttempts;
                            case "form_success_asc": return a.formSubmitSuccesses - b.formSubmitSuccesses;
                            case "form_success_desc": return b.formSubmitSuccesses - a.formSubmitSuccesses;
                            case "form_errors_asc": return a.validationErrors - b.validationErrors;
                            case "form_errors_desc": return b.validationErrors - a.validationErrors;
                            case "experiment_desc": return b.experiment.localeCompare(a.experiment);
                            case "experiment_asc":
                            default:
                                return a.experiment.localeCompare(b.experiment);
                        }
                    });

                    tableBody.innerHTML = "";
                    if (filtered.length === 0) {
                        tableBody.appendChild(emptyState);
                        return;
                    }

                    for (const row of filtered) {
                        tableBody.appendChild(row);
                    }
                }

                sortBy.addEventListener("change", applyControls);
                filterExperiment.addEventListener("change", applyControls);
                filterVariant.addEventListener("change", applyControls);
                applyControls();
            })();
        </script>
    </body>
</html>`;
}

function buildRequestExperimentContext(headers: Headers): ReturnType<typeof buildExperimentContext> {
    return buildExperimentContext({
        cookieHeader: headers.get("cookie"),
        sessionHeader: headers.get("x-gcx-session"),
    }, isProduction);
}

function injectExperimentBootstrap(html: string, scriptTag: string): string {

    if (html.includes("</head>")) {
        return html.replace("</head>", `${scriptTag}\n  </head>`);
    }

    return `${scriptTag}${html}`;
}

async function injectRuntimeBootstrapForHtml(context: {
    request: { headers: Headers; url: URL };
    cookies: { get(name: string): Promise<string | undefined> };
    response: { headers: Headers };
}, html: string, experimentContext?: ReturnType<typeof buildExperimentContext>): Promise<string> {
    const externalOrigin = resolveExternalOrigin(context.request.url, context.request.headers, configuredPublicOrigin);
    const secureCookie = isExternalOriginSecure(externalOrigin);
    const sessionId = await context.cookies.get(SESSION_COOKIE_NAME);
    let session = sessionStore.getSession(sessionId);

    if (!session) {
        session = sessionStore.createSession();
    }

    context.response.headers.append(
        "set-cookie",
        buildSessionCookieHeader(SESSION_COOKIE_NAME, session.id, secureCookie, 600),
    );

        const resolvedExperimentContext = experimentContext ?? buildRequestExperimentContext(context.request.headers);

        return injectExperimentBootstrap(
                injectSessionToken(html, session.token),
                resolvedExperimentContext.scriptTag,
        );
}

type HomepageProductId = "devicer" | "hyperlocal" | "nashtwin";

const HOMEPAGE_PRODUCT_LEAD_EXPERIMENT_ID = "homepage-product-lead-v1";
const HOMEPAGE_PRODUCT_LEAD_OVERRIDE_ENV = "EXPERIMENTS_HOMEPAGE_LEAD_PRODUCT";
const HOMEPAGE_PRODUCT_ORDER: HomepageProductId[] = ["devicer", "hyperlocal", "nashtwin"];

function parseHomepageProductId(value: string | undefined): HomepageProductId | undefined {
        if (!value) {
                return undefined;
        }

        const normalized = value.trim().toLowerCase();
        if (normalized === "devicer" || normalized === "hyperlocal" || normalized === "nashtwin") {
                return normalized;
        }

        return undefined;
}

function resolveHomepageLeadProduct(assignments: { experimentId: string; variant: string }[]): HomepageProductId {
        const override = parseHomepageProductId(Deno.env.get(HOMEPAGE_PRODUCT_LEAD_OVERRIDE_ENV));
        if (override) {
                return override;
        }

        const leadExperiment = assignments.find((assignment) => assignment.experimentId === HOMEPAGE_PRODUCT_LEAD_EXPERIMENT_ID);
        if (!leadExperiment) {
                return "devicer";
        }

        switch (leadExperiment.variant) {
                case "hyperlocal-lead":
                        return "hyperlocal";
                case "nashtwin-lead":
                        return "nashtwin";
                case "devicer-lead":
                default:
                        return "devicer";
        }
}

function renderHomepageProductCard(productId: HomepageProductId): string {
        if (productId === "devicer") {
                return `<article class="product-spotlight">
                        <div class="icon-circle icon-lg icon-primary">🔍</div>
                        <h3 class="card-title">Devicer Intelligence Suite</h3>
                        <div class="product-meta">
                            <span class="flair-tag flair-intelligence">Device Fingerprinting</span>
                            <span class="flair-tag flair-security">KYC & Risk Analysis</span>
                            <span class="flair-tag flair-scoring">Bot Blocking & Anti-Fraud</span>
                        </div>
                        <p class="card-text product-summary">Server-side identity confidence for teams that need fraud resistance, explainability, and measurable signal quality at scale. Devicer combines high-entropy telemetry sources into a scoring layer your operators can actually trust under pressure.</p>
                        <p class="card-text product-lead-blurb">Devicer helps teams separate routine traffic from genuinely risky behavior faster, reduces time spent on blind manual review, and creates a common confidence language across product, risk, and support. Instead of treating fingerprinting as a black box, your team gets a transparent decision surface with enough context to automate safely and escalate only what deserves human judgment.</p>
                        <p class="card-text product-lead-blurb">Teams can deploy this confidence layer across onboarding, authentication, and transaction review while maintaining auditability for every decision path, from automated approvals to analyst escalations.</p>
                        <div class="product-graphic">
                            <div class="graphic-panel">
                                <p class="graphic-title">Signal Layers</p>
                                <ul class="signal-stack">
                                    <li><strong>Device</strong><span>Browser + OS entropy</span></li>
                                    <li><strong>TLS</strong><span>Handshake consistency</span></li>
                                    <li><strong>IP + ASN</strong><span>Network reputation</span></li>
                                    <li><strong>Peer Graph</strong><span>Cluster trust scoring</span></li>
                                </ul>
                            </div>
                            <div class="graphic-panel">
                                <p class="graphic-title">Outcome Map</p>
                                <div class="benefit-bars">
                                    <div class="benefit-bar" style="--bar-width: 86%;"><span>Faster risk triage</span></div>
                                    <div class="benefit-bar" style="--bar-width: 80%;"><span>Lower false positives</span></div>
                                    <div class="benefit-bar" style="--bar-width: 74%;"><span>Higher analyst trust</span></div>
                                </div>
                            </div>
                        </div>
                        <div class="product-proof-grid">
                            <div class="proof-item">
                                <span class="proof-label">Best For</span>
                                <p class="proof-text">Identity-sensitive onboarding and transaction decisioning.</p>
                            </div>
                            <div class="proof-item">
                                <span class="proof-label">Core Benefit</span>
                                <p class="proof-text">Confidence scores with enough depth for human review and automation.</p>
                            </div>
                        </div>
                        <div class="btn-group mt-md product-actions">
                            <a href="/products/devicer" class="btn btn-primary btn-sm">View Technical Overview</a>
                            <a href="/demos/devicer" class="btn btn-secondary btn-sm">Open Interactive Demo</a>
                            <a href="/papers/FP-Devicer.pdf" class="btn btn-secondary btn-sm">Whitepaper</a>
                        </div>
                    </article>`;
        }

        if (productId === "hyperlocal") {
                return `<article class="product-spotlight">
                        <div class="icon-circle icon-lg icon-secondary">💬</div>
                        <h3 class="card-title">HyperLocal 2</h3>
                        <div class="product-meta">
                            <span class="flair-tag flair-automation">AI Operations</span>
                            <span class="flair-tag flair-governance">CRM-First</span>
                            <span class="flair-tag flair-integration">SMS Automation</span>
                        </div>
                        <p class="card-text product-summary">CRM-native SMS automation with governed AI actions, route controls, and operator-owned context to keep outcomes stable under real volume. HyperLocal 2 is designed for revenue and support teams that need speed without losing process control.</p>
                        <p class="card-text product-lead-blurb">HyperLocal 2 moves teams from fragmented conversation handling to a unified runtime where AI accelerates execution but policies keep actions constrained. Operators gain faster response loops, managers gain traceability, and leadership gains confidence that automation quality will hold during campaign spikes, handoff-heavy workflows, and compliance-sensitive conversations.</p>
                        <p class="card-text product-lead-blurb">The platform keeps permissions, routing logic, and fallback controls explicit so teams can scale campaign throughput without sacrificing message quality, compliance posture, or operator oversight.</p>
                        <div class="product-graphic">
                            <div class="graphic-panel">
                                <p class="graphic-title">Execution Chain</p>
                                <ul class="signal-stack">
                                    <li><strong>Intent</strong><span>Message context parsing</span></li>
                                    <li><strong>Policy</strong><span>Permissioned action filters</span></li>
                                    <li><strong>Dispatch</strong><span>Channel + route controls</span></li>
                                    <li><strong>Fallback</strong><span>Operator handoff safety</span></li>
                                </ul>
                            </div>
                            <div class="graphic-panel">
                                <p class="graphic-title">Benefit Ramp</p>
                                <div class="benefit-bars">
                                    <div class="benefit-bar" style="--bar-width: 88%;"><span>Faster response cycles</span></div>
                                    <div class="benefit-bar" style="--bar-width: 77%;"><span>Audit-safe automation</span></div>
                                    <div class="benefit-bar" style="--bar-width: 72%;"><span>Higher operator throughput</span></div>
                                </div>
                            </div>
                        </div>
                        <div class="product-proof-grid">
                            <div class="proof-item">
                                <span class="proof-label">Best For</span>
                                <p class="proof-text">Sales and support teams running high-tempo SMS operations.</p>
                            </div>
                            <div class="proof-item">
                                <span class="proof-label">Core Benefit</span>
                                <p class="proof-text">Automation speed without surrendering control or compliance posture.</p>
                            </div>
                        </div>
                        <div class="btn-group mt-md product-actions">
                            <a href="/products/hyperlocal" class="btn btn-primary btn-sm">View Technical Overview</a>
                            <a href="/papers/HyperLocal-2.pdf" class="btn btn-secondary btn-sm">Whitepaper</a>
                        </div>
                    </article>`;
        }

        return `<article class="product-spotlight">
                        <div class="icon-circle icon-lg icon-primary">♟️</div>
                        <h3 class="card-title">NashTwin CRM</h3>
                        <div class="product-meta">
                            <span class="flair-tag flair-operations">Digital Twin</span>
                            <span class="flair-tag flair-governance">Strategic Simulation</span>
                            <span class="flair-tag flair-scoring">Executive Intelligence</span>
                        </div>
                        <p class="card-text product-summary">Decision intelligence platform for leadership teams modeling scenarios, tradeoffs, and strategy execution before capital and reputation are committed. NashTwin turns strategic uncertainty into structured simulations your team can reason about collaboratively.</p>
                        <p class="card-text product-lead-blurb">NashTwin lets leadership teams test strategic paths against constraints, incentives, and second-order effects before making irreversible moves. Instead of debating assumptions in abstract terms, teams can compare outcomes in a shared model, expose hidden risk earlier, and align execution plans around scenarios that survive both operational reality and competitive response.</p>
                        <p class="card-text product-lead-blurb">Cross-functional stakeholders can evaluate the same simulated scenarios with shared assumptions, reducing planning drift and helping teams commit resources to strategies that remain resilient as conditions change.</p>
                        <div class="product-graphic">
                            <div class="graphic-panel">
                                <p class="graphic-title">Simulation Stack</p>
                                <ul class="signal-stack">
                                    <li><strong>Model</strong><span>Actors, constraints, incentives</span></li>
                                    <li><strong>Branch</strong><span>Competing scenarios</span></li>
                                    <li><strong>Score</strong><span>Payoff + risk gradients</span></li>
                                    <li><strong>Decide</strong><span>Execution playbook output</span></li>
                                </ul>
                            </div>
                            <div class="graphic-panel">
                                <p class="graphic-title">Decision Gains</p>
                                <div class="benefit-bars">
                                    <div class="benefit-bar" style="--bar-width: 84%;"><span>Higher planning confidence</span></div>
                                    <div class="benefit-bar" style="--bar-width: 79%;"><span>Fewer blind-side outcomes</span></div>
                                    <div class="benefit-bar" style="--bar-width: 73%;"><span>Clearer cross-team alignment</span></div>
                                </div>
                            </div>
                        </div>
                        <div class="product-proof-grid">
                            <div class="proof-item">
                                <span class="proof-label">Best For</span>
                                <p class="proof-text">Executive teams navigating non-trivial strategic decisions.</p>
                            </div>
                            <div class="proof-item">
                                <span class="proof-label">Core Benefit</span>
                                <p class="proof-text">Simulated clarity before irreversible moves and resource spend.</p>
                            </div>
                        </div>
                        <div class="btn-group mt-md product-actions">
                            <a href="/products/nashtwin" class="btn btn-primary btn-sm">View Technical Overview</a>
                            <a href="https://nash.gatewaycorporate.org/" class="btn btn-accent btn-sm">Try NashTwin</a>
                        </div>
                    </article>`;
}

function renderHomepageProductCards(leadProduct: HomepageProductId): string {
        const orderedProducts = [
                leadProduct,
                ...HOMEPAGE_PRODUCT_ORDER.filter((productId) => productId !== leadProduct),
        ];

        return `<div class="grid gap-lg product-offerings-row" data-lead-product="${leadProduct}">
            ${orderedProducts.map((productId) => renderHomepageProductCard(productId)).join("\n")}
        </div>`;
}

function listStaticFileSlugs(directoryPath: string, extension: string): Set<string> {
    try {
        const slugs = new Set<string>();

        for (const entry of Deno.readDirSync(directoryPath)) {
            if (!entry.isFile || !entry.name.endsWith(extension)) {
                continue;
            }

            slugs.add(entry.name.slice(0, -extension.length));
        }

        return slugs;
    } catch {
        return new Set<string>();
    }
}

const allowedProductViews = listStaticFileSlugs("./static/products", ".html");
const allowedPapers = listStaticFileSlugs("./static/papers", ".pdf");

type SitemapEntry = {
    loc: string;
    lastmod: string;
    priority: number;
    changefreq?: string;
};

function formatSitemapDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

async function getSitemapLastModified(
    filePath: string,
    fallbackDate: string,
): Promise<string> {
    try {
        const fileInfo = await Deno.stat(filePath);
        return fileInfo.mtime ? formatSitemapDate(fileInfo.mtime) : fallbackDate;
    } catch {
        return fallbackDate;
    }
}

async function getDirectorySitemapEntries(
    directoryPath: string,
    extension: string,
    fallbackDate: string,
    routeForSlug: (slug: string) => string,
    priority: number,
): Promise<SitemapEntry[]> {
    const entries: SitemapEntry[] = [];

    for await (const file of Deno.readDir(directoryPath)) {
        if (!file.isFile || !file.name.endsWith(extension)) {
            continue;
        }

        const slug = file.name.slice(0, -extension.length);
        entries.push({
            loc: `${siteOrigin}${routeForSlug(slug)}`,
            lastmod: await getSitemapLastModified(
                `${directoryPath}/${file.name}`,
                fallbackDate,
            ),
            priority,
        });
    }

    return entries.sort((left, right) => left.loc.localeCompare(right.loc));
}

function renderSitemapUrl({ loc, lastmod, priority, changefreq }: SitemapEntry): string {
    const changefreqTag = changefreq ? `\n    <changefreq>${changefreq}</changefreq>` : "";

    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>${changefreqTag}\n    <priority>${priority.toFixed(1)}</priority>\n  </url>`;
}

function daysBetween(dateA: Date, dateB: Date): number {
    return Math.floor(Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24));
}

async function renderHomePage(
    context: {
        request: { headers: Headers; url: URL };
        cookies: { get(name: string): Promise<string | undefined> };
        response: { body: unknown; headers: Headers };
    },
) {
    const homepageTemplate = await Deno.readTextFile("./static/views/index.html");
    const blogPosts = await getBlogPosts();
    const experimentContext = buildRequestExperimentContext(context.request.headers);
    const leadProduct = resolveHomepageLeadProduct(experimentContext.assignments);

    const rendered = injectFooterIntoHtml(
        homepageTemplate.replace(
            "{{PRODUCT_CARDS}}",
            renderHomepageProductCards(leadProduct),
        ).replace(
            "{{BLOG_SECTION}}",
            renderHomepageBlogSection(blogPosts),
        ),
        resolveFooterVariant("index"),
    );

    context.response.body = await injectRuntimeBootstrapForHtml(context, rendered, experimentContext);
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
}

async function renderContactPage(
    context: {
        request: { headers: Headers; url: URL };
        cookies: { get(name: string): Promise<string | undefined> };
        response: { body: unknown; headers: Headers };
    },
) {
    const contactTemplate = await Deno.readTextFile("./static/views/contact.html");
    const rendered = injectFooterIntoHtml(
        contactTemplate,
        resolveFooterVariant("index"),
    );

    context.response.body = await injectRuntimeBootstrapForHtml(context, rendered);
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
}

function renderForumModeratorLoginPage(errorMessage?: string): string {
        const errorMarkup = errorMessage
                ? `<p style="color:#fecaca;background:rgba(127,29,29,.35);border:1px solid rgba(248,113,113,.55);border-radius:10px;padding:.6rem .75rem;margin:0 0 1rem;">${escapeHtml(errorMessage)}</p>`
                : "";

        return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Forum Moderator Login</title>
        <link rel="stylesheet" href="/components.css">
        <link rel="stylesheet" href="/enhancements.css">
        <script src="/bundle.js" defer></script>
        <script src="/index.js" defer></script>
        <style>
            body { background:#0f172a; color:#e2e8f0; font-family: ui-sans-serif, system-ui, sans-serif; }
            .wrap { max-width: 720px; margin: 6rem auto; padding: 1rem; }
            .panel { border:1px solid rgba(148,163,184,.35); border-radius: 14px; background: rgba(15,23,42,.92); padding:1rem; }
            .field { display:grid; gap:.4rem; margin:0 0 .9rem; }
            input { background:#020617; color:#e2e8f0; border:1px solid rgba(148,163,184,.45); border-radius:10px; padding:.6rem; }
        </style>
    </head>
    <body>
        <main class="wrap">
            <section class="panel">
                <h1 style="margin:0 0 .4rem;">Forum Moderator Login</h1>
                <p style="margin:0 0 1rem;color:#cbd5e1;">Sign in to access moderation tools.</p>
                ${errorMarkup}
                <form method="post" action="/forum/mod/login">
                    <div class="field">
                        <label for="mod-password">Moderator password</label>
                        <input id="mod-password" name="password" type="password" autocomplete="current-password" required>
                    </div>
                    <button class="btn btn-primary" type="submit">Sign in</button>
                </form>
            </section>
        </main>
    </body>
</html>`;
}

async function renderForumModeratorDashboardPage(options?: { message?: string; error?: string }): Promise<string> {
        const moderationState = await getForumModerationState();
        const queue = await getForumModerationQueue(160);

        const messageMarkup = options?.message
                ? `<p style="color:#dcfce7;background:rgba(22,101,52,.3);border:1px solid rgba(34,197,94,.45);border-radius:10px;padding:.6rem .75rem;">${escapeHtml(options.message)}</p>`
                : "";
        const errorMarkup = options?.error
                ? `<p style="color:#fecaca;background:rgba(127,29,29,.35);border:1px solid rgba(248,113,113,.55);border-radius:10px;padding:.6rem .75rem;">${escapeHtml(options.error)}</p>`
                : "";

        const bannedWordsMarkup = moderationState.bannedWords.length
                ? moderationState.bannedWords.map((word) => `<li style="margin:.2rem 0;">${escapeHtml(word)}</li>`).join("")
                : "<li>No banned words configured.</li>";
        const bannedAuthorsMarkup = moderationState.bannedAuthors.length
                ? moderationState.bannedAuthors.map((author) => `<li style="margin:.2rem 0;">${escapeHtml(author)}</li>`).join("")
                : "<li>No banned authors.</li>";

        const rows = queue.length
                ? queue.map((entry) => {
                        const permalink = `/forum/${encodeURIComponent(entry.boardSlug)}/thread/${encodeURIComponent(entry.threadId)}#p${entry.postNumber}`;
                        return `<tr>
                            <td>${escapeHtml(entry.boardSlug)}</td>
                            <td><a href="${permalink}">No.${entry.postNumber}</a></td>
                            <td>${escapeHtml(entry.author)}</td>
                            <td>${escapeHtml(entry.createdAt)}</td>
                            <td>${escapeHtml(entry.preview)}</td>
                            <td><code style="font-size:.73rem;">${escapeHtml(entry.authorFingerprint || "")}</code></td>
                        </tr>`;
                }).join("\n")
                : `<tr><td colspan="6">No posts available.</td></tr>`;

        return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Forum Moderation Dashboard</title>
        <link rel="stylesheet" href="/components.css">
        <link rel="stylesheet" href="/enhancements.css">
        <script src="/bundle.js" defer></script>
        <script src="/index.js" defer></script>
        <style>
            body { background:#0f172a; color:#e2e8f0; font-family: ui-sans-serif, system-ui, sans-serif; margin:0; }
            .wrap { max-width: 1200px; margin: 2rem auto 3rem; padding: 0 1rem; display:grid; gap:1rem; }
            .panel { border:1px solid rgba(148,163,184,.35); border-radius: 14px; background: rgba(15,23,42,.92); padding:1rem; }
            .grid { display:grid; gap:.7rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
            .field { display:grid; gap:.35rem; }
            input { background:#020617; color:#e2e8f0; border:1px solid rgba(148,163,184,.45); border-radius:10px; padding:.55rem; }
            table { width:100%; border-collapse: collapse; }
            th, td { border-bottom:1px solid rgba(148,163,184,.25); padding:.5rem; text-align:left; font-size:.9rem; }
            th { color:#bfdbfe; }
            ul { margin:.4rem 0 0; padding-left:1.1rem; }
            a { color:#93c5fd; }
        </style>
    </head>
    <body>
        <main class="wrap">
            <section class="panel">
                <h1 style="margin:0 0 .5rem;">Forum Moderation</h1>
                <p style="margin:0 0 .7rem;color:#cbd5e1;">Manage post removals, bans, and automoderation dictionary.</p>
                ${messageMarkup}
                ${errorMarkup}
            </section>

            <section class="panel grid">
                <form method="post" action="/forum/mod/remove" class="field">
                    <h2 style="margin:0;">Remove Post</h2>
                    <input name="boardSlug" placeholder="board slug (e.g. risk)" required>
                    <input name="threadId" placeholder="thread id" required>
                    <input name="replyId" placeholder="reply id (leave empty to remove entire thread)">
                    <button class="btn btn-primary" type="submit">Remove</button>
                </form>

                <form method="post" action="/forum/mod/ban" class="field">
                    <h2 style="margin:0;">Ban User</h2>
                    <input name="author" placeholder="author name (optional)">
                    <input name="fingerprint" placeholder="author fingerprint (optional)">
                    <button class="btn btn-primary" type="submit">Ban</button>
                </form>

                <form method="post" action="/forum/mod/words/add" class="field">
                    <h2 style="margin:0;">Add Banned Word</h2>
                    <input name="word" placeholder="word or phrase" required>
                    <button class="btn btn-primary" type="submit">Add</button>
                </form>

                <form method="post" action="/forum/mod/words/remove" class="field">
                    <h2 style="margin:0;">Remove Banned Word</h2>
                    <input name="word" placeholder="word or phrase" required>
                    <button class="btn btn-secondary" type="submit">Remove</button>
                </form>
            </section>

            <section class="panel grid">
                <div>
                    <h3 style="margin:0 0 .45rem;">Banned Words</h3>
                    <ul>${bannedWordsMarkup}</ul>
                </div>
                <div>
                    <h3 style="margin:0 0 .45rem;">Banned Authors</h3>
                    <ul>${bannedAuthorsMarkup}</ul>
                </div>
            </section>

            <section class="panel">
                <h2 style="margin:0 0 .6rem;">Recent Posts</h2>
                <div style="overflow:auto;">
                    <table>
                        <thead>
                            <tr><th>Board</th><th>Post</th><th>Author</th><th>Created</th><th>Preview</th><th>Fingerprint</th></tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="panel">
                <form method="post" action="/forum/mod/logout">
                    <button class="btn btn-secondary" type="submit">Sign out</button>
                </form>
            </section>
        </main>
    </body>
</html>`;
}

router.get("/sitemap.xml", async (context) => {
    const [blogPosts, jobs] = await Promise.all([getBlogPosts(), getJobPostings()]);
        const today = formatSitemapDate(new Date());
        const [homeLastmod, productEntries, paperEntries] = await Promise.all([
                getSitemapLastModified("./static/views/index.html", today),
                getDirectorySitemapEntries(
                        "./static/products",
                        ".html",
                        today,
                        (slug) => `/products/${encodeURIComponent(slug)}`,
                        0.9,
                ),
                getDirectorySitemapEntries(
                        "./static/papers",
                        ".pdf",
                        today,
                        (slug) => `/papers/${encodeURIComponent(slug)}.pdf`,
                        0.6,
                ),
        ]);

        const staticEntries: SitemapEntry[] = [
                {
                        loc: `${siteOrigin}/`,
                        lastmod: homeLastmod,
                        changefreq: "weekly",
                        priority: 1.0,
                },
            {
                loc: `${siteOrigin}/contact`,
                lastmod: await getSitemapLastModified("./static/views/contact.html", today),
                priority: 0.8,
            },
            {
                loc: `${siteOrigin}/services`,
                lastmod: await getSitemapLastModified("./static/views/services.html", today),
                priority: 0.9,
            },
            {
                loc: `${siteOrigin}/faq`,
                lastmod: await getSitemapLastModified("./static/views/faq.html", today),
                priority: 0.7,
            },
            {
                loc: `${siteOrigin}/demos`,
                lastmod: await getSitemapLastModified("./static/views/demos.html", today),
                priority: 0.7,
            },
            {
                loc: `${siteOrigin}/demos/devicer`,
                lastmod: await getSitemapLastModified("./static/demos/devicer.html", today),
                priority: 0.7,
            },
                {
                        loc: `${siteOrigin}/blog`,
                        lastmod: today,
                        priority: 0.8,
                },
                {
                        loc: `${siteOrigin}/careers`,
                        lastmod: today,
                        priority: 0.8,
                },
            {
                loc: `${siteOrigin}/forum`,
                lastmod: today,
                priority: 0.8,
            },
            ...FORUM_BOARDS.map((board) => ({
                loc: `${siteOrigin}/forum/${encodeURIComponent(board.slug)}`,
                lastmod: today,
                priority: 0.6,
            } satisfies SitemapEntry)),
            {
                loc: `${siteOrigin}/products`,
                lastmod: await getSitemapLastModified("./static/views/products.html", today),
                priority: 0.9,
            },
                ...productEntries,
                ...paperEntries,
        ];

        const blogEntries = blogPosts.map((post) => ({
                loc: `${siteOrigin}/blog/${encodeURIComponent(post.slug)}`,
                lastmod: post.date,
                priority: 0.7,
        } satisfies SitemapEntry));

        const jobEntries = jobs
        .filter((job) => job.status === "open")
                .map((job) => ({
                        loc: `${siteOrigin}/careers/${encodeURIComponent(job.slug)}`,
                        lastmod: job.date,
                        priority: 0.7,
                } satisfies SitemapEntry));

        const parts = [...staticEntries, ...blogEntries, ...jobEntries]
                .map(renderSitemapUrl)
                .join("\n");

    context.response.body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${parts}
</urlset>`;
    context.response.headers.set("Content-Type", "application/xml; charset=utf-8");
});

router.get("/seo/sitemap-health", async (context) => {
    if (!isExperimentAdminAuthorized(context.request.headers, context.request.url.toString())) {
        context.response.status = 401;
        context.response.body = { ok: false, error: "Unauthorized" };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
        return;
    }

    try {
        const staleAfterDays = Math.max(1, Number(context.request.url.searchParams.get("staleAfterDays") || "45"));
        const now = new Date();
        const [blogPosts, jobs] = await Promise.all([getBlogPosts(), getJobPostings()]);

        const includedPaths = new Set<string>([
            "/",
            "/contact",
            "/services",
            "/faq",
            "/demos",
            "/demos/devicer",
            "/blog",
            "/careers",
            "/forum",
            ...FORUM_BOARDS.map((board) => `/forum/${board.slug}`),
            "/products",
            ...[...allowedProductViews].map((slug) => `/products/${slug}`),
            ...[...allowedPapers].map((slug) => `/papers/${slug}.pdf`),
            ...blogPosts.map((post) => `/blog/${post.slug}`),
            ...jobs.filter((job) => job.status === "open").map((job) => `/careers/${job.slug}`),
        ]);

        const expectedPaths = [
            "/",
            "/contact",
            "/services",
            "/faq",
            "/demos",
            "/demos/devicer",
            "/blog",
            "/careers",
            "/forum",
            ...FORUM_BOARDS.map((board) => `/forum/${board.slug}`),
            "/products",
            ...[...allowedProductViews].map((slug) => `/products/${slug}`),
            ...[...allowedPapers].map((slug) => `/papers/${slug}.pdf`),
            ...blogPosts.map((post) => `/blog/${post.slug}`),
            ...jobs.filter((job) => job.status === "open").map((job) => `/careers/${job.slug}`),
        ];

        const missingPaths = expectedPaths.filter((path) => !includedPaths.has(path));

        const freshnessChecks = [
            { path: "/", date: await getSitemapLastModified("./static/views/index.html", now.toISOString().slice(0, 10)) },
            { path: "/contact", date: await getSitemapLastModified("./static/views/contact.html", now.toISOString().slice(0, 10)) },
            { path: "/services", date: await getSitemapLastModified("./static/views/services.html", now.toISOString().slice(0, 10)) },
            { path: "/faq", date: await getSitemapLastModified("./static/views/faq.html", now.toISOString().slice(0, 10)) },
            { path: "/demos", date: await getSitemapLastModified("./static/views/demos.html", now.toISOString().slice(0, 10)) },
            { path: "/demos/devicer", date: await getSitemapLastModified("./static/demos/devicer.html", now.toISOString().slice(0, 10)) },
            { path: "/forum", date: now.toISOString().slice(0, 10) },
            ...FORUM_BOARDS.map((board) => ({ path: `/forum/${board.slug}`, date: now.toISOString().slice(0, 10) })),
            { path: "/products", date: await getSitemapLastModified("./static/views/products.html", now.toISOString().slice(0, 10)) },
            ...blogPosts.map((post) => ({ path: `/blog/${post.slug}`, date: post.date })),
            ...jobs.filter((job) => job.status === "open").map((job) => ({ path: `/careers/${job.slug}`, date: job.date })),
        ];

        const staleEntries = freshnessChecks
            .map((entry) => {
                const parsed = new Date(entry.date);
                if (Number.isNaN(parsed.getTime())) {
                    return {
                        path: entry.path,
                        lastmod: entry.date,
                        ageDays: null,
                    };
                }

                return {
                    path: entry.path,
                    lastmod: parsed.toISOString().slice(0, 10),
                    ageDays: daysBetween(now, parsed),
                };
            })
            .filter((entry) => entry.ageDays === null || entry.ageDays > staleAfterDays);

        context.response.status = 200;
        context.response.body = {
            ok: missingPaths.length === 0 && staleEntries.length === 0,
            generatedAt: new Date().toISOString(),
            staleAfterDays,
            totalTrackedPaths: expectedPaths.length,
            missingPaths,
            staleEntries,
        };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    } catch (error) {
        console.error("Failed to generate sitemap health report", error);
        context.response.status = 500;
        context.response.body = { ok: false, error: "Sitemap health report unavailable" };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    }
});

router.get("/", async (context) => {
    await renderHomePage(context);
});
router.get("/index.html", async (context) => {
    await renderHomePage(context);
});
router.get("/contact", async (context) => {
    try {
        await renderContactPage(context);
    } catch (error) {
        console.error(`Error reading contact view file: ${error}`);
        context.response.status = 404;
        context.response.body = "Contact page not found";
    }
});
router.get("/contact/availability", (context) => {
    try {
        const date = String(context.request.url.searchParams.get("date") || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            context.response.status = 400;
            context.response.body = {
                error: "Please provide date as YYYY-MM-DD.",
            };
            context.response.headers.set("Content-Type", "application/json; charset=utf-8");
            return;
        }

        context.response.status = 200;
        context.response.body = {
            date,
            slots: getAvailableAppointmentSlots(date),
        };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    } catch (error) {
        console.error("Error reading contact availability:", error);
        context.response.status = 500;
        context.response.body = { error: "Availability lookup unavailable." };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    }
});
router.get("/services", async (context) => {
    try {
        const servicesHtml = Deno.readTextFileSync("./static/views/services.html");
        const rendered = injectFooterIntoHtml(
            servicesHtml,
            resolveFooterVariant("index"),
        );
        context.response.body = await injectRuntimeBootstrapForHtml(context, rendered);
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    } catch (error) {
        console.error(`Error reading services view file: ${error}`);
        context.response.status = 404;
        context.response.body = "Services page not found";
    }
});
router.get("/products", async (context) => {
    try {
        const productsHtml = Deno.readTextFileSync("./static/views/products.html");
        const rendered = injectFooterIntoHtml(
            productsHtml,
            resolveFooterVariant("index"),
        );
        context.response.body = await injectRuntimeBootstrapForHtml(context, rendered);
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    } catch (error) {
        console.error(`Error reading products view file: ${error}`);
        context.response.status = 404;
        context.response.body = "Products page not found";
    }
});
router.get("/faq", async (context) => {
    try {
        const faqHtml = Deno.readTextFileSync("./static/views/faq.html");
        const rendered = injectFooterIntoHtml(
            faqHtml,
            resolveFooterVariant("index"),
        );
        context.response.body = await injectRuntimeBootstrapForHtml(context, rendered);
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    } catch (error) {
        console.error(`Error reading FAQ view file: ${error}`);
        context.response.status = 404;
        context.response.body = "FAQ page not found";
    }
});
router.get("/demos", async (context) => {
    try {
        const demosHtml = Deno.readTextFileSync("./static/views/demos.html");
        const rendered = injectFooterIntoHtml(
            demosHtml,
            resolveFooterVariant("index"),
        );
        context.response.body = await injectRuntimeBootstrapForHtml(context, rendered);
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    } catch (error) {
        console.error(`Error reading demos view file: ${error}`);
        context.response.status = 404;
        context.response.body = "Demos page not found";
    }
});
router.get("/demos/devicer", async (context) => {
    try {
        const demoHtml = Deno.readTextFileSync("./static/demos/devicer.html");
        const rendered = injectFooterIntoHtml(
            demoHtml,
            resolveFooterVariant("devicer"),
        );
        context.response.body = await injectRuntimeBootstrapForHtml(context, rendered);
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    } catch (error) {
        console.error(`Error reading Devicer demo view file: ${error}`);
        context.response.status = 404;
        context.response.body = "Devicer demo page not found";
    }
});
router.get("/forum", async (context) => {
    context.response.body = await injectRuntimeBootstrapForHtml(context, await renderForumIndexPage());
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.get("/forum/mod/login", async (context) => {
    if (!isForumModerationEnabled()) {
        context.response.status = 503;
        context.response.body = "Forum moderation is disabled. Set FORUM_MOD_PASSWORD to enable it.";
        context.response.headers.set("Content-Type", "text/plain; charset=utf-8");
        return;
    }

    const existingToken = await context.cookies.get(FORUM_MOD_COOKIE_NAME);
    if (isModeratorSessionValid(existingToken || undefined)) {
        context.response.redirect("/forum/mod");
        return;
    }

    const errorMessage = context.request.url.searchParams.get("error") || undefined;
    context.response.status = 200;
    context.response.body = renderForumModeratorLoginPage(errorMessage);
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.post("/forum/mod/login", async (context) => {
    if (!isForumModerationEnabled()) {
        context.response.status = 503;
        context.response.body = "Forum moderation is disabled.";
        context.response.headers.set("Content-Type", "text/plain; charset=utf-8");
        return;
    }

    const form = await context.request.body.form();
    const password = String(form.get("password") || "");
    if (password !== getForumModeratorPassword()) {
        context.response.redirect("/forum/mod/login?error=" + encodeURIComponent("Invalid moderator password."));
        return;
    }

    const token = createModeratorSession();
    const externalOrigin = resolveExternalOrigin(context.request.url, context.request.headers, configuredPublicOrigin);
    context.response.headers.append(
        "set-cookie",
        buildSessionCookieHeader(
            FORUM_MOD_COOKIE_NAME,
            token,
            isExternalOriginSecure(externalOrigin),
            FORUM_MOD_SESSION_TTL_SECONDS,
        ),
    );
    context.response.redirect("/forum/mod");
});
router.post("/forum/mod/logout", async (context) => {
    const existingToken = await context.cookies.get(FORUM_MOD_COOKIE_NAME);
    clearModeratorSession(existingToken || undefined);

    const externalOrigin = resolveExternalOrigin(context.request.url, context.request.headers, configuredPublicOrigin);
    context.response.headers.append(
        "set-cookie",
        buildSessionCookieHeader(
            FORUM_MOD_COOKIE_NAME,
            "",
            isExternalOriginSecure(externalOrigin),
            1,
        ),
    );
    context.response.redirect("/forum/mod/login");
});
router.get("/forum/mod", async (context) => {
    if (!isForumModerationEnabled()) {
        context.response.status = 503;
        context.response.body = "Forum moderation is disabled.";
        context.response.headers.set("Content-Type", "text/plain; charset=utf-8");
        return;
    }

    const token = await context.cookies.get(FORUM_MOD_COOKIE_NAME);
    if (!isModeratorSessionValid(token || undefined)) {
        context.response.redirect("/forum/mod/login?error=" + encodeURIComponent("Please sign in first."));
        return;
    }

    const message = context.request.url.searchParams.get("message") || undefined;
    const error = context.request.url.searchParams.get("error") || undefined;
    context.response.body = await renderForumModeratorDashboardPage({ message, error });
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.post("/forum/mod/remove", async (context) => {
    const token = await context.cookies.get(FORUM_MOD_COOKIE_NAME);
    if (!isModeratorSessionValid(token || undefined)) {
        context.response.redirect("/forum/mod/login?error=" + encodeURIComponent("Please sign in first."));
        return;
    }

    const form = await context.request.body.form();
    const boardSlug = String(form.get("boardSlug") || "").trim();
    const threadId = String(form.get("threadId") || "").trim();
    const replyIdRaw = String(form.get("replyId") || "").trim();
    const replyId = replyIdRaw || undefined;

    const result = await removeForumPost({ boardSlug, threadId, replyId });
    if (!result.ok) {
        context.response.redirect("/forum/mod?error=" + encodeURIComponent(result.error));
        return;
    }

    context.response.redirect("/forum/mod?message=" + encodeURIComponent("Post removed."));
});
router.post("/forum/mod/ban", async (context) => {
    const token = await context.cookies.get(FORUM_MOD_COOKIE_NAME);
    if (!isModeratorSessionValid(token || undefined)) {
        context.response.redirect("/forum/mod/login?error=" + encodeURIComponent("Please sign in first."));
        return;
    }

    const form = await context.request.body.form();
    const author = String(form.get("author") || "").trim() || undefined;
    const fingerprint = String(form.get("fingerprint") || "").trim() || undefined;

    try {
        await banForumIdentity({ author, fingerprint });
        context.response.redirect("/forum/mod?message=" + encodeURIComponent("User ban saved."));
    } catch (error) {
        context.response.redirect("/forum/mod?error=" + encodeURIComponent(error instanceof Error ? error.message : "Unable to ban user."));
    }
});
router.post("/forum/mod/words/add", async (context) => {
    const token = await context.cookies.get(FORUM_MOD_COOKIE_NAME);
    if (!isModeratorSessionValid(token || undefined)) {
        context.response.redirect("/forum/mod/login?error=" + encodeURIComponent("Please sign in first."));
        return;
    }

    const form = await context.request.body.form();
    const word = String(form.get("word") || "").trim();

    try {
        await addForumBannedWord(word);
        context.response.redirect("/forum/mod?message=" + encodeURIComponent("Banned word added."));
    } catch (error) {
        context.response.redirect("/forum/mod?error=" + encodeURIComponent(error instanceof Error ? error.message : "Unable to add banned word."));
    }
});
router.post("/forum/mod/words/remove", async (context) => {
    const token = await context.cookies.get(FORUM_MOD_COOKIE_NAME);
    if (!isModeratorSessionValid(token || undefined)) {
        context.response.redirect("/forum/mod/login?error=" + encodeURIComponent("Please sign in first."));
        return;
    }

    const form = await context.request.body.form();
    const word = String(form.get("word") || "").trim();
    await removeForumBannedWord(word);
    context.response.redirect("/forum/mod?message=" + encodeURIComponent("Banned word removed."));
});
router.get("/forum/:board", async (context) => {
    const boardSlug = context.params.board;
    if (!boardSlug) {
        context.response.status = 404;
        context.response.body = await injectRuntimeBootstrapForHtml(context, renderForumBoardNotFoundPage(""));
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
        return;
    }

    const board = getForumBoardBySlug(boardSlug);
    if (!board) {
        context.response.status = 404;
        context.response.body = await injectRuntimeBootstrapForHtml(context, renderForumBoardNotFoundPage(boardSlug));
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
        return;
    }

    const page = parseForumPageParam(context.request.url.searchParams.get("page"));
    const errorMessage = context.request.url.searchParams.get("error") || undefined;

    context.response.body = await injectRuntimeBootstrapForHtml(
        context,
        await renderForumBoardPage({ board, page, errorMessage }),
    );
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.post("/forum/:board/thread", async (context) => {
    const boardSlug = context.params.board;
    if (!boardSlug) {
        context.response.status = 404;
        context.response.body = "Board not found";
        return;
    }

    const board = getForumBoardBySlug(boardSlug);
    if (!board) {
        context.response.status = 404;
        context.response.body = "Board not found";
        return;
    }

    const form = await context.request.body.form();
    const title = String(form.get("title") || "");
    const body = String(form.get("body") || "");
    const author = String(form.get("author") || "");
    const realIp = resolveClientIp(
        context.request.ip,
        getForwardedClientIp(context.request.headers),
        trustedProxyIps,
    );
    const authorFingerprint = await buildForumAuthorFingerprint(context.request.headers, realIp);
    const recaptchaToken = String(form.get("g-recaptcha-response") || "").trim();
    const bypassCaptcha = isLocalhostRequest(context.request.url, context.request.headers);

    if (!recaptchaToken && !bypassCaptcha) {
        context.response.redirect(`/forum/${encodeURIComponent(boardSlug)}?error=${encodeURIComponent("Please complete the reCAPTCHA check before submitting.")}`);
        return;
    }

    try {
        await verifyForumRecaptcha(recaptchaToken, {
            bypassCaptcha,
        });
    } catch (error) {
        context.response.redirect(
            `/forum/${encodeURIComponent(boardSlug)}?error=${encodeURIComponent(error instanceof Error ? error.message : "reCAPTCHA verification failed. Please try again.")}`,
        );
        return;
    }

    const moderation = await evaluateForumSubmission({
        author,
        authorFingerprint,
        title,
        body,
    });
    if (!moderation.ok) {
        context.response.redirect(`/forum/${encodeURIComponent(boardSlug)}?error=${encodeURIComponent(moderation.error)}`);
        return;
    }

    const result = await createForumThread({
        boardSlug,
        title,
        body,
        author,
        authorFingerprint,
    });

    if (!result.ok) {
        context.response.redirect(`/forum/${encodeURIComponent(boardSlug)}?error=${encodeURIComponent(result.error)}`);
        return;
    }

    context.response.redirect(`/forum/${encodeURIComponent(boardSlug)}/thread/${encodeURIComponent(result.thread.id)}`);
});
router.get("/forum/:board/thread/:threadId", async (context) => {
    const boardSlug = context.params.board;
    const threadId = context.params.threadId;

    if (!boardSlug || !threadId) {
        context.response.status = 404;
        context.response.body = "Thread not found";
        return;
    }

    const board = getForumBoardBySlug(boardSlug);
    if (!board) {
        context.response.status = 404;
        context.response.body = await injectRuntimeBootstrapForHtml(context, renderForumBoardNotFoundPage(boardSlug));
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
        return;
    }

    const errorMessage = context.request.url.searchParams.get("error") || undefined;
    context.response.body = await injectRuntimeBootstrapForHtml(
        context,
        await renderForumThreadPage({ board, threadId, errorMessage }),
    );
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.post("/forum/:board/thread/:threadId/reply", async (context) => {
    const boardSlug = context.params.board;
    const threadId = context.params.threadId;

    if (!boardSlug || !threadId) {
        context.response.status = 404;
        context.response.body = "Thread not found";
        return;
    }

    const board = getForumBoardBySlug(boardSlug);
    if (!board) {
        context.response.status = 404;
        context.response.body = "Board not found";
        return;
    }

    const form = await context.request.body.form();
    const body = String(form.get("body") || "");
    const author = String(form.get("author") || "");
    const realIp = resolveClientIp(
        context.request.ip,
        getForwardedClientIp(context.request.headers),
        trustedProxyIps,
    );
    const authorFingerprint = await buildForumAuthorFingerprint(context.request.headers, realIp);
    const recaptchaToken = String(form.get("g-recaptcha-response") || "").trim();
    const bypassCaptcha = isLocalhostRequest(context.request.url, context.request.headers);

    if (!recaptchaToken && !bypassCaptcha) {
        context.response.redirect(
            `/forum/${encodeURIComponent(boardSlug)}/thread/${encodeURIComponent(threadId)}?error=${encodeURIComponent("Please complete the reCAPTCHA check before submitting.")}`,
        );
        return;
    }

    try {
        await verifyForumRecaptcha(recaptchaToken, {
            bypassCaptcha,
        });
    } catch (error) {
        context.response.redirect(
            `/forum/${encodeURIComponent(boardSlug)}/thread/${encodeURIComponent(threadId)}?error=${encodeURIComponent(error instanceof Error ? error.message : "reCAPTCHA verification failed. Please try again.")}`,
        );
        return;
    }

    const moderation = await evaluateForumSubmission({
        author,
        authorFingerprint,
        body,
    });
    if (!moderation.ok) {
        context.response.redirect(
            `/forum/${encodeURIComponent(boardSlug)}/thread/${encodeURIComponent(threadId)}?error=${encodeURIComponent(moderation.error)}`,
        );
        return;
    }

    const result = await createForumReply({
        boardSlug,
        threadId,
        body,
        author,
        authorFingerprint,
    });

    if (!result.ok) {
        context.response.redirect(
            `/forum/${encodeURIComponent(boardSlug)}/thread/${encodeURIComponent(threadId)}?error=${encodeURIComponent(result.error)}`,
        );
        return;
    }

    context.response.redirect(`/forum/${encodeURIComponent(boardSlug)}/thread/${encodeURIComponent(threadId)}`);
});
for (const board of FORUM_BOARDS) {
    const target = `/forum/${board.slug}`;
    router.get(`/${board.slug}`, (context) => {
        context.response.redirect(target);
    });
    router.get(`/${board.slug}/`, (context) => {
        context.response.redirect(target);
    });
}
router.get("/blog", async (context) => {
    const blogPosts = await getBlogPosts();
    context.response.body = await injectRuntimeBootstrapForHtml(context, renderBlogIndexPage(blogPosts));
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.get("/blog/:slug", async (context) => {
    const slug = context.params.slug;

    if (!slug) {
        context.response.status = 404;
        context.response.body = renderBlogNotFoundPage("that slug");
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
        return;
    }

    const blogPosts = await getBlogPosts();
    const post = await getBlogPostBySlug(slug);

    if (!post) {
        context.response.status = 404;
        context.response.body = renderBlogNotFoundPage(slug);
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
        return;
    }

    context.response.body = await injectRuntimeBootstrapForHtml(context, renderBlogPostPage(post, blogPosts));
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.get("/careers", async (context) => {
    const jobs = await getJobPostings();
    context.response.body = await injectRuntimeBootstrapForHtml(context, renderCareersIndexPage(jobs));
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.get("/careers/success", async (context) => {
    const slug = context.request.url.searchParams.get("job") || "";
    const job = slug ? await getJobPostingBySlug(slug) : undefined;
    context.response.body = await injectRuntimeBootstrapForHtml(context, renderCareersSuccessPage(job));
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.get("/careers/:slug", async (context) => {
    const slug = context.params.slug;

    if (!slug) {
        context.response.status = 404;
        context.response.body = renderCareersNotFoundPage("that role");
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
        return;
    }

    const jobs = await getJobPostings();
    const job = jobs.find((candidate) => candidate.slug === slug);

    if (!job) {
        context.response.status = 404;
        context.response.body = renderCareersNotFoundPage(slug);
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
        return;
    }

    context.response.body = await injectRuntimeBootstrapForHtml(context, renderJobPostingPage(job, jobs));
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.post("/careers/:slug/apply", async (context) => {
    const slug = context.params.slug;

    if (!slug) {
        context.response.status = 404;
        context.response.body = renderCareersNotFoundPage("that role");
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
        return;
    }

    const jobs = await getJobPostings();
    const job = jobs.find((candidate) => candidate.slug === slug);

    if (!job) {
        context.response.status = 404;
        context.response.body = renderCareersNotFoundPage(slug);
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
        return;
    }

    try {
        let form: FormData;
        const contentType = context.request.headers.get("content-type") || "";

        if (contentType.includes("multipart/form-data")) {
            form = await context.request.body.formData();
        } else {
            const rawForm = await context.request.body.form();
            form = rawForm instanceof FormData
                ? rawForm
                : new FormData();

            if (!(rawForm instanceof FormData)) {
                for (const [key, value] of rawForm.entries()) {
                    form.append(key, value);
                }
            }
        }

        const result = await submitJobApplication(job, form, {
            bypassCaptcha: isLocalhostRequest(context.request.url, context.request.headers),
        });

        if (result.ok) {
            context.response.redirect(`/careers/success?job=${encodeURIComponent(job.slug)}`);
            return;
        }

        context.response.status = result.status;
        context.response.body = await injectRuntimeBootstrapForHtml(context, renderJobPostingPage(job, jobs, {
            errorMessage: result.message,
            values: result.values,
        }));
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    } catch (error) {
        console.error("Error processing application:", error);
        context.response.status = 500;
        context.response.body = await injectRuntimeBootstrapForHtml(context, renderJobPostingPage(job, jobs, {
            errorMessage: "We could not process your application. Please try again shortly or email office@gatewaycorporate.org directly.",
        }));
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    }
});
router.get("/products/:view", async (context) => {
    const view = context.params.view;
    if (view) {
        if (!allowedProductViews.has(view)) {
            context.response.status = 404;
            context.response.body = "View not found";
            return;
        }

        try {
            const viewHtml = Deno.readTextFileSync(`./static/products/${view}.html`);
            const rendered = injectFooterIntoHtml(
                viewHtml,
                resolveFooterVariant(view),
            );
            context.response.body = await injectRuntimeBootstrapForHtml(context, rendered);
            context.response.headers.set("Content-Type", "text/html; charset=utf-8");
        } catch (error) {
            console.error(`Error reading view file: ${error}`);
            context.response.status = 404;
            context.response.body = "View not found";
        }
    } else {
        context.response.status = 404;
        context.response.body = "View not provided";
    }
});
router.get("/papers/:paper.pdf", (context) => {
    const paper = context.params.paper;
    if (paper) {
        if (!allowedPapers.has(paper)) {
            context.response.status = 404;
            context.response.body = "Paper not found";
            return;
        }

        try {
            context.response.body = Deno.readFileSync(`./static/papers/${paper}.pdf`);
            context.response.headers.set("Content-Type", "application/pdf");
        } catch (error) {
            console.error(`Error reading paper file: ${error}`);
            context.response.status = 404;
            context.response.body = "Paper not found";
        }
    } else {
        context.response.status = 404;
        context.response.body = "Paper not provided";
    }
})
router.get("/mesh.obj", (context) => {
    try {
        context.response.body = Deno.readFileSync("./static/mesh.obj");
        context.response.headers.set("Content-Type", "text/plain; charset=utf-8");
        context.response.headers.set(
            "Cache-Control",
            isProduction ? "public, max-age=31536000, immutable" : "public, max-age=3600",
        );
    } catch (error) {
        console.error(`Error reading mesh file: ${error}`);
        context.response.status = 404;
        context.response.body = "Mesh not found";
    }
});

router.get("/api/devicer/snippet", async (context) => {
    context.response.headers.set("Content-Type", "application/javascript; charset=utf-8");

    if (!devicerSnippetKey) {
        context.response.status = 200;
        context.response.body = "/* Devicer snippet key not configured. */";
        return;
    }

    try {
        const upstream = await fetch(
            `https://nash.gatewaycorporate.org/api/devicer/snippet?key=${encodeURIComponent(devicerSnippetKey)}`,
        );

        if (!upstream.ok) {
            console.error("Devicer snippet proxy failed", upstream.status, upstream.statusText);
            context.response.status = 200;
            context.response.body = "/* Devicer snippet unavailable. */";
            return;
        }

        context.response.status = 200;
        context.response.body = await upstream.text();
        context.response.headers.set("Cache-Control", "private, max-age=600");
    } catch (error) {
        console.error("Devicer snippet proxy request failed", error);
        context.response.status = 200;
        context.response.body = "/* Devicer snippet unavailable. */";
    }
});

router.post('/contact', async (context) => {
  try {
    const form = await context.request.body.form();
    await handleUserRequest(form, {
        bypassCaptcha: isLocalhostRequest(context.request.url, context.request.headers),
    });
                context.response.redirect('/contact?contact=success');
  } catch (error) {
    console.error('Error processing request:', error);
        const reason = error instanceof Error ? error.message : "We could not send your message right now.";
                context.response.redirect(`/contact?contact=error&reason=${encodeURIComponent(reason)}`);
  }
});

router.get("/wss", async (context) => {
    try {
    if (!context.isUpgradable) {
        context.response.status = 426;
        context.response.body = "Upgrade Required";
        return;
    }

    const requestOrigin = resolveExternalOrigin(context.request.url, context.request.headers, configuredPublicOrigin);
    const originHeader = context.request.headers.get("origin");
    const isLocalDevOrigin = isLoopbackHost(context.request.headers.get("host")) || isLoopbackHost(context.request.url.host);

    if (!isLocalDevOrigin && !isOriginAllowed(originHeader, requestOrigin, configuredOrigins)) {
        context.response.status = 403;
        context.response.body = "Origin not allowed.";
        return;
    }

    const sessionId = await context.cookies.get(SESSION_COOKIE_NAME);
    const websocketToken = context.request.url.searchParams.get("token");
    if (!sessionStore.validateSession(sessionId, websocketToken)) {
        context.response.status = 403;
        context.response.body = "Invalid websocket session.";
        return;
    }

    const requestHeaders = Object.fromEntries(context.request.headers.entries());
    const realIp = resolveClientIp(
        context.request.ip,
        getForwardedClientIp(context.request.headers),
        trustedProxyIps,
    );

    if (!rateLimiter.tryOpenConnection(realIp)) {
        context.response.status = 429;
        context.response.body = "Too many websocket connections.";
        return;
    }

    let tlsProfile: unknown;
    try {
        tlsProfile = tlsDevicer.buildTlsProfile(requestHeaders);
    } catch (error) {
        if (isTlsComplexityError(error)) {
            console.warn("Skipping TLS profile for low-complexity input:", error instanceof Error ? error.message : error);
            tlsProfile = undefined;
        } else {
            console.warn("Skipping TLS profile due to parsing error:", error instanceof Error ? error.message : error);
            tlsProfile = undefined;
        }
    }
    const socket = await context.upgrade();
    let socketAnalyticsTimer: ReturnType<typeof setInterval> | undefined;

    const cleanupSocket = () => {
        if (socketAnalyticsTimer !== undefined) {
            clearInterval(socketAnalyticsTimer);
            socketAnalyticsTimer = undefined;
        }
        rateLimiter.releaseConnection(realIp);
    };

    socket.onopen = () => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(buildAnalyticsMessage(analytics));
        }

        socketAnalyticsTimer = setInterval(() => {
            if (socket.readyState !== WebSocket.OPEN) {
                cleanupSocket();
                return;
            }
            socket.send(buildAnalyticsMessage(analytics));
        }, 60_000);
    };

    socket.onclose = cleanupSocket;
    socket.onerror = () => {
        cleanupSocket();
    };

    socket.onmessage = async (event) => {
        fingerprintIngestStats.messagesReceived += 1;

        if (!rateLimiter.allowMessage(realIp)) {
            sendSocketJson(socket, {
                type: "error",
                data: "Too many websocket messages. Please retry later.",
            });
            socket.close(1008, "Rate limit exceeded");
            cleanupSocket();
            return;
        }

        const parsedMessage = parseClientMessage(event.data);
        if (!parsedMessage.ok) {
            sendSocketJson(socket, {
                type: "error",
                data: parsedMessage.clientMessage,
            });
            socket.close(parsedMessage.closeCode, parsedMessage.clientMessage);
            cleanupSocket();
            return;
        }

        try {
            const fingerprintData = parsedMessage.value.data;
            const hash = devicer.getHash(JSON.stringify(fingerprintData));
            const fingerprintCandidates = await devicerRuntime.adapters.device.findCandidates(fingerprintData, 50, 50);
            const exactMatchFound = fingerprintCandidates.some((fp: devicer.DeviceMatch) => fp.confidence >= 100);
            const closestMatch = Math.max(0, ...fingerprintCandidates.map((fp: devicer.DeviceMatch) => fp.confidence));
            const userId = sanitizeUserId(requestHeaders["x-user-id"]) ?? undefined;

            let identifyResult: Record<string, unknown>;
            try {
                identifyResult = await devicerRuntime.deviceManager.identify(fingerprintData, {
                    ip: realIp,
                    userId,
                    tlsProfile,
                    headers: requestHeaders,
                }) as unknown as Record<string, unknown>;
            } catch (error) {
                if (!isTlsComplexityError(error)) {
                    throw error;
                }

                console.warn("Retrying identify without TLS profile due to TLSH complexity error:", error instanceof Error ? error.message : error);
                try {
                    identifyResult = await devicerRuntime.deviceManager.identify(fingerprintData, {
                        ip: realIp,
                        userId,
                        headers: requestHeaders,
                    }) as unknown as Record<string, unknown>;
                } catch (retryError) {
                    if (!isTlsComplexityError(retryError)) {
                        throw retryError;
                    }

                    fingerprintIngestStats.tlshComplexityFallbacks += 1;
                    const fallbackDeviceId = `fallback-${hash.slice(0, 16)}`;

                    // Preserve accumulation even when TLSH-dependent enrichment is not usable.
                    await devicerRuntime.adapters.device.save({
                        id: crypto.randomUUID(),
                        deviceId: fallbackDeviceId,
                        fingerprint: fingerprintData,
                        timestamp: new Date(),
                    });

                    identifyResult = {
                        deviceId: fallbackDeviceId,
                        isNewDevice: true,
                    };
                }
            }

            const tlsConsistency = asRecord(identifyResult.tlsConsistency);
            const peerReputation = asRecord(identifyResult.peerReputation);
            const bbasEnrichment = asRecord(identifyResult.bbasEnrichment);
            const enrichmentInfo = asRecord(identifyResult.enrichmentInfo);
            const enrichmentDetails = asRecord(enrichmentInfo?.details);
            const ipDetails = asRecord(enrichmentDetails?.ip);
            const agentInfo = asRecord(ipDetails?.agentInfo);
            const uaClassification = asRecord(bbasEnrichment?.uaClassification);
            const peerConfidenceBoost = typeof identifyResult.peerConfidenceBoost === "number" ? identifyResult.peerConfidenceBoost : null;
            const bbasDecision = typeof identifyResult.bbasDecision === "string" ? identifyResult.bbasDecision : null;
            const country = typeof ipDetails?.country === "string" ? ipDetails.country : null;

            sendSocketJson(socket, {
                type: "fingerprint",
                data: {
                    hash,
                    exactMatchFound,
                    closestMatch: closestMatch || 0,
                    deviceId: typeof identifyResult.deviceId === "string" ? identifyResult.deviceId : null,
                    isNewDevice: identifyResult.isNewDevice === true,
                    ip: {
                        riskScore: typeof ipDetails?.riskScore === "number" ? ipDetails.riskScore : null,
                        isProxy: ipDetails?.isProxy === true,
                        isVpn: ipDetails?.isVpn === true,
                        isTor: ipDetails?.isTor === true,
                        isHosting: ipDetails?.isHosting === true,
                        isAiAgent: agentInfo?.isAiAgent === true,
                        aiAgentProvider: typeof agentInfo?.aiAgentProvider === "string" ? agentInfo.aiAgentProvider : null,
                        country,
                    },
                    tls: tlsConsistency ? {
                        consistencyScore: typeof tlsConsistency.consistencyScore === "number" ? tlsConsistency.consistencyScore : null,
                        ja4Match: typeof tlsConsistency.ja4Match === "boolean" ? tlsConsistency.ja4Match : null,
                        factors: asStringArray(tlsConsistency.factors),
                    } : null,
                    peer: peerReputation ? {
                        peerCount: typeof peerReputation.peerCount === "number" ? peerReputation.peerCount : 0,
                        taintScore: typeof peerReputation.taintScore === "number" ? peerReputation.taintScore : null,
                        trustScore: typeof peerReputation.trustScore === "number" ? peerReputation.trustScore : null,
                        confidenceBoost: peerConfidenceBoost,
                        factors: asStringArray(peerReputation.factors),
                    } : null,
                    bot: bbasEnrichment ? {
                        botScore: typeof bbasEnrichment.botScore === "number" ? bbasEnrichment.botScore : null,
                        decision: bbasDecision,
                        isHeadless: uaClassification?.isHeadless === true,
                        isBot: uaClassification?.isBot === true,
                        isCrawler: uaClassification?.isCrawler === true,
                        behavioralHumanScore: typeof asRecord(bbasEnrichment.behavioralSignals)?.humanScore === "number"
                            ? asRecord(bbasEnrichment.behavioralSignals)?.humanScore
                            : null,
                        factors: asStringArray(bbasEnrichment.botFactors),
                    } : null,
                },
            });

            if (["IN", "BD", "NG", "RO", "RU", "IR", "CN", "KP"].includes(country as string)) {
                sendSocketJson(socket, {
                    type: "blacklistAlert",
                    data: {
                        hash,
                        country,
                    },
                });
            }

            if (bbasDecision === "block" || bbasDecision === "challenge") {
                sendSocketJson(socket, {
                    type: "botAlert",
                    data: {
                        hash,
                        decision: bbasDecision,
                        botScore: typeof bbasEnrichment?.botScore === "number" ? bbasEnrichment.botScore : null,
                        factors: asStringArray(bbasEnrichment?.botFactors),
                    },
                });
            }

            fingerprintIngestStats.identifySucceeded += 1;
            // Keep admin analytics snapshot close to real time without
            // recomputing for every single websocket payload.
            void refreshFingerprintAnalyticsIfNeeded(devicerRuntime, 2_500);
        } catch (error) {
            fingerprintIngestStats.identifyFailed += 1;
            console.error("Error processing websocket payload:", error);
            sendSocketJson(socket, {
                type: "error",
                data: "Unable to process fingerprint payload.",
            });
        }
    };
    } catch (error) {
        console.error("Websocket upgrade handler failed:", error);
        if (!context.response.status || context.response.status < 400) {
            context.response.status = 503;
        }
        if (!context.response.body) {
            context.response.body = "Websocket unavailable";
        }
    }
});

router.post("/events/experiment", async (context) => {
    try {
        const payload = await context.request.body.json();
        const event = parseExperimentEventPayload(payload);

        if (!event) {
            context.response.status = 400;
            context.response.body = { ok: false, error: "Invalid event payload" };
            return;
        }

        await writeExperimentEvent(event);
        context.response.status = 202;
        context.response.body = { ok: true };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    } catch (error) {
        console.error("Experiment event ingestion failed", error);
        context.response.status = 502;
        context.response.body = { ok: false, error: "Event ingestion failed" };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    }
});

router.get("/experiments/guardrails", async (context) => {
    try {
        if (!isExperimentAdminAuthorized(context.request.headers, context.request.url.toString())) {
            context.response.status = 401;
            context.response.body = { ok: false, error: "Unauthorized" };
            context.response.headers.set("Content-Type", "application/json; charset=utf-8");
            return;
        }

        const daysParam = context.request.url.searchParams.get("days");
        const days = daysParam ? Math.max(1, Number(daysParam)) : 1;
        const summary = await generateGuardrailSummary(days);

        context.response.status = 200;
        context.response.body = summary;
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    } catch (error) {
        console.error("Failed to build guardrail summary", error);
        context.response.status = 500;
        context.response.body = { ok: false, error: "Guardrail summary failed" };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    }
});

router.get("/experiments/fingerprint-analytics", async (context) => {
    try {
        if (!isExperimentAdminAuthorized(context.request.headers, context.request.url.toString())) {
            context.response.status = 401;
            context.response.body = { ok: false, error: "Unauthorized" };
            context.response.headers.set("Content-Type", "application/json; charset=utf-8");
            return;
        }

        await refreshFingerprintAnalyticsIfNeeded(devicerRuntime, 0);

        context.response.status = 200;
        context.response.body = {
            ok: true,
            generatedAt: new Date().toISOString(),
            analyticsLastRefreshedAt: new Date(analyticsLastRefreshedAt).toISOString(),
            ingest: { ...fingerprintIngestStats },
            metrics: {
                totalFingerprints: analytics.fingerprints.length,
                uniqueFingerprints: analytics.uniques.length,
                clusters: analytics.clusters.length,
                averageClusterSize: analytics.clusters.length > 0
                    ? Math.floor((analytics.fingerprints.length - analytics.uniques.length) / analytics.clusters.length)
                    : 0,
            },
        };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    } catch (error) {
        console.error("Failed to return fingerprint analytics", error);
        context.response.status = 500;
        context.response.body = { ok: false, error: "Fingerprint analytics unavailable" };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    }
});

router.get("/experiments/debug-origin", (context) => {
    if (!isExperimentAdminAuthorized(context.request.headers, context.request.url.toString())) {
        context.response.status = 401;
        context.response.body = { ok: false, error: "Unauthorized" };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
        return;
    }

    const externalOrigin = resolveExternalOrigin(context.request.url, context.request.headers, configuredPublicOrigin);
    context.response.status = 200;
    context.response.body = {
        ok: true,
        configuredPublicOrigin,
        requestUrl: context.request.url.toString(),
        hostHeader: context.request.headers.get("host"),
        xForwardedProto: context.request.headers.get("x-forwarded-proto"),
        xForwardedHost: context.request.headers.get("x-forwarded-host"),
        resolvedOrigin: externalOrigin.toString(),
        secure: isExternalOriginSecure(externalOrigin),
    };
    context.response.headers.set("Content-Type", "application/json; charset=utf-8");
});

router.get("/experiments/dashboard", async (context) => {
    try {
        if (!isExperimentAdminAuthorized(context.request.headers, context.request.url.toString())) {
            context.response.status = 401;
            context.response.body = "Unauthorized";
            context.response.headers.set("Content-Type", "text/plain; charset=utf-8");
            return;
        }

        await refreshFingerprintAnalyticsIfNeeded(devicerRuntime, 0);

        const daysParam = context.request.url.searchParams.get("days");
        const days = daysParam ? Math.max(1, Number(daysParam)) : 7;
        const summary = await generateGuardrailSummary(days);

        context.response.status = 200;
        context.response.body = renderGuardrailsDashboardHtml(summary);
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    } catch (error) {
        console.error("Failed to render guardrails dashboard", error);
        context.response.status = 500;
        context.response.body = "Dashboard unavailable";
        context.response.headers.set("Content-Type", "text/plain; charset=utf-8");
    }
});

router.post("/experiments/guardrails/evaluate", async (context) => {
    try {
        if (!isExperimentAdminAuthorized(context.request.headers, context.request.url.toString())) {
            context.response.status = 401;
            context.response.body = { ok: false, error: "Unauthorized" };
            context.response.headers.set("Content-Type", "application/json; charset=utf-8");
            return;
        }

        const payload = await context.request.body.json().catch(() => ({}));
        const lookbackDays =
            payload && typeof payload === "object" && "days" in payload && Number.isFinite(Number((payload as Record<string, unknown>).days))
                ? Math.max(1, Number((payload as Record<string, unknown>).days))
                : 1;

        const result = await evaluateAndOptionallyDisableExperiments(lookbackDays);

        context.response.status = 200;
        context.response.body = result;
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    } catch (error) {
        console.error("Failed to evaluate guardrails", error);
        context.response.status = 500;
        context.response.body = { ok: false, error: "Guardrail evaluation failed" };
        context.response.headers.set("Content-Type", "application/json; charset=utf-8");
    }
});

app.use(async (context, next) => {
    const externalOrigin = resolveExternalOrigin(context.request.url, context.request.headers, configuredPublicOrigin);
    await next();

    applySecurityHeaders(context.response.headers, isExternalOriginSecure(externalOrigin));
    context.response.headers.set("Content-Security-Policy", [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://nash.gatewaycorporate.org",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://www.google.com https://www.gstatic.com https://nash.gatewaycorporate.org",
        "frame-src https://www.google.com https://www.gstatic.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join("; "));

    if (!isProduction) {
        context.response.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
        return;
    }

    if (!context.response.headers.has("Cache-Control")) {
        const path = context.request.url.pathname;
        if (/\.(?:css|js|png|jpg|jpeg|svg|webp|ico|pdf|obj)$/i.test(path)) {
            context.response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
        } else if (path.endsWith(".xml")) {
            context.response.headers.set("Cache-Control", "public, max-age=3600");
        } else {
            context.response.headers.set("Cache-Control", "public, max-age=300");
        }
    }
});

app.use(router.routes());
app.use(router.allowedMethods());
app.use(async (context, next) => {
    const root = "./static";
    try { await context.send({ root }); } catch { await next(); }
});

app.listen({ port });
console.log(`Server is running on http://localhost:${port}`);