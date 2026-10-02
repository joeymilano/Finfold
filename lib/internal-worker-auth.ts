export const INTERNAL_WORKER_SECRET_HEADER =
  "x-finfold-internal-worker-secret";

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

function constantTimeEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export async function verifyInternalWorkerRequest(
  request: Request
): Promise<boolean> {
  const expected = process.env.GENERATION_WORKER_SECRET;
  const provided = request.headers.get(INTERNAL_WORKER_SECRET_HEADER);
  if (!expected || !provided) return false;
  const [providedHash, expectedHash] = await Promise.all([
    sha256(provided),
    sha256(expected)
  ]);
  return constantTimeEqual(providedHash, expectedHash);
}
