import logger from './logger';
import { promisify } from 'util';
import { exec } from 'child_process';

const pexec = promisify(exec);

export interface ShutdownHandlerOptions {
    gracefulScript: string;
    terminateScript: string;
}

export default class AutoscalePoller {
    private gracefulScript: string;
    private terminateScript: string;

    constructor(options: ShutdownHandlerOptions) {
        this.gracefulScript = options.gracefulScript;
        this.terminateScript = options.terminateScript;

        this.shutdown = this.shutdown.bind(this);
        this.gracefulShutdown = this.gracefulShutdown.bind(this);
    }

    async gracefulShutdown(): Promise<boolean> {
        try {
            const { stdout, stderr } = await pexec(this.gracefulScript);
            logger.info(stdout);
            logger.info(stderr);
        } catch (err) {
            logger.error(err);
            return false;
        }

        return true;
    }

    async terminateInstance(): Promise<boolean> {
        try {
            const { stdout, stderr } = await pexec(this.terminateScript);
            logger.info(stdout);
            logger.info(stderr);
        } catch (err) {
            logger.error(err);
            return false;
        }

        return true;
    }

    async shutdown(): Promise<boolean> {
        logger.info('Handling shutdown', {
            gracefulScript: this.gracefulScript,
            terminateScript: this.terminateScript,
        });

        if (await this.gracefulShutdown()) {
            return await this.terminateInstance();
        } else {
            return false;
        }
    }
}
