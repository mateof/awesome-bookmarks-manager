# E2E + generador de capturas

Suite Playwright que hace dos cosas a la vez sobre una **instancia aislada**:

1. Valida los flujos principales de la app con asserts (E2E).
2. Genera las capturas de la [guía de usuario](../doc/guia-usuario.md) en
   `doc/images/`.

Vive **fuera del workspace pnpm** (no la cubren los globs `apps/*` / `packages/*`)
y tiene sus propias dependencias, así que no toca el build de la app ni entra en
la imagen Docker (el `Dockerfile` solo copia `apps/` y `packages/`).

## Requisitos

- Las dependencias del monorepo instaladas (`pnpm install` en la raíz).
- Dependencias de esta carpeta: `npm install`.
- El navegador de Playwright: `npm run install-browser`.

## Ejecutar

```bash
npm test          # compila web + extensión, arranca el servidor aislado y corre todo
npm run test:app  # solo el recorrido de la app (proyecto "app")
npm run test:ext  # solo la extensión (proyecto "extension")
npm run report    # abre el informe HTML de la última ejecución
```

`npm test` ejecuta antes `scripts/prepare.mjs`, que compila `apps/web` y
`apps/extension`. Para iterar sin recompilar, exporta `SKIP_BUILD=1` y llama a
Playwright directamente.

## Aislamiento

Todo corre en un solo origen (`http://localhost:4310`), imitando el contenedor
de producción (la API sirve el SPA desde disco y expone `/api` en el mismo
puerto). Ver `fixtures/config.ts`:

- **DB efímera:** `DATA_DIR` apunta a `e2e/.data-test`, que se borra al arrancar
  cada ejecución (fresco) y se limpia al terminar (`global-teardown.ts`). Nunca
  toca tu `./data` real.
- **Secretos de usar y tirar:** `MASTER_KEY` y `SESSION_SECRET` están fijados en
  el config. Como la DB se borra en cada ejecución, no protegen nada real.
- **Sin `.env`:** el servidor se lanza pasándole el entorno por Playwright, no
  leyendo el `.env` del repo.

## Estructura

```
fixtures/
  config.ts      Puerto, rutas, secretos de test y comando del servidor
  data.ts        Datos ficticios (usuarios, carpetas, bookmarks, panel)
  app.ts         Helpers de la app (signup, login, crear carpeta/bookmark, shot)
  extension.ts   Fixture de contexto persistente que carga la extensión MV3
tests/
  guide.app.spec.ts   Recorrido guiado con dos usuarios (registro → compartir → paneles)
  extension.ext.spec.ts   Token + opciones + guardado desde la extensión
scripts/prepare.mjs   Compila web + extensión antes de los tests
playwright.config.ts  Dos proyectos (app / extension) y el webServer aislado
```

## Notas

- **Idioma:** i18next detecta el idioma de `localStorage.language`; los fixtures
  lo fijan a `es` para que la UI (y las capturas) salgan en español.
- **Extensión en headless:** cargar una extensión MV3 requiere el Chromium
  completo (`channel: "chromium"`); el "headless shell" por defecto no arranca el
  service worker. El fixture ya lo configura.
- **Estado del snapshot:** justo tras crear un bookmark su favicon/snapshot está
  en `PENDING` (se resuelve en segundo plano). Es el comportamiento real y así
  aparece en algunas capturas.
