import {
  JSONable,
  peek,
  registerCleanup,
  setResources,
  subStore,
  trackChildren,
} from "./dom/store.ts";
import { call, doc, first, forEach, fromEntries, isArray } from "./dom/util.ts";

/**
 * Tuple holding JS hooks produced by a jsx render.
 * First holds node index, rest represents activation info.
 */
export type Activation = [number, ...ActivationInfo][];

/** Either JS with resource dependencies or activation for child nodes. */
export type ActivationInfo =
  | [string, ...number[]] // [Raw JS, ...Resources]
  | [Activation];

/**
 * Lifecycle functions exposed through jsx `ref`.
 */
export type LifecycleFunctions = {
  /** Registers callback to execute when current node would be removed. */
  cleanup: (cb: () => void) => void;
  /** Registers callback to execute when any dependent resource changes. */
  track: (cb: () => void) => void;
};

const targetSymbol = Symbol();

const activateNode = (
  nodes: NodeList | Node[],
  activation: Activation,
  modules: Record<string, unknown>,
  resources: string[],
  resourcesProxyHandler: ProxyHandler<
    { (rs: number[]): JSONable[]; [targetSymbol]: number[]; u: string[] }
  > = {
    get: (target, i) =>
      i == "u"
        ? target.u ??= new Proxy(
          target[targetSymbol],
          resourcesUriProxyHandler,
        ) as unknown as string[]
        : i in Array.prototype
        ? target[targetSymbol][i as any]
        : peek(resources[target[targetSymbol][i as any]]),
  },
  resourcesUriProxyHandler: ProxyHandler<number[]> = {
    get: (target, i) => resources[target[i as any]],
  },
): ReadonlyArray<() => void> =>
  activation.flatMap(([childIndex, h1, ...rs]) => {
    let child = nodes[childIndex];

    return isArray(h1)
      ? activateNode(
        child.childNodes,
        h1,
        modules,
        resources,
        resourcesProxyHandler,
        resourcesUriProxyHandler,
      )
      : [() => {
        let resourcesProxy = (function mkResProxy(rs: number[]) {
            let callArray = (...argArray: number[]) =>
              mkResProxy(argArray.map((r) => rs[r]));
            callArray[targetSymbol] = rs;
            return new Proxy(
              callArray as unknown as JSONable[] & {
                (rs: number[]): JSONable[];
                [targetSymbol]: number[];
                u: string[];
              },
              resourcesProxyHandler,
            );
          })(rs as number[]),
          lifecycleFunctions: LifecycleFunctions = {
            cleanup: (cb: () => void) => registerCleanup(child, cb),
            track: (cb: () => void) =>
              registerCleanup(
                child,
                subStore((rs as number[]).map((i) => resources[i]), cb),
              ),
          };

        new Function("$0", "$1", "__", "_$", h1)(
          child,
          lifecycleFunctions,
          modules,
          resourcesProxy,
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
      .all(modules.map((m) => import(m).then((r) => [m, r] as const)))
      .then((ms) =>
        forEach(
          // Batch activations so that nodes are correctly read, allowing DOM manipulation
          activateNode(
            nodes,
            activation,
            fromEntries(ms),
            resources.map(first),
          ),
          call,
        )
      )
);
