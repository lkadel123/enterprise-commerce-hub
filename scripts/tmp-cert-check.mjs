/**
 * TEMP diagnostic: inspect the live-lab TLS cert + check trust stores.
 * Prints cert subject/issuer/validity and whether an mkcert root CA is
 * installed in the Windows user/machine root stores. No secrets printed.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const pem = readFileSync("live-lab/certs/localhost.pem", "utf8");
const b64 = pem
  .replace(/-----(BEGIN|END) CERTIFICATE-----/g, "")
  .replace(/\s+/g, "");
const der = Buffer.from(b64, "base64");

const X509 = (await import("node:crypto")).X509Certificate;
const cert = new X509(der);
console.log("CERT SUBJECT :", cert.subject.replaceAll("\n", " "));
console.log("CERT ISSUER  :", cert.issuer.replaceAll("\n", " "));
console.log("CERT VALID TO:", cert.validTo, "(UTC)");
console.log("SELF-SIGNED? :", cert.subject === cert.issuer);
console.log("");

for (const store of ["Cert:\\CurrentUser\\Root", "Cert:\\LocalMachine\\Root"]) {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-ChildItem '${store}' | Where-Object Subject -like '*mkcert*' | Select-Object -ExpandProperty Subject"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    console.log(`${store} mkcert CA:`, out ? out.replaceAll("\n", " | ") : "NOT INSTALLED");
  } catch {
    console.log(`${store} mkcert CA: NOT INSTALLED (query failed)`);
  }
}
