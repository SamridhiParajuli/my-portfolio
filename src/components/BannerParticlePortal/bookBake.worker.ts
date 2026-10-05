/**
 * Bakes the live book's maps (antiqueBook's createBookBake) off the main
 * thread, so getting the book ready to open costs the journey nothing and
 * is done in a second or two rather than trickled through idle time. Asked
 * for the parchment (`width` set), it bakes that one map instead: what the
 * book becomes once its last chapter has been read (bookFinale).
 */

import { createBookBake, createParchBake } from "./antiqueBook";

type Scope = {
  onmessage:
    | ((e: MessageEvent<{ bookPx: number; res: number; width?: number }>) => void)
    | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};

const scope = self as unknown as Scope;

scope.onmessage = (e) => {
  const { bookPx, res, width } = e.data;
  if (width) {
    const bake = createParchBake(bookPx, res, width);
    while (!bake.step(1000)) {
      /* baking */
    }
    const map = bake.result();
    if (!map) return;
    scope.postMessage({ bookPx, map }, [map.a.buffer, map.b.buffer, map.c.buffer]);
    return;
  }
  const bake = createBookBake(bookPx, res);
  while (!bake.step(1000)) {
    /* baking */
  }
  const maps = bake.result();
  if (!maps) return;
  const transfer: Transferable[] = [];
  for (const m of Object.values(maps)) {
    transfer.push(m.a.buffer, m.b.buffer, m.c.buffer);
  }
  scope.postMessage({ bookPx, maps }, transfer);
};
