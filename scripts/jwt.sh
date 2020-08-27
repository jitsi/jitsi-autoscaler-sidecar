#!/bin/bash

[ -z "$JWT_ENV_FILE" ] && JWT_ENV_FILE="/etc/jitsi/autoscaler-sidecar/sidecar.env"

[ -f "$JWT_ENV_FILE" ] && . "$JWT_ENV_FILE"

SCRIPT_SRC=$(dirname "${BASH_SOURCE[0]}")

node $SCRIPT_SRC/../dist/jwt.js