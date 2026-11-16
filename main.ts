import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseSnapshot,buildRadar,boardIssue,dataScript} from './lib/model.ts';
import {buildDossier} from './vendor/makefun-board.ts';
const root=fileURLToPath(new URL('.',import.meta.url));
function option(key:string,fallback:string){const args=process.argv.slice(2),i=args.indexOf('--'+key);if(i>=0){if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing '+key);return args[i+1];}return args.find(v=>v.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;}
const input=option('input','/input'),out=option('output',process.env.MAKEFUN_OUTPUT_DIR??'/output');
const s=parseSnapshot(readFileSync(statSync(input).isDirectory()?join(input,'snapshot.json'):input,'utf8'));
const {board,radar}=buildRadar(s);const issue=boardIssue(board,s);if(issue)throw new Error(issue);
mkdirSync(out,{recursive:true});
writeFileSync(join(out,'board.json'),JSON.stringify({rows:board,model:{version:radar.model_version,calibratedMultiple:radar.model.calibratedMultiple,as_of:s.as_of,board_size:board.length}})+'\n');
writeFileSync(join(out,'data.js'),dataScript(radar));
function copyFlat(dir:string){mkdirSync(join(out,dir),{recursive:true});const names=readdirSync(join(root,dir)).filter(n=>!n.startsWith('.')&&statSync(join(root,dir,n)).isFile()).sort();for(const n of names){if(!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(n))throw new Error('Invalid filename '+n);copyFileSync(join(root,dir,n),join(out,dir,n));}return names;}
copyFlat('dashboard');const shots=copyFlat('screenshots');if(shots.length<3||shots.length>4)throw new Error('Require 3–4 screenshots');
writeFileSync(join(out,'dossier.json'),buildDossier(out,{text_max_bytes:65536,screenshots:{max:4,max_bytes:524288},dashboard:{max_files:400,max_bytes:4194304}}));
console.log(`Launch Observatory: ${board.length} rows; ${radar.counts.covered}/${radar.counts.watchlist} watchlist; calibrated multiple ${radar.model.calibratedMultiple}`);
