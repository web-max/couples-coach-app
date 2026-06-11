import * as SQLite from "expo-sqlite";

// Device custody: this SQLite file is the only place full transcripts live
// (SPEC.md: transcripts transit, never persist server-side).
export type StoredMessage = {
  id: number;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("transcripts.db");
    await db.execAsync(`
      pragma journal_mode = wal;
      create table if not exists messages (
        id integer primary key autoincrement,
        session_id text not null,
        role text not null check (role in ('user', 'assistant')),
        content text not null,
        created_at integer not null
      );
      create index if not exists messages_session on messages (session_id, id);
    `);
  }
  return db;
}

export async function appendMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    "insert into messages (session_id, role, content, created_at) values (?, ?, ?, ?)",
    sessionId,
    role,
    content,
    Date.now(),
  );
}

export async function loadMessages(sessionId: string): Promise<StoredMessage[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<{
    id: number;
    session_id: string;
    role: "user" | "assistant";
    content: string;
    created_at: number;
  }>("select * from messages where session_id = ? order by id", sessionId);
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }));
}
