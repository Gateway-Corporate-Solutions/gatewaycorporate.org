import { Application, Router } from "oak";
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

const router = new Router();
const app = new Application();
const port = parseInt(Deno.env.get("PORT") || "8000");
const siteOrigin = "https://gatewaycorporate.org";
const isProduction = Deno.env.get("DENO_ENV") === "production";

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
        const rows = summary.metrics
                .map((metric) => {
                        const rate = `${(metric.conversionRate * 100).toFixed(2)}%`;
                        return `<tr>
    <td>${escapeHtml(metric.experimentId)}</td>
    <td>${escapeHtml(metric.variant)}</td>
    <td>${metric.exposures}</td>
    <td>${metric.contactSubmits}</td>
    <td>${rate}</td>
</tr>`;
                })
                .join("\n");

        const content = rows || `<tr><td colspan="5">No experiment events available for this time range.</td></tr>`;

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
        <div class="panel">
            <table>
                <thead>
                    <tr>
                        <th>Experiment</th>
                        <th>Variant</th>
                        <th>Exposures</th>
                        <th>Contact Submits</th>
                        <th>Conversion Rate</th>
                    </tr>
                </thead>
                <tbody>
                    ${content}
                </tbody>
            </table>
        </div>
    </body>
</html>`;
}

function injectExperimentBootstrap(html: string, request: Request): string {
    const { scriptTag } = buildExperimentContext({
        cookieHeader: request.headers.get("cookie"),
        sessionHeader: request.headers.get("x-gcx-session"),
    }, isProduction);

    if (html.includes("</head>")) {
        return html.replace("</head>", `${scriptTag}\n  </head>`);
    }

    return `${scriptTag}${html}`;
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
    context: { response: { body: unknown; headers: Headers } },
    requestHeaders: Headers,
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

    context.response.body = injectExperimentBootstrap(
        rendered,
        new Request("http://localhost/", { headers: requestHeaders }),
    );
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
    await renderHomePage(context, context.request.headers);
});
router.get("/index.html", async (context) => {
    await renderHomePage(context, context.request.headers);
});
router.get("/services", (context) => {
    try {
        const servicesHtml = Deno.readTextFileSync("./static/views/services.html");
        const rendered = injectFooterIntoHtml(
            servicesHtml,
            resolveFooterVariant("index"),
        );
        context.response.body = injectExperimentBootstrap(
            rendered,
            new Request("http://localhost/services", { headers: context.request.headers }),
        );
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    } catch (error) {
        console.error(`Error reading services view file: ${error}`);
        context.response.status = 404;
        context.response.body = "Services page not found";
    }
});
router.get("/products", (context) => {
    try {
        const productsHtml = Deno.readTextFileSync("./static/views/products.html");
        const rendered = injectFooterIntoHtml(
            productsHtml,
            resolveFooterVariant("index"),
        );
        context.response.body = injectExperimentBootstrap(
            rendered,
            new Request("http://localhost/products", { headers: context.request.headers }),
        );
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    } catch (error) {
        console.error(`Error reading products view file: ${error}`);
        context.response.status = 404;
        context.response.body = "Products page not found";
    }
});
router.get("/blog", async (context) => {
    const blogPosts = await getBlogPosts();
    context.response.body = renderBlogIndexPage(blogPosts);
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

    context.response.body = renderBlogPostPage(post, blogPosts);
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.get("/careers", async (context) => {
    const jobs = await getJobPostings();
    context.response.body = renderCareersIndexPage(jobs);
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
});
router.get("/careers/success", async (context) => {
    const slug = context.request.url.searchParams.get("job") || "";
    const job = slug ? await getJobPostingBySlug(slug) : undefined;
    context.response.body = renderCareersSuccessPage(job);
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

    context.response.body = renderJobPostingPage(job, jobs);
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
        context.response.body = renderJobPostingPage(job, jobs, {
            errorMessage: result.message,
            values: result.values,
        });
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    } catch (error) {
        console.error("Error processing application:", error);
        context.response.status = 500;
        context.response.body = renderJobPostingPage(job, jobs, {
            errorMessage: "We could not process your application. Please try again shortly or email office@gatewaycorporate.org directly.",
        });
        context.response.headers.set("Content-Type", "text/html; charset=utf-8");
    }
});
router.get("/products/:view", (context) => {
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
            context.response.body = injectExperimentBootstrap(
                rendered,
                new Request(`http://localhost/products/${encodeURIComponent(view)}`, {
                    headers: context.request.headers,
                }),
            );
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

router.get("/experiments/dashboard", async (context) => {
    try {
        if (!isExperimentAdminAuthorized(context.request.headers, context.request.url.toString())) {
            context.response.status = 401;
            context.response.body = "Unauthorized";
            context.response.headers.set("Content-Type", "text/plain; charset=utf-8");
            return;
        }

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
    context.response.headers.set("X-Content-Type-Options", "nosniff");
    context.response.headers.set("X-Frame-Options", "DENY");
    context.response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    context.response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    context.response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
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

    await next();

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