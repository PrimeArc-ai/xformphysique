import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),repo=resolve(root,'../..');
const old=JSON.parse(await readFile(resolve(root,'../xform-dark-directions/tokens-and-contrast.json'),'utf8')).themes.precision;
const renders=JSON.parse(await readFile(resolve(root,'render-evidence.json'),'utf8'));
const tokens=renders[0].tokens;
const mapping={bg:'bg',surface:'surface',raised:'raised',border:'border',ink:'text',muted:'muted',accent:'accent','action-ink':'accent-ink'};
const retained=Object.fromEntries(Object.entries(mapping).map(([key,oldKey])=>[key,tokens[key].toLowerCase()===old[oldKey].toLowerCase()]));
if(Object.values(retained).includes(false))throw Error(JSON.stringify(retained));
const expected={
 'output/xform-dark-directions/1-performance.png':'ea8a84e6f72e68c1731b1e7ff4f34dc9030ccb004fd953906486ca10228cb32d',
 'output/xform-dark-directions/3-precision.png':'d7881ae0889c97cf883fea6217066d22b1ffe5cbd249de832b27258e4ce6c2c4',
 'src/styles.css':'60b865ac1c38320836c98bf5814391b0d6a7cc6746f67e73b0bdde25bff6c31e',
 'src/App.jsx':'3aa03906bd7a45368afb1515a3540ceffcd00a541437c156dbf0d9df80dc50ca',
};
const preservation=[];
for(const [path,hash] of Object.entries(expected)){const actual=createHash('sha256').update(await readFile(resolve(repo,path))).digest('hex');preservation.push({path,sha256:actual,unchanged:actual===hash})}
if(preservation.some(item=>!item.unchanged))throw Error(JSON.stringify(preservation));
function luminance(hex){const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
const contrast=[['ink','bg'],['ink','surface'],['muted','surface'],['muted','raised'],['action-ink','accent']].map(([foreground,background])=>{const a=luminance(tokens[foreground]),b=luminance(tokens[background]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);return {foreground,background,ratio:Number(ratio.toFixed(2)),pass:ratio>=4.5}});
if(contrast.some(check=>!check.pass))throw Error(JSON.stringify(contrast));
const pack={name:'Precision Active',revision:2,scope:'Static proposal; not installed into the application',colour:tokens,typography:{display:{family:'Chakra Petch',weights:[600,700]},body:{family:'IBM Plex Sans',weights:[400,500,600]},smallData:{family:'IBM Plex Mono',weights:[500]},comparisonOnly:{family:'Sora',weight:500}},shape:{panelRadius:6,controlRadius:3,primaryChamfer:10,markChamfer:8},composition:'Asymmetric progress and training columns; large primary metric; compact supporting metrics'};
await writeFile(resolve(root,'theme-tokens.json'),JSON.stringify(pack,null,2)+'\n');
await writeFile(resolve(root,'validation.json'),JSON.stringify({retained,preservation,contrast},null,2)+'\n');
console.log('Palette unchanged; Performance, original Precision and checked app source preserved; five selected contrast pairs pass.');
