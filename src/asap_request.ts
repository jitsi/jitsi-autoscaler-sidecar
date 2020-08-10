import NodeCache from 'node-cache';
import { sign } from 'jsonwebtoken';
import got, { CancelableRequest } from 'got';

export interface AsapRequestOptions {
    signingKey: Buffer;
    asapJwtIss: string;
    asapJwtAud: string;
    asapJwtKid: string;
    cacheTTL?: number;
}

export default class AsapRequest {
    private signingKey: Buffer;
    private asapCache: NodeCache;
    private asapJwtIss: string;
    private asapJwtAud: string;
    private asapJwtKid: string;
    private cacheTTL = 60 * 45;

    constructor(options: AsapRequestOptions) {
        this.signingKey = options.signingKey;
        this.asapJwtIss = options.asapJwtIss;
        this.asapJwtAud = options.asapJwtAud;
        this.asapJwtKid = options.asapJwtKid;

        if (options.cacheTTL !== undefined) {
            this.cacheTTL = options.cacheTTL;
        }
        this.asapCache = new NodeCache({ stdTTL: this.cacheTTL }); // TTL of 45 minutes
    }

    authToken(): string {
        const cachedAuth: string = this.asapCache.get('asap');
        if (cachedAuth) {
            return cachedAuth;
        }

        const auth = sign({}, this.signingKey, {
            issuer: this.asapJwtIss,
            audience: this.asapJwtAud,
            algorithm: 'RS256',
            keyid: this.asapJwtKid,
            expiresIn: 60 * 60, // 1 hour
        });

        this.asapCache.set('asap', auth);
        return auth;
    }

    async postJson(url: string, body: unknown): Promise<CancelableRequest> {
        const response = await got.post(url, {
            headers: {
                Authorization: `Bearer ${this.authToken()}`,
            },
            json: body,
            responseType: 'json',
        });

        return response;
    }

    async getJson(url: string): Promise<CancelableRequest> {
        const response = await got.get(url, {
            headers: {
                Authorization: `Bearer ${this.authToken()}`,
            },
            responseType: 'json',
        });

        return response;
    }
}
