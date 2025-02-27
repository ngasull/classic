import {
  type JSable,
  type JSMeta,
  JSMetaBase,
  type JSMetaContext,
  jsSymbol,
  mkJS,
} from "@classic/js";
import { type Context, Key } from "@classic/context";

export type RefTree =
  ([JSable<EventTarget>] | [JSable<EventTarget>, RefTree])[];

/**
 * Tuple holding refs attached to a jsx tree render.
 * First holds node index, second represents: children if present, otherwise (undefined) means next ref is associated.
 */
export type Activation = ([number] | [number, Activation])[];

const $refs = new Key<JSMetaRefStore>("refs");

export const mkRef = <T extends EventTarget>() => mkJS(new JSMetaRef<T>());

class JSMetaRef<T extends EventTarget = EventTarget> extends JSMetaBase<T> {
  override template(context: JSMetaContext) {
    const refs = context.user.use($refs);
    return [refs, "[", refs.get(this).toString(), "]"];
  }
}

export const initRefs = (context: Context, refs: RefTree, entry: string) =>
  context.provide($refs, new JSMetaRefStore(refs, entry));

class JSMetaRefStore extends JSMetaBase<number[]> {
  override readonly isntAssignable = true;

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

  override template(_context: JSMetaContext): (string | JSMeta)[] {
    if (!this.#retainedRefs) return ["[]"];

    const filterRefs = (refs: RefTree): Activation =>
      refs.flatMap(([r, subRefs], i) => {
        const activation: Activation = [];
        if (this.#retainedRefs!.has(r[jsSymbol])) activation.push([i]);
        if (subRefs) {
          const subActivation = filterRefs(subRefs);
          if (subActivation.length) activation.push([i, subActivation]);
        }
        return activation;
      });
    return [
      // Recursively remap filtered refs activation to node tree
      `(()=>{let i=0,w=(n,a)=>a.flatMap(([c,s])=>{for(;i<c;i++)n=n.nextSibling;return s?w(n.firstChild,s):n});return w(`,
      this.#entry,
      `,`,
      JSON.stringify(filterRefs(this.#refs)),
      `)})()`,
    ];
  }

  get(ref: JSMetaRef): number {
    if (!this.#retainedRefs) {
      if (!this.#usedRefs.has(ref)) {
        if (!this.#refsGlobalIndex.has(ref)) {
          throw Error(`A ref used in JS isn't rendered at the same time`);
        }
        this.#usedRefs.add(ref);
        return -1;
      } else {
        this.#retainedRefs = new Map(
          [...this.#usedRefs]
            .sort((a, b) =>
              this.#refsGlobalIndex.get(a)! - this.#refsGlobalIndex.get(b)!
            )
            .map((r, i) => [r, i]),
        );
      }
    }

    return this.#retainedRefs.get(ref)!;
  }
}
