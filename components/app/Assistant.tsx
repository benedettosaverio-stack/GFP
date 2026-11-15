"use client";
import { useEffect, useRef, useState } from "react";
import { aiChat, type ChatMsg } from "@/lib/ai";
import { useApp } from "./store";
import Rich from "./Rich";

const IDEAS = [
  "Où part l'essentiel de mon argent ce mois-ci ?",
  "Combien j'ai dépensé en restos et sorties depuis 3 mois ?",
  "Est-ce que je peux me permettre un achat de 1 500 € dans 3 mois ?",
  "Quels abonnements je pourrais couper ?",
];

/** Assistant : questions libres sur tes comptes, réponses à partir de tes opérations. */
export default function Assistant() {
  const app = useApp();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);
  useEffect(() => { if (app.assistantOpen) setTimeout(() => input.current?.focus(), 50); }, [app.assistantOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && app.setAssistantOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app]);

  if (!app.assistantOpen) return null;

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: ChatMsg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next);
    setQ("");
    setErr(null);
    setBusy(true);
    try {
      const answer = await aiChat(app.aiContext(), next);
      setMsgs([...next, { role: "assistant", content: answer }]);
    } catch (e) {
      setErr((e as Error).message);
      setMsgs(msgs);
      setQ(question);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drawer-wrap" onClick={(e) => e.target === e.currentTarget && app.setAssistantOpen(false)}>
      <aside className="drawer" role="dialog" aria-label="Assistant">
        <header className="drawer-head">
          <div><h3>Assistant</h3><p className="muted small">Répond à partir de tes opérations.</p></div>
          <div className="drawer-actions">
            {msgs.length > 0 && <button className="link muted" onClick={() => { setMsgs([]); setErr(null); }}>Nouvelle discussion</button>}
            <button className="close" onClick={() => app.setAssistantOpen(false)} aria-label="Fermer">×</button>
          </div>
        </header>

        <div className="chat">
          {!app.aiEnabled ? (
            <div className="chat-empty">
              <b>L&apos;IA n&apos;est pas encore branchée</b>
              <p>Ajoute ta clé API dans Vercel (Réglages → Intelligence artificielle explique comment), puis recharge la page.</p>
            </div>
          ) : !msgs.length ? (
            <div className="chat-empty">
              <b>Pose une question sur tes comptes</b>
              <div className="ideas">{IDEAS.map((i) => <button key={i} onClick={() => ask(i)}>{i}</button>)}</div>
            </div>
          ) : (
            msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>{m.role === "assistant" ? <Rich text={m.content} /> : m.content}</div>
            ))
          )}
          {busy && <div className="bubble assistant typing" aria-label="L'assistant réfléchit"><i /><i /><i /></div>}
          {err && <p className="error small">{err}</p>}
          <div ref={end} />
        </div>

        <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <textarea
            ref={input} rows={1} value={q} placeholder="Ta question…" disabled={!app.aiEnabled}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }}
          />
          <button type="submit" disabled={!q.trim() || busy || !app.aiEnabled} aria-label="Envoyer">↑</button>
        </form>
        <p className="drawer-foot">Tes libellés et montants sont envoyés à l&apos;IA, sans ton nom ni tes numéros de compte. Pas un conseil en investissement.</p>
      </aside>
    </div>
  );
}
