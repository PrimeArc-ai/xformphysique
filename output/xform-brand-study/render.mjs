import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve, sep } from 'node:path';

const root=dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,pathname==='/'?'index.html':`.${pathname}`);
    if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});
    res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port;
let browser;
const results=[];
try{
  browser=await chromium.launch({headless:true});
  for(const theme of ['dark','light']){
    for(const role of ['admin','coach','client']){
      const page=await browser.newPage({viewport:{width:1600,height:1320},deviceScaleFactor:2});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${port}/?theme=${theme}&role=${role}`,{waitUntil:'networkidle'});
      await page.evaluate(()=>document.fonts.ready);
      const evidence=await page.evaluate(()=>({
        title:document.title,
        fontLoaded:document.fonts.check('500 16px Inter'),
        width:document.documentElement.scrollWidth,
        height:document.documentElement.scrollHeight,
        selectedPortal:document.querySelector('.portal-select .selected').textContent,
        ink:getComputedStyle(document.body).color,
        background:getComputedStyle(document.body).backgroundColor,
        clipped:[...document.querySelectorAll('.brand-cell,.workspace-main,.login-inner,.panel,.stat,.side-note')].filter(el=>el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2).map(el=>({class:el.className,scroll:[el.scrollWidth,el.scrollHeight],box:[el.clientWidth,el.clientHeight]})),
        escapedBoard:[...document.querySelectorAll('#board *')].filter(el=>{const r=el.getBoundingClientRect();return r.right>1601||r.bottom>1321||r.left<0||r.top<0}).map(el=>el.className.baseVal||el.className),
        mainLayout:[...document.querySelector('.workspace-main').children].map(el=>({class:el.className,height:el.getBoundingClientRect().height})),
      }));
      await page.screenshot({path:resolve(root,`${theme}-${role}.png`),fullPage:false});
      if(errors.length||!evidence.fontLoaded||evidence.width!==1600||evidence.height!==1320||evidence.clipped.length||evidence.escapedBoard.length)throw Error(JSON.stringify({theme,role,errors,...evidence}));
      const file=`${theme}-${role}.png`;
      await page.screenshot({path:resolve(root,file),fullPage:false});
      results.push({file,pixels:[3200,2640],errors,...evidence});
      console.log(`Rendered ${file}: 3200 × 2640; no clipped panels; Inter loaded.`);
      await page.close();
    }
  }
  await writeFile(resolve(root,'render-evidence.json'),JSON.stringify(results,null,2)+'\n');
}finally{await browser?.close();await new Promise(done=>server.close(done));}
