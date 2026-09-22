#!/usr/bin/env node
// Test-runner launcher.
//
// Workaround for vitest-dev/vitest#10812 (Windows).
//
// When the shell starts with a working directory whose drive letter is not the
// canonical on-disk casing (e.g. `d:\...` vs the NTFS-canonical `D:\...`), Vitest
// resolves its own runtime files with inconsistent casing. That loads two copies
// of the runner and every test file then fails at the first `describe()` with:
//
//   TypeError: Cannot read properties of undefined (reading 'config')
//
// Normalizing the cwd to its canonical casing *before* spawning Vitest (so the
// child process starts from the canonical path) resolves the mismatch. Doing so
// in vitest.config.ts is not enough, because Vitest reads the cwd to resolve its
// own paths before that config is loaded.
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";

const canonicalCwd = realpathSync.native(process.cwd());
if (canonicalCwd !== process.cwd()) {
  process.chdir(canonicalCwd);
}

const args = process.argv.slice(2);
const isWin = process.platform === "win32";
const child = spawn(isWin ? "npx.cmd" : "npx", ["vitest", ...args], {
  stdio: "inherit",
  cwd: process.cwd(),
  shell: isWin,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
