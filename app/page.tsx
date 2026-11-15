"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import AuthScreen from "@/components/AuthScreen";
import { AppProvider } from "@/components/app/store";
import Shell from "@/components/app/Shell";

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="empty">Chargement…</div>;
  if (!session) return <AuthScreen />;
  return (
    <AppProvider session={session}>
      <Shell />
    </AppProvider>
  );
}
