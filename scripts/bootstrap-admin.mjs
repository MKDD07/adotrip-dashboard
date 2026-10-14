import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import { hashPassword, generatePassword } from '../worker/auth.mjs';
globalThis.crypto ||= webcrypto;
const directory='private';fs.mkdirSync(directory,{recursive:true,mode:0o700});
if(fs.existsSync(`${directory}/first-login.txt`)){console.log('Administrator credentials already prepared.');process.exit(0)}
const email=process.argv[2]||'pooja@adotrip.com',name='Pooja',userId='ADMIN-POOJA',password=generatePassword();
const q=value=>"'"+String(value).replace(/'/g,"''")+"'";
const hash=await hashPassword(password);
fs.writeFileSync(`${directory}/bootstrap-admin.sql`,`INSERT OR IGNORE INTO auth_users(id,name,email,password_hash,role,must_change_password,image_url) VALUES(${q(userId)},${q(name)},${q(email.toLowerCase())},${q(hash)},'admin',1,'/api/auth/avatar');\n`,{mode:0o600});
fs.writeFileSync(`${directory}/first-login.txt`,`Campus CRM administrator\nEmail: ${email}\nStarter password: ${password}\n\nOpen http://localhost:3000/login\nThe first sign-in requires a new password before accessing CRM records.\nThis password is only for initial sign-in. Keep this file private.\n`,{mode:0o600});
console.log('Prepared private administrator credentials and hashed bootstrap SQL.');
