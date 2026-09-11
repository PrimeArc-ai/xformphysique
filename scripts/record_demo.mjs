/** Demo recordings of the actual React UI. Never contacts live Auth, DB or R2.
 * Client chapters proxy real requests to the disposable FastAPI/SQLite server.
 * Coach/Admin/Auth simulations are labeled visibly in every frame.
 */
import { chromium, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const app = 'http://127.0.0.1:5173'
const api = process.env.XFORM_DEMO_API || 'http://127.0.0.1:8007'
if (!['http://127.0.0.1:8007','http://127.0.0.1:8008'].includes(api)) throw Error('Only the isolated local demo ports are allowed')
const out = process.env.XFORM_DEMO_OUTPUT || '/tmp/xform-demo-recordings-20260910'
const pace = Number(process.env.XFORM_DEMO_PACE || 1)
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
const results = process.env.XFORM_DEMO_ONLY
  ? JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8').catch(()=>'[]')).filter(item=>!item.name.startsWith(process.env.XFORM_DEMO_ONLY))
  : []
const read = async endpoint => {
  const response = await fetch(api + endpoint)
  if (!response.ok) throw Error(`Demo API ${endpoint}: ${response.status}`)
  return response.json()
}
const today = (await read('/api/v1/client/check-ins')).schedule.today
const monday = (await read('/api/v1/client/check-ins')).schedule.period_start
const previous = new Date(`${monday}T12:00:00Z`); previous.setUTCDate(previous.getUTCDate()-7)
const priorWeek = previous.toISOString().slice(0,10)
const metricNames = ['energy','sleep_quality','hunger','digestion','stress','recovery','strength','workout_performance','motivation','adherence','overall_wellbeing']
const poseNames = ['front','back','side','front_double_bicep','back_double_bicep']
const captions = new Map()
const pause = ms => new Promise(resolve => setTimeout(resolve, ms * pace))
const navigate = (page, label) => page.getByRole('navigation', {name:'Client navigation', exact:true}).getByRole('button', {name:label, exact:true}).click()

async function annotate(page, title, detail, locator, hold=3500) {
  captions.get(page).push({seconds:Math.round((Date.now()-page.demoStarted)/1000),title,detail})
  await page.evaluate(({title,detail}) => {
    document.querySelector('#demo-title').textContent=title
    document.querySelector('#demo-detail').textContent=detail
  }, {title,detail})
  if (locator) await locator.first().evaluate(el=>el.scrollIntoView({behavior:'smooth',block:'center'}))
  await pause(hold)
}
async function click(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (box) await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:14})
  await pause(300)
  await locator.click()
}
async function type(locator, value) {
  await locator.fill(''); await locator.pressSequentially(value,{delay:22*pace})
}
async function setup(mode, role='client') {
  const context = await browser.newContext({ viewport:{width:1600,height:900}, recordVideo:{dir:path.join(out,'raw'),size:{width:1600,height:900}}, reducedMotion:'reduce', timezoneId:'Asia/Kolkata' })
  await context.addInitScript(({mode}) => {
    document.addEventListener('DOMContentLoaded',()=>{
      const style=document.createElement('style')
      style.textContent=`body{padding-bottom:104px!important}.os-sidebar{height:calc(100dvh - 104px)!important}#demo-banner{position:fixed;z-index:2147483646;inset:auto 0 0;background:#090a0b;border-top:1px solid #465038;min-height:92px;box-sizing:border-box;padding:17px 30px 14px;font-family:Arial,sans-serif;display:flex;gap:30px;align-items:center;pointer-events:none}#demo-brand{color:#c7f542;font-size:16px;font-weight:700;letter-spacing:1px;min-width:180px}#demo-brand small{display:block;color:#a8afa9;max-width:250px;font-size:11px;line-height:1.5;letter-spacing:.2px;margin-top:7px}#demo-title{font-size:20px;color:#f5f7f4;font-weight:700;margin-bottom:6px}#demo-detail{font-size:14px;line-height:1.5;color:#b4bcb6;max-width:1140px}#demo-pointer{position:fixed;z-index:2147483647;width:22px;height:22px;border:2px solid #c7f542;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);background:#c7f54222;left:-100px;top:-100px}`
      document.head.append(style)
      const banner=document.createElement('div'); banner.id='demo-banner'
      banner.innerHTML='<div id="demo-brand">XFORM PHYSIQUE<small></small></div><div><div id="demo-title">Development walkthrough</div><div id="demo-detail">Sample data only. No production accounts or private photographs.</div></div>'
      banner.querySelector('small').textContent=mode
      document.body.append(banner)
      const pointer=document.createElement('div');pointer.id='demo-pointer';document.body.append(pointer)
      document.addEventListener('pointermove',event=>{pointer.style.left=event.clientX+'px';pointer.style.top=event.clientY+'px'})
    })
  },{mode})
  const page = await context.newPage(); page.demoStarted=Date.now(); captions.set(page,[])
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>{
    const url=new URL(route.request().url())
    if (url.origin!==app || url.pathname.startsWith('/api/')) {errors.push(`Blocked unexpected route ${url.pathname}`);return route.abort()}
    return route.continue()
  })
  const user={id:`demo-${role}`,email:`${role}@example.test`,aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{}}
  await page.route('**/auth/v1/**',route=>{
    const req=route.request(),u=new URL(req.url())
    if(u.pathname.endsWith('/logout')) return route.fulfill({status:204})
    if(u.pathname.endsWith('/recover')) return route.fulfill({json:{}})
    return route.fulfill({json:u.pathname.endsWith('/token')?{access_token:'demo-only-token',refresh_token:'demo-only-refresh',expires_in:3600,token_type:'bearer',user}:user})
  })
  return {context,page,errors}
}
async function localClient() {
  const bundle=await setup('LOCAL API DEMO • FastAPI + SQLite • Auth simulated')
  await bundle.page.route('**/api/v1/**',async route=>{
    const u=new URL(route.request().url())
    if(!u.pathname.startsWith('/api/v1/client/') && u.pathname!=='/api/v1/auth/me') throw Error('Non-client write attempted')
    const response=await route.fetch({url:api+u.pathname+u.search})
    if(response.status()>=400) bundle.errors.push(`API ${response.status()} ${u.pathname}`)
    await route.fulfill({response})
  })
  await bundle.page.goto(app)
  return bundle
}
async function login(page, role='Client') {
  await page.getByRole('radio',{name:role,exact:true}).check()
  await type(page.getByLabel('Email',{exact:true}),`${role.toLowerCase()}@example.test`)
  await page.getByLabel('Password',{exact:true}).fill('DemoOnly!NotAnAccount')
  await click(page,page.getByRole('button',{name:'Sign In',exact:true}))
  await expect(page.getByRole('button',{name:'Sign out',exact:true}).first()).toBeVisible()
}
async function finish(bundle, name, title, mode) {
  await annotate(bundle.page,'Walkthrough complete', 'XForm Physique • Development build • Sample data only',null,4000)
  await bundle.page.screenshot({path:path.join(out,`${name}.png`)})
  const video=bundle.page.video(); const chapters=captions.get(bundle.page)
  await bundle.context.close()
  if(bundle.errors.length) throw Error(`${name}: ${bundle.errors.join('; ')}`)
  await video.saveAs(path.join(out,`${name}.webm`))
  results.push({name,title,mode,chapters,checks:'Passed',seconds:Math.round((Date.now()-bundle.page.demoStarted)/1000)})
  results.sort((a,b)=>a.name.localeCompare(b.name))
  await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(results,null,2))
  console.log(`RECORDED ${name}`)
}

// Code-drawn stand-ins, explicitly labeled. No real person's image is used.
const imagePage=await browser.newPage({viewport:{width:480,height:600}})
const images={}
const existingPhotos=(await read('/api/v1/client/progress-photos?limit=100')).items
for(const pose of poseNames){
  const arms=pose.includes('bicep')?'M175 228L126 189L116 147 M305 228L354 189L364 147':pose==='side'?'M224 230L244 318':'M175 228L145 322 M305 228L335 322'
  await imagePage.setContent(`<body style="margin:0;background:#15191a"><svg xmlns="http://www.w3.org/2000/svg" width="480" height="600"><rect x="22" y="22" width="436" height="556" rx="6" fill="#111516" stroke="#424a45"/><text x="45" y="62" fill="#c7f542" font-family="Arial" font-size="16">XFORM / SYNTHETIC DEMO IMAGE</text><circle cx="240" cy="170" r="32" fill="#818c84"/><path d="M175 228Q240 196 305 228L276 351H204Z" fill="#66746b"/><path d="${arms} M218 351L206 453 M262 351L275 453" fill="none" stroke="#818c84" stroke-width="22" stroke-linecap="round"/><text x="240" y="510" text-anchor="middle" fill="#f5f7f4" font-family="Arial" font-size="24">${pose.replaceAll('_',' ').toUpperCase()}</text><text x="240" y="545" text-anchor="middle" fill="#a6b0a9" font-family="Arial" font-size="14">Illustration only • Not a client transformation</text></svg>`)
  images[pose]=await imagePage.screenshot()
  for(const day of [priorWeek,monday]){
    if(existingPhotos.some(photo=>photo.view===pose && photo.period_start===day)) continue
    const form=new FormData();form.set('file',new Blob([images[pose]],{type:'image/png'}),'synthetic-'+pose+'.png');form.set('view',pose);form.set('captured_on',day)
    const response=await fetch(api+'/api/v1/client/progress-photos',{method:'POST',body:form})
    if(!response.ok) throw Error('Cannot seed isolated demo photos')
  }
}
await imagePage.close()

try {
if(!process.env.XFORM_DEMO_ONLY || process.env.XFORM_DEMO_ONLY==='01'){
  const b=await localClient(),p=b.page
  await annotate(p,'01 / The client workspace','Three portals, one consistent design. This recording uses a sample client and real local API saves.')
  await login(p)
  await annotate(p,'Progress at a glance','Body signal, check-in schedule, training volume and the next workout in one dashboard.',p.locator('.precision-greeting'),5500)
  await annotate(p,'Training and next steps','Historical values come from the disposable database, not static dashboard artwork.',p.locator('.precision-volume'),4500)
  await navigate(p,'Body Tracker')
  await annotate(p,'Log a body entry','Record weight and waist. The save goes to FastAPI and SQLite.',p.getByRole('button',{name:'Save body progress'}))
  await type(p.getByPlaceholder('68.4'),'68.2');await type(p.getByPlaceholder('71'),'71.0')
  await click(p,p.getByRole('button',{name:'Save body progress'}))
  await expect(p.getByText('Body progress saved to your XForm record.')).toBeVisible()
  await annotate(p,'Saved, then reloaded','The new measurement survives a page reload. It is not only browser state.',null,4000)
  await p.reload();await navigate(p,'Body Tracker');await expect(p.getByText('68.2 kg',{exact:true}).first()).toBeVisible()
  await navigate(p,'Profile')
  await annotate(p,'A profile that informs coaching','Target weight, check-in day, timezone and dietary preferences can be maintained.',p.getByRole('button',{name:'Save profile'}))
  await type(p.getByLabel('Dietary preferences'),'Prefer quick, high-protein weekday meals.')
  await click(p,p.getByRole('button',{name:'Save profile'}))
  await expect(p.getByText('Profile saved to your planning record.')).toBeVisible()
  await navigate(p,'Health Summary')
  await annotate(p,'Health context, not a diagnosis','Planning preferences and coach guidance sit alongside the latest reported wellbeing.',p.getByRole('heading',{name:/Health|Wellbeing|context/i}).last(),4500)
  await finish(b,'01-client-workspace','Client workspace and body tracking','Real local FastAPI/SQLite; authentication simulated')
}
if(!process.env.XFORM_DEMO_ONLY || process.env.XFORM_DEMO_ONLY==='02'){
  const b=await localClient(),p=b.page;await login(p);await navigate(p,'Workout')
  await annotate(p,'02 / Training that records the work','Every exercise has individual sets, reps and load. Volumes are calculated from those raw values.',p.getByRole('heading',{name:'Lower body strength',exact:true}))
  for(const name of ['Goblet squat','Romanian deadlift']){
    await annotate(p,name,'Enter each working set. For example, 10 reps × 25 kg contributes 250 kg of volume.',p.getByLabel(`${name} set 1 reps`,{exact:true}),2000)
    for(const [n,reps,load] of [[1,10,20],[2,10,25],[3,8,30]]){await type(p.getByLabel(`${name} set ${n} reps`,{exact:true}),String(reps));await type(p.getByLabel(`${name} set ${n} load`,{exact:true}),String(load))}
  }
  await annotate(p,'Save now, continue later','Six sets total 1,380 kg. Save a draft, leave the page, then reopen the session.',p.getByRole('button',{name:'Save draft',exact:true}),3500)
  await expect(p.getByText('Total: 1380 kg',{exact:true})).toBeVisible()
  await click(p,p.getByRole('button',{name:'Save draft',exact:true}));await expect(p.getByText('Draft saved. You can continue later.')).toBeVisible()
  await navigate(p,'Dashboard');await pause(1500);await navigate(p,'Workout')
  await expect(p.getByLabel('Romanian deadlift set 3 load',{exact:true})).toHaveValue('30')
  await annotate(p,'The draft is still here','Saved sets reload from the API. Complete the session when training is finished.',p.getByRole('button',{name:'Complete session',exact:true}))
  await click(p,p.getByRole('button',{name:'Complete session',exact:true}));await expect(p.getByText('Session completed and saved.')).toBeVisible()
  await annotate(p,'History built from recorded sets','Choose an exercise. Load, reps and volume charts use saved history; the table preserves each set.',p.locator('section[aria-label="Exercise performance history"] select'),4500)
  await p.locator('section[aria-label="Exercise performance history"] select').selectOption({label:'Romanian deadlift'})
  await annotate(p,'Weekly volume and rep progression','Trend labels compare the latest two recorded weeks; missing weeks are not treated as zero.',p.getByText('Complete set history',{exact:true}),4500)
  await click(p,p.getByText('Complete set history',{exact:true}));await pause(3500)
  await navigate(p,'Nutrition')
  await annotate(p,'Meals first; macros second','Actual food, portions, meal timing, preparation and coach instructions lead the page.',p.locator('.meal-first-card').first(),5000)
  await annotate(p,'Simple daily adherence','Mark a meal followed, partly followed or missed. Nutrition references remain optional.',p.getByRole('button',{name:'Followed',exact:true}).first())
  await click(p,p.getByRole('button',{name:'Followed',exact:true}).first());await expect(p.getByRole('button',{name:'Followed',exact:true}).first()).toHaveAttribute('aria-pressed','true')
  await click(p,p.getByText('Nutrition reference',{exact:true}).first());await pause(3500)
  await finish(b,'02-training-and-nutrition','Set logging, exercise history and meal-first nutrition','Real local FastAPI/SQLite; authentication simulated')
}
if(!process.env.XFORM_DEMO_ONLY || process.env.XFORM_DEMO_ONLY==='03'){
  const b=await localClient(),p=b.page;await login(p);await navigate(p,'Check-ins')
  await annotate(p,'03 / A more complete weekly check-in','The existing weekly form now includes eleven detailed ratings. Legacy answers keep their original scale.',p.getByText('All ratings require your answer.',{exact:false}))
  for(const key of ['energy_score','sleep_score']) await p.locator(`[name="${key}"]`).selectOption('4')
  for(const metric of metricNames){await p.locator(`[name="${metric}"]`).selectOption(['hunger','stress'].includes(metric)?'3':'8');await pause(180)}
  await p.locator('[name="sentiment"]').selectOption('good')
  await type(p.getByLabel('What went well?',{exact:true}),'Three strength sessions completed. Meal preparation made the week easier.')
  await type(p.getByLabel('Challenges',{exact:true}),'One late work evening; kept the next morning walk short.')
  await annotate(p,'Save this week without overwriting earlier weeks','The answers remain connected to this client, this check-in and this week.',p.getByRole('button',{name:'Submit check-in',exact:true}))
  await click(p,p.getByRole('button',{name:'Submit check-in',exact:true}));await expect(p.getByText('This week’s check-in saved. Previous weeks are unchanged.')).toBeVisible()
  await annotate(p,'Historical answers remain available','Select a metric to see its recorded weekly ratings; expand a week to read its exact responses.',p.locator('.progress-history select').first(),4500)
  await p.locator('.progress-history select').first().selectOption('digestion');await pause(3500)
  await navigate(p,'Progress Photos')
  await annotate(p,'Five poses, organized by week','These labeled illustrations stand in for photographs. No real client images are used.',p.getByRole('button',{name:'Front',exact:true}),4500)
  for(const pose of ['Back','Side','Front Double Bicep','Back Double Bicep']){await click(p,p.getByRole('button',{name:pose,exact:true}));await expect(p.locator('.weekly-photo-pair img')).toHaveCount(2);await pause(1200)}
  await click(p,p.getByRole('button',{name:'Front',exact:true}))
  await annotate(p,'Compare the same pose across two weeks','Capture dates, upload times and exact photo IDs remain attached to each record.',p.locator('.weekly-photo-pair'),4500)
  await click(p,p.locator('.weekly-photo-pair .photo-image-button').last());await expect(p.getByRole('dialog')).toBeVisible()
  await p.getByLabel('Zoom',{exact:true}).fill('1.5');await pause(2500);await click(p,p.getByRole('button',{name:'Close image',exact:true}))
  await annotate(p,'Replace a selected photo safely','A confirmation protects against accidental replacement. Other poses and weeks are unaffected.',p.getByText('Replace selected pose',{exact:false}),4000)
  p.once('dialog',async dialog=>{await pause(2000);await dialog.accept()})
  await p.locator('input[type="file"]').setInputFiles({name:'synthetic-front.png',mimeType:'image/png',buffer:images.front})
  await expect(p.getByText('Photo saved privately to the selected week.',{exact:true})).toBeVisible()
  await p.reload();await navigate(p,'Progress Photos');await expect(p.locator('.weekly-photo-pair img')).toHaveCount(2)
  await annotate(p,'Upload survives a reload','This chapter uses private local files and DB references. Live Cloudflare R2 rollout is a separate acceptance gate.',p.locator('.weekly-photo-pair'),4500)
  await finish(b,'03-weekly-checkins-and-photos','Weekly ratings, history and five-pose photo comparison','Real local FastAPI/SQLite and local files; synthetic illustrations; Auth simulated')
}

// Coach UI uses the just-recorded sample client's real local snapshots. Mutations
// to coach feedback are simulated here because those RPCs require live Supabase.
if(!process.env.XFORM_DEMO_ONLY || process.env.XFORM_DEMO_ONLY==='04'){
  const b=await setup('STAGED UI DEMO • Coach services simulated • Sample data','coach'),p=b.page
  const profile=(await read('/api/v1/client/profile')), checkins=await read('/api/v1/client/check-ins'), body=await read('/api/v1/client/body-entries'),photos=await read('/api/v1/client/progress-photos'),history=await read('/api/v1/client/workout-history')
  const client={...profile,id:'cl_001',full_name:'Maya Shah',first_name:'Maya',client_code:'XP-DEMO-01',primary_goal:'body_recomposition',latest_weight_kg:body.items[0].weight_kg,latest_entry_date:body.items[0].date || body.items[0].entry_date,needs_attention:false,check_in_schedule:checkins.schedule}
  let guidance={client_visible_coach_note:'Build consistency before increasing load.',training_considerations:['Keep movements controlled.'],safety_notice:'Coaching support only. Not medical advice.'}
  await p.route('**/api/v1/**',async route=>{
    const req=route.request(),u=new URL(req.url()),url=u.pathname,json=data=>route.fulfill({json:data})
    if(url==='/api/v1/auth/me')return json({id:'coach-demo',role:'coach',full_name:'Aisha Kapoor',first_name:'Aisha',email:'aisha.coach@example.test'})
    if(url.endsWith('/profile/photo'))return json({photo:null})
    if(url==='/api/v1/coach/clients')return json({items:[client]})
    if(url.endsWith('/review'))return json({client,body_entries:body.items.map(e=>({...e,entry_date:e.date || e.entry_date})),checkins:checkins.items,photo_count:photos.items.length,progress_photos:photos.items,coaching_context:guidance,private_notes:[]})
    if(url.endsWith('/workout-history'))return json(history)
    if(url.endsWith('/check-ins'))return json(checkins)
    if(url.endsWith('/feedback')){const entry=checkins.items.find(e=>url.includes(`/${e.id}/`));entry.feedback={...req.postDataJSON(),updated_at:new Date().toISOString()};return json(entry.feedback)}
    if(url.endsWith('/coaching-context')){guidance={...guidance,...req.postDataJSON()};return json(guidance)}
    if(url.endsWith('/progress-photos'))return json({...photos,items:photos.items.map(e=>({...e,content_url:`/api/v1/coach/clients/cl_001/progress-photos/${e.id}/content`}))})
    if(url.endsWith('/content')){const response=await route.fetch({url:api+url.replace('/coach/clients/cl_001/','/client/')});return route.fulfill({response})}
    b.errors.push(`Unhandled coach route ${url}`);return route.fulfill({status:501,json:{error:{message:'Not in recording scope'}}})
  })
  await p.goto(app);await login(p,'Coach')
  await annotate(p,'04 / Coach operations and client review','A focused roster, scheduled check-ins and client signals. Coach services are simulated in this recording.',p.locator('.coach-heading'),5000)
  await click(p,p.getByRole('button',{name:'New client',exact:false}).first())
  await expect(p.getByRole('heading',{name:'Create client workspace'})).toBeVisible()
  await type(p.getByLabel('Full name',{exact:true}),'Rohan Mehta');await type(p.getByLabel('Email',{exact:true}),'rohan.demo@example.test')
  await p.getByLabel('Primary goal').selectOption('strength')
  await type(p.getByLabel('Dietary preferences',{exact:true}),'Vegetarian; quick weekday meals.')
  await annotate(p,'Coach-led onboarding: form preview','Collect goals, timezone, measurements and private coach context. Not submitted: live invitation email still needs SMTP.',p.getByRole('button',{name:'Create & email invite',exact:false}),5000)
  await click(p,p.getByRole('button',{name:'Close client onboarding'}))
  await click(p,p.getByRole('button',{name:'Review Maya Shah',exact:true}))
  await annotate(p,'One selected client, one protected review','This sample review combines body entries, weekly ratings, photos and actual exercise-history payloads.',p.locator('.coach-heading'),4500)
  await annotate(p,'Photo comparison in the coach workspace','The coach can inspect the selected client’s photo history. Illustrations replace real photos here.',p.locator('.weekly-photo-pair'),4500)
  await annotate(p,'Review the exact weekly answers','Original scales remain labeled, and detailed ratings have their own historical graph.',p.locator('.progress-history select').first(),4500)
  const current=p.locator('.weekly-record').filter({has:p.locator(`summary:text-is("Week ${monday} · good · Awaiting coach review")`)})
  await click(p,current.locator('summary'))
  await annotate(p,'Structured weekly feedback','Observations, adjustments, instructions and next-week priorities attach to this specific check-in.',current.getByRole('button',{name:'Save weekly feedback'}),4000)
  for(const [label,value] of [['Observations','Training and meal consistency improved.'],['Adjustments','Maintain the current working loads.'],['Instructions','Keep two repetitions in reserve.'],['Next-week priorities','Protect sleep on late work evenings.']])await type(current.getByLabel(label,{exact:true}),value)
  await click(p,current.getByRole('button',{name:'Save weekly feedback'}));await expect(p.getByText('Feedback saved to this client and week only.')).toBeVisible()
  await annotate(p,'Feedback appears in the selected week','The UI updates immediately. Live persistence and isolation are separately covered by migration/RLS tests.',p.locator('.photo-week-notes'),4500)
  await annotate(p,'Exercise history is available to the coach','The same recorded sets, load trends and weekly volume can inform a review.',p.locator('section[aria-label="Exercise performance history"] select'),4500)
  await finish(b,'04-coach-review','Coach roster, onboarding form and client review','Coach service simulation; client snapshots from disposable local DB; no invitation sent')
}
if(!process.env.XFORM_DEMO_ONLY || process.env.XFORM_DEMO_ONLY==='05'){
  const b=await setup('STAGED UI DEMO • Admin services simulated • No real credentials','admin'),p=b.page
  let coaches=[{id:'coach-demo',full_name:'Aisha Kapoor',email:'aisha.coach@example.test',professional_title:'Strength & Conditioning Coach',is_active:true,created_at:'2026-08-20T12:00:00Z',active_client_count:1}]
  await p.route('**/api/v1/**',route=>{
    const req=route.request(),u=new URL(req.url()),url=u.pathname,json=data=>route.fulfill({json:data})
    if(url==='/api/v1/auth/me')return json({id:'admin-demo',role:'admin',full_name:'Platform Administrator',first_name:'Admin',email:'admin@example.test'})
    if(url.endsWith('/reset-password'))return json({...coaches[0],initial_password:'SYNTHETIC-NOT-A-REAL-PASSWORD',email_sent:false,audit_recorded:true})
    if(url.endsWith('/offboard')){const target=url.split('/').at(-2);coaches=coaches.map(c=>c.id===target?{...c,is_active:false,active_client_count:0}:c);return json({id:target,released_client_count:1,is_active:false})}
    if(url.endsWith('/clients'))return json({items:[{client_code:'XP-DEMO-01',assigned_at:'2026-08-20T12:00:00Z',ended_at:null}]})
    if(req.method()==='POST'){const c={...req.postDataJSON(),id:'new-demo-coach',is_active:true,created_at:new Date().toISOString(),active_client_count:0};coaches.push(c);return json({...c,initial_password:'SYNTHETIC-NOT-A-REAL-PASSWORD',email_sent:false,audit_recorded:true})}
    return json({items:coaches})
  })
  await p.goto(app);await login(p,'Admin')
  await annotate(p,'05 / Admin: manage the team, preserve client privacy','The Admin portal manages coaches. Personal client details, health data and photos are not part of this view.',p.getByRole('heading',{name:'Coach management'}),5500)
  await click(p,p.getByRole('button',{name:'View Aisha Kapoor'}))
  await annotate(p,'Minimal client assignment information','Only client codes, assignment dates and status are shown—not the client’s name, email or progress photos.',p.getByRole('region',{name:'Coach details'}),5500)
  await click(p,p.getByRole('button',{name:'Reset password',exact:true}))
  await annotate(p,'Reset a coach’s password without changing their ID','The action asks for confirmation. The login email stays the same.',p.getByRole('dialog'),4000)
  await click(p,p.getByRole('button',{name:'Generate new password'}))
  await expect(p.getByLabel('Login email')).toHaveValue('aisha.coach@example.test')
  await annotate(p,'One-time credential display','This is a synthetic demonstration value. No real password changed and no email was sent.',p.getByRole('dialog'),4500)
  await click(p,p.getByRole('dialog').getByRole('button',{name:'Done'}))
  await click(p,p.getByRole('button',{name:'+ Onboard coach'}))
  await type(p.getByLabel('Full name',{exact:true}),'Rohan Mehta');await type(p.getByLabel('Email',{exact:true}),'rohan.coach@example.test')
  await annotate(p,'Onboard a coach into their own workspace','A coach has a separate account and roster. The production action does not overwrite an existing account.',p.getByRole('dialog'),3500)
  await click(p,p.getByRole('button',{name:'Create coach',exact:true}));await expect(p.getByLabel('Initial password')).toBeVisible();await pause(3000)
  await click(p,p.getByRole('dialog').getByRole('button',{name:'Done'}))
  await click(p,p.getByRole('button',{name:'View Aisha Kapoor'}));await click(p,p.getByRole('button',{name:'Offboard coach',exact:true}))
  await annotate(p,'Offboarding is an explicit decision','Confirm before suspending coach access and ending assignments. Client records are preserved.',p.getByRole('dialog'),4500)
  await click(p,p.getByRole('button',{name:'Confirm offboarding'}));await expect(p.locator('.os-notice[role="status"]')).toContainText('records preserved')
  await expect(p.getByRole('row').filter({hasText:'Rohan Mehta'}).getByRole('cell',{name:'Active',exact:true})).toBeVisible()
  await annotate(p,'Team status refreshes after the action','This recording changes only simulated roster data, never production accounts.',p.locator('.admin-roster'),4000)
  await finish(b,'05-admin-team-management','Admin onboarding, password reset, offboarding and privacy','Admin/Auth simulations; no real accounts modified')
}
if(!process.env.XFORM_DEMO_ONLY || process.env.XFORM_DEMO_ONLY==='06'){
  const b=await setup('STAGED AUTH DEMO • Email delivery simulated • SMTP pending'),p=b.page
  await p.goto(app)
  await annotate(p,'06 / Password recovery across all three portals','Client, Coach and Admin use the same email-verification recovery flow. No email is sent in this recording.',p.getByRole('heading',{name:'Welcome back.'}),5000)
  for(const role of ['Client','Coach','Admin']){
    await p.getByRole('radio',{name:role,exact:true}).check()
    await click(p,p.getByRole('button',{name:'Forgot password?'}))
    await type(p.getByLabel('Email',{exact:true}),`${role.toLowerCase()}@example.test`)
    await annotate(p,`${role} / Request a recovery link`,'Entering an email alone cannot change a password. A valid recovery session is required.',p.getByRole('button',{name:'Send reset link'}),2500)
    await click(p,p.getByRole('button',{name:'Send reset link'}));await expect(p.getByRole('status')).toContainText('If an account exists');await pause(2200)
    await p.goto(app)
  }
  await p.goto(app+'/?demo-recovery=1#access_token=demo-recovery&refresh_token=demo-refresh&expires_in=3600&token_type=bearer&type=recovery')
  await expect(p.getByRole('heading',{name:'Set a new password.'})).toBeVisible()
  await annotate(p,'After the recovery link: choose a new password','The validated-link screen is shown here with a simulated recovery session.',p.getByRole('heading',{name:'Set a new password.'}),4000)
  await p.getByLabel('New password',{exact:true}).fill('DemoPassword!2026');await p.getByLabel('Confirm password',{exact:true}).fill('DifferentDemo!2026')
  await click(p,p.getByRole('button',{name:'Save password'}));await expect(p.getByRole('alert')).toHaveText('Passwords do not match.')
  await annotate(p,'Validation before the update','A mismatch is rejected. Correct the confirmation before attempting the update.',p.getByRole('alert'),3500)
  await p.getByLabel('Confirm password',{exact:true}).fill('DemoPassword!2026');await click(p,p.getByRole('button',{name:'Save password'}))
  await expect(p.getByRole('status')).toContainText('Password updated')
  await annotate(p,'Confirmation and return to sign-in','The recovery session ends after the password update. Live email delivery still needs SMTP and approved redirects.',p.getByRole('status'),5000)
  await finish(b,'06-password-recovery','Client, Coach and Admin password recovery','Auth responses and recovery token simulated; no email delivered')
}
} catch(error) {
  for(const context of browser.contexts()) for(const page of context.pages()) {
    await page.screenshot({path:path.join(out,'rehearsal-failure.png')}).catch(()=>{})
    console.error((await page.locator('body').innerText().catch(()=>'' )).slice(-7000))
  }
  console.error(error.stack);process.exitCode=1
} finally {
  await browser.close()
}
