/**
 * Live-lab helper: ensure a storefront dev server exists on 127.0.0.1:8090.
 *
 * DELEGATES to the single live-lab orchestrator (live-lab/start-https-lab.mjs)
 * instead of maintaining a second, partial startup path. The orchestrator is
 * idempotent: it reuses healthy processes, starts what is missing, and refuses
 * to bring the storefront up without the HTTPS terminator on :4443/:8443 —
 * pointing VITE_API_URL at a dead terminator causes ERR_CONNECTION_REFUSED for
 * every API call.
 *
 * Usage: node live-lab/ensure-storefront.mjs   (repo root: npm run lab)
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const orchestrator = join(root, "start-https-lab.mjs");

console.log("[ensure-storefront] delegating to live-lab/start-https-lab.mjs (the single lab orchestrator)...");
const child = spawn(process.execPath, [orchestrator, "--with-storefront"], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
