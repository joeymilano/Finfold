import { describe, expect, it, vi } from "vitest";
import {
  parseBoundedFormData,
  RequestBodyTooLargeError
} from "@/lib/bounded-form-data";

describe("bounded multipart parsing", () => {
  it("counts the actual stream when Content-Length is absent", async () => {
    const boundary = "finfold-test-boundary";
    const payload = new TextEncoder().encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\n` +
      `payload-that-crosses-the-limit\r\n--${boundary}--\r\n`
    );
    const fallback = vi.fn();
    const request = {
      body: streamBytes(payload, 11),
      headers: new Headers({
        "content-type": `multipart/form-data; boundary=${boundary}`
      }),
      formData: fallback
    } as unknown as Request;

    await expect(parseBoundedFormData(request, 32)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError
    );
    expect(fallback).not.toHaveBeenCalled();
  });

  it("parses a small multipart stream through Response.formData", async () => {
    const boundary = "finfold-small-boundary";
    const payload = new TextEncoder().encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nok\r\n` +
      `--${boundary}--\r\n`
    );
    const request = {
      body: streamBytes(payload, 7),
      headers: new Headers({
        "content-type": `multipart/form-data; boundary=${boundary}`
      }),
      formData: vi.fn()
    } as unknown as Request;

    const formData = await parseBoundedFormData(request, payload.byteLength);

    expect(formData.get("note")).toBe("ok");
  });

  it("falls back to request.formData for body-less route test doubles", async () => {
    const expected = new FormData();
    expected.set("note", "fallback");
    const fallback = vi.fn().mockResolvedValue(expected);
    const request = {
      body: null,
      formData: fallback
    } as unknown as Request;

    await expect(parseBoundedFormData(request, 1)).resolves.toBe(expected);
    expect(fallback).toHaveBeenCalledOnce();
  });
});

function streamBytes(bytes: Uint8Array, chunkSize: number): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
      }
      controller.close();
    }
  });
}
