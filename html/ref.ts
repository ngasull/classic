import { Context } from "@classic/context";
import { asJs, isEvaluating, type JS, type JSWrite } from "@classic/js";

export type RefTree = Array<[JS<EventTarget>] | [JS<EventTarget>, RefTree]>;

/**
 * Tuple holding refs attached to a jsx tree render.
 * First holds node index, second represents: children if present, otherwise (undefined) means next ref is associated.
 */
export type Activation = ([number] | [number, Activation])[];

const $refs = Context.for<JSMetaRefStore>("classic.refs");

export const mkRef = <T extends EventTarget>() => new JSRef<T>().js;

export class JSRef<T extends EventTarget = EventTarget> {
  declare private readonly __type: T;

  readonly js = asJs(this as unknown as T);

  [Symbol.for("classic.js")](write: JSWrite) {
    if (isEvaluating()) return write(`undefined`);

    const refs = $refs.get();
    if (refs == null) {
      throw Error(`Must init refs before writing any to JS`);
    }

    refs?.use(this.js);
    write(refs.js);
    write("[");
    write(() => write(String(refs.retained.get(this.js)!)));
    write("]");
  }
}

export const initRefs = <Args extends unknown[], T>(
  refs: RefTree,
  entry: string,
  cb: (...args: Args) => T,
  ...args: Args
): T => $refs.provide(new JSMetaRefStore(refs, entry), cb, ...args);

class JSMetaRefStore {
  readonly #refs: RefTree;
  readonly #entry: string;
  readonly #refsGlobalIndex = new Map<JS<EventTarget>, number>();
  #usedRefs = new Set<JS<EventTarget>>();

  constructor(refs: RefTree, entry: string) {
    this.#refs = refs;
    this.#entry = entry;

    let order = 0;
    const indicateRefs = (refs: RefTree) =>
      refs.forEach(([ref, subTree]) => {
        this.#refsGlobalIndex.set(ref, order++);
        if (subTree) indicateRefs(subTree);
      });
    indicateRefs(refs);
  }

  readonly js = asJs(this as unknown);

  [Symbol.for("classic.js")](write: JSWrite) {
    write(
      // Recursively remap filtered refs activation to node tree
      `(()=>{let w=(n,a)=>a.flatMap(([c,s])=>{let m=n,i=0;for(;i<c;i++)m=m.nextSibling;return s?w(m.firstChild,s):m});return w(`,
    );
    write(this.#entry);
    write(`,`);
    write(() => {
      const filterRefs = (refs: RefTree): Activation =>
        refs.flatMap(([r, subRefs], i) => {
          const activation: Activation = [];
          if (this.retained.has(r)) activation.push([i]);
          if (subRefs) {
            const subActivation = filterRefs(subRefs);
            if (subActivation.length) activation.push([i, subActivation]);
          }
          return activation;
        });

      write(JSON.stringify(filterRefs(this.#refs)));
    });
    write(`)})()`);
  }

  use(ref: JS<EventTarget>) {
    if (!this.#refsGlobalIndex.has(ref)) {
      throw Error(`A ref used in JS isn't rendered at the same time`);
    }
    this.#usedRefs.add(ref);
  }

  #retainedStore?: Map<JS<EventTarget>, number>;
  get retained(): Map<JS<EventTarget>, number> {
    return this.#retainedStore ??= new Map(
      [...this.#usedRefs]
        .sort((a, b) =>
          this.#refsGlobalIndex.get(a)! - this.#refsGlobalIndex.get(b)!
        )
        .map((r, i) => [r, i]),
    );
  }
}
