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

## 7. Extensión de Chrome

La extensión guarda la pestaña actual en tu instancia con un atajo. Se autentica
con un **token** que generas tú.

**1) Crea el token** en *Ajustes → API*. Se muestra una sola vez, cópialo.

![Creación del token de API](images/19-api-token.png)

**2) Configura la extensión** en su página de opciones: el *endpoint* de tu
backend (incluyendo `/api`) y el token.

![Opciones de la extensión](images/20-extension-options.png)

**3) Guarda pestañas.** El popup lee la pestaña activa (título y URL) y, al
pulsar *Guardar*, la envía a tu biblioteca. También hay un atajo de teclado.

![Popup de la extensión](images/21-extension-popup.png)

El bookmark aparece al instante en tu biblioteca, guardado desde la extensión:

![Bookmark guardado desde la extensión](images/22-extension-saved.png)

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
