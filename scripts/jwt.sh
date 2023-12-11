#!/bin/bash

[ -z "$JWT_ENV_FILE" ] && JWT_ENV_FILE="/etc/jitsi/autoscaler-sidecar/config"

if [ -f "$JWT_ENV_FILE" ]; then
  . "$JWT_ENV_FILE"
  export ASAP_SIGNING_KEY_FILE
  export ASAP_JWT_KID
fi

SCRIPT_SRC=$(dirname "${BASH_SOURCE[0]}")

JWT_JS="$SCRIPT_SRC/../jwt.js"
[ -d "$SCRIPT_SRC/../dist" ] && JWT_JS="$SCRIPT_SRC/../dist/jwt.js"

node $JWT_JS
