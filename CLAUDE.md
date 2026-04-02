# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

jitsi-autoscaler-sidecar is a Node.js/TypeScript sidecar service that runs alongside Jitsi media server instances (JVB, Jibri, Jigasi, SIP-Jibri). It bridges the local instance and the central `jitsi-autoscaler` service by polling for shutdown/reconfigure commands and reporting instance stats.

## Build & Development Commands

- **Build**: `npm run build` (runs `tsc`, output to `dist/`)
- **Lint**: `npm run lint` (ESLint with auto-fix)
- **Dev mode**: `npm run watch` (concurrent tsc watch + nodemon on `dist/app.js`)
- **Start**: `npm run start` (runs `node dist/app.js`)
- **Tests**: None exist. `npm test` is a stub that exits with error.
- **Debian package**: `scripts/build-deb.sh`

CI only runs linting on PRs (no build or test step).

## Architecture

### Data Flows

Two modes of operation:

1. **Polling (pull)**: App periodically polls the autoscaler at `SHUTDOWN_POLLING_INTERVAL` (default 60s). If `ENABLE_REPORT_STATS=true`, also polls local instance stats at `STATS_POLLING_INTERVAL` (default 30s).

2. **Webhook (push)**: Local instance pushes state to `POST /hook/v1/shutdown` or `POST /hook/v1/status`, which the sidecar immediately forwards to the autoscaler.

### Core Classes (all in `src/`)

- **`app.ts`** — Entry point. Express server (port 6000, bound to `0.0.0.0`) with health check (`GET /health`), webhook routes, and two async polling loops.
- **`AsapRequest`** (`asap_request.ts`) — Authenticated HTTP client using ASAP JWT (RS256, cached 45min via `node-cache`). Wraps `got` with `postJson()`/`getJson()`.
- **`AutoscalePoller`** (`autoscale_poller.ts`) — Polls autoscaler for `SystemStatus { shutdown, reconfigure }` commands. Posts stats to `STATUS_URL` or pings `POLLING_URL`.
- **`CommandHandler`** (`command_handler.ts`) — Executes shell scripts via `child_process.exec` for shutdown (graceful then terminate) and reconfigure actions.
- **`StatsReporter`** (`stats_reporter.ts`) — Fetches stats from local instance via `STATS_RETRIEVE_URL`, builds `StatsReport` payloads with instance metadata and status flags.
- **`config.ts`** — Environment variable validation via `envalid` + `dotenv`. Exports typed config object.

### Key Patterns

- Class-based services with options/interface injection (e.g., `AsapRequestOptions`, `AutoscalePollerOptions`)
- Module-level boolean locks (`reconfigureLock`, `shutdownLock`) prevent concurrent command execution
- All config is environment-variable driven; see `env.example` for reference

## Code Style

- Uses `@jitsi/eslint-config` base config with `@typescript-eslint`
- Prettier: single quotes, 4-space indent, 120 char line width, trailing commas, semicolons
- TypeScript target ES2020, CommonJS modules, `noImplicitAny` enabled

## Deployment

Deployed as a Debian package (no Docker):
- Installed to `/usr/share/jitsi-autoscaler-sidecar/`
- Config at `/etc/jitsi/autoscaler-sidecar/config`
- Runs as systemd service under user `autoscaler-sidecar`, group `jitsi`
- Post-install generates RSA key pair for ASAP JWT auth
