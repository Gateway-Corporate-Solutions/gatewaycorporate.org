# Deno Minimal Webserver

This repo is for demonstrating a minimal static web server with Deno and oak.

You can run the project using `deno task start`

## Markdown blog

The site now includes a markdown-powered blog system.

- Add posts in `content/blog/*.md`
- Use YAML-style front matter with `title`, `slug`, `date`, `author`, `excerpt`, and `tags`
- Visit `/blog` for the archive and `/blog/<slug>` for individual posts
- The homepage automatically renders the latest posts into the blog section