import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:https";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Trusting a self-signed certificate, the way a NAS on the LAN presents one.
 *
 * A real HTTPS server with a generated self-signed certificate stands in for
 * the NAS, because the whole point is the TLS handshake and a mock would prove
 * nothing. What matters is that trust is *pinned*: accepting one certificate
 * must not turn into accepting any certificate, so the test also checks that a
 * different one is refused.
 */
const user = {
  email: "cert.pin.e2e@example.com",
  nickname: "certpinuser",
  password: "TrustOnFirstUse26x",
};

function selfSigned(cn: string) {
  const dir = mkdtempSync(join(tmpdir(), "cert-"));
  execFileSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"),
      "-days", "2", "-subj", `/CN=${cn}`,
    ],
    { stdio: "ignore" },
  );
  return {
    key: readFileSync(join(dir, "k.pem")),
    cert: readFileSync(join(dir, "c.pem")),
  };
}

/** Minimal WebDAV: enough PROPFIND for the directory listing to succeed. */
function davServer(creds: { key: Buffer; cert: Buffer }): Promise<{
  server: Server;
  port: number;
}> {
  const server = createServer(creds, (req, res) => {
    if (req.method === "PROPFIND") {
      res.writeHead(207, { "content-type": "application/xml" });
      res.end(
        `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:">
           <D:response><D:href>/</D:href><D:propstat><D:prop>
             <D:resourcetype><D:collection/></D:resourcetype>
             <D:displayname>/</D:displayname>
           </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
         </D:multistatus>`,
      );
      return;
    }
    res.writeHead(200);
    res.end("ok");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: (server.address() as { port: number }).port });
    });
  });
}

test("certificado autofirmado: se inspecciona, se ancla y solo vale ese", async ({
  browser,
}) => {
  const good = selfSigned("nas.local");
  const impostor = selfSigned("nas.local");
  const { server, port } = await davServer(good);
  const url = `https://127.0.0.1:${port}`;

  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const creds = { url, username: "u", password: "p" };

  // Without a pin the connection is refused: verification stays on, which is
  // the behaviour that makes pinning meaningful rather than decorative.
  const strict = await (
    await req.post("/api/cloud/synology/test", { data: creds })
  ).json();
  expect(strict.ok).toBe(false);
  expect(strict.message).toMatch(/[Cc]ertificad/);

  // Inspecting shows what the server presents, without sending credentials.
  const certRes = await req.post("/api/cloud/inspect-cert", { data: { url } });
  expect(certRes.ok(), await certRes.text()).toBeTruthy();
  const cert = await certRes.json();
  expect(cert.selfSigned).toBe(true);
  expect(cert.subject).toBe("nas.local");
  expect(cert.fingerprint).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/);

  // With that fingerprint the connection works.
  const pinned = await (
    await req.post("/api/cloud/synology/test", {
      data: { ...creds, certFingerprint: cert.fingerprint },
    })
  ).json();
  expect(pinned.ok, JSON.stringify(pinned)).toBe(true);

  // A different certificate for the same name is still refused. This is the
  // assertion that separates pinning from "accept anything".
  const otherCert = await (
    await (async () => {
      const s2 = await davServer(impostor);
      const r = await req.post("/api/cloud/inspect-cert", {
        data: { url: `https://127.0.0.1:${s2.port}` },
      });
      s2.server.close();
      return r;
    })()
  ).json();
  expect(otherCert.fingerprint).not.toBe(cert.fingerprint);

  const wrongPin = await (
    await req.post("/api/cloud/synology/test", {
      data: { ...creds, certFingerprint: otherCert.fingerprint },
    })
  ).json();
  expect(wrongPin.ok).toBe(false);
  expect(wrongPin.message).toMatch(/cambiado|coincide/i);

  // And the pin survives into the saved connection.
  const saved = await req.post("/api/cloud/connect/synology", {
    data: {
      label: "NAS anclado",
      ...creds,
      basePath: "/AwesomeBookmarks",
      certFingerprint: cert.fingerprint,
    },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();

  server.close();
  await ctx.close();
});

test("importar: las instantáneas vienen desactivadas por defecto", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "import.nosnap.e2e@example.com",
    nickname: "importnosnap",
    password: "NoSnapshotsPlz26x",
  });

  await page.goto("/settings/import-export");
  const checkbox = page.getByRole("checkbox", {
    name: /instantáneas|snapshots/i,
  });
  await expect(checkbox.first()).not.toBeChecked();

  await ctx.close();
});
