// Incremental parser for OpenAI/OpenRouter-style SSE chat streams.
// Feed raw text chunks; carry `buffer` between calls.
export function parseSse(
  buffer: string,
  chunk: string,
): { buffer: string; deltas: string[]; done: boolean } {
  const text = buffer + chunk;
  const events = text.split("\n\n");
  const rest = events.pop() ?? "";
  const deltas: string[] = [];
  let done = false;
  for (const event of events) {
    for (const line of event.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") {
        done = true;
        continue;
      }
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) deltas.push(delta);
      } catch {
        // partial or non-JSON event — skip
      }
    }
  }
  return { buffer: rest, deltas, done };
}
