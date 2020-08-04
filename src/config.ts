import * as dotenv from 'dotenv';

dotenv.config();

export default {
    HTTPServerPort: process.env.PORT || 6000,
    LogLevel: process.env.LOG_LEVEL || 'info',
    // number of seconds to wait between polling for shutdown
    PollingInterval: Number(process.env.POLLING_INTERVAL || 60),
    PollingURL: process.env.POLLING_URL || 'http://localhost:3000/sidecar/poll',
    GracefulShutdownScript: process.env.GRACEFUL_SHUTDOWN_SCRIPT || '/usr/local/bin/graceful_shutdown.sh',
    TerminateScript: process.env.TERMINATE_SCRIPT || '/usr/local/bin/terminate_instance.sh',
    InstanceId: process.env.INSTANCE_ID,
    InstanceMetadata: JSON.parse(process.env.INSTANCE_METADATA || '{}'),
};
