type ParsedMessage = {
  ok: true;
  value: {
    type: string;
    data: Record<string, unknown>;
  };
} | {
  ok: false;
  clientMessage: string;
  closeCode: number;
};

type SessionRecord = {
  id: string;
  token: string;
  expiresAt: number;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export const SESSION_COOKIE_NAME = "fp_cicis_session";

export function parseTrustedProxyIps(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function parseConfiguredOrigins(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }

  const parsed = new Set<string>();
  for (const entry of raw.split(",").map((item) => item.trim()).filter(Boolean)) {
    try {
      parsed.add(new URL(entry).origin);
    } catch {
      // Ignore invalid origins.
    }
  }

  return parsed;
}

export function resolveExternalOrigin(
  requestUrl: URL,
  headers: Headers,
  configuredPublicOrigin?: string,
): URL {
  const hostHeader = headers.get("host") || requestUrl.host;
  let normalizedHost = hostHeader.trim().toLowerCase();
  try {
    normalizedHost = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    normalizedHost = requestUrl.hostname.toLowerCase();
  }

  const isIpv4MappedLoopback = normalizedHost.startsWith("::ffff:") && normalizedHost.endsWith("127.0.0.1");
  const isLocalHost =
    normalizedHost === "localhost" ||
    normalizedHost.endsWith(".localhost") ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "::1" ||
    isIpv4MappedLoopback;

  // Honor configured public origin for deployed hosts, but keep localhost
  // behavior tied to the active request origin for local development.
  if (configuredPublicOrigin && !isLocalHost) {
    try {
      return new URL(configuredPublicOrigin);
    } catch {
      // Fall through to proxy/origin detection.
    }
  }

  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");
  const host = forwardedHost || hostHeader;

  return new URL(`${protocol}://${host}`);
}

export function isExternalOriginSecure(externalOrigin: URL): boolean {
  return externalOrigin.protocol === "https:";
}

export function isOriginAllowed(
  originHeader: string | null,
  requestOrigin: URL,
  configuredOrigins: Set<string>,
): boolean {
  if (!originHeader) {
    return true;
  }

  let origin: string;
  try {
    origin = new URL(originHeader).origin;
  } catch {
    return false;
  }

  if (origin === requestOrigin.origin) {
    return true;
  }

  return configuredOrigins.has(origin);
}

export function applySecurityHeaders(headers: Headers, isSecureOrigin: boolean): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (isSecureOrigin) {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
}

export function injectSessionToken(html: string, token: string): string {
  const script = `<script>window.__GCX__ = window.__GCX__ || {}; window.__GCX__.websocketToken = ${JSON.stringify(token)};</script>`;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}\n  </head>`);
  }

  return `${script}${html}`;
}

export function buildSessionCookieHeader(
  name: string,
  value: string,
  secure: boolean,
  maxAgeSeconds: number,
): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(1, Math.floor(maxAgeSeconds))}`,
  ];

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function decodeSessionCookie(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly tokenToSessionId = new Map<string, string>();
  private readonly ttlMs: number;

  constructor(ttlMs = SESSION_TTL_MS) {
    this.ttlMs = ttlMs;
    setInterval(() => this.pruneExpired(), SESSION_SWEEP_INTERVAL_MS);
  }

  createSession(): SessionRecord {
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + this.ttlMs;
    const session = { id, token, expiresAt };
    this.sessions.set(id, session);
    this.tokenToSessionId.set(token, id);
    return session;
  }

  getSession(sessionId: string | null | undefined): SessionRecord | null {
    const id = decodeSessionCookie(sessionId ?? undefined);
    if (!id) {
      return null;
    }

    const session = this.sessions.get(id);
    if (!session) {
      return null;
    }

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }

    session.expiresAt = Date.now() + this.ttlMs;
    return session;
  }

  validateSession(sessionId: string | null | undefined, token: string | null | undefined): boolean {
    if (!token || typeof token !== "string") {
      return false;
    }

    const session = this.getSession(sessionId);
    if (session) {
      return session.token === token;
    }

    const fallbackId = this.tokenToSessionId.get(token);
    if (!fallbackId) {
      return false;
    }

    const fallbackSession = this.sessions.get(fallbackId);
    if (!fallbackSession) {
      this.tokenToSessionId.delete(token);
      return false;
    }

    if (fallbackSession.expiresAt <= Date.now()) {
      this.sessions.delete(fallbackId);
      this.tokenToSessionId.delete(token);
      return false;
    }

    fallbackSession.expiresAt = Date.now() + this.ttlMs;
    return true;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.tokenToSessionId.delete(session.token);
        this.sessions.delete(key);
      }
    }
  }
}

export class RateLimiter {
  private readonly activeConnections = new Map<string, number>();
  private readonly messageWindows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxConnectionsPerIp = 5,
    private readonly maxMessagesPerMinute = 180,
  ) {}

  tryOpenConnection(ip: string): boolean {
    const current = this.activeConnections.get(ip) ?? 0;
    if (current >= this.maxConnectionsPerIp) {
      return false;
    }

    this.activeConnections.set(ip, current + 1);
    return true;
  }

  releaseConnection(ip: string): void {
    const current = this.activeConnections.get(ip) ?? 0;
    if (current <= 1) {
      this.activeConnections.delete(ip);
      return;
    }

    this.activeConnections.set(ip, current - 1);
  }

  allowMessage(ip: string): boolean {
    const now = Date.now();
    const windowEntry = this.messageWindows.get(ip);

    if (!windowEntry || windowEntry.resetAt <= now) {
      this.messageWindows.set(ip, {
        count: 1,
        resetAt: now + 60_000,
      });
      return true;
    }

    if (windowEntry.count >= this.maxMessagesPerMinute) {
      return false;
    }

    windowEntry.count += 1;
    return true;
  }
}

export function resolveClientIp(
  requestIp: string,
  xRealIpHeader: string | null,
  trustedProxyIps: Set<string>,
): string {
  const fromHeader = xRealIpHeader?.split(",")[0]?.trim();
  if (fromHeader && trustedProxyIps.has(requestIp)) {
    return fromHeader;
  }

  return requestIp;
}

export function sanitizeUserId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) {
    return null;
  }

  if (!/^[a-zA-Z0-9_.:@-]+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function parseClientMessage(data: unknown): ParsedMessage {
  const payload = typeof data === "string"
    ? data
    : data instanceof Uint8Array
    ? new TextDecoder().decode(data)
    : null;

  if (!payload) {
    return {
      ok: false,
      clientMessage: "Unsupported websocket payload format.",
      closeCode: 1003,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return {
      ok: false,
      clientMessage: "Invalid JSON payload.",
      closeCode: 1007,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      clientMessage: "Malformed payload.",
      closeCode: 1007,
    };
  }

  const type = typeof (parsed as { type?: unknown }).type === "string" ? (parsed as { type: string }).type : "fingerprint";
  const body = (parsed as { data?: unknown }).data;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      clientMessage: "Fingerprint payload must include a data object.",
      closeCode: 1007,
    };
  }

  return {
    ok: true,
    value: {
      type,
      data: body as Record<string, unknown>,
    },
  };
}
