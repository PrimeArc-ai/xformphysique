import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.woff2':'font/woff2'};
const baselineRoot=resolve(root,'../xform-precision-v2');
const server=createServer(async(req,res)=>{try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const dir=path.startsWith('/baseline/')?baselineRoot:root;if(dir===baselineRoot)path=path.slice('/baseline'.length);const file=resolve(dir,path==='/'?'index.html':`.${path}`);if(!file.startsWith(dir+sep)){res.writeHead(403).end();return;}const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404).end()}});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done)});
let browser;const results=[],equivalence=[];
const snapshot=(scope)=>[document.querySelector(scope),...document.querySelectorAll(`${scope} *`)].map(el=>{
  const r=el.getBoundingClientRect(),s=getComputedStyle(el);
  return {tag:el.tagName,classes:el.getAttribute('class'),text:el.children.length?null:el.textContent,rect:[r.x,r.y,r.width,r.height],font:[s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight,s.letterSpacing],shape:[s.borderRadius,s.clipPath]};
});
try{browser=await chromium.launch({headless:true});for(const view of ['dashboard','theme']){
  const page=await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:2});const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(!req.url().startsWith('http://127.0.0.1:'))external.push(req.url())});
  await page.goto(`http://127.0.0.1:${server.address().port}/?view=${view}`,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  const evidence=await page.evaluate(()=>{const s=getComputedStyle(document.body);return {title:document.title,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>({family:f.family,weight:f.weight})),tokens:Object.fromEntries(['bg','surface','raised','border','ink','muted','accent','action-ink'].map(name=>[name,s.getPropertyValue(`--${name}`).trim()])),clipped:[...document.querySelectorAll('.app-frame,.app-main,.app-content,.body-panel,.training-card,.training-body,.theme-system,.signin,.signin-body,.type-sample,.component-box')].filter(el=>el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2).map(el=>({class:el.className,box:[el.clientWidth,el.clientHeight],scroll:[el.scrollWidth,el.scrollHeight]})),escaped:[...document.querySelectorAll('.artifact *')].filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.top<0||r.right>1601||r.bottom>1101}).map(el=>el.className.baseVal||el.className)}});
  const file=`precision-volt-${view}.png`;await page.screenshot({path:resolve(root,file)});
  const required=['Chakra Petch','IBM Plex Sans','IBM Plex Mono'];const missing=required.filter(name=>!evidence.fonts.some(f=>f.family.replaceAll('"','')===name));
  if(errors.length||external.length||missing.length||evidence.clipped.length||evidence.escaped.length||evidence.width!==1600||evidence.height!==1100)throw Error(JSON.stringify({view,errors,external,missing,...evidence}));
  if(evidence.fonts.some(f=>f.family.replaceAll('"','')==='Sora'))throw Error('Retired Sora font unexpectedly loaded');
  results.push({file,pixels:[3200,2200],errors,external,missing,...evidence});
  const scope=view==='dashboard'?'.app-frame':'.signin';
  const current=await page.evaluate(snapshot,scope);
  await page.goto(`http://127.0.0.1:${server.address().port}/baseline/?view=${view}`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  const baseline=await page.evaluate(snapshot,scope);
  if(JSON.stringify(current)!==JSON.stringify(baseline))throw Error(`Unexpected ${view} layout/type/content change`);
  equivalence.push({view,scope,elements:current.length,geometryTypographyShapesAndContentIdentical:true});
  console.log(`${file}: 3200 × 2200; fonts verified; no clipping; ${current.length} elements match approved layout/type.`);
  await page.close();
}
await writeFile(resolve(root,'render-evidence.json'),JSON.stringify(results,null,2)+'\n');
const luminance=(hex)=>{
  const v=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return v[0]*.2126+v[1]*.7152+v[2]*.0722;
};
const tokens=results[0].tokens;
const pairs=[['ink','bg'],['ink','surface'],['muted','surface'],['muted','raised'],['accent','surface'],['action-ink','accent']];
const contrast=pairs.map(([fg,bg])=>{const a=luminance(tokens[fg]),b=luminance(tokens[bg]);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(ratio<4.5)throw Error(`Contrast failure: ${fg}/${bg}`);return {foreground:fg,background:bg,ratio:Number(ratio.toFixed(2)),passesNormalTextAA:true}});
const preservedSources=[];
for(const file of ['theme.css','preview.js','chakra.css','assets/strength-editorial.png']){
  const digest=async(dir)=>createHash('sha256').update(await readFile(resolve(dir,file))).digest('hex');
  const hash=await digest(root);if(hash!==await digest(baselineRoot))throw Error(`Baseline copy altered: ${file}`);
  preservedSources.push({file,sha256:hash});
}
await writeFile(resolve(root,'validation.json'),JSON.stringify({equivalence,preservedSources,contrast,scope:'Static desktop design previews; not a complete accessibility audit'},null,2)+'\n');
console.log('Dashboard and login geometry/type preserved; selected contrast checks passed.');
}finally{await browser?.close();await new Promise(done=>server.close(done))}
