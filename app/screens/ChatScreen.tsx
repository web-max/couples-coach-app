import { useRef, useState } from "react";
import {
  Button,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import type { Session } from "@supabase/supabase-js";
import { supabase, RELAY_URL } from "../lib/supabase";
import { parseSse } from "../lib/sse";
import { appendMessage } from "../lib/transcripts";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatScreen({ session }: { session: Session }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  async function ensureSession(): Promise<string> {
    if (sessionIdRef.current) return sessionIdRef.current;
    const { data, error } = await supabase.rpc("start_session");
    if (error) throw new Error(error.message);
    sessionIdRef.current = data.id as string;
    return sessionIdRef.current;
  }

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    const history = [...messages, { role: "user" as const, content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    try {
      const sid = await ensureSession();
      await appendMessage(sid, "user", content);

      const res = await expoFetch(`${RELAY_URL}/v1/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) throw new Error(`relay error ${res.status}`);

      let buffer = "";
      let assistant = "";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const st = parseSse(buffer, decoder.decode(value, { stream: true }));
        buffer = st.buffer;
        if (st.deltas.length > 0) {
          assistant += st.deltas.join("");
          const snapshot = assistant;
          setMessages([...history, { role: "assistant", content: snapshot }]);
        }
        if (st.done) break;
      }
      if (assistant) await appendMessage(sid, "assistant", assistant);
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
      setMessages(history);
    } finally {
      setBusy(false);
    }
  }

  async function endSession() {
    const sid = sessionIdRef.current;
    if (!sid) return;
    await supabase.rpc("end_session", { p_session_id: sid });
    sessionIdRef.current = null;
    setMessages([]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Coach</Text>
        <Button title="End session" onPress={endSession} disabled={busy} />
        <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
      </View>
      <FlatList
        style={styles.list}
        data={messages}
        keyExtractor={(_item, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.mine : styles.theirs]}>
            <Text>{item.content || "…"}</Text>
          </View>
        )}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Talk to your coach"
          value={input}
          onChangeText={setInput}
          editable={!busy}
          multiline
        />
        <Button title="Send" onPress={send} disabled={busy || !input.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  title: { fontSize: 20, fontWeight: "600" },
  list: { flex: 1, paddingHorizontal: 12 },
  bubble: { borderRadius: 12, padding: 10, marginVertical: 4, maxWidth: "85%" },
  mine: { alignSelf: "flex-end", backgroundColor: "#dcebff" },
  theirs: { alignSelf: "flex-start", backgroundColor: "#eee" },
  error: { color: "#c00", paddingHorizontal: 12 },
  composer: { flexDirection: "row", alignItems: "flex-end", padding: 8, gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    maxHeight: 120,
  },
});
