# ip-devicer

**IP Intelligence Middleware** for the FP-Devicer Intelligence Suite.
Developed by [Gateway Corporate Solutions](https://gatewaycorporate.org).

---

## Overview

`ip-devicer` enriches every `DeviceManager.identify()` call with production IP
signals: MaxMind geolocation, ASN metadata, proxy/VPN/Tor/hosting detection,
AI-agent detection, reputation scoring, impossible-travel alerts, and device IP
history consistency.

### What it does

| Step | Description |
|------|-------------|
| **IP extraction** | Resolves the best client IP from trusted headers (`CF-Connecting-IP`, `True-Client-IP`, `X-Real-IP`, `X-Forwarded-For`) or the explicit `ip` context field. |
| **Geo + ASN enrichment** | Loads MaxMind city and ASN data for country, city, subdivision, coordinates, timezone, ASN, and organization. |
| **Network classification** | Flags proxy, VPN, Tor, and hosting-provider ranges using bundled or configured intelligence lists. |
| **AI-agent tagging** | Identifies known AI-agent traffic and attaches provider metadata when matched. |
| **Reputation scoring** | Computes a risk score from network and behavioral factors. |
| **History consistency** | Compares the current IP and location against device history to detect drift and impossible travel. |

---

## Installation

Install `ip-devicer` as a standalone package:

```bash
npm install ip-devicer
```

Install the bundled network-intelligence pair with FP-Devicer:

```bash
npm install devicer.js ip-devicer tls-devicer
```

Optional peer dependencies for persistent storage:

```bash
npm install better-sqlite3
npm install ioredis
npm install pg
```

Install the full Devicer Intelligence Suite meta-package:

```bash
npm install @gatewaycorporate/devicer-intel
```

---

## Quick start

```typescript
import { createInMemoryAdapter, DeviceManager } from "devicer.js";
import { IpManager } from "ip-devicer";

const deviceManager = new DeviceManager(createInMemoryAdapter());
const ipManager = new IpManager({
	licenseKey: process.env.DEVICER_LICENSE_KEY,
	maxmindPath: "./data/GeoLite2-City.mmdb",
	asnPath: "./data/GeoLite2-ASN.mmdb",
	enableReputation: true,
});

deviceManager.use(ipManager);

app.post("/identify", async (req, res) => {
	const result = await deviceManager.identify(req.body.fpPayload, {
		ip: req.ip,
		userId: req.user?.id,
		headers: req.headers,
	});

	console.log("IP Enrichment Result:", {
		deviceId: result.deviceId,
		confidence: result.confidence,
		ipRiskDelta: result.ipRiskDelta,
		enrichment: result.ipEnrichment,
	});

	res.json(result);
});
```

Known AI-agent traffic from the conservative default catalog is attached to
`ipEnrichment.agentInfo` and included in the `IpManager` logging metadata.

---

## Storage adapters

| Adapter | Import | Use case |
|---------|--------|----------|
| In-memory *(default)* | `createIpStorage` | Dev / testing / single-process |
| SQLite | `createSqliteIpStorage` | Single-process production |
| PostgreSQL | `createPostgresIpStorage` | Multi-process / HA |
| Redis | `createRedisIpStorage` | Distributed / low-latency |

```typescript
import { createSqliteIpStorage, IpManager } from "ip-devicer";

const ipManager = new IpManager({
	licenseKey: process.env.DEVICER_LICENSE_KEY,
	maxmindPath: "./data/GeoLite2-City.mmdb",
	asnPath: "./data/GeoLite2-ASN.mmdb",
	storage: createSqliteIpStorage("./data/ip-history.db", 50),
});
```

---

## Recommended setup

To get full value from `ip-devicer`, configure MaxMind locally:

1. Create a free MaxMind account at maxmind.com.
2. Generate a license key in the MaxMind portal.
3. Download the latest `GeoLite2-City.mmdb` and `GeoLite2-ASN.mmdb`.
4. Store both files under `./data/` or another secure path and add them to
	 `.gitignore`.

If request headers include `CF-Connecting-IP`, `True-Client-IP`, or `X-Real-IP`,
`ip-devicer` prefers those values over a proxy-populated `ip` field. If those
headers are absent, it falls back to the explicit `ip` value and then the first
`X-Forwarded-For` address.

---

## Plugin pipeline

Reference deployments typically bundle `ip-devicer` and `tls-devicer` together
as the network-intelligence pair.

```text
identify(payload, context)
	 │
	 ├─ 'ip'  post-processor  (ip-devicer)
	 │     ├─ resolves client IP from headers/context
	 │     ├─ enriches geo / ASN / risk / AI-agent data
	 │     └─> result.ipEnrichment + result.ipRiskDelta
	 │
	 └─ 'tls' post-processor  (tls-devicer, optional companion bundle)
				 └─> complementary JA4 / TLS consistency signals
```

---

## Enrichment result shape

```typescript
{
	ipEnrichment: {
		country?: string;
		countryName?: string;
		city?: string;
		subdivision?: string;
		latitude?: number;
		longitude?: number;
		timezone?: string;
		asn?: number;
		asnOrg?: string;
		isProxy: boolean;
		isVpn: boolean;
		isTor: boolean;
		isHosting: boolean;
		agentInfo?: {
			isAiAgent: boolean;
			aiAgentProvider?: string;
			aiAgentConfidence?: number;
		};
		rdapInfo: {
			asn?: number;
			asnOrg?: string;
		};
		riskScore: number;
		riskFactors: string[];
		consistencyScore: number;
		impossibleTravel: boolean;
	};
	ipRiskDelta?: number;
}
```

---

## License tiers

| Tier | Price | Devices | Capability |
|------|-------|---------|------------|
| Free | $0 | 10,000 | Basic features only |
| Pro | $49 / mo | Unlimited | Single-server production |
| Enterprise | $299 / mo | Unlimited | Multi-server production |

Production use requires a paid license. You can obtain a dual-use key for
`ip-devicer` and `tls-devicer` through polar.sh
[here](https://buy.polar.sh/polar_cl_0Y4djPLDe5yLdNUDKdtPGlFW5TG2ZpFD5qkb93HsSQc).

---

## API reference

This project uses TypeDoc and publishes documentation at
[gatewaycorporate.github.io/ip-devicer](https://gatewaycorporate.github.io/ip-devicer/).

---

## License

Business Source License 1.1 — see [license.txt](./license.txt).
