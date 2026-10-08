(() => {
"use strict";

const SUPABASE_URL="https://dkaoagflpimnpovuvuhk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_lC-29jF4VXPw1HADXTUgGA_FTxwpEkB";
const SITE_URL="https://piersb1.github.io/StudyPlanner/";
const AUTH_CALLBACK_URL=`${SITE_URL}auth-callback.html`;
const RESET_PASSWORD_URL=`${SITE_URL}reset-password.html`;
const TABLE="planner_states";
const PROFILE_TABLE="profiles";
const AVATAR_BUCKET="avatars";
const OWNER_STORE="studyPlanner.public.cloudOwner";
const LAST_STORE="studyPlanner.public.cloudLastFingerprint";
const ANON_STORE="studyPlanner.public.anonymousBackup";

let api=null,user=null,profile=null,channel=null,syncReady=false,starting=false,saveTimer=null,queuedState=null;
let lastFingerprint="",pendingFingerprint="",lastSyncAt=null,choiceResolver=null,logoutRequested=false;
let registerAvatarBlob=null,profileAvatarBlob=null,removeAvatarPending=false;
const $=selector=>document.querySelector(selector);
const clone=value=>JSON.parse(JSON.stringify(value));
const serialize=value=>JSON.stringify(value);
function fingerprint(text){let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}return `${text.length}:${(hash>>>0).toString(16)}`}

const client=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});

function setMessage(element,message,type=""){
 if(!element)return;element.textContent=message;element.className=`auth-message ${type}`.trim();
}
function setStatus(label,kind="",detail=""){
 const badge=$("#cloudStatus");
 if(badge){badge.textContent=label;badge.className=`cloud-status ${kind}`.trim();badge.title=detail||label}
 const accountState=$("#accountSyncState");if(accountState)accountState.textContent=label;
 const accountTime=$("#accountSyncTime");if(accountTime)accountTime.textContent=detail||(lastSyncAt?`最近同步：${lastSyncAt.toLocaleString("zh-CN")}`:"");
 const hint=$("#dataStorageHint");if(hint)hint.textContent=user?"数据会自动同步到当前账号；仍建议定期导出完整备份。":"未登录时数据只保存在当前浏览器。登录后会同步到账号；仍建议定期导出备份。";
}
function avatarPublicUrl(path,version=""){
 if(!path||!client)return"";const {data}=client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
 return data.publicUrl+(version?`?v=${encodeURIComponent(version)}`:"");
}
function setAvatar(element,url){
 if(!element)return;element.style.backgroundImage=url?`url("${url.replaceAll('"','%22')}")`:"";element.classList.toggle("empty",!url);
}
function renderProfile(){
 const username=profile?.username||user?.user_metadata?.username||"访客";
 const avatarUrl=profile?.avatar_path?avatarPublicUrl(profile.avatar_path,profile.updated_at):"";
 if($("#profileName"))$("#profileName").textContent=username;
 setAvatar($("#profileAvatar"),avatarUrl);
 if($("#profileAvatar"))$("#profileAvatar").setAttribute("aria-label",avatarUrl?`${username}的头像`:"未设置头像");
 if($("#profileUsername"))$("#profileUsername").value=profile?.username||user?.user_metadata?.username||"";
 setAvatar($("#accountAvatarPreview"),avatarUrl);
}
function renderAccount(){
 const button=$("#accountBtn"),email=user?.email||"";
 if(button){button.textContent=user?"账号":"登录 / 注册";button.title=user?email:"登录或注册云端账号"}
 if($("#accountEmail"))$("#accountEmail").textContent=email;
 if(!user){profile=null;if($("#profileName"))$("#profileName").textContent="访客";setAvatar($("#profileAvatar"),"")}
 else renderProfile();
}
function usernameLength(value){return [...value.trim()].length}
function validUsername(value){const length=usernameLength(value);return length>=2&&length<=20}
function pendingAvatarKey(email){return `studyPlanner.public.pendingAvatar.${String(email||"").trim().toLowerCase()}`}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})}
async function dataUrlToBlob(value){return (await fetch(value)).blob()}
async function loadImageSource(file){
 if("createImageBitmap" in window)return createImageBitmap(file);
 return new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};image.onerror=()=>{URL.revokeObjectURL(url);reject(Error("无法读取图片"))};image.src=url});
}
async function compressAvatar(file){
 if(!file?.type.startsWith("image/"))throw Error("请选择 PNG、JPG 或 WebP 图片");
 if(file.size>8*1024*1024)throw Error("原始图片不能超过 8MB");
 const image=await loadImageSource(file),width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
 if(!width||!height)throw Error("无法读取图片尺寸");
 const scale=Math.min(1,256/Math.max(width,height)),canvas=document.createElement("canvas");
 canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
 canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);if(image.close)image.close();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",.82));
 if(!blob)throw Error("头像压缩失败");if(blob.size>512*1024)throw Error("压缩后的头像仍然过大");return blob;
}
async function previewAvatarFile(file,target,mode){
 try{
  const blob=await compressAvatar(file),url=URL.createObjectURL(blob);setAvatar(target,url);
  if(mode==="register")registerAvatarBlob=blob;else{profileAvatarBlob=blob;removeAvatarPending=false}
  setTimeout(()=>URL.revokeObjectURL(url),10000);
 }catch(error){setMessage(mode==="register"?$("#authMessage"):$("#profileMessage"),error.message,"error")}
}
async function uploadAvatar(blob){
 const path=`${user.id}/avatar.webp`;
 const {error}=await client.storage.from(AVATAR_BUCKET).upload(path,blob,{upsert:true,contentType:"image/webp",cacheControl:"3600"});
 if(error)throw error;return path;
}
async function saveProfileRow(username,avatarPath=profile?.avatar_path||null){
 const {data,error}=await client.from(PROFILE_TABLE).upsert({user_id:user.id,username:username.trim(),avatar_path:avatarPath},{onConflict:"user_id"}).select().single();
 if(error)throw error;profile=data;renderProfile();return data;
}
async function loadProfile(){
 const fallback=(user.user_metadata?.username||"用户").trim().slice(0,20);
 const {data,error}=await client.from(PROFILE_TABLE).select("user_id,username,avatar_path,updated_at").eq("user_id",user.id).maybeSingle();
 if(error)throw error;
 profile=data||await saveProfileRow(validUsername(fallback)?fallback:"用户");
 const key=pendingAvatarKey(user.email),pending=localStorage.getItem(key);
 if(pending){
  try{const path=await uploadAvatar(await dataUrlToBlob(pending));await saveProfileRow(profile.username,path);localStorage.removeItem(key)}
  catch(error){setMessage($("#profileMessage"),`注册头像上传失败：${error.message}`,"error")}
 }
 renderProfile();
}
async function saveProfile(event){
 event.preventDefault();if(!user)return;
 const username=$("#profileUsername").value.trim();
 if(!validUsername(username))return setMessage($("#profileMessage"),"用户名需要 2—20 个字符。","error");
 setMessage($("#profileMessage"),"正在保存……");
 try{
  let avatarPath=profile?.avatar_path||null;
  if(removeAvatarPending){if(avatarPath)await client.storage.from(AVATAR_BUCKET).remove([avatarPath]);avatarPath=null}
  else if(profileAvatarBlob)avatarPath=await uploadAvatar(profileAvatarBlob);
  await saveProfileRow(username,avatarPath);profileAvatarBlob=null;removeAvatarPending=false;
  setMessage($("#profileMessage"),"个人资料已保存。","success");
 }catch(error){setMessage($("#profileMessage"),`保存失败：${error.message}`,"error")}
}
function stageAvatarRemoval(){profileAvatarBlob=null;removeAvatarPending=true;setAvatar($("#accountAvatarPreview"),"");setMessage($("#profileMessage"),"点击“保存资料”后移除头像。")}
function hasLocalContent(){return !!api?.hasContent()}
function rememberAnonymous(state){
 if(localStorage.getItem(OWNER_STORE)||localStorage.getItem(ANON_STORE)||!hasLocalContent())return;
 localStorage.setItem(ANON_STORE,serialize(state));
}
function markSynced(serialized){
 lastFingerprint=fingerprint(serialized);pendingFingerprint="";lastSyncAt=new Date();
 localStorage.setItem(OWNER_STORE,user.id);localStorage.setItem(LAST_STORE,lastFingerprint);
 setStatus("已同步","",`最近同步：${lastSyncAt.toLocaleString("zh-CN")}`);
}
function applyCloudState(data){
 api.replaceState(clone(data));
 const serialized=serialize(data);markSynced(serialized);
}
async function pushState(data,{quiet=false}={}){
 if(!client||!user)return false;
 const payload=clone(data),serialized=serialize(payload),fp=fingerprint(serialized);
 pendingFingerprint=fp;setStatus("正在同步","syncing","本地数据已保存，正在上传云端");
 const {error}=await client.from(TABLE).upsert({user_id:user.id,data:payload},{onConflict:"user_id"});
 if(error){pendingFingerprint="";queuedState=payload;setStatus("同步失败","error",error.message);if(!quiet)api.toast("云端同步失败，本地数据仍已保存");return false}
 queuedState=null;markSynced(serialized);return true;
}
function queueSave(data){
 if(!syncReady||!user)return;
 queuedState=clone(data);clearTimeout(saveTimer);
 if(!navigator.onLine){setStatus("离线，本地已保存","error","联网后可点击立即同步");return}
 setStatus("等待同步","syncing","修改已保存在本地");
 saveTimer=setTimeout(()=>pushState(queuedState),650);
}
async function flushSave(){
 clearTimeout(saveTimer);saveTimer=null;
 if(queuedState&&user&&navigator.onLine)return pushState(queuedState,{quiet:true});
 return true;
}
function stopRealtime(){if(channel&&client)client.removeChannel(channel);channel=null}
function startRealtime(){
 stopRealtime();
 channel=client.channel(`planner-state-${user.id}`)
  .on("postgres_changes",{event:"*",schema:"public",table:TABLE,filter:`user_id=eq.${user.id}`},payload=>{
   if(!syncReady||!payload.new?.data)return;
   const serialized=serialize(payload.new.data),fp=fingerprint(serialized);
   if(fp===lastFingerprint||fp===pendingFingerprint)return;
   clearTimeout(saveTimer);saveTimer=null;queuedState=null;
   applyCloudState(payload.new.data);api.toast("已同步另一台设备的最新修改");
  })
  .on("postgres_changes",{event:"*",schema:"public",table:PROFILE_TABLE,filter:`user_id=eq.${user.id}`},payload=>{
   if(!payload.new?.username)return;profile=payload.new;renderProfile();
  })
  .subscribe(status=>{if(status==="CHANNEL_ERROR")setStatus("实时连接异常","error","本地修改仍会尝试上传")});
}
function chooseSource(){
 return new Promise(resolve=>{
  choiceResolver=resolve;
  const dialog=$("#syncChoiceDialog");if(!dialog.open)dialog.showModal();
 });
}
function resolveChoice(value){
 if(!choiceResolver)return;const resolve=choiceResolver;choiceResolver=null;$("#syncChoiceDialog").close();resolve(value);
}
async function reconcile(){
 const local=api.getState(),localSerialized=serialize(local),localFp=fingerprint(localSerialized);
 const previousOwner=localStorage.getItem(OWNER_STORE),previousFp=localStorage.getItem(LAST_STORE)||"";
 if(previousOwner!==user.id)rememberAnonymous(local);
 const {data:row,error}=await client.from(TABLE).select("data,updated_at").eq("user_id",user.id).maybeSingle();
 if(error)throw error;
 if(!row)return pushState(local,{quiet:true});
 const remote=row.data,remoteSerialized=serialize(remote),remoteFp=fingerprint(remoteSerialized);
 if(localFp===remoteFp){markSynced(remoteSerialized);return true}
 if(previousOwner===user.id&&previousFp){
  if(localFp===previousFp){applyCloudState(remote);return true}
  if(remoteFp===previousFp)return pushState(local,{quiet:true});
 }
 if(!hasLocalContent()){applyCloudState(remote);return true}
 const choice=await chooseSource();
 if(choice==="cloud"){applyCloudState(remote);return true}
 if(choice==="local")return pushState(local,{quiet:true});
 setStatus("同步已暂停","error","点击账号中的“立即同步”可重新选择");return false;
}
async function startSession(){
 if(starting||!user)return;starting=true;syncReady=false;setStatus("正在连接","syncing","正在读取账号数据");
 try{
  const resolved=await reconcile();
  syncReady=resolved;
  if(resolved)startRealtime();
 }catch(error){setStatus("连接失败","error",error.message);api.toast("无法读取云端计划，本地模式仍可使用")}
 finally{starting=false}
}
function restoreAnonymous(){
 const raw=localStorage.getItem(ANON_STORE);
 try{api.replaceState(raw?JSON.parse(raw):api.emptyState())}catch{api.replaceState(api.emptyState())}
 localStorage.removeItem(OWNER_STORE);localStorage.removeItem(LAST_STORE);
 lastFingerprint="";pendingFingerprint="";lastSyncAt=null;
}
async function handleSession(session,event=""){
 const next=session?.user||null;
 if(!next){
  const hadUser=!!user;user=null;syncReady=false;starting=false;stopRealtime();clearTimeout(saveTimer);saveTimer=null;queuedState=null;
  if(hadUser&&logoutRequested)restoreAnonymous();logoutRequested=false;renderAccount();setStatus("仅本地","local","当前数据只保存在这个浏览器");return;
 }
 const changed=user?.id!==next.id;user=next;renderAccount();
 if(changed||!profile){try{await loadProfile();renderAccount()}catch(error){api.toast(`个人资料读取失败：${error.message}`)}}
 if($("#authDialog").open)$("#authDialog").close();
 if(event==="PASSWORD_RECOVERY"&&!$("#passwordResetDialog").open)$("#passwordResetDialog").showModal();
 if(changed||!syncReady)await startSession();
}
async function login(event){
 event.preventDefault();if(!client)return setMessage($("#authMessage"),"Supabase 组件加载失败，请检查网络后刷新。","error");
 const email=$("#authEmail").value.trim(),password=$("#authPassword").value;
 setMessage($("#authMessage"),"正在登录……");
 const {error}=await client.auth.signInWithPassword({email,password});
 if(error)setMessage($("#authMessage"),`登录失败：${error.message}`,"error");
}
async function register(){
 if(!client)return setMessage($("#authMessage"),"Supabase 组件加载失败，请检查网络后刷新。","error");
 const email=$("#authEmail").value.trim(),password=$("#authPassword").value,username=$("#registerUsername").value.trim();
 if(!validUsername(username))return setMessage($("#authMessage"),"注册时必须设置 2—20 个字符的用户名。","error");
 if(!email)return setMessage($("#authMessage"),"请先填写邮箱。","error");
 if(password.length<8)return setMessage($("#authMessage"),"密码至少需要 8 个字符。","error");
 if(registerAvatarBlob){try{localStorage.setItem(pendingAvatarKey(email),await blobToDataUrl(registerAvatarBlob))}catch{return setMessage($("#authMessage"),"无法暂存头像，请重新选择图片。","error")}}
 setMessage($("#authMessage"),"正在创建账号……");
 const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:AUTH_CALLBACK_URL,data:{username}}});
 if(error)return setMessage($("#authMessage"),`注册失败：${error.message}`,"error");
 if(data.session)setMessage($("#authMessage"),"注册成功，正在登录。","success");
 else setMessage($("#authMessage"),"注册邮件已发送。请打开邮件完成验证，再回来登录。","success");
}
async function forgotPassword(){
 if(!client)return;const email=$("#authEmail").value.trim();
 if(!email)return setMessage($("#authMessage"),"请先填写需要找回密码的邮箱。","error");
 setMessage($("#authMessage"),"正在发送重置邮件……");
 const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:RESET_PASSWORD_URL});
 setMessage($("#authMessage"),error?`发送失败：${error.message}`:"如果该邮箱已注册，重置邮件将会发送。",error?"error":"success");
}
async function updatePassword(event){
 event.preventDefault();const password=$("#newPassword").value;
 if(password.length<8)return setMessage($("#passwordResetMessage"),"密码至少需要 8 个字符。","error");
 const {error}=await client.auth.updateUser({password});
 if(error)return setMessage($("#passwordResetMessage"),`更新失败：${error.message}`,"error");
 setMessage($("#passwordResetMessage"),"密码已更新。","success");setTimeout(()=>$("#passwordResetDialog").close(),900);
}
async function logout(){
 if(!client||!user)return;setStatus("正在退出","syncing");
 await flushSave();logoutRequested=true;
 const {error}=await client.auth.signOut();
 if(error){logoutRequested=false;setStatus("退出失败","error",error.message);api.toast("退出登录失败")}
 else $("#accountDialog").close();
}
async function syncNow(){
 if(!user)return;$("#accountDialog").close();
 if(syncReady){await pushState(api.getState());api.toast("同步完成")}else await startSession();
}
function bind(){
 $("#accountBtn").onclick=()=>{if(user){renderProfile();setMessage($("#profileMessage"),"");$("#accountDialog").showModal()}else{setMessage($("#authMessage"),"");$("#authDialog").showModal()}};
 $("#authForm").onsubmit=login;$("#registerBtn").onclick=register;$("#forgotPasswordBtn").onclick=forgotPassword;
 $("#registerAvatar").onchange=event=>event.target.files[0]&&previewAvatarFile(event.target.files[0],$("#registerAvatarPreview"),"register");
 $("#profileAvatarInput").onchange=event=>event.target.files[0]&&previewAvatarFile(event.target.files[0],$("#accountAvatarPreview"),"profile");
 $("#profileForm").onsubmit=saveProfile;$("#removeAvatarBtn").onclick=stageAvatarRemoval;
 $("#logoutBtn").onclick=logout;$("#syncNowBtn").onclick=syncNow;
 $("#useCloudBtn").onclick=()=>resolveChoice("cloud");$("#uploadLocalBtn").onclick=()=>resolveChoice("local");$("#pauseSyncBtn").onclick=()=>resolveChoice("pause");
 $("#syncChoiceDialog").addEventListener("cancel",event=>{event.preventDefault();resolveChoice("pause")});
 $("#passwordResetForm").onsubmit=updatePassword;
 window.addEventListener("online",()=>{if(user){setStatus("网络已恢复","syncing");if(queuedState)flushSave();else if(!syncReady)startSession()}});
 window.addEventListener("offline",()=>{if(user)setStatus("离线，本地已保存","error","联网后会继续同步")});
}
async function init(bridge){
 api=bridge;bind();renderAccount();
 if(!client){setStatus("云服务未加载","error","请检查网络后刷新页面");return}
 client.auth.onAuthStateChange((event,session)=>setTimeout(()=>handleSession(session,event),0));
 const {data,error}=await client.auth.getSession();
 if(error)setStatus("登录状态读取失败","error",error.message);
 else await handleSession(data.session,"INITIAL_SESSION");
}

window.StudyPlannerCloud={init,queueSave};
})();
