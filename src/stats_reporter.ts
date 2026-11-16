import AsapRequest from './asap_request';
import { InstanceDetails } from './autoscale_poller';
import logger from './logger';

export interface StatsReporterOptions {
    retrieveUrl: string;
    asapRequest: AsapRequest;
    instanceDetails: InstanceDetails;

    /**
     * While retrieving stats keeps failing, a "still unavailable" warning is logged at most this often (ms).
     */
    failureLogIntervalMs?: number;

    /**
     * When retrieving stats keeps failing for this long (ms), one error is logged for the series of failures.
     * The local service is often not up for a short time after a boot, so shorter series log only warnings.
     */
    failureErrorAfterMs?: number;

    /**
     * Returns the current time in ms. Can be replaced in tests.
     */
    now?: () => number;
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
 * The longest error message (in characters) that is logged for a failed retrieval. An HTTP error can carry the
 * whole response body in its message.
 */
const MAX_LOGGED_ERROR_MESSAGE_LENGTH = 300;

/**
 * The fields of a failed retrieval error that are logged.
 */
interface RetrieveError {
    name?: string;
    code?: string;
    statusCode?: number;
    message?: string;
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
     * The number of retrievals in a row that failed.
     */
    private consecutiveFailures = 0;

    /**
     * The time of the first failure in the current series of failures.
     */
    private failingSince = 0;

    /**
     * The time of the last warning about a failed retrieval.
     */
    private lastFailureWarningAt = 0;

    /**
     * Whether the current series of failures has already logged an error.
     */
    private failureErrorLogged = false;
    private failureLogIntervalMs = 10 * 60 * 1000;
    private failureErrorAfterMs = 15 * 60 * 1000;
    private now: () => number = Date.now;

    /**
     * Constructs the reporter.
     * @param options the options to use.
     */
    constructor(options: StatsReporterOptions) {
        this.retrieveUrl = options.retrieveUrl;
        this.asapRequest = options.asapRequest;
        this.instanceDetails = options.instanceDetails;

        if (options.failureLogIntervalMs !== undefined) {
            this.failureLogIntervalMs = options.failureLogIntervalMs;
        }
        if (options.failureErrorAfterMs !== undefined) {
            this.failureErrorAfterMs = options.failureErrorAfterMs;
        }
        if (options.now) {
            this.now = options.now;
        }

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
                this.onRetrieveSuccess();

                return response;
            }
            this.onRetrieveFailure(new Error('Empty stats response'));
        } catch (err) {
            this.onRetrieveFailure(err);
        }
    }

    /**
     * Records a successful retrieval. Logs once when stats become available after failures.
     */
    private onRetrieveSuccess(): void {
        if (this.consecutiveFailures > 0) {
            logger.info('Stats are available again', {
                url: this.retrieveUrl,
                consecutiveFailures: this.consecutiveFailures,
                failingForMs: this.now() - this.failingSince
            });
            this.consecutiveFailures = 0;
            this.failureErrorLogged = false;
        }
    }

    /**
     * Records a failed retrieval. The local service is often not up yet (for example just after a boot), so
     * the first failure of a series is a warning, and repeats are summarized instead of logged each time.
     * A series that lasts longer than failureErrorAfterMs logs one error.
     * @param err the error.
     */
    private onRetrieveFailure(err: RetrieveError): void {
        const now = this.now();

        this.consecutiveFailures++;
        if (this.consecutiveFailures === 1) {
            this.failingSince = now;
        }

        const failingForMs = now - this.failingSince;
        const details = {
            url: this.retrieveUrl,
            name: err?.name,
            code: err?.code,
            statusCode: err?.statusCode,
            message: err?.message?.slice(0, MAX_LOGGED_ERROR_MESSAGE_LENGTH),
            consecutiveFailures: this.consecutiveFailures,
            failingForMs
        };

        if (this.consecutiveFailures === 1) {
            logger.warn('Failed to retrieve stats, will keep trying', details);
            this.lastFailureWarningAt = now;
        } else if (!this.failureErrorLogged && failingForMs >= this.failureErrorAfterMs) {
            logger.error('Stats unavailable for too long', details);
            this.failureErrorLogged = true;
            this.lastFailureWarningAt = now;
        } else if (now - this.lastFailureWarningAt >= this.failureLogIntervalMs) {
            logger.warn('Stats are still unavailable', details);
            this.lastFailureWarningAt = now;
        } else {
            logger.debug('Failed to retrieve stats', details);
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
