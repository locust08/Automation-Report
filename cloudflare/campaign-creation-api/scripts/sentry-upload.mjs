import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {SentryCli} from '@sentry/cli';

// Operator/CI only: never bundle an upload token into a Worker or deployment vars.
const {SENTRY_AUTH_TOKEN,SENTRY_ORG,SENTRY_PROJECT,SENTRY_RELEASE,SENTRY_SERVICE,SENTRY_BUNDLE_DIR}=process.env;
if(!SENTRY_AUTH_TOKEN)throw new Error('Set SENTRY_AUTH_TOKEN in operator/CI secrets.');
if(SENTRY_ORG!=='ai-hive-sdn-bhd'||SENTRY_PROJECT!=='digitalbee-mcp')throw new Error('Upload target must be ai-hive-sdn-bhd/digitalbee-mcp.');
if(!['digitalbee-mcp','m04'].includes(SENTRY_SERVICE)||!new RegExp(`^${SENTRY_SERVICE}@(?:[a-f0-9]{7,64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$`).test(SENTRY_RELEASE??''))throw new Error('Use the exact service-specific deployed release.');
const directory=resolve(SENTRY_BUNDLE_DIR??'.dry-run');
if(!existsSync(resolve(directory,'index.js'))||!existsSync(resolve(directory,'index.js.map')))throw new Error('Supply the exact approved Wrangler deployment bundle and index.js.map.');
const map=JSON.parse(readFileSync(resolve(directory,'index.js.map'),'utf8'));
if(map.version!==3||!Array.isArray(map.sources))throw new Error('Invalid deployment source map.');
const cli=new SentryCli(null,{org:SENTRY_ORG,project:SENTRY_PROJECT});
await cli.releases.new(SENTRY_RELEASE,{projects:[SENTRY_PROJECT]});
await cli.releases.uploadSourceMaps(SENTRY_RELEASE,{include:[directory],urlPrefix:'~',rewrite:true,validate:true});
await cli.releases.finalize(SENTRY_RELEASE);
console.log(`Source maps uploaded for ${SENTRY_RELEASE} to ${SENTRY_ORG}/${SENTRY_PROJECT}.`);
