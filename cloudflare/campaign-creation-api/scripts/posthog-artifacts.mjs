import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
export const directory=resolve(process.env.POSTHOG_BUNDLE_DIR??'.posthog-bundle');
export const manifestPath=join(directory,'posthog-manifest.json');
export function hashFile(path){return createHash('sha256').update(readFileSync(path)).digest('hex');}
export function files(){return Object.fromEntries(readdirSync(directory).filter(name=>name!== 'posthog-manifest.json').sort().map(name=>{if(name!=='README.md'&&!/\.(?:js|mjs|map|txt)$/.test(name))throw new Error('Unexpected bundle artifact');return [name,hashFile(join(directory,name))];}));}
export function release(){const service=process.env.POSTHOG_SERVICE,value=process.env.POSTHOG_RELEASE;if(!['digitalbee-mcp','m04'].includes(service)||!new RegExp(`^${service}@(?:[a-f0-9]{7,64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$`).test(value??''))throw new Error('Set POSTHOG_SERVICE and exact service-specific POSTHOG_RELEASE.');return {service,release:value};}
export function checkedManifest(){const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));const selected=release();if(manifest.prepared!==true||manifest.service!==selected.service||manifest.release!==selected.release||JSON.stringify(manifest.files)!==JSON.stringify(files()))throw new Error('Prepared bundle changed or release differs; rebuild and prepare a fresh artifact.');return manifest;}
export function save(manifest){writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');}
export function cli(args){const result=spawnSync(process.execPath,[resolve('node_modules/@posthog/cli/run-posthog-cli.js'),...args],{stdio:'inherit',env:process.env});if(result.error||result.status!==0)throw new Error('PostHog CLI failed');}

export function configuration(){const path=resolve(process.env.POSTHOG_CONFIG??'.posthog-release.jsonc'),value=JSON.parse(readFileSync(path,'utf8'));return {path,value,hash:hashFile(path)};}
export function checkedConfiguration(manifest){const config=configuration();if(config.hash!==manifest.configurationHash)throw new Error('Approved deployment configuration changed after preparation. Rebuild and prepare a fresh artifact.');return config;}
