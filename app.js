const $=id=>document.getElementById(id);
const NAMES={emma:'Эмма Уотерс',mira:'Мира Палевски',leah:'Лея Куин',cassian:'Кассиан Роу',theo:'Тео Марч'};
const SETTINGS_KEY='sly26_settings_v1';
const newId=()=>crypto.randomUUID().replace(/-/g,'');
let settings=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null')||{endpoint:'',userId:newId(),theme:'dark',font:19};
let current=null,busy=false,lastImage=null,images=[];
const key=suffix=>'sly26:'+settings.endpoint+':'+settings.userId+':'+suffix;
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
function store(k,v){localStorage.setItem(k,JSON.stringify(v))}
function saveSettings(){store(SETTINGS_KEY,settings)}
function applyStyle(){document.documentElement.dataset.theme=settings.theme;document.documentElement.style.setProperty('--reader',settings.font+'px')}
function endpoints(){
 const u=new URL(settings.endpoint);
 if(!['https:','http:'].includes(u.protocol))throw Error('Укажите HTTP(S) адрес n8n.');
 let base=u.href.replace(/\/+$/,'');
 if(/\/slytherin-pilot-turn$/.test(base))base=base.replace(/\/slytherin-pilot-turn$/,'');
 if(!/\/webhook(?:-test)?$/.test(base))base+='/webhook';
 return {turn:base+'/slytherin-pilot-turn',image:base+'/slytherin-pilot-image'};
}
function notice(text){$('notice').textContent=text;$('notice').hidden=!text}
function controls(){
 for(const id of ['send','advance','pause','illustrate','reset','connect'])$(id).disabled=busy;
 $('advance').disabled=busy||!current||current.paused||current.ended;
 $('illustrate').disabled=busy||!current;
 $('send').disabled=busy||!current;
 $('pause').disabled=busy||!current;
 $('retry').hidden=!read(key('pendingTurn'))&&!read(key('pendingImage'));
 $('pause').textContent=current?.paused?'Снять паузу':'Пауза';
 $('advance').textContent=current?.ended?'Пилот завершён':'Продолжить →';
 $('activity').textContent=busy?'Сохраняем и ждём ответ…':'';
}
function appendBeat(parent,beat,role){
 const node=document.createElement('article');node.className='entry '+(role==='user'?'user':beat.type);
 const label=document.createElement('div');label.className='author';
 label.textContent=role==='user'?'Я':beat.type==='dialogue'?(NAMES[beat.character_id]||'Собеседник'):'';
 const text=document.createElement('div');text.className='prose';text.textContent=beat.text;
 node.append(label,text);parent.append(node);
}
function imageCard(image){
 if(!image.url||!/^https?:\/\//.test(image.url))return;
 const fig=document.createElement('figure');fig.className='image-card';
 const img=document.createElement('img');img.src=image.url;img.alt='Иллюстрация текущего момента';img.loading='lazy';
 img.onerror=()=>{img.hidden=true;const msg=document.createElement('p');msg.textContent='Ссылка на изображение недоступна. URL провайдера может иметь ограниченный срок хранения.';fig.prepend(msg)};
 const caption=document.createElement('figcaption');caption.textContent=image.snapshot?.scene?.location||'Иллюстрация';
 fig.append(img,caption);$('chat').append(fig);
}
function render(r,anchorId){
 current=r;store(key('view'),r);
 const sc=r.scene||{};
 $('position').textContent=[sc.date,sc.period,sc.location].filter(Boolean).join(' · ');
 $('present').textContent='Рядом: '+((sc.present||[]).map(id=>NAMES[id]).join(', ')||'никого из компании');
 $('chat').replaceChildren();
 for(const record of r.transcript||[]){
  const block=document.createElement('section');block.dataset.id=record.id;
  for(const b of record.beats||[])appendBeat(block,b,record.role);
  $('chat').append(block);
 }
 images=r.images||images;for(const img of images)imageCard(img);
 $('facts').replaceChildren();$('appointments').replaceChildren();
 for(const item of r.journal||[]){const li=document.createElement('li');li.textContent=item.text;$('facts').append(li)}
 for(const item of r.appointments||[]){const li=document.createElement('li');li.textContent=item.text;$('appointments').append(li)}
 if(!r.journal?.length)$('facts').textContent='Открытых записей пока нет.';
 if(!r.appointments?.length)$('appointments').textContent='Пока нет сохранённых договорённостей.';
 controls();
 requestAnimationFrame(()=>{
  const target=[...$('chat').children].find(n=>n.dataset.id===anchorId);
  if(target)$('chat').scrollTop=target.offsetTop-$('chat').offsetTop;
 });
}
async function post(url,payload){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),160000);
 try{
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
  let r;try{r=await response.json()}catch{throw Error('Ответ сервера не является JSON. Проверьте адрес Production Webhook и активность workflow.')}
  if(typeof r?.ok!=='boolean')throw Error('Неожиданный ответ сервера. Запрос сохранён для повторной проверки.');
  if(!response.ok&&!r.error)r.error='HTTP '+response.status;
  return r;
 }finally{clearTimeout(timer)}
}
async function runTurn(pending){
 const r=await post(endpoints().turn,pending.payload);
 if(!r.ok){
  if(!r.busy){localStorage.removeItem(key('pendingTurn'));if(pending.payload.text)$('text').value=pending.payload.text}
  throw Error(r.error||'Не удалось подтвердить ход.');
 }
 if(r.requestId!==pending.payload.requestId)throw Error('Неверный requestId в ответе.');
 localStorage.removeItem(key('pendingTurn'));
 render(r,pending.payload.requestId+'_assistant');notice('');
}
async function turn(action,text=''){
 if(busy)return;
 if(!settings.endpoint){$('settings').showModal();return}
 const existing=read(key('pendingTurn'));
 const pending=existing||{payload:{userId:settings.userId,requestId:newId(),action,text}};
 store(key('pendingTurn'),pending);busy=true;controls();
 try{await runTurn(pending);if(!existing&&text)$('text').value=''}
 catch(e){notice((e.name==='AbortError'?'Сервер ещё не подтвердил ход.':e.message)+' Используйте «Повторить проверку», если запрос остался в ожидании.')}
 finally{busy=false;controls()}
}
async function checkImage(pending){
 const r=await post(endpoints().image,pending.payload);
 if(r.status==='completed'&&r.url){
  localStorage.removeItem(key('pendingImage'));
  if(!images.some(i=>i.requestId===r.requestId))images.push(r);
  if(current){current.images=images;render(current)}
  notice('Иллюстрация готова.');return true;
 }
 if(r.status==='failed'){localStorage.removeItem(key('pendingImage'));throw Error(r.error||'Генерация не удалась.')}
 if(r.status==='unknown')throw Error(r.error||'Создание пока не подтверждено.');
 notice('Изображение создаётся. Можно продолжать историю; статус проверится автоматически.');return false;
}
let imageTimer=null;
function scheduleImage(){clearTimeout(imageTimer);imageTimer=setTimeout(()=>{if(!busy&&read(key('pendingImage')))illustrate();else if(read(key('pendingImage')))scheduleImage()},12000)}
async function illustrate(){
 if(busy)return;
 const pending=read(key('pendingImage'))||{payload:{userId:settings.userId,requestId:newId()}};
 store(key('pendingImage'),pending);busy=true;controls();
 try{const done=await checkImage(pending);if(!done)scheduleImage()}
 catch(e){notice(e.message)}finally{busy=false;controls()}
}
async function connect(){
 if(busy)return;
 const endpoint=$('endpoint').value.trim(),userId=$('userId').value.trim();
 if(!/^[A-Za-z0-9_-]{24,80}$/.test(userId)){notice('ID должен содержать 24–80 латинских букв, цифр, _ или -.');return}
 settings={...settings,endpoint,userId};
 try{endpoints();saveSettings()}catch(e){notice(e.message);return}
 clearTimeout(imageTimer);current=null;images=[];$('chat').replaceChildren();$('settings').close();
 const cached=read(key('view'));if(cached)render(cached);
 await turn('start');if(!read(key('pendingTurn'))&&read(key('pendingImage')))scheduleImage();
}
$('form').addEventListener('submit',e=>{e.preventDefault();const text=$('text').value.trim();if(text)turn('free',text)});
$('advance').onclick=()=>{if(confirm('Завершить текущую сцену и перейти к следующей части дня? Незаконченные разговоры останутся в памяти.'))turn('advance')};
$('pause').onclick=()=>turn(current?.paused?'resume':'pause');
$('reset').onclick=()=>{if(confirm('Начать пилот заново для этого ID? Текущий прогресс этой кампании будет заменён.'))turn('reset')};
$('retry').onclick=async()=>{if(read(key('pendingTurn')))await turn('sync');else if(read(key('pendingImage')))await illustrate()};
$('illustrate').onclick=illustrate;
$('connect').onclick=connect;
$('openSettings').onclick=()=>{$('endpoint').value=settings.endpoint;$('userId').value=settings.userId;$('settings').showModal()};
$('openJournal').onclick=()=>$('journal').showModal();
$('theme').onclick=()=>{settings.theme=settings.theme==='dark'?'light':'dark';saveSettings();applyStyle()};
$('font').onchange=()=>{settings.font=Number($('font').value);saveSettings();applyStyle()};
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
$('font').value=settings.font;applyStyle();controls();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
if(settings.endpoint){
 const cached=read(key('view'));if(cached)render(cached);
 turn('start').then(()=>{if(!read(key('pendingTurn'))&&read(key('pendingImage')))scheduleImage()});
}else{$('endpoint').value='';$('userId').value=settings.userId;$('settings').showModal()}
