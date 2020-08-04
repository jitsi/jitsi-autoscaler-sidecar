import logger from './logger';
import ShutdownHandler from './shutdown_handler';
import got from 'got';
import NodeCache from 'node-cache';
import { sign } from 'jsonwebtoken';

export interface AutoscalePollerOptions {
    pollUrl: string;
    signingKey: Buffer;
    asapJwtIss: string;
    asapJwtAud: string;
    asapJwtKid: string;
    instanceDetails: InstanceDetails;
    shutdownHandler: ShutdownHandler;
}

export interface InstanceDetails {
    instanceId: string;
    cloud?: string;
    region?: string;
    group?: string;
}

export default class AutoscalePoller {
    private instanceDetails: InstanceDetails;
    private pollUrl: string;
    private shutdownHandler: ShutdownHandler;
    private signingKey: Buffer;
    private asapCache: NodeCache;
    private asapJwtIss: string;
    private asapJwtAud: string;
    private asapJwtKid: string;

    constructor(options: AutoscalePollerOptions) {
        this.pollUrl = options.pollUrl;
        this.signingKey = options.signingKey;
        this.asapCache = new NodeCache({ stdTTL: 60 * 45 }); // TTL of 45 minutes
        this.asapJwtIss = options.asapJwtIss;
        this.asapJwtAud = options.asapJwtAud;
        this.asapJwtKid = options.asapJwtKid;
        this.instanceDetails = options.instanceDetails;
        this.shutdownHandler = options.shutdownHandler;

        this.pollForShutdown = this.pollForShutdown.bind(this);
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

    async requestShutdownStatus(): Promise<boolean> {
        // TODO: actually poll
        try {
            const response = await got(this.pollUrl, {
                headers: {
                    Authorization: `Bearer ${this.authToken()}`,
                },
            });

            if (response.body) {
                const shutdownStatus = JSON.parse(response.body);
                if (shutdownStatus.shutdown) {
                    return true;
                }
            }
            return false;
        } catch (err) {
            logger.error('Error polling for shutdown', { err });
            return false;
        }
    }

    async pollForShutdown(): Promise<boolean> {
        // TODO: actually poll
        logger.info('Polling for shutdown', { pollUrl: this.pollUrl, details: this.instanceDetails });

        // check for shutdown message
        if (await this.requestShutdownStatus()) {
            await this.shutdownHandler.shutdown();
            return false;
        }

        return true;
    }
}
