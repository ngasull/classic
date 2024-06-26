import { isFunction } from "./util.ts";

export type Signal<T> = (() => T) & ((v: T) => T) & {
  readonly [$cbs]: Set<() => void>;
};

const $cbs = Symbol();
const tracked: (() => void)[] = [];

const track = <T>(cb: () => T): T => {
  tracked.unshift(cb);
  try {
    return cb();
  } finally {
    tracked.shift();
  }
};

export const on = <T>(
  s: () => T,
  listener: (v: T, prev: T) => void,
): void => {
  let isInit = 0, prev: T;
  track(() => {
    let v = s(); // Eagerly initialize tracking
    isInit ? listener(v, prev) : isInit = 1;
    prev = v;
  });
};

type ReturnTypeOr<T> = T extends () => infer T ? T : T;

export const callOrReturn = <T>(v: T): ReturnTypeOr<T> =>
  isFunction(v) ? v() : v;

export const signal = <T>(init: T | (() => T)): Signal<T> => {
  let isInit = 0, v: T;
  let s = (...args: [] | [T]) => {
    if (args.length) {
      if (args[0] !== v) {
        v = args[0];
        let prevCbs = s[$cbs];
        s[$cbs] = new Set();
        prevCbs.forEach(track);
      }
    } else if (tracked[0]) {
      s[$cbs].add(tracked[0]);
    }
    return isInit ? v : (isInit = 1, v = callOrReturn(init) as T);
  };
  s[$cbs] = new Set<() => void>();
  return s as never;
};
