import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {directory,checkedManifest,save,checkedConfiguration} from './posthog-artifacts.mjs';
// Run only after the deployment approval required by the repository contract.
const manifest=checkedManifest();if(!manifest.uploaded)throw new Error('Upload source maps before activation.');
const {path:configPath,value:config}=checkedConfiguration(manifest);
if(config.name!==(manifest.service==='m04'?'digitalbee-m04-campaign-api':'digitalbee-mcp')||manifest.projectId!=='503297')throw new Error('Unexpected Worker or PostHog project target.');
if(config.vars?.POSTHOG_RELEASE!==manifest.release||config.vars?.POSTHOG_ENVIRONMENT!=='production'||!config.vars?.POSTHOG_PROJECT_TOKEN?.startsWith('phc_')||config.vars?.POSTHOG_HOST!==manifest.cliHost.replace('.posthog.com','.i.posthog.com'))throw new Error('Deployment configuration does not match the prepared production release/region.');
if(config.build?.command)throw new Error('Remove custom build commands from the approved snapshot: deploy must not rebuild.');
checkedManifest();
const result=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'deploy',join(directory,'index.js'),'--no-bundle','--config',configPath],{stdio:'inherit',env:process.env});
if(result.error||result.status!==0)throw new Error('Deployment failed or outcome unknown. Read back the active version before retrying.');
save({...manifest,deployedAt:new Date().toISOString(),connectedAcceptance:'pending'});
