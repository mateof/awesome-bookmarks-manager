/**
 * Invented dataset for the guided E2E run. Kept in one place so the guide,
 * the assertions and the screenshots all speak about the same fictional data.
 * The theme is a nod to computing pioneers.
 */

export type TestUser = {
  email: string;
  nickname: string;
  password: string;
};

/**
 * The instance administrator. Registered by the setup project before any spec
 * runs, so it is always the first account and therefore always the admin.
 */
export const admin: TestUser = {
  email: "admin.e2e@example.com",
  nickname: "instanceadmin",
  password: "FirstUserIsAdmin26",
};

export const ada: TestUser = {
  email: "ada.lovelace@example.com",
  nickname: "ada",
  password: "AnalyticalEngine1843",
};

export const alan: TestUser = {
  email: "alan.turing@example.com",
  nickname: "alan",
  password: "EnigmaBletchley1936",
};

export const grace: TestUser = {
  email: "grace.hopper@example.com",
  nickname: "grace",
  password: "CobolNanoseconds1959",
};

export type BookmarkSeed = {
  url: string;
  title: string;
  tags: string[];
  /** Plain text: the rich-text editor shows typed markup literally. */
  description: string;
};

export const folders = {
  research: "Investigación",
  recipes: "Recetas",
  papers: "Papers", // subfolder of research
} as const;

export const researchBookmarks: BookmarkSeed[] = [
  {
    url: "https://developer.mozilla.org/",
    title: "MDN Web Docs",
    tags: ["docs", "web"],
    description: "Referencia de HTML, CSS y JavaScript.",
  },
  {
    url: "https://arxiv.org/",
    title: "arXiv",
    tags: ["papers", "ciencia"],
    description: "Preprints de matemáticas, física e informática.",
  },
  {
    url: "https://es.wikipedia.org/",
    title: "Wikipedia",
    tags: ["enciclopedia"],
    description: "La enciclopedia libre.",
  },
];

export const recipeBookmarks: BookmarkSeed[] = [
  {
    url: "https://www.recetasderechupete.com/",
    title: "Recetas de Rechupete",
    tags: ["cocina"],
    description: "Recetas caseras paso a paso.",
  },
];

export const group = {
  name: "Equipo de investigación",
  description: "Compartimos referencias y papers.",
} as const;

export const panel = {
  /** Built from the "Investigación" folder. */
  name: "Vitrina de Investigación",
  slug: "investigacion",
  password: "PanelSecreto2026",
} as const;
