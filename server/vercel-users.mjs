import {hashPassword} from './vercel-auth.mjs';

export function storedAccount(db, key, value) {
 const column = key === 'login' ? 'u.login' : 'u.user_id';
 return db.prepare(
  'SELECT u.user_id AS id, u.login, u.password_hash AS passwordHash, m.label AS name ' +
  'FROM crm_auth_users u JOIN crm_access_members m ON m.user_id = u.user_id WHERE ' + column + ' = ?'
 ).bind(value).first();
}

export function accountManagement(db, configuredUsers) {
 return {
  async list(workspaceId) {
   const {results} = await db.prepare(
    'SELECT u.user_id, u.login FROM crm_auth_users u JOIN crm_access_members m ON m.user_id = u.user_id WHERE m.workspace_id = ?'
   ).bind(workspaceId).all();
   return new Map(results.map(row => [row.user_id, row.login]));
  },
  configuredLogin(userId) {
   return configuredUsers.find(user => user.id === userId)?.login;
  },
  async save(userId, login, password) {
   login = typeof login === 'string' ? login.trim().toLowerCase() : '';
   if (!login || login.length > 160 || /[^!-~]/.test(login)) {
    throw Error('Informe um login sem espaços, de até 160 caracteres.');
   }
   if (configuredUsers.some(user => user.login === login || user.id === userId)) {
    throw Error('Login ou identificador já utilizado.');
   }
   const existing = await storedAccount(db, 'login', login);
   if (existing && existing.id !== userId) throw Error('Login já utilizado.');
   const hash = await hashPassword(password, 1);
   return db.prepare(
    'INSERT INTO crm_auth_users (user_id, login, password_hash) VALUES (?, ?, ?) ' +
    'ON CONFLICT(user_id) DO UPDATE SET login=excluded.login, password_hash=excluded.password_hash'
   ).bind(userId, login, hash);
  },
  remove(userId) {
   return db.prepare('DELETE FROM crm_auth_users WHERE user_id = ?').bind(userId);
  }
 };
}
