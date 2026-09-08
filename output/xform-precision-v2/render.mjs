import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=resolve(root,path==='/'?'index.html':`.${path}`);if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404).end()}});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done)});
let browser;const results=[];
try{browser=await chromium.launch({headless:true});for(const view of ['dashboard','theme']){
  const page=await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:2});const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(!req.url().startsWith('http://127.0.0.1:'))external.push(req.url())});
  await page.goto(`http://127.0.0.1:${server.address().port}/?view=${view}`,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  const evidence=await page.evaluate(()=>{const s=getComputedStyle(document.body);return {title:document.title,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>({family:f.family,weight:f.weight})),tokens:Object.fromEntries(['bg','surface','raised','border','ink','muted','accent','action-ink'].map(name=>[name,s.getPropertyValue(`--${name}`).trim()])),clipped:[...document.querySelectorAll('.app-frame,.app-main,.app-content,.body-panel,.training-card,.training-body,.theme-system,.signin,.signin-body,.type-sample,.component-box')].filter(el=>el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2).map(el=>({class:el.className,box:[el.clientWidth,el.clientHeight],scroll:[el.scrollWidth,el.scrollHeight]})),escaped:[...document.querySelectorAll('.artifact *')].filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.top<0||r.right>1601||r.bottom>1101}).map(el=>el.className.baseVal||el.className)}});
  const file=`precision-active-${view}.png`;await page.screenshot({path:resolve(root,file)});
  const required=['Chakra Petch','IBM Plex Sans','IBM Plex Mono',...(view==='theme'?['Sora']:[])];const missing=required.filter(name=>!evidence.fonts.some(f=>f.family.replaceAll('"','')===name));
  if(errors.length||external.length||missing.length||evidence.clipped.length||evidence.escaped.length||evidence.width!==1600||evidence.height!==1100)throw Error(JSON.stringify({view,errors,external,missing,...evidence}));
  results.push({file,pixels:[3200,2200],errors,external,missing,...evidence});console.log(`${file}: 3200 × 2200; fonts verified; no clipping; no external requests.`);await page.close();
}await writeFile(resolve(root,'render-evidence.json'),JSON.stringify(results,null,2)+'\n')}finally{await browser?.close();await new Promise(done=>server.close(done))}
