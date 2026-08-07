import type { TemplateConfig } from "@awesome-bookmarks/shared";

/** Tiny abstract preview of a template's colours + layout. */
export function TemplateSwatch({ config }: { config: TemplateConfig }) {
  const t = config.theme;
  const full = config.layout === "list" || config.layout === "terminal";
  return (
    <div
      style={{
        background: t.bg,
        borderRadius: 8,
        padding: 6,
        height: 64,
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        alignContent: "flex-start",
        overflow: "hidden",
      }}
    >
      {Array.from({ length: full ? 4 : 8 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: full ? "100%" : 22,
            height: full ? 8 : config.layout === "bento" && i % 3 === 0 ? 24 : 12,
            borderRadius: 3,
            background: i === 0 ? t.accent : t.surface,
            border: `1px solid ${t.border}`,
          }}
        />
      ))}
    </div>
  );
}
