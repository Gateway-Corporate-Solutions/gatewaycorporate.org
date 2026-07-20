/**
 * Creates an Express-compatible middleware that resolves the real client IP
 * from X-Forwarded-For / X-Real-IP headers and attaches it to `req.resolvedIp`.
 *
 * This is a standalone utility — it does not call IpManager directly.
 * Use the resolved IP in your route handler when calling deviceManager.identify().
 */
export function createIpMiddleware(_ipManager) {
    return function ipMiddleware(req, _res, next) {
        req.resolvedIp = resolveIp(req);
        next();
    };
}
/** Extract real IP respecting up to 2 trusted proxy hops */
export function resolveIp(req) {
    const cloudflareIp = req.headers['cf-connecting-ip'];
    if (cloudflareIp) {
        return Array.isArray(cloudflareIp) ? cloudflareIp[0] : cloudflareIp;
    }
    const trueClientIp = req.headers['true-client-ip'];
    if (trueClientIp) {
        return Array.isArray(trueClientIp) ? trueClientIp[0] : trueClientIp;
    }
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        return Array.isArray(realIp) ? realIp[0] : realIp;
    }
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
        const ips = (Array.isArray(xff) ? xff[0] : xff)
            .split(',')
            .map((s) => s.trim());
        // First IP in XFF chain is the client
        if (ips[0])
            return ips[0];
    }
    return req.socket.remoteAddress ?? 'unknown';
}
