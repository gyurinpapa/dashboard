/* Actual creation-access hook with simulated React effects and intercepted fetches.
   No browser session, database, provider or external network is used. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require(process.env.ETRYLUE_TEST_TYPESCRIPT||'typescript');
const source=fs.readFileSync(path.join(__dirname,'../app/report-builder/useCreationAccess.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal(compiled.diagnostics.filter(d=>d.category===1).length,0);
function harness(){
 const values=[],effects=[],queued=[],calls=[],listeners=new Map();let cursor=0,answer={eligible:true},failure=false,held=false,release;
 const react={useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return[values[i],v=>values[i]=typeof v==='function'?v(values[i]):v]},
 useEffect(fn,deps){const i=cursor++,old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();const entry={deps,cleanup:null};effects[i]=entry;queued.push(()=>entry.cleanup=fn())}}};
 const mod={exports:{}};
 vm.runInNewContext(compiled.outputText,{module:mod,exports:mod.exports,require:name=>{assert.equal(name,'react');return react},AbortController,URLSearchParams,Date,setTimeout,clearTimeout,
 window:{addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:(k,v)=>{if(listeners.get(k)===v)listeners.delete(k)}},
 fetch:async(url,init)=>{calls.push({url,signal:init.signal});if(held)await new Promise(r=>release=r);if(failure)throw new Error('synthetic');return{ok:true,json:async()=>answer}}});
 return{calls,render(enabled,workspace,advertiser){cursor=0;return mod.exports.useCreationAccess(enabled,workspace,advertiser)},
 async settle(){queued.splice(0).forEach(fn=>fn());await new Promise(r=>setImmediate(r))},setAnswer(v){answer=v},setFailure(v){failure=v},hold(){held=true},release(){held=false;release?.()},
 dispose(){effects.forEach(e=>e?.cleanup?.())}};
}
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name)}
async function main(){
 await test('no advertiser blocks initial UI without an entitlement request',async()=>{const h=harness();try{let r=h.render(true,'workspace','');assert.equal(r.blocked,true);assert.equal(r.denied,false);assert.match(r.message,/광고주를 먼저 선택/);await h.settle();assert.equal(h.calls.length,0)}finally{h.dispose()}});
 await test('valid paid selection opens only after verified response',async()=>{const h=harness();try{assert.equal(h.render(true,'workspace','paid').blocked,true);await h.settle();assert.equal(h.render(true,'workspace','paid').blocked,false);assert.equal(h.calls.length,1)}finally{h.dispose()}});
 await test('clearing an eligible advertiser immediately locks and sends no extra request',async()=>{const h=harness();try{h.render(true,'workspace','paid');await h.settle();assert.equal(h.render(true,'workspace','paid').blocked,false);const n=h.calls.length;assert.equal(h.render(true,'workspace','').blocked,true);await h.settle();assert.equal(h.calls.length,n)}finally{h.dispose()}});
 await test('late paid response cannot unlock a cleared selection',async()=>{const h=harness();try{h.hold();h.render(true,'workspace','paid');await h.settle();assert.equal(h.render(true,'workspace','').blocked,true);await h.settle();assert.equal(h.calls[0].signal.aborted,true);h.release();await new Promise(r=>setImmediate(r));assert.equal(h.render(true,'workspace','').blocked,true)}finally{h.release();h.dispose()}});
 await test('changing paid advertiser cannot reuse the previous permission',async()=>{const h=harness();try{h.render(true,'workspace','paid');await h.settle();assert.equal(h.render(true,'workspace','paid').blocked,false);assert.equal(h.render(true,'workspace','other').blocked,true)}finally{h.dispose()}});
 await test('refunded selected advertiser stays blocked with purchase guidance',async()=>{const h=harness();try{h.setAnswer({eligible:false});h.render(true,'workspace','refunded');await h.settle();const r=h.render(true,'workspace','refunded');assert.equal(r.blocked,true);assert.equal(r.denied,true)}finally{h.dispose()}});
 await test('lookup failure stays blocked',async()=>{const h=harness();try{h.setFailure(true);h.render(true,'workspace','paid');await h.settle();const r=h.render(true,'workspace','paid');assert.equal(r.blocked,true);assert.equal(r.failed,true)}finally{h.dispose()}});
 await test('gate-disabled legacy flow remains unrestricted and request-free',async()=>{const h=harness();try{assert.equal(h.render(false,'workspace','').blocked,false);await h.settle();assert.equal(h.render(false,'workspace','manual').blocked,false);await h.settle();assert.equal(h.calls.length,0)}finally{h.dispose()}});
 console.log(`ADVERTISER_SELECTION_ACCESS_PASS: ${checks} actual-hook scenarios`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
