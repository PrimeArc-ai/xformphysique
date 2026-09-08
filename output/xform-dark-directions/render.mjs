import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=resolve(root,pathname==='/'?'index.html':`.${pathname}`);if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done)});
let browser;const results=[];
try{
  browser=await chromium.launch({headless:true});
  for(const option of ['performance','studio','precision']){
    const page=await browser.newPage({viewport:{width:1600,height:1320},deviceScaleFactor:2});
    const errors=[];const nonlocal=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:'))nonlocal.push(request.url())});
    await page.goto(`http://127.0.0.1:${server.address().port}/?option=${option}`,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    const evidence=await page.evaluate(()=>{
      const style=getComputedStyle(document.body);
      const fonts=[...document.fonts].filter(font=>font.status==='loaded').map(font=>({family:font.family,weight:font.weight}));
      return {title:document.title,fonts,background:style.backgroundColor,text:style.color,accent:style.getPropertyValue('--accent').trim(),muted:style.getPropertyValue('--muted').trim(),selectedPortal:document.querySelector('.portal-control .selected').textContent,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,clipped:[...document.querySelectorAll('.direction-info,.type-guide,.login-inner,.workspace-main,.panel,.stat,.decision')].filter(el=>el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2).map(el=>({class:el.className,box:[el.clientWidth,el.clientHeight],scroll:[el.scrollWidth,el.scrollHeight]})),escape:[...document.querySelectorAll('#board *')].filter(el=>{const r=el.getBoundingClientRect();return r.top<0||r.left<0||r.right>1601||r.bottom>1321}).map(el=>el.className.baseVal||el.className),mainLayout:[...document.querySelector('.workspace-main').children].map(el=>({class:el.className,height:el.getBoundingClientRect().height}))};
    });
    const file=`${['performance','studio','precision'].indexOf(option)+1}-${option}.png`;
    await page.screenshot({path:resolve(root,file)});
    const expectedFonts={performance:['Barlow Condensed','Manrope'],studio:['Instrument Serif','DM Sans'],precision:['Sora','IBM Plex Sans','IBM Plex Mono']}[option];
    const missingFonts=expectedFonts.filter(name=>!evidence.fonts.some(font=>font.family.replaceAll('"','')===name));
    if(errors.length||nonlocal.length||missingFonts.length||evidence.clipped.length||evidence.escape.length||evidence.width!==1600||evidence.height!==1320)throw Error(JSON.stringify({option,errors,nonlocal,missingFonts,...evidence}));
    results.push({file,pixels:[3200,2640],errors,nonlocal,missingFonts,...evidence});
    console.log(`${file}: 3200 × 2640; fonts loaded, no clipping, no external requests.`);
    await page.close();
  }
  await writeFile(resolve(root,'render-evidence.json'),JSON.stringify(results,null,2)+'\n');
}finally{await browser?.close();await new Promise(done=>server.close(done));}
