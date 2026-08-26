import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal.js";

/**
 * Where the source of a formula or a diagram is written.
 *
 * A `window.prompt` was the first version and was wrong for two reasons that
 * both matter. A Mermaid diagram is several lines and a prompt is one line, so
 * the box was the wrong shape for half of what it was for; and a native dialog
 * cannot be styled, cannot be seen next to the note it belongs to, and behaves
 * differently in every browser.
 *
 * The hint underneath is not decoration. Nobody remembers Mermaid's syntax,
 * and an empty box with no example is a feature people try once.
 */
export function EditorSourceDialog({
  title,
  hint,
  initial,
  rows = 6,
  onSave,
  onClose,
}: {
  title: string;
  hint?: string;
  initial: string;
  rows?: number;
  onSave: (source: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState(initial);

  return (
    <Modal title={title} onClose={onClose} size="md">
      <div className="space-y-2">
        <textarea
          value={source}
          autoFocus
          rows={rows}
          aria-label={title}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter saves, because the plain Enter has a job here.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (source.trim()) onSave(source);
            }
          }}
          className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!source.trim()}
            onClick={() => onSave(source)}
            className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {t("richText.insertSource")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
