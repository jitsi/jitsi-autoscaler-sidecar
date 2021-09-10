import bodyParser from 'body-parser';
import config from './config';
import express, { Request, Response } from 'express';
import logger from './logger';
import Poller, { InstanceDetails, SystemStatus } from './autoscale_poller';
import CommandHandler from './command_handler';
import fs from 'fs';
import AsapRequest from './asap_request';
import StatsReporter, { StatsReport } from './stats_reporter';

const jwtSigningKey = fs.readFileSync(config.AsapSigningKeyFile);

const metadata = <unknown>config.InstanceMetadata;
const instanceDetails = <InstanceDetails>{
    instanceId: config.InstanceId,
    instanceType: config.InstanceType,
    ...(<InstanceDetails>metadata),
};

const commandHandler = new CommandHandler({
    gracefulScript: config.GracefulShutdownScript,
    terminateScript: config.TerminateScript,
    reconfigureScript: config.ReconfigureScript,
});

const asapRequest = new AsapRequest({
    signingKey: jwtSigningKey,
    asapJwtIss: config.AsapJwtIss,
    asapJwtAud: config.AsapJwtAud,
    asapJwtKid: config.AsapJwtKid,
});

const autoscalePoller = new Poller({
    pollUrl: config.PollingURL,
    statusUrl: config.StatusURL,
    statsUrl: config.StatsReportURL,
    instanceDetails: instanceDetails,
    asapRequest: asapRequest,
});

const statsReporter = new StatsReporter({
    retrieveUrl: config.StatsRetrieveURL,
    asapRequest: asapRequest,
    instanceDetails: instanceDetails,
});

logger.info('Starting up sidecar with config', { config });

// loop for polling, reporting stats when available
let statsReport: StatsReport;

let reconfigureLock = false;
let shutdownLock = false;

interface JibriMetadata {
    [key: string]: string;
}
interface JibriState {
    jibriId: string;
    status: unknown;
    timestamp?: number;
    metadata: JibriMetadata;
}

async function jibriStateWebhook(req: Request, res: Response) {
    const instate: JibriState = req.body;
    if (!instate.status) {
        res.sendStatus(400);
        return;
    }
    if (!instate.jibriId) {
        res.sendStatus(400);
        return;
    }

    // update global stats report with
    statsReport = statsReporter.buildStatsReport(instate);
    await autoscalePoller.reportStats(statsReport);
    res.status(200);
    res.send('{"status":"OK"}');
}

async function pollForStats() {
    try {
        statsReport = await statsReporter.retrieveStatsReport();
    } catch (err) {
        logger.error('Error collecting stats', { err });
        statsReport = undefined;
    }
    setTimeout(pollForStats, config.StatsPollingInterval * 1000);
}

async function pollForStatus() {
    let pollResult: SystemStatus;
    // poll for shutdown/reconfigure, optionally sending stats if available
    try {
        pollResult = await autoscalePoller.pollWithStats(statsReport);
    } catch (err) {
        logger.error('Polling failed', { err });
    }

    // trigger next tick of polling
    setTimeout(pollForStatus, config.ShutdownPollingInterval * 1000);

    // handle poll results, optionally shutting down or starting reconfigure
    if (pollResult.shutdown) {
        logger.info('Shutdown detected, triggering shutdown');
        if (!shutdownLock) {
            shutdownLock = true;
            statsReporter.setShutdownStatus(true);
            // shutting down, so don't do anything else
            try {
                await commandHandler.shutdown();
                statsReporter.setShutdownError(false);
            } catch (err) {
                statsReporter.setShutdownError(true);
                // unlock shutdown only if error occurred
                shutdownLock = false;
            }
        } else {
            logger.info('Shutdown already detected, skipping shutdown trigger');
        }
    } else {
        if (pollResult.reconfigure) {
            if (!reconfigureLock) {
                logger.info('Reconfigure detected, triggering reconfiguration');
                // set reconfigure lock, only reconfigure if configure is not already running
                reconfigureLock = true;
                try {
                    statsReporter.setReconfigureStart();
                    await commandHandler.reconfigure();
                    statsReporter.setReconfigureEnd(false);
                    logger.info('Reconfiguration completed');
                } catch (err) {
                    statsReporter.setReconfigureEnd(true);
                    logger.error('Reconfiguration failed', { err });
                }
                // reconfigure is done
                reconfigureLock = false;
            } else {
                logger.info('Reconfigure already running, skipping reconfigure trigger');
            }
        }
    }
}

if (config.EnableReportStats) {
    pollForStats().then(() => {
        pollForStatus();
    });
} else {
    pollForStatus();
}

const app = express();
app.use(bodyParser.json());

app.get('/health', (req: express.Request, res: express.Response) => {
    res.send('healthy!');
});

app.post('/hook/v1/status', async (req, res, next) => {
    try {
        await jibriStateWebhook(req, res);
    } catch (err) {
        next(err);
    }
});

app.listen(config.HTTPServerPort, () => {
    logger.info(`...listening on :${config.HTTPServerPort}`);
});
