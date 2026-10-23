function auditActor(request,source='crm'){
 const id=request?.headers.get('oai-authenticated-user-id');let name=request?.headers.get('oai-authenticated-user-full-name');
 if(name&&request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{name=decodeURIComponent(name)}catch{name=null}}
 return{id:id||'system',label:(id?(name||request.headers.get('oai-authenticated-user-email')||'Usuário autenticado'):'Sistema / serviço').slice(0,180),type:id?'user':'system',source};
}
function auditInsertStatements(env,entries,id,version,token){
 const chunks=[];let chunk=[],size=0;for(const entry of entries){const bytes=JSON.stringify(entry).length;if(size+bytes>180000&&chunk.length){chunks.push(chunk);chunk=[];size=0}chunk.push(entry);size+=bytes}if(chunk.length)chunks.push(chunk);
 return chunks.map(items=>env.DB.prepare(`INSERT INTO native_audit_entries (event_id,workspace_id,workspace_version,occurred_at,actor_id,actor_label,actor_type,source,action,entity_type,entity_id,entity_name,deal_id,summary,changes_json)
 SELECT json_extract(value,'$.eventId'), ?, ?, json_extract(value,'$.occurredAt'), json_extract(value,'$.actorId'), json_extract(value,'$.actorLabel'), json_extract(value,'$.actorType'), json_extract(value,'$.source'), json_extract(value,'$.action'), json_extract(value,'$.entityType'), json_extract(value,'$.entityId'), json_extract(value,'$.entityName'), json_extract(value,'$.dealId'), json_extract(value,'$.summary'), json_extract(value,'$.changes')
 FROM json_each(?) WHERE EXISTS(SELECT 1 FROM native_workspaces WHERE id = ? AND version = ? AND commit_token = ?)`).bind(id,version,JSON.stringify(items),id,version,token));
}
async function auditQuery(env,id,url){
 const p=url.searchParams,clauses=['workspace_id = ?'],args=[id],bounded=(k,n=200)=>String(p.get(k)||'').slice(0,n);
 for(const [key,column]of [['entity','entity_type'],['actor','actor_id'],['action','action'],['deal','deal_id']]){const v=bounded(key);if(v){clauses.push(column+' = ?');args.push(v)}}
 for(const [key,op]of [['from','>='],['to','<=']]){const raw=bounded(key,40);if(raw){const date=new Date(raw);if(!Number.isFinite(date.getTime()))throw Error('Data inválida');clauses.push('occurred_at '+op+' ?');args.push(date.toISOString())}}
 const q=bounded('q');if(q){clauses.push('(summary LIKE ? OR entity_name LIKE ? OR actor_label LIKE ? OR entity_id LIKE ?)');for(let n=0;n<4;n++)args.push('%'+q+'%')}
 const total=await env.DB.prepare('SELECT COUNT(*) AS n FROM native_audit_entries WHERE '+clauses.join(' AND ')).bind(...args).first();
 const cursor=bounded('cursor',20);if(cursor){if(!/^\d+$/.test(cursor)||!Number.isSafeInteger(Number(cursor)))throw Error('Página inválida');clauses.push('seq < ?');args.push(Number(cursor))}
 const n=Number(p.get('limit')||50),limit=Number.isFinite(n)?Math.max(1,Math.min(100,Math.floor(n))):50;
 const result=await env.DB.prepare('SELECT * FROM native_audit_entries WHERE '+clauses.join(' AND ')+' ORDER BY seq DESC LIMIT ?').bind(...args,limit+1).all();
 const hasMore=result.results.length>limit,items=result.results.slice(0,limit).map(r=>({seq:r.seq,eventId:r.event_id,workspaceId:r.workspace_id,version:r.workspace_version,occurredAt:r.occurred_at,actorId:r.actor_id,actorLabel:r.actor_label,actorType:r.actor_type,source:r.source,action:r.action,entityType:r.entity_type,entityId:r.entity_id,entityName:r.entity_name,dealId:r.deal_id,summary:r.summary,changes:JSON.parse(r.changes_json)}));
 const actors=await env.DB.prepare('SELECT DISTINCT actor_id,actor_label FROM native_audit_entries WHERE workspace_id = ? ORDER BY actor_label LIMIT 100').bind(id).all();
 return{items,total:total.n,nextCursor:hasMore?String(items.at(-1).seq):null,actors:actors.results.map(a=>({id:a.actor_id,label:a.actor_label})),timezone:'America/Sao_Paulo',serverConfirmed:true};
}
