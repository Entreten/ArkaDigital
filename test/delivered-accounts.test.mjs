import test from 'node:test';
import assert from 'node:assert/strict';
import {installServices} from '../services.mjs';

function fixture({status='delivered',expired=false,purged=false,expireDuringRead=false}={}){
 const routes=new Map(),calls=[];
 const owner={id:'owner',role:'wholesale'};
 const id='order-fixture',deadline=Date.now()+60_000;
 const order={id,buyer_id:owner.id,number:12,status,access_until:new Date(expired?Date.now()-1000:deadline).toISOString(),purged_at:purged?'2026-11-01':null};
 const units=Array.from({length:200},(_,i)=>({id:`unit-${i+1}`,position:i+1,status:i===198?'cancelled':'approved',linked_account_id:null}));
 const app=Object.fromEntries(['get','post','put','delete','patch'].map(method=>[method,(path,fn)=>routes.set(path,fn)]));
 installServices(app,{
  fail:(message,status)=>Object.assign(Error(message),{status}),
  db:async path=>{calls.push(path);assert.match(path,/^arka_change_orders\?id=eq\.order-fixture/);return [order];},
  all:async(table,query,columns)=>{
   calls.push(table);
   if(table==='arka_change_units'){assert.match(query,/^order_id=eq\.order-fixture&order=position\.asc$/);return units;}
   assert.equal(table,'arka_change_secrets');assert.equal(columns,'unit_id,result_cipher');
   return query.slice('unit_id=in.('.length,-1).split(',').map(unit_id=>({unit_id,result_cipher:unit_id}));
  },
  unseal:value=>value?{email:value+'@example.invalid',password:'test-result-'+value,original:'not returned'}:null,
 });
 const route=async(path,user=owner)=>{
  const response={headers:{}};
  const res={set:(key,value)=>{Object.assign(response.headers,typeof key==='string'?{[key]:value}:key);return res;},json:body=>{response.body=body;},send:body=>{response.body=body;}};
  if(!expireDuringRead){await routes.get(path)({user,params:{id}},res);return response;}
  const clock=Date.now;let n=0;
  try{Date.now=()=>++n===1?deadline-1:deadline;await routes.get(path)({user,params:{id}},res);}
  finally{Date.now=clock;}
  return response;
 };
 return {calls,route};
}
const results='/api/services/orders/:id/results',xlsx='/api/services/orders/:id/export';
test('200 ordered results in one response with batched reads, no old passwords, and no cancelled credentials',async()=>{
 const {calls,route}=fixture();
 const {headers,body}=await route(results);
 assert.equal(headers['Cache-Control'],'no-store');
 assert.equal(calls.length,4);
 assert.equal(body.accounts.length,200);
 assert.deepEqual(body.accounts[199],{position:200,status:'approved',email:'unit-200@example.invalid',password:'test-result-unit-200'});
 assert.deepEqual(body.accounts[198],{position:199,status:'cancelled',email:null,password:null});
 assert.deepEqual(Object.keys(body),['number','access_until','server_now','accounts']);
 calls.length=0;
 const exported=await route(xlsx);assert.equal(calls.length,4);assert.equal(exported.body.subarray(0,2).toString(),'PK');assert.equal(exported.headers['Cache-Control'],'no-store');
});
test('credentials only for owning wholesaler, after delivery, before expiry, even if expiry occurs during loading',async()=>{
 const denied=fixture();
 for(const user of [{id:'other',role:'wholesale'},{id:'owner',role:'admin'},{id:'owner',role:'worker'}])await assert.rejects(denied.route(results,user),{status:403});
 assert.equal(denied.calls.length,1);
 await assert.rejects(fixture({status:'processing'}).route(results),{status:403});
 for(const options of [{expired:true},{purged:true},{expireDuringRead:true}])await assert.rejects(fixture(options).route(results),{status:410});
});
