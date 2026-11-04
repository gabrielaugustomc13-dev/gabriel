import {randomBytes} from 'node:crypto';
import {hashPassword} from '../server/vercel-auth.mjs';
if(process.argv.includes('--secret')){console.log(randomBytes(48).toString('base64url'));process.exit(0)}
const args=process.argv.slice(2),id=args[args.indexOf('--id')+1],login=args[args.indexOf('--login')+1];
if(!args.includes('--id')||!args.includes('--login')||!id||!login){console.error('Uso: npm run auth:user -- --id master --login seu-email');process.exit(1)}
if(!process.stdin.isTTY){console.error('Execute em um terminal interativo; a senha não deve ser passada por argumentos ou arquivos.');process.exit(1)}
process.stdout.write('Nova senha (mínimo 12 caracteres; não será exibida): ');
const password=await new Promise((resolve,reject)=>{let value='';process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');const handler=chunk=>{for(const char of chunk){if(char==='\u0003'){cleanup();reject(Error('Cancelado'));return}if(char==='\r'||char==='\n'){cleanup();resolve(value);return}if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else if(char>=' ')value+=char}};function cleanup(){process.stdin.off('data',handler);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n')}process.stdin.on('data',handler)});
const passwordHash=await hashPassword(password);
console.log(JSON.stringify({id,login,name:login,passwordHash},null,2));
console.log('Guarde o hash nas variáveis de ambiente. A senha em texto não é gravada.');
