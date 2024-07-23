import { isFunction } from "@classic/util";

export type Signal<T> = readonly [() => T, (v: T) => void];

const tracked: (() => void)[] = [];

export const track = <T>(cb: () => T): void => {
  tracked.unshift(cb);
  try {
    cb();
  } finally {
    tracked.shift();
  }
};

export const onChange = <T>(
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
  let isInit = 0, v: T, cbs = new Set<() => void>();
  return [
    () => {
      if (tracked[0]) cbs.add(tracked[0]);
      return isInit ? v : (isInit = 1, v = callOrReturn(init) as T);
    },
    (a) => {
      if (!isInit || a !== v) {
        isInit = 1;
        v = a;
        let prevCbs = cbs;
        cbs = new Set();
        prevCbs.forEach(track);
      }
    },
  ];
};
