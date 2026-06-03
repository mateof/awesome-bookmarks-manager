import { X } from "lucide-react";
import type { Tag } from "@awesome-bookmarks/shared";
import { Link } from "react-router-dom";

interface BaseProps {
  tag: Tag;
  size?: "sm" | "md";
  className?: string;
}

interface AsLinkProps extends BaseProps {
  as: "link";
}
interface AsButtonProps extends BaseProps {
  as: "button";
  onClick: () => void;
}
interface AsRemovableProps extends BaseProps {
  as: "removable";
  onRemove: () => void;
}
interface AsStaticProps extends BaseProps {
  as?: "static";
}
interface AsDotProps extends BaseProps {
  as: "dot";
}

type Props =
  | AsLinkProps
  | AsButtonProps
  | AsRemovableProps
  | AsStaticProps
  | AsDotProps;

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(100, 116, 139, ${alpha})`;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SIZE = {
  sm: "px-1.5 py-px text-[10px]",
  md: "px-2 py-0.5 text-xs",
};

export function TagChip(props: Props) {
  const { tag, size = "md", className = "" } = props;

  if (props.as === "dot") {
    return (
      <span
        title={tag.name}
        className={`inline-block h-2 w-2 rounded-full ${className}`}
        style={{ background: tag.color }}
      />
    );
  }

  const style = {
    background: hexToRgba(tag.color, 0.18),
    color: tag.color,
    border: `1px solid ${hexToRgba(tag.color, 0.45)}`,
  };
  const baseCls = `inline-flex max-w-[12rem] items-center gap-1 truncate rounded-full font-medium ${SIZE[size]} ${className}`;

  if (props.as === "link") {
    return (
      <Link
        to={`/tag/${tag.id}`}
        style={style}
        className={`${baseCls} hover:brightness-110`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate">{tag.name}</span>
      </Link>
    );
  }
  if (props.as === "button") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          props.onClick();
        }}
        style={style}
        className={`${baseCls} hover:brightness-110`}
      >
        <span className="truncate">{tag.name}</span>
      </button>
    );
  }
  if (props.as === "removable") {
    return (
      <span style={style} className={baseCls}>
        <span className="truncate">{tag.name}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.onRemove();
          }}
          className="rounded-full p-0.5 hover:bg-black/10"
          aria-label="remove"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </span>
    );
  }
  return (
    <span style={style} className={baseCls}>
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

export function TagChipList({
  tagIds,
  allTags,
  size = "md",
  asDot = false,
  asLink = false,
  max,
}: {
  tagIds: string[];
  allTags: Tag[];
  size?: "sm" | "md";
  asDot?: boolean;
  asLink?: boolean;
  max?: number;
}) {
  if (tagIds.length === 0) return null;
  const byId = new Map(allTags.map((t) => [t.id, t]));
  let tags = tagIds.map((id) => byId.get(id)).filter(Boolean) as Tag[];
  const hidden = max && tags.length > max ? tags.length - max : 0;
  if (max) tags = tags.slice(0, max);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {tags.map((tg) =>
        asDot ? (
          <TagChip key={tg.id} tag={tg} as="dot" />
        ) : asLink ? (
          <TagChip key={tg.id} tag={tg} size={size} as="link" />
        ) : (
          <TagChip key={tg.id} tag={tg} size={size} />
        ),
      )}
      {hidden > 0 && (
        <span className="text-[10px] text-slate-400">+{hidden}</span>
      )}
    </span>
  );
}
