import { exec } from 'child_process';
import { promisify } from 'util';

import logger from './logger';

const pexec = promisify(exec);

export interface CommandHandlerOptions {
    gracefulScript: string;
    terminateScript: string;
    reconfigureScript: string;
}

interface presult {
    stdout: string;
    stderr: string;
}

/**
 * Handles commands.
 */
export default class CommandHandler {
    private gracefulScript: string;
    private terminateScript: string;
    private reconfigureScript: string;

    /**
     * Constructs the handler.
     * @param options the options to use.
     */
    constructor(options: CommandHandlerOptions) {
        this.gracefulScript = options.gracefulScript;
        this.terminateScript = options.terminateScript;
        this.reconfigureScript = options.reconfigureScript;

        this.shutdown = this.shutdown.bind(this);
        this.gracefulShutdown = this.gracefulShutdown.bind(this);
        this.reconfigure = this.reconfigure.bind(this);
    }

    /**
     * Executes graceful shutdown.
     */
    async gracefulShutdown(): Promise<boolean> {
        logger.info('Handling graceful shutdown', {
            gracefulScript: this.gracefulScript
        });
        let result: presult;

        try {
            result = await pexec(this.gracefulScript);
            logger.info(result.stdout);
            logger.info(result.stderr);
        } catch (err) {
            logger.error('shutdown error', { err,
                stdout: result.stdout,
                stderr: result.stderr });
            throw err;
        }

        return true;
    }

    /**
     * Executes reconfigure.
     */
    async reconfigure(): Promise<boolean> {
        logger.info('Handling reconfigure', {
            reconfigureScript: this.reconfigureScript
        });
        let result: presult;

        try {
            result = await pexec(this.reconfigureScript);
            logger.info(result.stdout);
            logger.info(result.stderr);
        } catch (err) {
            logger.error('reconfiguration error', { err,
                stdout: result.stdout,
                stderr: result.stderr });
            throw err;
        }

        return true;
    }

    /**
     * Executes terminate the instance.
     */
    async terminateInstance(): Promise<boolean> {
        logger.info('Handling instance termination', {
            terminateScript: this.terminateScript
        });
        let result: presult;

        try {
            const { stdout, stderr } = await pexec(this.terminateScript);

            logger.info(stdout);
            logger.info(stderr);
        } catch (err) {
            logger.error('terminate error', { err,
                stdout: result.stdout,
                stderr: result.stderr });
            throw err;
        }

        return true;
    }

    /**
     * Executes shutdown.
     */
    async shutdown(): Promise<boolean> {
        logger.info('Handling shutdown', {
            gracefulScript: this.gracefulScript,
            terminateScript: this.terminateScript
        });

        try {
            const result = await this.gracefulShutdown();

            if (result) {
                logger.info('Successful graceful shutdown, terminating');
            } else {
                logger.error('Failed graceful shutdown, terminating');
            }
            await this.terminateInstance();
        } catch (err) {
            logger.error('shutdown error detected, forcing termination');
            await this.terminateInstance();
            throw err;
        }

        return true;
    }
}
