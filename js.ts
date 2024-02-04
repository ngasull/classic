import type {
  ImplicitlyJSable,
  JS,
  JSable,
  JSMeta,
  JSONable,
  ModuleMeta,
  ParamKeys,
  Resource,
  ResourceGroup,
  Resources,
} from "./js/types.ts";
import { isEvaluable, isReactive, jsSymbol } from "./js/types.ts";

const modulesArg = "__";

const resourcesArg = "_$";

const targetSymbol = Symbol("target");

const jsProxyHandler: ProxyHandler<{
  (...argArray: ReadonlyArray<JSable<unknown> | JSONable>): JSable<unknown>;
  [targetSymbol]: JSable<unknown>;
}> = {
  has(target, p) {
    const expr = target[targetSymbol];
    return p === jsSymbol || p in expr;
  },

  get(target, p) {
    const expr = target[targetSymbol];
    return typeof p === "symbol"
      ? expr[p as typeof jsSymbol]
      : safeRecordKeyRegExp.test(p as string)
      ? js`${expr}.${unsafe(p as string)}`
      : js`${expr}[${JSON.stringify(p)}]`;
  },
};

export const js = (<T>(
  tpl: TemplateStringsArray,
  ...exprs: ImplicitlyJSable[]
) => {
  const modules: Record<string, ModuleMeta> = {};

  let resIndex = 0;
  const resources = new Map<Resource<JSONable>, number>();
  const trackResource = (res: Resource<JSONable>) => {
    if (!resources.has(res)) {
      resources.set(res, resIndex++);
    }
    return resources.get(res)!;
  };

  const handleExpression = (expr: ImplicitlyJSable): string => {
    if (expr === null) {
      return `null`;
    } else if (expr === undefined) {
      return `undefined`;
    } else if (
      (typeof expr === "function" || typeof expr === "object") &&
      jsSymbol in expr && expr[jsSymbol]
    ) {
      for (const m of expr[jsSymbol].modules) {
        modules[m.pub] = m;
      }

      const subres = expr[jsSymbol].resources.map(trackResource);
      if (subres.length > 0 && subres.some((r, i) => r !== i)) {
        return `(${resourcesArg}=>(${expr[jsSymbol].rawJS}))(${resourcesArg}(${
          subres.join(",")
        }))`;
      } else {
        return expr[jsSymbol].rawJS;
      }
    } else if (Array.isArray(expr)) {
      return `[${expr.map(handleExpression).join(",")}]`;
    } else if (typeof expr === "object") {
      return `{${
        Object.entries(expr as { [k: string]: ImplicitlyJSable })
          .map(
            ([k, expr]) =>
              `${
                typeof k === "number" || safeRecordKeyRegExp.test(k)
                  ? k
                  : JSON.stringify(k)
              }:${handleExpression(expr)}`,
          )
          .join(",")
      }}`;
    } else {
      return JSON.stringify(expr);
    }
  };

  const rawParts = [];
  for (let i = 0; i < exprs.length; i++) {
    rawParts.push(tpl[i], handleExpression(exprs[i]));
  }

  if (tpl.length > exprs.length) rawParts.push(tpl[exprs.length]);

  const expr = mkPureJS(rawParts.join("")) as unknown as JSable<T>;
  expr[jsSymbol].expression = true;
  expr[jsSymbol].modules = Object.values(modules);

  if (resources.size > 0) {
    expr[jsSymbol].resources = [...resources.keys()] as [
      Resource<JSONable>,
      ...Resource<JSONable>[],
    ];
  }

  const callExpr = (
    ...argArray: ReadonlyArray<JSable<unknown> | JSONable>
  ) => {
    let lastIndex = 0;
    const resStore: Record<string, [number, Resource<JSONable>]> = {};
    const store = (res: Resource<JSONable>) => {
      resStore[res.uri] ??= [lastIndex++, res];
      return resStore[res.uri][0];
    };

    const jsArgs = unsafe(
      argArray
        .map(function mapArg(a): string {
          return isEvaluable(a)
            ? a[jsSymbol].resources.length
              ? `((${
                a[jsSymbol].resources.map((_, i) => `$${i}`).join(",")
              })=>(${a[jsSymbol].rawJS}))(${
                a[jsSymbol].resources.map((r) => `$${store(r)}`)
              })`
              : a[jsSymbol].rawJS
            : typeof a === "function"
            ? mapArg(fn(a))
            : a === undefined
            ? "undefined"
            : JSON.stringify(a);
        })
        .join(","),
    ) as unknown as { [jsSymbol]: JSMeta<unknown> };
    jsArgs[jsSymbol].resources = Object.values(resStore).map(([, r]) => r) as [
      Resource<JSONable>,
      ...Resource<JSONable>[],
    ];

    return js`${expr}(${jsArgs})`;
  };

  callExpr[targetSymbol] = expr;

  return new Proxy(callExpr, jsProxyHandler) as unknown as JS<T>;
}) as {
  <T>(tpl: TemplateStringsArray, ...exprs: ImplicitlyJSable[]): JS<T>;
} & {
  eval: <T>(expr: JSable<T>) => Promise<T>;
  import: <M>(url: string) => JS<Promise<M>>;
  module: <M>(local: string, pub: string) => JS<M>;
  "symbol": typeof jsSymbol;
};

js.eval = async <T>(expr: JSable<T>): Promise<T> => {
  const argsBody = [`return(${expr[jsSymbol].rawJS})`];
  const args: unknown[] = [];

  if (isReactive(expr)) {
    argsBody.unshift(resourcesArg);
    args.unshift((function mkResProxy(resources): JSONable[] {
      return new Proxy(
        ((...argArray: number[]) =>
          mkResProxy(
            argArray.map((r) => resources[r]),
          )) as unknown as JSONable[],
        {
          get(_, p) {
            return resources[p as any];
          },
        },
      );
    })(await Promise.all(expr[jsSymbol].resources.map((r) => r.value))));
  }

  if (expr[jsSymbol].modules.length > 0) {
    argsBody.unshift(modulesArg);
    args.unshift(
      await Promise.all(expr[jsSymbol].modules.map((m) => import(m.local))),
    );
  }

  return new Function(...argsBody)(...args);
};

js.import = <M>(url: string) => js<Promise<M>>`import(${url})`;

js.module = <M>(local: string, pub: string) => {
  const expr = js<M>`${unsafe(modulesArg)}[${pub}]`;
  expr[jsSymbol].modules = [{ local, pub }];
  return expr;
};

js.symbol = jsSymbol;

const safeRecordKeyRegExp = /^\w+$/;

export const unsafe = (js: string) => mkPureJS(js);

const mkPureJS = (rawJS: string) => ({
  [jsSymbol]: ({
    rawJS,
    modules: [] as const,
    resources: [] as const,
  }) as unknown as JSMeta<unknown>,
});

export const resource = <T extends Record<string, JSONable>>(
  uri: string,
  fetch: () => T | Promise<T>,
) => {
  let value = null;

  const r = {
    uri,
    get value() {
      return (value ??= [fetch()])[0];
    },
  } as Resource<T>;

  const expr = js`${unsafe(resourcesArg)}[0]` as unknown as JS<
    T
  >;
  expr[jsSymbol].expression = true;
  expr[jsSymbol].resources = [r];

  return expr;
};

export const resources = <T extends Record<string, JSONable>, U extends string>(
  pattern: U,
  fetch: (params: { [k in ParamKeys<U>]: string }) => T | Promise<T>,
) => {
  const make = (
    params: { [k in ParamKeys<U>]: string | number },
  ): JS<T> => {
    const stringParams = Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ) as { [k in ParamKeys<U>]: string };

    return resource(
      pattern.replaceAll(
        /:([^/]+)/g,
        (_, p) => stringParams[p as ParamKeys<U>],
      ),
      () => fetch(stringParams),
    );
  };
  const group: ResourceGroup<T, U> = Object.assign(make, {
    pattern,
    each: (
      values: { [k in ParamKeys<U>]: string | number }[],
    ): Resources<T, U> => ({
      group,
      values: values.map((v) => make(v)[jsSymbol].resources[0]) as Resource<
        T
      >[],
    }),
  });
  return group;
};

export const statements = {
  js: <T>(tpl: TemplateStringsArray, ...exprs: ImplicitlyJSable[]) => {
    const self = js(tpl, ...exprs) as unknown as JSable<T>;
    self[jsSymbol].expression = false;
    return self;
  },
};

export const fn = <Args extends unknown[], T = void>(
  cb: (...args: { [I in keyof Args]: JS<Args[I]> }) => JSable<T>,
) => {
  const argList = unsafe(
    Array(cb.length).fill(0)
      .map((_, i) => `$${i}`)
      .join(","),
  );

  const body = cb(
    ...(Array(cb.length)
      .fill(0)
      .map((_, i) => js`${unsafe(`$${i}`)}`) as {
        [I in keyof Args]: JS<Args[I]>;
      }),
  );

  const jsfnExpr = body[jsSymbol].expression
    ? js<(...args: Args) => T>`((${argList})=>(${body}))`
    : js<
      (...args: Args) => T
    >`((${argList})=>{${body}}})`;

  jsfnExpr[jsSymbol].body = body;

  return jsfnExpr as JS<(...args: Args) => T> & {
    [jsSymbol]: { body: JSable<unknown> };
  };
};

export const sync = async <J extends JS<(...args: any[]) => any>>(
  js: J,
): Promise<{ fn: J; values: JSONable[] }> => {
  return {
    fn: js,
    values: js[jsSymbol].resources.length > 0
      ? await Promise.all(js[jsSymbol].resources.map(({ value }) => value))
      : [],
  };
};
