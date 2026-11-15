"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const auth = supabase().auth;
    const res = mode === "in"
      ? await auth.signInWithPassword({ email, password })
      : await auth.signUp({ email, password });
    setBusy(false);
    if (res.error) setError(res.error.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : res.error.message);
    else if (mode === "up" && !res.data.session) setInfo("Compte créé : confirme ton email puis connecte-toi.");
  }

  return (
    <main className="auth">
      <h1>GFP</h1>
      <p>Importe ton relevé, tes dépenses se trient toutes seules.</p>
      <form onSubmit={submit}>
        <input type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="err">{error}</div>}
        {info && <div className="muted">{info}</div>}
        <button type="submit" disabled={busy}>{busy ? "…" : mode === "in" ? "Se connecter" : "Créer mon compte"}</button>
      </form>
      <div className="switch">
        <button className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </main>
  );
}
