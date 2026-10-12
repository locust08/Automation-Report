import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {release} from './posthog-artifacts.mjs';
// Isolated operator probe: no business handlers, advertising clients or live resource mutations.
// This proves ingestion only. Actual deployed stack resolution is a separate acceptance check.
const selected=release();
const configuration=JSON.parse(readFileSync(resolve(process.env.POSTHOG_CONFIG??'.posthog-release.jsonc'),'utf8'));
const {POSTHOG_PROJECT_TOKEN,POSTHOG_HOST,POSTHOG_ENVIRONMENT}=configuration.vars;
if(POSTHOG_ENVIRONMENT!=='production'||!['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(POSTHOG_HOST)||!POSTHOG_PROJECT_TOKEN?.startsWith('phc_'))throw new Error('Use the approved PostHog production configuration.');
const source=await build({stdin:{resolveDir:process.cwd(),sourcefile:'posthog-diagnostic.ts',contents:`
 import {observeWorker,captureUnexpected} from './src/observability';
 export default observeWorker('${selected.service}',{async fetch(){const eventId=captureUnexpected(new Error('Synthetic diagnostic'),'diagnostic.synthetic');return Response.json({eventId});}});
`},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:*','cloudflare:*']});
mkdirSync('.posthog-local',{recursive:true});const checkpoint=resolve('.posthog-local',`diagnostic-${selected.service}-${selected.release}.json`);
writeFileSync(checkpoint,JSON.stringify({...selected,status:'started',startedAt:new Date().toISOString()}),{flag:'wx'});
let attempted=false,status,eventId;
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'posthog-diagnostic',modules:true,script:source.outputFiles[0].text,compatibilityDate:configuration.compatibility_date,compatibilityFlags:['nodejs_compat'],bindings:{POSTHOG_PROJECT_TOKEN,POSTHOG_HOST,POSTHOG_ENVIRONMENT,POSTHOG_RELEASE:selected.release},outboundService:async request=>{
 if(attempted||request.url!==POSTHOG_HOST+'/batch/')throw new Error('Diagnostic transmission rejected');attempted=true;
 const response=await fetch(request.url,{method:'POST',headers:{'Content-Type':'application/json',...(request.headers.get('content-encoding')?{'Content-Encoding':request.headers.get('content-encoding')}:{})},body:await request.arrayBuffer(),signal:AbortSignal.timeout(5000)});status=response.status;await response.body?.cancel();return new Response('{}',{status});
}}]}));
try{const response=await mf.dispatchFetch('https://diagnostic.invalid/');({eventId}=await response.json());for(let i=0;i<50&&status===undefined;i++)await new Promise(done=>setTimeout(done,100));}
finally{await mf.dispose();writeFileSync(checkpoint,JSON.stringify({...selected,eventId,attempted,httpStatus:status,status:status===200?'accepted_unverified':status?'rejected':'unknown',finishedAt:new Date().toISOString()},null,2)+'\n');}
console.log(JSON.stringify({...selected,eventId,httpStatus:status,receipt:checkpoint}));if(status!==200)process.exitCode=1;
// Never automatically resend an accepted/uncertain diagnostic. Verify its UUID in PostHog.
