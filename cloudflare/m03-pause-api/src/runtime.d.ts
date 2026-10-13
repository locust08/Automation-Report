interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void }
declare module 'cloudflare:workers' {
 export class WorkerEntrypoint<E=unknown> { protected env:E; protected ctx:ExecutionContext }
}
