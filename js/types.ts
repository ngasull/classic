export type Resource<T extends JSONable> = {
  uri: string;
  value: T | Promise<T>;
};

export type JS<T> =
  & (T extends (...args: infer Args) => infer R ? ((
      ...args: {
        [I in keyof Args]:
          | JSable<Args[I]>
          | (Args[I] extends JSONable ? Args[I] : never)
          | (Args[I] extends (...args: infer AArgs) => infer AR ? (
              ...args: { [AI in keyof AArgs]: JS<AArgs[AI]> }
            ) => JS<AR>
            : never);
      }
    ) => JS<R>)
    : unknown)
  & (T extends JSONLiteral ? unknown
    : { readonly [K in keyof Omit<T, typeof jsSymbol>]: JS<T[K]> })
  & JSable<T>;

export type ModuleMeta = { local: string; pub: string };

export type JSMeta<T> = {
  _type: T;
  rawJS: string;
  modules: readonly ModuleMeta[];
  resources: readonly Resource<JSONable>[]; // ReactiveJSExpression expects an array variable `_$` that contains these resources' value
  body?: JS<unknown>;
  expression: boolean;
};

export type JSable<T> = { [jsSymbol]: JSMeta<T> };

export type ResourceGroup<
  T extends Record<string, JSONable>,
  U extends string,
> = ((v: { [k in ParamKeys<U>]: string | number }) => JS<T>) & {
  pattern: U;
  each: (values: { [k in ParamKeys<U>]: string | number }[]) => Resources<T, U>;
};

export type Resources<T extends Record<string, JSONable>, U extends string> = {
  group: ResourceGroup<T, U>;
  values: Resource<T>[];
};

export type JSONLiteral = string | number | boolean | null;

export type JSONRecord = {
  [member: string]: JSONLiteral | JSONArray | JSONRecord | undefined; // In order to handle optional properties
  [jsSymbol]?: never;
};

export type JSONArray = ReadonlyArray<JSONLiteral | JSONArray | JSONRecord>;

export type JSONable = JSONLiteral | JSONRecord | JSONArray;

export type ImplicitlyJSable =
  | JSONLiteral
  | undefined
  | JSable<any>
  | ImplicitlyJSable[]
  | { [k: string]: ImplicitlyJSable; [jsSymbol]?: never };

export const jsSymbol = Symbol("js");

export const isJSable = <T>(v: unknown): v is JSable<T> =>
  v != null && (typeof v === "object" || typeof v === "function") &&
  jsSymbol in v;

export const isEvaluable = <T>(v: unknown): v is JSable<T> =>
  isJSable(v) && "expression" in v[jsSymbol] && v[jsSymbol].expression === true;

export const isPure = <T>(v: unknown): v is JSable<T> =>
  isEvaluable(v) && !v[jsSymbol].resources.length;

export const isReactive = <T>(v: unknown): v is JSable<T> =>
  isEvaluable(v) && v[jsSymbol].resources.length > 0;

// From Hono
// https://github.com/honojs/hono/blob/db3387353f23e0914faf8169323c06e9d9658c20/src/types.ts#L560C1-L572C19
type ParamKeyName<NameWithPattern> = NameWithPattern extends
  `${infer Name}{${infer Rest}` ? Rest extends `${infer _Pattern}?` ? `${Name}?`
  : Name
  : NameWithPattern;

type ParamKey<Component> = Component extends `:${infer NameWithPattern}`
  ? ParamKeyName<NameWithPattern>
  : never;

export type ParamKeys<Path extends string> = Path extends
  `${infer Component}/${infer Rest}` ? ParamKey<Component> | ParamKeys<Rest>
  : ParamKey<Path>;
