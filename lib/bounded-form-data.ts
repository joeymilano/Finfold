const MEBIBYTE = 1024 * 1024;

export const MEDIA_MULTIPART_MAX_BYTES = 27 * MEBIBYTE;
export const AVATAR_MULTIPART_MAX_BYTES = 3 * MEBIBYTE;
export const IMAGE_MULTIPART_MAX_BYTES = 17 * MEBIBYTE;
export const DATA_MULTIPART_MAX_BYTES = 4 * MEBIBYTE;
export const MCP_JSON_MAX_BYTES = 12 * MEBIBYTE;

export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds the ${maxBytes}-byte limit.`);
    this.name = "RequestBodyTooLargeError";
  }
}

/**
 * Parse multipart data while enforcing a limit on bytes actually read from the
 * request stream. Content-Length is only an early rejection hint: callers can
 * omit it or use a chunked request, so the TransformStream remains authoritative.
 */
export async function parseBoundedFormData(
  request: Request,
  maxBytes: number
): Promise<FormData> {
  // Route unit tests use a minimal request double with formData() only. Real
  // Fetch Requests have a body stream and always take the bounded path below.
  if (!request.body) return request.formData();

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  const contentType = request.headers.get("content-type");
  if (!contentType) throw new TypeError("Missing multipart Content-Type header.");

  let bytesRead = 0;
  let limitExceeded = false;
  const limitedBody = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytesRead += chunk.byteLength;
        if (bytesRead > maxBytes) {
          limitExceeded = true;
          controller.error(new RequestBodyTooLargeError(maxBytes));
          return;
        }
        controller.enqueue(chunk);
      }
    })
  );

  try {
    return await new Response(limitedBody, {
      headers: { "content-type": contentType }
    }).formData();
  } catch (error) {
    // Some Fetch implementations wrap stream errors while parsing multipart.
    // Preserve a stable error type for the route's 413 response.
    if (limitExceeded) throw new RequestBodyTooLargeError(maxBytes);
    throw error;
  }
}

/** Parse a JSON request body with the same authoritative stream limit used by
 * multipart requests. Request.json() alone accepts arbitrarily large chunked
 * bodies, which is unsuitable for text-analysis endpoints. */
export async function parseBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.body) return request.json();

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  let bytesRead = 0;
  let limitExceeded = false;
  const limitedBody = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytesRead += chunk.byteLength;
        if (bytesRead > maxBytes) {
          limitExceeded = true;
          controller.error(new RequestBodyTooLargeError(maxBytes));
          return;
        }
        controller.enqueue(chunk);
      }
    })
  );

  try {
    return JSON.parse(await new Response(limitedBody).text());
  } catch (error) {
    if (limitExceeded) throw new RequestBodyTooLargeError(maxBytes);
    throw error;
  }
}
