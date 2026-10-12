import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {directory,manifestPath,files,release,checkedManifest,save,cli,configuration,checkedConfiguration} from './posthog-artifacts.mjs';
const selected=release(),version=selected.release.slice(selected.service.length+1);
const releaseArgs=['--release-name',selected.service,'--release-version',version];
if(!process.env.POSTHOG_CLI_API_KEY||process.env.POSTHOG_CLI_PROJECT_ID!=='503297'||process.env.POSTHOG_CLI_HOST!=='https://us.posthog.com')throw new Error('Authenticate the PostHog CLI for the approved AI Hive Web Project (503297, US). Set operator-only POSTHOG_CLI_API_KEY, POSTHOG_CLI_PROJECT_ID and POSTHOG_CLI_HOST. Preparation also requires this credential to register release metadata.');
if(process.argv.includes('--prepare')){
 if(existsSync(manifestPath))throw new Error('Artifact is already prepared. Use a fresh build directory to change it.');
 const config=configuration();if(config.value.vars?.POSTHOG_RELEASE!==selected.release||config.value.vars?.POSTHOG_HOST!=='https://us.i.posthog.com'||config.value.vars?.POSTHOG_ENVIRONMENT!=='production')throw new Error('Select the exact approved production configuration and release before preparation.');
 const map=JSON.parse(readFileSync(join(directory,'index.js.map'),'utf8'));if(map.version!==3||!Array.isArray(map.sources))throw new Error('Invalid source map');
 save({...selected,prepared:false,files:files(),uploaded:false,configurationHash:config.hash,configurationPath:config.path,startedAt:new Date().toISOString()});
 cli(['sourcemap','inject','--directory',directory,...releaseArgs]);
 const code=readFileSync(join(directory,'index.js'),'utf8');if(!code.includes('chunkId='))throw new Error('Missing injected chunk metadata');
 save({...selected,prepared:true,configurationHash:config.hash,configurationPath:config.path,files:files(),uploaded:false,preparedAt:new Date().toISOString()});
 console.log('Prepared exact injected bundle; deploy with posthog:deploy after upload.');
}else{
 const manifest=checkedManifest();checkedConfiguration(manifest);
 if(!process.env.POSTHOG_CLI_API_KEY||!/^\d+$/.test(process.env.POSTHOG_CLI_PROJECT_ID??'')||!['https://us.posthog.com','https://eu.posthog.com'].includes(process.env.POSTHOG_CLI_HOST??''))throw new Error('Set operator-only POSTHOG_CLI_API_KEY, POSTHOG_CLI_PROJECT_ID and POSTHOG_CLI_HOST for the approved dashboard project.');
 cli(['sourcemap','upload','--directory',directory,...releaseArgs]);
 checkedManifest();save({...manifest,uploaded:true,projectId:process.env.POSTHOG_CLI_PROJECT_ID,cliHost:process.env.POSTHOG_CLI_HOST,uploadedAt:new Date().toISOString()});
}
