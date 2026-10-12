import {defineConfig} from 'vitest/config';
export default defineConfig({resolve:{alias:{'cloudflare:workers':new URL('./tests/cloudflare-runtime.ts',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')}}});
