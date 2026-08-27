import { describe, expect, it } from "vitest";
import { countNodes, detectAndParse, parseNetscapeHtml } from "../formats.js";

/**
 * Every fixture here is shaped like the real export it stands for: the column
 * names, the field names and the quirks (Pinboard calling the title
 * `description`, Pocket separating tags with `|`) are copied from those apps'
 * own documentation and importers, not invented. A parser tested against a
 * file I made up only proves that I am consistent with myself.
 */

const parse = (s: string) => detectAndParse(Buffer.from(s, "utf8"));

/** The tree flattened to `path -> bookmark`, which is what these tests assert. */
function flatten(tree: ReturnType<typeof parse>["tree"], prefix: string[] = []) {
  const out: {
    path: string[];
    name?: string;
    url?: string;
    tags?: string[];
    description?: string;
    createdAt?: number;
    favorite?: boolean;
    archived?: boolean;
    unread?: boolean;
  }[] = [];
  for (const node of tree) {
    if (node.type === "folder") {
      out.push(...flatten(node.children ?? [], [...prefix, node.name ?? ""]));
    } else {
      out.push({
        path: prefix,
        name: node.name,
        url: node.url,
        tags: node.tags,
        description: node.description,
        createdAt: node.createdAt,
        favorite: node.favorite,
        archived: node.archived,
        unread: node.unread,
      });
    }
  }
  return out;
}

describe("HTML de marcadores (Netscape)", () => {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1600000000">Trabajo</H3>
    <DL><p>
        <DT><A HREF="https://uno.example/a?x=1&amp;y=2" ADD_DATE="1600000100" TAGS="factura,contabilidad">Facturas &amp; cobros</A>
        <DD>La nota que iba debajo
        <DT><H3>Proveedores</H3>
        <DL><p>
            <DT><A HREF="https://dos.example/" TOREAD="1">Sin tags</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://tres.example/">En la raíz</A>
</DL><p>`;

  it("conserva el árbol, y también tags, fecha y descripción", () => {
    const { app, tree } = parse(html);
    expect(app).toBe("HTML");
    expect(countNodes(tree)).toEqual({ folders: 2, bookmarks: 3 });

    const items = flatten(tree);
    const factura = items.find((i) => i.url?.startsWith("https://uno"));
    expect(factura?.path).toEqual(["Trabajo"]);
    // The entity has to be decoded once, not twice: `&amp;` in the file is a
    // literal `&` in the URL, and decoding again would corrupt a `&amp;lt;`.
    expect(factura?.url).toBe("https://uno.example/a?x=1&y=2");
    expect(factura?.name).toBe("Facturas & cobros");
    expect(factura?.tags).toEqual(["factura", "contabilidad"]);
    expect(factura?.createdAt).toBe(1600000100);
    expect(factura?.description).toBe("La nota que iba debajo");

    expect(items.find((i) => i.url === "https://dos.example/")?.path).toEqual([
      "Trabajo",
      "Proveedores",
    ]);
    expect(items.find((i) => i.url === "https://dos.example/")?.unread).toBe(true);
    expect(items.find((i) => i.url === "https://tres.example/")?.path).toEqual([]);
  });

  it("una carpeta vacía sigue siendo una carpeta", () => {
    const tree = parseNetscapeHtml(
      `<DL><p><DT><H3>Vacía</H3><DL><p></DL><p></DL><p>`,
    );
    expect(countNodes(tree)).toEqual({ folders: 1, bookmarks: 0 });
  });

  it("reconoce de dónde viene por la cabecera", () => {
    const linkding = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- Bookmarks exported from linkding -->
<DL><p><DT><A HREF="https://x.example/">x</A></DL><p>`;
    expect(parse(linkding).app).toBe("linkding");
  });
});

describe("CSV", () => {
  it("Pocket: tags con barra vertical y estado", () => {
    const csv = `title,url,time_added,tags,status
Un articulo,https://pocket.example/uno,1700000000,leer|tecnologia,unread
Otro,https://pocket.example/dos,1700000100,,archive`;
    const { app, tree } = parse(csv);
    expect(app).toBe("Pocket");
    const items = flatten(tree);
    expect(items).toHaveLength(2);
    expect(items[0]?.tags).toEqual(["leer", "tecnologia"]);
    expect(items[0]?.createdAt).toBe(1700000000);
    expect(items[0]?.unread).toBe(true);
    expect(items[1]?.archived).toBe(true);
    expect(items[1]?.tags).toBeUndefined();
  });

  it("Raindrop: la colección es la carpeta, con su ruta", () => {
    const csv = `id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite
1,Uno,Mi nota,Un resumen,https://rd.example/uno,Trabajo/Facturas,"a, b",2024-03-01T10:00:00.000Z,,,true
2,Dos,,,https://rd.example/dos,Personal,,2024-03-02T10:00:00.000Z,,,false`;
    const { app, tree } = parse(csv);
    expect(app).toBe("Raindrop.io");
    const items = flatten(tree);
    expect(items[0]?.path).toEqual(["Trabajo", "Facturas"]);
    expect(items[0]?.tags).toEqual(["a", "b"]);
    expect(items[0]?.description).toBe("Mi nota");
    expect(items[0]?.favorite).toBe(true);
    expect(items[1]?.path).toEqual(["Personal"]);
    expect(items[1]?.favorite).toBeUndefined();
  });

  it("Instapaper: la carpeta va en su columna", () => {
    const csv = `URL,Title,Selection,Folder,Timestamp
https://ip.example/uno,Uno,,Archive,1700000000
https://ip.example/dos,Dos,,Lectura,1700000100`;
    const { app, tree } = parse(csv);
    expect(app).toBe("Instapaper");
    expect(flatten(tree).map((i) => i.path)).toEqual([["Archive"], ["Lectura"]]);
  });

  it("un CSV cualquiera: columnas con otros nombres", () => {
    const csv = `name,link,labels
Algo,https://otro.example/x,"uno, dos"`;
    const { app, tree } = parse(csv);
    expect(app).toBe("CSV");
    const items = flatten(tree);
    expect(items[0]?.name).toBe("Algo");
    expect(items[0]?.url).toBe("https://otro.example/x");
    expect(items[0]?.tags).toEqual(["uno", "dos"]);
  });

  it("una fila sin enlace no entra", () => {
    const csv = `title,url\nSolo texto,\nBueno,https://ok.example/`;
    expect(flatten(parse(csv).tree)).toHaveLength(1);
  });

  it("un CSV no puede colar un javascript:", () => {
    // These files come from outside. A `javascript:` URL that survives the
    // import is a link somebody may click later, in their own session.
    const csv = `title,url
Malo,javascript://%0aalert(1)
Peor,"data:text/html,<script>alert(1)</script>"
Bueno,https://ok.example/`;
    const items = flatten(parse(csv).tree);
    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe("https://ok.example/");
  });

  it("pero un bookmarklet del navegador se conserva", () => {
    // The other direction: a browser's own export is the user's own data, and
    // bookmarklets are a real and old use of it.
    const html = `<DL><p><DT><A HREF="javascript:void(0)">Mi bookmarklet</A></DL><p>`;
    expect(flatten(parseNetscapeHtml(html))[0]?.name).toBe("Mi bookmarklet");
  });
});

describe("JSON", () => {
  it("wallabag: is_starred es favorito, is_archived es archivado", () => {
    const json = JSON.stringify([
      {
        id: 1,
        title: "Un artículo",
        url: "https://wb.example/uno",
        is_archived: 1,
        is_starred: 0,
        created_at: "2024-05-01T09:00:00+0200",
        tags: ["prensa", "leer"],
        content: "<p>" + "x".repeat(5000) + "</p>",
      },
      {
        id: 2,
        title: "Otro",
        url: "https://wb.example/dos",
        is_archived: 0,
        is_starred: 1,
        created_at: "2024-05-02T09:00:00+0200",
        tags: [{ label: "objeto" }],
      },
    ]);
    const { app, tree } = parse(json);
    expect(app).toBe("wallabag");
    const items = flatten(tree);
    expect(items[0]?.archived).toBe(true);
    expect(items[0]?.favorite).toBeUndefined();
    expect(items[0]?.tags).toEqual(["prensa", "leer"]);
    // The saved copy of the article is not a description: it would paste a
    // whole web page into every note.
    expect(items[0]?.description).toBeUndefined();
    expect(items[1]?.favorite).toBe(true);
    // Tags as objects turn up in exports made through the API.
    expect(items[1]?.tags).toEqual(["objeto"]);
  });

  it("Pinboard: description es el título y extended la nota", () => {
    const json = JSON.stringify([
      {
        href: "https://pb.example/uno",
        description: "El título de verdad",
        extended: "La nota larga",
        meta: "abc",
        hash: "def",
        time: "2024-01-02T03:04:05Z",
        shared: "no",
        toread: "yes",
        tags: "uno dos tres",
      },
    ]);
    const { app, tree } = parse(json);
    expect(app).toBe("Pinboard");
    const item = flatten(tree)[0];
    expect(item?.name).toBe("El título de verdad");
    expect(item?.description).toBe("La nota larga");
    // Space-separated, which is Pinboard's documented shape and nobody else's.
    expect(item?.tags).toEqual(["uno", "dos", "tres"]);
    expect(item?.unread).toBe(true);
    expect(item?.createdAt).toBe(Math.floor(Date.parse("2024-01-02T03:04:05Z") / 1000));
  });

  it("Karakeep: las listas anidadas son carpetas", () => {
    const json = JSON.stringify({
      bookmarks: [
        {
          createdAt: "2024-06-01T10:00:00.000Z",
          title: "Con lista",
          tags: ["propio"],
          lists: ["hija", "otra"],
          content: { type: "link", url: "https://kk.example/uno" },
          note: "Una nota",
          archived: false,
        },
        {
          createdAt: "2024-06-02T10:00:00.000Z",
          title: null,
          tags: [],
          lists: [],
          content: { type: "link", url: "https://kk.example/dos", title: "Del contenido" },
          archived: true,
        },
      ],
      lists: [
        { id: "madre", name: "Madre", parentId: null },
        { id: "hija", name: "Hija", parentId: "madre" },
        { id: "otra", name: "Otra", parentId: null },
      ],
    });
    const { app, tree } = parse(json);
    expect(app).toBe("Karakeep");
    const items = flatten(tree);
    expect(items[0]?.path).toEqual(["Madre", "Hija"]);
    expect(items[0]?.description).toBe("Una nota");
    // In two lists at once: the first is the folder, the rest survive as tags
    // rather than importing the same link twice.
    expect(items[0]?.tags).toEqual(["propio", "Otra"]);
    expect(items[1]?.path).toEqual([]);
    expect(items[1]?.name).toBe("Del contenido");
    expect(items[1]?.archived).toBe(true);
  });

  it("Omnivore: labels son los tags", () => {
    const json = JSON.stringify([
      {
        id: "abc",
        slug: "un-articulo",
        title: "Un artículo",
        description: "Resumen",
        url: "https://om.example/uno",
        state: "Archived",
        labels: [{ name: "prensa" }],
        savedAt: "2024-02-03T00:00:00.000Z",
      },
    ]);
    const { app, tree } = parse(json);
    expect(app).toBe("Omnivore");
    const item = flatten(tree)[0];
    expect(item?.tags).toEqual(["prensa"]);
    expect(item?.archived).toBe(true);
    expect(item?.description).toBe("Resumen");
  });

  it("un JSON cualquiera, y uno que no vale", () => {
    const ok = JSON.stringify([{ Url: "https://gen.example/x", Name: "Algo" }]);
    expect(flatten(parse(ok).tree)[0]?.name).toBe("Algo");
    expect(parse("{ esto no es json }").tree).toEqual([]);
    expect(parse("[]").tree).toEqual([]);
  });

  it("una lista envuelta en un objeto también se lee", () => {
    const json = JSON.stringify({
      items: [{ url: "https://env.example/x", title: "Envuelto" }],
    });
    expect(flatten(parse(json).tree)[0]?.name).toBe("Envuelto");
  });
});

/**
 * The exports that carry a saved copy of the article.
 *
 * This is the bug a real 6.8 MB wallabag export found: the reader sniffed for
 * HTML *first*, and the first article's `content` had an `<a href=` in it, so
 * the whole file was read as a bookmarks page and produced nothing. Both of
 * these files are mostly HTML by weight; what decides them is their structure.
 */
describe("ficheros con el artículo entero dentro", () => {
  const articulo =
    '<p>Un artículo con <a href="https://enlace.example/dentro">un enlace</a> y' +
    ' <dl><dt>hasta una lista</dt></dl> dentro del texto.</p>';

  it("wallabag JSON: el HTML del contenido no lo convierte en HTML", () => {
    const json = JSON.stringify([
      {
        is_archived: 0,
        is_starred: 0,
        tags: ["receta"],
        id: 186,
        title: "Pan bao casero",
        url: "https://bonviveur.example/es/recetas/pan-bao",
        content: articulo,
        created_at: "2026-07-11T10:29:34+0200",
      },
    ]);
    const { app, tree } = parse(json);
    expect(app).toBe("wallabag");
    const items = flatten(tree);
    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe("https://bonviveur.example/es/recetas/pan-bao");
    // And not the link that was inside the article.
    expect(items[0]?.name).toBe("Pan bao casero");
  });

  it("wallabag CSV: sus columnas, su fecha en d/m/Y y su artículo", () => {
    // Headers exactly as wallabag writes them: Title, URL, Content, Tags,
    // MIME Type, Language, Creation date.
    const csv =
      'Title,URL,Content,Tags,MIME Type,Language,Creation date\n' +
      `"Pan bao casero","https://bonviveur.example/es/recetas/pan-bao","${articulo}",` +
      '"receta, pan","text/html","es","27/08/2026 10:29:34"';
    const { app, tree } = parse(csv);
    expect(app).toBe("wallabag");
    const items = flatten(tree);
    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe("https://bonviveur.example/es/recetas/pan-bao");
    expect(items[0]?.tags).toEqual(["receta", "pan"]);
    // 27 is not a month: read as American this date is thrown away.
    expect(items[0]?.createdAt).toBe(
      Math.floor(Date.UTC(2026, 7, 27, 10, 29, 34) / 1000),
    );
    // The article is not the description, here either.
    expect(items[0]?.description).toBeUndefined();
  });

  it("un JSON que no parsea no se traga el fichero", () => {
    // It starts with `[`, so JSON gets first refusal — but it must hand the
    // file back rather than reporting "nothing found".
    const html = `[esto no es json]\n<DL><p><DT><A HREF="https://x.example/">x</A></DL><p>`;
    expect(flatten(parse(html).tree)[0]?.url).toBe("https://x.example/");
  });
});

describe("fechas", () => {
  it("segundos, milisegundos e ISO; y lo imposible se descarta", () => {
    const rows = [
      { url: "https://d.example/1", title: "s", created: "1700000000" },
      { url: "https://d.example/2", title: "ms", created: "1700000000000" },
      { url: "https://d.example/3", title: "iso", created: "2023-11-14T22:13:20Z" },
      { url: "https://d.example/4", title: "cero", created: "0" },
      { url: "https://d.example/5", title: "futuro", created: "99999999999" },
      { url: "https://d.example/6", title: "dia primero", created: "27/08/2024" },
      { url: "https://d.example/7", title: "ambiguo", created: "05/04/2024" },
    ];
    const items = flatten(parse(JSON.stringify(rows)).tree);
    expect(items[0]?.createdAt).toBe(1700000000);
    expect(items[1]?.createdAt).toBe(1700000000);
    expect(items[2]?.createdAt).toBe(1700000000);
    expect(items[3]?.createdAt).toBeUndefined();
    expect(items[4]?.createdAt).toBeUndefined();
    expect(items[5]?.createdAt).toBe(Math.floor(Date.UTC(2024, 7, 27) / 1000));
    // Both readings are possible; the European one wins, which is what the
    // apps that write dates with slashes here use.
    expect(items[6]?.createdAt).toBe(Math.floor(Date.UTC(2024, 3, 5) / 1000));
  });
});
