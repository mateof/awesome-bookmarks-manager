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
13. [Carpetas inteligentes](#13-carpetas-inteligentes)
14. [Papelera y restaurar](#14-papelera-y-restaurar)
15. [Duplicados](#15-duplicados)
16. [Buscador y paleta de comandos](#16-buscador-y-paleta-de-comandos)
17. [Guardar desde el móvil](#17-guardar-desde-el-móvil)
18. [Descripciones largas](#18-descripciones-largas)
19. [Almacenamiento y cuotas](#19-almacenamiento-y-cuotas)
20. [Sesiones activas](#20-sesiones-activas)
21. [Registro de seguridad](#21-registro-de-seguridad)
22. [Texto copiable y texto oculto](#22-texto-copiable-y-texto-oculto)
23. [Copias en la nube](#23-copias-en-la-nube)
24. [Copiar una selección como lista](#24-copiar-una-selección-como-lista)
25. [Exportar e importar en el formato de la app](#25-exportar-e-importar-en-el-formato-de-la-app)

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

**Se comparte también el aspecto.** La carpeta llega con el fondo (color o
imagen), el icono, el tono de texto forzado y los tags que le pusiste, y se
recorre carpeta a carpeta con el mismo botón de *Subir de nivel* que usas en la
tuya. Si cambias cualquiera de esas cosas después de compartir, el grupo lo ve
en cuanto se vuelve a sellar la copia, que ocurre solo con guardar el cambio.

Un detalle que conviene saber: los iconos y los fondos van cifrados con tu
clave, así que nadie más puede leerlos directamente. Lo que se comparte es una
**copia** de esas imágenes recifrada con la clave del grupo, y esa copia ocupa
espacio en **tu** cuota, no en la de quien la recibe. Al revocar el compartido
se borra.

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
las integradas y puedes duplicar cualquiera para partir de ella.

Hay dos familias, y la diferencia no es de color sino de cómo se recorren.

**Las que navegan carpeta a carpeta**, como el resto de la aplicación:
Cuadrícula, Bento, Terminal, Lista minimal, Dashboard, Galaxia, Océano, Playa,
Pecera, Dragon Ball y Doraemon.

**Las que dibujan la jerarquía entera y la van abriendo sin cambiar de
página.** Son las nuevas y hay tres formas:

| Forma | Plantillas | Cómo se lee |
| --- | --- | --- |
| **Árbol** | Árbol, Plano | En vertical: cada carpeta se despliega hacia abajo con su rama, como un explorador de archivos. |
| **Mapa mental** | Mapa mental, Sinapsis | En horizontal: cada nivel es una columna que crece a la derecha, unida a la anterior. Arranca con la primera rama abierta. |
| **Órbita** | Órbita, Reactor | En círculo: las carpetas de un nivel giran alrededor de su padre. Doble clic entra en una y el centro te devuelve. |

Se abren **pasando el ratón** en escritorio y **tocando** en móvil (una segunda
pulsación cierra). Es automático: se mira si el dispositivo tiene puntero de
verdad, así que una tablet con teclado se comporta como un escritorio.

Una rama cerrada sigue en la página, porque es lo que permite animar su altura
sin números mágicos, pero está marcada como inerte: no la alcanza el tabulador,
no la leen los lectores de pantalla y no la encuentra el buscador del navegador.

**El texto se puede leer sin salir del panel.** Si una carpeta o un bookmark
tienen descripción, aparece un icono de información que la abre en una ventana,
en cualquiera de las plantillas. Dentro funcionan igual que en la aplicación las
dos marcas del editor: el texto marcado como copiable se copia al hacer clic, y
el texto oculto se descubre al primer clic y se copia al segundo.

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

## 13. Carpetas inteligentes

En **Filtrar por tags** puedes combinar varios tags (con *Todas* o *Alguna*),
escribir texto libre y limitar a favoritos. Cuando el filtro te sirva, pulsa
**Guardar como carpeta**: aparecerá en la barra lateral con el nombre y el
color que elijas.

Lo importante es lo que *no* hace: no copia nada. Guarda la búsqueda, y la
lista se recalcula cada vez que la abres. Si etiquetas algo nuevo, entra solo;
si le quitas el tag, sale. Un mismo bookmark puede estar en varias carpetas
inteligentes a la vez sin ocupar espacio ni salirse de su carpeta real.

Como el filtro vive en la URL, también puedes compartirlo o guardarlo en el
navegador sin crear nada. Si cambias la búsqueda con una carpeta abierta,
aparece un botón **Actualizar carpeta** para fijar la nueva definición.

---

## 14. Papelera y restaurar

Eliminar nunca borró de verdad: marcaba el elemento como borrado. La
**Papelera** de la barra lateral es la otra mitad de esa decisión.

Al borrar una carpeta se borra también todo lo que contiene, así que la
papelera lo muestra como una sola tarjeta: la carpeta que eliminaste, con el
resto plegado debajo (*Ver contenido*). **Restaurar** devuelve todo el bloque
de una vez y a su sitio original. Si la carpeta que lo contenía ya no existe,
el elemento vuelve a Inicio en lugar de perderse.

Restaurar una carpeta solo recupera lo que se borró **en esa misma acción**:
algo que eliminaste aparte, antes, sigue en la papelera. Es deliberado, para
que restaurar no resucite cosas que quitaste a propósito.

Nada caduca solo. Vaciar la papelera (entera o solo lo anterior a 30 días) es
siempre una acción tuya, y es el único punto de la aplicación donde los datos
se destruyen de verdad.

---

## 15. Duplicados

Tras importar los marcadores de un navegador es normal acabar con el mismo
enlace varias veces. **Duplicados** agrupa los bookmarks que apuntan a la misma
URL, ignorando diferencias cosméticas: la barra final, el puerto por defecto y
el fragmento `#...` no crean grupos distintos.

Eliges cuál se queda (por defecto el más antiguo) y **Fusionar** lo deja con
los tags y la descripción de todas las copias, marca favorito si alguna lo era,
y reapunta a él cualquier enlace simbólico que apuntara a las copias. Las
copias van a la papelera, no se destruyen: si la fusión no era lo que querías,
las restauras.

Los enlaces simbólicos no se cuentan como duplicados: apuntar al mismo sitio
desde dos lugares es exactamente para lo que existen.

---

## 16. Buscador y paleta de comandos

`Ctrl/Cmd + K` abre una única caja para todo.

Mientras escribes, los títulos y las URL se buscan al instante en lo que ya
está cargado. En paralelo el servidor busca en las **descripciones** y en el
**texto de las instantáneas guardadas** (índice FTS5), así que puedes encontrar
una página por algo que estaba *dentro* de ella aunque el título no lo diga; el
fragmento que coincide aparece resaltado bajo el resultado.

Los elementos de la carpeta en la que estás se agrupan y se resaltan arriba,
bajo *En esta carpeta*, y el resto va después. Cada resultado muestra su icono
real.

La misma caja ejecuta acciones: *Nuevo bookmark*, *Nueva carpeta*, *Filtrar por
tags*, *Paneles*, *Papelera*, *Duplicados*, *Grupos*, *Importar y exportar*.
Con la caja vacía se ofrecen las más usadas, y al escribir se filtran por
nombre o por palabras relacionadas.

---

## 17. Guardar desde el móvil

En Android, instala la aplicación desde el navegador (*Añadir a pantalla de
inicio* / *Instalar aplicación*). A partir de ahí AwesomeBookmarks aparece en
el menú **Compartir** del sistema: desde cualquier app puedes mandarle un
enlace y se abre una pantalla corta con la URL, el título, la carpeta y los
tags. La carpeta que elegiste la última vez queda recordada, que es lo normal
si guardas todo en una bandeja de entrada.

Funciona con las dos formas en que las apps comparten: las que envían la URL en
su propio campo y las que lo meten todo dentro del texto (en ese caso el enlace
se extrae y el resto queda como nota).

Si la sesión está cerrada, el enlace compartido sobrevive al inicio de sesión:
te devuelve a la misma pantalla con los datos puestos.

---

## 18. Descripciones largas

La descripción de una carpeta va encima de su contenido, así que unas notas
largas empujaban los bookmarks fuera de la pantalla: abrir la carpeta obligaba
a hacer scroll para llegar a lo que ibas a buscar.

Ahora el texto se recorta a unas pocas líneas, con un degradado al final para
que se vea que hay más, y un botón **Ver más** lo despliega entero. **Ver
menos** lo vuelve a plegar.

El botón solo aparece si el texto de verdad no cabe: una nota de dos líneas no
gana un control que no hace nada. La medida es de altura real, no de número de
caracteres, porque una imagen o una tabla ocupan mucho más de lo que su
longitud sugiere.

Aplica igual a la descripción de un bookmark y a las carpetas y bookmarks que
ves en Compartidos.

---

## 18b. Editar el texto sin abrir el formulario

En la carpeta o en la ficha del bookmark, el bloque de texto lleva un **lápiz
en su esquina superior derecha**. Abre un editor con la descripción sola.

Es a propósito que no abra el formulario completo: ese ya lo tienes a un clic
en el mismo sitio, y para cambiar una nota tendrías que pasar por el nombre, la
URL, los tags y los colores para llegar al único campo que te interesaba.

Guarda **solo la descripción**, así que no puede pisar nada que hayas cambiado
por otro lado (o que haya cambiado otra persona del grupo mientras tanto). Si
vacías el editor del todo, la descripción se borra de verdad en vez de quedarse
un párrafo vacío que mantendría el bloque en pantalla sin nada dentro.

Para **añadir** texto donde no lo hay todavía, sigue siendo el botón de editar
de siempre: el lápiz vive en el texto, y si no hay texto no hay dónde ponerlo.

**El editor se maximiza.** El último botón de la barra lo lleva a pantalla
completa, con su barra arriba y los botones de guardar y cancelar abajo, para
escribir a gusto. `Esc` devuelve el tamaño normal (no cierra el diálogo, que
sería perder lo escrito).

---

## 18c. Tags desde el propio detalle

En una carpeta y en la ficha de un bookmark se ven sus tags, y con **+ Añadir
tag** se editan ahí mismo: el mismo buscador de siempre, que completa los que
ya tienes y crea uno nuevo al pulsar Enter si el nombre no existe.

Se guarda solo, sin botón de confirmar, igual que la estrella de favorito que
tiene al lado. Y guarda **solo la lista de tags**, así que no toca nada más de
la carpeta o del bookmark.

---

## 19. Almacenamiento y cuotas

En **Ajustes → Almacenamiento** ves cuánto ocupan tus datos en el servidor,
desglosado por lo que de verdad lo causa: instantáneas de páginas, imágenes de
fondo, iconos, fondos de paneles y las filas cifradas de la base de datos. El
desglose importa porque la respuesta a "¿por qué ocupo 4 GB?" casi siempre es
"las instantáneas", y un número suelto no te dice qué borrar.

Si eres administrador, la misma pantalla añade una tabla con el consumo de cada
cuenta, ordenada de mayor a menor, un **límite por defecto** para toda la
instancia y un límite propio para cada usuario. Puedes ponerte límite a ti
mismo: el administrador no está exento.

Los tamaños se escriben como `500MB`, `2GB` o `1,5 GB`. Un número suelto se
entiende en MB. Dejar el campo vacío significa "sin límite": en la tabla de
usuarios, vacío quiere decir que se hereda el límite por defecto.

Al llegar al límite:

- **No** se guardan instantáneas ni imágenes nuevas. La subida se rechaza y la
  captura de una página se marca como error, sin reintentarlo en bucle.
- **Sí** puedes seguir leyendo, editando, moviendo y borrando. Sería absurdo
  bloquear justo lo que necesitas para liberar espacio.

Para bajar el consumo: borra bookmarks que ya no uses y **vacía la papelera**
(mientras están en la papelera siguen ocupando, porque siguen ahí). El número
se recalcula solo cada pocos minutos; el botón de refrescar lo fuerza.

---

## 20. Sesiones activas

En **Ajustes → Seguridad** ves dónde está abierta tu cuenta: navegador,
sistema, tipo de dispositivo, IP, cuándo empezó la sesión y cuándo se vio por
última vez. La que estás usando aparece marcada.

Puedes cerrar una concreta o todas las demás de golpe. Cerrar una sesión hace
que su cookie deje de valer en la **siguiente petición**, aunque no haya
caducado: no es solo olvidarla en aquel dispositivo. Si ves algo que no
reconoces, ciérralo y cambia la contraseña.

---

## 21. Registro de seguridad

Si eres administrador, **Ajustes → Seguridad** (pestaña propia) muestra qué ha
pasado en la instancia: inicios de sesión correctos y fallidos, 2FA, sesiones
revocadas, rechazos 401/403/429, errores del servidor y visitas a los paneles y
shares que hayas publicado.

Arriba hay contadores de la ventana elegida (1 h, 24 h, 7 o 30 días), la
actividad por hora y las IPs con más rechazos, que puedes pulsar para filtrar
por ellas. Debajo, la tabla con filtros por tipo, usuario o email, IP, ruta,
estado y un interruptor de "solo sospechosos".

**No se registra el tráfico correcto (2xx).** Es deliberado: un gestor de
marcadores genera miles de peticiones normales al día y meterlas ahí enterraría
las pocas líneas que de verdad quieres ver. La retención es configurable, 90
días por defecto.

---

## 22. Texto copiable y texto oculto

En el editor de descripciones hay dos marcas nuevas, pensadas para lo que
realmente se escribe en esas notas:

- **Texto copiable**: se ve subrayado a trazos. Al pulsarlo, su contenido va al
  portapapeles y parpadea en verde.
- **Texto oculto**: sale borroso. El primer clic lo revela y el segundo lo
  copia. En ese orden a propósito: copiar algo que aún no has visto sería una
  sorpresa desagradable.

Selecciona el texto y usa los botones del portapapeles y del ojo tachado en la
barra del editor. Funcionan igual en las descripciones de carpetas y bookmarks,
y en lo que compartes.

Dentro del editor el texto oculto solo se atenúa, nunca se difumina: no puedes
dar formato a algo que no ves.

---

## 23. Copias en la nube

Conviene tener claro qué es y qué no es esta función, porque el nombre engaña.

Una conexión cloud es una **copia de seguridad**, no un sitio donde vivan tus
datos. Tus carpetas y bookmarks siguen en el servidor; lo que se sube es un ZIP
con todo cifrado. Por eso el espacio sigue contando para tu cuota: la copia es
*adicional*, no *en lugar de*.

Cada usuario tiene sus propias conexiones, y las credenciales se cifran con tu
clave, así que nadie más puede leerlas.

**Certificados de un NAS.** Un Synology (o cualquier servidor de tu red) suele
presentar un certificado autofirmado, y además emitido para un nombre distinto
de la IP por la que entras, así que la conexión falla. Cuando pasa, la
aplicación te ofrece **ver el certificado**: te muestra para quién está
emitido, por quién, hasta cuándo vale y su huella SHA-256. Puedes compararla
con la que aparece en tu NAS (Panel de control → Seguridad → Certificado) y
aceptarla.

A partir de ese momento **solo se admite ese certificado exacto**. No es
"aceptar cualquiera": si mañana otro equipo de la red intenta hacerse pasar por
tu NAS, la conexión se rechaza igual, porque su huella no coincide. Es el mismo
modelo que usa SSH. Si renuevas el certificado del NAS tendrás que aceptarlo de
nuevo, y ese aviso es deliberado.

En **Ajustes → Cloud**, cada destino tiene ahora **Ver copias**, que lista los
archivos que hay en él con su fecha y tamaño. Desde ahí puedes:

- **Restaurar** una copia en el servidor. Es una restauración **por fusión**:
  añade y actualiza lo que había en la copia, y **no borra** lo que hayas
  creado después. Si quieres un reemplazo limpio, borra antes y restaura luego.
  Va en segundo plano, así que puedes seguirla en los logs.
- **Copiar a…** otro destino, sin que los bytes pasen por el navegador.
- Marcar un destino como **predeterminado**, que es el que la interfaz propone.

Una copia solo se puede restaurar en la cuenta que la hizo: las filas van
selladas con tu clave.

---

## 24. Copiar una selección como lista

Marca varias carpetas o bookmarks con sus casillas y en la barra de selección
aparece **Copiar lista**. Copia todo al portapapeles como una lista jerárquica
con el título y la URL de cada enlace, incluyendo los bookmarks que haya dentro
de las subcarpetas, en árbol:

```
- **Cocina**
  - **Postres**
    - [Tarta de queso](https://tarta.example/)
  - [Pan de masa madre](https://pan.example/)
- [Suelto](https://suelto.example/)
```

Se copia en dos formatos a la vez, así que pega bien en los dos sitios para los
que sirve: en un chat aparece ese texto (y en Slack, Discord o GitHub se
convierte en una lista de verdad), y en un correo o un documento pega como una
lista anidada con los enlaces ya pinchables.

Si marcas una carpeta y además algo que está dentro de ella, no sale dos veces:
la carpeta ya lo incluye.

---

## 25. Exportar e importar en el formato de la app

La exportación a HTML sirve para llevarte los enlaces a un navegador, pero
pierde casi todo lo demás: tags, descripciones, colores, iconos y favoritos no
existen en ese formato.

Para eso está el **archivo `.abz`**, el formato propio de la aplicación. En el
menú de una carpeta tienes **Exportar (formato de la app)** y también
**Importar archivo aquí**; en la ficha de un bookmark, el menú tiene la misma
opción de exportar para ese enlace suelto.

Al exportar se abre un diálogo con las dos decisiones que no se pueden tomar
por ti:

- **Incluir copias archivadas de las páginas.** Desactivado por defecto: son la
  mayor parte del tamaño del archivo.
- **Contraseña.** Si la pones, el contenido viaja cifrado y hará falta esa misma
  contraseña para importarlo. Se pide dos veces porque no hay forma de
  recuperarla: una errata no falla, produce un archivo que no abre nadie.

Qué lo distingue de una copia en la nube:

- Una **copia en la nube** va cifrada con tu clave. Solo se restaura en tu misma
  cuenta, y reemplaza por identificador.
- Un **archivo `.abz`** va descifrado, o con la contraseña que le pongas, así
  que se puede importar en otra carpeta, en otra cuenta o en otro servidor.

Al importar se crean **copias nuevas**, no se sobrescribe nada: los elementos
reciben identificadores nuevos y los tags se emparejan **por nombre**, creando
los que falten. Si importas el mismo archivo dos veces tendrás dos copias, que
es lo esperable, en vez de un reemplazo silencioso.

Sin contraseña el archivo lleva tus datos en claro, así que trátalo como
tratarías la exportación de un gestor de contraseñas. El diálogo te lo avisa
mientras el campo esté vacío.

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
