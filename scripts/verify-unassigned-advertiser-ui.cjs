const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require(process.env.ETRYLUE_TEST_TYPESCRIPT||'typescript');
const root=path.join(__dirname,'..');let checks=0;
function nodes(tree){const list=[];function walk(x){if(Array.isArray(x)){x.forEach(walk);return;}if(x&&typeof x==='object'){list.push(x);(x.children||[]).forEach(walk);}}walk(tree);return list;}
async function component(file,props,status=200,payload={advertiser:[],newAdvertiserWorkspaces:[]},postStatus=200,postError='ORDER_DRAFT_CONFLICT'){
 const values=[],calls=[],sdkCalls=[],storage=new Map();let cursor=0,effect,scheduled=false;
 const R={Fragment:'fragment',useState(v){const i=cursor++;if(!(i in values))values[i]=v;return[values[i],x=>{values[i]=x}]},useRef(v){const i=cursor++;if(!(i in values))values[i]={current:v};return values[i]},useEffect(f){if(!scheduled){effect=f;scheduled=true}},createElement(type,props,...children){return{type,props:props||{},children}}};
 const compiled=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal(compiled.diagnostics.filter(d=>d.category===1).length,0);
 const mod={exports:{}},styles={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
 const window={confirm:()=>true,location:{assign:()=>{}},TossPayments:()=>({payment:()=>({requestPayment:async value=>sdkCalls.push(value)})})};
 vm.runInNewContext(compiled.outputText,{module:mod,exports:mod.exports,React:R,require:n=>n==='react'?R:n.endsWith('.css')?styles:n==='next/navigation'?{useRouter:()=>({refresh(){}})}:n.endsWith('/catalog')?{won:n=>n+'원'}:{},AbortController,console,window,
  crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000601'},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),get length(){return storage.size},key:i=>[...storage.keys()][i],removeItem:k=>storage.delete(k)},
  fetch:async(url,init)=>{calls.push({url,body:init?.body?JSON.parse(init.body):null});if(init?.method==='POST')return{ok:postStatus===200,status:postStatus,json:async()=>postStatus===200?{orderId:'fixture',orderName:'Fixture',amount:39000,clientKey:'test_ck_fixture',customerKey:'fixture',successUrl:'https://fixture.invalid/success',failUrl:'https://fixture.invalid/fail'}:{error:postError}};return{ok:status===200,status,json:async()=>payload};}});
 const render=()=>{cursor=0;return mod.exports.default(props)};
 render();if(effect){effect();await new Promise(r=>setImmediate(r));}
 return{render,calls,sdkCalls,storage};
}
async function test(name,fn){await fn();checks++;console.log('PASS',name)}
async function main(){
 for(const registration of [false,true])for(const [status,error] of [[401,'LOGIN_REQUIRED'],[403,'TEST_ACCESS_REQUIRED'],[503,'TARGET_LOOKUP_FAILED']]){
  await test(`failed lookup hides form ${registration}/${status}`,async()=>{const c=await component('app/billing/checkout/CheckoutForm.tsx',{scope:'advertiser',mode:'once',registration},status,{error});const n=nodes(c.render());assert.ok(!n.some(x=>x.type==='form'));assert.equal(c.sdkCalls.length,0)});
 }
 await test('new mode removes workspace selector and misleading empty-state',async()=>{const c=await component('app/billing/checkout/CheckoutForm.tsx',{scope:'advertiser',mode:'once',registration:true});const n=nodes(c.render()),text=JSON.stringify(c.render());assert.ok(n.some(x=>x.props.id==='new-advertiser'));assert.ok(!n.some(x=>x.props.id==='new-workspace'));assert.ok(!text.includes('등록 가능한 워크스페이스가 없습니다'));assert.ok(text.includes('배정 완료일부터 1개월'))});
 await test('legacy mode retains workspace selector and existing empty-state',async()=>{const c=await component('app/billing/checkout/CheckoutForm.tsx',{scope:'advertiser',mode:'once',registration:false});assert.ok(nodes(c.render()).some(x=>x.props.id==='new-workspace'));assert.ok(JSON.stringify(c.render()).includes('등록 가능한 워크스페이스가 없습니다'))});
 for(const registration of [false,true])await test('submit payload and double-click guard '+registration,async()=>{
  const c=await component('app/billing/checkout/CheckoutForm.tsx',{scope:'advertiser',mode:'once',registration},200,{advertiser:[],newAdvertiserWorkspaces:[{id:'workspace-fixture',name:'Fixture workspace'}]});
  nodes(c.render()).find(x=>x.props.id==='new-advertiser').props.onChange({target:{value:'  Fixture name  '}});
  nodes(c.render()).find(x=>x.props.type==='checkbox').props.onChange({target:{checked:true}});
  const form=nodes(c.render()).find(x=>x.type==='form');await Promise.all([form.props.onSubmit({preventDefault(){}}),form.props.onSubmit({preventDefault(){}})]);
  const posts=c.calls.filter(x=>x.body);assert.equal(posts.length,1);assert.equal(posts[0].body.newAdvertiserName,'Fixture name');assert.equal(c.sdkCalls.length,1);
  if(registration){assert.ok(!Object.hasOwn(posts[0].body,'workspaceId'));assert.ok([...c.storage.keys()][0].includes('assignment-start:'));}else assert.equal(posts[0].body.workspaceId,'workspace-fixture');
 });
 await test('failed checkout cannot open payment SDK',async()=>{const c=await component('app/billing/checkout/CheckoutForm.tsx',{scope:'advertiser',mode:'once',registration:true},200,{advertiser:[],newAdvertiserWorkspaces:[]},409);nodes(c.render()).find(x=>x.props.id==='new-advertiser').props.onChange({target:{value:'Fixture'}});nodes(c.render()).find(x=>x.props.type==='checkbox').props.onChange({target:{checked:true}});await nodes(c.render()).find(x=>x.type==='form').props.onSubmit({preventDefault(){}});assert.equal(c.sdkCalls.length,0);assert.ok(JSON.stringify(c.render()).includes('결제 결과 확인'))});
 for(const error of ['REGISTRATION_ACCOUNT_REQUIRED','REGISTRATION_UNAVAILABLE'])await test('account verification failure explains no payment without manual company setup '+error,async()=>{const c=await component('app/billing/checkout/CheckoutForm.tsx',{scope:'advertiser',mode:'once',registration:true},200,{advertiser:[],newAdvertiserWorkspaces:[]},409,error);nodes(c.render()).find(x=>x.props.id==='new-advertiser').props.onChange({target:{value:'Fixture'}});nodes(c.render()).find(x=>x.props.type==='checkbox').props.onChange({target:{checked:true}});await nodes(c.render()).find(x=>x.type==='form').props.onSubmit({preventDefault(){}});assert.equal(c.sdkCalls.length,0);const text=JSON.stringify(c.render());assert.ok(text.includes('결제는 시작되지 않았습니다'));assert.ok(!text.includes('회사 계정 준비가 필요합니다'))});
 await test('awaiting assignment offers refund without report preparation',async()=>{const c=await component('app/billing/review/result/ManageButtons.tsx',{orderId:'fixture',status:'active',scope:'advertiser',targetId:'fixture',monthly:false,paid:false,cancelled:false,awaitingAssignment:true,refundAmount:39000});const n=nodes(c.render()),text=JSON.stringify(c.render());assert.ok(text.includes('테스트 환불 요청'));assert.ok(!text.includes('신규 광고주 준비하고 리포트 시작'));await n.find(x=>x.type==='button'&&JSON.stringify(x.children).includes('결제 상태 재확인')).props.onClick();assert.ok(JSON.stringify(c.render()).includes('관리자 배정 대기 상태'));assert.ok(!JSON.stringify(c.render()).includes('결제 승인 완료 상태가 확인되지 않았습니다'))});
 console.log(`UNASSIGNED_UI_PASS: ${checks} actual-component scenarios; hooks/fetch/SDK mocked; not a browser visual test`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
