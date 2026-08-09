# La extensión de navegador

Guarda la pestaña actual en tu instancia de AwesomeBookmarks con un clic o un
atajo de teclado. Puedes **elegir la carpeta** de destino y **crear carpetas
nuevas** (bajo una existente o en la raíz) sin salir del popup.

Funciona en **Chrome**, **Opera** (ambos Chromium) y **Firefox**.

## Descargar (releases)

En cada cambio de versión de la extensión, la CI publica los paquetes ya
compilados como una [release de GitHub](https://github.com/mateof/awesome-bookmarks-manager/releases)
(busca los tags `extension-vX.Y.Z`): un `.zip` para Chrome/Opera y otro para
Firefox. Puedes descargarlos y saltarte la compilación; la configuración y el uso
(más abajo) son iguales. Si prefieres compilar tú mismo, sigue el apartado
siguiente.

## Compilar la extensión

```bash
pnpm --filter @awesome-bookmarks/extension build
```

Genera dos empaquetados:

| Carpeta | Navegadores |
| --- | --- |
| `apps/extension/dist/` | Chrome y Opera (Chromium, Manifest V3) |
| `apps/extension/dist-firefox/` | Firefox (Manifest V3) |

> Opera **no necesita un paquete propio**: es Chromium y ejecuta exactamente el
> mismo manifest MV3 que Chrome, así que reutiliza `dist/`. Firefox sí necesita
> un manifest distinto (background como *script* y un id de complemento), por eso
> tiene su propia carpeta.

## Instalar en Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y selecciona la carpeta `apps/extension/dist`.
4. Ancla el icono a la barra para tenerlo a mano.

## Instalar en Opera

Opera usa el mismo paquete `dist/` que Chrome:

1. Abre `opera://extensions`.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar extensión sin empaquetar** y selecciona `apps/extension/dist`.

(Alternativamente, Opera puede instalar extensiones del Chrome Web Store con el
complemento oficial *Install Chrome Extensions*, pero para autohospedaje lo más
directo es cargarla sin empaquetar.)

## Instalar en Firefox

Firefox usa la carpeta `apps/extension/dist-firefox`:

1. Abre `about:debugging#/runtime/this-firefox`.
2. Pulsa **Cargar complemento temporal…**.
3. Selecciona el fichero `apps/extension/dist-firefox/manifest.json`.

> **Nota:** así se instala de forma **temporal** (se descarga al cerrar
> Firefox). Para dejarla instalada de forma permanente hay que firmar el
> complemento (por ejemplo con [`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)
> y una cuenta de addons.mozilla.org), o usar Firefox Developer/Nightly con
> `xpinstall.signatures.required` en `false`. La primera vez, Firefox puede
> pedirte permiso para acceder a tu servidor.

## Configurar

La extensión se autentica con un **token** que generas en la web.

1. En la web, ve a **Ajustes → API**, pulsa **Crear token**, y **cópialo** (se
   muestra una sola vez).
2. Abre las opciones de la extensión (botón derecho sobre el icono → *Opciones*,
   o el enlace **Configurar →** del popup).
3. Rellena:
   - **Endpoint del backend**: la URL de tu instancia **incluyendo `/api`**, por
     ejemplo `https://tu-host:7056/api`.
   - **Token**: el que acabas de copiar.
4. Pulsa **Guardar**.

![Opciones de la extensión](images/20-extension-options.png)

## Usar

Pulsa el icono de la extensión para abrir el popup:

![Popup de la extensión](images/21-extension-popup.png)

- **Título** y **tags** (separadas por comas).
- **Guardar en**: elige la carpeta destino, o *Raíz*. La última carpeta usada se
  recuerda para la próxima vez.
- **＋ Nueva carpeta**: crea una carpeta **dentro de la seleccionada** (o en la
  raíz si tienes *Raíz* elegida) sin salir del popup; queda seleccionada como
  destino.
- **Guardar**.

También hay un **atajo de teclado** (`Ctrl+Shift+D`, en Mac `Cmd+Shift+D`) que
guarda la pestaña actual en la **última carpeta usada**.

El bookmark aparece al instante en tu biblioteca, en la carpeta elegida:

![Bookmark guardado en su carpeta](images/22-extension-saved.png)
