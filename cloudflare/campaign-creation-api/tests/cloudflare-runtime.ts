// Node-only test shim. Worker bundles use the real Cloudflare runtime.
export class WorkerEntrypoint<Env=unknown>{protected env:Env;protected ctx:ExecutionContext;constructor(ctx:ExecutionContext,env:Env){this.ctx=ctx;this.env=env;}}
