import test from 'node:test';
import assert from 'node:assert/strict';
await import('../public/finance-dashboard.js');
const summarize=globalThis.arkaFinancialSummary;
const entry=(kind,amount_cents,event_key='',extra={})=>({kind,amount_cents,event_key,...extra});
test('explains screenshot amounts: earnings are 611 cents, owner balance is 668 including 57 of corrections',()=>{
 const f={available:668,entries:[entry('margin',465),entry('own',130),entry('commission',16),entry('adjustment',57,'worker-balance:example')],users:[{id:'w',role:'worker',name:'Test',balance_cents:427,reserved_cents:100}]};
 const ledger=[{worker_id:'w',kind:'production',amount_cents:484},{worker_id:'w',kind:'balance_adjustment',amount_cents:-57}];
 const before=JSON.stringify({f,ledger});const s=summarize(f,ledger);
 assert.equal(s.earned,611);assert.equal(s.adjustments,57);assert.equal(s.available,668);assert.equal(s.workersDue,427);assert.equal(s.requested,100);
 assert.equal(s.workers[0].free,327);assert.equal(s.workers[0].difference,0);assert.equal(s.reportedDifference,0);assert.equal(JSON.stringify({f,ledger}),before);
});
test('does not subtract commission twice from net wages or count pending withdrawals as paid',()=>{
 const s=summarize({available:3,entries:[entry('commission',3,'commission:a',{user_id:'w'})],users:[{id:'w',role:'worker',balance_cents:97,reserved_cents:50}]},[{worker_id:'w',kind:'production',amount_cents:97}]);
 assert.equal(s.workers[0].balance,97);assert.equal(s.workers[0].production,97);assert.equal(s.workers[0].fees,3);assert.equal(s.workers[0].difference,0);assert.equal(s.workersPaid,0);
});
test('historical and new reservations produce the same commercial profit without double subtraction',()=>{
 const a=summarize({available:90,entries:[entry('margin',100),entry('reserve',10),entry('adjustment',-10,'stock-reserve-adjust:a')],users:[]});
 const b=summarize({available:90,entries:[entry('margin',90),entry('reserve',10)],users:[]});
 assert.equal(a.earned,90);assert.equal(a.commercial,b.commercial);assert.equal(a.adjustments,0);assert.equal(a.available,b.available);assert.equal(a.reserve,10);
});
test('withdrawals, historical fees, customer wallets, unknown movements and mismatches remain separate',()=>{
 const s=summarize({available:45,entries:[entry('margin',100),entry('adjustment',-40,'worker-balance:x'),entry('withdrawal',-20),entry('legacy',5),entry('reserve_use',-3)],users:[{id:'w',role:'worker',balance_cents:18,reserved_cents:0},{id:'b',role:'wholesale',credit_cents:30}]},[{worker_id:'w',kind:'production',amount_cents:100},{worker_id:'w',kind:'historical_commission',amount_cents:-3},{worker_id:'w',kind:'withdrawal',amount_cents:-80}]);
 assert.equal(s.available,45);assert.equal(s.earned,100);assert.equal(s.adjustments,-40);assert.equal(s.unclassified,5);assert.equal(s.workers[0].production,97);assert.equal(s.workers[0].difference,1);assert.equal(s.buyerCredit,30);assert.equal(s.workersPaid,80);
});
