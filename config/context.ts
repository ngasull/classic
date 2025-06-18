import { $state } from "./config.ts";

/** API to set and get arbitrary values across current config run */
export class ConfigContext<T> {
  /**
   * Set an arbitrary value to this config run
   *
   * @param value Attached value
   * @returns Passed `value`
   */
  set(value: T): T {
    if (value === undefined) {
      $state.use().run.userData.delete(this);
    } else {
      $state.use().run.userData.set(this, value);
    }
    return value;
  }

  /** Retrieve an arbitrary config run context value */
  get(): T | undefined {
    return $state.use().run.userData.get(this) as T | undefined;
  }
}
