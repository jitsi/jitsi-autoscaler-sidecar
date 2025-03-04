import AsapRequest from './asap_request';
import logger from './logger';
import { StatsReport } from './stats_reporter';

export interface InstanceDetails {
    instanceId: string;
    instanceType: string;
    cloud?: string;
    region?: string;
    group?: string;
    privateIp?: string;
    publicIp?: string;
}

export interface AutoscalePollerOptions {
    pollUrl: string;
    statusUrl: string;
    statsUrl: string;
    shutdownUrl: string;
    instanceDetails: InstanceDetails;
    asapRequest: AsapRequest;
}

export interface SystemStatus {
    shutdown: boolean;
    reconfigure: string;
}

/**
 * The autoscale poller.
 */
export default class AutoscalePoller {
    private instanceDetails: InstanceDetails;
    private pollUrl: string;
    private statusUrl: string;
    private statsUrl: string;
    private shutdownUrl: string;
    private asapRequest: AsapRequest;

    /**
     * Constructs the poller.
     * @param options the options.
     */
    constructor(options: AutoscalePollerOptions) {
        this.pollUrl = options.pollUrl;
        this.statusUrl = options.statusUrl;
        this.statsUrl = options.statsUrl;
        this.shutdownUrl = options.shutdownUrl;
        this.instanceDetails = options.instanceDetails;
        this.asapRequest = options.asapRequest;

        this.pollWithStats = this.pollWithStats.bind(this);
    }

    /**
     * Reports shutdown status by sending a json.
     */
    async reportShutdown(): Promise<boolean> {
        try {
            if (!this.shutdownUrl) {
                throw new Error('No shutdown URL configured');
            }
            await this.asapRequest.postJson(this.shutdownUrl, this.instanceDetails);

            return true;
        } catch (err) {
            logger.error('Error sending shutdown report', { err,
                traceback: err.traceback });
        }

        return false;
    }

    /**
     * Reports stats by sending a json.
     * @param statsReport
     */
    async reportStats(statsReport: StatsReport): Promise<void> {
        try {
            await this.asapRequest.postJson(this.statsUrl, statsReport);
        } catch (err) {
            logger.error('Error sending stats report', { err,
                traceback: err.traceback });
        }
    }

    /**
     * Poll the stats.
     * @param statsReport the stats to report.
     */
    async pollWithStats(statsReport: StatsReport): Promise<SystemStatus> {
        let body: unknown;
        let postURL: string;

        if (statsReport) {
            // stats are available so use status URL
            body = statsReport;
            postURL = this.statusUrl;
            logger.debug('Stats report available, sending in request', { body,
                postURL });
        } else {
            body = this.instanceDetails;
            postURL = this.pollUrl;
            logger.debug('Stats report not available, only sending instance info', { body,
                postURL });
        }
        let status = <SystemStatus>{ shutdown: false,
            reconfigure: '' };

        try {
            const response = await this.asapRequest.postJson(postURL, body);

            if (response) {
                status = <SystemStatus>response;
                logger.debug('Received response', { status });
                if (status.reconfigure) {
                    logger.info('Received reconfigure command');
                }
                if (status.shutdown) {
                    logger.info('Received shutdown command');
                }
            }
        } catch (err) {
            logger.error('Error polling the autoscaler for system status', { err,
                postURL });
        }

        return status;
    }
}
