/** Export verified recordings to captioned H.264 MP4 plus an offline viewing index. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const input=process.env.XFORM_DEMO_OUTPUT || '/tmp/xform-demo-final-20260910'
const output=path.join(input,'delivery')
const ffmpeg=process.env.XFORM_DEMO_FFMPEG || '/tmp/xform-demo-media-tools/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2'
const items=JSON.parse(await fs.readFile(path.join(input,'manifest.json'),'utf8'))
const adminTake=process.env.XFORM_DEMO_ADMIN_TAKE
if(adminTake){
  const replacement=JSON.parse(await fs.readFile(path.join(adminTake,'manifest.json'),'utf8')).find(item=>item.name==='05-admin-team-management')
  if(!replacement)throw Error('Missing verified replacement admin take')
  items[items.findIndex(item=>item.name===replacement.name)]=replacement
}
if(items.length!==6 || items.some(item=>item.checks!=='Passed')) throw Error('All six recording journeys must pass before export')
await fs.mkdir(path.join(output,'assets'),{recursive:true})
await fs.mkdir(path.join(output,'captions'),{recursive:true})
await fs.mkdir(path.join(output,'proof'),{recursive:true})
function run(args,allowFailure=false){return new Promise((resolve,reject)=>{
  const child=spawn(ffmpeg,args);let stderr=''
  child.stderr.on('data',chunk=>{stderr+=chunk})
  child.on('error',reject)
  child.on('close',code=>code && !allowFailure?reject(Error(stderr)):resolve(stderr))
})}
const time=seconds=>`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${(seconds%60).toFixed(2).padStart(5,'0')}`
const srtTime=seconds=>time(seconds).padStart(11,'0').replace('.',',')+'0'
const clean=value=>value.replaceAll('{','(').replaceAll('}',')').replaceAll('\\','/').replaceAll('\n','\\N')
const html=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
for(const item of items){
  const source=path.join(adminTake && item.name==='05-admin-team-management'?adminTake:input,`${item.name}.webm`)
  const info=await run(['-hide_banner','-i',source],true)
  const match=info.match(/Duration: (\d+):(\d+):(\d+\.\d+)/)
  if(!match)throw Error(`Cannot read duration for ${item.name}`)
  const duration=Number(match[1])*3600+Number(match[2])*60+Number(match[3])
  const local=item.name.startsWith('01')||item.name.startsWith('02')||item.name.startsWith('03')
  const mode=local?'LOCAL API / SAMPLE DATA\nAuthentication simulated':item.name.startsWith('06')?'STAGED AUTH / SAMPLE DATA\nEmail delivery simulated':'STAGED UI / SAMPLE DATA\nAccount services simulated'
  let ass=`[Script Info]\nScriptType: v4.00+\nPlayResX: 1600\nPlayResY: 900\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Brand,DejaVu Sans,15,&H0042F5C7,&H0042F5C7,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\nStyle: Mode,DejaVu Sans,11,&H00BAC2BC,&H00BAC2BC,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\nStyle: Title,DejaVu Sans,21,&H00F4F7F5,&H00F4F7F5,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\nStyle: Detail,DejaVu Sans,14,&H00BEC6C0,&H00BEC6C0,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`
  const event=(style,start,end,x,y,text)=>`Dialogue: 0,${time(start)},${time(end)},${style},,0,0,0,,{\\pos(${x},${y})}${clean(text)}\n`
  ass+=event('Brand',0,duration,28,815,'XFORM PHYSIQUE')+event('Mode',0,duration,28,842,mode)
  let srt=''
  for(let i=0;i<item.chapters.length;i++){
    const chapter=item.chapters[i],start=i?chapter.seconds:0,end=Math.min(duration,item.chapters[i+1]?.seconds??duration)
    if(end<=start)continue
    ass+=event('Title',start,end,310,812,chapter.title)+event('Detail',start,end,310,850,chapter.detail)
    srt+=`${i+1}\n${srtTime(start)} --> ${srtTime(end)}\n${chapter.title}\n${chapter.detail}\n\n`
  }
  const subtitles=path.join(input,`${item.name}.ass`)
  await fs.writeFile(subtitles,ass)
  await fs.writeFile(path.join(output,'captions',`${item.name}.srt`),srt)
  const destination=path.join(output,`${item.name}.mp4`)
  await run(['-y','-hide_banner','-loglevel','error','-i',source,'-vf',`drawbox=x=0:y=ih-104:w=iw:h=104:color=0x090a0b:t=fill,ass=${subtitles}`,'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-an','-movflags','+faststart',destination])
  // Decode every frame; a file existing is not evidence of a playable recording.
  await run(['-hide_banner','-loglevel','error','-i',destination,'-f','null','-'])
  await run(['-y','-hide_banner','-loglevel','error','-ss',String(Math.min(12,duration/4)),'-i',destination,'-frames:v','1','-update','1',path.join(output,'assets',`${item.name}.png`)])
  item.duration_seconds=duration;item.bytes=(await fs.stat(destination)).size
  item.video_codec='H.264';item.resolution='1600×900';item.audio='None — captions are burned in';item.decode_check='Passed'
  console.log(`EXPORTED ${item.name} ${duration.toFixed(1)}s ${(item.bytes/1048576).toFixed(1)}MB`)
}
await fs.writeFile(path.join(output,'proof','recording-manifest.json'),JSON.stringify(items,null,2))
const verification={date:'2026-09-10',backend_tests:{passed:66,scope:'Temporary SQLite and mocked service dependencies'},browser_tests:{passed:48,scope:'Real React UI, mocked Auth/API responses'},recorded_journeys:{passed:6,scope:'First three use actual FastAPI/SQLite; Coach/Admin/Auth dependencies simulated'},build:'Passed',mp4_decode:'All frames decoded successfully',live_release:'NOT VERIFIED / NOT READY',pending:['Live Supabase migrations and backend restart','Approved Auth redirect URLs','Custom SMTP and verified sender','Real email receipt/recovery acceptance','Live Supabase/R2 end-to-end acceptance'],production_mutations:'None'}
await fs.writeFile(path.join(output,'proof','verification.json'),JSON.stringify(verification,null,2))
const format=seconds=>`${Math.floor(Math.round(seconds)/60)}:${String(Math.round(seconds)%60).padStart(2,'0')}`
let readme=`# XForm Physique — Development demo\n\nRecorded 10 September 2026. Open **Start-Here.html** or play the numbered MP4s in order. Videos are 1600×900 H.264 with burned-in captions, no audio. This folder works offline.\n\n## Important demonstration boundary\n\nThis is a development showcase, not evidence that the latest release is live. The first three videos exercise the actual React UI and FastAPI with a disposable SQLite database and local image files. Authentication is simulated. Coach/Admin service responses and password recovery are staged and visibly labeled. No real users, credentials or personal photographs are included; the photo stand-ins are labeled illustrations.\n\nNo live account was onboarded, offboarded or reset. No invitation or recovery email was sent. Coach onboarding is a form preview, not a claimed successful invitation.\n\n## Viewing order\n\n`
for(const item of items)readme+=`${item.name.slice(0,2)}. **${item.title}** — ${format(item.duration_seconds)} — ${item.mode}.\n\n`
readme+=`## Verification\n\n- 66 backend tests passed against disposable local data/mocked dependencies.\n- 48 browser checks passed against the current React build and mocked service responses.\n- Six recording journeys completed without page errors or unexpected network routes.\n- Client saves/reloads exercised: body entries, profile preferences, all six workout sets (1,380 kg total), meal adherence, eleven detailed check-in ratings and photo replacement.\n- Frontend production build passed. Existing non-blocking bundle-size and Starlette/httpx deprecation warnings remain.\n- Every exported MP4 was decoded in full to check file integrity.\n- SQL/RLS migrations passed isolated PostgreSQL acceptance on 9 September with the same migration files; not reapplied to live Supabase.\n\n## Before promising a live client demo\n\nThe current Supabase-connected port-8000 backend still runs earlier code. Latest features need the pending migrations, correct password-reset redirects, a backend restart and live acceptance. General-client email needs configured SMTP and a verified sender. These changes were not made for this recording.\n\nCoach plan builders, libraries, settings/data tools and health/audit placeholders are not presented as completed backend features. AI, imports, supplements and inactive messaging automations are not demonstrated as working. Profile-avatar cloud upload and real R2 access are not validated by these videos.\n\n## Reproducibility\n\nRepository scripts: scripts/prepare_demo_data.py, scripts/record_demo.mjs, scripts/export_demo.mjs. Do not point them at production; recording API endpoints are restricted to the isolated localhost ports 8007/8008. Detailed chapter timings and modes are in proof/recording-manifest.json; verification boundaries are in proof/verification.json.\n`
await fs.writeFile(path.join(output,'README.md'),readme)
const cards=items.map(item=>`<article><p class="number">${item.name.slice(0,2)} / ${format(item.duration_seconds)} <span>${item.name<'04'?'LOCAL API RECORDING':'STAGED SERVICE RECORDING'}</span></p><h2>${html(item.title)}</h2><p class="mode">${html(item.mode)}</p><video controls preload="metadata" poster="assets/${item.name}.png"><source src="${item.name}.mp4" type="video/mp4"></video><details><summary>Chapter guide</summary><ol>${item.chapters.map(c=>`<li><b>${format(c.seconds)}</b> ${html(c.title)}</li>`).join('')}</ol></details><a href="${item.name}.mp4" download>Download MP4</a></article>`).join('')
await fs.writeFile(path.join(output,'Start-Here.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XForm Physique · Development Demo</title><style>*{box-sizing:border-box}body{margin:0;background:#090a0b;color:#f5f7f4;font:16px/1.6 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:48px 36px}.brand{font-size:13px;letter-spacing:2px;color:#c7f542}h1{font-size:44px;line-height:1.12;max-width:850px;margin:18px 0}header p{color:#adb5b0;max-width:950px}.notice{border:1px solid #535d44;padding:20px 24px;margin:28px 0 36px;background:#141719;max-width:1120px}.notice strong{color:#c7f542}.notice p{margin:6px 0 0;color:#bac2bc}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30px}article{padding-bottom:24px;border-bottom:1px solid #343a36}h2{font-size:22px;line-height:1.35;margin:8px 0}.number{color:#c7f542;font-size:13px}.number span{color:#a2ada6;margin-left:20px;font-size:11px}.mode{color:#aeb8b1;font-size:13px;min-height:44px}video{width:100%;aspect-ratio:16/9;background:#141719;border:1px solid #343a36;border-radius:4px}a{color:#c7f542;font-size:14px}details{margin:12px 0;font-size:14px;color:#c0c9c3}summary{cursor:pointer}li{margin:8px 0}li b{display:inline-block;width:45px}footer{margin-top:40px;border-top:1px solid #343a36;padding-top:24px;color:#acb5af;font-size:13px}footer strong{color:#f5f7f4}@media(max-width:850px){.grid{grid-template-columns:1fr}main{padding:24px 18px}h1{font-size:34px}}</style></head><body><main><header><div class="brand">XFORM PHYSIQUE / DEVELOPMENT SHOWCASE / 10 SEPTEMBER 2026</div><h1>Progress, demonstrated.<br>Six guided walkthroughs.</h1><p>Watch in order or choose a chapter. Captioned MP4s, sample data only, ready for offline playback.</p></header><section class="notice"><strong>Read this before presenting.</strong><p>Videos 01–03 use real local FastAPI/SQLite saves with simulated sign-in. Videos 04–06 stage Coach/Admin/Auth service responses. Every recording is labeled. Live Supabase rollout and email delivery are still pending—not proven by these videos.</p></section><section class="grid">${cards}</section><footer><strong>Verification: 66 backend tests · 48 browser checks · six recording journeys · six full MP4 decode checks.</strong><p>No real client photos, health records or credentials were used. No live accounts were created, reset or offboarded. See <a href="README.md">README</a> for the exact verification scope and outstanding live-release gates.</p></footer></main></body></html>`)
console.log('DELIVERY '+output)
