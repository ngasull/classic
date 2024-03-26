import { registerCleanup, trackChildren } from "./dom/lifecycle.ts";
import { JSONable, store, StoreAPI } from "./dom/store.ts";
import { doc, forEach, isArray, isFunction } from "./dom/util.ts";

export type ActivationFn = (
  modulesArg: string[],
  resourcesArg: (i: number) => JSONable | undefined,
) => Activation;

/**
 * Tuple holding JS hooks produced by a jsx render.
 * First holds node index, rest represents activation info.
 */
export type Activation = [number, ActivationInfo][];

/** Either JS with resource dependencies or activation for child nodes. */
export type ActivationInfo = ActivationRef | Activation;

export type ActivationRef = (api: RefAPI, apiArg: RefAPI) => void;

type APIBase<T extends EventTarget> = {
  readonly target: T;
  readonly store: StoreAPI;
};

const apiDef = {
  effect:
    (api: APIBase<EventTarget>) =>
    (cb: () => void | (() => void), uris?: readonly string[]): void => {
      let cleanup: (() => void) | void = cb(),
        unsubStore = uris && store.sub(uris, () => {
          isFunction(cleanup) && cleanup();
          cleanup = cb();
        });
      registerCleanup(
        api.target,
        () => {
          unsubStore?.();
          isFunction(cleanup) && cleanup();
        },
      );
    },
};

const apiHandler = {
  get(
    target: APIBase<EventTarget> & Record<string | symbol, any>,
    p: keyof typeof apiDef,
  ) {
    return target[p] ??= apiDef[p]?.(target);
  },
} as ProxyHandler<RefAPI>;

export type RefAPI<N extends EventTarget = EventTarget> = APIBase<N> & {
  effect: (cb: () => void | (() => void), uris?: string[]) => void;
};

const activateNode = (
  nodes: NodeList | Node[],
  activation: Activation,
): ReadonlyArray<[ActivationRef, RefAPI]> =>
  activation.flatMap(([childIndex, h1]) =>
    isArray(h1) ? activateNode(nodes[childIndex].childNodes, h1) : [[
      h1,
      new Proxy({ target: nodes[childIndex], store } as any, apiHandler),
    ]]
  );

/**
 * Attach JS hooks produced by a jsx render
 */
export const a = (
  activation: ActivationFn,
  modules: string[],
  resources: [string, JSONable][],
  nodes: NodeList | Node[],
): Promise<void> => (
  trackChildren(doc),
    store.set(...resources),
    Promise
      .all(modules.map((m) => import(m)))
      .then((ms) =>
        forEach(
          // Batch activations so that nodes are correctly read, allowing DOM manipulation
          activateNode(
            nodes,
            activation(ms, (i) => store.peek(resources[i][0])),
          ),
          ([ref, api]) => ref(api, api),
        )
      )
);
