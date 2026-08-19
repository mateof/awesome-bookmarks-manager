"""Generate the built-in theme palettes.

Ramps are built in OKLCH so every theme keeps the same *perceived* steps as the
default, and only the hue and the amount of colour change. Two curves, taken
from Tailwind's own slate and blue ramps, because the whole app is written
against those stops: whatever reads as "surface" or "body text" today has to
keep reading that way in every theme.

Run once; the output is baked into src/themes.ts as literal hex, so there is no
runtime conversion and the values show up in a diff.
"""
import json
import math

STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

# Lightness/chroma envelope of Tailwind slate (neutral) and blue (accent).
NEUTRAL_L = [0.984, 0.968, 0.929, 0.869, 0.711, 0.554, 0.446, 0.372, 0.279, 0.208, 0.129]
NEUTRAL_C = [0.35, 0.45, 0.60, 0.75, 0.90, 1.00, 1.00, 0.95, 0.85, 0.75, 0.60]
ACCENT_L = [0.970, 0.932, 0.882, 0.809, 0.707, 0.623, 0.546, 0.488, 0.424, 0.379, 0.282]
ACCENT_C = [0.075, 0.176, 0.316, 0.513, 0.765, 1.000, 1.144, 1.160, 0.989, 0.770, 0.497]


def oklch_to_hex(l, c, h_deg):
    h = math.radians(h_deg)
    a, b = c * math.cos(h), c * math.sin(h)
    l_, m_, s_ = (l + 0.3963377774 * a + 0.2158037573 * b,
                  l - 0.1055613458 * a - 0.0638541728 * b,
                  l - 0.0894841775 * a - 1.2914855480 * b)
    l3, m3, s3 = l_ ** 3, m_ ** 3, s_ ** 3
    rgb = (+4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
           -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
           -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3)

    def gamma(x):
        x = max(0.0, min(1.0, x))
        return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
    return "#%02x%02x%02x" % tuple(round(gamma(v) * 255) for v in rgb)


def ramp(hue, chroma, kind):
    ls, cs = (NEUTRAL_L, NEUTRAL_C) if kind == "neutral" else (ACCENT_L, ACCENT_C)
    return {str(s): oklch_to_hex(ls[i], chroma * cs[i], hue) for i, s in enumerate(STOPS)}


# Nine themes on top of the default. Each is a family of its own: a tinted
# neutral ramp plus an accent, and where light and dark want different
# temperatures, a separate dark neutral.
#   id, name, neutral (hue, chroma), accent (hue, chroma), surface, dark neutral
THEMES = [
    ("nordic",   "Nórdico",        (233, 0.030), (215, 0.100), "#fafcff", (228, 0.038)),
    ("sepia",    "Sepia",          (75,  0.034), (62,  0.135), "#fdfaf3", (35,  0.030)),
    ("forest",   "Bosque",         (140, 0.028), (150, 0.120), "#f9fcf7", (155, 0.034)),
    ("cacao",    "Cacao",          (45,  0.036), (33,  0.145), "#fdf9f5", (40,  0.040)),
    ("nocturne", "Nocturno",       (295, 0.030), (300, 0.160), "#fcfaff", (285, 0.045)),
    ("rose",     "Rosa seca",      (5,   0.026), (8,   0.125), "#fffafb", (350, 0.032)),
    ("contrast", "Alto contraste", (0,   0.000), (250, 0.200), "#ffffff", None),
    ("ocean",    "Océano",         (215, 0.032), (195, 0.125), "#f7fcfd", (205, 0.038)),
    ("neon",     "Neón",           (270, 0.026), (330, 0.190), "#fcfaff", (265, 0.048)),
]

out = []
for tid, name, (nh, nc), (ah, ac), white, dark in THEMES:
    entry = {
        "id": tid,
        "name": name,
        "neutral": ramp(nh, nc, "neutral"),
        "accent": ramp(ah, ac, "accent"),
        "white": white,
    }
    if dark:
        entry["darkNeutral"] = ramp(dark[0], dark[1], "neutral")
    out.append(entry)

print(json.dumps(out, ensure_ascii=False, indent=2))
