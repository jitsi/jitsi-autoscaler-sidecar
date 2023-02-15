import * as dotenv from 'dotenv';
import envalid from 'envalid';

dotenv.config();

const env = envalid.cleanEnv(process.env, {
    PORT: envalid.num({ default: 6000 }),
    LOG_LEVEL: envalid.str({ default: 'info' }),
    SHUTDOWN_POLLING_INTERVAL: envalid.num({ default: 60 }),
    STATS_POLLING_INTERVAL: envalid.num({ default: 30 }),
    GRACEFUL_SHUTDOWN_SCRIPT: envalid.str({ default: '/usr/local/bin/graceful_shutdown.sh' }),
    TERMINATE_SCRIPT: envalid.str({ default: '/usr/local/bin/terminate_instance.sh' }),
    RECONFIGURE_SCRIPT: envalid.str({ default: '/usr/local/bin/reconfigure_instance.sh' }),
    ASAP_JWT_ISS: envalid.str({ default: 'jitsi-autoscaler-sidecar' }),
    ASAP_JWT_AUD: envalid.str({ default: 'jitsi-autoscaler' }),
    AUTOSCALER_HOST_URL: envalid.str({ default: '' }),
    ENABLE_REPORT_STATS: envalid.bool({ default: false }),
    POLLING_URL: envalid.str({ default: '' }),
    STATUS_URL: envalid.str({ default: '' }),
    STATS_RETRIEVE_URL: envalid.str({ default: '' }),
    STATS_REPORT_URL: envalid.str({ default: '' }),
    INSTANCE_ID: envalid.str(),
    INSTANCE_TYPE: envalid.str(),
    INSTANCE_METADATA: envalid.json({ default: '{}' }),
    ASAP_SIGNING_KEY_FILE: envalid.str(),
    ASAP_JWT_KID: envalid.str(),
});

if (!env.POLLING_URL && !env.AUTOSCALER_HOST_URL) {
    throw 'Required env vars missing: POLLING_URL or AUTOSCALER_HOST_URL';
}

if (!env.STATUS_URL && !env.AUTOSCALER_HOST_URL) {
    throw 'Required env vars missing: STATUS_URL or AUTOSCALER_HOST_URL';
}

if (env.ENABLE_REPORT_STATS) {
    if (!env.STATS_RETRIEVE_URL || (!env.STATS_REPORT_URL && !env.AUTOSCALER_HOST_URL)) {
        throw 'Stats reporting requires missing env vars: STATS_RETRIEVE_URL and STATS_REPORT_URL or AUTOSCALER_HOST_URL';
    }
}

export default {
    HTTPServerPort: env.PORT,
    LogLevel: env.LOG_LEVEL,
    // number of seconds to wait between polling for shutdown
    ShutdownPollingInterval: env.SHUTDOWN_POLLING_INTERVAL,
    PollingURL: env.POLLING_URL ? env.POLLING_URL : env.AUTOSCALER_HOST_URL + '/sidecar/poll',
    StatusURL: env.STATUS_URL ? env.STATUS_URL : env.AUTOSCALER_HOST_URL + '/sidecar/status',
    // number of seconds to wait before polling for stats
    StatsPollingInterval: env.STATS_POLLING_INTERVAL,
    EnableReportStats: env.ENABLE_REPORT_STATS,
    StatsRetrieveURL: env.STATS_RETRIEVE_URL,
    StatsReportURL: env.STATS_REPORT_URL ? env.STATS_REPORT_URL : env.AUTOSCALER_HOST_URL + '/sidecar/stats',
    GracefulShutdownScript: env.GRACEFUL_SHUTDOWN_SCRIPT,
    TerminateScript: env.TERMINATE_SCRIPT,
    ReconfigureScript: env.RECONFIGURE_SCRIPT,
    InstanceId: env.INSTANCE_ID,
    InstanceMetadata: env.INSTANCE_METADATA,
    InstanceType: env.INSTANCE_TYPE,
    AsapSigningKeyFile: env.ASAP_SIGNING_KEY_FILE,
    AsapJwtKid: env.ASAP_JWT_KID,
    AsapJwtIss: env.ASAP_JWT_ISS,
    AsapJwtAud: env.ASAP_JWT_AUD,
};
