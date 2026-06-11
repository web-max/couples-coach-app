import { parseSse } from "../lib/sse";

describe("parseSse", () => {
  it("extracts content deltas across chunk boundaries", () => {
    let st = parseSse("", 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choi');
    expect(st.deltas).toEqual(["Hel"]);
    expect(st.done).toBe(false);
    st = parseSse(st.buffer, 'ces":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n');
    expect(st.deltas).toEqual(["lo"]);
    expect(st.done).toBe(true);
  });
  it("ignores comments and non-content events", () => {
    const st = parseSse("", ': keepalive\n\ndata: {"choices":[{"delta":{}}]}\n\n');
    expect(st.deltas).toEqual([]);
    expect(st.done).toBe(false);
  });
});
