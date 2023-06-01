import got, { CancelableRequest } from 'got';
import { sign } from 'jsonwebtoken';
import NodeCache from 'node-cache';

export interface AsapRequestOptions {
    signingKey: Buffer;
    asapJwtIss: string;
    asapJwtAud: string;
    asapJwtKid: string;
    cacheTTL?: number;
    requestTimeout?: number;
    requestRetryCount?: number;
}

/**
 * The asap request.
 */
export default class AsapRequest {
    private signingKey: Buffer;
    private asapCache: NodeCache;
    private asapJwtIss: string;
    private asapJwtAud: string;
    private asapJwtKid: string;
    private cacheTTL = 60 * 45;
    private requestTimeout = 3 * 1000;
    private requestRetryCount = 2;

    /**
     * Constructs request.
     * @param options
     */
    constructor(options: AsapRequestOptions) {
        this.signingKey = options.signingKey;
        this.asapJwtIss = options.asapJwtIss;
        this.asapJwtAud = options.asapJwtAud;
        this.asapJwtKid = options.asapJwtKid;

        if (options.requestTimeout !== undefined) {
            this.requestTimeout = options.requestTimeout;
        }
        if (options.requestRetryCount !== undefined) {
            this.requestRetryCount = options.requestRetryCount;
        }

        if (options.cacheTTL !== undefined) {
            this.cacheTTL = options.cacheTTL;
        }
        this.asapCache = new NodeCache({ stdTTL: this.cacheTTL }); // TTL of 45 minutes

        this.authToken = this.authToken.bind(this);
        this.postJson = this.postJson.bind(this);
        this.getJson = this.getJson.bind(this);
    }

    /**
     * Returns an auth token.
     */
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
            expiresIn: 60 * 60 // 1 hour
        });

        this.asapCache.set('asap', auth);

        return auth;
    }

    /**
     * Posts a json to the specified url.
     * @param url the url.
     * @param body the body to add.
     */
    async postJson(url: string, body: unknown): Promise<CancelableRequest> {
        const response = await got.post(url, {
            headers: {
                Authorization: `Bearer ${this.authToken()}`
            },
            json: body,
            responseType: 'json',
            timeout: this.requestTimeout,
            retry: this.requestRetryCount
        });

        return response.body;
    }

    /**
     * Gets a json from url.
     * @param url the url to use.
     */
    async getJson(url: string): Promise<CancelableRequest> {
        const response = await got.get(url, {
            headers: {
                Authorization: `Bearer ${this.authToken()}`
            },
            responseType: 'json',
            timeout: this.requestTimeout,
            retry: this.requestRetryCount
        });

        return response.body;
    }
}
