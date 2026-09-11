import { describe, expect, it } from 'vitest';
import { UnsafeURLError, assertSafeUrl, isPrivateAddress } from '../api/_lib/safeUrl';

/**
 * These are the cases that make a URL-fetching endpoint dangerous. The
 * endpoint fetches an address chosen by the caller, from inside our
 * infrastructure — unguarded, that reads cloud credentials and pokes internal
 * services.
 */
describe('isPrivateAddress', () => {
  it('rejects every private and reserved IPv4 range', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.1',
      '169.254.169.254', // the cloud metadata endpoint
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('allows public addresses', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '172.32.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('rejects private IPv6, including IPv4-mapped addresses', () => {
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('rejects anything that is not an address at all', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});

describe('assertSafeUrl', () => {
  const rejects = async (url: string) => {
    await expect(assertSafeUrl(url)).rejects.toBeInstanceOf(UnsafeURLError);
  };

  it('refuses non-http schemes', async () => {
    await rejects('file:///etc/passwd');
    await rejects('ftp://example.com/x');
    await rejects('gopher://example.com/');
  });

  it('refuses loopback and link-local literals', async () => {
    await rejects('http://127.0.0.1:6379/');
    await rejects('http://169.254.169.254/latest/meta-data/');
    await rejects('http://[::1]:8080/');
  });

  it('refuses internal hostnames', async () => {
    await rejects('http://localhost:3000/');
    await rejects('http://metadata.google.internal/');
    await rejects('http://printer.local/');
    await rejects('http://db.internal/');
  });

  it('refuses embedded credentials', async () => {
    await rejects('https://user:password@example.com/');
  });

  it('allows a public literal address', async () => {
    await expect(assertSafeUrl('https://1.1.1.1/')).resolves.toBeInstanceOf(URL);
  });
});
