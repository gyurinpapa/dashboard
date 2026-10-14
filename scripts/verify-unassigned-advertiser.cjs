const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
// Uses an existing temporary compiler; no application dependency is added.
const ts = require(process.env.ETRYLUE_TEST_TYPESCRIPT || 'typescript');
function compile(name, dependencies = {}) {
  const sourceRoot = process.env.ETRYLUE_TEST_SOURCE_ROOT || path.join(__dirname, '../src/lib/billing');
  const source = fs.readFileSync(path.join(sourceRoot, name === 'lifecycle' ? 'unassigned-lifecycle.ts' : name + '.ts'), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
  assert.equal(result.diagnostics.length, 0);
  const exports = {};
  vm.runInNewContext(result.outputText, { exports, require: key => { assert.ok(Object.hasOwn(dependencies,key)); return dependencies[key]; }, Date, Error, Number, Object });
  return exports;
}
const m = compile('lifecycle', {'./catalog':compile('catalog')});
let checks=0;
function test(name, fn) { fn(); checks++; console.log('PASS', name); }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input={orderId:id(1),advertiserId:id(2),buyerId:id(3),companyId:id(4),tenantId:id(5),name:' 광고주 ',amount:39000};
const pending=m.registration(input), approved=m.approve(pending,'2026-01-01T00:00:00.000Z');
const a={actorId:id(6),actorCompanyId:id(4),destinationCompanyId:id(4),destinationTenantId:id(5),workspaceId:id(7),workspaceRole:'admin',tenantOwner:false};
const start='2026-01-31T03:00:00.000Z';
const assigned=m.assign(approved,a,start);
test('input name normalized without mutating caller',()=>{assert.equal(pending.name,'광고주');assert.equal(input.name,' 광고주 ')});
test('unpaid cannot assign',()=>assert.throws(()=>m.assign(pending,a,start),/VERIFIED_PAYMENT_REQUIRED/));
test('unassigned verified payment cannot use reports',()=>assert.equal(m.canUse(approved,start),false));
test('assignment uses database time not approval time',()=>assert.equal(assigned.assignment.startedAt,start));
test('calendar month clamps Jan 31 to Feb 28',()=>assert.equal(assigned.assignment.paidUntil,'2026-02-28T03:00:00.000Z'));
test('active immediately at assignment',()=>assert.equal(m.canUse(assigned,start),true));
test('expiry exclusive',()=>assert.equal(m.canUse(assigned,assigned.assignment.paidUntil),false));
test('before assignment start inactive',()=>assert.equal(m.canUse(assigned,'2026-01-31T02:59:59.999Z'),false));
test('same workspace retry preserves exact object and period',()=>assert.equal(m.assign(assigned,a,'2026-02-01T00:00:00.000Z'),assigned));
test('second workspace denied',()=>assert.throws(()=>m.assign(assigned,{...a,workspaceId:id(8)},start),/ALREADY_ASSIGNED/));
for(const field of ['actorCompanyId','destinationCompanyId','destinationTenantId'])
  test('cross boundary '+field,()=>assert.throws(()=>m.assign(approved,{...a,[field]:id(99)},start),/ASSIGNMENT_SCOPE_DENIED/));
for(const role of ['staff','client','master',null])
  test('role denied '+role,()=>assert.throws(()=>m.assign(approved,{...a,workspaceRole:role},start),/ASSIGNMENT_ROLE_DENIED/));
test('tenant owner authorized in same company',()=>assert.ok(m.assign(approved,{...a,workspaceRole:null,tenantOwner:true},start).assignment));
test('director authorized in destination',()=>assert.ok(m.assign(approved,{...a,workspaceRole:'director'},start).assignment));
test('assignment cannot predate payment',()=>assert.throws(()=>m.assign(approved,a,'2025-12-01T00:00:00Z'),/INVALID_ASSIGNMENT_TIME/));
test('waiting refund full even after 168 hours',()=>assert.equal(m.refundAmount(approved,start),39000));
test('168 hour refund guarantee preserved',()=>assert.equal(m.refundAmount(m.assign(approved,a,'2026-01-01T00:00:00.000Z'),'2026-01-08T00:00:00.000Z'),39000));
test('half service remaining after guarantee refunds half',()=>assert.equal(m.refundAmount(assigned,'2026-02-14T03:00:00.000Z'),19500));
test('fractional won rounds upward',()=>assert.equal(m.refundAmount(assigned,'2026-02-14T02:59:59.999Z'),19501));
test('expired service remaining zero',()=>assert.equal(m.refundAmount(assigned,'2026-03-01T00:00:00.000Z'),0));
const reserved=m.reserveRefund(assigned), refunded=m.confirmRefund(reserved);
test('refund reservation immediately blocks use',()=>assert.equal(m.canUse(reserved,start),false));
test('refund reservation blocks assignment',()=>assert.throws(()=>m.assign(m.reserveRefund(approved),a,start),/VERIFIED_PAYMENT_REQUIRED/));
test('confirmed refund inactive',()=>assert.equal(m.canUse(refunded,start),false));
test('late duplicate DONE cannot revive refund',()=>assert.equal(m.approve(refunded,'2026-01-01T00:00:00.000Z'),refunded));
test('approved time conflict rejected',()=>assert.throws(()=>m.approve(approved,'2026-01-02T00:00:00Z'),/PAYMENT_CONFLICT/));
test('no in-place registration mutations',()=>{assert.equal(approved.assignment,null);assert.equal(assigned.payment,'verified')});
for(const amount of [0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1])
  test('invalid amount '+amount,()=>assert.throws(()=>m.registration({...input,amount}),/INVALID_AMOUNT/));
test('leap year calendar month',()=>assert.equal(m.assign(approved,a,'2028-01-31T03:00:00.000Z').assignment.paidUntil,'2028-02-29T03:00:00.000Z'));
console.log(`UNASSIGNED_LIFECYCLE_PASS: ${checks} scenarios; no database or provider requests`);
