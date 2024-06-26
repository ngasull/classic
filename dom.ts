import { registerCleanup, trackChildren } from "./dom/lifecycle.ts";
import { store } from "./dom/store.ts";
import { call, doc, forEach, isFunction } from "./dom/util.ts";

/**
 * Tuple holding JS hooks produced by a jsx render.
 * First holds node index, second represents: children if present, otherwise (undefined) means a ref is associated.
 */
export type Activation = ([number] | [number, Activation])[];

// export type EffectAPI = {
//   readonly store: StoreAPI;
//   readonly sub: (
//     target: EventTarget,
//     cb: () => void | (() => void),
//     uris?: readonly string[],
//   ) => void;
// };

const sub = (
  target: EventTarget,
  cb: () => void | (() => void),
  uris?: readonly string[],
): void => {
  let cleanup: (() => void) | void = cb(),
    unsubStore = uris && store.sub(uris, () => {
      isFunction(cleanup) && cleanup();
      cleanup = cb();
    });
  registerCleanup(
    target,
    () => {
      unsubStore?.();
      isFunction(cleanup) && cleanup();
    },
  );
};

const makeRefs = (
  nodes: NodeList | readonly Node[],
  activation: Activation,
): readonly EventTarget[] =>
  activation.flatMap(([childIndex, h1]) =>
    h1 ? makeRefs(nodes[childIndex].childNodes, h1) : nodes[childIndex]
  );

/*
 * Effect API
 */
export const api = { store, sub };

/**
 * Attach JS hooks produced by a jsx render
 */
export const a = (effects: ReadonlyArray<() => void>): void => (
  trackChildren(doc), forEach(effects, call)
);
