import { renderSiteFooter } from "./footer.ts";

const SITE_URL = "https://gatewaycorporate.org";
const FORUM_DATA_DIR = "./content/forum";

export interface ForumBoardDefinition {
  slug: string;
  path: string;
  name: string;
  description: string;
}

export interface ForumReply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface ForumThread {
  id: string;
  boardSlug: string;
  title: string;
  author: string;
  body: string;
  createdAt: string;
  replies: ForumReply[];
}

export interface ForumBoardSummary {
  board: ForumBoardDefinition;
  threadCount: number;
  replyCount: number;
  lastActivityAt?: string;
}

interface ForumBoardDataFile {
  threads: ForumThread[];
}

export const FORUM_BOARDS: ForumBoardDefinition[] = [
  {
    slug: "mlops",
    path: "/mlops/",
    name: "AI/ML Operations",
    description: "Model deployment, monitoring, eval pipelines, and governance in production.",
  },
  {
    slug: "signals",
    path: "/signals/",
    name: "Signals Intelligence",
    description: "Collection quality, attribution confidence, counter-fingerprinting, and field methods.",
  },
  {
    slug: "twins",
    path: "/twins/",
    name: "Digital Twin Strategy",
    description: "Simulation design, incentive modeling, and operating decision systems.",
  },
  {
    slug: "security",
    path: "/security/",
    name: "Cybersecurity and Identity",
    description: "Risk scoring, abuse prevention, anti-fraud operations, and hardening practices.",
  },
  {
    slug: "etc",
    path: "/etc/",
    name: "Other",
    description: "Cross-discipline discussion, experiments, and everything that does not fit elsewhere.",
  },
];

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

function boardFilePath(boardSlug: string): string {
  return `${FORUM_DATA_DIR}/${boardSlug}.json`;
}

function getThreadLastActivity(thread: ForumThread): string {
  const latestReply = thread.replies.at(-1)?.createdAt;
  return latestReply || thread.createdAt;
}

function sortThreadsByActivity(threads: ForumThread[]): ForumThread[] {
  return [...threads].sort((left, right) => {
    return new Date(getThreadLastActivity(right)).getTime() - new Date(getThreadLastActivity(left)).getTime();
  });
}

function sanitizeMultiline(value: string, maxLength: number): string {
  const normalized = value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\0", "")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength).trim();
}

function asPositiveInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

async function ensureForumDataDir(): Promise<void> {
  await Deno.mkdir(FORUM_DATA_DIR, { recursive: true });
}

export function getForumBoardBySlug(slug: string): ForumBoardDefinition | undefined {
  return FORUM_BOARDS.find((board) => board.slug === slug);
}

async function readBoardData(boardSlug: string): Promise<ForumBoardDataFile> {
  await ensureForumDataDir();

  const filePath = boardFilePath(boardSlug);
  try {
    const raw = await Deno.readTextFile(filePath);
    const parsed = JSON.parse(raw) as ForumBoardDataFile;

    if (!parsed || !Array.isArray(parsed.threads)) {
      return { threads: [] };
    }

    const threads = parsed.threads
      .filter((thread) => !!thread && typeof thread === "object")
      .map((thread) => {
        const typed = thread as ForumThread;
        const replies = Array.isArray(typed.replies)
          ? typed.replies
            .filter((reply) => !!reply && typeof reply === "object")
            .map((reply) => {
              const typedReply = reply as ForumReply;
              return {
                id: String(typedReply.id || crypto.randomUUID()),
                author: sanitizeMultiline(String(typedReply.author || "Anonymous"), 42) || "Anonymous",
                body: sanitizeMultiline(String(typedReply.body || ""), 4000),
                createdAt: typeof typedReply.createdAt === "string" ? typedReply.createdAt : new Date().toISOString(),
              } satisfies ForumReply;
            })
          : [];

        return {
          id: String(typed.id || crypto.randomUUID()),
          boardSlug,
          title: sanitizeMultiline(String(typed.title || "Untitled thread"), 140) || "Untitled thread",
          author: sanitizeMultiline(String(typed.author || "Anonymous"), 42) || "Anonymous",
          body: sanitizeMultiline(String(typed.body || ""), 6000),
          createdAt: typeof typed.createdAt === "string" ? typed.createdAt : new Date().toISOString(),
          replies,
        } satisfies ForumThread;
      })
      .filter((thread) => thread.body.length > 0);

    return { threads: sortThreadsByActivity(threads) };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return { threads: [] };
    }

    console.error(`Failed to read forum data for board ${boardSlug}:`, error);
    return { threads: [] };
  }
}

async function writeBoardData(boardSlug: string, data: ForumBoardDataFile): Promise<void> {
  await ensureForumDataDir();
  const filePath = boardFilePath(boardSlug);
  await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
}

export async function getForumBoardSummaries(): Promise<ForumBoardSummary[]> {
  const summaries = await Promise.all(FORUM_BOARDS.map(async (board) => {
    const data = await readBoardData(board.slug);
    const replyCount = data.threads.reduce((acc, thread) => acc + thread.replies.length, 0);
    const lastActivityAt = data.threads.length ? getThreadLastActivity(sortThreadsByActivity(data.threads)[0]) : undefined;

    return {
      board,
      threadCount: data.threads.length,
      replyCount,
      lastActivityAt,
    } satisfies ForumBoardSummary;
  }));

  return summaries;
}

export async function getForumBoardThreads(boardSlug: string, page = 1, pageSize = 24): Promise<{
  threads: ForumThread[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const data = await readBoardData(boardSlug);
  const currentPage = Math.max(1, page);
  const effectivePageSize = Math.max(1, Math.min(100, pageSize));
  const start = (currentPage - 1) * effectivePageSize;
  const end = start + effectivePageSize;

  return {
    threads: data.threads.slice(start, end),
    total: data.threads.length,
    page: currentPage,
    pageSize: effectivePageSize,
  };
}

export async function getForumThread(boardSlug: string, threadId: string): Promise<ForumThread | undefined> {
  const data = await readBoardData(boardSlug);
  return data.threads.find((thread) => thread.id === threadId);
}

export async function createForumThread(input: {
  boardSlug: string;
  title: string;
  body: string;
  author?: string;
}): Promise<{ ok: true; thread: ForumThread } | { ok: false; error: string }> {
  const board = getForumBoardBySlug(input.boardSlug);
  if (!board) {
    return { ok: false, error: "Board not found." };
  }

  const title = sanitizeMultiline(input.title, 140);
  const body = sanitizeMultiline(input.body, 6000);
  const author = sanitizeMultiline(input.author || "Anonymous", 42) || "Anonymous";

  if (title.length < 4) {
    return { ok: false, error: "Thread title must be at least 4 characters." };
  }
  if (body.length < 8) {
    return { ok: false, error: "Thread body must be at least 8 characters." };
  }

  const data = await readBoardData(board.slug);
  const thread: ForumThread = {
    id: crypto.randomUUID(),
    boardSlug: board.slug,
    title,
    author,
    body,
    createdAt: new Date().toISOString(),
    replies: [],
  };

  const updated = {
    threads: sortThreadsByActivity([thread, ...data.threads]),
  };

  await writeBoardData(board.slug, updated);
  return { ok: true, thread };
}

export async function createForumReply(input: {
  boardSlug: string;
  threadId: string;
  body: string;
  author?: string;
}): Promise<{ ok: true; thread: ForumThread } | { ok: false; error: string }> {
  const board = getForumBoardBySlug(input.boardSlug);
  if (!board) {
    return { ok: false, error: "Board not found." };
  }

  const body = sanitizeMultiline(input.body, 4000);
  const author = sanitizeMultiline(input.author || "Anonymous", 42) || "Anonymous";

  if (body.length < 3) {
    return { ok: false, error: "Reply must be at least 3 characters." };
  }

  const data = await readBoardData(board.slug);
  const target = data.threads.find((thread) => thread.id === input.threadId);
  if (!target) {
    return { ok: false, error: "Thread not found." };
  }

  const reply: ForumReply = {
    id: crypto.randomUUID(),
    author,
    body,
    createdAt: new Date().toISOString(),
  };

  const updatedThreads = data.threads.map((thread) => {
    if (thread.id !== target.id) {
      return thread;
    }

    return {
      ...thread,
      replies: [...thread.replies, reply],
    };
  });

  const sorted = sortThreadsByActivity(updatedThreads);
  await writeBoardData(board.slug, { threads: sorted });

  const updatedThread = sorted.find((thread) => thread.id === target.id);
  if (!updatedThread) {
    return { ok: false, error: "Reply was saved, but the thread could not be reloaded." };
  }

  return { ok: true, thread: updatedThread };
}

function renderPageShell(options: {
  title: string;
  description: string;
  canonicalUrl: string;
  heroKicker?: string;
  heroTitle: string;
  heroSubtitle: string;
  content: string;
}): string {
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
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Gateway Corporate">
    <meta property="og:title" content="${escapeHtml(options.title)}">
    <meta property="og:description" content="${escapeHtml(options.description)}">
    <meta property="og:url" content="${escapeHtml(options.canonicalUrl)}">
    <meta property="og:image" content="${SITE_URL}/embed.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(options.title)}">
    <meta name="twitter:description" content="${escapeHtml(options.description)}">
    <meta name="twitter:image" content="${SITE_URL}/embed.png">
    <link rel="stylesheet" href="/components.css">
    <link rel="stylesheet" href="/enhancements.css">
    <script src="/bundle.js" defer></script>
    <script src="/index.js" defer></script>
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <style>
      body.forum-page {
        background: var(--primary);
      }

      .forum-shell {
        max-width: 1160px;
        margin: 0 auto 2.5rem;
        padding: 0 1rem;
      }

      .forum-panel {
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 14px;
        background: linear-gradient(165deg, rgba(30, 41, 59, 0.82) 0%, rgba(15, 23, 42, 0.88) 100%);
        box-shadow: 0 16px 38px rgba(2, 6, 23, 0.33);
      }

      .forum-intro {
        margin-top: 1.1rem;
        padding: 1rem;
      }

      .forum-intro h2 {
        margin: 0;
        color: #f8fafc;
        font-size: clamp(1.1rem, 2vw, 1.45rem);
      }

      .forum-intro p {
        margin-top: 0.5rem;
        color: #cbd5e1;
      }

      .forum-board-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        gap: 0.85rem;
        margin-top: 1rem;
      }

      .forum-board-card {
        border: 1px solid rgba(125, 211, 252, 0.24);
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.72);
        padding: 0.85rem;
      }

      .forum-board-card h3 {
        margin: 0;
        font-size: 1.05rem;
        color: #e2e8f0;
      }

      .forum-board-subtitle {
        margin: 0.35rem 0 0;
        color: #cbd5e1;
        font-size: 0.92rem;
      }

      .forum-board-path {
        display: inline-block;
        margin: 0.35rem 0;
        font-family: "Courier New", monospace;
        color: #93c5fd;
      }

      .forum-meta {
        color: #cbd5e1;
        font-size: 0.9rem;
      }

      .forum-inline-link {
        color: #bfdbfe;
        font-weight: 700;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .forum-inline-link:hover {
        color: #dbeafe;
      }

      .thread-composer,
      .reply-composer,
      .thread-card,
      .post-block {
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.76);
      }

      .thread-composer,
      .reply-composer,
      .thread-card,
      .post-block {
        padding: 0.9rem;
      }

      .forum-section {
        margin-top: 1rem;
      }

      .forum-row {
        display: grid;
        gap: 0.65rem;
      }

      .forum-field label {
        display: block;
        margin-bottom: 0.2rem;
        font-size: 0.88rem;
        color: #cbd5e1;
      }

      .forum-field input,
      .forum-field textarea {
        width: 100%;
        background: rgba(15, 23, 42, 0.86);
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 6px;
        color: #f8fafc;
        padding: 0.56rem;
        font: inherit;
      }

      .forum-field textarea {
        min-height: 122px;
      }

      .forum-actions {
        display: flex;
        gap: 0.7rem;
        align-items: center;
        flex-wrap: wrap;
      }

      .forum-threads {
        display: grid;
        gap: 0.75rem;
      }

      .thread-title {
        margin: 0;
        font-size: 1.06rem;
        color: #f8fafc;
      }

      .thread-title a {
        color: #e2e8f0;
        text-decoration: none;
      }

      .thread-title a:hover {
        color: #bfdbfe;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .thread-meta,
      .post-meta {
        margin-top: 0.35rem;
        font-size: 0.86rem;
        color: #94a3b8;
      }

      .thread-snippet,
      .post-body {
        margin-top: 0.55rem;
        color: #e2e8f0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        line-height: 1.5;
      }

      .post-index {
        color: #fca5a5;
      }

      .forum-alert {
        margin-top: 0.85rem;
        border-radius: 7px;
        border: 1px solid rgba(239, 68, 68, 0.7);
        background: rgba(127, 29, 29, 0.28);
        color: #fecaca;
        padding: 0.7rem;
      }

      .forum-pagination {
        margin-top: 0.9rem;
        font-size: 0.92rem;
      }

      .board-nav {
        margin-top: 0.85rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }

      .board-chip {
        display: inline-block;
        text-decoration: none;
        border: 1px solid rgba(148, 163, 184, 0.45);
        border-radius: 999px;
        padding: 0.27rem 0.58rem;
        color: #dbeafe;
        background: rgba(30, 41, 59, 0.74);
        font-size: 0.85rem;
      }

      .board-chip.is-active {
        background: #1d4ed8;
        color: #eff6ff;
        border-color: #1d4ed8;
      }

      .board-chip:hover {
        background: rgba(59, 130, 246, 0.33);
      }

      .forum-page .hero.hero-compact {
        min-height: 48vh;
        display: flex;
        align-items: center;
        position: relative;
        overflow: hidden;
      }

      .forum-page .hero.hero-compact::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(2, 6, 23, 0.12) 0%, rgba(2, 6, 23, 0.7) 100%);
        pointer-events: none;
      }

      .forum-page .hero .hero-content {
        position: relative;
        z-index: 2;
        max-width: 980px;
        margin: 0 auto;
        text-align: center;
      }

      .forum-page .hero .eyebrow {
        display: inline-flex;
        align-items: center;
        padding: 0.38rem 0.82rem;
        border-radius: 999px;
        border: 1px solid rgba(147, 197, 253, 0.52);
        color: #dbeafe;
        background: rgba(15, 23, 42, 0.45);
        margin-bottom: 0.85rem;
      }

      .forum-page .hero .hero-title {
        color: #f8fafc;
        text-shadow: 0 10px 24px rgba(2, 6, 23, 0.5);
      }

      .forum-page .hero .hero-subtitle {
        color: #dbeafe;
      }

      @media (max-width: 768px) {
        .forum-page .hero.hero-compact {
          min-height: 42vh;
        }

        .forum-shell {
          padding-left: 0.65rem;
          padding-right: 0.65rem;
        }
      }
    </style>
  </head>
  <body class="forum-page">
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
          <p class="eyebrow">${escapeHtml(options.heroKicker || "Gateway Corporate Forum")}</p>
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
            <li><a href="/services" class="nav-link">Services</a></li>
            <li><a href="/products" class="nav-link">Products</a></li>
            <li><a href="/forum" class="nav-link">Forum</a></li>
            <li><a href="/blog" class="nav-link">Blog</a></li>
            <li><a href="/#contact" class="nav-link">Contact</a></li>
          </ul>
        </div>
      </div>
    </header>
    <main class="forum-shell">
      <section class="forum-panel forum-intro">
        <h2>Board Network</h2>
        <p>Short-form operational threads from teams building AI, signals, and strategy systems in production.</p>
      </section>
      ${options.content}
    </main>
${renderSiteFooter()}
  </body>
</html>`;
}

function renderBoardNav(activeBoardSlug?: string): string {
  const chips = FORUM_BOARDS.map((board) => {
    const activeClass = board.slug === activeBoardSlug ? " is-active" : "";
    return `<a href="/forum/${encodeURIComponent(board.slug)}" class="board-chip${activeClass}">${escapeHtml(board.path)} ${escapeHtml(board.name)}</a>`;
  });

  return `<div class="board-nav">${chips.join("\n")}</div>`;
}

export async function renderForumIndexPage(): Promise<string> {
  const summaries = await getForumBoardSummaries();

  const boardMarkup = summaries.map((summary) => {
    const lastActivity = summary.lastActivityAt ? ` • Last activity ${escapeHtml(formatDateTime(summary.lastActivityAt))}` : "";

    return `<article class="forum-board-card">
      <a class="forum-board-path" href="/forum/${encodeURIComponent(summary.board.slug)}">${escapeHtml(summary.board.path)}</a>
      <h3>${escapeHtml(summary.board.name)}</a></h3>
      <p class="forum-board-subtitle">${escapeHtml(summary.board.description)}</p>
      <p class="forum-meta">Threads ${summary.threadCount} • Replies ${summary.replyCount}${lastActivity}</p>
    </article>`;
  }).join("\n");

  return renderPageShell({
    title: "Gateway Forum | Gateway Corporate",
    description: "A bulletin board for AI operations, signals intelligence, digital twin systems, and related strategy at Gateway Corporate.",
    canonicalUrl: absoluteUrl("/forum"),
    heroTitle: "Gateway Forum",
    heroSubtitle: "A 4chan-style bulletin board focused on operations, intelligence, and decision systems.",
    content: `
      <section class="forum-section forum-panel" style="padding: 0.95rem;">
        <p class="forum-meta">Select a board to browse threads or start a new discussion.</p>
        ${renderBoardNav()}
        <div class="forum-board-grid">
          ${boardMarkup}
        </div>
      </section>
    `,
  });
}

export async function renderForumBoardPage(options: {
  board: ForumBoardDefinition;
  page?: number;
  pageSize?: number;
  errorMessage?: string;
}): Promise<string> {
  const page = options.page || 1;
  const pageSize = options.pageSize || 16;
  const boardThreads = await getForumBoardThreads(options.board.slug, page, pageSize);
  const totalPages = Math.max(1, Math.ceil(boardThreads.total / boardThreads.pageSize));

  const threadMarkup = boardThreads.threads.length
    ? boardThreads.threads.map((thread) => {
      const snippet = thread.body.length > 280 ? `${thread.body.slice(0, 280).trimEnd()}...` : thread.body;
      return `<article class="thread-card" id="thread-${escapeHtml(thread.id)}">
        <h3 class="thread-title"><a href="/forum/${encodeURIComponent(options.board.slug)}/thread/${encodeURIComponent(thread.id)}">${escapeHtml(thread.title)}</a></h3>
        <p class="thread-meta">Posted by ${escapeHtml(thread.author)} • ${escapeHtml(formatDateTime(thread.createdAt))} • Replies ${thread.replies.length}</p>
        <p class="thread-snippet">${escapeHtml(snippet)}</p>
      </article>`;
    }).join("\n")
    : `<div class="thread-card"><p class="thread-snippet">No threads yet. Start the first thread for this board.</p></div>`;

  const prevPage = boardThreads.page > 1 ? boardThreads.page - 1 : undefined;
  const nextPage = boardThreads.page < totalPages ? boardThreads.page + 1 : undefined;

  const paginationLinks = [
    prevPage ? `<a class="board-chip" href="/forum/${encodeURIComponent(options.board.slug)}?page=${prevPage}">Newer</a>` : "",
    nextPage ? `<a class="board-chip" href="/forum/${encodeURIComponent(options.board.slug)}?page=${nextPage}">Older</a>` : "",
  ].filter(Boolean).join(" ");

  const alert = options.errorMessage
    ? `<div class="forum-alert" role="alert">${escapeHtml(options.errorMessage)}</div>`
    : "";

  return renderPageShell({
    title: `${options.board.path} ${options.board.name} | Gateway Forum`,
    description: options.board.description,
    canonicalUrl: absoluteUrl(`/forum/${options.board.slug}`),
    heroTitle: options.board.name,
    heroSubtitle: options.board.description,
    content: `
      <section class="forum-section forum-panel" style="padding: 0.95rem;">
        <p class="forum-meta"><a href="/forum" class="forum-inline-link">All boards</a> • Threads ${boardThreads.total}</p>
        ${renderBoardNav(options.board.slug)}
        ${alert}
      </section>

      <section class="forum-section thread-composer">
        <h2 class="thread-title">Start a thread</h2>
        <form action="/forum/${encodeURIComponent(options.board.slug)}/thread" method="post" class="forum-row">
          <div class="forum-field">
            <label for="thread-title">Thread title</label>
            <input id="thread-title" name="title" maxlength="140" required>
          </div>
          <div class="forum-field">
            <label for="thread-author">Name (optional)</label>
            <input id="thread-author" name="author" maxlength="42" placeholder="Anonymous">
          </div>
          <div class="forum-field">
            <label for="thread-body">Post</label>
            <textarea id="thread-body" name="body" maxlength="6000" required></textarea>
          </div>
          <div class="forum-actions">
            <button type="submit" class="btn btn-primary btn-sm">Create thread</button>
          </div>
        </form>
      </section>

      <section class="forum-section forum-threads">
        ${threadMarkup}
      </section>

      <div class="forum-pagination">Page ${boardThreads.page} of ${totalPages} ${paginationLinks}</div>
    `,
  });
}

export function renderForumBoardNotFoundPage(boardSlug: string): string {
  return renderPageShell({
    title: "Board not found | Gateway Forum",
    description: "The requested board does not exist.",
    canonicalUrl: absoluteUrl(`/forum/${boardSlug}`),
    heroTitle: "Board not found",
    heroSubtitle: `No board is registered for /${boardSlug}/.`,
    content: `
      <section class="forum-section thread-card">
        <p class="thread-snippet">The board you requested is not available. Visit the board index to browse existing categories.</p>
        <div class="forum-actions">
          <a href="/forum" class="btn btn-primary btn-sm">View boards</a>
        </div>
      </section>
    `,
  });
}

export async function renderForumThreadPage(options: {
  board: ForumBoardDefinition;
  threadId: string;
  errorMessage?: string;
}): Promise<string> {
  const thread = await getForumThread(options.board.slug, options.threadId);
  if (!thread) {
    return renderPageShell({
      title: "Thread not found | Gateway Forum",
      description: "The requested thread does not exist.",
      canonicalUrl: absoluteUrl(`/forum/${options.board.slug}/thread/${options.threadId}`),
      heroTitle: "Thread not found",
      heroSubtitle: `No thread was found in ${options.board.path}.`,
      content: `
        <section class="forum-section thread-card">
          <p class="thread-snippet">The requested thread does not exist or may have been removed.</p>
          <div class="forum-actions">
            <a href="/forum/${encodeURIComponent(options.board.slug)}" class="btn btn-primary btn-sm">Back to ${escapeHtml(options.board.path)}</a>
          </div>
        </section>
      `,
    });
  }

  const alert = options.errorMessage
    ? `<div class="forum-alert" role="alert">${escapeHtml(options.errorMessage)}</div>`
    : "";

  const replies = thread.replies.length
    ? thread.replies.map((reply, index) => {
      const postNumber = index + 2;
      return `<article class="post-block" id="post-${escapeHtml(reply.id)}">
        <p class="post-meta"><span class="post-index">No.${postNumber}</span> • ${escapeHtml(reply.author)} • ${escapeHtml(formatDateTime(reply.createdAt))}</p>
        <p class="post-body">${escapeHtml(reply.body)}</p>
      </article>`;
    }).join("\n")
    : `<article class="post-block"><p class="post-body">No replies yet.</p></article>`;

  return renderPageShell({
    title: `${thread.title} | ${options.board.path} Gateway Forum`,
    description: `${thread.title} discussion on ${options.board.name}`,
    canonicalUrl: absoluteUrl(`/forum/${options.board.slug}/thread/${thread.id}`),
    heroTitle: options.board.name,
    heroSubtitle: options.board.description,
    content: `
      <section class="forum-section forum-panel" style="padding: 0.95rem;">
        <p class="forum-meta"><a href="/forum" class="forum-inline-link">All boards</a> • <a href="/forum/${encodeURIComponent(options.board.slug)}" class="forum-inline-link">Back to ${escapeHtml(options.board.path)}</a></p>
        ${renderBoardNav(options.board.slug)}
      </section>

      <section class="forum-section post-block" id="thread-${escapeHtml(thread.id)}">
        <h2 class="thread-title">${escapeHtml(thread.title)}</h2>
        <p class="post-meta"><span class="post-index">No.1</span> • ${escapeHtml(thread.author)} • ${escapeHtml(formatDateTime(thread.createdAt))}</p>
        <p class="post-body">${escapeHtml(thread.body)}</p>
      </section>

      <section class="forum-section forum-threads">
        ${replies}
      </section>

      <section class="forum-section reply-composer">
        <h2 class="thread-title">Reply to thread</h2>
        ${alert}
        <form action="/forum/${encodeURIComponent(options.board.slug)}/thread/${encodeURIComponent(thread.id)}/reply" method="post" class="forum-row">
          <div class="forum-field">
            <label for="reply-author">Name (optional)</label>
            <input id="reply-author" name="author" maxlength="42" placeholder="Anonymous">
          </div>
          <div class="forum-field">
            <label for="reply-body">Reply</label>
            <textarea id="reply-body" name="body" maxlength="4000" required></textarea>
          </div>
          <div class="forum-actions">
            <button type="submit" class="btn btn-primary btn-sm">Post reply</button>
          </div>
        </form>
      </section>
    `,
  });
}

export function parseForumPageParam(value: string | null): number {
  return asPositiveInteger(value, 1);
}
