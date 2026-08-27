# El editor de notas, y qué se ha traído de SiYuan

Este documento es dos cosas: el **informe** de qué tiene el editor de
[SiYuan](https://b3log.org/siyuan/) frente al nuestro, y la **documentación**
de lo que se implementó a partir de ese análisis (v1.2.0).

Se escribe aquí y no en el README porque la mayor parte son decisiones, no
funciones: qué se copió, qué se copió *distinto* y qué se decidió no copiar,
con el motivo en cada caso.

## De un vistazo

| Función de SiYuan | Antes | Ahora | Nota |
|---|---|---|---|
| Negrita, cursiva, tachado, código en línea | ✅ | ✅ | |
| Subrayado | ✅ | ✅ | con color propio (v0.93.0) |
| Resaltador | ✅ | ✅ | colores translúcidos (v0.93.0) |
| Color de texto | ✅ | ✅ | |
| Superíndice y subíndice | ❌ | ✅ | |
| `<kbd>` (tecla) | ❌ | ✅ | |
| Quitar formato | ❌ | ✅ | solo marcas, no bloques |
| Alineación de párrafo | ❌ | ✅ | |
| Títulos | ✅ (6) | ✅ (3) | ver *Lo que no se copió* |
| Listas y numeradas | ✅ | ✅ | |
| **Listas de tareas** | ✅ | ✅ | se marcan también desde la nota |
| Cita | ✅ | ✅ | |
| **Bloque de código con resaltado** | ✅ | ✅ | 33 lenguajes, botón de copiar |
| **Tablas** | ✅ | ✅ | además de las bases de datos embebidas |
| **Fórmulas (KaTeX)** | ✅ | ✅ | en línea y en bloque |
| **Diagramas (Mermaid)** | ✅ | ✅ | |
| **Avisos destacados (callouts)** | ~ | ✅ | ver la nota de abajo |
| Separador | ✅ | ✅ | |
| Imágenes pegadas o arrastradas | ✅ | ✅ | |
| **Menú `/`** | ✅ | ✅ | |
| **Emoji con `:`** | ✅ | ✅ | 565, por pestañas, con recientes |
| **Buscar y reemplazar en el documento** | ✅ | ✅ | |
| **Recuento de palabras** | ✅ | ✅ | |
| Atajos de Markdown al escribir | ✅ | ✅ | ya venían de TipTap |
| Referencias entre documentos | ✅ | ✅ | `@` a carpetas, bookmarks y **filas** |
| Bases de datos embebidas | ✅ | ✅ | ver [databases](../README.md) |
| Texto copiable de un clic | ❌ | ✅ | nuestro, no de SiYuan |
| Texto oculto hasta pulsar | ❌ | ✅ | nuestro, no de SiYuan |
| Bloques plegables por título | ✅ | ❌ | ver abajo |
| Superbloques (columnas) | ✅ | ❌ | ver abajo |
| PlantUML, Graphviz, ABC, ECharts | ✅ | ❌ | ver abajo |
| Widgets (iframes de terceros) | ✅ | ❌ | ver abajo |

## Lo que se copió, y cómo

### Listas de tareas

Se marcan **desde la nota**, sin abrir el editor. Una lista de tareas que solo
se puede marcar entrando a editar es media función: marcar es lo más barato que
se hace con una lista, y tener que abrir un diálogo para ello la convierte en
decoración.

La casilla **no es un `<input>`** en el HTML guardado. El tick es un atributo
(`data-checked`) y la caja se dibuja en CSS. Permitir controles de formulario
en texto que llega desde una compartición es una puerta que esta app no tiene
motivo para abrir, y el aspecto es idéntico.

### Bloques de código

Resaltado con `lowlight`, selector de lenguaje en la barra de estado (donde
está el recuento) y botón de copiar en la esquina del bloque. El botón se
construye al renderizar, no se guarda: es cromo, y lo que se cifra y se
comparte es contenido.

Los lenguajes se cargan **bajo demanda**. El juego común de gramáticas son unos
600 KB; con ellas dentro, el script principal engordaba un 40% para todo el
mundo, incluida la mayoría de páginas que nunca abren un editor.

### Fórmulas y diagramas

Se guarda el **origen** (LaTeX, sintaxis Mermaid) y se dibuja al leer. Es la
única disposición que encaja con la forma de esta app: el HTML pasa por un
saneador de ida y vuelta y se renderiza en cuatro sitios (el editor, la ficha,
un panel público, la copia de un grupo). Guardar la salida de KaTeX sería meter
un muro de spans anidados en un campo cifrado, en cada copia, para siempre.

**El origen va en el texto del elemento, no en un atributo.** Esto no es
estética: DOMPurify borra cualquier atributo cuyo valor contenga `-->`, porque
esa secuencia cierra un comentario HTML y es un vector de mXSS conocido. `-->`
es, literalmente, la flecha de Mermaid. La primera versión guardaba el origen
en `data-mermaid` y **todos** los diagramas con una flecha perdían su origen al
entrar en la página: el elemento sobrevivía, la clase también, y parecía un
fallo de renderizado. El atributo es ahora solo una marca con valor fijo.

Efecto secundario bueno: una nota leída por algo que no sabe nada de fórmulas
sigue mostrando `E = mc^2`, que es exactamente lo que alguien escribió.

KaTeX (258 KB) y Mermaid (666 KB más sus diagramas) se cargan **solo si la nota
los usa**. El SVG que genera Mermaid se sanea antes de insertarlo: Mermaid no
es hostil, pero es un compilador de texto de usuario a marcado, y marcado
construido con texto de usuario es justo lo que esta app sanea en todas partes.

### El menú `/`

Escribe `/` al principio de una palabra y filtra con lo que sigas escribiendo.
Elegir borra el `/` y el filtro en la misma transacción que la inserción, así
que un solo deshacer devuelve exactamente lo que había.

Un `/` en medio de una palabra es un `/`: "y/o" no abre nada.

### Buscar y reemplazar

**Escribir en la caja no mueve el foco.** La primera versión seleccionaba cada
coincidencia en el editor y llamaba a `focus()` para que se viera, así que a
las dos o tres letras el cursor saltaba del buscador al texto y la búsqueda se
quedaba con media palabra. Las coincidencias se pintan ahora con una
*decoración* de ProseMirror (`lib/editorFind.ts`): se dibujan encima del
documento sin formar parte de él, así que ni la selección ni el foco se mueven
y el resaltado se ve aunque el editor no esté enfocado, que es el estado normal
mientras se teclea una consulta.

Reemplazar sí toca el documento, porque es una edición. Trabaja sobre las
posiciones del documento, no sobre el DOM renderizado. Eso es
lo que hace seguro reemplazar: una coincidencia encontrada recorriendo HTML
reescribiría alegremente el interior de un chip de referencia o el origen de
una fórmula. "Reemplazar todo" va **del final hacia atrás**, porque reemplazar
hacia delante invalida todas las posiciones siguientes en cuanto el texto nuevo
mide distinto que el viejo.

### El selector de emoji

565 emoji en ocho categorías con pestañas, más una pestaña de **recientes** que
es de verdad: los últimos que se usaron en este navegador, no una lista fija de
"frecuentes" que es una suposición sobre las costumbres de otro.

**La búsqueda ignora las pestañas.** Buscar solo dentro de la categoría abierta
sería peor que no buscar: se escribe "casa" precisamente porque no se sabe en
qué cajón está. Las palabras clave son en español y sin acentos, y la búsqueda
también quita los acentos de lo que se teclea, para que "arbol" y "árbol"
encuentren lo mismo sin escribir cada palabra dos veces.

Dentro del popover, **solo la rejilla hace scroll**. Dos zonas de scroll
anidadas no son una redundancia sino algo que se nota: la rejilla llega al
final, la rueda sigue empujando el contenedor de fuera y el buscador se va de
la vista por debajo de la barra de la que cuelga el panel. El popover admite
ahora que un hijo se encargue de su propio scroll (`scrollable={false}`) y
todos los listados llevan `overscroll-contain`, que corta el encadenado.

Sigue siendo un catálogo escrito a mano y no todo Unicode. Las mil quinientas
entradas completas vienen con palabras clave en inglés que habría que traducir
para que sirvieran de algo, y un selector donde "casa" no encuentra la casa es
peor que uno más corto donde sí.

### Avisos destacados (callouts)

Cinco tipos: nota, información, consejo, aviso y peligro. Se envuelve la
selección y, estando dentro de uno, elegir otro tipo **cambia** el que hay en
vez de anidar una caja dentro de otra.

Una corrección al informe original, que los omitió sin decirlo: SiYuan **no
lleva callouts de serie**. Se consiguen con atributos de bloque y CSS del tema,
y quien los da por hechos suele venir de Obsidian, donde sí son un bloque de
primera clase. Aquí son de primera clase, como en Obsidian, porque el
equivalente por temas obliga a que cada usuario se pinte su propio CSS.

El tipo se guarda como **palabra** (`data-callout="warning"`), no como color.
Un callout guardado como "el verde" no lo puede reestilar un tema, no lo puede
leer un lector de pantalla y no significa nada en una copia que aterrice en
otra paleta; la palabra sobrevive a las tres cosas. La marca visual es un
emoji puesto desde CSS, que además no hay que traducir.

El contenido es `block+` y no un párrafo: lo que la gente mete en un aviso es
una frase **y** la lista de qué hacer al respecto, y una caja de una sola línea
deja esa lista fuera del recuadro al que pertenece.

### Leer una nota larga

La vista completa lleva su propio buscador y se pone a pantalla completa. El
buscador del navegador no sirve aquí: la nota vive en un diálogo que hace
scroll por su cuenta, así que Ctrl+F desplaza la página de detrás, y en un
móvil no hay Ctrl+F. El resaltado se hace envolviendo el texto en `<mark>`
sobre el DOM ya renderizado (`lib/findInDom.ts`), y se deshace al cerrar la
barra: una nota que se quedara pintada de amarillo sería una nota que una
búsqueda ha editado.

No toca dos cosas a propósito: lo que KaTeX y Mermaid han dibujado (envolver
medio `<mspace>` en un `<mark>` rompe el dibujo por una coincidencia que nadie
buscaba) y el HTML guardado.

### Salir sin guardar

Cerrar el diálogo de edición con texto sin guardar pregunta con el diálogo de
la aplicación. Recargar o cerrar la pestaña **no puede** preguntar con el
nuestro: los navegadores quitaron hace años la posibilidad de poner texto o
diálogos propios ahí, y lo único que una página puede hacer es declarar que hay
trabajo sin guardar para que el navegador dibuje su propia caja. Renunciar a
ella por no ser nuestra sería perder la nota, así que está puesta también.

### Tablas en una copia compartida

El modal de un panel inserta el HTML de la nota en una hoja con su propio tema,
que no es la página de la app y no recibe ninguna de sus clases de tipografía.
Las tablas llegaban por tanto con los valores por defecto del navegador: sin
líneas entre celdas, sin margen interior, y con una celda larga convertida en
una cinta vertical de una palabra de ancho mientras el resto de la fila quedaba
vacío. Se leía bien en la app y mal en la copia que ven los demás, que es el
peor sitio para una diferencia así.

Ahora el cuerpo del modal lleva la clase `ab-rich` y hay una hoja de estilos
para el contenido de una nota que se lee, con los colores tomados de la paleta
del panel mediante variables. Y las tablas se envuelven al dibujarlas en un
contenedor que hace scroll horizontal: una tabla no puede ser a la vez tan
ancha como su contenido y no más ancha que la hoja, así que cede la hoja y lo
que no cabe se alcanza desplazando.

## Lo que se copió distinto

**El diálogo del origen.** La primera versión pedía la fórmula con
`window.prompt`. Estaba mal por dos motivos que se notan enseguida: un diagrama
de Mermaid tiene varias líneas y un prompt tiene una, y un diálogo nativo no se
puede estilar ni acompañar de una ayuda. Ahora es un diálogo de la app con un
área de texto y un ejemplo debajo, porque nadie recuerda la sintaxis de Mermaid
y una caja vacía sin ejemplo es una función que se prueba una vez.

**Insertar siempre al nivel superior.** Un bloque insertado con el cursor
dentro de un bloque de código se descartaba en silencio. Las fórmulas y los
diagramas se insertan después del bloque que contiene el cursor, que además es
donde los espera quien pidió una fórmula mientras escribía código.

**Una sola lista de acciones para las tres entradas.** El editor se alcanza de
tres maneras (la barra del escritorio, el menú `/` y el panel «+» del móvil) y
durante un tiempo fueron tres listas escritas a mano. Eso no es un problema de
orden, es un modo de fallo con historial: la del móvil se escribió con nueve
entradas y se quedó en nueve mientras el editor ganaba seis bloques. Ahora la
lista vive en `lib/editorActions.ts` y cada superficie declara qué parte
enseña; añadir un bloque es una entrada, y olvidarse de una superficie cuesta
trabajo deliberado.

Lo que **no** está en esa lista es el puñado de controles que no son una sola
orden: las dos paletas de color, los tipos de aviso, el selector de tipo de
letra, buscar, ocultar y maximizar. Cada uno tiene estado o un panel propio, y
meterlos en la lista obligaría a un campo `kind` y un `switch` en cada sitio que
la lee: la abstracción sin ganar nada.

**El panel «+» del móvil va por categorías.** No es cosmética: esa rejilla se
escribió cuando había nueve cosas que insertar y se quedó plana y con nueve
mientras el editor ganaba tablas, listas de tareas, código, fórmulas, diagramas
y avisos. En un teléfono, media aplicación había dejado de ser alcanzable, sin
error y sin hueco vacío: nada que notar. Ahora las secciones se generan de una
lista de datos, y hay un test que comprueba que los bloques nuevos se alcanzan
desde el móvil, para que la próxima vez el olvido tenga dónde saltar.

**El saneador de la app es suyo.** DOMPurify exporta una instancia **global** y
las bibliotecas registran hooks en ella; Mermaid registra dos en cuanto se
carga. A partir de ese momento las notas de la app se sanean con las reglas
privadas de otro. Ahora la app usa una instancia propia que nadie más toca.

## Lo que no se copió, y por qué

- **Títulos 4-6.** Tenemos tres niveles. Una descripción de carpeta no es un
  libro; seis niveles de título en una nota son una jerarquía que nadie
  mantiene.
- **Plegar por título.** El equivalente útil (plegar la nota entera) ya existe
  en la ficha, con su botón de desplegar y su vista completa. Plegar por título
  dentro del editor es bastante más trabajo del que aporta aquí.
- **Superbloques (columnas).** Son un sistema de maquetación dentro de una
  nota. Es un proyecto en sí mismo y no se ha echado en falta.
- **PlantUML, Graphviz, ABC, ECharts.** Cada uno es otra biblioteca pesada por
  un formato de diagrama más. Mermaid cubre lo que se dibuja en unas notas.
- **Widgets (iframes de terceros).** Un panel público se sirve bajo una CSP que
  no permite recursos externos, y meter iframes arbitrarios en contenido que se
  comparte es exactamente lo contrario de lo que hace el resto de la app.
- **Etiquetas `#tag#` dentro del texto.** El disparador `#` ya es el de las
  referencias a ficheros adjuntos, y las etiquetas de verdad viven en las
  carpetas y bookmarks, con su página y sus filtros.

## Coste

El script principal pasa de 1589 KB a 1764 KB (de 457 KB a 511 KB comprimido)
por las extensiones nuevas. KaTeX, Mermaid y las gramáticas del resaltador son
fragmentos aparte que solo se descargan cuando una nota los necesita.

## Dónde está cada cosa

| Pieza | Fichero |
|---|---|
| Barra, extensiones, disparadores | `apps/web/src/components/RichTextEditor.tsx` |
| Menú `/` | `apps/web/src/components/SlashMenu.tsx` |
| Buscar y reemplazar | `apps/web/src/components/EditorFindReplace.tsx` |
| Diálogo de fórmula y diagrama | `apps/web/src/components/EditorSourceDialog.tsx` |
| Nodos de fórmula | `apps/web/src/lib/richMath.ts` |
| Nodo de diagrama | `apps/web/src/lib/richDiagram.ts` |
| Dibujado al leer (KaTeX, Mermaid, código, índice) | `apps/web/src/lib/richRender.ts` |
| Instancia propia de DOMPurify | `apps/web/src/lib/purify.ts` |
| Marcas (copiable, oculto, resaltado, tecla) | `apps/web/src/lib/richMarks.ts` |
| Avisos destacados | `apps/web/src/lib/richCallout.ts` |
| Catálogo de emoji | `apps/web/src/lib/emojiCatalog.ts` |
| Panel «+» del móvil | `apps/web/src/components/EditorMobileBar.tsx` |
| La lista de acciones que comparten las tres | `apps/web/src/lib/editorActions.ts` |
| Lo que el servidor deja pasar | `apps/api/src/util/sanitize.ts` |
