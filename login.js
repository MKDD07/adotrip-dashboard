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
 if(!response.ok)throw Error(data.error||'Sign-in could not be completed. Please try again.');return data;
}
function showError(error){find('loginError').textContent=error.message;find('loginError').hidden=false}
function showPasswordChange(user){if(user.image_url){find('firstLoginAvatar').src=user.image_url;find('firstLoginAvatar').hidden=false}find('loginForm').hidden=true;find('changePasswordForm').hidden=false;find('loginEyebrow').textContent='YOUR FIRST SIGN-IN';find('loginHeroTitle').textContent=`Welcome, ${user.name.split(' ')[0]}.`;find('loginHeroCopy').textContent='Set your own password to open your team workspace.';find('loginFormEyebrow').textContent='ONE LAST STEP';find('loginFormTitle').textContent='Make it yours';find('loginFormCopy').textContent='Replace your starter password before accessing student records.';find('newPassword').focus()}
find('loginForm').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('[type=submit]');button.disabled=true;find('loginError').hidden=true;try{const {user}=await authApi('login',Object.fromEntries(new FormData(event.target)));find('loginPassword').value='';if(user.must_change_password)showPasswordChange(user);else location.replace('/')}catch(error){showError(error)}finally{button.disabled=false}};
find('changePasswordForm').onsubmit=async event=>{event.preventDefault();find('loginError').hidden=true;if(find('newPassword').value!==find('confirmPassword').value){showError(Error('The passwords do not match'));return}const button=event.target.querySelector('[type=submit]');button.disabled=true;try{await authApi('password',{new_password:find('newPassword').value});location.replace('/')}catch(error){showError(error)}finally{button.disabled=false}};
find('generateLoginPassword').onclick=async()=>{try{const {password}=await authApi('generate-password',{});find('newPassword').value=password;find('confirmPassword').value=password;find('generatedPassword').value=password;find('generatedPasswordBox').hidden=false}catch(error){showError(error)}};
find('copyLoginPassword').onclick=async()=>{try{await navigator.clipboard.writeText(find('generatedPassword').value);find('copyLoginPassword').textContent='Copied'}catch{find('generatedPassword').select()}};
find('cancelFirstLogin').onclick=async()=>{try{await authApi('logout',{});location.replace('/login')}catch(error){showError(error)}};
document.querySelectorAll('[data-toggle-password]').forEach(button=>button.onclick=()=>{const input=find(button.dataset.togglePassword);input.type=input.type==='password'?'text':'password';button.textContent=input.type==='password'?'Show':'Hide';button.setAttribute('aria-label',button.textContent+' password')});
window.lucide?.createIcons();if(!hostedLoginPage&&(typeof staticLoginPreview==='undefined'||!staticLoginPreview))authApi('session').then(({user})=>{if(user?.must_change_password)showPasswordChange(user);else if(user)location.replace('/')}).catch(showError);
