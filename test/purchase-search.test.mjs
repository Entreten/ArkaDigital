import test from 'node:test';
import assert from 'node:assert/strict';
import {findPurchasedEmail} from '../lib/purchase-search.mjs';
test('global email lookup returns every own delivered order and never credentials or another buyer',async()=>{
 const calls=[];
 const matches=await findPurchasedEmail({userId:'buyer',email:'  ACCOUNT@EXAMPLE.INVALID ',fingerprint:value=>{assert.equal(value,'account@example.invalid');return 'hash';},all:async(table,filter)=>{
  calls.push([table,filter]);
  if(table==='arka_accounts')return[{id:'a',buyer_id:'buyer',email_fingerprint:'hash',order_id:'o1',product_id:'p',status:'sold',cipher:'must-not-leak'},{id:'b',buyer_id:'buyer',email_fingerprint:'hash',order_id:'o2',product_id:'p',status:'purged'},{id:'foreign',buyer_id:'other',email_fingerprint:'hash',order_id:'o3',product_id:'p',status:'sold'},{id:'pending',buyer_id:'buyer',email_fingerprint:'hash',order_id:'o4',product_id:'p',status:'sold'}];
  if(table==='arka_orders')return[{id:'o1',buyer_id:'buyer',status:'delivered',created_at:'2026-11-01'},{id:'o2',buyer_id:'buyer',status:'delivered',created_at:'2026-11-02'},{id:'o4',buyer_id:'buyer',status:'pending',created_at:'2026-11-03'}];
  return[{id:'item1',order_id:'o1',product_id:'p',product_name:'PRIME VIDEO'},{id:'item2',order_id:'o2',product_id:'p',product_name:'PRIME VIDEO'}];
 }});
 assert.deepEqual(matches.map(r=>r.order_id),['o2','o1']);assert.equal(matches[0].item_id,'item2');
 assert.match(calls[0][1],/buyer_id=eq.buyer.*email_fingerprint=eq.hash/);
 assert.ok(!JSON.stringify(matches).includes('must-not-leak'));
});
test('partial or invalid emails never query the database',async()=>{
 for(const email of ['account','',null,'x@y'])await assert.rejects(findPurchasedEmail({userId:'buyer',email,fingerprint:()=>{throw Error('Should not hash');},all:()=>{throw Error('Should not query');}}),/correo completo/);
});
