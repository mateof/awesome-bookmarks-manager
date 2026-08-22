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
26. [Ficheros adjuntos](#26-ficheros-adjuntos)
27. [Referencias dentro del texto](#27-referencias-dentro-del-texto)
28. [Bases de datos en las notas](#28-bases-de-datos-en-las-notas)

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

**Al entrar verás una barra de progreso** mientras se descifra tu contenido.
Descifrar es trabajo real, y cuanto más tengas guardado más tarda la primera
carga de la sesión; después ya está en memoria y no vuelve a salir hasta que
cierres sesión. La barra avanza por pasos terminados de verdad (carpetas,
marcadores, papelera…), no con una animación, así que si se queda parada en un
punto es que ahí hay algo esperando.

Lo que ves siempre es de la sesión abierta: al cerrar sesión se descarta todo
lo cargado, de modo que si entra otra persona en el mismo navegador no llega a
ver nada de la anterior.

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

**Ahora la carpeta compartida es la misma carpeta, no una copia.** Al
compartirla, ella y todo lo que hay dentro pasan a estar cifrados con la clave
del grupo, que tiene cada miembro. Eso quiere decir que a quien la recibe le
aparece en su propio menú lateral como una carpeta más (marcada como del
grupo), y trabaja con ella exactamente igual que el dueño: los mismos botones,
los mismos diálogos, los mismos atajos.

Y lo que cambia es que **ya no hay espera**. Antes, lo que editaba un miembro
se guardaba en la copia del grupo y se quedaba en una cola hasta que el dueño
volvía a entrar. Ahora no hay copia que reconciliar: la edición *es* el dato, y
el dueño la ve al momento.

**Cinco niveles de permiso**, cada uno con todo lo del anterior:

| Nivel | Puede |
| --- | --- |
| **Ver** | leer |
| **Editor** | y además cambiar el contenido |
| **Admin** | y además dar y quitar permisos de ver y editor |
| **Super** | y además dar y quitar permisos de admin y super |
| **Propietario** | y además nadie puede quitárselo a él |

La regla que lo sostiene: solo puedes actuar sobre alguien **estrictamente por
debajo** de ti, y nunca dar tu propio nivel. Sin eso, dos admins podrían
expulsarse mutuamente.

**Se cambia desde la lista de miembros del grupo**, con un desplegable en cada
persona. Solo salen los niveles que tú puedes conceder, así que la interfaz no
te ofrece algo que el servidor vaya a rechazar.

**Al compartir ya no se pregunta el permiso.** Antes había que elegir "solo
lectura" o "puede editar" en cada compartición, y eso convivía con el permiso
que cada persona ya tenía en el grupo: dos respuestas a la misma pregunta, que
podían contradecirse. Manda el permiso del grupo.

La contrapartida, dicha claramente: **el grupo es la unidad de acceso**. Si
quieres que las mismas personas vean una carpeta y editen otra, hazlo con dos
grupos.

**Se puede compartir con varios grupos a la vez**, marcando todos los que
quieras en el mismo diálogo. El contenido no se duplica: se cifra una vez y a
cada grupo se le entrega la llave, así que añadir un grupo más es inmediato por
grande que sea la carpeta.

Conviene saber dónde acaba el cifrado: tener la clave del grupo te deja
**descifrar**. Que puedas escribir o no, y que puedas dar permisos o no, lo
decide el servidor, no la clave. La única frontera que dibuja la criptografía
es leer o no leer.

**Al expulsar a alguien, la clave se cambia sola** y se reparte de nuevo a los
que quedan, y el contenido se vuelve a cifrar con la nueva. Con un límite que
conviene decir claro: **eso protege lo que venga después**. Quien salió tuvo la
clave vieja y pudo copiarse lo que ya veía; ningún sistema puede deshacer eso.

Cambiar a alguien de nivel (por ejemplo de editor a ver) **no** cambia la
clave, porque ya podía leer: cambiaría mucho trabajo para no ganar nada.

**Con permiso de edición se puede trabajar dentro, y se ve igual que lo tuyo.**
La carpeta compartida se dibuja con la **misma rejilla** que las tuyas: los
mismos cinco modos de vista, las mismas tarjetas con su fondo, su icono y sus
tags, y el mismo menú de tres puntos. Desde ahí se puede **crear** subcarpetas y
bookmarks, **editar** el nombre y el texto, **mover** dentro del compartido,
poner **tags**, cambiar el **color** y **eliminar**.

**Los bookmarks compartidos tienen su ficha**, como los tuyos: al pinchar el
título se abre la misma página de detalle, con su banner, la estrella, el botón
de abrir, la URL con su copiado, los tags editables ahí mismo y el texto con su
lápiz. Lo único que no aparece es lo que un compartido no tiene: la copia
archivada de la página, el historial y la exportación.

Editar dentro del compartido usa **los mismos diálogos que tus carpetas**, no
versiones recortadas. *Editar* abre el formulario completo: nombre, el selector
de iconos con su **biblioteca, emojis, subida y descarga del favicon**, la
descripción con texto enriquecido, los tags y el selector de fondo con sus
modos de color e imagen. *Apariencia* abre el mismo diálogo de apariencia que
en las tuyas, con el tono del texto y su medida de contraste. La carpeta en la
que estás tiene su propia barra con ambos.

Las imágenes van al almacén del compartido cifradas con la clave del grupo, así
que el grupo las ve al momento, y se recifran con la clave del dueño cuando la
escritura llega a su carpeta.

**El compartido se despliega en el menú lateral** como cualquier carpeta tuya:
al pinchar una subcarpeta te lleva a ella dentro del compartido, y la rama en la
que estás se abre y se resalta sola.

También se puede **marcar como favorito** y **reordenar arrastrando**, igual que
en las tuyas. Dos matices que conviene tener claros:

- La estrella es **compartida**, no privada: al marcar algo lo ve marcado todo
  el grupo, y acaba marcado en la carpeta del dueño. No aparece en *tu* barra
  de Favoritos, porque esa barra lista tus propias carpetas y bookmarks, y un
  elemento compartido no es una fila de tu cuenta.
- El **orden viaja en la copia compartida**: al soltar, el compartido guarda el
  orden completo de esa carpeta, y cuando llega al dueño se renumeran sus
  elementos para que quede exactamente como lo dejaste.

Eso ocurre en dos tiempos, y conviene saberlo:

- **El grupo lo ve al momento.** El cambio entra en la copia compartida, que va
  cifrada con la clave del grupo, así que cualquiera que abra el compartido lo
  ve enseguida.
- **La carpeta original lo recibe cuando su dueño vuelva a entrar.** Tus
  carpetas están cifradas con *tu* clave y nadie más la tiene, ni el servidor
  mientras tú no estés. El cambio queda en cola y se aplica solo, sin que tengas
  que hacer nada, la próxima vez que inicies sesión.

Lo que se crea conserva su identidad en los dos sitios, así que cuando llega a
tu carpeta no aparece como una copia nueva: es el mismo elemento que el grupo
lleva viendo desde el principio.

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

**El buscador del panel abre la rama.** Como estas plantillas no navegan, al
elegir una carpeta en el buscador no se cambia de página: se despliega la rama
que lleva hasta ella y se trae a la vista. En Órbita, donde el anillo enseña un
nivel cada vez, se coloca en el nivel que la contiene y la carpeta queda en el
anillo. El enlace resultante sirve para compartir esa rama concreta o para
volver a ella al recargar.

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

El texto tiene un **tope de altura y scroll dentro** de ese tope, así que por
larga que sea la nota los bookmarks quedan siempre a la vista. La excepción son
las notas con una base de datos dentro: ahí no se recorta, porque una tabla
metida en un recuadro de unos centímetros enseña la cabecera y esconde todas
las filas. La tabla trae su propio tope. Un botón de
**Ver completa** la abre entera en una ventana a pantalla completa, cómoda para
leer.

Los controles solo aparecen si el texto de verdad no cabe: una nota de dos
líneas no gana botones que no hacen nada. La medida es de altura real, no de número de
caracteres, porque una imagen o una tabla ocupan mucho más de lo que su
longitud sugiere.

**Tres botones al guardar.** *Guardar* guarda y deja el editor abierto, para
ir salvando mientras escribes algo largo; *Guardar y cerrar* hace las dos
cosas; *Cancelar* sale sin guardar. Tras un *Guardar* aparece un "Guardado"
durante un momento, para que se note que el botón hizo algo.

**En el móvil, la barra sale encima del teclado.** En pantalla estrecha, en
cuanto el texto toma el foco, aparece abajo una barra pegada al teclado con lo
que más se usa (negrita, cursiva, subrayado, lista, deshacer y rehacer) y un
botón **+** que despliega el resto de acciones en una cuadrícula: encabezados,
cita, separador, color, tipo de letra, imagen, enlace y las dos referencias.
La barra desaparece al soltar el foco.

**El editor tiene más herramientas.** Además de negrita, listas y demás:
títulos en tres tamaños, subrayado, separador de sección, **color de texto**
(paleta fija), **tipo de letra** (normal, sans, serif y mono) e **imágenes**,
que se pueden pegar desde el portapapeles, arrastrar o elegir con el botón.

Las imágenes viajan **dentro de la propia nota**, reducidas si hace falta: van
cifradas con el resto del texto, salen en el export `.abz` y llegan a las
carpetas compartidas sin ninguna tubería nueva. El límite práctico es el de la
nota (1 MB), así que caben unas pocas capturas por descripción, no un álbum.

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

## 26. Ficheros adjuntos

Tanto una carpeta como un bookmark pueden llevar **ficheros adjuntos**: el
contrato en PDF junto al enlace del proveedor, la hoja de cálculo al lado de
la carpeta del proyecto. La sección **Adjuntos** aparece en la ficha, debajo
de la descripción, con el botón *Adjuntar*. Se pueden subir varios de una vez.

Al elegir un fichero se abre una ficha antes de subirlo, con tres campos:

- **Nombre**, que empieza siendo el del fichero y puedes cambiar.
- **Slug**, que se propone solo a partir del nombre (`Acta Marzo.pdf` →
  `acta-marzo`). Es la clave con la que lo referencias desde cualquier nota, y
  es **única en tu cuenta**: si escribes uno que ya existe te lo dice en vez de
  cambiártelo por otro sin avisar, porque si no la referencia que ibas a
  escribir apuntaría a otra cosa. Si no tocas nada y el propuesto está cogido,
  se usa el siguiente libre (`acta-marzo-2`).
- **Descripción**, para recordar qué es ese fichero.

Los tres se pueden cambiar después con el lápiz de cada fila.

Cada fichero se lista con su nombre, su slug, su tamaño y su descripción, con
botones para copiar la referencia, descargarlo, editarlo y borrarlo. Si es una
imagen, se muestra una miniatura y al pulsarla se ve a pantalla completa.

**No es lo mismo que pegar una imagen en la descripción.** Una imagen pegada
forma parte del texto y va dentro de la nota, con su límite; un adjunto es un
fichero aparte, con su propio espacio y su descarga. Para una captura que
ilustra lo que estás contando, pégala en el texto. Para un documento que
querrás abrir tal cual, adjúntalo.

Lo que conviene saber:

- **Van cifrados como todo lo demás**, con tu clave. El servidor no puede
  abrirlos, y tampoco sabe cómo se llaman: el nombre y el tipo de fichero van
  cifrados también. Lo único visible desde fuera es cuánto ocupan, que es
  inevitable.
- **Máximo 25 MB por fichero.** El cifrado se hace sobre el fichero entero en
  memoria, así que el tope es tanto una cuestión de recursos como de política.
  Caben documentos, hojas de cálculo o imágenes; no un vídeo largo.
- **Cuentan en tu cuota**, y aparecen con su propia franja en *Almacenamiento*,
  así que siempre se ve cuánto se llevan.
- **No ralentizan la navegación.** La lista de ficheros se pide solo al abrir
  una ficha; recorrer carpetas y ver bookmarks no consulta nada de esto.
- **Viajan en el export `.abz`**, así que una exportación no pierde los
  documentos por el camino. Al importar se vuelven a cifrar con la clave de
  quien importa.
- **Se van con su dueño.** Al borrar definitivamente la carpeta o el bookmark
  desde la papelera, sus adjuntos se borran también y el espacio se libera.

Lo que **todavía no hacen**: no viajan a las carpetas compartidas con un grupo.
Quien abra un compartido verá el texto y los enlaces, pero no los ficheros
adjuntos del dueño.

---

## 27. Referencias dentro del texto

Dentro de la descripción de cualquier carpeta o bookmark puedes **referenciar**
otras cosas de tu cuenta: otra carpeta, otro bookmark o un fichero adjunto.
Aparecen como una pastilla, no como un enlace suelto, porque no llevan a una
URL cualquiera sino a algo tuyo.

**Cómo se insertan.** Escribiendo **`@`** se abre el buscador de carpetas y
bookmarks; escribiendo **`#`**, el de ficheros adjuntos, que busca por slug o
por nombre. El carácter no se queda escrito: solo abre el buscador. También
hay dos botones en la barra del editor, que es lo cómodo en el móvil.

El buscador se maneja entero con el teclado: escribes, te mueves con las
flechas y eliges con Enter.

**Qué hacen al pulsarlas.**

- **Un bookmark** tiene dos destinos, y por eso tiene dos zonas. El **texto**
  abre su ficha dentro de la aplicación; la **flecha ↗** abre su URL en una
  pestaña nueva.
- **Una carpeta** te lleva a esa carpeta.
- **Un adjunto** descarga el fichero.

**Al pasar el ratón** sale una tarjeta con lo que apunta arriba (la URL si es
un bookmark, el `#slug` si es un adjunto) y su descripción abajo, así que sabes
a dónde vas sin ir.

Dos detalles que evitan sorpresas:

- La pastilla enseña el **nombre actual** de lo que apunta, no el que tenía
  cuando la insertaste. Si renombras el bookmark, la referencia se entera.
- Si lo referenciado **ya no existe**, la pastilla se ve tachada y en rojo en
  vez de fingir que sigue ahí.

Los adjuntos se referencian **por slug** y no por identificador a propósito: si
sustituyes el fichero por una versión nueva con el mismo slug, todas las notas
que lo mencionan siguen funcionando.

---

## 28. Bases de datos en las notas

Dentro de la descripción de cualquier carpeta o bookmark puedes meter una
**base de datos**: una tabla con columnas con tipo, como la de Notion o SiYuan.
Se inserta con el botón de base de datos de la barra del editor (o desde el
**+** en el móvil).

**Nueva, o una que ya tengas.** Al pulsar el botón te pregunta: crear una
nueva, o **usar una que ya exista**. Lo segundo es lo más frecuente: la tabla
de proveedores vive en la carpeta de proveedores *y* en las notas de este
trimestre, y tiene que ser la misma tabla o las dos copias se separan en una
semana. Insertarla no duplica nada.

**Puedes poner solo una vista.** Al elegir una tabla existente te pregunta qué
vista quieres: la tabla entera con sus pestañas, o una sola. Si fijas una, esa
nota enseña solo esa y sin pestañas, que suele ser lo que se quiere de una
tabla metida en un texto. Se cambia después desde la tarjeta del editor.

**Y puedes crear una vista solo para esa nota.** En el menú de añadir vista,
dentro de una nota, hay una opción de *nueva vista solo para esta nota*. Sirve
para cuando la misma tabla está en varios sitios y cada uno la quiere mirar a
su manera: la nota del trimestre la quiere en tablero por estado, la de
proveedores en tabla filtrada. Esa vista no aparece ni en la página de la base
de datos ni donde esa tabla esté embebida en otras notas.

**Se mueve dentro de la nota.** En el editor, la tarjeta de la tabla tiene un
asa a la izquierda para **arrastrarla** a donde quieras, y dos flechas para
**subirla o bajarla** un sitio. Las flechas están porque arrastrar un bloque
dentro de un texto es incómodo en el móvil e imposible con el teclado. Deshacer
revierte el movimiento de una vez.

**Se inserta en el editor y se rellena en la ficha.** En el editor verás una
tarjeta con el nombre de la tabla y cuántas filas tiene (y desde ahí puedes
cambiarle el nombre), no la rejilla. Es a propósito: en esta
aplicación la descripción se *edita* en un diálogo y se *lee* en la página de
la carpeta o del bookmark, así que la rejilla con la que se trabaja de verdad
está donde lees. Editar un texto y editar trescientas celdas son dos trabajos
distintos y meterlos en el mismo modal no sirve a ninguno.

Una tabla nueva ya viene utilizable: columna de **Título**, columna de
**Estado** con tres opciones, una vista de tabla y tres filas vacías.

**Tipos de columna.** Texto, número, casilla, fecha, selección, selección
múltiple, URL y **referencia**, que apunta a un bookmark o una carpeta tuyos y
se ve como la pastilla de siempre, con su enlace para abrir la web.

El tipo de una columna no se puede cambiar después. Habría que decidir en qué
se convierte una fecha al volverse casilla, y toda respuesta a eso o es
incorrecta o te borra datos sin avisar. Si te equivocaste, crea otra columna.

**Tres vistas sobre las mismas filas.**

- **Tabla**, con las filas reordenables arrastrando.
- **Tablero** tipo kanban, agrupando por una columna de selección. Arrastrar
  una tarjeta de carril a carril cambia esa columna en esa fila, ni más ni
  menos. Siempre hay un carril de *sin asignar* para las filas que no tienen
  valor, para que no desaparezcan.
- **Galería**, las mismas tarjetas sin carriles.

Una vista es **otra forma de ver las mismas filas**, no otra tabla: si quieres
una tabla distinta, inserta otra base de datos. Para cambiarle el nombre a una
vista, pulsa en su pestaña estando ya en ella.

Cada vista guarda sus **filtros**, su **orden**, qué columnas enseña y por qué
agrupa. Y guarda solo eso: filtrar no borra filas y ordenar no cambia el orden
guardado, así que dos vistas de la misma tabla pueden enseñar cosas distintas
sin mentir ninguna.

**Se comparten con el botón de compartir** de la propia tabla, tanto desde la
nota como desde la página de *Bases de datos*, y con uno o varios grupos.

**Se comparten por separado.** Una base de datos es una entidad propia, no
parte de la nota que la contiene: la misma tabla puede estar embebida en varias
carpetas y bookmarks, y esos no tienen por qué estar compartidos con la misma
gente. Por eso tiene sus propios permisos, y compartir una nota no comparte
automáticamente todas las tablas que menciona (aunque compartir una carpeta sí
arrastra las que sus notas embeben, o llegarían con un agujero).

**Dónde están todas.** En el menú lateral, en *Bases de datos*. Ahí aparecen
también las que insertaste en una nota, así que si borras la nota la tabla
sigue estando (y se puede borrar de verdad desde ahí, que es la forma de
recuperar el espacio).

Lo que conviene saber:

- **Van cifradas como todo**: el nombre, los nombres de las columnas, sus
  opciones y el contenido de cada fila.
- **El filtrado se hace en memoria**, después de descifrar, porque el servidor
  no puede comparar texto cifrado. Es lo mismo que ya hacía el buscador. La
  consecuencia honesta es un tope de unos **5000 registros** por tabla: de
  sobra para notas y proyectos, insuficiente para un almacén de datos. La
  aplicación te lo dice si llegas.
- **Viaja en el export `.abz`** con sus filas dentro, y al importar las notas
  se reapuntan a la copia.
- **En un panel público o en una carpeta compartida se ve como tabla estática**
  con los datos del momento en que se generó la copia. Quien la lee no tiene tu
  sesión, así que no puede consultar la tabla viva; se le da el contenido en
  vez de una caja vacía. Las columnas ocultas siguen ocultas y las referencias
  no se enseñan, porque apuntan a cosas tuyas que esa persona no puede abrir.

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
