import type { TemplateConfig } from "@awesome-bookmarks/shared";
import { ChevronRight, Filter, Folder as FolderIcon, Home, Search } from "lucide-react";
import { PanelBackground } from "./PanelBackground.js";

/**
 * A faithful, non-interactive miniature of a panel rendered with the given
 * template config: background scene, header, search bar, tag filter, folder
 * cards (with the optional children list) and bookmark cards honouring the
 * layout and card toggles. Rendered at desktop and phone widths so the editor
 * shows both. Sample content is fictitious.
 */

const FOLDERS = [
  { name: "Trabajo", count: 12, children: ["Proyectos", "Reuniones", "Clientes"] },
  { name: "Aprender", count: 9, children: ["Cursos", "Libros"] },
  { name: "Ocio", count: 7, children: ["Recetas"] },
];

const BOOKMARKS = [
  {
    title: "Documentación del API",
    url: "docs.miempresa.com",
    desc: "Referencia de endpoints y ejemplos de uso.",
    tags: [{ name: "docs", color: "#2563eb" }],
  },
  {
    title: "Panel de métricas",
    url: "analytics.miempresa.com",
    desc: "Tráfico y conversiones en tiempo real.",
    tags: [{ name: "trabajo", color: "#16a34a" }],
  },
  {
    title: "Ideas de diseño",
    url: "dribbble.com/shots",
    desc: "Referencias visuales para la próxima versión.",
    tags: [{ name: "diseño", color: "#db2777" }],
  },
  {
    title: "Recetas de pasta",
    url: "cocina.example.com/pasta",
    desc: "Diez recetas rápidas para entre semana.",
    tags: [{ name: "ocio", color: "#f59e0b" }],
  },
  {
    title: "Curso de TypeScript",
    url: "cursos.example.com/ts",
    desc: "Tipos avanzados y patrones prácticos.",
    tags: [{ name: "aprender", color: "#7c3aed" }],
  },
  {
    title: "Guía de accesibilidad",
    url: "a11y.example.com/guia",
    desc: "Checklist WCAG con ejemplos reales.",
    tags: [{ name: "docs", color: "#2563eb" }],
  },
];

const TAGS = [
  { name: "docs", color: "#2563eb" },
  { name: "trabajo", color: "#16a34a" },
  { name: "diseño", color: "#db2777" },
  { name: "aprender", color: "#7c3aed" },
];

function LetterTile({ label, accent, size }: { label: string; accent: string; size: number }) {
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

/**
 * One rendered panel mock. `mobile` switches to a single column and tighter
 * spacing, mirroring how the real panel reflows on a phone.
 */
export function TemplatePreviewFrame({
  config,
  mobile = false,
  height = 460,
}: {
  config: TemplateConfig;
  mobile?: boolean;
  height?: number;
}) {
  const t = config.theme;
  const rows = config.layout === "list" || config.layout === "terminal";
  const terminal = config.layout === "terminal";
  const banner = (config.header ?? "banner") === "banner";
  const folderCols = mobile ? 1 : Math.min(config.columns ?? 4, 3);
  const cardCols = mobile ? 1 : Math.min(config.columns ?? 4, 3);
  const bookmarkCount = mobile ? 3 : rows ? 4 : cardCols * 2;
  const pad = mobile ? 10 : 16;

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: mobile ? 18 : 12,
        border: `1px solid ${t.border}`,
        height,
        background: t.bg,
        color: t.text,
        fontFamily: config.font,
      }}
    >
      <PanelBackground scene={config.scene} contained />
      <div
        className="no-scrollbar"
        style={{ position: "relative", zIndex: 1, padding: pad, fontSize: mobile ? 11 : 12, height: "100%", overflowY: "auto" }}
      >
        {config.header !== "hidden" && (
          <div
            style={{
              marginBottom: 10,
              padding: banner ? `${mobile ? 10 : 16}px ${mobile ? 10 : 14}px` : "2px 0",
              borderRadius: banner ? 12 : 0,
              background: banner ? t.surface : "transparent",
              border: banner ? `1px solid ${t.border}` : "none",
            }}
          >
            <div style={{ fontSize: banner ? (mobile ? 17 : 22) : mobile ? 14 : 16, fontWeight: 800, letterSpacing: "-0.02em" }}>
              {terminal ? "~/Mis enlaces" : "Mis enlaces"}
            </div>
          </div>
        )}

        {/* search bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            marginBottom: 8,
            borderRadius: 10,
            background: t.surface,
            border: `1px solid ${t.border}`,
            color: t.muted,
          }}
        >
          <Search size={mobile ? 12 : 14} /> Buscar en el panel…
        </div>

        {/* breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: t.muted, marginBottom: 8 }}>
          <Home size={mobile ? 11 : 12} /> Inicio
        </div>

        {config.tagFilter !== false && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 4,
              padding: "6px 8px",
              marginBottom: 10,
              borderRadius: 10,
              background: t.surface,
              border: `1px solid ${t.border}`,
            }}
          >
            <Filter size={mobile ? 11 : 12} style={{ color: t.muted }} />
            {TAGS.slice(0, mobile ? 3 : 4).map((tag) => (
              <span
                key={tag.name}
                style={{
                  fontSize: mobile ? 9 : 10,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: `${tag.color}22`,
                  color: tag.color,
                  border: `1px solid ${tag.color}55`,
                }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        <SectionTitle muted={t.muted}>Carpetas</SectionTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${folderCols}, minmax(0,1fr))`,
            gap: 8,
            marginBottom: 12,
          }}
        >
          {FOLDERS.slice(0, mobile ? 2 : 3).map((f) => (
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
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px" }}>
                <FolderIcon size={mobile ? 15 : 17} style={{ color: t.accent, flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span style={{ fontSize: mobile ? 9 : 10, color: t.muted }}>{f.count} elementos</span>
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
                      padding: "4px 10px 4px 16px",
                      borderTop: `1px solid ${t.border}55`,
                      color: t.muted,
                      fontSize: mobile ? 10 : 11,
                    }}
                  >
                    <ChevronRight size={11} style={{ color: t.accent, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
                  </div>
                ))}
            </div>
          ))}
        </div>

        <SectionTitle muted={t.muted}>Enlaces</SectionTitle>
        <div
          style={
            rows
              ? { display: "flex", flexDirection: "column", gap: 5 }
              : { display: "grid", gridTemplateColumns: `repeat(${cardCols}, minmax(0,1fr))`, gap: 8 }
          }
        >
          {BOOKMARKS.slice(0, bookmarkCount).map((b) => (
            <div
              key={b.title}
              style={{
                display: "flex",
                flexDirection: rows ? "row" : "column",
                alignItems: rows ? "flex-start" : "stretch",
                gap: 6,
                padding: terminal ? "3px 4px" : "8px 10px",
                borderRadius: config.card.radius,
                background: terminal ? "transparent" : t.surface,
                border: terminal ? "none" : `1px solid ${t.border}`,
                boxShadow: !rows && config.card.shadow ? "0 4px 14px rgba(0,0,0,0.12)" : "none",
                minWidth: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: rows ? 1 : undefined }}>
                {terminal && <span style={{ color: t.accent }}>$</span>}
                {config.card.showIcon && !terminal && (
                  <LetterTile label={b.title} accent={t.accent} size={mobile ? 16 : 20} />
                )}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontWeight: terminal ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {terminal ? `open ${b.title}` : b.title}
                  </span>
                  {rows && config.card.showUrl && (
                    <span style={{ display: "block", fontSize: mobile ? 9 : 10, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.url}
                    </span>
                  )}
                  {rows && config.card.showDescription && !terminal && (
                    <span style={{ display: "block", fontSize: mobile ? 9 : 10, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.desc}
                    </span>
                  )}
                </span>
              </div>
              {!rows && config.card.showUrl && (
                <span style={{ fontSize: mobile ? 9 : 10, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.url}</span>
              )}
              {!rows && config.card.showDescription && (
                <span
                  style={{
                    fontSize: mobile ? 9 : 10,
                    color: t.muted,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {b.desc}
                </span>
              )}
              {config.card.showTags && (
                <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {b.tags.map((tag) => (
                    <span
                      key={tag.name}
                      style={{
                        fontSize: mobile ? 8 : 9,
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: `${tag.color}22`,
                        color: tag.color,
                        border: `1px solid ${tag.color}55`,
                      }}
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

function SectionTitle({ children, muted }: { children: React.ReactNode; muted: string }) {
  return (
    <div
      style={{
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: muted,
        fontWeight: 600,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

/** Desktop + phone mocks side by side (stacked on narrow editors). */
export function TemplatePreview({
  config,
  desktopLabel,
  mobileLabel,
}: {
  config: TemplateConfig;
  desktopLabel: string;
  mobileLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {desktopLabel}
        </div>
        <TemplatePreviewFrame config={config} height={460} />
      </div>
      <div className="space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {mobileLabel}
        </div>
        <div className="w-[190px] shrink-0">
          <TemplatePreviewFrame config={config} mobile height={460} />
        </div>
      </div>
    </div>
  );
}
