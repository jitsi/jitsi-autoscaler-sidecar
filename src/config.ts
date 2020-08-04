import * as dotenv from 'dotenv';
import envalid from 'envalid';

dotenv.config();

const env = envalid.cleanEnv(process.env, {
    PORT: envalid.num({ default: 6000 }),
    LOG_LEVEL: envalid.str({ default: 'info' }),
    POLLING_INTERVAL: envalid.num({ default: 60 }),
    GRACEFUL_SHUTDOWN_SCRIPT: envalid.str({ default: '/usr/local/bin/graceful_shutdown.sh' }),
    TERMINATE_SCRIPT: envalid.str({ default: '/usr/local/bin/terminate_instance.sh' }),
    ASAP_JWT_ISS: envalid.str({ default: 'jitsi-autoscaler-sidecar' }),
    ASAP_JWT_AUD: envalid.str({ default: 'jitsi-autoscaler' }),
    POLLING_URL: envalid.str(),
    INSTANCE_ID: envalid.str(),
    INSTANCE_METADATA: envalid.json(),
    ASAP_SIGNING_KEY_FILE: envalid.str(),
    ASAP_JWT_KID: envalid.str(),
});

export default {
    HTTPServerPort: env.PORT,
    LogLevel: env.LOG_LEVEL,
    // number of seconds to wait between polling for shutdown
    PollingInterval: env.POLLING_INTERVAL,
    PollingURL: env.POLLING_URL,
    GracefulShutdownScript: env.GRACEFUL_SHUTDOWN_SCRIPT,
    TerminateScript: env.TERMINATE_SCRIPT,
    InstanceId: env.INSTANCE_ID,
    InstanceMetadata: env.INSTANCE_METADATA,
    AsapSigningKeyFile: env.ASAP_SIGNING_KEY_FILE,
    AsapJwtKid: env.ASAP_JWT_KID,
    AsapJwtIss: env.ASAP_JWT_ISS,
    AsapJwtAud: env.ASAP_JWT_AUD,
};
