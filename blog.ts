import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { renderSiteFooter } from "./footer.ts";

const BLOG_DIR = new URL("./content/blog/", import.meta.url);
const SITE_URL = "https://gatewaycorporate.org";
const DEFAULT_SOCIAL_IMAGE = `${SITE_URL}/embed.png`;

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  author: string;
  tags: string[];
  html: string;
  readingTime: number;
  imageUrl: string;
}

interface FrontMatter {
  title?: string;
  slug?: string;
  date?: string;
  excerpt?: string;
  author?: string;
  tags?: string[];
}

interface ImageDimensions {
  width: number;
  height: number;
}

const imageDimensionsCache = new Map<string, Promise<ImageDimensions | undefined>>();

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

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

    if (typeof value === "string") {
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
        case "author":
          metadata.author = value;
          break;
        default:
          break;
      }
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

function estimateReadingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
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

function extractFirstImageUrl(html: string): string {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!match) {
    return DEFAULT_SOCIAL_IMAGE;
  }

  return absoluteUrl(match[1]);
}

function resolveStaticImagePath(source: string): string | undefined {
  if (/^[a-z]+:/i.test(source) || source.startsWith("//")) {
    return undefined;
  }

  const [pathWithoutQuery] = source.split(/[?#]/, 1);

  if (!pathWithoutQuery) {
    return undefined;
  }

  const decodedPath = decodeURIComponent(pathWithoutQuery);
  if (decodedPath.includes("..")) {
    return undefined;
  }

  if (decodedPath.startsWith("/")) {
    return `./static${decodedPath}`;
  }

  return `./static/${decodedPath.replace(/^\.?\//, "")}`;
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !pngSignature.every((value, index) => bytes[index] === value)) {
    return undefined;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }

  let offset = 2;
  while (offset + 8 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
      break;
    }

    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame && offset + 9 <= bytes.length) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }

    offset += 2 + segmentLength;
  }

  return undefined;
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (
    bytes.length < 30 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  ) {
    return undefined;
  }

  const chunkType = String.fromCharCode(...bytes.slice(12, 16));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (chunkType === "VP8 ") {
    if (bytes.length < 30) {
      return undefined;
    }

    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }

  if (chunkType === "VP8L") {
    if (bytes.length < 25 || bytes[20] !== 0x2f) {
      return undefined;
    }

    const value =
      bytes[21] |
      (bytes[22] << 8) |
      (bytes[23] << 16) |
      (bytes[24] << 24);

    return {
      width: (value & 0x3fff) + 1,
      height: ((value >> 14) & 0x3fff) + 1,
    };
  }

  if (chunkType === "VP8X") {
    if (bytes.length < 30) {
      return undefined;
    }

    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }

  return undefined;
}

function readImageDimensions(bytes: Uint8Array, path: string): ImageDimensions | undefined {
  const normalizedPath = path.toLowerCase();

  if (normalizedPath.endsWith(".png")) {
    return readPngDimensions(bytes);
  }

  if (normalizedPath.endsWith(".jpg") || normalizedPath.endsWith(".jpeg")) {
    return readJpegDimensions(bytes);
  }

  if (normalizedPath.endsWith(".webp")) {
    return readWebpDimensions(bytes);
  }

  return undefined;
}

async function getImageDimensions(source: string): Promise<ImageDimensions | undefined> {
  const staticPath = resolveStaticImagePath(source);
  if (!staticPath) {
    return undefined;
  }

  const cached = imageDimensionsCache.get(staticPath);
  if (cached) {
    return cached;
  }

  const dimensionsPromise = (async () => {
    try {
      const bytes = await Deno.readFile(staticPath);
      return readImageDimensions(bytes, staticPath);
    } catch {
      return undefined;
    }
  })();

  imageDimensionsCache.set(staticPath, dimensionsPromise);
  return dimensionsPromise;
}

async function optimizeBlogImages(html: string): Promise<string> {
  const matches = [...html.matchAll(/<img\b[^>]*>/gi)];
  if (!matches.length) {
    return html;
  }

  const replacements = await Promise.all(matches.map(async (match) => {
    const tag = match[0];
    const sourceMatch = tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i);
    if (!sourceMatch) {
      return tag;
    }

    const dimensions = await getImageDimensions(sourceMatch[1]);
    const extraAttributes: string[] = [];

    if (dimensions && !/\swidth\s*=\s*["'][^"']+["']/i.test(tag)) {
      extraAttributes.push(`width="${dimensions.width}"`);
    }

    if (dimensions && !/\sheight\s*=\s*["'][^"']+["']/i.test(tag)) {
      extraAttributes.push(`height="${dimensions.height}"`);
    }

    if (!/\sloading\s*=\s*["'][^"']+["']/i.test(tag)) {
      extraAttributes.push('loading="lazy"');
    }

    if (!/\sdecoding\s*=\s*["'][^"']+["']/i.test(tag)) {
      extraAttributes.push('decoding="async"');
    }

    if (!extraAttributes.length) {
      return tag;
    }

    return tag.replace(/\s*\/?>$/, ` ${extraAttributes.join(" ")}$&`);
  }));

  let nextHtml = "";
  let lastIndex = 0;

  for (const [index, match] of matches.entries()) {
    const start = match.index ?? 0;
    const original = match[0];
    nextHtml += html.slice(lastIndex, start);
    nextHtml += replacements[index];
    lastIndex = start + original.length;
  }

  nextHtml += html.slice(lastIndex);
  return nextHtml;
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

function renderPostCard(post: BlogPost): string {
  return `
    <article class="card card-primary blog-card">
      <div class="card-header blog-card-header">
        <p class="blog-card-meta">${escapeHtml(formatDate(post.date))} <span aria-hidden="true">•</span> ${post.readingTime} min read</p>
        <h3 class="card-title blog-card-title">${escapeHtml(post.title)}</h3>
      </div>
      <div class="card-body">
        <p class="card-text">${escapeHtml(post.excerpt)}</p>
        ${renderTags(post.tags)}
      </div>
      <div class="card-footer blog-card-footer">
        <a href="/blog/${encodeURIComponent(post.slug)}" class="btn btn-primary btn-sm">Read article</a>
      </div>
    </article>
  `;
}

function renderPageShell(options: {
  title: string;
  description: string;
  heroTitle: string;
  heroSubtitle: string;
  content: string;
  canonicalUrl: string;
  imageUrl: string;
  ogType?: "website" | "article";
  publishedTime?: string;
  tags?: string[];
  jsonLd?: Record<string, unknown>;
  noindex?: boolean;
}): string {
  const ogType = options.ogType || "website";
  const publishedTime = options.publishedTime
    ? `\n    <meta property="article:published_time" content="${escapeHtml(options.publishedTime)}">`
    : "";
  const articleTags = options.tags?.length
    ? `\n    ${options.tags.map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}">`).join("\n    ")}`
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
    <meta property="og:type" content="${ogType}">
    <meta property="og:site_name" content="Gateway Corporate">
    <meta property="og:title" content="${escapeHtml(options.title)}">
    <meta property="og:description" content="${escapeHtml(options.description)}">
    <meta property="og:url" content="${escapeHtml(options.canonicalUrl)}">
    <meta property="og:image" content="${escapeHtml(options.imageUrl)}">
    <meta property="og:image:alt" content="${escapeHtml(options.title)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(options.title)}">
    <meta name="twitter:description" content="${escapeHtml(options.description)}">
    <meta name="twitter:image" content="${escapeHtml(options.imageUrl)}">${publishedTime}${articleTags}${jsonLdScript}${robotsMeta}
    <link rel="stylesheet" href="/components.css">
    <link rel="stylesheet" href="/enhancements.css">
    <script src="/bundle.js" defer></script>
    <script src="/index.js" defer></script>
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
  </head>
  <body class="blog-page">
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
          <p class="eyebrow">Gateway Corporate Journal</p>
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
            <li><a href="/" class="nav-link">Home</a></li>
            <li><a href="/careers" class="nav-link">Careers</a></li>
            <li><a href="/blog" class="nav-link">Blog</a></li>
            <li><a href="/#projects" class="nav-link">Projects</a></li>
            <li><a href="/#contact" class="nav-link">Contact</a></li>
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

export async function getBlogPosts(): Promise<BlogPost[]> {
  const posts: BlogPost[] = [];

  for await (const entry of Deno.readDir(BLOG_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".md")) {
      continue;
    }

    const fileUrl = new URL(entry.name, BLOG_DIR);
    const raw = await Deno.readTextFile(fileUrl);
    const { metadata, body } = parseFrontMatter(raw);
    const title = metadata.title?.trim() || entry.name.replace(/\.md$/, "");
    const slug = slugify(metadata.slug?.trim() || title);
    const date = metadata.date?.trim() || new Date().toISOString().slice(0, 10);
    const excerpt = buildExcerpt(body, metadata.excerpt);
    const author = metadata.author?.trim() || "Gateway Corporate Team";
    const tags = metadata.tags || [];
    const html = await optimizeBlogImages(sanitizeRenderedHtml(marked.parse(body) as string));

    posts.push({
      slug,
      title,
      date,
      excerpt,
      author,
      tags,
      html,
      readingTime: estimateReadingTime(stripHtml(html)),
      imageUrl: extractFirstImageUrl(html),
    });
  }

  posts.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  return posts;
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const posts = await getBlogPosts();
  return posts.find((post) => post.slug === slug);
}

export function renderHomepageBlogSection(posts: BlogPost[]): string {
  const featuredPosts = posts.slice(0, 3);

  return `
    <section id="blog" class="section">
      <div class="section-header">
        <p class="eyebrow">Gateway Corporate Journal</p>
        <h2 class="section-title">What we are seeing, shipping, and learning</h2>
        <p class="text-lead blog-home-intro">
          Notes from client work, AI operations, and product strategy written directly from the team building it.
        </p>
      </div>
      <div class="blog-home-actions">
        <a href="/blog" class="btn btn-primary">Visit the blog</a>
      </div>
      <div class="grid blog-grid gap-lg card-grid">
        ${featuredPosts.map((post) => renderPostCard(post)).join("")}
      </div>
    </section>
  `;
}

export function renderBlogIndexPage(posts: BlogPost[]): string {
  const postMarkup = posts.length
    ? `<div class="grid blog-grid gap-lg card-grid">${posts.map((post) => renderPostCard(post)).join("")}</div>`
    : `<div class="card card-primary blog-empty"><p class="card-text">No articles are published yet. Add markdown files to content/blog to populate the journal.</p></div>`;

  return renderPageShell({
    title: "Gateway Corporate Journal | Gateway Corporate",
    description: "Strategy, software, and AI field notes from Gateway Corporate.",
    heroTitle: "Gateway Corporate Journal",
    heroSubtitle: "Markdown-powered publishing for practical software, AI, and growth work.",
    canonicalUrl: absoluteUrl("/blog"),
    imageUrl: DEFAULT_SOCIAL_IMAGE,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      "name": "Gateway Corporate Journal",
      "url": absoluteUrl("/blog"),
      "description": "Strategy, software, and AI field notes from Gateway Corporate.",
      "publisher": {
        "@type": "Organization",
        "name": "Gateway Corporate",
        "url": SITE_URL,
      },
    },
    content: `
      <section class="section section-tight">
        <div class="section-header">
          <h2 class="section-title">Recent articles</h2>
          <p class="text-lead">Read the latest insights and updates from our team.</p>
        </div>
        ${postMarkup}
      </section>
    `,
  });
}

export function renderBlogPostPage(post: BlogPost, allPosts: BlogPost[]): string {
  const relatedPosts = allPosts.filter((candidate) => candidate.slug !== post.slug).slice(0, 3);
  const relatedMarkup = relatedPosts.length
    ? `<section class="section section-tight">
        <div class="section-header">
          <h2 class="section-title">More from the journal</h2>
        </div>
        <div class="grid blog-grid gap-lg card-grid">${relatedPosts.map((candidate) => renderPostCard(candidate)).join("")}</div>
      </section>`
    : "";

  return renderPageShell({
    title: `${post.title} | Gateway Corporate Journal`,
    description: post.excerpt,
    heroTitle: post.title,
    heroSubtitle: `${formatDate(post.date)} • ${post.readingTime} min read • ${post.author}`,
    canonicalUrl: absoluteUrl(`/blog/${post.slug}`),
    imageUrl: post.imageUrl,
    ogType: "article",
    publishedTime: new Date(post.date).toISOString(),
    tags: post.tags,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": post.title,
      "description": post.excerpt,
      "datePublished": new Date(post.date).toISOString(),
      "author": {
        "@type": "Organization",
        "name": post.author,
        "url": SITE_URL,
      },
      "publisher": {
        "@type": "Organization",
        "name": "Gateway Corporate",
        "url": SITE_URL,
      },
      "url": absoluteUrl(`/blog/${post.slug}`),
      "image": post.imageUrl,
      "keywords": post.tags.join(", "),
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": absoluteUrl(`/blog/${post.slug}`),
      },
    },
    content: `
      <section class="section section-tight article-shell">
        <article class="card card-primary article-card">
          <div class="article-header">
            <p class="article-kicker">By ${escapeHtml(post.author)}</p>
            ${renderTags(post.tags)}
          </div>
          <div class="prose">${post.html}</div>
          <div class="article-nav">
            <a href="/blog" class="btn btn-secondary btn-sm">Back to blog</a>
            <a href="/#contact" class="btn btn-primary btn-sm">Talk to Gateway Corporate</a>
          </div>
        </article>
      </section>
      ${relatedMarkup}
    `,
  });
}

export function renderBlogNotFoundPage(slug: string): string {
  return renderPageShell({
    title: "Article not found | Gateway Corporate Journal",
    description: "The requested article could not be found.",
    heroTitle: "Article not found",
    heroSubtitle: `No published post matched ${slug}.`,
    canonicalUrl: absoluteUrl(`/blog/${slug}`),
    imageUrl: DEFAULT_SOCIAL_IMAGE,
    content: `
      <section class="section section-tight">
        <div class="card card-primary blog-empty">
          <p class="card-text">The article you requested is not available. Browse the journal to see current posts.</p>
          <div class="blog-home-actions">
            <a href="/blog" class="btn btn-primary">View the blog</a>
          </div>
        </div>
      </section>
    `,
  });
}