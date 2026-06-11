import { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import AuthScreen from "./screens/AuthScreen";
import ChatScreen from "./screens/ChatScreen";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="auto" />
      {session ? <ChatScreen session={session} /> : <AuthScreen />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
