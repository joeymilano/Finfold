const PREFIX = "enc:v1";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function hasValidIntegrationEncryptionKey(
  encoded = process.env.INTEGRATION_ENCRYPTION_KEY
): boolean {
  if (!encoded) return false;
  try {
    return base64ToBytes(encoded).byteLength === 32;
  } catch {
    return false;
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function encryptionKey(): Promise<CryptoKey> {
  const encoded = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Integration credential encryption is not configured.");

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(encoded);
  } catch {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  if (bytes.byteLength !== 32) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return crypto.subtle.importKey("raw", toArrayBuffer(bytes), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${PREFIX}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

/**
 * Plaintext values are accepted only for backward compatibility with tokens
 * stored before encryption shipped. New writes always use encryptSecret.
 */
export async function decryptSecret(storedValue: string): Promise<string> {
  if (!isEncryptedSecret(storedValue)) return storedValue;

  const [, , ivValue, ciphertextValue] = storedValue.split(":");
  if (!ivValue || !ciphertextValue) throw new Error("Encrypted integration credential is malformed.");

  const key = await encryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(ivValue)) },
    key,
    toArrayBuffer(base64ToBytes(ciphertextValue))
  );
  return new TextDecoder().decode(plaintext);
}
