import { resolve } from "node:dns/promises";

const PRIVATE_RANGES = [
  // IPv4
  { prefix: 0x7f000000, mask: 0xff000000 }, // 127.0.0.0/8
  { prefix: 0x0a000000, mask: 0xff000000 }, // 10.0.0.0/8
  { prefix: 0xac100000, mask: 0xfff00000 }, // 172.16.0.0/12
  { prefix: 0xc0a80000, mask: 0xffff0000 }, // 192.168.0.0/16
  { prefix: 0xa9fe0000, mask: 0xffff0000 }, // 169.254.0.0/16
  { prefix: 0x00000000, mask: 0xff000000 }, // 0.0.0.0/8
];

function parseIPv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    const byte = Number(part);
    if (byte < 0 || byte > 255 || !Number.isInteger(byte)) return null;
    num = (num << 8) | byte;
  }
  return num >>> 0; // unsigned
}

function isPrivateIPv4(ip: string): boolean {
  const num = parseIPv4(ip);
  if (num === null) return false;
  return PRIVATE_RANGES.some((r) => ((num & r.mask) >>> 0) === r.prefix);
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // fe80::/10
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4match = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4match) return isPrivateIPv4(v4match[1]);
  return false;
}

export async function validatePBUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https schemes are allowed");
  }

  const hostname = parsed.hostname;

  // Check if hostname is an IP literal first (skip DNS for these)
  let addresses: string[];
  const bracketStripped =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : null;

  if (parseIPv4(hostname) !== null) {
    addresses = [hostname];
  } else if (bracketStripped) {
    addresses = [bracketStripped];
  } else {
    // Hostname is a domain name — resolve to IPs
    try {
      const result4 = await resolve(hostname, "A");
      const result6 = await resolve(hostname, "AAAA").catch(() => [] as string[]);
      addresses = [...result4, ...result6];
    } catch {
      addresses = [hostname];
    }
  }

  for (const addr of addresses) {
    if (isPrivateIPv4(addr) || isPrivateIPv6(addr)) {
      throw new Error("URLs pointing to private/internal networks are not allowed");
    }
  }

  return url;
}
