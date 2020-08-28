import bodyParser from 'body-parser';
import config from './config';
import express from 'express';
import logger from './logger';
import Poller, { InstanceDetails, SystemStatus } from './autoscale_poller';
import CommandHandler from './command_handler';
import fs from 'fs';
import AsapRequest from './asap_request';
import StatsReporter, { StatsReport } from './stats_reporter';

const jwtSigningKey = fs.readFileSync(config.AsapSigningKeyFile);
const app = express();
app.use(bodyParser.json());

app.get('/health', (req: express.Request, res: express.Response) => {
    res.send('healthy!');
});

const instanceDetails: InstanceDetails = { instanceId: config.InstanceId, instanceType: config.InstanceType };
if (config.InstanceMetadata) {
    instanceDetails.group = config.InstanceMetadata.group;
    instanceDetails.cloud = config.InstanceMetadata.cloud;
    instanceDetails.region = config.InstanceMetadata.region;
}

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


async function pollForStats() {
    try {
        statsReport = await statsReporter.retrieveStatsReport();
    } catch (err) {
        logger.error('Error collecting stats', { err });
        statsReport = undefined;
    }
    setTimeout(pollForStats, config.StatsPollingInterval * 1000);
}

if (config.EnableReportStats) {
    pollForStats();
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
                // set reconfigure lock, only reconfigure if configure is not already running
                reconfigureLock = true;
                try {
                    await commandHandler.reconfigure();
                    statsReporter.setReconfigureError(false);
                } catch (err) {
                    statsReporter.setReconfigureError(true);
                }
                // reconfigure is done
                reconfigureLock = false;
            } else {
                logger.info('Reconfigure already detected, skipping reconfigure trigger');
            }
        }
    }
}
pollForStatus();

app.listen(config.HTTPServerPort, () => {
    logger.info(`...listening on :${config.HTTPServerPort}`);
});
