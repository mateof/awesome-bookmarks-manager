/**
 * Colour input: a swatch showing the *actual* current value plus the native
 * colour picker, with the raw text kept editable alongside.
 *
 * The text field stays because these values are not always plain hex: the
 * panel theme accepts `rgba(...)` and CSS gradients, which a native picker
 * cannot express. The swatch renders whatever the value is (gradient
 * included) over a checkerboard so transparency is visible, and clicking it
 * opens the picker seeded with the current colour when it is a hex.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Expand `#abc` to `#aabbcc` so the native picker can seed from it. */
function toPickerHex(value: string): string {
  const v = value.trim();
  if (HEX.test(v)) return v.toLowerCase();
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return "#000000";
}

const CHECKER =
  "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 10px 10px";

export function ColorField({
  label,
  value,
  onChange,
  title,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  title?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-slate-500">{label}</span>
      <div className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-1.5 py-1 focus-within:ring-1 focus-within:ring-blue-500 dark:border-slate-700 dark:bg-slate-800">
        <span
          className="relative h-6 w-6 shrink-0 overflow-hidden rounded border border-slate-300 dark:border-slate-600"
          style={{ background: CHECKER }}
          title={title ?? label}
        >
          {/* The real value on top of the checkerboard: hex, rgba or gradient. */}
          <span className="absolute inset-0" style={{ background: value }} />
          <input
            type="color"
            aria-label={title ?? label}
            value={toPickerHex(value)}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </div>
    </label>
  );
}
