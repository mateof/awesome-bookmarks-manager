# Importar desde otras aplicaciones

AwesomeBookmarks lee el fichero que te da la aplicación de la que vienes. No
hace falta convertirlo antes ni renombrarlo: **el formato se deduce del
contenido**, y la pantalla te dice qué ha reconocido antes de importar nada.

Está en **Ajustes → Importar / Exportar**.

La **carpeta destino** se elige en el mismo árbol que el resto de la
aplicación: se despliega rama a rama, tiene buscador y **crea carpetas** con el
botón de la derecha de cada fila. Por eso ya no hay un campo aparte para el
nombre de una «carpeta envolvente»: si quieres que lo importado quede en una
carpeta suya, la creas ahí y la eliges, que es un paso menos y una cosa menos
que explicar.

## Qué hay ahí fuera

El panorama de aplicaciones parecidas, y qué exporta cada una. Es lo que
determina qué se puede importar y qué se pierde por el camino.

| Aplicación | Qué es | Exporta | Estado |
|---|---|---|---|
| **wallabag** | Read-later autoalojado, el más veterano | JSON (también CSV, XML, EPUB…) | ✅ Admitido |
| **Pocket** | El read-later de Mozilla | ZIP con CSV (antes HTML) | ✅ Admitido, incluido el zip. **Cerró en julio de 2025** |
| **Raindrop.io** | Gestor de marcadores comercial, el más usado | CSV y HTML | ✅ Admitido, con colecciones anidadas |
| **Pinboard** | Marcadores minimalistas de pago | JSON | ✅ Admitido |
| **Karakeep** (antes Hoarder) | Autoalojado con etiquetado por IA | JSON (y HTML) | ✅ Admitido, con sus listas anidadas |
| **Instapaper** | Read-later clásico | CSV | ✅ Admitido |
| **Omnivore** | Read-later de código abierto | ZIP con JSON | ✅ Admitido. **Cerró en 2024** |
| **linkding** | Marcadores autoalojados, muy popular | HTML de navegador con `TAGS` | ✅ Admitido, con tags |
| **Shaarli** / **Shiori** / **LinkAce** | Autoalojados, familia Netscape | HTML con `TAGS` y `PRIVATE` | ✅ Admitido, con tags |
| **Readwise Reader** | Read-later de pago con resaltados | CSV | ✅ Por columnas reconocidas |
| **Diigo** | Marcadores con anotaciones | CSV | ✅ Por columnas reconocidas |
| **Delicious** | El abuelo de todos | — | ⚰️ Cerrado; si guardas un HTML antiguo, vale |
| **Chrome / Firefox / Edge / Safari** | Los navegadores | HTML (formato Netscape) | ✅ Admitido desde el principio |

Quedan fuera a propósito **Zotero** y **Notion**: exportan otra cosa
(referencias bibliográficas, páginas), y tratar sus ficheros como marcadores
produciría basura con aspecto de haber funcionado.

## Cómo decide qué es cada fichero

Por el contenido, en este orden:

1. **ZIP** (empieza por `PK`): se abre y se importa cada `.csv`, `.json` o
   `.html` que haya dentro, en orden. Pocket parte su exportación en
   `part_000000.csv`, `part_000001.csv`… de diez mil enlaces cada uno, y
   Omnivore en `metadata_*.json` de veinte: obligar a descomprimir e importar
   uno a uno, en orden, no es importar. Las copias de `__MACOSX` se ignoran,
   que si no se importa todo dos veces.
2. **HTML** (`<!DOCTYPE NETSCAPE-Bookmark-file-1>`, o simplemente `<DL>` y
   enlaces): el formato de los navegadores.
3. **JSON**: se mira la forma de los objetos para saber de quién es.
4. **CSV**: se miran los nombres de las columnas.

El nombre del fichero y su extensión **no** se usan para decidir. La gente
renombra descargas, y la mitad de estas aplicaciones te dan un `.zip` con lo
de verdad dentro.

## Reconocer sin depender de reconocer

Hay un lector por familia (HTML, CSV, JSON), no uno por aplicación. La
detección solo sirve para **poner nombre** a lo que se ha leído y enseñarlo en
pantalla; el que lee es liberal a propósito:

- **CSV**: las columnas se buscan por nombre, no por posición. `url`, `link`,
  `href`, `address`; `title` o `name`; `tags`, `labels` o `document tags`;
  `folder`, `collection` o `list`; `note`, `excerpt` o `description`;
  `created`, `time_added`, `timestamp`, `saved date`… Así entra también la
  aplicación de la que nunca he oído hablar, que es justo de la que va a venir
  alguien.
- **JSON**: los tags se aceptan como lista de textos, como lista de objetos
  (`{label}`, `{name}`) o como un solo texto. Una lista envuelta en un objeto
  (`{"items": [...]}`, `{"_embedded":{"items":[...]}}`) también se lee.
- **Nunca se descarta un enlace** porque falte un campo. Un marcador con URL y
  nada más sigue siendo un marcador.

Las rarezas que sí hay que saberse de memoria están escritas donde se usan:

- **Pinboard** llama `description` al título y `extended` a la nota, que es lo
  contrario de lo que sugieren las dos palabras, y separa los tags con
  **espacios**.
- **Pocket** separa los tags con **barra vertical**. Leído con comas, la
  etiqueta que queda se llama `tecnologia|leer`.
- **wallabag** guarda el artículo entero en `content`. Eso no es una
  descripción: importarlo pegaría una página web completa en cada nota. Se usa
  `excerpt`/`description` si existen, y si no, nada.
- **Raindrop** escribe la ruta de la colección como `Padre/Hija`.
- **Karakeep** tiene listas anidadas de verdad (`parentId`). Un marcador que
  está en dos listas va a la primera, y las demás se conservan como tags: la
  alternativa era importar el mismo enlace varias veces.

## Qué se conserva

| Del origen | Dónde acaba |
|---|---|
| Carpetas / colecciones / listas | Carpetas, con su anidamiento |
| Tags / labels | Tags, reutilizando los que ya tengas (sin distinguir mayúsculas) |
| Nota, resumen, `excerpt`, `<DD>` | Descripción del marcador |
| Fecha de guardado (`ADD_DATE`, `time_added`, `created_at`…) | Fecha de creación |
| Favorito / estrella (`is_starred`, `favorite`) | Favorito |
| Archivado / por leer | Tags `archivado` y `por leer` (opcional, ver abajo) |

Las fechas llegan en segundos, en milisegundos o en ISO, según quién escriba.
Se aceptan las tres, y se descarta lo imposible: un cero, o una fecha del año
5138, son un hueco sin rellenar, no una fecha.

### Archivado y «por leer»

Esta aplicación no tiene ese estado: un marcador está guardado y ya. Como
tirarlo sería perder información que el origen sí tenía, se guarda en forma de
tag (`archivado`, `por leer`), y hay una casilla para no hacerlo. Va marcada
por defecto, al revés que la de los snapshots: esta no cuesta nada y lo que
está en juego es no perder datos. Si sobran, se borran los dos tags de una vez
desde la página de tags.

## Lo que no se importa

- **El artículo guardado.** wallabag, Pocket y Omnivore guardan una copia del
  texto de cada página. Aquí eso es un *snapshot*, y se genera desde la URL con
  la casilla correspondiente, que está desmarcada por defecto porque significa
  una descarga por cada enlace importado.
- **Resaltados y anotaciones.** No hay dónde ponerlos todavía.
- **Lo privado/público** de Shaarli y Pinboard: los marcadores de aquí son
  privados salvo que se compartan explícitamente, así que no hay a qué mapearlo.

## Límites

- 32 MB por fichero (una exportación de cien mil enlaces cabe de sobra).
- Máximo 20 tags por marcador, para que un fichero raro no cree miles.
- El import corre como trabajo en segundo plano: la pantalla dice cuántos
  marcadores se han reconocido en el momento, y las carpetas van apareciendo.

## Y a la inversa

Se sale igual de fácil que se entra, que es la mitad de la promesa de una
aplicación autoalojada: **Ajustes → Importar / Exportar** exporta a HTML de
navegador (lo lee todo el mundo) y al `.abz` propio, que conserva lo que el
HTML no sabe expresar. Ver [guia-usuario.md](guia-usuario.md).
