import AsapRequest from './asap_request';
import fs from 'fs';

import * as dotenv from 'dotenv';
import envalid from 'envalid';

dotenv.config();

const env = envalid.cleanEnv(process.env, {
    ASAP_JWT_ISS: envalid.str({ default: 'jitsi-autoscaler-sidecar' }),
    ASAP_JWT_AUD: envalid.str({ default: 'jitsi-autoscaler' }),
    ASAP_SIGNING_KEY_FILE: envalid.str(),
    ASAP_JWT_KID: envalid.str(),
});

const jwtSigningKey = fs.readFileSync(env.ASAP_SIGNING_KEY_FILE);

const asapRequest = new AsapRequest({
    signingKey: jwtSigningKey,
    asapJwtIss: env.ASAP_JWT_ISS,
    asapJwtAud: env.ASAP_JWT_AUD,
    asapJwtKid: env.ASAP_JWT_KID,
});

console.log(asapRequest.authToken());
