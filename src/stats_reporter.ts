import AsapRequest from './asap_request';
import { InstanceDetails } from './autoscale_poller';
import logger from './logger';

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

/**
 * The stats reporter.
 */
export default class StatsReporter {
    private retrieveUrl: string;
    private instanceDetails: InstanceDetails;
    private asapRequest: AsapRequest;
    private shutdownStatus: boolean;
    private shutdownError: boolean;
    private reconfigureError: boolean;

    /**
     * A string identifying the completed reconfigure request; the reconfigure request identifier was initially
     * received via the reconfigureStarted parameter.
    */
    private reconfigureComplete: string;

    /**
     * A string identifying the reconfigure request, representing the timestamp when the autoscaler received the
     * reconfigure request
    */
    private reconfigureStarted: string;
    private statsError: boolean;

    /**
     * Constructs the reporter.
     * @param options the options to use.
     */
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

    /**
     * Sets shutdown status.
     * @param status the new value.
     */
    setShutdownStatus(status: boolean): void {
        this.shutdownStatus = status;
    }

    /**
     * Sets shutdown error.
     * @param shutdownError the new value.
     */
    setShutdownError(shutdownError: boolean): void {
        this.shutdownError = shutdownError;
    }

    /**
     * Sets reconfigure start value.
     * @param reconfigureStarted the new value.
     */
    setReconfigureStart(reconfigureStarted: string): void {
        // initialize the reconfiguration error handler and start time
        this.reconfigureStarted = reconfigureStarted;
        this.reconfigureError = false;
    }

    /**
     * Sets reconfigure end value.
     * @param reconfigureError the new value.
     */
    setReconfigureEnd(reconfigureError: boolean): void {
        this.reconfigureError = reconfigureError;
        this.reconfigureComplete = this.reconfigureStarted;
        this.reconfigureStarted = undefined;
    }

    /**
     * Sets stats error.
     * @param status the new value.
     */
    setStatsError(status: boolean): void {
        this.statsError = status;
    }

    /**
     * Retrieves the stats json.
     */
    async retrieveStats(): Promise<unknown> {
        try {
            const response = await this.asapRequest.getJson(this.retrieveUrl);

            if (response) {
                return response;
            }
        } catch (err) {
            logger.error('RetrieveStats Error', { err,
                url: this.retrieveUrl });
        }
    }

    /**
     * Retrieves the stats report from the json.
     */
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

    /**
     * Build a stats report.
     * @param stats the stats to use.
     */
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
            statsError: this.statsError
        };

        logger.debug('Stats report', { report });

        return report;
    }
}
