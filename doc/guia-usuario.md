# Guía de usuario de AwesomeBookmarks

Un recorrido visual por todo lo que puedes hacer en AwesomeBookmarks: crear tu
cuenta, organizar carpetas y bookmarks, compartir con otras personas, publicar
paneles y guardar pestañas desde la extensión de Chrome.

> Todas las capturas de esta guía se generan automáticamente con la suite E2E
> (`e2e/`) sobre una instancia aislada y datos de ejemplo. Si la interfaz
> cambia, se regeneran ejecutando los tests, así que nunca quedan obsoletas.
> Los datos son ficticios (usuarios inspirados en pioneros de la computación).

## Índice

1. [Crear cuenta e iniciar sesión](#1-crear-cuenta-e-iniciar-sesión)
2. [Organizar con carpetas](#2-organizar-con-carpetas)
3. [Añadir bookmarks](#3-añadir-bookmarks)
4. [Compartir con otras personas](#4-compartir-con-otras-personas)
5. [Publicar un panel](#5-publicar-un-panel)
6. [Panel protegido con contraseña](#6-panel-protegido-con-contraseña)
7. [Extensión de Chrome](#7-extensión-de-chrome)
8. [Apariencia: iconos, fondos y banner](#8-apariencia-iconos-fondos-y-banner)
9. [Favoritos](#9-favoritos)
10. [Enlaces simbólicos](#10-enlaces-simbólicos)
11. [Personalizar el aspecto de un panel](#11-personalizar-el-aspecto-de-un-panel)
12. [Llevarte un panel a los marcadores del navegador](#12-llevarte-un-panel-a-los-marcadores-del-navegador)

---

## 1. Crear cuenta e iniciar sesión

AwesomeBookmarks es multiusuario. Cada persona entra con su email o nickname y
su contraseña. La contraseña deriva la clave que cifra tus datos, así que si la
pierdes no hay forma de recuperarlos: apúntala en un sitio seguro.

| Entrar | Crear cuenta |
| --- | --- |
| ![Pantalla de login](images/01-login.png) | ![Formulario de registro](images/02-signup.png) |

El **primer usuario** que se registra en una instancia nueva se convierte en
**administrador**. Tras registrarte llegas directamente a tu inicio, todavía
vacío:

![Inicio vacío tras el registro](images/03-home-empty.png)

---

## 2. Organizar con carpetas

Desde el menú de tres puntos de la barra superior, la opción **Carpeta** abre el
diálogo de creación. Puedes ponerle nombre, descripción, icono, tags y un fondo
personalizado.

![Diálogo de nueva carpeta](images/04-folder-dialog.png)

Las carpetas aparecen en tu inicio y en la barra lateral. Puedes anidarlas para
construir la jerarquía que quieras.

![Carpetas creadas](images/05-folders.png)

---

## 3. Añadir bookmarks

Dentro de una carpeta, el botón **+ Bookmark** abre el diálogo. Basta con pegar
la URL; el título se autocompleta si lo dejas vacío. También puedes añadir
descripción (texto enriquecido), tags y un fondo por tarjeta.

![Diálogo de nuevo bookmark](images/06-bookmark-dialog.png)

La vista admite varios modos (cuadrícula, lista, tarjetas grandes, tabla…). Aquí
la carpeta *Investigación* con tres bookmarks y una subcarpeta *Papers*:

![Carpeta con bookmarks](images/07-bookmarks.png)

---

## 4. Compartir con otras personas

La compartición es **por grupos** y cada copia compartida viaja cifrada. El
flujo tiene cuatro pasos.

**1) Crea un grupo** desde la sección *Grupos*.

![Grupo creado](images/08-group.png)

**2) Invita por email.** Generas una invitación para la otra persona.

![Invitación generada](images/09-invite.png)

**3) La otra persona acepta** la invitación desde su propia sección *Grupos*.

![El invitado acepta](images/10-alan-groups.png)

**4) Comparte la carpeta en el grupo.** Desde el menú de la carpeta, *Compartir
con grupo*, eliges el grupo destino.

![Compartir carpeta con el grupo](images/11-share.png)

A partir de ahí, quien esté en el grupo ve la carpeta en su sección
**Compartidos conmigo**, indicando de quién viene:

![Lo que ve la persona invitada](images/12-alan-shared.png)

---

## 5. Publicar un panel

Un **panel** convierte una carpeta en un tablero público y bonito en
`/panel/{slug}`, con su propia plantilla, buscador y filtro por tags. Desde el
menú de la carpeta, *Generar panel*, eliges nombre, URL, plantilla y modo de
acceso (**Público**, **Con contraseña** o **Usuarios** por email).

![Diálogo para generar el panel](images/13-panel-dialog.png)

Al crearlo obtienes la URL pública para compartir:

![Panel creado con su URL](images/14-panel-created.png)

Cualquiera con el enlace ve el panel, sin necesidad de cuenta. Se navega por las
subcarpetas y se filtra por tags:

![Vista pública del panel](images/15-panel-public.png)

Todos tus paneles se administran desde la sección **Paneles** (regenerar,
copiar URL, editar, borrar) junto a la pestaña de **Plantillas**:

![Gestión de paneles](images/16-panels-manage.png)

---

## 6. Panel protegido con contraseña

Si eliges el modo **Con contraseña**, el panel pide una clave antes de mostrar
nada:

| Puerta de contraseña | Panel desbloqueado |
| --- | --- |
| ![Panel pide contraseña](images/17-panel-password.png) | ![Panel tras introducir la contraseña](images/18-panel-unlocked.png) |

---

## 7. Extensión de navegador

La extensión guarda la pestaña actual en tu instancia. Funciona en **Chrome**,
**Opera** y **Firefox**; la instalación paso a paso para cada uno está en la
[guía de la extensión](extension.md). Se autentica con un **token** que generas tú.

**1) Crea el token** en *Ajustes → API*. Se muestra una sola vez, cópialo.

![Creación del token de API](images/19-api-token.png)

**2) Configura la extensión** en su página de opciones: el *endpoint* de tu
backend (incluyendo `/api`) y el token.

![Opciones de la extensión](images/20-extension-options.png)

**3) Guarda pestañas eligiendo la carpeta.** El popup lee la pestaña activa
(título y URL). Puedes elegir en **Guardar en** la carpeta destino (o *Raíz*), y
con **＋ Nueva carpeta** crear una carpeta dentro de la seleccionada (o en la
raíz) sin salir del popup. También hay un atajo de teclado que usa la última
carpeta usada.

![Popup de la extensión con selector de carpeta](images/21-extension-popup.png)

El bookmark aparece al instante en tu biblioteca, en la carpeta elegida:

![Bookmark guardado desde la extensión](images/22-extension-saved.png)

---

## 8. Apariencia: iconos, fondos y banner

Cada carpeta y cada bookmark puede tener un **icono** y un **fondo** propios.
Al editar (o desde *Apariencia* en el menú de tres puntos):

- **Iconos**: además de subir una imagen o traer el favicon, hay una
  **biblioteca** con cientos de iconos (buscador y categorías) y una fila de los
  más comunes. Eliges el color del icono y listo.
- **Fondos**: una paleta de color con opacidad, subir/pegar una imagen, y una
  rejilla de **20 fondos por defecto** (gradientes, patrones y estilos varios).

![Selectores de icono y fondo](images/24-appearance-dialog.png)

Cuando una carpeta o un bookmark tiene fondo o imagen, al abrirlo se muestra un
**banner** de cabecera (estilo siyuan) con el icono y el título encima:

![Banner de cabecera de una carpeta](images/23-folder-banner.png)

## 9. Favoritos

Cada carpeta y cada bookmark tiene una **estrella**. Al pulsarla, el elemento
pasa a la barra **Favoritos** de la cabecera, que es una lista plana de acceso
rápido: primero las carpetas y después los enlaces, ambos por orden alfabético.

![Estrella de favorito en una tarjeta](images/25-favorite-star.png)

La estrella de un elemento marcado se ve siempre, sin necesidad de pasar el
ratón por encima, para que distingas tus favoritos de un vistazo.

![Barra de favoritos desplegada](images/26-favorites-bar.png)

---

## 10. Enlaces simbólicos

Un **enlace simbólico** coloca una carpeta o un bookmark en otro sitio sin
duplicarlo. Es útil para reunir en una sola carpeta cosas repartidas por rutas
distintas, por ejemplo para construir un panel a medida.

Desde el menú de tres puntos de cualquier carpeta o bookmark, elige
**Crear enlace en…** y selecciona el destino:

![Diálogo para crear un enlace simbólico](images/27-symlink-dialog.png)

El enlace se marca con un icono de cadena y muestra **siempre el contenido
actual del original**: si renombras o cambias el original, el cambio se ve en
todos sus enlaces. Al abrir una carpeta enlazada vas a la carpeta real.

![Carpeta con un enlace simbólico dentro](images/28-symlink-folder.png)

Detalles a tener en cuenta:

- Borrar un enlace **no** borra el original.
- No se puede enlazar una carpeta dentro de sí misma, ni encadenar enlaces a
  otros enlaces.
- Los paneles resuelven los enlaces al generarse, así que un panel construido
  sobre una carpeta de enlaces muestra el contenido real.

---

## 11. Personalizar el aspecto de un panel

Los paneles se dibujan con una **plantilla**. En *Paneles → Plantillas* tienes
las integradas (Cuadrícula, Bento, Terminal, Lista minimal, Dashboard, Galaxia,
Océano, Playa, Pecera, Dragon Ball y Doraemon) y puedes duplicar cualquiera
para partir de ella.

![Lista de plantillas](images/29-templates-list.png)

El editor muestra una **previsualización en vivo** con datos de ejemplo, a la
vez en escritorio y en móvil, que reacciona al instante a cada cambio:

![Editor de plantilla con previsualización](images/30-template-editor.png)

Qué puedes ajustar:

- **Colores** del tema, con muestra visual y selector de color. El campo de
  texto sigue disponible para valores que el selector nativo no sabe expresar,
  como `rgba(...)` o degradados.
- **Fondo**: una escena integrada (galaxia, aurora, océano, playa, pecera,
  nubes, sakura o bolas de dragón), dibujada con CSS y animada. Respeta la
  preferencia del sistema de *reducir movimiento*.
- **Layout**: ancho máximo, separación entre tarjetas, alto mínimo de tarjeta,
  orden de las secciones y mostrar u ocultar buscador, migas, títulos de
  sección y botón de descarga.
- **Listar subcarpetas**: cada carpeta enseña su primer nivel debajo, y al
  pulsar un hijo se abre solo esa carpeta.

Así queda un panel público con una escena animada:

![Panel público con escena de galaxia](images/31-panel-themed.png)

Además, en *Paneles → editar* cada panel concreto puede llevar:

- **Fondo propio**: una imagen, un GIF o un vídeo corto (MP4/WebM, hasta 25 MB)
  que sustituye a la escena de la plantilla.
- **Título, pestaña e icono**: el título que se ve dentro del panel, el texto
  de la pestaña del navegador y un emoji como favicon.

Los paneles se **regeneran solos** en segundo plano cuando cambias su contenido,
así que no hace falta pulsar *Regenerar* después de cada edición.

---

## 12. Llevarte un panel a los marcadores del navegador

Todo panel incluye un botón **Descargar marcadores** que genera un fichero HTML
en el formato estándar que importan Chrome, Firefox y Edge, respetando la
jerarquía de carpetas. Después, en el navegador: *Administrador de marcadores →
Importar marcadores*.

No es posible que una página web escriba directamente en los marcadores del
navegador: esa capacidad está reservada a las extensiones, así que la
importación manual es la vía que funciona sin instalar nada.

Dos avisos prácticos:

- Importar dos veces **duplica**, porque el navegador siempre añade. Si vas a
  repetir el volcado, borra antes la carpeta anterior.
- Los iconos no viajan: Chrome ignora los del fichero y busca los suyos.

---

## Cómo se regeneran estas capturas

Todo lo anterior está cubierto por tests end-to-end que, de paso, sacan las
capturas. Para regenerarlas:

```bash
cd e2e
npm install            # solo la primera vez
npm run install-browser # Chromium para Playwright, solo la primera vez
npm test               # levanta una instancia aislada, corre el flujo y guarda las imágenes en doc/images/
```

Consulta [`e2e/README.md`](../e2e/README.md) para más detalle sobre el entorno
aislado y la estructura de la suite.
