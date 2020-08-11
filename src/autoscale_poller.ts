import logger from './logger';
import ShutdownHandler from './shutdown_handler';
import AsapRequest from './asap_request';

export interface AutoscalePollerOptions {
    pollUrl: string;
    instanceDetails: InstanceDetails;
    shutdownHandler: ShutdownHandler;
    asapRequest: AsapRequest;
}

export interface InstanceDetails {
    instanceId: string;
    cloud?: string;
    region?: string;
    group?: string;
}

export interface ShutdownStatus {
    shutdown: boolean;
}

export default class AutoscalePoller {
    private instanceDetails: InstanceDetails;
    private pollUrl: string;
    private shutdownHandler: ShutdownHandler;
    private asapRequest: AsapRequest;

    constructor(options: AutoscalePollerOptions) {
        this.pollUrl = options.pollUrl;
        this.instanceDetails = options.instanceDetails;
        this.shutdownHandler = options.shutdownHandler;
        this.asapRequest = options.asapRequest;

        this.checkForShutdown = this.checkForShutdown.bind(this);
    }

    async requestShutdownStatus(): Promise<boolean> {
        // TODO: actually poll
        try {
            const response = await this.asapRequest.postJson(this.pollUrl, this.instanceDetails);

            if (response) {
                const status: ShutdownStatus = <ShutdownStatus>response;
                logger.debug('Received response', { status });
                if (status.shutdown) {
                    logger.info('Received shutdown status');
                    return true;
                }
            }
            return false;
        } catch (err) {
            logger.error('Error polling for shutdown', { err });
            return false;
        }
    }

    async checkForShutdown(): Promise<boolean> {
        logger.info('Checking for shutdown', { pollUrl: this.pollUrl, details: this.instanceDetails });

        // check for shutdown message
        if (await this.requestShutdownStatus()) {
            await this.shutdownHandler.shutdown();
            return false;
        }

        return true;
    }
}
