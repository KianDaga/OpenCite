import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Guards the URL endpoint against being used to reach things it should not.
 *
 * `/api/lookup/url` fetches an address supplied by whoever calls it, from
 * inside our infrastructure. Without a check that is a server-side request
 * forgery hole: `http://169.254.169.254/` reads cloud instance credentials,
 * `http://localhost:6379/` pokes a Redis on the same host, and `file://`
 * reads the disk. So the scheme is restricted, the hostname is resolved, and
 * the resulting addresses are checked against every private range — before
 * the request goes out, and again on every redirect hop, because a public
 * hostname can redirect to a private one.
 */

export class UnsafeURLError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'UnsafeURLError';
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a = 0, b = 0] = parts;

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const address = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (address === '::1' || address === '::') return true;
  if (address.startsWith('fe80')) return true; // link-local
  if (/^f[cd]/.test(address)) return true; // unique local
  // IPv4-mapped (::ffff:10.0.0.1) inherits the IPv4 rules.
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // Not an address we can reason about — refuse.
}

/** Throws `UnsafeURLError` unless this URL is safe for the server to fetch. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeURLError('That does not look like a valid web address.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeURLError('Only http and https addresses can be looked up.');
  }

  // Credentials in a URL are never needed here and can leak into logs.
  if (url.username || url.password) {
    throw new UnsafeURLError('Addresses with embedded credentials are not accepted.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new UnsafeURLError('That address points at a private network.');
  }

  // A literal IP skips DNS but still has to pass the range check.
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new UnsafeURLError('That address points at a private network.');
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new UnsafeURLError('That address could not be resolved.');
  }

  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeURLError('That address points at a private network.');
  }

  return url;
}
