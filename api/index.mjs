import {createClient} from '@libsql/client';
import {d1Adapter,migrate} from '../server/libsql-adapter.mjs';
import {route} from '../server/vercel-runtime.mjs';
import worker from '../server/generated/worker.mjs';
import migrations from '../server/generated/migrations.mjs';
let ready;
async function database(){
 if(!ready)ready=(async()=>{
  const url=process.env.TURSO_DATABASE_URL;
  if(!url||!/^libsql:\/\/|^https:\/\//.test(url)||!process.env.TURSO_AUTH_TOKEN)throw Error('Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN.');
  const client=createClient({url,authToken:process.env.TURSO_AUTH_TOKEN});await migrate(client,migrations);return d1Adapter(client);
 })().catch(error=>{ready=null;throw error});
 return ready;
}
export async function toRequest(req,env){
 const origin=new URL(env.APP_URL).origin,url=new URL(req.url,origin);
 const routeName=req.query?.__crm_route||url.searchParams.get('__crm_route');
 if(routeName){url.pathname='/api/'+(Array.isArray(routeName)?routeName.join('/'):routeName);url.searchParams.delete('__crm_route')}
 url.protocol='https:';url.host=new URL(origin).host;
 const headers=new Headers();for(const [key,value]of Object.entries(req.headers||{}))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):String(value));
 // Vercel supplies this header at its edge; don't accept a caller's x-real-ip.
 headers.set('x-real-ip',String(req.headers?.['x-forwarded-for']||'unknown').split(',')[0].trim());
 let body;
 if(!['GET','HEAD'].includes(req.method)){
  if(req.body!==undefined)body=Buffer.isBuffer(req.body)?req.body:Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body));
  else {const chunks=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>1600000)throw Error('Payload muito grande');chunks.push(b)}body=Buffer.concat(chunks)}
  if(body.length>1600000)throw Error('Payload muito grande');
 }
 return new Request(url,{method:req.method,headers,...(body?{body}:{})});
}
export default async function handler(req,res){
 try{
  const request=await toRequest(req,process.env),DB=await database(),response=await route(request,{...process.env,DB},worker);
  res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error('CRM Vercel adapter:',error.message);res.statusCode=error.message==='Payload muito grande'?413:503;res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');res.end(JSON.stringify({error:res.statusCode===413?'Conteúdo muito grande':'Configure o banco e o ambiente do CRM na Vercel.'}))}
}
