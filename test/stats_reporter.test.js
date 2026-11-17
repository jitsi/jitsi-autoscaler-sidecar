const assert = require('node:assert/strict');
const { afterEach, before, beforeEach, describe, it, mock } = require('node:test');

const URL = 'http://localhost:8080/colibri/stats';
const RETRY_MESSAGE = 'Failed to retrieve stats';

/**
 * Makes the fake getJson throw a value that is not an Error.
 */
class Thrown {
    /**
     * @param value the value to throw.
     */
    constructor(value) {
        this.value = value;
    }
}

describe('StatsReporter retrieval failures', () => {
    let StatsReporter;
    let logger;
    let logs;
    let now;
    let result;

    // The config module reads and validates the environment when it is first loaded.
    before(() => {
        Object.assign(process.env, {
            POLLING_URL: 'http://autoscaler.test/poll',
            STATUS_URL: 'http://autoscaler.test/status',
            INSTANCE_ID: 'test-instance',
            INSTANCE_TYPE: 'JVB',
            ASAP_SIGNING_KEY_FILE: '/dev/null',
            ASAP_JWT_KID: 'test-kid'
        });
        StatsReporter = require('../dist/stats_reporter').default;
        logger = require('../dist/logger').default;
    });

    const record = level => (message, meta = {}) => {
        logs.push({ level,
            message,
            meta });
    };

    beforeEach(() => {
        logs = [];
        now = 1_000_000;
        result = undefined;
        mock.method(logger, 'error', record('error'));
        mock.method(logger, 'warn', record('warn'));
        mock.method(logger, 'info', record('info'));
        mock.method(logger, 'debug', record('debug'));
    });

    afterEach(() => {
        mock.restoreAll();
    });

    const at = level => logs.filter(l => l.level === level);
    const retries = () => logs.filter(l => l.level === 'debug' && l.message === RETRY_MESSAGE);

    const asapRequest = {
        getJson: async () => {
            if (result instanceof Error) {
                throw result;
            }
            if (result instanceof Thrown) {
                throw result.value;
            }

            return result;
        }
    };

    // The intervals are short here. The production defaults have their own test.
    const createReporter = () => new StatsReporter({
        retrieveUrl: URL,
        asapRequest,
        instanceDetails: { instanceId: 'i',
            instanceType: 'JVB' },
        failureLogIntervalMs: 60_000,
        failureErrorAfterMs: 300_000,
        now: () => now
    });

    const refused = () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8080'), {
        name: 'RequestError',
        code: 'ECONNREFUSED'
    });

    const poll = async (reporter, advanceMs = 0) => {
        now += advanceMs;

        return reporter.retrieveStatsReport();
    };

    it('logs the first failure as a warning with the error details, not as an error', async () => {
        result = refused();
        const report = await poll(createReporter());

        assert.equal(report.statsError, true);
        assert.deepEqual(report.stats, {});
        assert.equal(at('error').length, 0);
        assert.equal(at('warn').length, 1);

        const { meta } = at('warn')[0];

        assert.equal(meta.url, URL);
        assert.equal(meta.name, 'RequestError');
        assert.equal(meta.code, 'ECONNREFUSED');
        assert.match(meta.message, /ECONNREFUSED/);
        assert.equal(meta.consecutiveFailures, 1);
        assert.equal(meta.failingForMs, 0);
    });

    it('logs repeated failures at debug level, not as warnings', async () => {
        result = refused();
        const reporter = createReporter();

        await poll(reporter);
        for (let i = 0; i < 4; i++) {
            await poll(reporter, 10_000);
        }

        assert.equal(at('warn').length, 1);
        assert.equal(at('error').length, 0);
        assert.equal(retries().length, 4);
    });

    it('logs a summary warning at most once per interval', async () => {
        result = refused();
        const reporter = createReporter();

        await poll(reporter);
        await poll(reporter, 59_000);
        assert.equal(at('warn').length, 1);

        await poll(reporter, 1_000);
        assert.equal(at('warn').length, 2);
        assert.equal(at('warn')[1].meta.consecutiveFailures, 3);
        assert.equal(at('warn')[1].meta.failingForMs, 60_000);

        // The interval starts again from the summary.
        await poll(reporter, 59_000);
        assert.equal(at('warn').length, 2);
        await poll(reporter, 1_000);
        assert.equal(at('warn').length, 3);
    });

    it('logs one error when the failures last too long', async () => {
        result = refused();
        const reporter = createReporter();

        await poll(reporter);
        await poll(reporter, 299_000);
        assert.equal(at('error').length, 0);

        await poll(reporter, 1_000);
        assert.equal(at('error').length, 1);
        assert.equal(at('error')[0].meta.failingForMs, 300_000);
        assert.equal(at('error')[0].meta.code, 'ECONNREFUSED');

        // Later failures in the same series log summary warnings, not more errors.
        for (let i = 0; i < 20; i++) {
            await poll(reporter, 60_000);
        }
        assert.equal(at('error').length, 1);
    });

    it('starts the summary interval again after the error', async () => {
        result = refused();
        const reporter = createReporter();

        await poll(reporter);
        for (let i = 0; i < 4; i++) {
            await poll(reporter, 60_000);
        }
        assert.equal(at('warn').length, 5);

        await poll(reporter, 60_000);
        assert.equal(at('error').length, 1);

        // The error counts as the last warning, so the next summary comes one interval after it.
        await poll(reporter, 59_000);
        assert.equal(at('warn').length, 5);
        await poll(reporter, 1_000);
        assert.equal(at('warn').length, 6);
    });

    it('logs an error again for a new long series after a recovery', async () => {
        const reporter = createReporter();

        result = refused();
        await poll(reporter);
        await poll(reporter, 300_000);
        assert.equal(at('error').length, 1);

        result = { conferences: 1 };
        await poll(reporter, 30_000);

        result = refused();
        await poll(reporter, 30_000);
        await poll(reporter, 299_000);
        assert.equal(at('error').length, 1);
        await poll(reporter, 1_000);
        assert.equal(at('error').length, 2);
    });

    it('logs once when stats are available again', async () => {
        const reporter = createReporter();

        result = refused();
        await poll(reporter);
        await poll(reporter, 30_000);
        result = { conferences: 1 };

        const report = await poll(reporter, 30_000);

        assert.equal(report.statsError, false);
        assert.deepEqual(report.stats, { conferences: 1 });
        assert.equal(at('info').length, 1);
        assert.equal(at('info')[0].meta.consecutiveFailures, 2);
        assert.equal(at('info')[0].meta.failingForMs, 60_000);

        await poll(reporter, 30_000);
        assert.equal(at('info').length, 1);

        // A new failure starts a new series, which warns again.
        result = refused();
        await poll(reporter, 30_000);
        assert.equal(at('warn').length, 2);
        assert.equal(at('warn')[1].meta.consecutiveFailures, 1);
    });

    it('logs nothing above debug level while retrieval succeeds', async () => {
        const reporter = createReporter();

        result = { conferences: 1 };
        await poll(reporter);
        await poll(reporter, 30_000);

        assert.deepEqual(logs.filter(l => l.level !== 'debug'), []);
    });

    it('treats an empty response as a failure', async () => {
        const report = await poll(createReporter());

        assert.equal(report.statsError, true);
        assert.equal(at('warn').length, 1);
        assert.equal(at('warn')[0].meta.message, 'Empty stats response');
        assert.equal(at('error').length, 0);
    });

    it('logs a thrown value that is not an Error as the message', async () => {
        result = new Thrown('local service is not ready');
        await poll(createReporter());

        const { meta } = at('warn')[0];

        assert.equal(meta.message, 'local service is not ready');
        assert.equal(meta.name, undefined);
    });

    it('logs the status code of an HTTP error and cuts a long message', async () => {
        result = Object.assign(new Error(`Responded 503 for ${URL}: ${'x'.repeat(5000)}`), {
            name: 'AutoscalerRequestError',
            statusCode: 503
        });
        await poll(createReporter());

        const { meta } = at('warn')[0];

        assert.equal(meta.statusCode, 503);
        assert.equal(meta.name, 'AutoscalerRequestError');
        assert.equal(meta.message.length, 300);
        assert.ok(meta.message.startsWith('Responded 503'));
    });

    it('uses a 10 minute summary interval and a 15 minute error limit by default', async () => {
        mock.method(Date, 'now', () => now);
        result = refused();
        const reporter = new StatsReporter({
            retrieveUrl: URL,
            asapRequest,
            instanceDetails: { instanceId: 'i',
                instanceType: 'JVB' }
        });

        await poll(reporter);
        await poll(reporter, 599_999);
        assert.equal(at('warn').length, 1);
        await poll(reporter, 1);
        assert.equal(at('warn').length, 2);

        await poll(reporter, 299_999);
        assert.equal(at('error').length, 0);
        await poll(reporter, 1);
        assert.equal(at('error').length, 1);
    });
});
