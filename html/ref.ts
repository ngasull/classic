import { Context } from "@classic/context";
import {
  type JSable,
  type JSMeta,
  JSMetaBase,
  jsSymbol,
  mkJS,
  useJsContext,
} from "@classic/js";

export type RefTree =
  ([JSable<EventTarget>] | [JSable<EventTarget>, RefTree])[];

/**
 * Tuple holding refs attached to a jsx tree render.
 * First holds node index, second represents: children if present, otherwise (undefined) means next ref is associated.
 */
export type Activation = ([number] | [number, Activation])[];

const $refs = Context.for<JSMetaRefStore>("classic.refs");

export const mkRef = <T extends EventTarget>() => mkJS(new JSMetaRef<T>());

class JSMetaRef<T extends EventTarget = EventTarget> extends JSMetaBase<T> {
  override template() {
    const refs = $refs.use();
    return [refs, "[", refs.get(this).toString(), "]"];
  }
}

export const initRefs = <Args extends unknown[], T>(
  refs: RefTree,
  entry: string,
  cb: (...args: Args) => T,
  ...args: Args
): T => $refs.provide(new JSMetaRefStore(refs, entry), cb, ...args);

class JSMetaRefStore extends JSMetaBase<number[]> {
  readonly #refs: RefTree;
  readonly #entry: string;
  readonly #refsGlobalIndex = new Map<JSMeta, number>();
  #usedRefs = new Set<JSMeta>();
  #retainedRefs?: Map<JSMeta, number>;

  constructor(refs: RefTree, entry: string) {
    super();
    this.#refs = refs;
    this.#entry = entry;

    let order = 0;
    const indicateRefs = (refs: RefTree) =>
      refs.forEach(([ref, subTree]) => {
        this.#refsGlobalIndex.set(ref[jsSymbol], order++);
        if (subTree) indicateRefs(subTree);
      });
    indicateRefs(refs);
  }

  override template(): (string | JSMeta)[] {
    if (useJsContext().scanning) return ["[]"];

    const filterRefs = (refs: RefTree): Activation =>
      refs.flatMap(([r, subRefs], i) => {
        const activation: Activation = [];
        if (this.#getRetained().has(r[jsSymbol])) activation.push([i]);
        if (subRefs) {
          const subActivation = filterRefs(subRefs);
          if (subActivation.length) activation.push([i, subActivation]);
        }
        return activation;
      });
    return [
      // Recursively remap filtered refs activation to node tree
      `(()=>{let w=(n,a)=>a.flatMap(([c,s])=>{let m=n,i=0;for(;i<c;i++)m=m.nextSibling;return s?w(m.firstChild,s):m});return w(`,
      this.#entry,
      `,`,
      JSON.stringify(filterRefs(this.#refs)),
      `)})()`,
    ];
  }

  get(ref: JSMetaRef): number {
    if (!this.#refsGlobalIndex.has(ref)) {
      throw Error(`A ref used in JS isn't rendered at the same time`);
    }
    this.#usedRefs.add(ref);

    return useJsContext().scanning ? -1 : this.#getRetained().get(ref)!;
  }

  #getRetained(): Map<JSMeta, number> {
    return this.#retainedRefs ??= new Map(
      [...this.#usedRefs]
        .sort((a, b) =>
          this.#refsGlobalIndex.get(a)! - this.#refsGlobalIndex.get(b)!
        )
        .map((r, i) => [r, i]),
    );
  }
}
