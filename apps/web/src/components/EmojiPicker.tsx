import { Clock, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ALL_EMOJI,
  DEFAULT_RECENT,
  EMOJI_CATEGORIES,
  foldText,
  type EmojiEntry,
} from "../lib/emojiCatalog.js";

/**
 * The emoji picker: tabs, a search box, and what you used last.
 *
 * It used to be seventy-six emoji in five fixed groups, all of them on screen
 * at once. That is a fine size for a list you scroll and a poor one for a
 * catalogue: the answer to "there aren't enough" is not a longer scroll, it is
 * somewhere to look. So the catalogue is in `lib/emojiCatalog.ts`, split into
 * categories, and this is a tab strip over it.
 *
 * **Searching ignores the tabs.** A search that only looked inside the open
 * category would be a worse search than none: you type "casa" because you do
 * not know which drawer it is in.
 *
 * The recent list is real, kept in this browser. A static "frequent" group is
 * a guess about somebody else's habits; the last dozen you actually picked is
 * not a guess.
 */
const RECENT_KEY = "emoji.recent";
const RECENT_MAX = 24;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(list)) return [];
    return list.filter((x): x is string => typeof x === "string");
  } catch {
    // A blocked or full localStorage is not worth failing a picker over.
    return [];
  }
}

function pushRecent(emoji: string): void {
  try {
    const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(
      0,
      RECENT_MAX,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function EmojiPicker({
  value,
  onPick,
  onClose,
  plain = false,
}: {
  value?: string;
  onPick: (emoji: string) => void;
  onClose: () => void;
  /**
   * Drop the absolute positioning and the frame, for a caller that provides
   * both.
   *
   * The default places itself under the button it belongs to with
   * `absolute top-full`, which needs a positioned ancestor and no `overflow`
   * in between. Inside the editor there is neither: the toolbar sits in a
   * dialog that scrolls, so the panel was clipped away and the button looked
   * dead. That caller wraps it in an `AnchoredPopover` instead, which escapes
   * every container by construction — and then this frame would be the second
   * box drawn around the same list.
   */
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("recent");
  const [recent, setRecent] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = readRecent();
    setRecent(stored.length > 0 ? stored : DEFAULT_RECENT);
  }, []);

  const searching = q.trim().length > 0;

  const shown: EmojiEntry[] = useMemo(() => {
    if (searching) {
      const needle = foldText(q);
      return ALL_EMOJI.filter(
        (it) => foldText(it.k).includes(needle) || it.e === q.trim(),
      );
    }
    if (tab === "recent") {
      const byChar = new Map(ALL_EMOJI.map((it) => [it.e, it] as const));
      return recent.map((e) => byChar.get(e) ?? { e, k: "" });
    }
    return EMOJI_CATEGORIES.find((c) => c.id === tab)?.items ?? [];
  }, [q, tab, recent, searching]);

  const choose = (emoji: string) => {
    pushRecent(emoji);
    onPick(emoji);
    onClose();
  };

  return (
    <div
      ref={boxRef}
      className={
        plain
          ? // A column inside the popover: the search box and the tabs keep
            // their height and the grid takes what is left, so the only thing
            // that scrolls is the grid.
            "flex h-full w-full min-h-0 flex-col p-1"
          : "absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800"
      }
    >
      <div className="mb-2 flex shrink-0 items-center gap-1 rounded border border-slate-300 px-2 py-1 dark:border-slate-600">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("panels.emojiSearch")}
          aria-label={t("panels.emojiSearch")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          title={t("common.close")}
          aria-label={t("common.close")}
          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Hidden while searching: the tabs would be lying about what is on
          screen, since a search deliberately looks everywhere. */}
      {!searching && (
        <div
          role="tablist"
          aria-label={t("panels.emojiCategories")}
          className="mb-1 flex shrink-0 items-center gap-0.5 border-b border-slate-200 pb-1 dark:border-slate-700"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "recent"}
            onClick={() => setTab("recent")}
            title={t("panels.emojiRecent")}
            aria-label={t("panels.emojiRecent")}
            className={`rounded p-1 ${
              tab === "recent"
                ? "bg-slate-200 dark:bg-slate-700"
                : "hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <Clock className="h-3.5 w-3.5 text-slate-500" />
          </button>
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={tab === c.id}
              onClick={() => setTab(c.id)}
              title={t(`panels.emojiCat.${c.id}` as "panels.emojiCat.faces")}
              aria-label={t(`panels.emojiCat.${c.id}` as "panels.emojiCat.faces")}
              className={`rounded px-1 py-0.5 text-base leading-none ${
                tab === c.id
                  ? "bg-slate-200 dark:bg-slate-700"
                  : "hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {c.tab}
            </button>
          ))}
        </div>
      )}

      <div
        data-testid="emoji-grid"
        className={`overflow-y-auto overscroll-contain ${
          plain ? "min-h-0 flex-1" : "max-h-56"
        }`}
      >
        {shown.length === 0 && (
          <div className="px-1 py-4 text-center text-xs text-slate-400">
            {t("panels.emojiNoResults")}
          </div>
        )}
        <div className="grid grid-cols-8 gap-0.5">
          {shown.map((it) => (
            <button
              key={it.e}
              type="button"
              title={it.k.split(" ")[0] ?? it.e}
              onClick={() => choose(it.e)}
              className={`rounded p-1 text-lg leading-none hover:bg-slate-100 dark:hover:bg-slate-700 ${
                value === it.e ? "bg-slate-200 dark:bg-slate-600" : ""
              }`}
            >
              {it.e}
            </button>
          ))}
        </div>
      </div>

      {/* Says how many there are, which is the answer to "is this all of
          them?" without making anybody count. */}
      <div className="shrink-0 pt-1 text-right text-[10px] text-slate-400">
        {searching
          ? t("panels.emojiCount", { count: shown.length })
          : t("panels.emojiTotal", { count: ALL_EMOJI.length })}
      </div>
    </div>
  );
}
