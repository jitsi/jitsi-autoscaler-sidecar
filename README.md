# jitsi-autoscaler-sidecar
Sidecar service for jitsi-autoscaler

# build
```
npm install
npm run build
```

# start
Copy env.example to .env and fill in the required fields.
```
npm run start
```

# Generating RSA Keys

First generate the private key with the following command:

`openssl genrsa 4096 -out jwtRSA256-private.pem`

Next extract the public key in PEM format with the following command:

`openssl rsa -in jwtRSA256-private.pem -pubout -outform PEM -out jwtRSA256-public.pem`

Decide on a unique `kid` name for the key, like `jitsi/jwt-2020-01-01` and calculate the SHA256 of this string:

`echo -n 'jitsi/jwt-2023-06-01' | sha256sum`

Place the public key into appropriate the asap keys folder on the nginx server, named for like `<sha256sum>.pem`, for example:

`cp jwtRSA256-public.pem <nginx_root>asap_keys/components/8b7df143d91c716ecfa5fc1730022f6b421b05cedee8fd52b1fc65a96030ad52.pem`
