import type { TemplateConfig } from "@awesome-bookmarks/shared";
import { ChevronRight, Folder as FolderIcon } from "lucide-react";
import { PanelBackground } from "./PanelBackground.js";

/**
 * A faithful, non-interactive miniature of how a panel looks with the given
 * template config: background scene, header, folder cards (with the optional
 * children list) and bookmark cards honouring the layout and card toggles.
 * Used in the template editor so changes are visible instantly.
 */

const SAMPLE_FOLDERS = [
  { name: "Trabajo", count: 8, children: ["Proyectos", "Reuniones"] },
  { name: "Personal", count: 5, children: ["Viajes"] },
];

const SAMPLE_BOOKMARKS = [
  { title: "Documentación", url: "https://docs.example.com", desc: "Guía de referencia del proyecto.", tags: [{ name: "docs", color: "#2563eb" }] },
  { title: "Panel de control", url: "https://app.example.com", desc: "Métricas en tiempo real.", tags: [{ name: "work", color: "#16a34a" }] },
  { title: "Inspiración", url: "https://dribbble.com", desc: "Ideas de diseño.", tags: [{ name: "design", color: "#db2777" }] },
];

function LetterTile({ label, accent, size = 22 }: { label: string; accent: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: accent,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.5,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}

export function TemplatePreview({ config }: { config: TemplateConfig }) {
  const t = config.theme;
  const rows = config.layout === "list" || config.layout === "terminal";
  const terminal = config.layout === "terminal";
  const banner = (config.header ?? "banner") === "banner";
  const cols = Math.min(config.columns ?? 4, 3);

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        height: 360,
        background: t.bg,
        color: t.text,
        fontFamily: config.font,
      }}
    >
      <PanelBackground scene={config.scene} contained />
      <div style={{ position: "relative", zIndex: 1, padding: "0.85rem", fontSize: 12 }}>
        {config.header !== "hidden" && (
          <div
            style={{
              marginBottom: 10,
              padding: banner ? "0.7rem 0.8rem" : "0.2rem 0",
              borderRadius: banner ? 10 : 0,
              background: banner ? t.surface : "transparent",
              border: banner ? `1px solid ${t.border}` : "none",
            }}
          >
            <div style={{ fontSize: banner ? 18 : 15, fontWeight: 800, letterSpacing: "-0.02em" }}>
              {terminal ? "~/Mi panel" : "Mi panel"}
            </div>
          </div>
        )}

        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: t.muted, fontWeight: 600, marginBottom: 6 }}>
          Carpetas
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(cols, 2)}, minmax(0,1fr))`,
            gap: 8,
            marginBottom: 12,
          }}
        >
          {SAMPLE_FOLDERS.map((f) => (
            <div
              key={f.name}
              style={{
                borderRadius: config.card.radius,
                background: t.surface,
                border: `1px solid ${t.border}`,
                boxShadow: config.card.shadow ? "0 4px 14px rgba(0,0,0,0.12)" : "none",
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0.5rem 0.6rem" }}>
                <FolderIcon size={16} style={{ color: t.accent, flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span style={{ fontSize: 10, color: t.muted }}>{f.count} elementos</span>
                </span>
              </div>
              {config.folderPreview &&
                f.children.map((c) => (
                  <div
                    key={c}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "0.3rem 0.6rem 0.3rem 0.9rem",
                      borderTop: `1px solid ${t.border}55`,
                      color: t.muted,
                      fontSize: 11,
                    }}
                  >
                    <ChevronRight size={11} style={{ color: t.accent, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
                  </div>
                ))}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: t.muted, fontWeight: 600, marginBottom: 6 }}>
          Enlaces
        </div>
        <div
          style={
            rows
              ? { display: "flex", flexDirection: "column", gap: 5 }
              : { display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 8 }
          }
        >
          {SAMPLE_BOOKMARKS.slice(0, rows ? 3 : cols).map((b) => (
            <div
              key={b.title}
              style={{
                display: "flex",
                flexDirection: rows ? "row" : "column",
                alignItems: rows ? "center" : "stretch",
                gap: 6,
                padding: terminal ? "0.25rem 0.3rem" : "0.55rem 0.6rem",
                borderRadius: config.card.radius,
                background: terminal ? "transparent" : t.surface,
                border: terminal ? "none" : `1px solid ${t.border}`,
                boxShadow: !rows && config.card.shadow ? "0 4px 14px rgba(0,0,0,0.12)" : "none",
                minWidth: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {terminal && <span style={{ color: t.accent }}>$</span>}
                {config.card.showIcon && !terminal && <LetterTile label={b.title} accent={t.accent} size={18} />}
                <span style={{ fontWeight: terminal ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {terminal ? `open ${b.title}` : b.title}
                </span>
              </div>
              {config.card.showUrl && (
                <span style={{ fontSize: 10, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.url}</span>
              )}
              {config.card.showDescription && !terminal && (
                <span style={{ fontSize: 10, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.desc}</span>
              )}
              {config.card.showTags && (
                <span style={{ display: "flex", gap: 4 }}>
                  {b.tags.map((tag) => (
                    <span
                      key={tag.name}
                      style={{ fontSize: 9, padding: "0px 6px", borderRadius: 999, background: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}55` }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
