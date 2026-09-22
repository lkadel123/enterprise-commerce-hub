/**
 * LIVE-LAB TLS terminator: local HTTPS reverse proxies so the REAL Cybersource
 * Unified Checkout iframe can bind to an HTTPS origin:
 *   https://localhost:8443 -> http://localhost:8090  (storefront)
 *   https://localhost:4443 -> http://localhost:4000  (backend API)
 * Self-signed cert (ignored by the Playwright browser via --ignore-certificate-errors).
 * Usage: node live-lab/https-proxy.mjs
 */
import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const cert = readFileSync(join(root, "certs", "localhost.pem"));
const key = readFileSync(join(root, "certs", "localhost-key.pem"));

const targets = [
  { port: 8443, upstream: { host: "127.0.0.1", port: 8090 }, name: "storefront" },
  { port: 4443, upstream: { host: "127.0.0.1", port: 4000 }, name: "api" },
];

for (const { port, upstream, name } of targets) {
  const server = https.createServer({ cert, key }, (req, res) => {
    const proxy = http.request(
      { host: upstream.host, port: upstream.port, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${upstream.port}` } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    proxy.on("error", () => {
      res.writeHead(502);
      res.end("upstream unavailable");
    });
    req.pipe(proxy);
  });
  // A failed bind on one listener (e.g. EADDRINUSE on :8443) must not crash the
  // sibling listener (:4443) — log and keep the rest of the proxy alive.
  server.on("error", (err) => {
    console.error(`[proxy] ${name} (https://localhost:${port}) error: ${err?.message ?? err}`);
  });
  server.listen(port, () => console.log(`[proxy] ${name}: https://localhost:${port} -> http://localhost:${upstream.port}`));
}
