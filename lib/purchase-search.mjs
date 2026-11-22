export async function findPurchasedEmail({userId,email,fingerprint,all}){
 if(typeof email!=='string'||email.length>320||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))throw Error('Escribe el correo completo de la cuenta.');
 const hash=fingerprint(email.trim().toLowerCase());
 const accounts=(await all('arka_accounts','buyer_id=eq.'+encodeURIComponent(userId)+'&email_fingerprint=eq.'+hash+'&status=in.(sold,purged)','id,buyer_id,email_fingerprint,product_id,order_id,status,expires_at')).filter(a=>a.buyer_id===userId&&a.email_fingerprint===hash&&['sold','purged'].includes(a.status));
 const ids=[...new Set(accounts.map(a=>a.order_id).filter(Boolean))],orders=[],items=[];
 for(let i=0;i<ids.length;i+=100){
  const filter='order_id=in.('+ids.slice(i,i+100).join(',')+')';
  const[o,it]=await Promise.all([all('arka_orders','id=in.('+ids.slice(i,i+100).join(',')+')&buyer_id=eq.'+encodeURIComponent(userId)+'&status=eq.delivered','id,buyer_id,status,created_at,delivered_at'),all('arka_items',filter,'id,order_id,product_id,product_name')]);
  orders.push(...o);items.push(...it);
 }
 const ownOrders=new Map(orders.filter(o=>o.buyer_id===userId&&o.status==='delivered').map(o=>[o.id,o]));
 return accounts.flatMap(a=>{const o=ownOrders.get(a.order_id);if(!o)return[];const item=items.find(i=>i.order_id===o.id&&i.product_id===a.product_id);return[{account_id:a.id,order_id:o.id,item_id:item?.id||null,product_name:item?.product_name||'Producto de tu compra',purchased_at:o.created_at,delivered_at:o.delivered_at,status:a.status,expires_at:a.expires_at}];}).sort((a,b)=>(b.purchased_at||'').localeCompare(a.purchased_at||''));
}
