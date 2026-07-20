import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IpManager } from '../core/IpManager.js';
export type NextFunction = (err?: unknown) => void;
/**
 * Creates an Express-compatible middleware that resolves the real client IP
 * from X-Forwarded-For / X-Real-IP headers and attaches it to `req.resolvedIp`.
 *
 * This is a standalone utility — it does not call IpManager directly.
 * Use the resolved IP in your route handler when calling deviceManager.identify().
 */
export declare function createIpMiddleware(_ipManager?: IpManager): (req: IncomingMessage & {
    resolvedIp?: string;
}, _res: ServerResponse, next: NextFunction) => void;
/** Extract real IP respecting up to 2 trusted proxy hops */
export declare function resolveIp(req: IncomingMessage): string;
//# sourceMappingURL=middleware.d.ts.map