import logger from './logger';
import AsapRequest from './asap_request';
import { InstanceDetails } from './autoscale_poller';

export interface StatsReporterOptions {
    retrieveUrl: string;
    asapRequest: AsapRequest;
    instanceDetails: InstanceDetails;
}

export interface StatsReport {
    instance: InstanceDetails;
    stats: unknown;
    shutdownStatus: boolean;
    reconfigureStatus: boolean;
    shutdownError: boolean;
    reconfigureError: boolean;
    statsError: boolean;
    timestamp: number;
    reconfigureComplete: string;
}

export default class StatsReporter {
    private retrieveUrl: string;
    private instanceDetails: InstanceDetails;
    private asapRequest: AsapRequest;
    private shutdownStatus: boolean;
    private shutdownError: boolean;
    private reconfigureError: boolean;
    private reconfigureComplete: string;
    private reconfigureStarted: Date;
    private statsError: boolean;

    constructor(options: StatsReporterOptions) {
        this.retrieveUrl = options.retrieveUrl;
        this.asapRequest = options.asapRequest;
        this.instanceDetails = options.instanceDetails;

        this.shutdownStatus = false;
        this.shutdownError = false;
        this.reconfigureError = false;
        this.reconfigureComplete = '';
        this.statsError = false;

        this.retrieveStats = this.retrieveStats.bind(this);
        this.setShutdownStatus = this.setShutdownStatus.bind(this);
        this.retrieveStatsReport = this.retrieveStatsReport.bind(this);
    }

    setShutdownStatus(status: boolean): void {
        this.shutdownStatus = status;
    }

    setShutdownError(status: boolean): void {
        this.shutdownError = status;
    }

    setReconfigureStart(): void {
        // initialize the reconfiguration error handler and start time
        this.reconfigureStarted = new Date();
        this.reconfigureError = false;
    }

    setReconfigureEnd(status: boolean): void {
        this.reconfigureError = status;
        this.reconfigureComplete = this.reconfigureStarted.toUTCString();
        this.reconfigureStarted = undefined;
    }

    setStatsError(status: boolean): void {
        this.statsError = status;
    }

    async retrieveStats(): Promise<unknown> {
        try {
            const response = await this.asapRequest.getJson(this.retrieveUrl);
            if (response) {
                return response;
            }
        } catch (err) {
            logger.error('RetrieveStats Error', { err, url: this.retrieveUrl });
        }
    }

    async retrieveStatsReport(): Promise<StatsReport> {
        let stats = await this.retrieveStats();
        if (stats) {
            // clear any previous stats errors that may have been raised
            this.setStatsError(false);
        } else {
            logger.error('Empty stats, error occurred, returning blank report');
            this.setStatsError(true);
            stats = {};
        }
        const report = this.buildStatsReport(stats);
        return report;
    }

    buildStatsReport(stats: unknown): StatsReport {
        const ts = new Date();
        const report = <StatsReport>{
            instance: this.instanceDetails,
            stats,
            timestamp: ts.getTime(),
            shutdownStatus: this.shutdownStatus,
            shutdownError: this.shutdownError,
            reconfigureError: this.reconfigureError,
            reconfigureComplete: this.reconfigureComplete,
            statsError: this.statsError,
        };
        logger.debug('Stats report', { report });

        return report;
    }
}
