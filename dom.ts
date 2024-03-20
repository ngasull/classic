import { apiArg, argn, modulesArg, resourcesArg } from "./dom/arg-alias.ts";
import { registerCleanup, trackChildren } from "./dom/lifecycle.ts";
import { JSONable, peek, setResources, subStore } from "./dom/store.ts";
import { call, doc, forEach, isArray, isFunction } from "./dom/util.ts";

/**
 * Tuple holding JS hooks produced by a jsx render.
 * First holds node index, rest represents activation info.
 */
export type Activation = [number, ActivationInfo][];

/** Either JS with resource dependencies or activation for child nodes. */
type ActivationInfo =
  | string // Raw JS
  | Activation;

const arg0 = argn(0);

type APIBase<T extends EventTarget> = {
  target: T;
  uris: readonly string[];
  peek: (uri: string) => JSONable | undefined;
};

const apiDef = {
  effect:
    (api: APIBase<EventTarget>) =>
    (cb: () => void | (() => void), uris = api.uris): void => {
      let cleanup: (() => void) | void = cb(),
        unsubStore = subStore(uris, () => {
          isFunction(cleanup) && cleanup();
          cleanup = cb();
        });
      registerCleanup(
        api.target,
        () => {
          unsubStore();
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
  modules: unknown[],
  peekResIndex: (i: number) => JSONable | undefined,
): ReadonlyArray<() => void> =>
  activation.flatMap(([childIndex, h1]) => {
    let child = nodes[childIndex],
      api = new Proxy(
        { target: child, peek } as any,
        apiHandler,
      );

    return isArray(h1)
      ? activateNode(child.childNodes, h1, modules, peekResIndex)
      : [() => {
        new Function(arg0, apiArg, modulesArg, resourcesArg, h1)(
          api,
          api,
          modules,
          peekResIndex,
        );
      }];
  });

/**
 * Attach JS hooks produced by a jsx render
 */
export const a = (
  activation: Activation,
  modules: string[],
  resources: [string, JSONable][],
  nodes: NodeList | Node[],
): Promise<void> => (
  trackChildren(doc),
    setResources(resources),
    Promise
      .all(modules.map((m) => import(m)))
      .then((ms) =>
        forEach(
          // Batch activations so that nodes are correctly read, allowing DOM manipulation
          activateNode(
            nodes,
            activation,
            ms,
            (i) => peek(resources[i][0]),
          ),
          call,
        )
      )
);
