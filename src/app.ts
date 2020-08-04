import bodyParser from 'body-parser';
import config from './config';
import express from 'express';
import logger from './logger';
import Poller, { InstanceDetails } from './autoscale_poller';
import ShutdownHandler from './shutdown_handler';
import fs from 'fs';

const jwtSigningKey = fs.readFileSync(config.AsapSigningKeyFile);
const app = express();
app.use(bodyParser.json());

app.get('/health', (req: express.Request, res: express.Response) => {
    res.send('healthy!');
});

const instanceDetails: InstanceDetails = { instanceId: config.InstanceId };
if (config.InstanceMetadata) {
    instanceDetails.group = config.InstanceMetadata.group;
    instanceDetails.instanceId = config.InstanceId;
    instanceDetails.cloud = config.InstanceMetadata.cloud;
    instanceDetails.region = config.InstanceMetadata.region;
}

const shutdownHandler = new ShutdownHandler({
    gracefulScript: config.GracefulShutdownScript,
    terminateScript: config.TerminateScript,
});

const autoscalePoller = new Poller({
    pollUrl: config.PollingURL,
    signingKey: jwtSigningKey,
    asapJwtIss: config.AsapJwtIss,
    asapJwtAud: config.AsapJwtAud,
    asapJwtKid: config.AsapJwtKid,
    instanceDetails: instanceDetails,
    shutdownHandler: shutdownHandler,
});

async function pollForShutdown() {
    if (await autoscalePoller.pollForShutdown()) {
        setTimeout(pollForShutdown, config.PollingInterval * 1000);
    } else {
        // shutdown found, stop polling
        logger.info('Shutdown detected, stop polling for shutdown');
    }
}
pollForShutdown();

app.listen(config.HTTPServerPort, () => {
    logger.info(`...listening on :${config.HTTPServerPort}`);
});
