# Live-lab (local HTTPS development environment)

The live-lab runs the REAL backend and storefront behind local TLS terminators so
the Cybersource Unified Checkout iframe can bind to an HTTPS origin.

## Topology

| URL | What | Upstream |
| --- | --- | --- |
| `http://localhost:4000` | Backend Express API (in-memory MongoDB, real sandbox creds) | — |
| `http://localhost:8090` | Storefront Vite dev server | — |
| `https://localhost:8443` | TLS storefront proxy (**public browser origin**) | `http://localhost:8090` |
| `https://localhost:4443` | TLS API proxy | `http://localhost:4000` |

The storefront's API base URL is `https://localhost:4443/api/v1` (`VITE_API_URL`,
see `storefront/.env`) and its public origin is `https://localhost:8443`
(`VITE_PUBLIC_ORIGIN`). HTTPS is required: the backend puts
`https://localhost:8443` in the capture-context `targetOrigins`, and the
Cybersource SDK enforces an origin match. A storefront running without the TLS
terminator makes every API call fail with `ERR_CONNECTION_REFUSED`.

## One command to start everything

From the repo root:

```powershell
npm run lab
```

That starts (or reuses) backend :4000, the TLS terminator :8443/:4443, and the
storefront :8090. It is idempotent and health-aware:

- backend is reused only when `GET /health/ready` answers 200;
- the terminator is reused only when both `:8443` and `:4443` complete a TLS
  handshake presenting the live-lab certificate (`live-lab/certs/localhost.pem`,
  verified by SHA-256 fingerprint pinning — TLS verification is never disabled);
- the storefront is reused when `:8090` is already listening;
- a port held by an unrelated process is a hard error naming the owning PID and
  image name;
- the command exits non-zero unless the complete topology is verified healthy.

Logs land in `live-lab/*-out.log` / `live-lab/*-err.log`.

## Stopping stale lab processes

```powershell
npm run lab:stop
```

Kills only processes that are listening on a lab port AND whose command line
matches a live-lab marker (this repo's path, `live-backend.mts`,
`https-proxy.mjs`, or vite dev). Unrelated processes are reported, never touched.

## Verifying

```powershell
Test-NetConnection localhost -Port 4000   # backend
Test-NetConnection localhost -Port 8090   # storefront
Test-NetConnection localhost -Port 8443   # HTTPS storefront
Test-NetConnection localhost -Port 4443   # HTTPS API
```

All four must report `TcpTestSucceeded : True`. Then:

```powershell
curl.exe -k https://localhost:8443/                       # storefront HTML
curl.exe -k https://localhost:4443/api/v1/public/products?pageSize=1
```

## Components

- `start-https-lab.mjs` — the orchestrator (`npm run lab`).
- `https-proxy.mjs` — the single TLS terminator owning both :8443 and :4443.
- `stop-lab.mjs` — stale-child cleanup (`npm run lab:stop`).
- `ensure-storefront.mjs` — legacy helper; now delegates to the orchestrator.
- `certs/` — the self-signed lab certificate used by the terminator.

Browser-based live tests (`browser-payment-test.mjs`, `hydration-check.mjs`)
target `https://localhost:8443` and launch Chromium with
`--ignore-certificate-errors` for the self-signed lab cert only.
