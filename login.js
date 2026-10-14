const hostedLoginPage=globalThis.location?.hostname==='mkdd07.github.io';
if(hostedLoginPage)globalThis.location.replace('https://adotrip-campus-crm.mkmkataria07.workers.dev/login'+(globalThis.location.search||''));
const find=id=>document.getElementById(id);
async function authApi(path,body){
 let response;
 try{response=await fetch('/api/auth/'+path,{cache:'no-store',method:body!==undefined?'POST':'GET',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})})}catch{throw Error('Cannot reach the sign-in server. Check that the CRM Worker is running and try again.')}
 const raw=await response.text(),type=response.headers.get('Content-Type')||'';
 if(!raw.trim()){if(response.status===204)return {};throw Error('The sign-in server returned an empty response. Please retry at http://localhost:3000/login.')}
 if(!type.includes('application/json')||/^\s*</.test(raw))throw Error('This page is not connected to the sign-in API. Open http://localhost:3000/login instead of Live Server.');
 let data;try{data=JSON.parse(raw)}catch{throw Error('The sign-in server returned an invalid response. Please retry.')}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('The sign-in server returned an invalid response. Please retry.');
 if(!response.ok){
  const reason=typeof data.error==='string'?data.error:data.error?.message||data.message||(Array.isArray(data.errors)?data.errors.map(item=>item.message).filter(Boolean).join('; '):'');
  const action=path==='password'?'Password update':'Sign-in';
  const error=Error(reason||`${action} failed (HTTP ${response.status}). Please try again.`);error.status=response.status;throw error;
 }
 return data;
}
async function passwordCredential(email,password){
 const info=await authApi('login-info',{email});
 if(info.algorithm!=='PBKDF2')throw Error('Refresh the sign-in page to use updated authentication');
 if(info.hash!=='SHA-512'||info.iterations!==210000||info.length!==512||!/^[a-f0-9]{48}$/.test(info.salt||''))throw Error('Unsupported account password format');
 return {password_key:await derivePasswordKey(password,info.salt)};
}
async function derivePasswordKey(password,saltHex){
 const salt=Uint8Array.from(saltHex.match(/../g),byte=>parseInt(byte,16));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bytes=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-512',iterations:210000,salt},key,512));
 return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
}

function showError(error){find('loginError').textContent=error.message;find('loginError').hidden=false}
let passwordChangeUser=null;
function showPasswordChange(user){
 passwordChangeUser=user;const first=Boolean(user.must_change_password);
 if(user.image_url){find('firstLoginAvatar').src=user.image_url;find('firstLoginAvatar').hidden=false}
 find('loginForm').hidden=true;find('changePasswordForm').hidden=false;
 find('currentPasswordField').hidden=first;find('currentPassword').required=!first;
 find('loginEyebrow').textContent=first?'YOUR FIRST SIGN-IN':'ACCOUNT SECURITY';
 find('loginHeroTitle').textContent=first?`Welcome, ${user.name.split(' ')[0]}.`:'Update your password';
 find('loginHeroCopy').textContent=first?'Set your own password to open your team workspace.':'Choose a new password for your account.';
 find('loginFormEyebrow').textContent=first?'ONE LAST STEP':'YOUR ACCOUNT';
 find('loginFormTitle').textContent=first?'Make it yours':'Change password';
 find('loginFormCopy').textContent=first?'Replace your starter password before accessing student records.':'Enter your current password and choose a new one.';
 (first?find('newPassword'):find('currentPassword')).focus();
}
function returnToSignIn(message){
 passwordChangeUser=null;
 find('changePasswordForm').hidden=true;find('loginForm').hidden=false;
 for(const id of ['currentPassword','newPassword','confirmPassword','generatedPassword'])find(id).value='';
 find('generatedPasswordBox').hidden=true;
 find('loginFormTitle').textContent='Sign in';find('loginFormCopy').textContent='Sign in again to update your password.';
 showError(Error(message));find('loginEmail').focus();
}
find('loginForm').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('[type=submit]');button.disabled=true;find('loginError').hidden=true;try{const fields=Object.fromEntries(new FormData(event.target)),credential=await passwordCredential(fields.email,fields.password);const {user}=await authApi('login',{email:fields.email,...credential});find('loginPassword').value='';if(user.must_change_password)showPasswordChange(user);else location.replace('/')}catch(error){showError(error)}finally{button.disabled=false}};
find('changePasswordForm').onsubmit=async event=>{
 event.preventDefault();find('loginError').hidden=true;
 const password=find('newPassword').value;
 if(password.length<12||password.length>128){showError(Error('Use a password between 12 and 128 characters'));return}
 if(password!==find('confirmPassword').value){showError(Error('The passwords do not match'));return}
 const button=event.target.querySelector('[type=submit]');button.disabled=true;
 try{
  const {user}=await authApi('session');
  if(!user){returnToSignIn('Your session expired. Sign in again before changing your password.');return}
  if(!user.must_change_password&&!find('currentPassword').value){showPasswordChange(user);showError(Error('Enter your current password to continue.'));return}
  const salt=Array.from(crypto.getRandomValues(new Uint8Array(24)),byte=>byte.toString(16).padStart(2,'0')).join('');const payload={new_password:password,new_password_salt:salt,new_password_key:await derivePasswordKey(password,salt)};if(!user.must_change_password){const current=find('currentPassword').value;if(current===password){showError(Error('Choose a different password from your current password'));return}const credential=await passwordCredential(user.email,current);payload.current_password=current;if(credential.password_key)payload.current_password_key=credential.password_key;}
  await authApi('password',payload);
  for(const id of ['currentPassword','newPassword','confirmPassword','generatedPassword'])find(id).value='';
  location.replace('/');
 }catch(error){
  if(error.status===401)returnToSignIn('Your session expired. Sign in again before changing your password.');
  else showError(error);
 }finally{button.disabled=false}
};
find('generateLoginPassword').onclick=async()=>{try{const {password}=await authApi('generate-password',{});find('newPassword').value=password;find('confirmPassword').value=password;find('generatedPassword').value=password;find('generatedPasswordBox').hidden=false}catch(error){showError(error)}};
find('copyLoginPassword').onclick=async()=>{try{await navigator.clipboard.writeText(find('generatedPassword').value);find('copyLoginPassword').textContent='Copied'}catch{find('generatedPassword').select()}};
find('cancelFirstLogin').onclick=async()=>{try{await authApi('logout',{});location.replace('/login')}catch(error){showError(error)}};
document.querySelectorAll('[data-toggle-password]').forEach(button=>button.onclick=()=>{const input=find(button.dataset.togglePassword);input.type=input.type==='password'?'text':'password';button.textContent=input.type==='password'?'Show':'Hide';button.setAttribute('aria-label',button.textContent+' password')});
window.lucide?.createIcons();if(!hostedLoginPage&&(typeof staticLoginPreview==='undefined'||!staticLoginPreview))authApi('session').then(({user})=>{if(user?.must_change_password||user&&new URLSearchParams(globalThis.location?.search||'').get('change')==='1')showPasswordChange(user);else if(user)location.replace('/')}).catch(showError);
