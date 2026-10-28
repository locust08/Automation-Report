import {mkdirSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';

// Build-only CI: never select production bindings, assets, vars or credentials.
const root=resolve('.'),output=join(root,'.dry-run/m18-ci');
mkdirSync(output,{recursive:true});
const production=JSON.parse(readFileSync(join(root,'wrangler.jsonc'),'utf8'));
const config=join(output,'wrangler.json');
writeFileSync(config,JSON.stringify({
  name:production.name+'-ci',
  main:resolve(root,production.main),
  compatibility_date:production.compatibility_date,
  compatibility_flags:production.compatibility_flags
},null,2)+'\n');
const env={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(output,'wrangler.log'),CLOUDFLARE_API_TOKEN:'',CLOUDFLARE_API_KEY:''};
function run(binary,args){
  const result=spawnSync(process.execPath,[resolve(root,'node_modules',binary),...args],{cwd:root,stdio:'inherit',env});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('CI command failed: '+binary);
}
run('typescript/bin/tsc',['--noEmit']);
run('wrangler/bin/wrangler.js',['deploy','--dry-run','--config',config,'--outdir',output]);
let cardSyntax='not applicable';
if(production.name==='digitalbee-mcp'){
  const card=readFileSync(join(root,'src/campaign-creation/app.ts'),'utf8');
  const embedded=card.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if(!embedded)throw new Error('Missing campaign card script');
  new Script(embedded,{filename:'campaign-planning-card.js'});
  cardSyntax='passed';
}
const artifactHash=createHash('sha256').update(readFileSync(join(output,'index.js'))).digest('hex');
const report={service:production.name,source:process.env.GITHUB_SHA??null,typecheck:'passed',workerBundle:'passed',cardSyntax,artifactSha256:artifactHash,regressionTests:0,providerCalls:0,deployed:false,dashboardAssets:'excluded; deployed assets require separate release preservation'};
writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  'M18 '+production.name+': typecheck and Worker bundle passed. Card syntax: '+cardSyntax+'.\n\nWorker SHA256: '+artifactHash+'\n\nNo regression tests, provider calls, deployment or dashboard asset build.\n');
