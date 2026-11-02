import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('./google-gate2-bundle-test.ts',import.meta.url)),output=fileURLToPath(new URL('./.google-gate2-bundle-test.mjs',import.meta.url));
try{
 await build({entryPoints:[entry],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'});
 // Miniflare's module root must contain the bundle, which lives under repository outputs/.
 const child=spawnSync(process.execPath,[output],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),stdio:'inherit',timeout:60_000});
 if(child.error||child.status!==0)throw new Error('Bundled Worker test failed');
}finally{await unlink(output).catch(()=>{});}
