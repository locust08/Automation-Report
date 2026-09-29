import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
// Run through the existing primary checkout's Doppler configuration. Values stay in memory/stdin.
const backend=fileURLToPath(new URL('../',import.meta.url));
const digitalbee=process.env.DIGITALBEE_WORKER_ROOT;
if(!digitalbee)throw new Error('Set DIGITALBEE_WORKER_ROOT to the verified checkout.');
const names=['M04_SERVICE_TOKEN','M04_DELEGATION_KEY','DIGITALBEE_GRANT_VERIFY_TOKEN'];
const keys=Object.fromEntries(names.map(name=>[name,process.env[name]||randomBytes(48).toString('base64url')]));
if(Object.values(keys).some(value=>value.length<32))throw new Error('Internal service keys are incomplete.');
const google={GOOGLE_ADS_CLIENT_ID:process.env.GOOGLE_OAUTH_CLIENT_ID,GOOGLE_ADS_CLIENT_SECRET:process.env.GOOGLE_OAUTH_CLIENT_SECRET,GOOGLE_ADS_REFRESH_TOKEN:process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  ...(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?{GOOGLE_ADS_DEVELOPER_TOKEN:process.env.GOOGLE_ADS_DEVELOPER_TOKEN}:{}),GOOGLE_ADS_CONNECTION_REVISION:process.env.M04_GOOGLE_CONNECTION_REVISION||randomUUID()};
if(!google.GOOGLE_ADS_CLIENT_ID||!google.GOOGLE_ADS_CLIENT_SECRET||!google.GOOGLE_ADS_REFRESH_TOKEN)throw new Error('Existing Google credentials unavailable.');
async function run(exe,args,cwd,input){
  const env={...process.env,CLOUDFLARE_ACCOUNT_ID:'e7c515dde995479daacd82ad79dfc3e8'};
  // Use the existing Wrangler account login rather than an unrelated inherited Doppler CF token.
  delete env.CLOUDFLARE_API_TOKEN;
  await new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    child.stdout.resume();child.stderr.resume();child.on('error',()=>reject(new Error('Secret configuration executable unavailable.')));
    child.on('close',code=>code===0?resolve():reject(new Error(`Secret configuration failed (exit ${code}). Values were not printed.`)));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
for(const [name,value] of Object.entries({...keys,M04_GOOGLE_CONNECTION_REVISION:google.GOOGLE_ADS_CONNECTION_REVISION})){
  if(!process.env[name])await run('doppler',['secrets','set',name,'--project','locus-t-ai-backend','--config','dev','--no-read-env','--silent'],process.cwd(),value);
}
await run(process.execPath,[resolve(backend,'node_modules/wrangler/bin/wrangler.js'),'secret','bulk'],backend,JSON.stringify({...keys,...google}));
console.log('M04 secrets installed (names only): '+Object.keys({...keys,...google}).join(', '));
await run(process.execPath,[resolve(digitalbee,'node_modules/wrangler/bin/wrangler.js'),'secret','bulk'],digitalbee,JSON.stringify(keys));
console.log('DigitalBee internal service secrets installed (names only): '+names.join(', '));
