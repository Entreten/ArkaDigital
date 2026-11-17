
import test from 'node:test';import assert from 'node:assert/strict';
process.env.NODE_ENV='test';process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';process.env.SESSION_SECRET='test-session-secret-for-unit-tests-only';process.env.ENCRYPTION_KEY='12'.repeat(32);
const {hashPassword,verifyPassword,accountInput}=await import('../server.mjs');
test('passwords use salted hashes and reject wrong credentials',()=>{const h=hashPassword('Test-only-password-123');assert(verifyPassword('Test-only-password-123',h));assert(!verifyPassword('wrong-password',h));assert.notEqual(hashPassword('Test-only-password-123'),h);});
test('account credentials are encrypted and fingerprints are stable',()=>{const input={email:'example@example.com',password:'test-account-password',observation:'test observation'};const a=accountInput(input),b=accountInput(input);assert.equal(a.fingerprint,b.fingerprint);assert.notEqual(a.cipher,b.cipher);assert(!a.cipher.includes(input.email));assert(!a.cipher.includes(input.password));});
test('account requires email and password',()=>{assert.throws(()=>accountInput({email:'invalid',password:'x'}));assert.throws(()=>accountInput({email:'example@example.com',password:''}));});
test('weak application passwords are rejected',()=>assert.throws(()=>hashPassword('short')));
