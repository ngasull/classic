import {
  call,
  dispatchPrevented,
  eventType,
  forEach,
  listen,
  reverseForOf,
  stopPropagation,
} from "@classic/js/dom/util";

const trackEvent = eventType<() => void>({ type: "lf-t" });
const untrackEvent = eventType({ type: "lf-u" });

// Registers a lifecycle-tracking Node
export const trackChildren = (node: Node) => {
  let nodes = new Map<EventTarget, Set<() => void>>(),
    trackUnsub = listen(node, trackEvent, (e) => {
      let t = e.target!,
        cs = nodes.get(t);
      if (t != node) {
        stopPropagation(e);
        if (!cs) nodes.set(t, cs = new Set());
        cs.add(e.detail);
      }
    }),
    untrackUnsub = listen(node, untrackEvent, (e) => {
      let t = e.target!,
        cleanups = nodes.get(t);
      if (t != node) {
        stopPropagation(e);
        forEach(cleanups, call);
        nodes.delete(t);
      }
    }),
    cleanup = () => {
      reverseForOf(nodes.values(), (cleanups) => reverseForOf(cleanups, call));
      untrackUnsub();
      trackUnsub();
      nodes.clear();
    };

  registerCleanup(node, cleanup);
  return cleanup;
};

// Tells the closest lifecycle-tracking parent to attach a cleanup to a Node
export const registerCleanup = (node: EventTarget, cleanup: () => void) => {
  dispatchPrevented(node, trackEvent(cleanup));
};

export const cleanup = (node: EventTarget) =>
  dispatchPrevented(node, untrackEvent());
