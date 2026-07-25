import { renderSiteFooter } from "./footer.ts";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const SITE_URL = "https://gatewaycorporate.org";
const FORUM_DATA_DIR = "./content/forum";
const FORUM_MODERATION_PATH = "./content/forum/moderation.json";
const RECAPTCHA_SITE_KEY = "6LcIVHArAAAAAPZ1scQS8vrN_JRhCBzjOoJHuw2i";

const DEFAULT_BANNED_WORDS = [
  "faggot",
  "nigger",
  "kike",
  "chink",
  "spic",
  "wetback",
  "retard",
  "tranny",
  "coon",
  "raghead",
  "gook",
  "honky",
  "dyke",
];

export interface ForumBoardDefinition {
  slug: string;
  path: string;
  name: string;
  description: string;
}

export interface ForumReply {
  id: string;
  author: string;
  authorFingerprint?: string;
  body: string;
  createdAt: string;
}

export interface ForumThread {
  id: string;
  boardSlug: string;
  title: string;
  author: string;
  authorFingerprint?: string;
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

interface BoardPostIndexEntry {
  number: number;
  threadId: string;
  replyId?: string;
  author: string;
  body: string;
  createdAt: string;
}

interface BoardPostIndex {
  byKey: Map<string, BoardPostIndexEntry>;
  byNumber: Map<number, BoardPostIndexEntry>;
}

type QuoteBacklinksIndex = Map<number, number[]>;

export interface ForumModerationState {
  bannedWords: string[];
  bannedAuthors: string[];
  bannedFingerprints: string[];
  updatedAt: string;
}

export interface ForumModerationQueueEntry {
  boardSlug: string;
  threadId: string;
  replyId?: string;
  postNumber: number;
  author: string;
  authorFingerprint?: string;
  createdAt: string;
  preview: string;
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
    slug: "security",
    path: "/security/",
    name: "Cybersecurity and Identity",
    description: "Authentication, authorization, identity management, and security operations for systems and organizations.",
  },
  {
    slug: "sims",
    path: "/sims/",
    name: "Models and Simulations",
    description: "Digital twin systems, agent-based modeling, and simulation-driven decision-making.",
  },
  {
    slug: "antitech",
    path: "/antitech/",
    name: "Anti-Bot, Anti-Spam, Anti-Fraud Technology",
    description: "Technology designed for the prevention of abuse, fraud, and malicious activity in online systems.",
  },
  {
    slug: "risk",
    path: "/risk/",
    name: "Risk Measurement, Analysis, and Management",
    description: "Risk scoring, risk modeling, and risk management for organizations and systems.",
  },
  {
    slug: "etc",
    path: "/etc/",
    name: "Other",
    description: "Cross-discipline discussion, experiments, and everything that does not fit elsewhere.",
  },
];

marked.setOptions({
  gfm: true,
  breaks: true,
});

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
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\0", "")
    .replace(/\n{3,}/g, "\n\n")
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

function renderForumMarkdown(value: string): string {
  const markdownWithQuoteLinks = value.replace(/>>([0-9]{1,7})/g, "[>>$1](#p$1)");
  const rendered = marked.parse(markdownWithQuoteLinks) as string;
  return sanitizeHtml(rendered, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "h1",
      "h2",
      "h3",
      "pre",
      "code",
      "blockquote",
      "hr",
    ]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "class", "data-quote-number"],
      code: ["class"],
      "*": ["id"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName: string, attribs: Record<string, string>) => {
        const href = typeof attribs.href === "string" ? attribs.href : "";
        const quoteMatch = href.match(/^#p([0-9]{1,7})$/);

        if (quoteMatch) {
          return {
            tagName,
            attribs: {
              href,
              class: "quote-ref",
              "data-quote-number": quoteMatch[1],
            },
          };
        }

        return {
          tagName,
          attribs: {
            ...attribs,
            rel: "noopener noreferrer",
          },
        };
      },
    },
  });
}

function boardThreadKey(threadId: string): string {
  return `thread:${threadId}`;
}

function boardReplyKey(threadId: string, replyId: string): string {
  return `reply:${threadId}:${replyId}`;
}

function normalizeAuthorToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeForAutomod(value: string): string {
  const substitutions: Record<string, string> = {
    "0": "o",
    "1": "i",
    "2": "z",
    "3": "e",
    "4": "a",
    "5": "s",
    "6": "g",
    "7": "t",
    "8": "b",
    "9": "g",
    "@": "a",
    "$": "s",
    "!": "i",
    "|": "i",
    "+": "t",
  };

  return value
    .toLowerCase()
    .split("")
    .map((character) => substitutions[character] || character)
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

function getAutomodCharClass(character: string): string {
  const classes: Record<string, string> = {
    a: "a4@",
    b: "b8",
    e: "e3",
    g: "g69",
    i: "i1!|l",
    l: "l1|i",
    o: "o0",
    s: "s5$",
    t: "t7+",
    z: "z2",
  };

  return classes[character] || character;
}

function buildAutomodRegex(word: string): RegExp {
  const normalized = normalizeForAutomod(word);
  const pattern = normalized
    .split("")
    .map((character) => {
      const charClass = getAutomodCharClass(character).replace(/[-\\^\]]/g, "\\$&");
      return `[${charClass}]`;
    })
    .join("[^a-z0-9]*");

  return new RegExp(pattern, "i");
}

function mergeBannedWordDefaults(words: string[]): string[] {
  const merged = new Set<string>();
  for (const item of [...DEFAULT_BANNED_WORDS, ...words]) {
    const normalized = normalizeForAutomod(item);
    if (normalized.length >= 3) {
      merged.add(normalized);
    }
  }

  return [...merged];
}

function buildBoardPostIndex(threads: ForumThread[]): BoardPostIndex {
  const byKey = new Map<string, BoardPostIndexEntry>();
  const byNumber = new Map<number, BoardPostIndexEntry>();

  const flatPosts: Array<Omit<BoardPostIndexEntry, "number">> = [];
  for (const thread of threads) {
    flatPosts.push({
      threadId: thread.id,
      author: thread.author,
      body: thread.body,
      createdAt: thread.createdAt,
    });

    for (const reply of thread.replies) {
      flatPosts.push({
        threadId: thread.id,
        replyId: reply.id,
        author: reply.author,
        body: reply.body,
        createdAt: reply.createdAt,
      });
    }
  }

  flatPosts.sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (timeDelta !== 0) {
      return timeDelta;
    }

    const leftKind = left.replyId ? 1 : 0;
    const rightKind = right.replyId ? 1 : 0;
    if (leftKind !== rightKind) {
      return leftKind - rightKind;
    }

    const threadDelta = left.threadId.localeCompare(right.threadId);
    if (threadDelta !== 0) {
      return threadDelta;
    }

    return (left.replyId || "").localeCompare(right.replyId || "");
  });

  flatPosts.forEach((post, index) => {
    const entry: BoardPostIndexEntry = {
      number: index + 1,
      threadId: post.threadId,
      replyId: post.replyId,
      author: post.author,
      body: post.body,
      createdAt: post.createdAt,
    };

    const key = entry.replyId
      ? boardReplyKey(entry.threadId, entry.replyId)
      : boardThreadKey(entry.threadId);

    byKey.set(key, entry);
    byNumber.set(entry.number, entry);
  });

  return { byKey, byNumber };
}

function buildPostPreviewText(body: string, maxLength = 220): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function extractQuotedPostNumbers(body: string): number[] {
  const matches = body.matchAll(/>>([0-9]{1,7})/g);
  const values = new Set<number>();
  for (const match of matches) {
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      values.add(parsed);
    }
  }

  return [...values];
}

function buildQuoteBacklinksIndex(boardPostIndex: BoardPostIndex): QuoteBacklinksIndex {
  const backlinks: QuoteBacklinksIndex = new Map();
  const sourceEntries = [...boardPostIndex.byNumber.values()].sort((left, right) => left.number - right.number);

  for (const sourceEntry of sourceEntries) {
    const quotedTargets = extractQuotedPostNumbers(sourceEntry.body);
    for (const targetNumber of quotedTargets) {
      const targetEntry = boardPostIndex.byNumber.get(targetNumber);
      if (!targetEntry || targetEntry.number === sourceEntry.number) {
        continue;
      }

      const existing = backlinks.get(targetNumber) || [];
      if (!existing.includes(sourceEntry.number)) {
        existing.push(sourceEntry.number);
        backlinks.set(targetNumber, existing);
      }
    }
  }

  return backlinks;
}

async function ensureForumDataDir(): Promise<void> {
  await Deno.mkdir(FORUM_DATA_DIR, { recursive: true });
}

async function readForumModerationState(): Promise<ForumModerationState> {
  await ensureForumDataDir();

  try {
    const raw = await Deno.readTextFile(FORUM_MODERATION_PATH);
    const parsed = JSON.parse(raw) as Partial<ForumModerationState>;
    const bannedWords = Array.isArray(parsed.bannedWords)
      ? parsed.bannedWords.filter((candidate): candidate is string => typeof candidate === "string")
      : [];
    const bannedAuthors = Array.isArray(parsed.bannedAuthors)
      ? parsed.bannedAuthors.filter((candidate): candidate is string => typeof candidate === "string")
      : [];
    const bannedFingerprints = Array.isArray(parsed.bannedFingerprints)
      ? parsed.bannedFingerprints.filter((candidate): candidate is string => typeof candidate === "string")
      : [];

    return {
      bannedWords: mergeBannedWordDefaults(bannedWords),
      bannedAuthors: [...new Set(bannedAuthors.map(normalizeAuthorToken).filter(Boolean))],
      bannedFingerprints: [...new Set(bannedFingerprints.map((value) => value.trim()).filter(Boolean))],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      console.error("Failed to read forum moderation state:", error);
    }

    return {
      bannedWords: mergeBannedWordDefaults([]),
      bannedAuthors: [],
      bannedFingerprints: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

async function writeForumModerationState(state: ForumModerationState): Promise<void> {
  await ensureForumDataDir();
  await Deno.writeTextFile(FORUM_MODERATION_PATH, JSON.stringify({
    ...state,
    bannedWords: mergeBannedWordDefaults(state.bannedWords),
    bannedAuthors: [...new Set(state.bannedAuthors.map(normalizeAuthorToken).filter(Boolean))],
    bannedFingerprints: [...new Set(state.bannedFingerprints.map((value) => value.trim()).filter(Boolean))],
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

export async function getForumModerationState(): Promise<ForumModerationState> {
  return readForumModerationState();
}

export async function addForumBannedWord(rawWord: string): Promise<ForumModerationState> {
  const state = await readForumModerationState();
  const normalized = normalizeForAutomod(rawWord);
  if (normalized.length < 3) {
    throw new Error("Banned words must have at least 3 characters after normalization.");
  }

  state.bannedWords = mergeBannedWordDefaults([...state.bannedWords, normalized]);
  state.updatedAt = new Date().toISOString();
  await writeForumModerationState(state);
  return state;
}

export async function removeForumBannedWord(rawWord: string): Promise<ForumModerationState> {
  const state = await readForumModerationState();
  const normalized = normalizeForAutomod(rawWord);
  state.bannedWords = state.bannedWords.filter((candidate) => candidate !== normalized);
  state.updatedAt = new Date().toISOString();
  await writeForumModerationState(state);
  return state;
}

export async function banForumIdentity(input: {
  author?: string;
  fingerprint?: string;
}): Promise<ForumModerationState> {
  const state = await readForumModerationState();

  const author = input.author ? normalizeAuthorToken(input.author) : "";
  const fingerprint = input.fingerprint ? input.fingerprint.trim() : "";

  if (!author && !fingerprint) {
    throw new Error("Provide an author or fingerprint to ban.");
  }

  if (author) {
    state.bannedAuthors = [...new Set([...state.bannedAuthors, author])];
  }

  if (fingerprint) {
    state.bannedFingerprints = [...new Set([...state.bannedFingerprints, fingerprint])];
  }

  state.updatedAt = new Date().toISOString();
  await writeForumModerationState(state);
  return state;
}

export async function evaluateForumSubmission(input: {
  author: string;
  authorFingerprint?: string;
  title?: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = await readForumModerationState();
  const normalizedAuthor = normalizeAuthorToken(input.author || "Anonymous");
  const fingerprint = (input.authorFingerprint || "").trim();

  if (normalizedAuthor && state.bannedAuthors.includes(normalizedAuthor)) {
    return { ok: false, error: "This user is banned from posting." };
  }

  if (fingerprint && state.bannedFingerprints.includes(fingerprint)) {
    return { ok: false, error: "This user is banned from posting." };
  }

  const fullText = `${input.title || ""}\n${input.body}`;
  const normalizedText = normalizeForAutomod(fullText);
  const lowerRawText = fullText.toLowerCase();

  for (const bannedWord of state.bannedWords) {
    if (!bannedWord || bannedWord.length < 3) {
      continue;
    }

    const directHit = normalizedText.includes(bannedWord);
    const fuzzyHit = buildAutomodRegex(bannedWord).test(lowerRawText);
    if (directHit || fuzzyHit) {
      return { ok: false, error: "Post blocked by automated moderation policy." };
    }
  }

  return { ok: true };
}

export async function removeForumPost(input: {
  boardSlug: string;
  threadId: string;
  replyId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = await readBoardData(input.boardSlug);
  const targetThread = data.threads.find((thread) => thread.id === input.threadId);
  if (!targetThread) {
    return { ok: false, error: "Thread not found." };
  }

  if (!input.replyId) {
    const updatedThreads = data.threads.filter((thread) => thread.id !== input.threadId);
    await writeBoardData(input.boardSlug, { threads: sortThreadsByActivity(updatedThreads) });
    return { ok: true };
  }

  const beforeCount = targetThread.replies.length;
  const updatedThreads = data.threads.map((thread) => {
    if (thread.id !== input.threadId) {
      return thread;
    }

    return {
      ...thread,
      replies: thread.replies.filter((reply) => reply.id !== input.replyId),
    } satisfies ForumThread;
  });

  const afterCount = updatedThreads.find((thread) => thread.id === input.threadId)?.replies.length ?? 0;
  if (afterCount === beforeCount) {
    return { ok: false, error: "Reply not found." };
  }

  await writeBoardData(input.boardSlug, { threads: sortThreadsByActivity(updatedThreads) });
  return { ok: true };
}

export async function getForumModerationQueue(limit = 120): Promise<ForumModerationQueueEntry[]> {
  const rows: ForumModerationQueueEntry[] = [];

  for (const board of FORUM_BOARDS) {
    const data = await readBoardData(board.slug);
    const boardPostIndex = buildBoardPostIndex(data.threads);

    for (const thread of data.threads) {
      const threadEntry = boardPostIndex.byKey.get(boardThreadKey(thread.id));
      if (threadEntry) {
        rows.push({
          boardSlug: board.slug,
          threadId: thread.id,
          postNumber: threadEntry.number,
          author: thread.author,
          authorFingerprint: thread.authorFingerprint,
          createdAt: thread.createdAt,
          preview: buildPostPreviewText(thread.body, 140),
        });
      }

      for (const reply of thread.replies) {
        const replyEntry = boardPostIndex.byKey.get(boardReplyKey(thread.id, reply.id));
        if (!replyEntry) {
          continue;
        }

        rows.push({
          boardSlug: board.slug,
          threadId: thread.id,
          replyId: reply.id,
          postNumber: replyEntry.number,
          author: reply.author,
          authorFingerprint: reply.authorFingerprint,
          createdAt: reply.createdAt,
          preview: buildPostPreviewText(reply.body, 140),
        });
      }
    }
  }

  return rows
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, Math.max(10, Math.min(limit, 500)));
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
                authorFingerprint: sanitizeMultiline(String(typedReply.authorFingerprint || ""), 128) || undefined,
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
          authorFingerprint: sanitizeMultiline(String(typed.authorFingerprint || ""), 128) || undefined,
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
  authorFingerprint?: string;
}): Promise<{ ok: true; thread: ForumThread } | { ok: false; error: string }> {
  const board = getForumBoardBySlug(input.boardSlug);
  if (!board) {
    return { ok: false, error: "Board not found." };
  }

  const title = sanitizeMultiline(input.title, 140);
  const body = sanitizeMultiline(input.body, 6000);
  const author = sanitizeMultiline(input.author || "Anonymous", 42) || "Anonymous";
  const authorFingerprint = sanitizeMultiline(input.authorFingerprint || "", 128) || undefined;

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
    authorFingerprint,
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
  authorFingerprint?: string;
}): Promise<{ ok: true; thread: ForumThread } | { ok: false; error: string }> {
  const board = getForumBoardBySlug(input.boardSlug);
  if (!board) {
    return { ok: false, error: "Board not found." };
  }

  const body = sanitizeMultiline(input.body, 4000);
  const author = sanitizeMultiline(input.author || "Anonymous", 42) || "Anonymous";
  const authorFingerprint = sanitizeMultiline(input.authorFingerprint || "", 128) || undefined;

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
    authorFingerprint,
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

export async function verifyForumRecaptcha(token: string, options?: { bypassCaptcha?: boolean }): Promise<void> {
  if (options?.bypassCaptcha) {
    return;
  }

  const recaptchaSecret = Deno.env.get("RECAPTCHA_SECRET_KEY") || "";
  if (!recaptchaSecret) {
    throw new Error("reCAPTCHA is not configured on the server.");
  }

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret: recaptchaSecret,
      response: token,
    }),
  });

  if (!response.ok) {
    throw new Error("We could not verify the reCAPTCHA challenge.");
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error("reCAPTCHA verification failed. Please try again.");
  }
}

function renderPageShell(options: {
  title: string;
  description: string;
  canonicalUrl: string;
  heroKicker?: string;
  heroTitle: string;
  heroSubtitle: string;
  content: string;
  includeRecaptcha?: boolean;
  inlineScript?: string;
}): string {
  const recaptchaScript = options.includeRecaptcha
    ? "\n    <script src=\"https://www.google.com/recaptcha/api.js\" async defer></script>"
    : "";
  const inlineScriptTag = options.inlineScript
    ? `\n    <script>${options.inlineScript}</script>`
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
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Gateway Corporate">
    <meta property="og:title" content="${escapeHtml(options.title)}">
    <meta property="og:description" content="${escapeHtml(options.description)}">
    <meta property="og:url" content="${escapeHtml(options.canonicalUrl)}">
    <meta property="og:image" content="${SITE_URL}/embed.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(options.title)}">
    <meta name="twitter:description" content="${escapeHtml(options.description)}">
    <meta name="twitter:image" content="${SITE_URL}/embed.png">${recaptchaScript}
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

      .forum-captcha-wrap {
        margin-top: 0.25rem;
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

      .post-body.markdown {
        white-space: normal;
      }

      .post-body.markdown p,
      .post-body.markdown ul,
      .post-body.markdown ol,
      .post-body.markdown pre,
      .post-body.markdown blockquote {
        margin: 0.45rem 0;
      }

      .post-body.markdown ul,
      .post-body.markdown ol {
        padding-left: 1.25rem;
        margin-left: 0.35rem;
      }

      .post-body.markdown li {
        margin: 0.2rem 0;
      }

      .post-body.markdown pre {
        overflow-x: auto;
        padding: 0.55rem;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: rgba(15, 23, 42, 0.9);
      }

      .post-body.markdown code {
        font-family: "Courier New", monospace;
      }

      .post-body.markdown a {
        color: #bfdbfe;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .post-body.markdown blockquote {
        border-left: 3px solid rgba(59, 130, 246, 0.65);
        padding-left: 0.7rem;
        color: #cbd5e1;
      }

      .post-index {
        color: #fca5a5;
      }

      .post-number-link {
        color: #fca5a5;
        font-weight: 700;
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: pointer;
      }

      .post-number-link:hover {
        color: #fecaca;
      }

      .post-quote-backlinks {
        margin-left: 0.35rem;
        color: #93c5fd;
      }

      .post-quote-backlinks .quote-ref {
        margin-left: 0.35rem;
      }

      .quote-ref {
        color: #93c5fd;
        font-weight: 700;
      }

      .quote-ref:hover {
        color: #dbeafe;
      }

      .quote-preview-tooltip {
        position: fixed;
        z-index: 1200;
        max-width: 340px;
        pointer-events: none;
        padding: 0.55rem 0.65rem;
        border-radius: 10px;
        border: 1px solid rgba(147, 197, 253, 0.5);
        background: rgba(2, 6, 23, 0.97);
        box-shadow: 0 14px 30px rgba(2, 6, 23, 0.5);
        color: #e2e8f0;
        font-size: 0.84rem;
        line-height: 1.45;
      }

      .quote-preview-tooltip .meta {
        display: block;
        margin-bottom: 0.25rem;
        color: #bfdbfe;
        font-weight: 700;
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
${inlineScriptTag}
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
      <h3>${escapeHtml(summary.board.name)}</h3>
      <p class="forum-board-subtitle">${escapeHtml(summary.board.description)}</p>
      <p class="forum-meta">Threads ${summary.threadCount} • Replies ${summary.replyCount}${lastActivity}</p>
    </article>`;
  }).join("\n");

  return renderPageShell({
    title: "Gateway Forum | Gateway Corporate",
    description: "A bulletin board for AI operations, signals intelligence, digital twin systems, and related strategy at Gateway Corporate.",
    canonicalUrl: absoluteUrl("/forum"),
    heroTitle: "Gateway Forum",
    heroSubtitle: "Our bulletin board system focused on operations, intelligence, and decision systems.",
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
    includeRecaptcha: true,
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
          <div class="forum-field forum-captcha-wrap">
            <div class="g-recaptcha" data-sitekey="${RECAPTCHA_SITE_KEY}"></div>
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
  const boardData = await readBoardData(options.board.slug);
  const thread = boardData.threads.find((candidate) => candidate.id === options.threadId);
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

  const boardPostIndex = buildBoardPostIndex(boardData.threads);
  const quoteBacklinks = buildQuoteBacklinksIndex(boardPostIndex);
  const threadEntry = boardPostIndex.byKey.get(boardThreadKey(thread.id));
  const threadNumber = threadEntry?.number || 1;

  const buildBacklinksMarkup = (postNumber: number): string => {
    const sourceNumbers = quoteBacklinks.get(postNumber) || [];
    if (!sourceNumbers.length) {
      return "";
    }

    const links = sourceNumbers
      .map((sourceNumber) => {
        const sourceEntry = boardPostIndex.byNumber.get(sourceNumber);
        if (!sourceEntry) {
          return "";
        }

        const href = sourceEntry.threadId === thread.id
          ? `#p${sourceNumber}`
          : `/forum/${encodeURIComponent(options.board.slug)}/thread/${encodeURIComponent(sourceEntry.threadId)}#p${sourceNumber}`;

        return `<a href="${href}" class="quote-ref" data-quote-number="${sourceNumber}">>>${sourceNumber}</a>`;
      })
      .filter(Boolean)
      .join("");

    if (!links) {
      return "";
    }

    return `<span class="post-quote-backlinks">Quoted by ${links}</span>`;
  };

  const quotePreviewIndex = Object.fromEntries(
    Array.from(boardPostIndex.byNumber.entries()).map(([number, entry]) => {
      return [String(number), {
        number,
        author: entry.author,
        createdAt: formatDateTime(entry.createdAt),
        preview: buildPostPreviewText(entry.body),
      }];
    }),
  );
  const quotePreviewJson = JSON.stringify(quotePreviewIndex).replaceAll("</", "<\\/");
  const threadInteractionScript = `(() => {
    const replyBox = document.getElementById("reply-body");
    const quotePreviewData = ${quotePreviewJson};

    function insertQuoteTag(postNumber) {
      if (!(replyBox instanceof HTMLTextAreaElement)) {
        return;
      }

      const tag = \`>>\${postNumber}\\n\`;
      const start = replyBox.selectionStart ?? replyBox.value.length;
      const end = replyBox.selectionEnd ?? replyBox.value.length;
      replyBox.value = replyBox.value.slice(0, start) + tag + replyBox.value.slice(end);
      const nextPos = start + tag.length;
      replyBox.selectionStart = nextPos;
      replyBox.selectionEnd = nextPos;
      replyBox.focus();
    }

    document.querySelectorAll(".post-number-link").forEach((element) => {
      element.addEventListener("click", (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        const postNumber = target.dataset.postNumber;
        if (!postNumber) {
          return;
        }

        event.preventDefault();
        insertQuoteTag(postNumber);
      });
    });

    const tooltip = document.createElement("div");
    tooltip.className = "quote-preview-tooltip";
    tooltip.hidden = true;
    document.body.appendChild(tooltip);

    function showTooltip(anchor) {
      if (!(anchor instanceof HTMLElement)) {
        return;
      }

      const postNumber = anchor.dataset.quoteNumber;
      if (!postNumber) {
        return;
      }

      const details = quotePreviewData[postNumber];
      if (!details) {
        return;
      }

      tooltip.innerHTML = "";
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = \`No.\${details.number} • \${details.author} • \${details.createdAt}\`;

      const body = document.createElement("span");
      body.textContent = details.preview;

      tooltip.appendChild(meta);
      tooltip.appendChild(body);
      tooltip.hidden = false;

      const rect = anchor.getBoundingClientRect();
      const left = Math.min(window.innerWidth - 360, Math.max(10, rect.left));
      const top = Math.min(window.innerHeight - 120, rect.bottom + 8);
      tooltip.style.left = \`\${left}px\`;
      tooltip.style.top = \`\${top}px\`;
    }

    function hideTooltip() {
      tooltip.hidden = true;
    }

    document.querySelectorAll(".quote-ref").forEach((element) => {
      element.addEventListener("mouseenter", () => showTooltip(element));
      element.addEventListener("focus", () => showTooltip(element));
      element.addEventListener("mouseleave", hideTooltip);
      element.addEventListener("blur", hideTooltip);
    });
  })();`;

  const alert = options.errorMessage
    ? `<div class="forum-alert" role="alert">${escapeHtml(options.errorMessage)}</div>`
    : "";

  const replies = thread.replies.length
    ? thread.replies.map((reply) => {
      const replyEntry = boardPostIndex.byKey.get(boardReplyKey(thread.id, reply.id));
      const postNumber = replyEntry?.number;
      const postIndexMarkup = postNumber
        ? `<a href="#p${postNumber}" class="post-index post-number-link" data-post-number="${postNumber}">No.${postNumber}</a>`
        : `<span class="post-index">No.?</span>`;
      const backlinksMarkup = postNumber ? buildBacklinksMarkup(postNumber) : "";

      return `<article class="post-block" id="${postNumber ? `p${postNumber}` : `post-${escapeHtml(reply.id)}`}" data-reply-id="${escapeHtml(reply.id)}">
        <p class="post-meta">${postIndexMarkup} • ${escapeHtml(reply.author)} • ${escapeHtml(formatDateTime(reply.createdAt))}${backlinksMarkup ? ` • ${backlinksMarkup}` : ""}</p>
        <div class="post-body markdown">${renderForumMarkdown(reply.body)}</div>
      </article>`;
    }).join("\n")
    : `<article class="post-block"><p class="post-body">No replies yet.</p></article>`;

  return renderPageShell({
    title: `${thread.title} | ${options.board.path} Gateway Forum`,
    description: `${thread.title} discussion on ${options.board.name}`,
    canonicalUrl: absoluteUrl(`/forum/${options.board.slug}/thread/${thread.id}`),
    heroTitle: options.board.name,
    heroSubtitle: options.board.description,
    includeRecaptcha: true,
    inlineScript: threadInteractionScript,
    content: `
      <section class="forum-section forum-panel" style="padding: 0.95rem;">
        <p class="forum-meta"><a href="/forum" class="forum-inline-link">All boards</a> • <a href="/forum/${encodeURIComponent(options.board.slug)}" class="forum-inline-link">Back to ${escapeHtml(options.board.path)}</a></p>
        ${renderBoardNav(options.board.slug)}
      </section>

      <section class="forum-section post-block" id="p${threadNumber}">
        <h2 class="thread-title">${escapeHtml(thread.title)}</h2>
        <p class="post-meta"><a href="#p${threadNumber}" class="post-index post-number-link" data-post-number="${threadNumber}">No.${threadNumber}</a> • ${escapeHtml(thread.author)} • ${escapeHtml(formatDateTime(thread.createdAt))}${buildBacklinksMarkup(threadNumber) ? ` • ${buildBacklinksMarkup(threadNumber)}` : ""}</p>
        <div class="post-body markdown">${renderForumMarkdown(thread.body)}</div>
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
          <div class="forum-field forum-captcha-wrap">
            <div class="g-recaptcha" data-sitekey="${RECAPTCHA_SITE_KEY}"></div>
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
