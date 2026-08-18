import { Agent as HttpsAgent } from "node:https";
import type { Duplex } from "node:stream";
import { connect as tlsConnect, type TLSSocket } from "node:tls";

/**
 * TLS for WebDAV servers that present a certificate no public CA signed.
 *
 * A NAS on the LAN almost always does. Synology ships a self-signed
 * certificate, and it is issued for a hostname while people reach the box by
 * IP, so both the chain and the name check fail.
 *
 * The wrong fix is to stop verifying. "Accept any certificate" means anything
 * on the network can impersonate the NAS and collect the WebDAV password on
 * the way past, which is worse than it sounds because that password is a
 * DSM account.
 *
 * What this does instead is pin: the user is shown the certificate's SHA-256
 * fingerprint once, decides whether to trust it, and from then on **only that
 * exact certificate** is accepted. Same model as SSH's known_hosts. It is
 * secure against interception after the first connection, and the first
 * connection is the one where the user is looking at the fingerprint.
 */

export interface PeerCertificate {
  /** SHA-256 fingerprint, upper-case hex with colons. */
  fingerprint: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  /** True when the certificate signed itself, i.e. no CA vouches for it. */
  selfSigned: boolean;
}

function normalize(fingerprint: string | undefined): string {
  return (fingerprint ?? "").replace(/:/g, "").toUpperCase();
}

function describe(part: Record<string, unknown> | undefined): string {
  if (!part) return "?";
  const cn = part.CN ?? part.O ?? part.OU;
  return typeof cn === "string" ? cn : JSON.stringify(part);
}

/**
 * Open a bare TLS connection and report what the server presents, without
 * verifying it. Used only to *show* the user a fingerprint to decide on; it
 * never sends credentials.
 */
export function inspectCertificate(
  rawUrl: string,
  timeoutMs = 8_000,
): Promise<PeerCertificate> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") {
    return Promise.reject(new Error("La URL no usa HTTPS"));
  }
  const port = Number(url.port || 443);
  // RFC 6066 forbids an IP literal as SNI, and Node warns about it. Reaching a
  // NAS by address is the normal case here, so only send SNI for real names.
  const isIp = /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":");

  return new Promise((resolve, reject) => {
    const socket = tlsConnect(
      {
        host: url.hostname,
        port,
        ...(isIp ? {} : { servername: url.hostname }),
        // Deliberately unverified: the entire point is to look at a
        // certificate that does not verify, so the user can judge it.
        rejectUnauthorized: false,
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        if (!cert || !cert.fingerprint256) {
          reject(new Error("El servidor no presentó certificado"));
          return;
        }
        resolve({
          fingerprint: cert.fingerprint256,
          subject: describe(cert.subject as Record<string, unknown>),
          issuer: describe(cert.issuer as Record<string, unknown>),
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          selfSigned:
            JSON.stringify(cert.subject ?? {}) === JSON.stringify(cert.issuer ?? {}),
        });
      },
    );
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error("Tiempo de espera agotado al leer el certificado"));
    });
    socket.on("error", (err) => reject(err));
  });
}

/**
 * An HTTPS agent that accepts exactly one certificate, by fingerprint.
 *
 * The handshake runs unverified so a self-signed certificate does not abort
 * it, and the pin is checked the instant the handshake completes. That check
 * happens before the HTTPS layer writes the request, so a wrong certificate
 * never sees the credentials: the socket is destroyed with nothing sent.
 */
class PinnedAgent extends HttpsAgent {
  constructor(private readonly pin: string) {
    super({
      rejectUnauthorized: false,
      keepAlive: false,
      // No TLS session resumption. On a resumed session the server does not
      // re-send its certificate, so `getPeerCertificate()` comes back empty
      // and there is nothing to compare the pin against. Without this the
      // first request works and every one after it fails, which is both a
      // broken feature and a check that silently stops checking. A full
      // handshake per request is irrelevant next to uploading an archive.
      maxCachedSessions: 0,
    });
  }

  override createConnection(
    options: Record<string, unknown>,
    callback?: (err: Error | null, stream: Duplex) => void,
  ): Duplex {
    const socket = super.createConnection(
      { ...options, rejectUnauthorized: false },
      callback,
    ) as unknown as TLSSocket;
    socket.on("secureConnect", () => {
      const presented = normalize(socket.getPeerCertificate()?.fingerprint256);
      // An empty fingerprint fails closed: no certificate to compare means no
      // grounds to trust the connection.
      if (presented !== this.pin) {
        socket.destroy(
          new Error(
            "PINNED_CERT_MISMATCH: el certificado del servidor no coincide con el aceptado. " +
              "Si has renovado el certificado del NAS, vuelve a aceptarlo desde Ajustes; " +
              "si no, alguien puede estar interceptando la conexión.",
          ),
        );
      }
    });
    return socket;
  }
}

/**
 * The agent to use for a connection. Returns undefined when there is no pin,
 * so a server with a proper certificate keeps full standard verification and
 * this whole mechanism stays out of the way.
 */
export function agentFor(
  fingerprint: string | undefined | null,
): HttpsAgent | undefined {
  const pin = normalize(fingerprint ?? undefined);
  return pin ? new PinnedAgent(pin) : undefined;
}

/** True when an error is the "no CA vouches for this" family. */
export function isCertificateError(message: string): boolean {
  return /self[- ]signed certificate|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED|unable to get local issuer/i.test(
    message,
  );
}
