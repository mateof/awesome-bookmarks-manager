import {
  DB_BLOCK_ATTR,
  DB_BLOCK_NAME_ATTR,
} from "@awesome-bookmarks/shared";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DatabaseBlock } from "./DatabaseBlock.js";

/**
 * Turns the placeholder divs a note carries into live database components.
 *
 * The description arrives as a sanitised HTML string through
 * `dangerouslySetInnerHTML`, so there is no React tree to put these in. The
 * same problem the reference chips have, and the same shape of answer: find
 * the placeholders in the DOM after render, then portal a component into each
 * one. A portal rather than markup written into the div, because these are
 * fully interactive (cells, menus, dialogs) and need to be React proper.
 */
export function useDatabaseBlocks(
  container: React.RefObject<HTMLElement | null>,
  html: string,
  readOnly = false,
) {
  const [hosts, setHosts] = useState<
    { el: HTMLElement; id: string; name: string }[]
  >([]);

  useEffect(() => {
    const root = container.current;
    if (!root) {
      setHosts([]);
      return;
    }
    const found: { el: HTMLElement; id: string; name: string }[] = [];
    for (const el of root.querySelectorAll<HTMLElement>(`div[${DB_BLOCK_ATTR}]`)) {
      const id = el.getAttribute(DB_BLOCK_ATTR);
      if (!id) continue;
      // The placeholder carries the name as text so the note still reads
      // sensibly anywhere this hook does not run. Clear it before mounting or
      // it shows through underneath the component.
      const name = el.getAttribute(DB_BLOCK_NAME_ATTR) ?? el.textContent ?? "";
      el.textContent = "";
      found.push({ el, id, name });
    }
    setHosts(found);
    // Re-read on every change of the HTML: the container's children are
    // replaced wholesale, so previously found nodes are detached.
  }, [container, html]);

  return (
    <>
      {hosts.map(({ el, id, name }) =>
        createPortal(
          <DatabaseBlock databaseId={id} fallbackName={name} readOnly={readOnly} />,
          el,
          id,
        ),
      )}
    </>
  );
}
