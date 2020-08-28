import logger from './logger';
import AsapRequest from './asap_request';
import { StatsReport } from './stats_reporter';

export interface AutoscalePollerOptions {
    pollUrl: string;
    statusUrl: string;
    instanceDetails: InstanceDetails;
    asapRequest: AsapRequest;
}

export interface InstanceDetails {
    instanceId: string;
    instanceType: string;
    cloud?: string;
    region?: string;
    group?: string;
}

export interface SystemStatus {
    shutdown: boolean;
    reconfigure: boolean;
}

export default class AutoscalePoller {
    private instanceDetails: InstanceDetails;
    private pollUrl: string;
    private statusUrl: string;
    private asapRequest: AsapRequest;

    constructor(options: AutoscalePollerOptions) {
        this.pollUrl = options.pollUrl;
        this.statusUrl = options.statusUrl;
        this.instanceDetails = options.instanceDetails;
        this.asapRequest = options.asapRequest;

        this.pollWithStats = this.pollWithStats.bind(this);
    }

    async pollWithStats(statsReport: StatsReport): Promise<SystemStatus> {
        let body: unknown;
        let postURL: string;
        if (statsReport) {
            // stats are available so use status URL
            body = statsReport;
            postURL = this.statusUrl;
            logger.info('Stats report available, sending in request', { body });
        } else {
            body = this.instanceDetails;
            postURL = this.pollUrl;
            logger.info('Stats report not available, only sending instance info', { body });
        }
        let status = <SystemStatus>{ shutdown: false, reconfigure: false };
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
            logger.error('Error polling for status', { err });
        }
        return status;
    }
}
