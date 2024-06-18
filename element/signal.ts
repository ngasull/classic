import { isFunction } from "./util.ts";

export type Signal<T> = ReadonlySignal<T> & ((v: T) => T);

type ReadonlySignal<T> = (() => T) & {
  readonly [$cbs]: Set<() => void>;
};

const $cbs = Symbol();
const tracked: (() => void)[] = [];

export const track = (cb: () => void) => {
  tracked.unshift(cb);
  try {
    cb();
  } finally {
    tracked.shift();
  }
};

export const onChange = <T extends Signal<unknown>[]>(
  signals: T,
  listener: (
    ...vs: { [I in keyof T]: T[I] extends Signal<infer T> ? T : never }
  ) => void,
): void => {
  let cb = () => listener(...signals.map((s) => s()) as never);
  signals.forEach((s) => s[$cbs].add(cb));
};

export const callOrReturn = <T>(
  v: T,
): T extends (...args: unknown[]) => infer T ? T : T => isFunction(v) ? v() : v;

export const signal = <T>(init: () => T): Signal<T> => {
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
    return isInit ? v : (isInit = 1, v = init());
  };
  s[$cbs] = new Set<() => void>();
  return s;
};
