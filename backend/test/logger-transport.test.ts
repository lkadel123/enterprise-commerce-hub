import { describe, expect, it } from "vitest";

import { isPinoPrettyAvailable, resolveLoggerOptions } from "../src/utils/logger.js";

/**
 * Production-startup regression tests for the log transport (Phase 20B).
 *
 * `pino-pretty` is a devDependency, so the cPanel/Passenger production install
 * (`npm ci --omit=dev`) does not contain it. pino resolves a string
 * `transport.target` eagerly, inside `pino(options)` — i.e. while this module is
 * imported, before the app can serve anything — and throws
 * `unable to determine transport target for "pino-pretty"` when the formatter
 * cannot be resolved. That aborted the whole process at startup instead of
 * degrading one log line.
 *
 * Importing `../src/utils/logger.js` at the top of this file already proves the
 * module still constructs its pino instance in the installed tree; the cases
 * below pin the two rules that keep a production boot independent of any
 * dev-only dependency.
 */
describe("logger transport selection", () => {
  it("never enables the pretty transport in production, even when pino-pretty is installed", () => {
    const options = resolveLoggerOptions({ production: true, prettyAvailable: true });

    expect(options.transport).toBeUndefined();
    expect("transport" in options).toBe(false);
  });

  it("falls back to plain JSON when pino-pretty is not installed", () => {
    const options = resolveLoggerOptions({ production: false, prettyAvailable: false });

    expect(options.transport).toBeUndefined();
    expect("transport" in options).toBe(false);
  });

  it("enables pino-pretty for local development when it is installed", () => {
    const options = resolveLoggerOptions({ production: false, prettyAvailable: true });

    expect(options.transport).toEqual({
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
    });
  });

  it("keeps the same base options in every environment", () => {
    for (const production of [true, false]) {
      const options = resolveLoggerOptions({ production, prettyAvailable: false });

      expect(typeof options.level).toBe("string");
      expect(options.base).toEqual({ service: "enterprise-commerce-hub-api" });
      expect(typeof options.timestamp).toBe("function");
    }
  });

  it("probes the formatter without throwing and only prettifies when it is present", () => {
    // The probe must never throw: a missing devDependency is a normal state on
    // a production host, and this is the guard the module-level logger uses.
    const available = isPinoPrettyAvailable();
    expect(typeof available).toBe("boolean");

    // Mirrors the module-level decision for a non-production process.
    const options = resolveLoggerOptions({ production: false, prettyAvailable: available });
    expect(options.transport === undefined).toBe(!available);
  });
});
