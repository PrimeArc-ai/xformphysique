import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const cssUrl='https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&display=block';
const response=await fetch(cssUrl,{headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'}});
if(!response.ok)throw Error(response.status);
const css=await response.text();
const faces=[...css.matchAll(/\/\* latin \*\/\s*(@font-face\s*\{[^}]+\})/g)].map(match=>match[1]);
if(faces.length!==3)throw Error(`Expected three font weights, got ${faces.length}`);
const local=[], sources=[];
for(const [index,block] of faces.entries()){
  const url=block.match(/url\(([^)]+)\)/)[1];
  const font=await fetch(url);if(!font.ok)throw Error(font.status);
  const path=`assets/chakra-petch-${index}.woff2`;
  await writeFile(resolve(root,path),Buffer.from(await font.arrayBuffer()));
  local.push(block.replace(url,`./${path}`));sources.push({cssUrl,url,path});
}
const license=await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/chakrapetch/OFL.txt');
if(!license.ok)throw Error(license.status);
await writeFile(resolve(root,'assets/chakra-petch-OFL.txt'),await license.text());
await writeFile(resolve(root,'chakra.css'),local.join('\n\n')+'\n');
await writeFile(resolve(root,'font-sources.json'),JSON.stringify(sources,null,2)+'\n');
console.log('Chakra Petch 500 / 600 / 700 downloaded with license.');
