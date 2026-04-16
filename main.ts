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
import { injectFooterIntoHtml, resolveFooterVariant } from "./footer.ts";

const router = new Router();
const app = new Application();
const port = parseInt(Deno.env.get("PORT") || "8000");

async function renderHomePage(
    context: { response: { body: unknown; headers: Headers } },
) {
    const homepageTemplate = await Deno.readTextFile("./static/views/index.html");
    const blogPosts = await getBlogPosts();

    context.response.body = injectFooterIntoHtml(
        homepageTemplate.replace(
            "{{BLOG_SECTION}}",
            renderHomepageBlogSection(blogPosts),
        ),
        resolveFooterVariant("index"),
    );
    context.response.headers.set("Content-Type", "text/html; charset=utf-8");
}

router.get("/", async (context) => {
    await renderHomePage(context);
});
router.get("/index.html", async (context) => {
    await renderHomePage(context);
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
router.get("/:view.html", (context) => {
    const view = context.params.view;
    if (view) {
        try {
            const viewHtml = Deno.readTextFileSync(`./static/views/${view}.html`);
            context.response.body = injectFooterIntoHtml(
                viewHtml,
                resolveFooterVariant(view),
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
router.post('/contact', async (context) => {
  try {
    const form = await context.request.body.form();
    await handleUserRequest(form);
    context.response.redirect('/');
  } catch (error) {
    console.error('Error processing request:', error);
        context.response.status = 502;
        context.response.body = error instanceof Error
            ? error.message
            : 'We could not send your message right now. Please try again shortly or email office@gatewaycorporate.org directly.';
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