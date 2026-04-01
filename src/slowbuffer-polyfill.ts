/* eslint-disable @typescript-eslint/no-explicit-any */
// Polyfill SlowBuffer for Node 25+ where it was removed.
// Required by buffer-equal-constant-time (transitive dep of jsonwebtoken).
import * as buffer from 'buffer';

const buf = buffer as any;

if (!buf.SlowBuffer) {
    buf.SlowBuffer = buffer.Buffer;
}
