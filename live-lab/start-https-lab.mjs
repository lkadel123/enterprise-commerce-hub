/**
 * HTTPS dev lab launcher — starts the complete live-lab topology as a unit:
 *
 *   http://localhost:4000   backend Express API (in-memory MongoDB, sandbox creds)
 *   http://localhost:8090   storefront Vite dev server
 *   https://localhost:8443  TLS terminator -> http://localhost:8090  (storefront)
 *   https://localhost:4443  TLS terminator -> http://localhost:4000  (backend API)
 *
 * The storefront `.env` points VITE_API_URL at https://localhost:4443 (HTTPS is
 * required by the Cybersource Unified Checkout targetOrigins contract), so the
 * API only works when BOTH the backend and the TLS terminator are running.
 * A storefront started on its own produces ERR_CONNECTION_REFUSED for every API
 * call — that is this script's reason to exist.
 *
 * ONE documented entry point (repo root):  npm run lab
 * Direct equivalent: node live-lab/start-https-lab.mjs --with-storefront
 * (Omit --with-storefront to start only backend + TLS terminator.)
 *
 * Idempotent and health-aware:
 *   - backend is reused only when GET /health/ready answers 200; a :4000 held by
 *     an unrelated process is a hard error naming the owning PID/image.
 *   - the TLS terminator is reused only when BOTH :8443 and :4443 complete a TLS
 *     handshake presenting the live-lab certificate (pinned by SHA-256
 *     fingerprint — this probe verifies identity; it never disables TLS
 *     verification for the app or the browser).
 *   - the storefront is reused when :8090 is already listening.
 *   - exits non-zero unless the whole topology is verified healthy at the end.
 */
import { spawn, execSync } from "node:child_process";
import { createConnection } from "node:net";
import { createRequire } from "node:module";
import tls from "node:tls";
import http from "node:http";
import { X509Certificate } from "node:crypto";
import { existsSync, openSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, "..");
const withStorefront = process.argv.includes("--with-storefront");

/**
 * True when something accepts TCP connections on port.
 *
 * A connect probe is used instead of a bind probe deliberately: on Windows,
 * libuv sets SO_REUSEADDR, so a bind probe can succeed even while a wildcard
 * listener ([::]:port) already owns the port — which would make the lab spawn
 * duplicate processes. A connect probe reflects the real listener.
 */
function tcpConnects(port, host = "127.0.0.1", timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/**
 * Identify the process holding a TCP port (Windows: netstat + tasklist).
 * Returns { pid, name } or null when the port is free / detection unavailable.
 */
function portOwner(port) {
  try {
    const netstat = execSync("netstat -ano -p tcp", { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const re = new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, "m");
    const m = netstat.match(re);
    if (!m) return null;
    const pid = Number(m[1]);
    let name = `pid ${pid}`;
    try {
      const line = execSync(`tasklist /fi "PID eq ${pid}" /fo csv /nh`, {
        stdio: ["ignore", "pipe", "ignore"],
      }).toString();
      const first = line.split('","')[0]?.replace(/^"/, "");
      if (first) name = `${first} (pid ${pid})`;
    } catch {
      // tasklist unavailable — the PID alone still identifies the owner.
    }
    return { pid, name };
  } catch {
    return null;
  }
}

/**
 * Command line of a PID (best-effort; "" when it cannot be read). Needed to
 * tell a STALE LAB child (safe for the lab to reclaim) apart from an unrelated
 * program that merely happens to hold a lab port (never touched).
 */
function processCommandLine(pid) {
  try {
    const out = execSync(
      `powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
      { stdio: ["ignore", "pipe", "ignore"] },
    ).toString();
    return out.trim();
  } catch {
    return "";
  }
}

/**
 * Command-line markers identifying THIS repo's lab/dev processes. Mirrors the
 * marker list in stop-lab.mjs: only processes matching one of these are ever
 * reclaimed by the lab, so an unrelated occupant is always reported instead.
 */
const LAB_MARKERS = [
  repo.toLowerCase(),
  "live-backend.mts",
  "https-proxy.mjs",
  "vite.js dev",
  "dist/server.js",
  "dist\\server.js",
  "src/server.ts",
  "src\\server.ts",
];

/** True when a command line belongs to this repo's lab/dev tooling. */
function isLabProcess(commandLine) {
  const cmd = commandLine.toLowerCase();
  return LAB_MARKERS.some((marker) => cmd.includes(marker));
}

/** Poll `fn` until it returns true or the deadline passes. */
async function until(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() >= deadline) {
      console.error(`[lab] TIMEOUT waiting for ${label}`);
      return false;
    }
    await new Promise((r) => setTimeout(r, 750));
  }
}

/** Single HTTP GET probe; resolves with the status code (0 on connection error). */
function httpProbe(host, port, path, timeoutMs = 5000) {
  return new Promise((resolve) => {
    // ABSOLUTE deadline: a socket that never emits 'error', 'response' or the
    // socket 'timeout' event (observed with a pending connect on this machine)
    // must not leave the promise pending forever — a hung probe would freeze
    // the whole orchestrator's wait loop in silence. The timer guarantees the
    // probe always resolves within timeoutMs.
    let settled = false;
    const done = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code);
    };
    const req = http.get({ host, port, path, timeout: timeoutMs }, (res) => {
      res.resume();
      done(res.statusCode ?? 0);
    });
    const timer = setTimeout(() => {
      req.destroy();
      done(0);
    }, timeoutMs);
    req.on("error", () => done(0));
    req.on("timeout", () => done(0));
  });
}

/** Poll until an HTTP request to path returns status 200. */
async function waitForHttp(host, port, path, timeoutMs, label) {
  const startedAt = Date.now();
  let lastLoggedAt = 0;
  let lastStatus = -1;
  return until(async () => {
    lastStatus = await httpProbe(host, port, path);
    // Heartbeat: a slow boot must stay observable. Without this, a wedge in a
    // single probe (or a long mongod cold start) leaves the log silent and
    // makes the failure undiagnosable.
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs - lastLoggedAt >= 10_000) {
      lastLoggedAt = elapsedMs;
      console.log(`[lab] waiting for ${label}: last probe status ${lastStatus} (${Math.round(elapsedMs / 1000)}s)`);
    }
    return lastStatus === 200;
  }, timeoutMs, `${label} (${host}:${port}${path})`);
}

// The live-lab certificate whose fingerprint the terminator must present.
const labCert = new X509Certificate(readFileSync(join(root, "certs", "localhost.pem")));
const labFingerprint = labCert.fingerprint256.toUpperCase();

/**
 * TLS identity probe for the terminator. Performs a TLS handshake and verifies
 * the presented certificate is EXACTLY the live-lab certificate (SHA-256
 * fingerprint pinning). Chain validation is skipped ONLY inside this local
 * probe — identity is still verified via the fingerprint, and no application
 * or browser TLS verification is changed anywhere.
 * Resolves "match" | "mismatch" | "noTls".
 */
function tlsProbe(port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: "127.0.0.1", port, servername: "localhost", rejectUnauthorized: false });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => done("noTls"));
    socket.once("secureConnect", () => {
      const fp = socket.getPeerCertificate()?.fingerprint256?.toUpperCase();
      done(fp === labFingerprint ? "match" : "mismatch");
    });
    socket.once("error", () => done("noTls"));
  });
}

/** Poll until both terminator ports complete a pinned TLS handshake. */
async function waitForTerminator(timeoutMs) {
  const api = await until(async () => (await tlsProbe(4443)) === "match", timeoutMs, "TLS API proxy https://localhost:4443");
  const web = await until(
    async () => (await tlsProbe(8443)) === "match",
    timeoutMs,
    "TLS storefront proxy https://localhost:8443",
  );
  return api && web;
}

function start(name, command, args, cwd, outLog, errLog, useShell) {
  // "w" (truncate) keeps each spawned process's logs clean: a stale error from
  // a previous run (e.g. an old module-resolution failure) can never be
  // mistaken for a failure of the current startup. Reuse paths never spawn, so
  // logs of healthy, long-running processes are untouched.
  const out = openSync(join(root, outLog), "w");
  const err = openSync(join(root, errLog), "w");
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ["ignore", out, err],
    windowsHide: true,
    // Node >= 20.12 refuses .cmd/.bat spawns without a shell (CVE-2024-27980).
    shell: useShell === true,
  });
  child.unref();
  console.log(`[lab] started ${name} (pid ${child.pid}) — logs: live-lab/${outLog}`);
}

function die(message) {
  console.error(`[lab] ERROR: ${message}`);
  process.exitCode = 1;
}

async function main() {
  // ---------------------------------------------------------------- 1) backend
  // Reuse only a HEALTHY backend; an occupied-but-unhealthy port is a hard error
  // naming the owner, never a silent skip.
  let backendReady = (await httpProbe("127.0.0.1", 4000, "/health/ready")) === 200;
  // Set when :4000 must be spawned: the port is free, or a stale lab backend
  // that was holding it has just been reclaimed.
  let spawnBackend = false;
  if (backendReady) {
    console.log("[lab] backend :4000 already healthy (/health/ready 200) — reused");
  } else if (await tcpConnects(4000)) {
    console.log("[lab] port 4000 is open but not healthy yet — waiting up to 30s for /health/ready...");
    backendReady = await waitForHttp("127.0.0.1", 4000, "/health/ready", 30_000, "backend /health/ready");
    if (backendReady) {
      console.log("[lab] backend :4000 became healthy — reused");
    } else {
      const owner = portOwner(4000);
      const ownerCmd = owner ? processCommandLine(owner.pid) : "";
      if (owner && isLabProcess(ownerCmd)) {
        // A STALE LAB backend: its in-memory MongoDB is gone, so /health/ready
        // can never recover. It IS ours, so the lab reclaims it here — one
        // documented command must bring the topology up from ANY previous
        // state. Without this, the lab aborts and the spawned duplicate's
        // "port already in use" error log is the only diagnostic.
        console.log(
          `[lab] reclaiming stale live-lab backend ${owner.name} — /health/ready is not 200 (its in-memory MongoDB is gone)`,
        );
        try {
          // /T also tears down the in-memory mongod running under the backend.
          execSync(`taskkill /pid ${owner.pid} /T /F`, { stdio: ["ignore", "pipe", "ignore"] });
        } catch (err) {
          die(`failed to reclaim the stale live-lab backend ${owner.name}: ${err?.message ?? err}`);
          return;
        }
        const released = await until(async () => !(await tcpConnects(4000)), 15_000, "port 4000 to be released");
        if (!released) {
          die("port 4000 is still occupied after reclaiming the stale live-lab backend — check for a lingering child.");
          return;
        }
        spawnBackend = true;
      } else {
        die(
          `port 4000 is held by ${owner ? owner.name : "an unknown process"} but it does not answer /health/ready — ` +
            "it is not the live-lab backend. Stop that program and re-run npm run lab.",
        );
        return;
      }
    }
  } else {
    spawnBackend = true;
  }

  if (spawnBackend) {
    // Spawn the backend DIRECTLY via node + tsx (exactly how `npm run live`
    // resolves it — the same "tsx/cli" entry live-backend.mts uses for seeding).
    // Spawning through the npm.cmd -> cmd.exe -> node shim chain while detached
    // is unreliable on Windows (hung shim chains, lost log output); the direct
    // node spawn is the same proven pattern used for the terminator/vite below.
    // The entry is an EXPLICIT absolute FILE path (never the scripts directory
    // and never cwd-relative): tsx otherwise resolves the specifier against the
    // spawn cwd, and a wrong cwd surfaces as ERR_UNSUPPORTED_DIR_IMPORT for
    // 'backend/scripts' instead of a clear failure.
    const backendRequire = createRequire(join(repo, "backend", "package.json"));
    const backendEntry = join(repo, "backend", "scripts", "live-backend.mts");
    if (!existsSync(backendEntry)) {
      die(`backend entry script not found: ${backendEntry}`);
      return;
    }
    start(
      "backend (tsx scripts/live-backend.mts)",
      process.execPath,
      [backendRequire.resolve("tsx/cli"), backendEntry],
      join(repo, "backend"),
      "backend-out.log",
      "backend-err.log",
    );
    console.log("[lab] awaiting backend http://localhost:4000 (MongoDB connect + /health/ready)...");
    // 300s cold-start budget: the wait covers mongodb-memory-server binary
    // extraction + mongod boot + catalog seed.
    backendReady = await waitForHttp("127.0.0.1", 4000, "/health/ready", 300_000, "backend /health/ready");
    if (!backendReady) {
      die("backend did not become ready — check live-lab/backend-err.log — aborting before starting the HTTPS proxy/storefront.");
      return; // never raise the HTTPS proxy on top of a dead upstream
    }
  }

  // ----------------------------------------------------------- 2) TLS terminator
  // One process owns BOTH https://localhost:4443 (API) and https://localhost:8443
  // (storefront), so they must be healthy together or not at all.
  const apiPortBusy = await tcpConnects(4443);
  const webPortBusy = await tcpConnects(8443);
  let terminatorReady = false;
  if (apiPortBusy !== webPortBusy) {
    const busyPort = apiPortBusy ? 4443 : 8443;
    const owner = portOwner(busyPort);
    die(
      `only one terminator port is listening (${busyPort}) — held by ${owner ? owner.name : "an unknown process"}. ` +
        "The TLS terminator binds :8443 and :4443 together; stop the stale process (npm run lab:stop) and re-run npm run lab.",
    );
    return;
  }
  if (apiPortBusy && webPortBusy) {
    const [apiTls, webTls] = [await tlsProbe(4443), await tlsProbe(8443)];
    if (apiTls === "match" && webTls === "match") {
      console.log("[lab] TLS terminator :4443/:8443 already healthy (lab certificate verified) — reused");
      terminatorReady = true;
    } else {
      const badPort = apiTls !== "match" ? 4443 : 8443;
      const owner = portOwner(badPort);
      die(
        `port ${badPort} is held by ${owner ? owner.name : "an unknown process"} but does not present the live-lab ` +
          "certificate — it is not the lab TLS terminator. Stop it (npm run lab:stop) and re-run npm run lab.",
      );
      return;
    }
  } else {
    // Node >= 20.12 refuses .cmd/.bat spawns without a shell (CVE-2024-27980),
    // so the TLS terminator is launched with the current node binary directly.
    start(
      "TLS terminator (live-lab/https-proxy.mjs)",
      process.execPath,
      [join(root, "https-proxy.mjs")],
      repo,
      "proxy-out.log",
      "proxy-err.log",
    );
    terminatorReady = await waitForTerminator(30_000);
    if (!terminatorReady) {
      die("TLS terminator did not become ready on :4443/:8443 — check live-lab/proxy-err.log.");
      return;
    }
  }

  // -------------------------------------------------------------- 3) storefront
  // Only reached with the terminator verified healthy, so the storefront can
  // never come up pointing at a dead https://localhost:4443.
  let storefrontReady = true;
  if (withStorefront) {
    if (await tcpConnects(8090)) {
      console.log("[lab] storefront :8090 already listening — reused");
    } else {
      start(
        "storefront (vite dev :8090)",
        process.execPath,
        [join(repo, "node_modules", "vite", "bin", "vite.js"), "dev", "--port", "8090", "--host", "127.0.0.1", "--strictPort"],
        join(repo, "storefront"),
        "storefront-out.log",
        "storefront-err.log",
      );
      storefrontReady = await until(() => tcpConnects(8090), 180_000, "storefront vite :8090");
      if (!storefrontReady) {
        die("storefront failed to become ready on :8090 — check live-lab/storefront-err.log.");
      }
    }
  }

  console.log("");
  console.log("[lab] topology: https://localhost:8443 (storefront) + https://localhost:4443 (API) -> http://localhost:4000");
  console.log(
    `[lab] status -> backend: ${backendReady ? "ready" : "NOT ready"} | HTTPS :4443: ${terminatorReady ? "listening" : "NOT listening"} | HTTPS :8443: ${terminatorReady ? "listening" : "NOT listening"}${withStorefront ? ` | storefront :8090: ${storefrontReady ? "listening" : "NOT listening"}` : ""}`,
  );
  if (!backendReady || !terminatorReady || (withStorefront && !storefrontReady)) {
    process.exitCode = 1;
  }
}

main();
