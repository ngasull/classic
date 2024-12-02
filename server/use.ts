declare const $keyType: unique symbol;
const $ = Symbol();

type UseKey<T> = symbol & { [$keyType]: T };

export type Use = UseFn & UseProto;

type UseFn = {
  <T>(key: UseKey<T>): T;
  <Args extends any[], T>(
    use: (use: Use, ...args: Args) => T,
    ...args: Args
  ): T;
};

type UseProto = {
  readonly has: <T>(key: UseKey<T>) => boolean;
  readonly get: <T>(key: UseKey<T>) => T | undefined;
  readonly provide: <T>(key: UseKey<T>, value: T) => T;
  readonly delete: <T>(key: UseKey<T>) => void;
  readonly fork: () => Use;
};

type UsePrivate = {
  parent?: Use;
  map: Map<UseKey<unknown>, unknown>;
};

export const initUse = (parent?: Use): Use => {
  const useFn = <T, Args extends any[]>(
    keyOrUse: UseKey<T> | ((use: Use, ...args: Args) => T),
    ...args: Args
  ) => {
    if (typeof keyOrUse === "function") {
      return keyOrUse(use, ...args);
    } else {
      if (useFn[$].map.has(keyOrUse)) {
        return useFn[$].map.get(keyOrUse) as T;
      } else if (useFn[$].parent) {
        return useFn[$].parent(keyOrUse);
      } else {
        throw new Error(
          `Looking up unset context "${keyOrUse.description ?? ""}"`,
        );
      }
    }
  };

  useFn[$] = { parent, map: new Map() } as UsePrivate;

  const use = Object.assign(useFn, useProto);

  return use;
};

const useProto = {
  has<T>(key: UseKey<T>): boolean {
    return this[$].map.has(key) || !!this[$].parent?.has(key);
  },

  get<T>(key: UseKey<T>): T | undefined {
    return this[$].map.has(key)
      ? this[$].map.get(key) as T
      : this[$].parent?.get<T>(key);
  },

  provide<T>(key: UseKey<T>, value: T): T {
    this[$].map.set(key, value);
    return value;
  },

  delete<T>(key: UseKey<T>): void {
    this[$].map.delete(key);
  },

  fork(): Use {
    return initUse(this);
  },
} satisfies UseProto & ThisType<Use & Record<typeof $, UsePrivate>>;

export const createUseKey = <T>(hint: string): UseKey<T> =>
  Symbol(hint) as UseKey<T>;
