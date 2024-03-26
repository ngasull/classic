import { call, forEach, isFunction } from "./util.ts";

type JSONLiteral = string | number | boolean | null;

type JSONRecord = {
  [member: string]: JSONLiteral | JSONArray | JSONRecord | undefined; // In order to handle optional properties
};

type JSONArray = ReadonlyArray<JSONLiteral | JSONArray | JSONRecord>;

export type JSONable = JSONLiteral | JSONRecord | JSONArray;

type ResourceStore = Record<string, StoredResource | undefined>;

type StoredResource = [JSONable | undefined, Set<ResourceListener>];

type ResourceListener = () => void;

const storeRecords: ResourceStore = {};

export type StoreAPI = Readonly<typeof store>;

export const store = {
  peek: (uri: string): JSONable | undefined => storeRecords[uri]?.[0],

  sub: (uris: readonly string[], cb: ResourceListener): () => void => {
    forEach(
      uris,
      (uri) => (storeRecords[uri] ??= [undefined, new Set()])![1].add(cb),
    );
    return () => forEach(uris, (uri) => storeRecords[uri]![1].delete(cb));
  },

  set: (
    ...resources: [
      string,
      | JSONable
      | undefined
      | ((prev: JSONable | undefined) => JSONable | undefined),
    ][]
  ): () => void => {
    let batch = new Set<ResourceListener>(),
      rollbacks: (() => void)[] = [],
      setValue = (uri: string, v: JSONable | undefined) => {
        let changed = 0,
          r = (storeRecords[uri] ??= [undefined, new Set()]),
          prev = r[0];
        if (v !== prev) {
          r[0] = v;
          forEach(r[1], (cb) => batch.add(cb));
          rollbacks.push(() => {
            if (r[0] === v) setValue(uri, prev);
          });
          changed = 1;
        }
        if (v === undefined) delete storeRecords[uri];
        return changed;
      };

    forEach(
      resources,
      ([uri, v]) => setValue(uri, isFunction(v) ? v(store.peek(uri)) : v),
    );
    forEach(batch, call);

    return () => {
      batch = new Set();
      forEach(rollbacks, call);
      forEach(batch, call);
    };
  },
};
