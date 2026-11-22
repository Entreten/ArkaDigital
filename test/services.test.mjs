import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChange,commission,parseAccounts,parsePasswordChanges} from '../lib/change-rules.mjs';
import {futureDeadline} from '../lib/work-deadlines.mjs';
import {workbook} from '../lib/xlsx.mjs';
test('only password changes are permitted and the original email is preserved',()=>{
 const original={email:'old@example.com',password:'old'},request={requested_password:'chosen'};
 assert.doesNotThrow(()=>validateChange('password',original,{email:original.email,password:'chosen'},request));
 for(const mode of ['email','both'])assert.throws(()=>validateChange(mode,original,{email:original.email,password:'chosen'},request));
 assert.throws(()=>validateChange('password',original,{email:'changed@example.com',password:'chosen'},request));
 assert.throws(()=>validateChange('password',original,{email:original.email,password:'invented'},request));
 assert.throws(()=>validateChange('password',original,{email:original.email,password:'chosen'},{}));
});
test('3 percent is rounded cumulatively, never once per 20-cent row',()=>{
 assert.equal(commission(2000),60);assert.equal(commission(20),1);
 let fee=0;for(let i=1;i<=100;i++)fee+=commission(i*20)-commission((i-1)*20);
 assert.equal(fee,60);assert.equal(2000-fee,1940);
});
test('each account keeps its own requested new password and exact whitespace',()=>{
 const rows=parsePasswordChanges('a@example.com|old-a|new-a\nb@example.com\told|b\t new|b ');
 assert.equal(rows.length,2);assert.equal(rows[0].new_password,'new-a');assert.equal(rows[1].new_password,' new|b ');
 for(const text of ['bad','a@example.com|old','a@example.com|old|','a@example.com|old|a\na@example.com|old|b'])assert.throws(()=>parsePasswordChanges(text));
});
test('deadlines require a future instant with timezone and normalize to UTC',()=>{
 const now=Date.parse('2026-11-22T00:00:00Z');
 assert.equal(futureDeadline('2026-11-22T08:00:00-05:00',now),'2026-11-22T13:00:00.000Z');
 for(const value of [null,'','2026-11-22T08:00','badZ','2026-11-21T00:00:00Z'])assert.throws(()=>futureDeadline(value,now));
});
test('bulk input rejects duplicates and malformed rows without echoing credentials',()=>{
 assert.equal(parseAccounts('a@example.com|a|b\nb@example.com\tsecond').length,2);
 assert.throws(()=>parseAccounts('a@example.com|one\na@example.com|two'),/duplicada/);
 assert.throws(()=>parseAccounts('bad-line'),/Línea 1/);
});
test('Excel exports are ZIP workbooks with text cells, never formulas',()=>{
 const file=workbook([['Correo','Clave'],['=HYPERLINK("x")','a<&']]);
 assert.equal(file.readUInt32LE(),0x04034b50);
 assert(file.includes(Buffer.from('t="inlineStr"')));
 assert(!file.includes(Buffer.from('<f>')));
 assert(file.includes(Buffer.from('a&lt;&amp;')));
});
