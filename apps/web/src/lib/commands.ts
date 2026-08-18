/**
 * Commands the palette can run outside its own component.
 *
 * A window event rather than a context: the palette lives in Layout while the
 * dialogs it needs to open belong to the page below it, and threading a
 * provider through every route to flip two booleans would cost more than it
 * explains. The app already uses this pattern for `auth:invalidated`.
 */

export type AppCommand = "new-folder" | "new-bookmark";

export const APP_COMMAND_EVENT = "app:command";

export function runAppCommand(command: AppCommand) {
  window.dispatchEvent(
    new CustomEvent(APP_COMMAND_EVENT, { detail: { command } }),
  );
}

/** Subscribe to palette commands. Returns the unsubscribe function. */
export function onAppCommand(handler: (command: AppCommand) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ command?: AppCommand }>).detail;
    if (detail?.command) handler(detail.command);
  };
  window.addEventListener(APP_COMMAND_EVENT, listener);
  return () => window.removeEventListener(APP_COMMAND_EVENT, listener);
}
