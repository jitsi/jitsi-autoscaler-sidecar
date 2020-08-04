import logger from './logger';
import ShutdownHandler from './shutdown_handler';

export interface AutoscalePollerOptions {
    pollUrl: string;
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

    constructor(options: AutoscalePollerOptions) {
        this.pollUrl = options.pollUrl;
        this.instanceDetails = options.instanceDetails;
        this.shutdownHandler = options.shutdownHandler;

        this.pollForShutdown = this.pollForShutdown.bind(this);
    }

    async requestShutdownStatus(): Promise<boolean> {
        // TODO: actually poll
        return false;
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
