import AsapRequest, { AutoscalerRequestError } from './asap_request';
import logger from './logger';
import { StatsReport } from './stats_reporter';

// instanceId should  match either the instance or a container or job id
// hostId may match the underlying host instance id
export interface InstanceDetails {
    instanceId: string;
    instanceType: string;
    hostId?: string;
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
     * Logs a failed autoscaler request. The autoscaler rejects reports that do not identify the instance and
     * its group (400) and reports for a group it does not know (404); both indicate a sidecar
     * misconfiguration rather than a transient failure, so they are called out explicitly.
     * @param message the log message.
     * @param err the error.
     * @param postURL the url that was requested.
     */
    private logRequestError(message: string, err: unknown, postURL: string): void {
        if (err instanceof AutoscalerRequestError) {
            const details = {
                statusCode: err.statusCode,
                errors: AutoscalerRequestError.describe(err.body),
                postURL,
                group: this.instanceDetails.group,
                instanceId: this.instanceDetails.instanceId
            };

            if (err.statusCode === 404) {
                logger.error(`${message}: the autoscaler does not know group `
                    + `'${this.instanceDetails.group}'; check INSTANCE_METADATA.group and the autoscaler URL`, details);
            } else if (err.statusCode === 400) {
                logger.error(`${message}: the autoscaler rejected the report`, details);
            } else {
                logger.error(message, details);
            }

            return;
        }
        logger.error(message, { err,
            postURL });
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
            this.logRequestError('Error sending shutdown report', err, this.shutdownUrl);
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
            this.logRequestError('Error sending stats report', err, this.statsUrl);
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
            this.logRequestError('Error polling the autoscaler for system status', err, postURL);
        }

        return status;
    }
}
