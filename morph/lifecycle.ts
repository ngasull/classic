const cleanups: Map<Node, Array<() => void>> =
  (globalThis as any)[Symbol.for("classic.morph")] ??= new Map();

/**
 * Register a cleanup callback to a node
 *
 * @param target Related {@linkcode Node}
 * @param cb Cleanup callback to execute before target morphs out or immediately if target isn't inside the document
 */
export const onCleanup = (target: Node, cb: () => void): void => {
  if (target.getRootNode() == target.ownerDocument) {
    let cs = cleanups.get(target as Node) ?? [];
    cs.push(cb);
    cleanups.set(target as Node, cs);
  } else {
    cb();
  }
};

/**
 * Run cleanup callbacks of a DOM subtree
 *
 * @param tree Document subtree root (clean it and any node inside it)
 */
export const doCleanup = (tree: Node): void => {
  for (let [target, cbs] of cleanups) {
    if (tree.contains(target)) {
      cbs.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.error(e);
        }
      });
    }
  }
};
