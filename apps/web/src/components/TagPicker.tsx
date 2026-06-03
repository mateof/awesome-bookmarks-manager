import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tag } from "@awesome-bookmarks/shared";
import { Plus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";

const TAG_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

function pickRandomColor(): string {
  const i = Math.floor(Math.random() * TAG_PALETTE.length);
  return TAG_PALETTE[i] ?? "#64748b";
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function TagPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allTags = tagsQ.data ?? [];
  const byId = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);
  const selected = value.map((id) => byId.get(id)).filter(Boolean) as Tag[];

  const matching = useMemo(() => {
    const q = input.trim().toLowerCase();
    return allTags
      .filter((tg) => !value.includes(tg.id))
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

  const create = useMutation({
    mutationFn: (name: string) =>
      api.createTag({ name, color: pickRandomColor() }),
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      onChange([...value, tag.id]);
      setInput("");
    },
  });

  const addExisting = (id: string) => {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setInput("");
    inputRef.current?.focus();
  };

  const remove = (id: string) => {
    onChange(value.filter((x) => x !== id));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const q = input.trim();
      if (!q) return;
      const existing = allTags.find(
        (tg) => tg.name.toLowerCase() === q.toLowerCase(),
      );
      if (existing) addExisting(existing.id);
      else create.mutate(q);
    } else if (
      e.key === "Backspace" &&
      input.length === 0 &&
      selected.length > 0
    ) {
      remove(selected[selected.length - 1]!.id);
    }
  };

  return (
    <div className="relative space-y-1">
      <div className="flex flex-wrap items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
        {selected.map((tg) => (
          <ChipInPicker key={tg.id} tag={tg} onRemove={() => remove(tg.id)} />
        ))}
        <input
          ref={inputRef}
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
      {open && (input.trim().length > 0 || matching.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {matching.map((tg) => (
            <button
              key={tg.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                addExisting(tg.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
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
              onMouseDown={(e) => {
                e.preventDefault();
                create.mutate(input.trim());
              }}
              disabled={create.isPending}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700"
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
