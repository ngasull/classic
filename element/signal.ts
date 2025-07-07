import { isFunction } from "@classic/util";

/** Signal: a [getter, setter] pair */
export type Signal<T> = readonly [() => T, (v: T) => void];

const tracked: (() => void)[] = [];

/**
 * Track accessed signals (rerun on updates)
 *
 * @param cb Tracked scope
 */
export const track = <T>(cb: () => T): void => {
  tracked.unshift(cb);
  try {
    cb();
  } finally {
    tracked.shift();
  }
};

/**
 * Track value and execute related logic on change
 *
 * @param s Function returning tracked value
 * @param listener Logic to execute receiving current and previous result for `s`. Does not execute initially
 */
export const onChange = <T>(
  s: () => T,
  listener: (v: T, prev: T) => void,
): void => {
  let isInit: 1 | undefined, prev: T;
  track(() => {
    let v = s(); // Eagerly initialize tracking
    isInit ? listener(v, prev) : isInit = 1;
    prev = v;
  });
};

type ReturnTypeOr<T> = T extends (...args: unknown[]) => infer T ? T : T;

export const callOrReturn = <T>(v: T): ReturnTypeOr<T> =>
  isFunction(v) ? v() : v as never;

/**
 * Declare a {@linkcode Signal}
 *
 * @param init Initial value - can be a function, in which case its value is lazily computed
 * @returns The {@linkcode Signal}
 */
export const signal = <T>(init: T | (() => T)): Signal<T> => {
  let isInit: 1 | undefined, v: T, cbs = new Set<() => void>();
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
