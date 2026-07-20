// ── Haversine ─────────────────────────────────────────────────
const EARTH_RADIUS_KM = 6371;
function toRad(deg) {
    return (deg * Math.PI) / 180;
}
export function haversineKm(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}
// ── Impossible travel ─────────────────────────────────────────
export function detectImpossibleTravel(current, last, thresholdKmh) {
    const distanceKm = haversineKm(last.lat, last.lon, current.lat, current.lon);
    const elapsedHours = Math.abs(current.ts.getTime() - last.ts.getTime()) / (1000 * 60 * 60);
    if (elapsedHours === 0)
        return distanceKm > 0;
    const speedKmh = distanceKm / elapsedHours;
    return speedKmh > thresholdKmh;
}
// ── Risk delta ────────────────────────────────────────────────
export function computeRiskDelta(current, history) {
    if (history.length === 0)
        return 0;
    const avg = history.reduce((sum, s) => sum + s.enrichment.riskScore, 0) / history.length;
    return current.riskScore - avg;
}
// ── Consistency score ─────────────────────────────────────────
const CONSISTENCY_WEIGHTS = {
    country: 40,
    asn: 30,
    city: 20,
    flags: 10,
};
export function computeConsistencyScore(current, history) {
    if (history.length === 0)
        return 100;
    const last = history[0].enrichment;
    let score = 0;
    if (current.country !== undefined && last.country !== undefined) {
        if (current.country === last.country)
            score += CONSISTENCY_WEIGHTS.country;
    }
    else {
        score += CONSISTENCY_WEIGHTS.country; // unknown → neutral
    }
    if (current.asn !== undefined && last.asn !== undefined) {
        if (current.asn === last.asn)
            score += CONSISTENCY_WEIGHTS.asn;
    }
    else {
        score += CONSISTENCY_WEIGHTS.asn;
    }
    if (current.city !== undefined && last.city !== undefined) {
        if (current.city === last.city)
            score += CONSISTENCY_WEIGHTS.city;
    }
    else {
        score += CONSISTENCY_WEIGHTS.city;
    }
    const flagsMatch = current.isTor === last.isTor &&
        current.isVpn === last.isVpn &&
        current.isProxy === last.isProxy;
    if (flagsMatch)
        score += CONSISTENCY_WEIGHTS.flags;
    return score;
}
