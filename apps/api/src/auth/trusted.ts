import type { FastifyRequest } from "fastify";
import { getEnv } from "../env.js";
import { getTrustedNetworks } from "../settings/service.js";

/**
 * The client IP as seen by the app. Behind a reverse proxy every request
 * arrives with the proxy's address, so `X-Forwarded-For` is only honoured when
 * the operator explicitly opts in with TRUSTED_PROXY=true. Otherwise we use the
 * raw socket address. This is what keeps "trusted network" from silently
 * trusting everyone when deployed behind a proxy.
 */
export function clientIp(req: FastifyRequest): string {
  if (getEnv().TRUSTED_PROXY) {
    const xff = req.headers["x-forwarded-for"];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    const first = raw?.split(",")[0]?.trim();
    if (first) return normalizeIp(first);
  }
  return normalizeIp(req.socket.remoteAddress ?? "");
}

function normalizeIp(ip: string): string {
  // Unwrap IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.10).
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/**
 * True when the request originates from one of the admin-configured trusted
 * CIDRs. IPv4 only (LAN ranges); IPv6 clients are never considered trusted.
 * With no configured networks this is always false (feature off).
 */
export function isTrustedNetwork(req: FastifyRequest): boolean {
  const cidrs = getTrustedNetworks();
  if (cidrs.length === 0) return false;
  const ip = clientIp(req);
  return cidrs.some((c) => ipv4InCidr(ip, c));
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  if (!range) return false;
  const bits = bitsStr === undefined ? 32 : Number.parseInt(bitsStr, 10);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipN = ipv4ToInt(ip);
  const rangeN = ipv4ToInt(range);
  if (ipN === null || rangeN === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (ipN & mask) === (rangeN & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = ((n << 8) | o) >>> 0;
  }
  return n >>> 0;
}
