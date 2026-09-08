import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const css=await readFile(resolve(root,'directions.css'),'utf8');
const parse=block=>Object.fromEntries([...block.matchAll(/--([a-z-]+):([^;\n}]+)/g)].map(([,key,value])=>[key,value.trim()]));
const themes={performance:parse(css.match(/:root\s*\{([^}]+)/)[1]),studio:parse(css.match(/body\.studio\s*\{([^}]+)/)[1]),precision:parse(css.match(/body\.precision\s*\{([^}]+)/)[1])};
function luminance(hex){const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const checks=[];
for(const [theme,tokens] of Object.entries(themes))for(const [text,background] of [['text','bg'],['text','surface'],['muted','surface'],['muted','raised'],['accent','selected'],['accent-ink','accent']]){
  const ratio=contrast(tokens[text],tokens[background]);checks.push({theme,text,background,ratio:Number(ratio.toFixed(2)),pass:ratio>=4.5});
}
if(checks.some(check=>!check.pass))throw Error(JSON.stringify(checks));
await writeFile(resolve(root,'tokens-and-contrast.json'),JSON.stringify({themes,checks,scope:'Selected normal-text colour pairs only; not full accessibility certification.'},null,2)+'\n');
console.log(`${checks.length} selected text/background pairs pass 4.5:1. Three distinct type and colour systems recorded.`);
