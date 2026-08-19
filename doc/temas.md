# Temas de la aplicación

AwesomeBookmarks trae **diez temas**, cada uno con su versión clara y su versión
oscura, y se pueden **importar más** desde un archivo JSON. Este documento
explica cómo elegirlos y cómo crear uno.

Se eligen en **Ajustes → Apariencia**. El interruptor de sol/luna de la cabecera
sigue haciendo lo de siempre: decide si ves la mitad clara o la oscura del tema
que tengas puesto.

---

## Los diez que vienen de serie

| Tema | De qué va |
| --- | --- |
| **Pizarra** | El de siempre. Gris azulado frío con acento azul. |
| **Nórdico** | Azules apagados y fríos, acento cian glaciar. |
| **Sepia** | Papel cálido; en oscuro se va a un marrón tostado. |
| **Bosque** | Neutros con un verde muy suave, acento musgo. |
| **Cacao** | Marrones cálidos y acento terracota. |
| **Nocturno** | Neutros con violeta, acento malva. |
| **Rosa seca** | Neutros rosados apagados, acento rosa palo. |
| **Alto contraste** | Grises puros, sin tinte, y un azul saturado. Para quien necesita la máxima separación. |
| **Océano** | Neutros hacia el azul verdoso, acento turquesa. |
| **Neón** | Neutros muy fríos y oscuros con acento magenta eléctrico. |

Las paletas son **valores propios**, no copias de los temas de editor conocidos
a los que se parecen. Es deliberado: evita de raíz cualquier discusión de
licencia o de marca, y permite generarlas todas con la misma curva.

---

## Cómo funciona por dentro

Toda la interfaz está escrita contra tres familias de Tailwind: `slate`,
`white` y `blue`. Son el **87% de todas las utilidades de color** de la
aplicación (1813, 202 y 45 usos respectivamente, medidos sobre el código). Esas
tres resuelven a variables CSS en vez de a hex fijo, así que **un tema es un
juego de valores**, no una reescritura de los componentes.

Lo que **no** se tematiza, a propósito: el rojo de peligro, el ámbar de aviso y
el verde de éxito. Un tema debe cambiar el aspecto, no hacer que «Eliminar»
deje de parecer peligroso.

La versión clara y la oscura salen de **una sola rampa** de 50 a 950. No hay
truco: los componentes ya escriben `bg-white dark:bg-slate-900`, es decir, en
claro usan los tonos bajos para las superficies y en oscuro los altos. Una rampa
bien formada sirve para las dos. Si tu tema quiere una temperatura distinta en
oscuro (por ejemplo, papel cálido de día y azul frío de noche), añade una
segunda rampa en `darkNeutral`.

---

## Formato del archivo

Un archivo `.json` con **un tema** o con **una lista de temas**:

```json
{
  "id": "mi-tema",
  "name": "Mi tema",
  "white": "#ffffff",
  "neutral": {
    "50": "#f8fafc", "100": "#f1f5f9", "200": "#e2e8f0", "300": "#cbd5e1",
    "400": "#94a3b8", "500": "#64748b", "600": "#475569", "700": "#334155",
    "800": "#1e293b", "900": "#0f172a", "950": "#020617"
  },
  "accent": {
    "50": "#eff6ff", "100": "#dbeafe", "200": "#bfdbfe", "300": "#93c5fd",
    "400": "#60a5fa", "500": "#3b82f6", "600": "#2563eb", "700": "#1d4ed8",
    "800": "#1e40af", "900": "#1e3a8a", "950": "#172554"
  }
}
```

| Campo | Obligatorio | Qué es |
| --- | --- | --- |
| `id` | sí | Identificador corto. Si repites el de un tema de serie, lo **sustituyes**: así se retoca uno de los que vienen sin inventarse un nombre nuevo. |
| `name` | sí | Lo que se lee en el selector. |
| `white` | sí | La superficie base: a esto resuelven `bg-white` y `text-white`. En un tema cálido no tiene por qué ser blanco puro. |
| `neutral` | sí | La rampa de la interfaz: fondos, bordes, texto. Los once escalones. |
| `accent` | sí | Enlaces, botón primario, elemento seleccionado, foco. |
| `darkNeutral` | no | Rampa de neutros solo para el modo oscuro. Si falta, se reutiliza `neutral`. |

Todos los colores son `#rrggbb`. Un valor que no se pueda leer sale gris medio:
un error en un archivo importado cuesta un color, no la hoja de estilos entera.

### Qué escalón se ve dónde

Merece la pena saberlo antes de elegir colores, porque es lo que decide si un
tema se lee bien:

| Escalón | Dónde aparece |
| --- | --- |
| `white` | Fondo de tarjetas y diálogos en claro. |
| `neutral 50` | Fondo de la página en claro. |
| `neutral 100 / 200` | Hover suave, separadores, bordes en claro. |
| `neutral 300` | Bordes de botones y campos en claro. |
| `neutral 400 / 500` | Texto secundario e iconos apagados (los dos modos). |
| `neutral 700 / 900` | Texto principal en claro; botón primario. |
| `neutral 800 / 900` | Fondo de tarjetas en oscuro. |
| `neutral 950` | Fondo de la página en oscuro. |
| `accent 500 / 600` | Enlaces, foco, selección. |
| `accent 400` | La misma función en oscuro, un punto más claro. |

Regla práctica: **de 50 a 300 tienen que ser claros de verdad y de 800 a 950
oscuros de verdad.** Si aplastas la rampa por el medio, el texto secundario
deja de leerse en uno de los dos modos.

### La forma cómoda de hacer uno

1. Ponte el tema que más se parezca a lo que quieres.
2. **Exportar el tema actual** en Ajustes → Apariencia.
3. Edita los hex del archivo.
4. **Importar tema…** con ese archivo. Como conservas el `id`, sustituye al
   anterior en vez de acumular copias, así que puedes iterar sin ensuciar la
   lista.

Si prefieres generar las rampas en vez de elegirlas a ojo, el script
`scripts/gen-palettes.py` del repositorio construye una rampa completa a partir
de un tono y una saturación en OKLCH, que es como están hechas las diez de
serie: mantiene los mismos saltos de luminosidad que el tema por defecto, y eso
es lo que hace que el contraste siga funcionando sin comprobarlo escalón a
escalón.

---

## Dónde se guardan

En **el navegador**, junto a la preferencia de claro/oscuro, no en el servidor.
Tiene una consecuencia real que conviene tener presente: **un dispositivo nuevo
empieza con el tema por defecto**, y un tema importado no viaja solo. Para eso
está el botón de exportar: el archivo es la forma de llevártelo.

Se guardan dos cosas: el `id` del tema elegido y la lista de temas importados.
Además se cachea el CSS ya generado, que es lo que permite que la primera
pintura de la página salga ya con tu tema en vez de parpadear con el de serie.
