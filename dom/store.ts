import {
  call,
  customEvent,
  dispatchPrevented,
  entries,
  forEach,
  isArray,
  stopPropagation,
  subEvent,
} from "./util.ts";

type JSONLiteral = string | number | boolean | null;

type JSONRecord = {
  [member: string]: JSONLiteral | JSONArray | JSONRecord | undefined; // In order to handle optional properties
};

type JSONArray = ReadonlyArray<JSONLiteral | JSONArray | JSONRecord>;

export type JSONable = JSONLiteral | JSONRecord | JSONArray;

const store: ResourceStore = {};

export const peek = (uri: string) => store[uri]?.[0];

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
export const registerCleanup = (node: Node, cleanup: () => void) => {
  dispatchPrevented(node, customEvent(trackEvent, cleanup));
};

export const cleanup = (node: Node) =>
  dispatchPrevented(node, customEvent(untrackEvent));

export const getValues = (uris: string[]) => uris.map((uri) => store[uri]![0]);

export const subStore = (uris: string[], cb: () => void) => {
  forEach(uris, (uri) => (store[uri] ??= [undefined!, new Set()])![1].add(cb));
  return () => forEach(uris, (uri) => store[uri]![1].delete(cb));
};

export const setResources = (
  resources: [string, JSONable][] | Record<string, JSONable | undefined>,
) => {
  if (!isArray(resources)) {
    resources = entries(resources)
      .filter((r) => r[1] != null) as [string, JSONable][];
  }

  let batch = new Set<() => void>(),
    rollbacks: (() => void)[] = [];

  forEach(resources, ([uri, v]) => {
    let r = (store[uri] ??= [undefined!, new Set()]),
      prev = r[0];
    if (v !== prev) {
      r[0] = v;
      forEach(r[1], (cb) => batch.add(cb));
      rollbacks.push(() => {
        if (r[0] === v) {
          r[0] = prev;
          forEach(r[1], (cb) => batch.add(cb));
        }
      });
    }
  });

  forEach(batch, call);

  return () => {
    batch = new Set();
    forEach(rollbacks, call);
    // forEach(batch, call);
  };
};

type ResourceStore = Record<string, StoredResource | undefined>;

type StoredResource = [JSONable, Set<ResouceListener>];

type ResouceListener = () => void;
