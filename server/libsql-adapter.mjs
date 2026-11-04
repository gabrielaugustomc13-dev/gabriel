export function d1Adapter(client) {
 const wrap = r => ({results:r.rows.map(row=>({...row})),meta:{changes:Number(r.rowsAffected)}});
 function statement(sql,args=[]) {
  return {
   sql,args,
   bind(...values){return statement(sql,values)},
   async first(column){const row=(await client.execute({sql,args})).rows[0];return row?(column?row[column]:{...row}):null},
   async all(){return wrap(await client.execute({sql,args}))},
   async run(){return wrap(await client.execute({sql,args}))}
  };
 }
 return {
  prepare:sql=>statement(sql),
  async batch(statements){return (await client.batch(statements.map(s=>({sql:s.sql,args:s.args})),'write')).map(wrap)}
 };
}
export async function migrate(client,migrations) {
 await client.execute('CREATE TABLE IF NOT EXISTS vercel_crm_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
 const tx=await client.transaction('write');
 try {
  for(const migration of migrations) {
   const applied=(await tx.execute({sql:'SELECT checksum FROM vercel_crm_migrations WHERE name = ?',args:[migration.name]})).rows[0];
   if(applied){if(applied.checksum!==migration.checksum)throw Error('Migração aplicada foi alterada: '+migration.name);continue}
   for(const sql of migration.sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await tx.execute(sql);
   await tx.execute({sql:'INSERT INTO vercel_crm_migrations (name,checksum) VALUES (?,?)',args:[migration.name,migration.checksum]});
  }
  await tx.execute('CREATE TABLE IF NOT EXISTS crm_auth_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, started INTEGER NOT NULL)');
  await tx.commit();
 } catch(error){await tx.rollback();throw error}
 finally{tx.close()}
}
