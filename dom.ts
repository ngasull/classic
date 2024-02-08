import {
  argn,
  lifecycleArg,
  modulesArg,
  nodeArg,
  resourcesArg,
} from "./dom/arg-alias.ts";
import { registerCleanup, trackChildren } from "./dom/lifecycle.ts";
import { JSONable, peek, setResources, subStore } from "./dom/store.ts";
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

const targetSymbol = Symbol();

const arg0 = argn(0);

const effect = (
  node: Node,
  uris: string[],
  cb: () => void | (() => void),
) => {
  let cleanup: (() => void) | void = cb(),
    unsubStore = subStore(uris, () => {
      cleanup?.();
      cleanup = cb();
    });
  registerCleanup(
    node,
    () => {
      unsubStore();
      cleanup?.();
    },
  );
};

const lifecycleFns = { e: effect };

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
        ? target.u ??= target[targetSymbol].map((i) => resources[i])
        : i in Array.prototype
        ? target[targetSymbol][i as any]
        : peek(resources[target[targetSymbol][i as any]]),
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
        })(rs as number[]);

        new Function(arg0, nodeArg, lifecycleArg, modulesArg, resourcesArg, h1)(
          child,
          child,
          lifecycleFns,
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
