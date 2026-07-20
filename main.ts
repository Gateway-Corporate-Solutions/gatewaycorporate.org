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
import { submitJobApplication } from "./applications.ts";
import { handleUserRequest } from "./contact.ts";
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
const sessionStore = new SessionStore();
const rateLimiter = new RateLimiter();

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

let analyticsRefreshTimer: number | undefined;
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
    <td>${rate}</td>
</tr>`;
                })
                .join("\n");

        const content = rows || `<tr><td colspan="6">No experiment events available for this time range.</td></tr>`;

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
                emptyState.innerHTML = '<td class="table-empty" colspan="6">No rows match the selected filters.</td>';

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
                        conversion: toNumber(cells[5]?.textContent || "0"),
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

function injectExperimentBootstrap(html: string, request: Request): string {
    const { scriptTag } = buildExperimentContext({
        cookieHeader: request.headers.get("cookie"),
        sessionHeader: request.headers.get("x-gcx-session"),
    }, isProduction);

    const devicerSnippetKey = (Deno.env.get("DEVICER_LICENSE_KEY") || "").trim();
    const devicerBootstrap = devicerSnippetKey
        ? `<script>window.__GCX__ = window.__GCX__ || {}; window.__GCX__.devicerSnippetKey = ${JSON.stringify(devicerSnippetKey)};</script>`
        : "";
    const bootstrapScripts = `${scriptTag}${devicerBootstrap}`;

    if (html.includes("</head>")) {
        return html.replace("</head>", `${bootstrapScripts}\n  </head>`);
    }

    return `${bootstrapScripts}${html}`;
}

async function injectRuntimeBootstrapForHtml(context: {
    request: { headers: Headers; url: URL };
    cookies: { get(name: string): Promise<string | undefined> };
    response: { headers: Headers };
}, html: string): Promise<string> {
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

    return injectExperimentBootstrap(
        injectSessionToken(html, session.token),
        new Request(context.request.url.toString(), { headers: context.request.headers }),
    );
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

async function renderHomePage(
    context: {
        request: { headers: Headers; url: URL };
        cookies: { get(name: string): Promise<string | undefined> };
        response: { body: unknown; headers: Headers };
    },
) {
    const homepageTemplate = await Deno.readTextFile("./static/views/index.html");
    const blogPosts = await getBlogPosts();

    const rendered = injectFooterIntoHtml(
        homepageTemplate.replace(
            "{{BLOG_SECTION}}",
            renderHomepageBlogSection(blogPosts),
        ),
        resolveFooterVariant("index"),
    );

    context.response.body = await injectRuntimeBootstrapForHtml(context, rendered);
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
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
                loc: `${siteOrigin}/services`,
                lastmod: await getSitemapLastModified("./static/views/services.html", today),
                priority: 0.9,
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

router.get("/", async (context) => {
    await renderHomePage(context);
});
router.get("/index.html", async (context) => {
    await renderHomePage(context);
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

        const result = await submitJobApplication(job, form);

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
    } catch (error) {
        console.error(`Error reading mesh file: ${error}`);
        context.response.status = 404;
        context.response.body = "Mesh not found";
    }
});
router.post('/contact', async (context) => {
  try {
    const form = await context.request.body.form();
    await handleUserRequest(form);
    context.response.redirect('/?contact=success');
  } catch (error) {
    console.error('Error processing request:', error);
    context.response.redirect('/?contact=error');
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
        context.request.headers.get("X-Real-IP"),
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
    let socketAnalyticsTimer: number | undefined;

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
        context.response.headers.set("Cache-Control", "no-store, max-age=0");
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