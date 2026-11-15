"use client";
import { useEffect, useState } from "react";

/** Bouton d'import fixe en bas + glisser-déposer sur toute la page. */
export default function ImportBar({ busy, onFiles }: { busy: boolean; onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => { e.preventDefault(); depth++; setDragging(true); };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length && !busy) onFiles(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [busy, onFiles]);

  return (
    <>
      <div className="importbar">
        <label aria-busy={busy}>
          {busy ? "Import en cours…" : "⬆︎ Importer un relevé (PDF ou CSV)"}
          <input
            type="file" multiple accept=".pdf,.csv,.txt,application/pdf,text/csv"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) onFiles(files);
            }}
          />
        </label>
      </div>
      {dragging && <div className="drop">Dépose ton relevé ici</div>}
    </>
  );
}
