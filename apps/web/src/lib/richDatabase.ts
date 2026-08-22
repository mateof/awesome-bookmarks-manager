import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { DatabaseEditorCard } from "../components/DatabaseEditorCard.js";
import {
  DB_BLOCK_ATTR,
  DB_BLOCK_NAME_ATTR,
} from "@awesome-bookmarks/shared";

/**
 * A database embedded in a note.
 *
 * The block carries only the id. The columns, rows and views live in their own
 * tables, so the note stays a note: small, resealed cheaply on every save, and
 * unable to lose data when two tabs have it open.
 *
 * Modelled as a block-level atom. Inside the editor it renders as a card
 * showing what the table is called and how many rows it holds, not as the grid
 * itself. That split is deliberate rather than a shortcut: in this app a
 * description is *edited* in a dialog and *read* on the entity's page, so the
 * interactive grid belongs where the reading happens. Editing prose and editing
 * three hundred cells are different jobs and putting both in one modal serves
 * neither.
 *
 * The card is a React node view rather than plain markup because the name has
 * to be editable from here: the editor is where you put the table, so it is
 * where you expect to be able to name it.
 *
 * The name is duplicated into the block so the card can say what it is before
 * the data loads, and still says something if the database is later deleted.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    databaseBlock: {
      insertDatabase: (attrs: { dbId: string; dbName: string }) => ReturnType;
    };
  }
}

export const DB_BLOCK_CLASS = "ab-db-block";

export const DatabaseBlock = Node.create({
  name: "databaseBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      dbId: {
        default: null,
        parseHTML: (el) => el.getAttribute(DB_BLOCK_ATTR),
        renderHTML: (attrs) =>
          attrs.dbId ? { [DB_BLOCK_ATTR]: attrs.dbId as string } : {},
      },
      dbName: {
        default: "",
        parseHTML: (el) => el.getAttribute(DB_BLOCK_NAME_ATTR) ?? "",
        renderHTML: (attrs) =>
          attrs.dbName ? { [DB_BLOCK_NAME_ATTR]: attrs.dbName as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[${DB_BLOCK_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes, node }) {
    // The name goes in as text as well as an attribute: somewhere that knows
    // nothing about this node (a plain-text export, a stripped preview) should
    // still show that a table was here and what it was called.
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: DB_BLOCK_CLASS }),
      (node.attrs.dbName as string) || "",
    ];
  },

  renderText({ node }) {
    return `[${(node.attrs.dbName as string) || "base de datos"}]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(DatabaseEditorCard);
  },

  addCommands() {
    return {
      insertDatabase:
        (attrs) =>
        ({ chain }) =>
          chain()
            .insertContent([
              { type: this.name, attrs },
              // A paragraph after it, or a database at the end of a note leaves
              // nowhere to put the caret and no way to keep writing.
              { type: "paragraph" },
            ])
            .run(),
    };
  },
});
