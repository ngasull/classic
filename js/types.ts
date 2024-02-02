export type Resource<T extends JSONable> = {
  uri: string;
  value: T | Promise<T>;
};

export type JS<T> = WrappedPureJS<T> | WrappedReactiveJS<T>;

export type WrappedPureJS<T> =
  & (T extends (...args: infer Args) => infer R ? ((
      ...args: {
        [I in keyof Args]:
          | PureJS<Args[I]>
          | (Args[I] extends JSONable ? Args[I] : never)
          | (Args[I] extends (...args: infer AArgs) => infer AR ? (
              ...args: { [AI in keyof AArgs]: WrappedPureJS<AArgs[AI]> }
            ) => JS<AR>
            : never);
      }
    ) => WrappedPureJS<R>)
    : unknown)
  & (T extends JSONLiteral ? unknown
    : { readonly [K in keyof Omit<T, typeof jsSymbol>]: WrappedPureJS<T[K]> })
  & PureJS<T>;

export type WrappedReactiveJS<T> =
  & (T extends (...args: infer Args) => infer R ? ((
      ...args: {
        [I in keyof Args]:
          | EvaluableJS<Args[I]>
          | (Args[I] extends JSONable ? Args[I] : never)
          | (Args[I] extends (...args: infer AArgs) => infer AR ? (
              ...args: { [AI in keyof AArgs]: WrappedReactiveJS<AArgs[AI]> }
            ) => JS<AR>
            : never);
      }
    ) => WrappedReactiveJS<R>)
    : unknown)
  & (T extends JSONLiteral ? unknown
    : {
      readonly [K in keyof Omit<T, typeof jsSymbol>]: WrappedReactiveJS<T[K]>;
    })
  & ReactiveJS<T>;

export type RawJSMeta = {
  rawJS: string;
  modules: readonly ModuleMeta[];
  resources: readonly [];
  body?: JS<unknown>;
};
// Front: Map<hash, { module: Promise, deps: hash[] }>

export type ModuleMeta = { local: string; pub: string };

export type PureJSMeta<T> = RawJSMeta & {
  _type: T;
  expression: boolean;
};

export type ReactiveJSMeta<T> =
  & Omit<PureJSMeta<T>, "resources">
  & {
    resources: readonly [Resource<JSONable>, ...Resource<JSONable>[]]; // ReactiveJSExpression expects an array variable `_$` that contains these resources' value
  };

export type RawJS = { [jsSymbol]: RawJSMeta };

export type PureJS<T> = { [jsSymbol]: PureJSMeta<T> };

export type ReactiveJS<T> = { [jsSymbol]: ReactiveJSMeta<T> };

export type EvaluableJS<T> = ReactiveJS<T> | PureJS<T>;

export type ResourceGroup<
  T extends Record<string, JSONable>,
  U extends string,
> = ((v: { [k in ParamKeys<U>]: string | number }) => WrappedReactiveJS<T>) & {
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

export type PureJSable =
  | JSONable
  | undefined
  | PureJSable[]
  | { [k: string]: PureJSable; [jsSymbol]?: never }
  | PureJS<any>;

export type ReactiveJSable =
  | JSONable
  | undefined
  | ReactiveJSable[]
  | { [k: string]: ReactiveJSable; [jsSymbol]?: never }
  | PureJS<any>
  | ReactiveJS<any>;

export const jsSymbol = Symbol("js");

export const isPureJS = (v: unknown): v is RawJS =>
  v != null && (typeof v === "object" || typeof v === "function") &&
  jsSymbol in v;

export const isEvaluable = <T>(v: unknown): v is EvaluableJS<T> =>
  isPureJS(v) && "expression" in v[jsSymbol] && v[jsSymbol].expression === true;

export const isJSExpression = <T>(v: unknown): v is PureJS<T> =>
  isPureJS(v) && "expression" in v[jsSymbol] &&
  v[jsSymbol].expression === true && !v[jsSymbol].resources.length;

export const isReactive = <T>(v: unknown): v is ReactiveJS<T> =>
  isPureJS(v) && "expression" in v[jsSymbol] &&
  v[jsSymbol].expression === true && v[jsSymbol].resources.length > 0;

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
