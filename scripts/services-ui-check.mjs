import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../public/',import.meta.url),now=new Date().toISOString();
let profile='admin';
const user={id:'11111111-1111-4111-8111-111111111111',name:'Prueba UI',email:'ui@example.invalid',role:'admin',balance_cents:0,reserved_cents:0};
function state(){
 const u={...user,role:profile},services={offers:[{id:'offer1',name:'Cambio de correo de prueba',mode:'email',price_cents:25,margin_cents:5,instructions:'Utiliza sufijos aleatorios.',active:true,workers:[]}],orders:[],units:[],notifications:[],wallet:[],credit_cents:0,history:[]};
 services.finance={settings:{reserve_bps:null,pending_hours:24,unpaid_retention_days:30},entries:[],costs:[],sales:[],users:[],wallet:[],storage:{used_bytes:1000,limit_bytes:524288000,measured_at:now},available:0,reserve:0,commercial:0,own:0,commissions:0,withdrawn:0,workers_due:0,buyer_credits:0,pending_historical:0,unknown_costs:0,pending_reserve:0,funds_processing:0};
 return {user:u,settings:{theme:'original',announcement:'',announcement_enabled:false,announcement_interval:75},products:[],banks:[],users:[u],assignments:[],accounts:[],orders:[],items:[],reports:[],withdrawals:[],ledger:[],stocks:[],services};
}
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('event: ready\ndata: {}\n\n');return;}
  if(path.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(path==='/api/public'?{theme:'original'}:path==='/api/me'?{user:state().user}:state()));return;}
  const file=path==='/'?'index.html':path.slice(1);if(file.includes('..'))throw Error('path');
  const data=await readFile(new URL(file,root));res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 for(const role of ['admin','worker','wholesale']){
  profile=role;
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForSelector('.shell');
   const views=role==='admin'?['changes-offers','changes-review','changes-work','own-production','finances']:role==='worker'?['changes-work']:['changes-shop','changes-orders','credit-wallet'];
   for(const view of views){
    await page.evaluate(v=>{document.querySelector('[data-nav="'+v+'"]').click();},view);
    await page.waitForTimeout(60);
    if(!(await page.locator('#content h1').count()))throw Error('Falta título '+role+' '+view);
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('Desbordamiento horizontal '+role+' '+view+' '+width);
   }
   if(role==='admin'){await page.evaluate(()=>document.querySelector('[data-nav="changes-offers"]').click());await page.locator('[data-action="changes-offer-new"]').click();await page.waitForSelector('[name="workers"]');await page.locator('[data-action="close"]').first().click();}
   if(errors.length)throw Error(role+' '+width+': '+errors.join('; '));await context.close();
  }
 }
 console.log('SERVICES_UI_OK: tres roles, escritorio y móvil; pantallas nuevas sin errores ni desbordamientos.');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
