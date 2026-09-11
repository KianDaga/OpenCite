/**
 * Ids are generated on the device — there is no server to hand them out, and a
 * future sync layer needs them to be collision-free across devices. UUID v4
 * from the Web Crypto API satisfies both.
 */
export function newId(): string {
  const webcrypto: Crypto | undefined = globalThis.crypto;

  if (typeof webcrypto?.randomUUID === 'function') {
    return webcrypto.randomUUID();
  }

  // `randomUUID` needs a secure context; older Safari and plain-http dev
  // servers land here.
  if (webcrypto) {
    const bytes = new Uint8Array(16);
    webcrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  throw new Error('No Web Crypto available: OpenCite cannot generate stable ids.');
}
