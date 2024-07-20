import { isFunction } from "@classic/js/dom/util";
import { registerCleanup } from "./dom/lifecycle.ts";
import { store } from "./dom/store.ts";

/**
 * Tuple holding refs attached to a jsx tree render.
 * First holds node index, second represents: children if present, otherwise (undefined) means next ref is associated.
 */
export type Activation = ([number] | [number, Activation])[];

let i;

const refs = (
  node: ChildNode,
  activatedLength: number,
  activation: Activation,
): readonly EventTarget[] => {
  for (i = 0; i < activatedLength; i++) node = node.previousSibling!;
  i = 0;
  return walkRefs(node, activation);
};

const walkRefs = (
  node: ChildNode,
  activation: Activation,
): readonly EventTarget[] =>
  activation.flatMap(([childIndex, sub]) => {
    for (; i! < childIndex; i!++) node = node.nextSibling!;
    return sub ? walkRefs(node.firstChild!, sub) : node;
  });

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

/*
 * Effect API
 */
export { refs, store, sub };
