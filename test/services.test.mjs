import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestEmail,validateChange,commission,parseAccounts} from '../lib/change-rules.mjs';
import {workbook} from '../lib/xlsx.mjs';
test('random suggestions keep the domain and have no collisions in 2000 rows',()=>{
 const emails=new Set(Array.from({length:2000},()=>suggestEmail('juan@example.com')));
 assert.equal(emails.size,2000);for(const email of emails)assert.match(email,/^juan\d{12}@example\.com$/);
});
test('3 percent is rounded cumulatively, never once per 20-cent row',()=>{
 assert.equal(commission(2000),60);assert.equal(commission(20),1);
 let fee=0;for(let i=1;i<=100;i++)fee+=commission(i*20)-commission((i-1)*20);
 assert.equal(fee,60);assert.equal(2000-fee,1940);
});
test('changes respect the original field and the requested common password',()=>{
 const original={email:'old@example.com',password:'old'},request={pattern:'juan@example.com',fixed_password:'common'};
 assert.throws(()=>validateChange('password',original,{email:'other@example.com',password:'common'},request));
 assert.throws(()=>validateChange('email',original,{email:'juanabcdef123@example.com',password:'changed'},request));
 assert.throws(()=>validateChange('both',original,{email:'juan01234567@example.com',password:'common'},request));
 assert.throws(()=>validateChange('both',original,{email:'juanabcdef123@example.com',password:'wrong'},request));
 assert.doesNotThrow(()=>validateChange('both',original,{email:'juan482759301648@example.com',password:'common'},request));
});
test('requested base, domain and customer password are never replaced by defaults',()=>{
 const original={email:'old@example.com',password:'old'},request={pattern:'felipe@example.com',requested_password:'customer-chosen-for-this-test'};
 for(let i=0;i<100;i++)assert.match(suggestEmail(request.pattern),/^felipe\d{12}@example\.com$/);
 assert.doesNotThrow(()=>validateChange('both',original,{email:'felipe482759301648@example.com',password:request.requested_password},request));
 for(const email of ['juan482759301648@example.com','felipe482759301648@other.example','felipeabcdef123@example.com','felipe123456789012@example.com','felipe111111111111@example.com','felipe121212121212@example.com'])assert.throws(()=>validateChange('both',original,{email,password:request.requested_password},request));
 assert.throws(()=>validateChange('both',original,{email:'felipe482759301648@example.com',password:'unrequested'},request));
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
