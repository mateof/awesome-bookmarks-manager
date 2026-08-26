import { Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Small emoji picker: a popover with a searchable grid.
 *
 * The list is curated and bundled rather than pulled from a library or a CDN:
 * the app ships no external assets and the panel pages run under a strict CSP,
 * so a few hundred well-chosen emoji beat a megabyte of dependency. Each entry
 * carries Spanish keywords so searching "casa" or "libro" works.
 */

interface Entry {
  e: string;
  k: string;
}

const GROUPS: { label: string; items: Entry[] }[] = [
  {
    label: "Frecuentes",
    items: [
      { e: "🔖", k: "marcador bookmark" },
      { e: "⭐", k: "estrella favorito" },
      { e: "🏠", k: "casa inicio home" },
      { e: "📁", k: "carpeta archivo" },
      { e: "📚", k: "libros biblioteca" },
      { e: "💼", k: "trabajo maletin" },
      { e: "🚀", k: "cohete lanzamiento" },
      { e: "🔥", k: "fuego popular" },
      { e: "💡", k: "idea bombilla" },
      { e: "✅", k: "check hecho ok" },
      { e: "🎯", k: "diana objetivo" },
      { e: "🧠", k: "cerebro aprender" },
    ],
  },
  {
    label: "Trabajo y estudio",
    items: [
      { e: "💻", k: "portatil ordenador codigo" },
      { e: "🖥️", k: "monitor ordenador" },
      { e: "⌨️", k: "teclado" },
      { e: "📝", k: "notas escribir" },
      { e: "📊", k: "grafico datos metricas" },
      { e: "📈", k: "grafico subida" },
      { e: "📅", k: "calendario fecha" },
      { e: "📌", k: "chincheta fijar" },
      { e: "🗂️", k: "archivador carpetas" },
      { e: "🔍", k: "lupa buscar" },
      { e: "🔗", k: "enlace link" },
      { e: "⚙️", k: "ajustes engranaje config" },
      { e: "🛠️", k: "herramientas" },
      { e: "🧪", k: "laboratorio pruebas test" },
      { e: "🐛", k: "bug error insecto" },
      { e: "🎓", k: "estudio graduacion universidad" },
    ],
  },
  {
    label: "Ocio",
    items: [
      { e: "🎮", k: "videojuegos juego" },
      { e: "🎬", k: "cine peliculas" },
      { e: "🎵", k: "musica nota" },
      { e: "🎧", k: "auriculares musica podcast" },
      { e: "📺", k: "television series" },
      { e: "🍿", k: "palomitas cine" },
      { e: "⚽", k: "futbol deporte" },
      { e: "🏋️", k: "gimnasio deporte pesas" },
      { e: "🍳", k: "cocina recetas huevo" },
      { e: "🍕", k: "pizza comida" },
      { e: "☕", k: "cafe bebida" },
      { e: "🌱", k: "planta jardin" },
      { e: "✈️", k: "viajes avion" },
      { e: "🏖️", k: "playa vacaciones" },
      { e: "🎨", k: "arte diseño pintura" },
      { e: "📷", k: "camara fotos" },
    ],
  },
  {
    label: "Símbolos",
    items: [
      { e: "❤️", k: "corazon amor" },
      { e: "🧡", k: "corazon naranja" },
      { e: "💙", k: "corazon azul" },
      { e: "💚", k: "corazon verde" },
      { e: "💜", k: "corazon morado" },
      { e: "⚡", k: "rayo rapido energia" },
      { e: "🌟", k: "estrella brillo" },
      { e: "🌈", k: "arcoiris" },
      { e: "🌍", k: "mundo tierra global" },
      { e: "🔒", k: "candado privado seguro" },
      { e: "🔑", k: "llave acceso" },
      { e: "🏷️", k: "etiqueta tag" },
      { e: "📦", k: "caja paquete" },
      { e: "🗝️", k: "llave antigua" },
      { e: "♻️", k: "reciclar" },
      { e: "🧩", k: "puzzle pieza" },
    ],
  },
  {
    label: "Animales y naturaleza",
    items: [
      { e: "🐉", k: "dragon" },
      { e: "🐱", k: "gato" },
      { e: "🐶", k: "perro" },
      { e: "🦊", k: "zorro" },
      { e: "🐧", k: "pinguino" },
      { e: "🐢", k: "tortuga" },
      { e: "🐠", k: "pez pecera" },
      { e: "🦉", k: "buho" },
      { e: "🌵", k: "cactus" },
      { e: "🌸", k: "flor sakura" },
      { e: "🍁", k: "hoja otoño" },
      { e: "🌙", k: "luna noche" },
      { e: "☀️", k: "sol dia" },
      { e: "⛅", k: "nube tiempo" },
      { e: "❄️", k: "nieve frio" },
      { e: "🌊", k: "ola mar oceano" },
    ],
  },
];

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
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return GROUPS;
    const filtered = GROUPS.map((g) => ({
      label: g.label,
      items: g.items.filter(
        (it) => it.k.includes(query) || it.e === query,
      ),
    })).filter((g) => g.items.length > 0);
    return filtered;
  }, [q]);

  return (
    <div
      ref={boxRef}
      className={
        plain
          ? "w-full p-1"
          : "absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800"
      }
    >
      <div className="mb-2 flex items-center gap-1 rounded border border-slate-300 px-2 py-1 dark:border-slate-600">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("panels.emojiSearch")}
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

      <div className="max-h-56 overflow-y-auto">
        {results.length === 0 && (
          <div className="px-1 py-4 text-center text-xs text-slate-400">
            {t("panels.emojiNoResults")}
          </div>
        )}
        {results.map((g) => (
          <div key={g.label} className="mb-2">
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-slate-400">
              {g.label}
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {g.items.map((it) => (
                <button
                  key={it.e}
                  type="button"
                  title={it.k.split(" ")[0]}
                  onClick={() => {
                    onPick(it.e);
                    onClose();
                  }}
                  className={`rounded p-1 text-lg leading-none hover:bg-slate-100 dark:hover:bg-slate-700 ${
                    value === it.e ? "bg-slate-200 dark:bg-slate-600" : ""
                  }`}
                >
                  {it.e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
