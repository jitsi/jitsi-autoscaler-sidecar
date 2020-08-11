import bodyParser from 'body-parser';
import config from './config';
import express from 'express';
import logger from './logger';
import Poller, { InstanceDetails } from './autoscale_poller';
import ShutdownHandler from './shutdown_handler';
import fs from 'fs';
import AsapRequest from './asap_request';
import StatsReporter from './stats_reporter';

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

const shutdownHandler = new ShutdownHandler({
    gracefulScript: config.GracefulShutdownScript,
    terminateScript: config.TerminateScript,
});

const asapRequest = new AsapRequest({
    signingKey: jwtSigningKey,
    asapJwtIss: config.AsapJwtIss,
    asapJwtAud: config.AsapJwtAud,
    asapJwtKid: config.AsapJwtKid,
});

const autoscalePoller = new Poller({
    pollUrl: config.PollingURL,
    instanceDetails: instanceDetails,
    shutdownHandler: shutdownHandler,
    asapRequest: asapRequest,
});

async function pollForShutdown() {
    if (await autoscalePoller.checkForShutdown()) {
        setTimeout(pollForShutdown, config.ShutdownPollingInterval * 1000);
    } else {
        // shutdown found, stop polling
        logger.info('Shutdown detected, stop polling for shutdown');
    }
}
pollForShutdown();

const statsReporter = new StatsReporter({
    retrieveUrl: config.StatsRetrieveURL,
    reportUrl: config.StatsReportURL,
    instanceDetails: instanceDetails,
    asapRequest: asapRequest,
});

async function pollForStats() {
    await statsReporter.run();
    setTimeout(pollForStats, config.StatsPollingInterval * 1000);
}

if (config.EnableReportStats) {
    pollForStats();
}

app.listen(config.HTTPServerPort, () => {
    logger.info(`...listening on :${config.HTTPServerPort}`);
});
