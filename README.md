# Deno Minimal Webserver

This repo is for demonstrating a minimal static web server with Deno and oak.

You can run the project using `deno task start`

## Markdown blog

The site now includes a markdown-powered blog system.

- Add posts in `content/blog/*.md`
- Use YAML-style front matter with `title`, `slug`, `date`, `author`, `excerpt`, and `tags`
- If a title begins with a quote, wrap the entire YAML value in the other quote style, for example `title: '"Quoted title" and the rest'`
- Visit `/blog` for the archive and `/blog/<slug>` for individual posts
- The homepage automatically renders the latest posts into the blog section

## Careers

The site also supports a markdown-powered careers section with direct email applications.

- Add open roles in `content/jobs/*.md`
- Use YAML-style front matter with `title`, `slug`, `date`, `excerpt`, `department`, `location`, `employmentType`, and `status`
- Visit `/careers` for the index and `/careers/<slug>` for the individual role page
- Applicants submit a shared questionnaire and a PDF resume from the role page
- Successful applications are emailed to `office@gatewaycorporate.org` through the configured mail provider
- Required environment variables for application delivery: `RESEND_API_KEY`, `CAREERS_EMAIL_FROM`, and `RECAPTCHA_SECRET_KEY`
- Optional environment variable: `CAREERS_EMAIL_TO` to override the default inbox

## Shared footer

The site footer is rendered from `footer.ts` for both blog pages and static HTML views.

- Update footer content and per-page footer link groups in `footer.ts`
- Do not reintroduce literal `<footer class="footer">` blocks in `static/views/*.html`
