import got, { CancelableRequest, HTTPError } from 'got';
import { sign } from 'jsonwebtoken';
import NodeCache from 'node-cache';

/**
 * Error raised when the autoscaler answers with a non-2xx status. Carries the status code and the
 * parsed response body (the autoscaler returns `{ errors: [...] }` for rejected requests), so callers
 * can log the actual reason instead of only the status code.
 */
export class AutoscalerRequestError extends Error {
    readonly statusCode: number;
    readonly body: unknown;
    readonly url: string;

    /**
     * Constructs the error.
     * @param url the url that was requested.
     * @param statusCode the http status code.
     * @param body the parsed response body.
     */
    constructor(url: string, statusCode: number, body: unknown) {
        super(`Autoscaler responded ${statusCode} for ${url}: ${AutoscalerRequestError.describe(body)}`);
        this.name = 'AutoscalerRequestError';
        this.url = url;
        this.statusCode = statusCode;
        this.body = body;
    }

    /**
     * Renders one entry of the `errors` array as a string.
     * @param e the entry.
     */
    private static stringify(e: unknown): string {
        if (typeof e === 'string') {
            return e;
        }

        return JSON.stringify(e);
    }

    /**
     * Renders the `errors` array (or the whole body) as a short string for log messages.
     * @param body the response body.
     */
    static describe(body: unknown): string {
        const maybe = <{ errors?: unknown }>body;
        const errors = maybe && typeof maybe === 'object' ? maybe.errors : undefined;

        if (Array.isArray(errors)) {
            return errors.map(AutoscalerRequestError.stringify).join('; ');
        }
        if (body === undefined || body === null || body === '') {
            return '(empty body)';
        }

        return typeof body === 'string' ? body : JSON.stringify(body);
    }

    /**
     * Wraps a got error into an AutoscalerRequestError when it carries an HTTP response.
     * @param url the url that was requested.
     * @param err the error thrown by got.
     */
    static fromError(url: string, err: unknown): unknown {
        if (err instanceof HTTPError) {
            return new AutoscalerRequestError(url, err.response.statusCode, err.response.body);
        }

        return err;
    }
}

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
        try {
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
        } catch (err) {
            throw AutoscalerRequestError.fromError(url, err);
        }
    }

    /**
     * Gets a json from url.
     * @param url the url to use.
     */
    async getJson(url: string): Promise<CancelableRequest> {
        try {
            const response = await got.get(url, {
                headers: {
                    Authorization: `Bearer ${this.authToken()}`
                },
                responseType: 'json',
                timeout: this.requestTimeout,
                retry: this.requestRetryCount
            });

            return response.body;
        } catch (err) {
            throw AutoscalerRequestError.fromError(url, err);
        }
    }
}
