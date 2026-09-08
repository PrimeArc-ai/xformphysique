// Download licensed font assets from the official Google Fonts distribution.
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const families=[['Barlow Condensed','wght@700','barlowcondensed'],['Manrope','wght@400..700','manrope'],['Instrument Serif','','instrumentserif'],['DM Sans','wght@400..700','dmsans'],['Sora','wght@400..700','sora'],['IBM Plex Sans','wght@400;500;600','ibmplexsans'],['IBM Plex Mono','wght@500','ibmplexmono']];
const userAgent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
const output=[];
const records=[];
for(const [family,axis,slug] of families){
  const cssUrl=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}${axis?`:${axis}`:''}&display=block`;
  const response=await fetch(cssUrl,{headers:{'User-Agent':userAgent}});
  if(!response.ok)throw Error(`${family}: ${response.status}`);
  const css=await response.text();
  const latin=[...css.matchAll(/\/\* latin \*\/\s*(@font-face\s*\{[^}]+\})/g)].map(match=>match[1]);
  if(!latin.length)throw Error(`No Latin face for ${family}`);
  for(const [index,block] of latin.entries()){
    const url=block.match(/url\(([^)]+)\)/)[1];
    const font=await fetch(url);if(!font.ok)throw Error(`${family}: font ${font.status}`);
    const path=`assets/${slug}-${index}.woff2`;
    await writeFile(resolve(root,path),Buffer.from(await font.arrayBuffer()));
    output.push(block.replace(url,`./${path}`));
    records.push({family,cssUrl,fontUrl:url,path});
  }
  const license=await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${slug}/OFL.txt`);
  if(!license.ok)throw Error(`License missing for ${family}`);
  await writeFile(resolve(root,`assets/${slug}-OFL.txt`),await license.text());
  console.log(`${family}: ${latin.length} Latin face(s), license included.`);
}
await writeFile(resolve(root,'fonts.css'),output.join('\n\n')+'\n');
await writeFile(resolve(root,'font-sources.json'),JSON.stringify(records,null,2)+'\n');
