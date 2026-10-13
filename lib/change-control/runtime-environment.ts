import { AsyncLocalStorage } from "node:async_hooks";

// Worker bindings are request-local. Never mutate process.env in a shared isolate.
const environments = new AsyncLocalStorage<Record<string, string | undefined>>();
export function m03RuntimeEnvironment() { return environments.getStore() ?? process.env; }
export function withM03RuntimeEnvironment<T>(env: Record<string, string | undefined>, run: () => T): T {
  return environments.run(Object.freeze({ ...env }), run);
}
