import {readFile,writeFile,mkdir,readdir,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await rm('public',{recursive:true,force:true});await mkdir('public',{recursive:true});await mkdir('server/generated',{recursive:true});
for(const name of await readdir('web')){
 if(!/\.(html|js|css)$/.test(name))continue;
 let body=await readFile('web/'+name,'utf8');
 if(name==='index.html')body=body.replace('</body>','<script src="/vercel-ui.js"></script></body>');
 if(name==='native-sync.js')body=body.replaceAll("nativeStorage==='D1'","['D1','libSQL'].includes(nativeStorage)").replaceAll('Agendador contínuo ainda não ativado na hospedagem','Agendamento diário na Vercel quando configurado');
 await writeFile('public/'+name,body);
}
for(const name of ['login.html','vercel-ui.js'])await copyFile('vercel/'+name,'public/'+name);
const sources=['web/operations-core.js','web/branding-core.js','web/company-core.js','web/native-core.js','web/pipeline-editor-core.js','web/flow-core.js','web/audit-core.js','worker/audit.mjs','worker/whatsapp.mjs','worker/access.mjs','worker/service.mjs'];
const chunks=await Promise.all(sources.map(path=>readFile(path,'utf8')));
await writeFile('server/generated/worker.mjs','const ASSETS={};\n'+chunks.join('\n')+'\nexport {putWorkspace};\n');
const migrations=[];
for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort()){
 const sql=await readFile('drizzle/'+name,'utf8');migrations.push({name,sql,checksum:createHash('sha256').update(sql).digest('hex')});
}
await writeFile('server/generated/migrations.mjs','export default '+JSON.stringify(migrations)+';\n');
console.log('Vercel: frontend estático e API Node preparados. Nenhuma conexão de produção é feita no build.');
