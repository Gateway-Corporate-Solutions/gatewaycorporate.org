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

## Shared footer

The site footer is rendered from `footer.ts` for both blog pages and static HTML views.

- Update footer content and per-page footer link groups in `footer.ts`
- Do not reintroduce literal `<footer class="footer">` blocks in `static/views/*.html`
