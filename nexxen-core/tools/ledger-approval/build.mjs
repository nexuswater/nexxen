import {build} from '../ledger-browser/node_modules/esbuild/lib/main.js';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('.',import.meta.url));
await build({entryPoints:[here+'browser.mjs'],bundle:true,format:'esm',platform:'browser',outfile:here+'dist/approval.js',nodePaths:[here+'../ledger-browser/node_modules']});
