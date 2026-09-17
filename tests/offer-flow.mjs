import { build, transform } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const harness = { mode: '', calls: [] };
globalThis.__offerTest = harness;
const bundled = await build({entryPoints:['src/pages/api/lead-magnet.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'isolate-delivery',setup(b){
 b.onResolve({filter:/lib\/(google|loops|email)$/},a=>({path:a.path.split('/').at(-1),namespace:'fake'}));
 b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:a.path==='google'?`export const GOOGLE_SCOPES={sheets:'sheets'}; export async function getGoogleAccessToken(){return 'fake'}; export async function appendSheetRow(...args){globalThis.__offerTest.calls.push(['sheet',args]);if(globalThis.__offerTest.mode==='all')throw Error('simulated')}`:a.path==='loops'?`export async function sendLoopsEvent(env,opts){globalThis.__offerTest.calls.push(['loops',opts]);return ['all','loops'].includes(globalThis.__offerTest.mode)?null:{success:true}}`:`export async function sendEmail(env,opts){globalThis.__offerTest.calls.push(['email',opts]);if(['all','email'].includes(globalThis.__offerTest.mode))throw Error('simulated');return {id:'fake'}}`}));
}}]});
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const originalError=console.error;console.error=()=>{};
for(const magnet of ['free-guide','hospital-bag-checklist']){
 for(const mode of ['','loops','email','all']){
  harness.mode=mode;harness.calls=[];
  const req=new Request('http://localhost/api/lead-magnet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'qa@example.invalid',magnet,source:'/offers/guide?utm_campaign=qa'})});
  const res=await POST({request:req,locals:{runtime:{env:{}}}});const data=await res.json();
  assert.equal(data.ok,true);assert.equal(data.warnings.includes('loops'),['loops','all'].includes(mode));assert.equal(data.warnings.includes('confirmation-email'),['email','all'].includes(mode));
  const email=harness.calls.find(([kind,o])=>kind==='email'&&o.to==='qa@example.invalid')[1];
  assert.ok(email.html.includes(magnet==='free-guide'?'dudela-15-things.pdf':'dudela-hospital-bag-checklist.pdf'));
  assert.ok(!email.html.includes('five times'));assert.ok(email.html.includes('/offers/prep'));
  assert.equal(harness.calls.find(([kind])=>kind==='loops')[1].source,'/offers/guide?utm_campaign=qa');
 }
}
harness.calls=[];
const bad=await POST({request:new Request('http://localhost/api/lead-magnet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:''})}),locals:{runtime:{env:{}}}});
assert.equal(bad.status,400);assert.equal(harness.calls.length,0);console.error=originalError;
const astro=await readFile('src/pages/offers/[offer].astro','utf8');
const script=(await transform(astro.match(/<script>([\s\S]*?)<\/script>/)[1],{loader:'ts'})).code;
for(const scenario of ['success','email-failure','network-failure']){
 const nodes=[];const button={disabled:false,style:{}},input={disabled:false};
 const status={textContent:'',children:[],append(el){this.children.push(el)}};
 let submit;
 const form={dataset:{download:'/downloads/dudela-15-things.pdf'},querySelector:s=>s==='button'?button:input,addEventListener:(name,fn)=>{submit=fn}};
 const document={querySelector:s=>s==='#offer-form'?form:status,createElement:tag=>{const el={tag,style:{},children:[],append(child){this.children.push(child)}};nodes.push(el);return el}};
 let sent;
 const context={document,location:{pathname:'/offers/guide',search:'?utm_source=instagram&utm_campaign='+('x'.repeat(130))+'&unwanted=no'},URLSearchParams,FormData:class{constructor(){this.map=new Map()}set(k,v){this.map.set(k,v)}},fetch:async(url,opts)=>{sent=opts.body;if(scenario==='network-failure')throw Error('offline');return {ok:true,json:async()=>({ok:true,warnings:scenario==='email-failure'?['confirmation-email']:[]})}}};
 vm.runInNewContext(script,context);await submit({preventDefault(){}});
 assert.equal(button.disabled,scenario!=='network-failure');assert.equal(input.disabled,scenario!=='network-failure');
 const source=sent.map.get('source');assert.ok(source.includes('utm_source=instagram'));assert.ok(!source.includes('unwanted'));assert.equal(new URL('https://example.test'+source).searchParams.get('utm_campaign').length,100);
 if(scenario!=='network-failure'){assert.ok(nodes.some(n=>n.href==='/downloads/dudela-15-things.pdf'));assert.ok(nodes.some(n=>n.href==='/offers/prep'));assert.equal(button.textContent,'Your download is ready');}
 if(scenario==='email-failure')assert.ok(status.textContent.includes('couldn’t send'));
 if(scenario==='network-failure')assert.ok(status.textContent.includes('try again'));
}
console.log('PASS: 8 isolated delivery scenarios, invalid input, and 3 signup UI states. No external messages sent.');
