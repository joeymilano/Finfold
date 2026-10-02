import { bytesToArrayBuffer, readBytesWithLimit, safeExternalFetch } from "@/lib/safe-url";
import { inspectMediaUploadBytes } from "@/lib/media-upload-policy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/i;

/** Public generated covers already live in the public media bucket. Only
 * exact cover object paths are exposed; this is never an arbitrary URL proxy
 * and cannot reach private attachments or other storage buckets. */
export async function GET(_request: Request, context: { params: Promise<{ userId: string; file: string }> }) {
  const { userId, file } = await context.params;
  if (!UUID.test(userId) || !FILE.test(file)) return new Response("Not found", { status: 404 });
  const storageBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!storageBase) return new Response("Image unavailable", { status: 503 });
  try {
    const url = new URL(`/storage/v1/object/public/media/${userId}/covers/${file}`, storageBase);
    const response = await safeExternalFetch(url.toString(), {}, {
      timeoutMs: 20_000, maxRedirects: 0, auditPurpose: "first_party_generated_image"
    });
    if (!response.ok) return new Response("Image unavailable", { status: response.status === 404 ? 404 : 502 });
    const bytes = await readBytesWithLimit(response, 15 * 1024 * 1024);
    const inspection = inspectMediaUploadBytes(bytes);
    if (!inspection.ok) return new Response("Image unavailable", { status: 502 });
    return new Response(bytesToArrayBuffer(bytes), { headers: {
      "Content-Type": inspection.contentType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*"
    } });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
