import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../public/',import.meta.url),now=new Date().toISOString();
let profile='admin';
const user={id:'11111111-1111-4111-8111-111111111111',name:'Prueba UI',email:'ui@example.invalid',role:'admin',balance_cents:0,reserved_cents:0};
function state(){
 const u={...user,role:profile},services={offers:[{id:'offer1',name:'Cambio de correo de prueba',mode:'both',price_cents:25,margin_cents:5,instructions:'Utiliza sufijos aleatorios.',active:true,workers:[]}],orders:[],units:[],notifications:[],wallet:[],credit_cents:0,history:[]};
 services.finance={settings:{reserve_bps:null,pending_hours:24,unpaid_retention_days:30},entries:[],costs:[],sales:[],users:[],wallet:[],storage:{used_bytes:1000,limit_bytes:524288000,measured_at:now},available:0,reserve:0,commercial:0,own:0,commissions:0,withdrawn:0,workers_due:0,buyer_credits:0,pending_historical:0,unknown_costs:0,pending_reserve:0,funds_processing:0};
 return {user:u,settings:{theme:'original',announcement:'',announcement_enabled:false,announcement_interval:75},products:[{id:'product1',name:'Prime de prueba',mode:'duration',duration_months:6,price_cents:100,active:true}],banks:[],users:[u],assignments:[],accounts:[],orders:[{id:'order1',buyer_id:u.id,status:'delivered',total_cents:10000,credit_cents:0,created_at:now,delivered_at:now}],items:[{id:'item1',order_id:'order1',product_id:'product1',product_name:'Prime de prueba',quantity:100}],reports:[],withdrawals:[],ledger:[],stocks:[],services};
}
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('event: ready\ndata: {}\n\n');return;}
  if(path==='/api/notifications'){res.setHeader('Content-Type','application/json');res.end('{"notifications":[]}');return;}
  if(path==='/api/services/unit/unit-demo'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({unit:{id:'unit-demo',position:1,worker_id:'user1',status:'assigned'},order:{id:'change1',number:1,mode:'both',unit_cents:25,margin_cents:5},request:{pattern:'felipe@example.invalid',requested_password:'customer-chosen-test'},original:{email:'current@example.invalid',password:'current-test-only'},suggestion:{email:'felipe482759301648@example.invalid',password:'customer-chosen-test'}}));return;}
  if(path.startsWith('/api/orders/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({accounts:Array.from({length:100},(_,i)=>({id:'account'+i,email:'account'+i+'@example.invalid',status:'sold',data:{email:'account'+i+'@example.invalid',password:'test-only-password-'+i,observation:'Observación '+i}}))}));return;}
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
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForSelector('.shell');
   const views=role==='admin'?['changes-offers','changes-review','changes-work','own-production','finances']:role==='worker'?['changes-work']:['changes-shop','changes-orders','credit-wallet'];
   for(const view of views){
    await page.evaluate(v=>{document.querySelector('[data-nav="'+v+'"]').click();},view);
    await page.waitForTimeout(60);
    if(!(await page.locator('#content h1').count()))throw Error('Falta título '+role+' '+view);
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('Desbordamiento horizontal '+role+' '+view+' '+width);
   }
   if(role==='admin'){await page.evaluate(()=>document.querySelector('[data-nav="changes-offers"]').click());await page.locator('[data-action="changes-offer-new"]').click();await page.waitForSelector('[name="workers"]');await page.locator('[data-action="close"]').first().click();}
   await page.locator('.notification-sound-toggle').click();await page.waitForFunction(()=>document.querySelector('.notification-sound-toggle')?.textContent==='Sonido: activado');
   if(role==='wholesale'){
    await page.evaluate(()=>document.querySelector('[data-nav="purchases"]').click());await page.locator('[data-action="purchase"]').click();await page.waitForSelector('#purchase-accounts tbody tr');
    if(await page.locator('#purchase-accounts tbody tr').count()!==100)throw Error('No se mostraron las 100 cuentas juntas');
    if(await page.locator('#purchase-accounts').getByText('test-only-password-99',{exact:true}).count()!==1)throw Error('No se mostró la contraseña final');
    await page.locator('[data-action="purchase-copy-all"]').click();const copied=await page.evaluate(()=>navigator.clipboard.readText());if(copied.split('\n').length!==100)throw Error('No se copiaron las 100 cuentas');
    await page.locator('#purchase-search').fill('account42@');await page.locator('[data-action="purchase-copy-all"]').click();if(!(await page.evaluate(()=>navigator.clipboard.readText())).startsWith('account42@'))throw Error('La copia no respeta el filtro');
    await page.locator('[data-action="close"]').first().click();
    await page.evaluate(()=>document.querySelector('[data-nav="changes-shop"]').click());await page.locator('[data-action="changes-buy"]').click();if(await page.locator('[name="linked"]').count())throw Error('Continúa el selector de compras anteriores');
    for(const name of ['current_email','current_password','email_base','email_domain','requested_password'])if(await page.locator('[name="'+name+'"]').count()!==1)throw Error('Falta el campo del cliente '+name);
    if(await page.locator('[name="requested_password"]').inputValue())throw Error('Hay una contraseña predeterminada');
    await page.locator('[name="bulk_mode"]').check();if(!await page.locator('[name="current_email"]').isDisabled()||await page.locator('[name="text"]').isDisabled())throw Error('No se puede usar la carga múltiple');
    await page.locator('[data-action="close"]').first().click();
   }
   if(role==='admin'){await page.evaluate(()=>document.querySelector('[data-nav="orders"]').click());await page.locator('[data-action="sale-delete-test"]').first().click();await page.waitForSelector('[name="confirmation"]');await page.locator('[data-action="close"]').first().click();}
   if(role==='admin'||role==='worker'){await page.evaluate(()=>handlers['changes-unit']('unit-demo'));const text=await page.locator('.change-instructions').textContent();if(!text.includes('felipe482759@example.invalid')||text.includes('juan')||!text.includes('cliente para este pedido'))throw Error('Las instrucciones no respetan lo que pidió el cliente');await page.locator('[data-action="close"]').first().click();}
   if(errors.length)throw Error(role+' '+width+': '+errors.join('; '));await context.close();
  }
 }
 console.log('SERVICES_UI_OK: tres roles, escritorio y móvil; 100 credenciales visibles y copiables, filtro, activación de sonido, borrado confirmado y sin selector de compras anteriores.');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
