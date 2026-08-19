import type { PanelBookmark, PanelFolder, TemplateConfig } from "@awesome-bookmarks/shared";
import { InfoButton, type PanelDesc } from "./PanelDescription.js";
import { ChevronRight, Folder as FolderIcon, Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Favicon } from "./PanelFavicon.js";

/**
 * Layouts that show the *whole* subtree at once and open it as you go, instead
 * of the panel's usual one-folder-at-a-time browsing.
 *
 * Three shapes, because a hierarchy reads differently depending on how it is
 * drawn: `tree` runs down the page, `mindmap` runs across it, and `orbit`
 * arranges a level as a ring.
 *
 * Opening on hover is the point on a desktop, but on a touch screen there is
 * no hover: a device that reports none gets tap-to-open on the same nodes, and
 * an open node closes on a second tap. Everything is a real <button>, so the
 * keyboard walks the tree with Tab and opens with Enter.
 */

/** Whether the device can actually hover. Watched rather than read once: a
 * tablet with a keyboard attached changes its mind. */
function useHoverCapable(): boolean {
  const [can, setCan] = useState(
    () =>
      typeof window === "undefined" ||
      window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const on = () => setCan(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return can;
}

/** The set of open node ids, opened by hover or by tap depending on the
 * device. Ancestors stay open, so a branch does not collapse under the cursor
 * on its way to a child. */
function useOpenPath(initial: string[] = []) {
  const hover = useHoverCapable();
  const [open, setOpen] = useState<string[]>(initial);

  // `?p=` is the panel's "open this folder" channel: the search box writes it,
  // and so does anyone who shares the link. These layouts do not navigate, so
  // rather than changing what is on screen it unfolds the branch that leads to
  // that folder.
  //
  // Seeded, not bound: hovering opens and closes constantly, and pushing every
  // hover through the URL would flood the history and make the whole thing
  // lurch. The state stays local; the URL only ever pushes into it.
  const [sp] = useSearchParams();
  const fromUrl = sp.get("p") ?? "";
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (seeded.current === fromUrl) return;
    seeded.current = fromUrl;
    const trail = fromUrl.split("/").filter(Boolean);
    if (trail.length > 0) setOpen(trail);
  }, [fromUrl]);

  const openTo = (trail: string[]) => setOpen(trail);
  const toggle = (trail: string[]) =>
    setOpen((prev) =>
      prev.length >= trail.length && trail.every((id, i) => prev[i] === id)
        ? trail.slice(0, -1)
        : trail,
    );
  const isOpen = (trail: string[]) =>
    trail.every((id, i) => open[i] === id) && open.length >= trail.length;

  return {
    hover,
    isOpen,
    /** The trail currently open, deepest last. */
    open,
    /** Changes only when the URL seeds a trail, never on hover. A node that
     * ends up deepest scrolls itself into view on that, and only that. */
    urlToken: fromUrl,
    /** Props for a node that opens a level. */
    nodeProps: (trail: string[]) =>
      hover
        ? { onMouseEnter: () => openTo(trail), onFocus: () => openTo(trail) }
        : { onClick: () => toggle(trail) },
  };
}

interface LayoutProps {
  root: PanelFolder;
  template: TemplateConfig;
  onDesc: (d: PanelDesc) => void;
}

/* ------------------------------------------------------------------ */
/* Shared leaf                                                         */
/* ------------------------------------------------------------------ */

function Leaf({
  b,
  template,
  onDesc,
  compact,
}: {
  b: PanelBookmark;
  template: TemplateConfig;
  onDesc: (d: PanelDesc) => void;
  compact?: boolean;
}) {
  const t = template.theme;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: compact ? "0.3rem 0.55rem" : "0.45rem 0.7rem",
        borderRadius: template.card.radius,
        border: `1px solid ${t.border}`,
        background: t.surface,
        maxWidth: 280,
      }}
    >
      <a
        href={b.url}
        target="_blank"
        rel="noopener noreferrer"
        title={b.title}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 0,
          color: t.text,
          textDecoration: "none",
          fontSize: compact ? 12 : 13,
          whiteSpace: "nowrap",
        }}
      >
        {template.card.showIcon !== false && (
          <Favicon url={b.url} title={b.title} accent={t.accent} size={compact ? 14 : 16} />
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{b.title}</span>
      </a>
      <InfoButton
        title={b.title}
        html={b.description}
        url={b.url}
        template={template}
        onDesc={onDesc}
      />
    </span>
  );
}

/**
 * The same "see the text" affordance as `InfoButton`, but as a <span> with a
 * button role: these nodes are themselves buttons, and nesting one inside
 * another is invalid markup that browsers resolve however they feel like.
 */
function InfoBadge({
  title,
  html,
  template,
  onDesc,
}: {
  title: string;
  html: string | null;
  template: TemplateConfig;
  onDesc: (d: PanelDesc) => void;
}) {
  if (!html || html.replace(/<[^>]*>/g, "").trim().length === 0) return null;
  return (
    <span
      role="button"
      tabIndex={0}
      title="Ver el texto"
      aria-label={`Ver el texto de ${title}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDesc({ title, html });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onDesc({ title, html });
        }
      }}
      style={{
        display: "inline-flex",
        flexShrink: 0,
        color: template.theme.muted,
        cursor: "pointer",
      }}
    >
      <Info size={14} />
    </span>
  );
}

function countOf(f: PanelFolder): number {

  return f.subfolders.length + f.bookmarks.length;
}

/* ------------------------------------------------------------------ */
/* 1. Tree — vertical, unfolds downwards                               */
/* ------------------------------------------------------------------ */

export function TreeLayout({ root, template, onDesc }: LayoutProps) {
  const nav = useOpenPath();
  const t = template.theme;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {root.subfolders.map((f) => (
        <TreeNode
          key={f.id}
          folder={f}
          trail={[f.id]}
          nav={nav}
          template={template}
          onDesc={onDesc}
        />
      ))}
      {root.bookmarks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 6 }}>
          {root.bookmarks.map((b) => (
            <Leaf key={b.id} b={b} template={template} onDesc={onDesc} />
          ))}
        </div>
      )}
      {root.subfolders.length === 0 && root.bookmarks.length === 0 && (
        <p style={{ color: t.muted, fontSize: 14 }}>Este panel está vacío.</p>
      )}
    </div>
  );
}

function TreeNode({
  folder,
  trail,
  nav,
  template,
  onDesc,
}: {
  folder: PanelFolder;
  trail: string[];
  nav: ReturnType<typeof useOpenPath>;
  template: TemplateConfig;
  onDesc: (d: PanelDesc) => void;
}) {
  const t = template.theme;
  const open = nav.isOpen(trail);
  const depth = trail.length - 1;
  const deepest = open && nav.open.length === trail.length;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (deepest && nav.urlToken) {
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    // Only on a URL-driven open: doing it on hover would drag the page around
    // under the pointer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.urlToken]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        {...nav.nodeProps(trail)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
          padding: "0.5rem 0.75rem",
          borderRadius: template.card.radius,
          border: `1px solid ${open ? t.accent : t.border}`,
          background: open ? `${t.accent}1a` : t.surface,
          color: t.text,
          cursor: "pointer",
          font: "inherit",
          fontSize: 14,
          fontWeight: 600,
          transition: "background .18s ease, border-color .18s ease",
        }}
      >
        <ChevronRight
          size={14}
          style={{
            color: t.accent,
            flexShrink: 0,
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .18s ease",
          }}
        />
        <FolderIcon size={16} style={{ color: t.accent, flexShrink: 0 }} />
        <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          {folder.name}
        </span>
        <span style={{ color: t.muted, fontSize: 12, fontWeight: 400 }}>
          {countOf(folder)}
        </span>
        {/* Rendered inside the node's own button, so it is a <span> acting as
            one: a real <button> nested in a <button> is invalid markup. */}
        <InfoBadge
          title={folder.name}
          html={folder.description}
          template={template}
          onDesc={onDesc}
        />
      </button>

      {/* Grid-rows 0fr → 1fr animates a height the browser does not know in
          advance, which max-height cannot do without a magic number that
          truncates deep branches. */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows .22s ease",
        }}
      >
        {/* The subtree stays mounted (the height animation needs to know what
            it is animating to), so a closed branch has to be taken out of the
            page some other way: `inert` removes it from the tab order, from
            the accessibility tree and from find-in-page, which is what a
            collapsed branch should be. React 18 does not type the attribute,
            hence the spread. */}
        <div
          style={{ overflow: "hidden" }}
          aria-hidden={!open}
          {...(open ? {} : ({ inert: "" } as Record<string, string>))}
        >
          <div
            style={{
              marginLeft: 14,
              paddingLeft: 14,
              paddingTop: 6,
              borderLeft: `1px solid ${t.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {folder.subfolders.map((sf) => (
              <TreeNode
                key={sf.id}
                folder={sf}
                trail={[...trail, sf.id]}
                nav={nav}
                template={template}
                onDesc={onDesc}
              />
            ))}
            {folder.bookmarks.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {folder.bookmarks.map((b) => (
                  <Leaf
                    key={b.id}
                    b={b}
                    template={template}
                    onDesc={onDesc}
                    compact={depth > 0}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Mindmap — horizontal, one column per level                       */
/* ------------------------------------------------------------------ */

export function MindmapLayout({ root, template, onDesc }: LayoutProps) {
  // Opened on the first branch from the start: one lone column at the left
  // edge does not read as a map, and the shape is the whole point.
  const nav = useOpenPath(root.subfolders[0] ? [root.subfolders[0].id] : []);
  const t = template.theme;

  // The columns are the open trail resolved back to folders: column 0 is the
  // root's children, column n the children of whatever is open at n-1. Deriving
  // them instead of storing them is what keeps a closed branch from leaving a
  // stale column behind.
  const columns = useMemo(() => {
    const out: { parent: PanelFolder; trail: string[] }[] = [
      { parent: root, trail: [] },
    ];
    let cur = root;
    const trail: string[] = [];
    for (let i = 0; ; i++) {
      const next = cur.subfolders.find((f) => nav.isOpen([...trail, f.id]));
      if (!next) break;
      trail.push(next.id);
      out.push({ parent: next, trail: [...trail] });
      cur = next;
      if (i > 8) break; // a panel deeper than this is a scrolling problem
    }
    return out;
  }, [root, nav]);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!nav.urlToken) return;
    const el = scroller.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [nav.urlToken, columns.length]);

  return (
    <div
      ref={scroller}
      style={{
        display: "flex",
        gap: 18,
        alignItems: "flex-start",
        overflowX: "auto",
        paddingBottom: 12,
      }}
    >
      {columns.map((col, i) => (
        <div
          key={col.trail.join("/") || "root"}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            minWidth: 210,
            // The rail joins a column to the one that opened it.
            borderLeft: i > 0 ? `1px solid ${t.border}` : "none",
            paddingLeft: i > 0 ? 18 : 0,
            // Each column fades in a touch later than the one before, so the
            // branch reads as growing rather than appearing all at once.
            animation: `panelBranchIn .24s ease ${i * 0.03}s both`,
          }}
        >
          {i > 0 && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: t.muted,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".06em",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 1,
                  background: t.accent,
                  flexShrink: 0,
                  marginLeft: -18,
                }}
              />
              {col.parent.name}
            </span>
          )}
          {col.parent.subfolders.map((f) => {
            const trail = [...col.trail, f.id];
            const open = nav.isOpen(trail);
            return (
              <button
                key={f.id}
                type="button"
                {...nav.nodeProps(trail)}
                aria-expanded={open}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                  padding: "0.5rem 0.7rem",
                  borderRadius: template.card.radius,
                  border: `1px solid ${open ? t.accent : t.border}`,
                  background: open ? `${t.accent}1a` : t.surface,
                  color: t.text,
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "background .18s ease, border-color .18s ease, transform .18s ease",
                  transform: open ? "translateX(3px)" : "none",
                }}
              >
                <FolderIcon size={15} style={{ color: t.accent, flexShrink: 0 }} />
                <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {f.name}
                </span>
                <InfoBadge
                  title={f.name}
                  html={f.description}
                  template={template}
                  onDesc={onDesc}
                />
                <ChevronRight size={13} style={{ color: open ? t.accent : t.muted, flexShrink: 0 }} />
              </button>
            );
          })}
          {col.parent.bookmarks.map((b) => (
            <Leaf key={b.id} b={b} template={template} onDesc={onDesc} compact />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Orbit — a level as a ring around its parent                      */
/* ------------------------------------------------------------------ */

export function OrbitLayout({ root, template, onDesc }: LayoutProps) {
  const nav = useOpenPath();
  const t = template.theme;
  const [focused, setFocused] = useState<PanelFolder | null>(null);
  const level = focused ?? root;
  const nodes = level.subfolders;

  // A ring shows one level, so "open this folder" means standing on its
  // parent: walk the trail the URL asked for and focus the level that
  // contains the target, which then sits on the ring highlighted.
  useEffect(() => {
    if (!nav.urlToken) return;
    const trail = nav.urlToken.split("/").filter(Boolean);
    if (trail.length === 0) return;
    let cur = root;
    // Everything but the last id: the last one is the node on the ring.
    for (const id of trail.slice(0, -1)) {
      const next = cur.subfolders.find((f) => f.id === id);
      if (!next) return;
      cur = next;
    }
    setFocused(cur === root ? null : cur);
  }, [nav.urlToken, root]);

  const size = 460;
  const radius = 168;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          maxWidth: "100%",
          // Scales the whole ring down rather than cramming the labels on a
          // narrow screen, which is the only way the geometry survives 360px.
          transform: "scale(var(--orbit-scale,1))",
          transformOrigin: "top center",
        }}
      >
        {/* The rings themselves, drawn behind everything. */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: `${size / 2 - radius}px`,
            borderRadius: "50%",
            border: `1px dashed ${t.border}`,
            animation: "panelOrbitSpin 60s linear infinite",
          }}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: `${size / 2 - radius / 2}px`,
            borderRadius: "50%",
            border: `1px dashed ${t.border}`,
            opacity: 0.6,
          }}
        />

        {/* Centre: the level you are on, and the way back out of it. */}
        <button
          type="button"
          onClick={() => setFocused(null)}
          disabled={!focused}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            width: 132,
            height: 132,
            borderRadius: "50%",
            border: `2px solid ${t.accent}`,
            background: t.surface,
            color: t.text,
            cursor: focused ? "pointer" : "default",
            font: "inherit",
            fontSize: 14,
            fontWeight: 700,
            padding: "0 1rem",
            boxShadow: `0 0 0 8px ${t.accent}14`,
          }}
        >
          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
            {level.name}
          </span>
          {focused && (
            <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: t.muted }}>
              volver
            </span>
          )}
        </button>

        {nodes.map((f, i) => {
          const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const x = size / 2 + Math.cos(angle) * radius;
          const y = size / 2 + Math.sin(angle) * radius;
          const trail = [f.id];
          const open = nav.isOpen(trail);
          return (
            <button
              key={f.id}
              type="button"
              {...nav.nodeProps(trail)}
              onDoubleClick={() => setFocused(f)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && f.subfolders.length > 0) setFocused(f);
              }}
              title={`${f.name} — ${countOf(f)} elementos`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: `translate(-50%,-50%) scale(${open ? 1.18 : 1})`,
                width: 104,
                padding: "0.5rem",
                borderRadius: "50%",
                aspectRatio: "1",
                border: `${open ? 2 : 1}px solid ${open ? t.accent : t.border}`,
                background: open ? `${t.accent}2e` : t.surface,
                // A ring of light, so which orbit you are on is obvious at a
                // glance rather than a one-pixel change of border.
                boxShadow: open ? `0 0 0 10px ${t.accent}1f` : "none",
                color: t.text,
                cursor: "pointer",
                font: "inherit",
                fontSize: 12,
                fontWeight: 600,
                transition: "transform .2s ease, background .2s ease, border-color .2s ease",
                animation: `panelOrbitIn .3s ease ${i * 0.04}s both`,
              }}
            >
              <span
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {f.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* What the hovered (or tapped) node holds, listed under the ring: a
          circle is a fine way to show a level and a terrible way to show a
          list of links. */}
      {(() => {
        const hovered = nodes.find((f) => nav.isOpen([f.id]));
        if (hovered) {
          return (
            <OrbitDetail
              folder={hovered}
              template={template}
              onDesc={onDesc}
              onEnter={setFocused}
            />
          );
        }
        // At rest, offering to "enter" the level you are already standing on
        // is noise; the links that live here are not.
        if (level.bookmarks.length > 0) {
          return (
            <OrbitDetail
              folder={level}
              template={template}
              onDesc={onDesc}
              onEnter={() => undefined}
              hideEnter
            />
          );
        }
        return (
          <p style={{ color: t.muted, fontSize: 13 }}>
            {nav.hover
              ? "Pasa el ratón por una órbita para ver lo que contiene."
              : "Toca una órbita para ver lo que contiene."}
          </p>
        );
      })()}
    </div>
  );
}

function OrbitDetail({
  folder,
  template,
  onDesc,
  onEnter,
  hideEnter,
}: {
  folder: PanelFolder;
  template: TemplateConfig;
  onDesc: (d: PanelDesc) => void;
  onEnter: (f: PanelFolder) => void;
  hideEnter?: boolean;
}) {
  const t = template.theme;
  if (folder.bookmarks.length === 0 && folder.subfolders.length === 0) return null;
  return (
    <div
      key={folder.id}
      style={{
        width: "100%",
        maxWidth: 720,
        animation: "panelBranchIn .2s ease both",
        textAlign: "center",
      }}
    >
      <p style={{ color: t.muted, fontSize: 12, marginBottom: 8 }}>{folder.name}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
        {folder.bookmarks.map((b) => (
          <Leaf key={b.id} b={b} template={template} onDesc={onDesc} />
        ))}
        {folder.subfolders.length > 0 && !hideEnter && (
          <button
            type="button"
            onClick={() => onEnter(folder)}
            style={{
              padding: "0.45rem 0.8rem",
              borderRadius: template.card.radius,
              border: `1px dashed ${t.accent}`,
              background: "transparent",
              color: t.accent,
              cursor: "pointer",
              font: "inherit",
              fontSize: 13,
            }}
          >
            Entrar ({folder.subfolders.length})
          </button>
        )}
      </div>
    </div>
  );
}
