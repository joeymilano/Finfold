/**
 * Reads a fetch() Response body as a stream of Server-Sent Events.
 *
 * Used instead of the browser EventSource API because EventSource can only
 * issue GET requests — our generation endpoints take a POST body, so we
 * read/parse the raw stream ourselves. `onEvent` is called synchronously as
 * each event is parsed, in the order the server sent them; if it throws,
 * the throw propagates out of this function (the caller's await rejects).
 */
export async function consumeSSEStream(
  response: Response,
  onEvent: (event: string, data: unknown) => void
): Promise<void> {
  if (!response.body) {
    throw new Error("Response has no body to stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex: number;
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const eventMatch = rawEvent.match(/^event: (.+)$/m);
      const dataMatch = rawEvent.match(/^data: (.+)$/m);
      if (!dataMatch) {
        continue;
      }

      onEvent(eventMatch?.[1] ?? "message", JSON.parse(dataMatch[1]));
    }
  }
}
