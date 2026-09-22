/**
 * LIVE-LAB stopper: reclaims the four lab ports (:4000, :8090, :8443, :4443)
 * from stale child processes so `npm run lab` can start cleanly again.
 *
 * Safety: a process is killed ONLY when BOTH of these hold —
 *   1. it is LISTENING on one of the lab ports, and
 *   2. its command line matches a live-lab marker (this repo's path, or the
 *      backend runner / TLS terminator / vite dev invocation).
 * Unrelated processes are reported, never touched.
 *
 * Usage (repo root): npm run lab:stop
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, "..");

const LAB_PORTS = [4000, 8090, 8443, 4443];
// Command-line markers identifying OUR dev/lab processes. The backend can be
// running either via the lab runner (live-backend.mts) or as a plain dev
// server (node dist/server.js / tsx src/server.ts) — all are this repo's dev
// backends and all are fair game for an explicit `npm run lab:stop`.
const MARKERS = [
  repo.toLowerCase(),
  "live-backend.mts",
  "https-proxy.mjs",
  "vite.js dev",
  "dist\\server.js",
  "dist/server.js",
  "src\\server.ts",
  "src/server.ts",
];

/**
 * True when a command line matches one of this repo's lab/dev markers — or the
 * optional `extra` marker (e.g. the orchestrator's own script name).
 */
function isLabProcess(cmd, extra) {
  return MARKERS.some((marker) => cmd.includes(marker)) || (extra ? cmd.includes(extra) : false);
}

function listeningPids(port) {
  try {
    const netstat = execSync("netstat -ano -p tcp", { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const re = new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, "m");
    const m = netstat.match(re);
    return m ? [Number(m[1])] : [];
  } catch {
    return [];
  }
}

function commandLine(pid) {
  try {
    const out = execSync(
      `powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
      { stdio: ["ignore", "pipe", "ignore"] },
    ).toString();
    return out.trim().toLowerCase();
  } catch {
    return "";
  }
}

function processImage(pid) {
  try {
    const line = execSync(`tasklist /fi "PID eq ${pid}" /fo csv /nh`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    return line.split('","')[0]?.replace(/^"/, "") || `pid ${pid}`;
  } catch {
    return `pid ${pid}`;
  }
}

/** All running node.exe PIDs (best-effort; empty on failure). */
function nodePids() {
  try {
    const out = execSync(`tasklist /fi "imagename eq node.exe" /fo csv /nh`, {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    return out
      .split(/\r?\n/)
      .map((line) => line.split('","')[1])
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

let stopped = 0;
// PIDs already handled in this run. The TLS terminator owns :8443 AND :4443
// with one process, and a just-killed PID reports an EMPTY command line — so
// without this, the second port would be reported as "NOT a live-lab process,
// leaving it alone", a misleading warning about a process we just stopped.
const handled = new Set();

// Stale ORCHESTRATORS first: a hung `start-https-lab.mjs` process holds no lab
// port (it only spawns children), so the port sweep below can never see it —
// yet it would keep waiting on dead ports and confuse the next run's logs.
// Its own /T kill also tears down any children it still owns.
for (const pid of nodePids()) {
  if (!isLabProcess(commandLine(pid), "start-https-lab.mjs")) continue;
  console.log(`[stop] stopping stale orchestrator start-https-lab.mjs (pid ${pid})...`);
  handled.add(pid);
  try {
    execSync(`taskkill /pid ${pid} /T /F`, { stdio: ["ignore", "pipe", "ignore"] });
    stopped++;
  } catch (err) {
    console.error(`[stop] failed to stop orchestrator pid ${pid}: ${err?.message ?? err}`);
  }
}
for (const port of LAB_PORTS) {
  for (const pid of listeningPids(port)) {
    if (handled.has(pid)) continue;
    const image = processImage(pid);
    const cmd = commandLine(pid);
    const isOurs = MARKERS.some((marker) => cmd.includes(marker));
    if (!isOurs) {
      console.warn(`[stop] port ${port} held by ${image} (pid ${pid}) — NOT a live-lab process, leaving it alone.`);
      continue;
    }
    handled.add(pid);
    console.log(`[stop] stopping ${image} (pid ${pid}) on port ${port}...`);
    try {
      // /T kills the whole child tree (e.g. the in-memory mongod under the backend).
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: ["ignore", "pipe", "ignore"] });
      stopped++;
    } catch (err) {
      console.error(`[stop] failed to stop pid ${pid}: ${err?.message ?? err}`);
      process.exitCode = 1;
    }
  }
}
console.log(stopped > 0 ? `[stop] stopped ${stopped} live-lab process tree(s).` : "[stop] no live-lab processes were listening.");
