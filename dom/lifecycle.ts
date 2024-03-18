import {
  call,
  customEvent,
  dispatchPrevented,
  forEach,
  stopPropagation,
  subEvent,
} from "./util.ts";

const trackEvent = "lf-t";
const untrackEvent = "lf-u";

// Registers a lifecycle-tracking Node
export const trackChildren = (node: Node) => {
  let nodes = new Map<EventTarget, Set<() => void>>(),
    trackUnsub = subEvent(node, trackEvent, (e) => {
      let t = e.target!,
        cs = nodes.get(t);
      if (t != node) {
        stopPropagation(e);
        if (!cs) nodes.set(t, cs = new Set());
        cs.add((e as CustomEvent<() => void>).detail);
      }
    }),
    untrackUnsub = subEvent(node, untrackEvent, (e) => {
      let t = e.target!,
        cleanups = nodes.get(t);
      if (t != node) {
        stopPropagation(e);
        forEach(cleanups, call);

        if (
          cleanups?.delete((e as CustomEvent<() => void>).detail) &&
          cleanups.size < 1
        ) {
          nodes.delete(t);
        }
      }
    }),
    cleanup = () => {
      untrackUnsub();
      trackUnsub();
      forEach(nodes, (cleanups) => forEach(cleanups, call));
      nodes.clear();
    };

  registerCleanup(node, cleanup);
  return cleanup;
};

// Tells the closest lifecycle-tracking parent to attach a cleanup to a Node
export const registerCleanup = (node: EventTarget, cleanup: () => void) => {
  dispatchPrevented(node, customEvent(trackEvent, cleanup));
};

export const cleanup = (node: EventTarget) =>
  dispatchPrevented(node, customEvent(untrackEvent));
