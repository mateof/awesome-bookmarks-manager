import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyText } from "../lib/clipboard.js";

/** Small icon button that copies `text` to the clipboard and briefly confirms. */
export function CopyButton({
  text,
  title,
  className,
  size = "h-3.5 w-3.5",
}: {
  text: string;
  title: string;
  className?: string;
  size?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void copyText(text).then((ok) => {
          if (!ok) return;
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className={
        className ??
        "shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      }
    >
      {done ? (
        <Check className={`${size} text-emerald-500`} />
      ) : (
        <Copy className={size} />
      )}
    </button>
  );
}
