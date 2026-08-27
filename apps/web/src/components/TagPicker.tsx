import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tag } from "@awesome-bookmarks/shared";
import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";


interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  /**
   * Work in tag *names* rather than ids, and never create a tag row.
   *
   * Used inside a group share, where the owner's tag ids mean nothing in the
   * member's account: the tags travel by name and are matched (or created) in
   * the owner's account when the change is written back. Creating a tag here
   * would leave a stray row in the member's own library for a folder that is
   * not theirs.
   */
  byName?: boolean;
  /**
   * Focus the input on mount. For the pickers that appear on demand (the
   * "add tag" button on a detail page): the click's whole intent is to type,
   * so the caret should already be in the box. The always-visible pickers in
   * the edit dialogs leave it off — there the name field owns the focus.
   */
  autoFocus?: boolean;
}

export function TagPicker({
  value,
  onChange,
  byName = false,
  autoFocus = false,
}: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  /**
   * Which suggestion the arrows are on, or -1 for none.
   *
   * It starts at -1 on purpose, rather than highlighting the first match the
   * way a lot of pickers do. With a highlight already on, typing "foo" and
   * pressing Enter would add "foobar" — the first thing that happens to start
   * with it — instead of creating the tag you were spelling out. Nothing is
   * selected until an arrow key says so.
   */
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allTags = tagsQ.data ?? [];
  const byId = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);
  const byNameMap = useMemo(
    () => new Map(allTags.map((t) => [t.name.toLowerCase(), t])),
    [allTags],
  );
  // In name mode a value that matches nothing in your library is still a real
  // selection: it is a tag on someone else's folder.
  const selected: Tag[] = byName
    ? value.map(
        (name) =>
          byNameMap.get(name.toLowerCase()) ?? {
            id: name,
            name,
            color: "#64748b",
            createdAt: "",
          },
      )
    : (value.map((id) => byId.get(id)).filter(Boolean) as Tag[]);

  const has = (tg: Tag) =>
    byName
      ? value.some((v) => v.toLowerCase() === tg.name.toLowerCase())
      : value.includes(tg.id);

  const matching = useMemo(() => {
    const q = input.trim().toLowerCase();
    return allTags
      .filter((tg) => !has(tg))
      .filter((tg) => (q ? tg.name.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [allTags, input, value]);

  const exactMatch = useMemo(
    () =>
      input.trim().length > 0 &&
      allTags.some(
        (tg) => tg.name.toLowerCase() === input.trim().toLowerCase(),
      ),
    [allTags, input],
  );

  /**
   * What the arrows walk: the matching tags, and then "create this one".
   *
   * Built from the same two pieces the list below renders, so the third item
   * on screen is the third item the keyboard counts. A separate list would
   * drift the first time somebody reorders the panel.
   */
  const rows = useMemo(
    () => [
      ...matching.map((tag) => ({ kind: "tag" as const, tag })),
      ...(input.trim().length > 0 && !exactMatch
        ? [{ kind: "new" as const, tag: null }]
        : []),
    ],
    [matching, input, exactMatch],
  );

  // Typing changes what is on the list, so whatever was highlighted is no
  // longer the thing that was highlighted.
  useEffect(() => setCursor(-1), [input]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // The chosen ids, readable from inside a mutation that started before the
  // latest render. Two tags created quickly both close over the `value` their
  // own render saw, so the second one would write a list that never had the
  // first in it.
  const valueRef = useRef(value);
  valueRef.current = value;

  const create = useMutation({
    mutationFn: (name: string) => api.createTag({ name }),
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      onChange([...valueRef.current, tag.id]);
    },
  });

  /** In name mode a "new" tag is just a name: no row is created here. */
  const addNew = (name: string) => {
    if (byName) {
      if (!value.some((v) => v.toLowerCase() === name.toLowerCase())) {
        onChange([...value, name]);
      }
      setInput("");
      inputRef.current?.focus();
      return;
    }
    // Cleared here rather than when the request comes back. Clearing on
    // success wipes whatever has been typed in the meantime, so typing three
    // tags in a row loses the middle one: its name is erased from the box
    // before its Enter arrives.
    setInput("");
    inputRef.current?.focus();
    create.mutate(name);
  };

  const addExisting = (tag: Tag) => {
    const key = byName ? tag.name : tag.id;
    if (value.some((v) => (byName ? v.toLowerCase() === key.toLowerCase() : v === key)))
      return;
    onChange([...value, key]);
    setInput("");
    inputRef.current?.focus();
  };

  const remove = (key: string) => {
    onChange(value.filter((x) => x !== key));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (rows.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setCursor((c) => {
        // Up from nothing-selected means the last one. Counting from -1 like
        // any other position would land on the second-to-last and quietly skip
        // a row nobody can reach without going all the way round.
        if (c < 0) return e.key === "ArrowDown" ? 0 : rows.length - 1;
        const next = e.key === "ArrowDown" ? c + 1 : c - 1;
        // Wraps, because a list of three suggestions is short enough that
        // walking off the end and stopping feels like something jammed.
        return ((next % rows.length) + rows.length) % rows.length;
      });
    } else if (e.key === "Escape" && cursor >= 0) {
      e.preventDefault();
      setCursor(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = cursor >= 0 ? rows[cursor] : undefined;
      if (picked) {
        if (picked.kind === "tag") addExisting(picked.tag);
        else addNew(input.trim());
        setCursor(-1);
        return;
      }
      const q = input.trim();
      if (!q) return;
      const existing = allTags.find(
        (tg) => tg.name.toLowerCase() === q.toLowerCase(),
      );
      if (existing) addExisting(existing);
      else addNew(q);
    } else if (
      e.key === "Backspace" &&
      input.length === 0 &&
      selected.length > 0
    ) {
      remove(byName ? selected[selected.length - 1]!.name : selected[selected.length - 1]!.id);
    }
  };

  return (
    <div className="relative space-y-1">
      <div className="flex flex-wrap items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
        {selected.map((tg) => (
          <ChipInPicker
            key={tg.id}
            tag={tg}
            onRemove={() => remove(byName ? tg.name : tg.id)}
          />
        ))}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          placeholder={
            selected.length === 0
              ? t("tags.pickerPlaceholderEmpty")
              : t("tags.pickerPlaceholder")
          }
          className="flex-1 min-w-[8rem] bg-transparent text-sm focus:outline-none"
        />
      </div>
      {open && input.trim().length > 0 && (
        <div
          ref={listRef}
          data-testid="tag-suggestions"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {matching.map((tg, i) => (
            <button
              key={tg.id}
              type="button"
              data-idx={i}
              aria-selected={cursor === i}
              onMouseMove={() => setCursor(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                addExisting(tg);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 ${
                cursor === i ? "bg-slate-100 dark:bg-slate-700" : ""
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: tg.color }}
              />
              <span>{tg.name}</span>
            </button>
          ))}
          {input.trim().length > 0 && !exactMatch && (
            <button
              type="button"
              data-idx={matching.length}
              aria-selected={cursor === matching.length}
              onMouseMove={() => setCursor(matching.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                addNew(input.trim());
              }}
              disabled={create.isPending}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700 ${
                cursor === matching.length ? "bg-slate-100 dark:bg-slate-700" : ""
              }`}
            >
              <Plus className="h-3 w-3" />
              <span>{t("tags.createNew", { name: input.trim() })}</span>
            </button>
          )}
          {matching.length === 0 && input.trim().length === 0 && (
            <div className="px-3 py-1.5 text-xs text-slate-400">
              {t("tags.startTyping")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChipInPicker({ tag, onRemove }: { tag: Tag; onRemove: () => void }) {
  return (
    <span
      style={{
        background: tag.color + "33",
        color: tag.color,
        border: `1px solid ${tag.color}80`,
      }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
    >
      <span className="truncate max-w-[10rem]">{tag.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-black/10"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
