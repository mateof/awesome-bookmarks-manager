import { expect, test } from "@playwright/test";
import { createFolder, seedSpanish, signup } from "../fixtures/app.js";

/**
 * A theme changes the shape of the interface, not only its colour.
 *
 * Ten palettes over one layout is ten copies of the same app. What is measured
 * here is that switching theme actually moves the computed geometry of a real
 * element — corner radius, edge weight, shadow, typeface — because a variable
 * that is emitted but never reaches a component is indistinguishable from one
 * that does, right up until you look at the screen.
 */
async function themeMetrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    // A real card on the page, not a probe element: the point is that the
    // interface changed, not that a variable holds a value.
    const card = document.querySelector("main [class*='rounded']");
    const cs = card ? getComputedStyle(card) : null;
    // Sketch corners are applied to the large radii only — cards and panels —
    // so they have to be measured on one of those, not on whatever rounded
    // thing comes first in the document.
    const panel = document.querySelector("main .rounded-lg, main .rounded-xl");
    const ps = panel ? getComputedStyle(panel) : null;
    return {
      radiusVar: root.getPropertyValue("--shape-radius").trim(),
      borderVar: root.getPropertyValue("--shape-border").trim(),
      shadowVar: root.getPropertyValue("--shadow").trim(),
      font: root.getPropertyValue("--font-body").trim(),
      cardRadius: cs?.borderRadius ?? "",
      cardBorderStyle: cs?.borderTopStyle ?? "",
      cardBorderColor: cs?.borderTopColor ?? "",
      borderStyleVar: root.getPropertyValue("--shape-border-style").trim(),
      panelRadius: ps?.borderRadius ?? "",
      bodyFont: getComputedStyle(document.body).fontFamily,
      headerBg: (() => {
        const h = document.querySelector("header");
        return h ? getComputedStyle(h).backgroundColor : "";
      })(),
    };
  });
}

test("cambiar de tema cambia la forma, no solo el color", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "theme.shape.e2e@example.com",
    nickname: "themeshape",
    password: "ThemeShape28xxxx",
  });
  await createFolder(page, "Con forma");

  const setTheme = async (id: string) => {
    await page.evaluate((themeId) => {
      // The cached stylesheet is what the boot script paints, so it has to go
      // too or the reload repaints the previous theme.
      localStorage.setItem("palette", themeId);
      localStorage.removeItem("palette.css");
    }, id);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Nuevo bookmark", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
  };

  await setTheme("slate");
  const base = await themeMetrics(page);
  expect(base.radiusVar).toBe("1");
  expect(base.cardRadius).not.toBe("0px");

  // Square, thick-edged, hard shadow. Nothing about it is a recolour.
  await setTheme("brutal");
  const brutal = await themeMetrics(page);
  expect(brutal.radiusVar).toBe("0");
  expect(brutal.borderVar).toBe("3px");
  expect(brutal.cardRadius).toBe("0px");
  expect(brutal.shadowVar).not.toBe(base.shadowVar);

  // Monospace and flat.
  await setTheme("terminal");
  const terminal = await themeMetrics(page);
  expect(terminal.shadowVar).toBe("none");
  expect(terminal.bodyFont).toContain("ui-monospace");

  // The opposite extreme: pills, no edge.
  await setTheme("burbuja");
  const bubble = await themeMetrics(page);
  expect(Number(bubble.radiusVar)).toBeGreaterThan(2);
  expect(bubble.borderVar).toBe("0px");
  expect(bubble.cardRadius).not.toBe(base.cardRadius);

  // Serif, and the frame is treated differently from the page.
  await setTheme("prensa");
  const press = await themeMetrics(page);
  expect(press.bodyFont).toContain("ui-serif");

  // Stroke: the line is the theme. A 2px hairline-grey rule is still a
  // hairline-grey rule, so the border *colour* has to move as well.
  await setTheme("trazo");
  const ink = await themeMetrics(page);
  expect(ink.borderVar).toBe("2px");
  expect(ink.cardBorderColor).not.toBe(base.cardBorderColor);

  // Sketch: the corners are uneven, which is the only thing that reads as
  // drawn rather than as a rounder rectangle.
  await setTheme("boceto");
  const sketch = await themeMetrics(page);
  expect(sketch.borderStyleVar).toBe("dashed");
  expect(sketch.cardBorderStyle).toBe("dashed");
  // An uneven radius prints as four values with a slash.
  expect(sketch.panelRadius).toContain("/");

  await setTheme("plano");
  const blueprint = await themeMetrics(page);
  expect(blueprint.cardBorderStyle).toBe("dotted");

  await setTheme("cacao");
  const cacao = await themeMetrics(page);
  // `chrome: solid` paints the header in the accent, so it stops matching the
  // page surface — the header and footer are part of a theme now.
  expect(cacao.headerBg).not.toBe(base.headerBg);

  await ctx.close();
});

test("un tema sin sección de forma se ve como siempre", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "theme.default.e2e@example.com",
    nickname: "themedefault",
    password: "ThemeDefault28xx",
  });

  // Themes are files people already have. One written before shape existed has
  // to keep looking exactly as it did, which is what the schema defaults are
  // for.
  await page.evaluate(() => {
    localStorage.setItem(
      "palette.custom",
      JSON.stringify([
        {
          id: "solocolor",
          name: "Solo color",
          white: "#ffffff",
          neutral: {
            "50": "#f8fafc", "100": "#f1f5f9", "200": "#e2e8f0",
            "300": "#cbd5e1", "400": "#94a3b8", "500": "#64748b",
            "600": "#475569", "700": "#334155", "800": "#1e293b",
            "900": "#0f172a", "950": "#020617",
          },
          accent: {
            "50": "#eff6ff", "100": "#dbeafe", "200": "#bfdbfe",
            "300": "#93c5fd", "400": "#60a5fa", "500": "#3b82f6",
            "600": "#2563eb", "700": "#1d4ed8", "800": "#1e40af",
            "900": "#1e3a8a", "950": "#172554",
          },
        },
      ]),
    );
    localStorage.setItem("palette", "solocolor");
    localStorage.removeItem("palette.css");
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Nuevo bookmark", exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  const m = await themeMetrics(page);
  expect(m.radiusVar).toBe("1");
  expect(m.borderVar).toBe("1px");
  // Note "sans-serif" contains "serif": check the stack that is actually used.
  expect(m.bodyFont).toContain("ui-sans-serif");
  expect(m.bodyFont).not.toContain("ui-serif");
  expect(m.bodyFont).not.toContain("ui-monospace");

  await ctx.close();
});
