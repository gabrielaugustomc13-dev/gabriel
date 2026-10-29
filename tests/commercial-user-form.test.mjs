import assert from 'node:assert/strict';
import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),CRMCore=require('../web/operations-core.js');
function setup(){
 const error={textContent:''},button={disabled:false,textContent:''},cancel={disabled:false},form={isConnected:true,elements:{name:{},email:{}},addEventListener(){},values:{name:'Ana',email:'ana@example.com',active:'on',available:'on',region:'',size:'',product:''}};
 const nodes={'#commercialUserForm':form,'#commercialUserError':error,'#commercialUserSave':button,'#commercialUserCancel':cancel};
 let closes=0,opens=0,release;
 const context=vm.createContext({CRMCore,structuredClone,clearTimeout,crmSession:{role:'master'},liveProfilePreview:null,activeWorkspace:'a',state:{sellers:[],salesTeams:[],pipelines:[],deals:[],tasks:[]},nativeSyncReady:true,nativeSyncBusy:false,nativeSyncError:'',nativeSyncDirty:false,nativeSyncTimer:null,uid:()=> 'new-user',field:()=>'',openModal:()=>{opens++},closeModal:()=>{closes++},$:s=>nodes[s],toast:()=>{},render:()=>{},renderSalesTeams:()=>{},FormData:class{constructor(f){this.f=f}get(k){return this.f.values[k]??null}has(k){return k in this.f.values}},save(){context.nativeSyncDirty=true},syncNative:async()=>{await new Promise(resolve=>{release=resolve});if(!context.nativeSyncError)context.nativeSyncDirty=false}});
 vm.runInContext(readFileSync(new URL('../web/commercial-user-form.js',import.meta.url),'utf8'),context);
 return{context,form,error,button,get closes(){return closes},get opens(){return opens},release:()=>release?.()};
}
let h=setup();h.context.sellerForm();const pending=h.form.onsubmit({target:h.form,preventDefault(){}});assert.equal(h.button.disabled,true);assert.equal(h.closes,0);h.context.nativeSyncError='Servidor indisponível';h.release();await pending;assert.equal(h.closes,0);assert.match(h.error.textContent,/não confirmou/);assert.equal(h.button.disabled,false);
// Retry preserves the initial record ID and cannot duplicate a locally pending user.
h.context.nativeSyncError='';h.context.nativeSyncDirty=false;const retry=h.form.onsubmit({target:h.form,preventDefault(){}});h.release();await retry;assert.equal(h.context.state.sellers.length,1);assert.equal(h.closes,1);assert.equal(h.context.state.sellers[0].email,'ana@example.com');
h=setup();h.context.state.sellers=[{id:'old',name:'Outra pessoa',email:'ana@example.com'}];h.context.sellerForm();await h.form.onsubmit({target:h.form,preventDefault(){}});assert.equal(h.closes,0);assert.match(h.error.textContent,/e-mails únicos/);assert.equal(h.context.state.sellers.length,1);
h=setup();h.context.sellerForm();h.context.activeWorkspace='b';await h.form.onsubmit({target:h.form,preventDefault(){}});assert.match(h.error.textContent,/empresa selecionada mudou/);assert.equal(h.context.state.sellers.length,0);
h=setup();h.context.liveProfilePreview={role:'admin'};h.context.sellerForm();assert.equal(h.opens,0);
console.log('✓ Cadastro comercial: confirmação de servidor, falha visível, retry sem duplicação, validação e troca de empresa.');
