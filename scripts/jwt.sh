#!/bin/bash

[ -z "$JWT_ENV_FILE" ] && JWT_ENV_FILE="/etc/jitsi/autoscaler-sidecar/sidecar.env"

if [ -f "$JWT_ENV_FILE" ]; then
  . "$JWT_ENV_FILE"
  export ASAP_SIGNING_KEY_FILE
  export ASAP_JWT_KID
fi

SCRIPT_SRC=$(dirname "${BASH_SOURCE[0]}")

node $SCRIPT_SRC/jwt.js