import { useMemo } from "react";

/**
 * Decorative full-bleed background for a panel. Renders one of a set of
 * built-in static/animated scenes (see PANEL_SCENES in shared). Purely visual:
 * fixed behind the content, ignores pointer events, and honours reduced-motion
 * (all animation is disabled via CSS). Particle positions are deterministic so
 * they don't jump around on re-render.
 *
 * `contained` switches from a viewport-fixed layer to one that fills its
 * nearest positioned ancestor — used by the theme preview.
 */
export function PanelBackground({
  scene,
  contained = false,
}: {
  scene?: string | null;
  contained?: boolean;
}) {
  const s = (scene ?? "none").toLowerCase();
  const body = useMemo(() => renderScene(s), [s]);
  if (!body) return null;
  return (
    <div
      aria-hidden
      data-scene={s}
      className={`pbg-scene pbg-${s}`}
      style={{ position: contained ? "absolute" : "fixed", inset: 0, zIndex: 0 }}
    >
      {body}
    </div>
  );
}

/** True when a scene id maps to something we actually draw. */
export function isRealScene(scene?: string | null): boolean {
  const s = (scene ?? "none").toLowerCase();
  return s !== "none" && SCENES.has(s);
}

const SCENES = new Set([
  "galaxy",
  "aurora",
  "ocean",
  "beach",
  "fishtank",
  "clouds",
  "sakura",
  "dragonballs",
]);

/* Deterministic PRNG (mulberry32) so a scene's layout is stable per render. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const range = (r: () => number, min: number, max: number) => min + r() * (max - min);

function renderScene(s: string): React.ReactNode {
  switch (s) {
    case "galaxy":
      return galaxy();
    case "aurora":
      return aurora();
    case "ocean":
      return sea("ocean");
    case "beach":
      return sea("beach");
    case "fishtank":
      return fishtank();
    case "clouds":
      return clouds();
    case "sakura":
      return sakura();
    case "dragonballs":
      return dragonballs();
    default:
      return null;
  }
}

function stars(seed: number, count: number): React.ReactNode {
  const r = makeRng(seed);
  return Array.from({ length: count }, (_, i) => {
    const size = range(r, 1, 3);
    return (
      <span
        key={i}
        className="pbg-star"
        style={{
          left: `${range(r, 0, 100)}%`,
          top: `${range(r, 0, 100)}%`,
          width: `${size}px`,
          height: `${size}px`,
          animationDuration: `${range(r, 2, 5).toFixed(2)}s`,
          animationDelay: `${range(r, 0, 4).toFixed(2)}s`,
        }}
      />
    );
  });
}

function galaxy(): React.ReactNode {
  const planets = [
    { radius: 210, size: 26, dur: 34, bg: "radial-gradient(circle at 34% 30%,#c4b5fd,#7c3aed)" },
    { radius: 330, size: 16, dur: 52, bg: "radial-gradient(circle at 34% 30%,#7dd3fc,#0369a1)" },
    { radius: 140, size: 12, dur: 22, bg: "radial-gradient(circle at 34% 30%,#fde68a,#d97706)" },
  ];
  return (
    <>
      {stars(11, 80)}
      {planets.map((p, i) => (
        <div key={i} className="pbg-orbit" style={{ animationDuration: `${p.dur}s` }}>
          <span
            className="pbg-planet"
            style={{
              left: `${p.radius}px`,
              top: 0,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: p.bg,
              boxShadow: "0 0 12px rgba(167,139,250,0.5)",
            }}
          />
        </div>
      ))}
      <span className="pbg-shoot" style={{ top: "18%", left: "10%" }} />
      <span className="pbg-shoot" style={{ top: "42%", left: "20%", animationDelay: "3.5s" }} />
    </>
  );
}

function aurora(): React.ReactNode {
  return (
    <>
      {stars(23, 60)}
      <div className="pbg-aurora-band" style={{ top: "2%" }} />
      <div
        className="pbg-aurora-band"
        style={{ top: "26%", opacity: 0.35, animationDelay: "3s", animationDuration: "18s" }}
      />
    </>
  );
}

function sea(kind: "ocean" | "beach"): React.ReactNode {
  const beach = kind === "beach";
  const seaStyle: React.CSSProperties = beach
    ? { top: "45%", height: "16%", bottom: "auto" }
    : { height: "57%" };
  const boatTop = beach ? "49%" : "40%";
  return (
    <>
      <div className="pbg-sun" />
      <div className="pbg-sea" style={seaStyle} />
      <div className="pbg-boat" style={{ top: boatTop, fontSize: 40, animationDuration: "26s" }}>
        <span>⛵</span>
      </div>
      <div
        className="pbg-boat"
        style={{
          top: beach ? "53%" : "52%",
          fontSize: 26,
          animationDuration: "40s",
          animationDelay: "6s",
        }}
      >
        <span style={{ animationDuration: "4s" }}>⛵</span>
      </div>
    </>
  );
}

function fishtank(): React.ReactNode {
  const r = makeRng(7);
  const emojis = ["🐠", "🐟", "🐡", "🐠", "🐟", "🐡"];
  const fish = emojis.map((e, i) => {
    const right = i % 2 === 0;
    return (
      <span
        key={i}
        className={`pbg-fish pbg-fish--${right ? "r" : "l"}`}
        style={{
          top: `${range(r, 8, 78)}%`,
          fontSize: `${range(r, 22, 40).toFixed(0)}px`,
          animationDuration: `${range(r, 16, 30).toFixed(1)}s`,
          animationDelay: `${range(r, 0, 12).toFixed(1)}s`,
        }}
      >
        {e}
      </span>
    );
  });
  const bubbles = Array.from({ length: 14 }, (_, i) => {
    const size = range(r, 5, 12);
    return (
      <span
        key={`b${i}`}
        className="pbg-bubble"
        style={{
          left: `${range(r, 2, 98)}%`,
          width: `${size}px`,
          height: `${size}px`,
          animationDuration: `${range(r, 6, 12).toFixed(1)}s`,
          animationDelay: `${range(r, 0, 8).toFixed(1)}s`,
        }}
      />
    );
  });
  return (
    <>
      {bubbles}
      {fish}
      <div className="pbg-fishtank-sand" />
    </>
  );
}

function clouds(): React.ReactNode {
  const r = makeRng(31);
  return Array.from({ length: 7 }, (_, i) => (
    <span
      key={i}
      className="pbg-cloud"
      style={{
        top: `${range(r, 3, 70)}%`,
        fontSize: `${range(r, 34, 92).toFixed(0)}px`,
        opacity: range(r, 0.75, 1),
        animationDuration: `${range(r, 34, 70).toFixed(0)}s`,
        animationDelay: `${range(r, 0, 30).toFixed(0)}s`,
      }}
    >
      ☁️
    </span>
  ));
}

function sakura(): React.ReactNode {
  const r = makeRng(53);
  const shades = ["#ff9ec4", "#ffb3d1", "#ff85b3", "#ffc9dd"];
  return Array.from({ length: 26 }, (_, i) => {
    const w = range(r, 8, 14);
    return (
      <span
        key={i}
        className="pbg-petal"
        style={{
          left: `${range(r, 0, 100)}%`,
          width: `${w}px`,
          height: `${w * 1.3}px`,
          background: shades[i % shades.length],
          animationDuration: `${range(r, 8, 15).toFixed(1)}s`,
          animationDelay: `${range(r, 0, 12).toFixed(1)}s`,
        }}
      />
    );
  });
}

function dragonballs(): React.ReactNode {
  const r = makeRng(97);
  return Array.from({ length: 7 }, (_, i) => {
    const size = range(r, 40, 76);
    const starCount = i + 1;
    return (
      <span
        key={i}
        className="pbg-dball"
        style={{
          left: `${range(r, 3, 92)}%`,
          width: `${size}px`,
          height: `${size}px`,
          animationDuration: `${range(r, 13, 24).toFixed(1)}s`,
          animationDelay: `${range(r, 0, 14).toFixed(1)}s`,
        }}
      >
        <span style={{ fontSize: `${(size * 0.16).toFixed(0)}px`, maxWidth: "62%", textAlign: "center" }}>
          {"★".repeat(starCount)}
        </span>
      </span>
    );
  });
}
