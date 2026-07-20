import { Reader } from '@maxmind/geoip2-node';
export class GeoEnricher {
    cityDbPath;
    asnDbPath;
    cityReader = null;
    asnReader = null;
    initPromise = null;
    constructor(cityDbPath, asnDbPath) {
        this.cityDbPath = cityDbPath;
        this.asnDbPath = asnDbPath;
    }
    async init() {
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = (async () => {
            if (this.cityDbPath) {
                this.cityReader = await Reader.open(this.cityDbPath);
            }
            if (this.asnDbPath) {
                this.asnReader = await Reader.open(this.asnDbPath);
            }
        })();
        return this.initPromise;
    }
    async ensureInit() {
        if (this.initPromise === null)
            await this.init();
        else
            await this.initPromise;
    }
    async enrichCity(ip) {
        await this.ensureInit();
        if (!this.cityReader)
            return {};
        try {
            const result = this.cityReader.city(ip);
            return {
                country: result.country?.isoCode,
                countryName: result.country?.names?.en,
                city: result.city?.names?.en,
                subdivision: result.subdivisions?.[0]?.isoCode,
                latitude: result.location?.latitude,
                longitude: result.location?.longitude,
                timezone: result.location?.timeZone,
            };
        }
        catch {
            return {};
        }
    }
    async enrichAsn(ip) {
        await this.ensureInit();
        if (!this.asnReader)
            return {};
        try {
            const result = this.asnReader.asn(ip);
            return {
                asn: result.autonomousSystemNumber,
                asnOrg: result.autonomousSystemOrganization,
            };
        }
        catch {
            return {};
        }
    }
    async enrich(ip) {
        const [city, asn] = await Promise.all([
            this.enrichCity(ip),
            this.enrichAsn(ip),
        ]);
        return { ...city, ...asn };
    }
    close() {
        // maxmind reader has no explicit close — GC handles it
        this.cityReader = null;
        this.asnReader = null;
        this.initPromise = null;
    }
}
