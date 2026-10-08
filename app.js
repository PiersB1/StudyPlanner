(() => {
"use strict";
const STORE="studyPlanner.public.v1", VIEW_STORE="studyPlanner.public.viewDays", TODAY_FIRST_STORE="studyPlanner.public.todayFirst", CHART_MODE_STORE="studyPlanner.public.chartMode", SIDEBAR_STORE="studyPlanner.public.sidebarRight", BACKLOG_SORT_STORE="studyPlanner.public.backlogSort", START=6*60, END=23*60, HOUR=72, SNAP=5;
const DOW=["日","一","二","三","四","五","六"];
const SUBJECTS=["编程","阅读","设计","示例课程"];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const uid=()=>crypto.randomUUID?crypto.randomUUID():"id-"+Date.now()+"-"+Math.random().toString(16).slice(2);
const pad=n=>String(n).padStart(2,"0");
const dateISO=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseDate=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parseDate(s);d.setDate(d.getDate()+n);return dateISO(d)};
const monthStart=s=>{const d=parseDate(s);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-01`};
const addMonths=(s,n)=>{const d=parseDate(s);d.setDate(1);d.setMonth(d.getMonth()+n);return dateISO(d)};
const monday=s=>{const d=parseDate(s),day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return dateISO(d)};
const minutes=s=>{const [h,m]=s.split(":").map(Number);return h*60+m};
const clock=n=>`${pad(Math.floor(n/60))}:${pad(n%60)}`;
// Round calendar geometry only; labels, stored times and durations stay exact.
const snappedMinutes=s=>Math.round(minutes(s)/SNAP)*SNAP;
const displayRange=e=>`${e.start}–${e.end}`;
const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=s=>String(s||"").replace(/<style[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g,"").replace(/&#20540;/g,"值").replace(/&amp;/g,"&").trim();
const typeName={study:"学习",class:"课程"};
const defaultState=()=>{
 const events=(window.SEED_EVENTS||[]).filter(e=>e.type!=="flex").map(e=>normalizeSubject({...e}));
 return {
 version:2,
 events,
 goals:[],
 reflections:{},
 settings:{targets:[120,120,120,120,120,120,120],dateTargets:{},warn:true}
}};
let state, weekStart=monday(dateISO(new Date())), rangeStart=weekStart, viewDays=Number(localStorage.getItem(VIEW_STORE))===3?3:7, todayFirst=localStorage.getItem(TODAY_FIRST_STORE)==="true", view="week", history=[], drag=null;
let chartMode=localStorage.getItem(CHART_MODE_STORE)==="month"?"month":"week",chartAnchor=dateISO(new Date());
let sidebarRight=localStorage.getItem(SIDEBAR_STORE)==="true";
let backlogSort=["oldest","newest","schedule"].includes(localStorage.getItem(BACKLOG_SORT_STORE))?localStorage.getItem(BACKLOG_SORT_STORE):"oldest";
if(todayFirst)rangeStart=dateISO(new Date());

function load(){
 try{state=JSON.parse(localStorage.getItem(STORE))||defaultState()}catch{state=defaultState()}
 state.events=(state.events||[]).filter(e=>e.type!=="flex").map(normalizeSubject);
 state.version=2;
 if(!state.settings)state.settings=defaultState().settings;
 state.settings.dateTargets ||= {};
 state.goals ||= []; state.reflections ||= {};
 save(false);
}
function ensureSubjects(){
 if(!Array.isArray(state.subjects))state.subjects=[...new Set([...SUBJECTS,...state.events.map(e=>e.subject),...(state.goals||[]).map(g=>g.subject)].filter(s=>s&&s!=="未分类"))];
 state.subjects=[...new Set(state.subjects.filter(s=>typeof s==="string"&&s.trim()&&s!=="未分类").map(s=>s.trim()))];
}
function save(render=true){ensureSubjects();localStorage.setItem(STORE,JSON.stringify(state));if(render)renderAll()}
function snapshot(){history.push(JSON.stringify(state));if(history.length>30)history.shift();$("#undoBtn").disabled=false}
function undo(){if(!history.length)return;state=JSON.parse(history.pop());$("#undoBtn").disabled=!history.length;save()}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),2200)}
function targetFor(date){return Number(state.settings.dateTargets[date] ?? state.settings.targets[parseDate(date).getDay()] ?? 240)}
function duration(e){return Math.max(0,minutes(e.end)-minutes(e.start))}
function countsStudy(e){return e.type==="study"}
function actualDuration(e){return duration(e)}
function eventsOn(date){return state.events.filter(e=>e.date===date)}
function inferSubject(title){
 const t=title||"";
 const matched=state.subjects?.find(subject=>t.includes(subject));
 return matched||"未分类";
}
function normalizeSubject(e){if(e.subject==="其他"&&/面向对象编程|Java(?!Script)/i.test(e.title||""))e.subject="Java";return e}

function renderAll(){renderSubjects();renderNav();renderSidebarPosition();renderWeek();renderGoals();renderList();renderVisualization();renderManagedSubjects()}
function renderNav(){
 $$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
 $$(".view").forEach(v=>v.classList.toggle("active",v.id===view+"View"));
}
function renderSidebarPosition(){
 $("#weekView").classList.toggle("sidebar-right",sidebarRight);
 $("#sideSwitchBtn").textContent=sidebarRight?"←　移到左侧":"移到右侧　→";
}
function renderSubjects(){
 const values=[...state.subjects,"未分类"].sort();
 const current=$("#subjectFilter").value;
 $("#subjectFilter").innerHTML='<option value="">全部科目</option>'+values.map(s=>`<option ${s===current?"selected":""}>${escapeHtml(s)}</option>`).join("");
 const selected=$("#subjectInput").value;
 $("#subjectInput").innerHTML='<option value="">按标题自动识别</option>'+values.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")+'<option value="__custom__">添加科目</option>';
 $("#subjectInput").value=selected;
}
let pendingSubjectDelete=null;
let previousSubjectSelection="";
function chooseEventSubject(){
 const select=$("#subjectInput");
 if(select.value!=="__custom__"){previousSubjectSelection=select.value;return}
 select.value=previousSubjectSelection;$("#addEventSubjectForm").reset();$("#addEventSubjectDialog").showModal();$("#eventNewSubjectInput").focus();
}
function addEventSubject(ev){
 ev.preventDefault();const name=$("#eventNewSubjectInput").value.trim();
 if(!name)return toast("请输入科目名称");
 if(name==="未分类"||name==="__custom__")return toast("该科目名称不可用");
 if(!state.subjects.includes(name)){snapshot();state.subjects.push(name);save();toast("科目已添加")}
 else toast("该科目已存在，已选择");
 $("#subjectInput").value=name;previousSubjectSelection=name;$("#addEventSubjectDialog").close();
}
function renderManagedSubjects(){
 $("#managedSubjectList").innerHTML=[...state.subjects].sort().map(s=>{
  const count=state.events.filter(e=>e.subject===s).length;
  return `<div class="managed-subject-row"><div><strong>${escapeHtml(s)}</strong><small>${count} 个时间块</small></div><button type="button" class="danger ghost" data-delete-subject="${escapeHtml(s)}">删除</button></div>`;
 }).join("")||'<p class="muted">暂无科目，可以在上方添加。</p>';
 $$('[data-delete-subject]').forEach(b=>b.onclick=()=>requestSubjectDelete(b.dataset.deleteSubject));
}
function addManagedSubject(ev){
 ev.preventDefault();const input=$("#newSubjectInput"),name=input.value.trim();
 if(!name)return toast("请输入科目名称");
 if(name==="未分类"||name==="__custom__"||state.subjects.includes(name))return toast("该科目已存在或名称不可用");
 snapshot();state.subjects.push(name);input.value="";save();toast("科目已添加");
}
function requestSubjectDelete(name){
 if(!state.subjects.includes(name))return;
 pendingSubjectDelete=name;
 const related=state.events.filter(e=>e.subject===name),completed=related.filter(e=>e.completed&&e.type==="study").length,classes=related.filter(e=>e.type==="class").length;
 $("#deleteSubjectMessage").textContent=related.length?`确认删除“${name}”？关联 ${related.length} 个时间块（含 ${completed} 个已完成学习记录、${classes} 个固定课程）。是否级联删除？仅删除科目会保留所有时间块并改为“未分类”；级联删除会删除所有关联时间块，包括历史记录和拖欠任务。`:`确认删除“${name}”？该科目没有关联时间块。`;
 $("#keepSubjectEventsBtn").textContent=related.length?"仅删除科目，保留时间块":"确认删除";
 $("#cascadeSubjectEventsBtn").hidden=!related.length;
 $("#deleteSubjectDialog").showModal();
}
function cancelSubjectDelete(){pendingSubjectDelete=null;$("#deleteSubjectDialog").close()}
function deleteManagedSubject(cascade){
 const name=pendingSubjectDelete;if(!name||!state.subjects.includes(name))return cancelSubjectDelete();
 snapshot();state.subjects=state.subjects.filter(s=>s!==name);
 if(cascade)state.events=state.events.filter(e=>e.subject!==name);
 else state.events.forEach(e=>{if(e.subject===name)e.subject="未分类"});
 state.goals.forEach(g=>{if(g.subject===name)g.subject="未分类"});
 cancelSubjectDelete();save();toast(cascade?"科目及关联时间块已删除":"科目已删除，时间块已保留");
}
function renderWeek(){
 const today=dateISO(new Date());
 const displayStart=visibleStart(),end=addDays(displayStart,viewDays-1),a=parseDate(displayStart),b=parseDate(end);
 $("#weekLabel").textContent=a.getMonth()===b.getMonth()?`${a.getFullYear()}年${a.getMonth()+1}月 ${a.getDate()}–${b.getDate()}日`:`${a.getMonth()+1}月${a.getDate()}日–${b.getMonth()+1}月${b.getDate()}日`;
 $("#daysShown").value=String(viewDays);
 $("#todayFirst").checked=todayFirst;
 $("#calendarHead").style.setProperty("--visible-days",viewDays);
 $("#daysGrid").style.setProperty("--visible-days",viewDays);
 $("#summaryStrip").style.setProperty("--visible-days",viewDays);
 $("#calendarHead").style.minWidth=(70+viewDays*125)+"px";
 $("#calendarBody").style.minWidth=(70+viewDays*125)+"px";
 $("#calendarHead").innerHTML='<div class="head-spacer"></div>'+Array.from({length:viewDays},(_,i)=>{
  const d=addDays(displayStart,i),x=parseDate(d);
  return `<div class="day-head ${d===today?"today":""}"><strong>周${DOW[x.getDay()]}</strong><span class="date-num">${x.getDate()}</span><small>${eventsOn(d).filter(countsStudy).length} 项学习</small></div>`
 }).join("");
 $("#timeAxis").innerHTML=Array.from({length:18},(_,i)=>`<span class="time-label" style="top:${i*HOUR}px">${pad(i+6)}:00</span>`).join("");
 const filters=Object.fromEntries($$(".legend-panel input[data-filter]").map(x=>[x.dataset.filter,x.checked]));
 const q=$("#searchInput").value.trim().toLowerCase(),sub=$("#subjectFilter").value;
 $("#daysGrid").innerHTML="";
 for(let i=0;i<viewDays;i++){
  const date=addDays(displayStart,i),col=document.createElement("div");
  col.className="day-column"+(date===today?" today":"");col.dataset.date=date;
  for(let h=0;h<17;h++){const line=document.createElement("div");line.className="half-line";line.style.top=(h*HOUR+HOUR/2)+"px";col.append(line)}
  let ev=eventsOn(date).filter(e=>!e.backlog&&(filters[e.type]!==false)&&(e.type!=="study"||filters.completed||!e.completed));
  if(q)ev=ev.filter(e=>(e.title+" "+e.description+" "+e.notes).toLowerCase().includes(q));
  if(sub)ev=ev.filter(e=>e.subject===sub);
  placeEvents(col,ev);
  col.addEventListener("dblclick",onGridDoubleClick);
  $("#daysGrid").append(col);
 }
 renderNowLine();
 renderSummary();
 renderBacklog();
}
function visibleStart(){return todayFirst?rangeStart:(viewDays===7?weekStart:rangeStart)}
function placeEvents(col,items){
 const normal=items.sort((a,b)=>minutes(a.start)-minutes(b.start)||duration(b)-duration(a));
 let active=[],assign=[],max=1;
 normal.forEach(e=>{
  active=active.filter(x=>snappedMinutes(x.e.end)>snappedMinutes(e.start));
  const used=new Set(active.map(x=>x.lane));let lane=0;while(used.has(lane))lane++;
  active.push({e,lane});assign.push({e,lane});max=Math.max(max,active.length);
 });
 assign.forEach(x=>col.append(eventCard(x.e,x.lane,max)));
}
function eventCard(e,lane,lanes){
 const top=(Math.max(START,snappedMinutes(e.start))-START)/60*HOUR;
 const bottom=(Math.min(END,snappedMinutes(e.end))-START)/60*HOUR;
 const card=document.createElement("article");
 const dur=duration(e),sizeClass=dur<=15?"micro":dur<=30?"compact":"";
 card.className=`event ${e.type} ${sizeClass} ${e.type==="study"&&e.completed?"completed":""}`;
 card.dataset.id=e.id;
 card.style.top=top+"px";card.style.height=Math.max(12,bottom-top)+"px";
 card.style.left=`calc(${lane/lanes*100}% + 3px)`;card.style.width=`calc(${100/lanes}% - 6px)`;
 card.title=e.description||e.title;
 card.innerHTML=`<div class="event-title">${escapeHtml(e.title)}</div><div class="event-time">${displayRange(e)}</div>${e.subject?`<div class="event-subject">${escapeHtml(e.subject)}</div>`:""}<span class="resize-handle" aria-hidden="true"></span>`;
 card.addEventListener("pointerdown",onCardPointerDown);
 card.addEventListener("pointerenter",()=>showEventPreview(card,e));
 card.addEventListener("pointerleave",hideEventPreview);
 return card;
}
function renderBacklog(){
 const key=e=>Number(e.backlogAt)||state.events.indexOf(e),compare=(a,b)=>backlogSort==="schedule"?(a.date+a.start+a.end).localeCompare(b.date+b.start+b.end)||(key(a)-key(b)):(key(a)-key(b))*(backlogSort==="newest"?-1:1);
 const showStudy=$(".legend-panel input[data-filter='study']")?.checked!==false,items=state.events.filter(e=>e.backlog&&e.type==="study"&&!e.completed).sort(compare);
 $("#backlogSort").value=backlogSort;
 $("#backlogCount").textContent=items.length;
 $("#backlogList").innerHTML="";
 if(!showStudy){$("#backlogList").innerHTML='<div class="backlog-empty">“学习计划”已隐藏</div>';return}
 if(!items.length){$("#backlogList").innerHTML='<div class="backlog-empty">暂无拖欠任务</div>';return}
 items.forEach(e=>{
  const dur=duration(e),sizeClass=dur<=15?"micro":dur<=30?"compact":"";
  const card=document.createElement("article");card.className=`event study backlog-card ${sizeClass}`;card.dataset.id=e.id;card.title=`${e.date} · ${displayRange(e)}\n${e.description||e.title}`;
  card.style.height=Math.max(12,(snappedMinutes(e.end)-snappedMinutes(e.start))/60*HOUR)+"px";
  card.innerHTML=`<div class="event-title">${escapeHtml(e.title)}</div><div class="event-time">${e.date} · ${displayRange(e)}</div>${e.subject?`<div class="event-subject">${escapeHtml(e.subject)}</div>`:""}`;
  card.addEventListener("pointerdown",onCardPointerDown);card.addEventListener("pointerenter",()=>showEventPreview(card,e));card.addEventListener("pointerleave",hideEventPreview);$("#backlogList").append(card);
 });
}
function showEventPreview(card,e){
 const preview=$("#eventPreview"),r=card.getBoundingClientRect();
 preview.innerHTML=`<strong>${escapeHtml(e.title)}</strong><span>${e.date}　${displayRange(e)}${e.subject?`　${escapeHtml(e.subject)}`:""}</span>${e.description?`<p>${escapeHtml(e.description)}</p>`:""}`;
 preview.classList.add("show");
 const w=preview.offsetWidth,h=preview.offsetHeight,spaceRight=innerWidth-r.right;
 preview.style.left=Math.max(8,spaceRight>=w+12?r.right+8:r.left-w-8)+"px";
 preview.style.top=Math.max(8,Math.min(innerHeight-h-8,r.top))+"px";
}
function hideEventPreview(){$("#eventPreview").classList.remove("show")}
function renderNowLine(){
 const displayStart=visibleStart(),today=dateISO(new Date()),idx=Math.round((parseDate(today)-parseDate(displayStart))/86400000),n=new Date().getHours()*60+new Date().getMinutes();
 if(idx<0||idx>=viewDays||n<START||n>END)return;
 const cols=$$(".day-column");if(!cols[idx])return;
 const line=document.createElement("div");line.className="now-line";line.style.top=((n-START)/60*HOUR)+"px";cols[idx].append(line);
}
function renderSummary(){
 const displayStart=visibleStart();
 let weekTotal=0,weekDone=0;
 for(let i=0;i<7;i++){
  const date=addDays(weekStart,i);
  weekTotal+=eventsOn(date).filter(countsStudy).reduce((s,e)=>s+duration(e),0);
  weekDone+=eventsOn(date).filter(e=>countsStudy(e)&&e.completed).reduce((s,e)=>s+actualDuration(e),0);
 }
 $("#summaryStrip").innerHTML=Array.from({length:viewDays},(_,i)=>{
  const date=addDays(displayStart,i),planned=eventsOn(date).filter(countsStudy).reduce((s,e)=>s+duration(e),0);
  const done=eventsOn(date).filter(e=>countsStudy(e)&&e.completed).reduce((s,e)=>s+actualDuration(e),0);
  const cap=targetFor(date),pct=Math.min(100,planned/cap*100);
  return `<button class="summary-day" data-date="${date}" title="点击设置这一天的学习上限"><strong>${Math.floor(planned/60)}小时${planned%60?planned%60+"分":""}</strong><small>上限 ${formatMinutes(cap)} · 已学 ${formatMinutes(done)}</small><div class="meter ${planned>cap?"over":""}"><span style="width:${pct}%"></span></div></button>`
 }).join("");
 $("#weekHours").innerHTML=`<strong>${(weekTotal/60).toFixed(1)} 小时</strong>已完成 ${(weekDone/60).toFixed(1)} 小时<br>周五至周日 ${(weekendMinutes()/60).toFixed(1)} 小时`;
 $$(".summary-day").forEach(b=>b.onclick=()=>setDateTarget(b.dataset.date));
}
function weekendMinutes(){return [4,5,6].reduce((s,i)=>s+eventsOn(addDays(weekStart,i)).filter(countsStudy).reduce((a,e)=>a+duration(e),0),0)}
function setDateTarget(date){
 const old=targetFor(date),v=prompt(`${date} 的学习上限（分钟）`,old);if(v===null)return;
 const n=Number(v);if(!Number.isFinite(n)||n<0)return toast("请输入有效分钟数");
 snapshot();state.settings.dateTargets[date]=n;save();toast("当天上限已更新");
}

function onGridDoubleClick(ev){
 if(ev.target.closest(".event"))return;
 const rect=ev.currentTarget.getBoundingClientRect(),n=Math.round((START+(ev.clientY-rect.top)/HOUR*60)/SNAP)*SNAP;
 openEvent(null,{date:ev.currentTarget.dataset.date,start:clock(Math.max(START,n)),end:clock(Math.min(END,n+60))});
}
function onCardPointerDown(ev){
 if(ev.button!==0)return;
 const card=ev.currentTarget,e=state.events.find(x=>x.id===card.dataset.id);if(!e)return;
 ev.preventDefault();hideEventPreview();try{card.setPointerCapture(ev.pointerId)}catch{}
 const resizing=ev.target.classList.contains("resize-handle")&&!e.backlog,rect=card.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(ev.clientY-rect.top)/Math.max(1,rect.height)));
 drag={card,e,pointerId:ev.pointerId,originX:ev.clientX,originY:ev.clientY,moved:false,resizing,duration:duration(e),grabX:ev.clientX-rect.left,grabY:ev.clientY-rect.top,grabRatio:ratio,sourceRect:rect,snapKind:e.backlog?"backlog":"day",snappedDate:e.backlog?null:e.date,preview:null,ghost:null,invalidBacklog:false,old:{date:e.date,start:e.start,end:e.end,backlog:!!e.backlog}};
 card.classList.add("dragging","drag-source");
 card.addEventListener("pointermove",onCardPointerMove);card.addEventListener("pointerup",onCardPointerUp,{once:true});card.addEventListener("pointercancel",onCardPointerUp,{once:true});
}
function onCardPointerMove(ev){
 if(!drag)return;
 if(!drag.moved&&Math.hypot(ev.clientX-drag.originX,ev.clientY-drag.originY)<=4)return;
 drag.moved=true;
 if(drag.resizing){
  const col=drag.card.closest(".day-column"),rect=col?.getBoundingClientRect();if(!rect)return;
  const n=Math.round((START+(ev.clientY-rect.top)/HOUR*60)/SNAP)*SNAP,end=Math.max(minutes(drag.e.start)+SNAP,Math.min(END,n));
  drag.card.style.height=Math.max(12,(snappedMinutes(clock(end))-snappedMinutes(drag.e.start))/60*HOUR)+"px";drag.preview={end:clock(end)};return;
 }
 ensureDragGhost(drag);autoScrollCalendar(ev.clientX,ev.clientY);drag.invalidBacklog=false;
 const backlog=$("#backlogDropZone"),backlogRect=backlog.getBoundingClientRect(),insideBacklog=pointInRect(ev.clientX,ev.clientY,backlogRect);
 backlog.classList.remove("drop-active","drop-invalid");
 if(insideBacklog){
  if(drag.e.type==="study"&&!drag.e.completed){drag.snapKind="backlog";drag.snappedDate=null;drag.preview={backlog:true};backlog.classList.add("drop-active");positionBacklogGhost(drag,backlogRect,ev.clientY);return}
  drag.invalidBacklog=true;backlog.classList.add("drop-invalid");drag.snapKind="free";drag.snappedDate=null;drag.preview=null;positionFreeGhost(drag,ev.clientX,ev.clientY);return;
 }
 const col=findDayTarget(ev.clientX,ev.clientY,drag);
 if(col){
  const rect=col.getBoundingClientRect(),raw=START+(ev.clientY-rect.top)/HOUR*60-drag.duration*drag.grabRatio,start=Math.round(Math.max(START,Math.min(END-drag.duration,raw))/SNAP)*SNAP,date=col.dataset.date;
  drag.snapKind="day";drag.snappedDate=date;drag.preview={date,start:clock(start),end:clock(start+drag.duration),backlog:false};positionDayGhost(drag,rect,start);return;
 }
 drag.snapKind="free";drag.snappedDate=null;drag.preview=null;positionFreeGhost(drag,ev.clientX,ev.clientY);
}
function ensureDragGhost(d){
 if(d.ghost)return;
 const ghost=document.createElement("article"),durClass=d.duration<=15?"micro":d.duration<=30?"compact":"";
 ghost.className=`event ${d.e.type} ${durClass} drag-ghost`;ghost.innerHTML=`<div class="event-title">${escapeHtml(d.e.title)}</div><div class="event-time">${displayRange(d.e)}</div>${d.e.subject?`<div class="event-subject">${escapeHtml(d.e.subject)}</div>`:""}`;document.body.append(ghost);d.ghost=ghost;
}
function pointInRect(x,y,r){return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom}
function findDayTarget(x,y,d){
 const wrap=$("#calendarWrap").getBoundingClientRect(),head=$("#calendarHead").getBoundingClientRect(),top=Math.max(wrap.top,head.bottom),bottom=wrap.bottom;if(y<top||y>bottom)return null;
 const cols=$$(".day-column"),current=d.snapKind==="day"&&d.snappedDate?cols.find(c=>c.dataset.date===d.snappedDate):null;
 if(current){const r=current.getBoundingClientRect();if(x>=r.left&&x<=r.right)return current}
 return cols.find(c=>{const r=c.getBoundingClientRect(),inset=Math.min(16,r.width*.12);return x>=r.left+inset&&x<=r.right-inset})||null;
}
function positionDayGhost(d,rect,start){
 const visualStart=snappedMinutes(clock(start)),visualEnd=snappedMinutes(clock(start+d.duration));
 Object.assign(d.ghost.style,{left:(rect.left+3)+"px",top:(rect.top+(visualStart-START)/60*HOUR)+"px",width:Math.max(30,rect.width-6)+"px",height:Math.max(12,(visualEnd-visualStart)/60*HOUR)+"px"});
 d.ghost.classList.add("snapped");
}
function positionBacklogGhost(d,rect,y){
 const height=Math.max(12,(snappedMinutes(d.e.end)-snappedMinutes(d.e.start))/60*HOUR),top=Math.max(rect.top+8,Math.min(rect.bottom-height-8,y-height/2));Object.assign(d.ghost.style,{left:(rect.left+8)+"px",top:top+"px",width:Math.max(80,rect.width-16)+"px",height:height+"px"});d.ghost.classList.add("snapped");
}
function positionFreeGhost(d,x,y){
 Object.assign(d.ghost.style,{left:(x-d.grabX)+"px",top:(y-d.grabY)+"px",width:Math.max(110,d.sourceRect.width)+"px",height:Math.max(24,d.sourceRect.height)+"px"});d.ghost.classList.remove("snapped");
}
function autoScrollCalendar(x,y){
 const wrap=$("#calendarWrap"),r=wrap.getBoundingClientRect();if(x<r.left||x>r.right)return;const edge=44;if(y>r.bottom-edge)wrap.scrollTop+=18;else if(y<r.top+edge)wrap.scrollTop-=18;
}
function cleanupDrag(d){
 d.card.classList.remove("dragging","drag-source");d.card.removeEventListener("pointermove",onCardPointerMove);d.card.removeEventListener("pointerup",onCardPointerUp);d.card.removeEventListener("pointercancel",onCardPointerUp);d.ghost?.remove();$("#backlogDropZone").classList.remove("drop-active","drop-invalid");
}
function onCardPointerUp(ev){
 const d=drag;if(!d)return;cleanupDrag(d);drag=null;
 if(!d.moved)return openEvent(d.e);
 if(ev?.type==="pointercancel"||!d.preview){renderAll();toast(d.invalidBacklog?"只有未完成的学习计划可以放入拖欠区":"未放入合法区域，已恢复原位置");return}
 const wasBacklog=!!d.e.backlog;snapshot();Object.assign(d.e,d.preview);if(d.e.backlog&&!wasBacklog)d.e.backlogAt=Date.now();save();warnCap(d.e.date);
 toast(d.e.backlog?"已移入拖欠区":wasBacklog?"已从拖欠区安排到日历":"已调整这一次时间块");
}
function warnCap(date){
 if(!state.settings.warn)return;const total=eventsOn(date).filter(countsStudy).reduce((s,e)=>s+duration(e),0),cap=targetFor(date);
 if(total>cap)toast(`提醒：${date} 超出上限 ${total-cap} 分钟`);
}

function openEvent(e,defaults={}){
 $("#eventForm").reset();$("#eventId").value=e?.id||"";
 $("#eventDialogTitle").textContent=e?"编辑时间块":"新建时间块";$("#eventMode").textContent=e?.seriesId?"重复计划中的一次":"时间块";
 $("#titleInput").value=e?.title||"";$("#typeInput").value=e?.type||"study";$("#subjectInput").value=e?.subject||"";
 previousSubjectSelection=$("#subjectInput").value;
 $("#dateInput").value=e?.date||defaults.date||dateISO(new Date());$("#startInput").value=e?.start||defaults.start||"09:00";$("#endInput").value=e?.end||defaults.end||"10:00";
 $("#descriptionInput").value=e?.description||"";$("#importanceInput").value=e?.importance||"normal";$("#repeatInput").value="none";$("#untilInput").value=addDays($("#dateInput").value,28);
 $("#completedInput").checked=!!e?.completed;$("#notesInput").value=e?.notes||"";
 $("#deleteBtn").style.visibility=e?"visible":"hidden";$("#duplicateBtn").style.visibility=e?"visible":"hidden";$("#reviewBtn").style.visibility=e&&e.type==="study"?"visible":"hidden";
 $("#scopeWrap").hidden=!e?.seriesId;$("#scopeInput").value="one";toggleUntil();toggleRecordBox();$("#eventDialog").showModal();
}
function toggleRecordBox(){$("#recordBox").hidden=$("#typeInput").value!=="study"}
function formEvent(){
 const start=$("#startInput").value,end=$("#endInput").value;if(minutes(end)<=minutes(start))throw Error("结束时间必须晚于开始时间");
 const type=$("#typeInput").value,isStudy=type==="study";
 const subject=$("#subjectInput").value.trim();
 const inferred=inferSubject($("#titleInput").value);
 return {title:$("#titleInput").value.trim(),type,subject:subject||(state.subjects.includes(inferred)?inferred:"未分类"),date:$("#dateInput").value,start,end,description:$("#descriptionInput").value.trim(),importance:$("#importanceInput").value,completed:isStudy&&$("#completedInput").checked,notes:isStudy?$("#notesInput").value.trim():""};
}
function submitEvent(ev){
 ev.preventDefault();let data;try{data=formEvent()}catch(err){return toast(err.message)}
 snapshot();const id=$("#eventId").value,scope=$("#scopeInput").value;
 if(data.subject!=="未分类"&&!state.subjects.includes(data.subject))state.subjects.push(data.subject);
 if(id){
  const old=state.events.find(e=>e.id===id);
  if(scope==="one"||!old.seriesId){Object.assign(old,data);if(old.completed||old.type!=="study")old.backlog=false}
  else{
   const group=state.events.filter(e=>e.seriesId===old.seriesId&&(scope==="series"||e.date>=old.date));
   const dayShift=Math.round((parseDate(data.date)-parseDate(old.date))/86400000),startShift=minutes(data.start)-minutes(old.start);
   group.forEach(e=>{e.title=data.title;e.type=data.type;e.subject=data.subject;e.description=data.description;e.importance=data.importance;e.start=clock(minutes(e.start)+startShift);e.end=clock(minutes(e.end)+startShift);if(scope==="future")e.date=addDays(e.date,dayShift)});
  }
 }else{
  const base={id:uid(),seriesId:null,...data};state.events.push(base);
  expandRepeat(base,$("#repeatInput").value,$("#untilInput").value);
 }
 $("#eventDialog").close();save();warnCap(data.date);toast("计划已保存");
}
function expandRepeat(base,mode,until){
 if(mode==="none")return;const sid=uid();base.seriesId=sid;
 for(let d=addDays(base.date,1);d<=until;d=addDays(d,1)){
  const dow=parseDate(d).getDay(),ok=mode==="weekdays"?(dow>=1&&dow<=5):(dow===parseDate(base.date).getDay());
  if(ok)state.events.push({...base,id:uid(),date:d});
 }
}
function deleteEvent(){
 const id=$("#eventId").value,e=state.events.find(x=>x.id===id);if(!e||!confirm("删除这个时间块？"))return;
 snapshot();const scope=$("#scopeInput").value;
 state.events=state.events.filter(x=>x.id!==id&&!(e.seriesId&&scope==="series"&&x.seriesId===e.seriesId)&&!(e.seriesId&&scope==="future"&&x.seriesId===e.seriesId&&x.date>=e.date));
 $("#eventDialog").close();save();toast("已删除");
}
function duplicateEvent(){
 let data;try{data=formEvent()}catch(err){return toast(err.message)}
 snapshot();state.events.push({id:uid(),seriesId:null,...data,title:data.title+"（副本）"});$("#eventDialog").close();save();toast("已复制");
}
function generateReviews(){
 const id=$("#eventId").value,e=state.events.find(x=>x.id===id);if(!e)return;
 const intervals=e.importance==="high"?[1,3,7,21]:e.importance==="low"?[7]:[2,7];
 if(!confirm(`为“${e.title}”生成 ${intervals.map(x=>x+"天后").join("、")} 的复习块？`))return;
 snapshot();intervals.forEach((days,i)=>{
  const date=addDays(e.date,days),dur=e.importance==="high"?20:15,start=findSlot(date,dur);
  state.events.push({id:uid(),seriesId:null,title:e.title.replace(/·[^·（）]+(?=（|$)/,"")+"·间隔复习"+(i+1)+(e.subject?`（${e.subject}）`:""),type:"study",subject:e.subject,date,start,end:clock(minutes(start)+dur),description:`来源：${e.date} ${e.title}\n先闭书完成一个最小例子或关键步骤，再核对。记录独立、提示后或未完成；连续两次独立通过后减少固定复习。`,importance:e.importance,completed:false,notes:""});
 });$("#eventDialog").close();save();toast("已生成间隔复习");
}
function findSlot(date,dur){
 const busy=eventsOn(date).filter(e=>!e.backlog).sort((a,b)=>minutes(a.start)-minutes(b.start));let n=START+20;
 for(const e of busy){if(n+dur<=minutes(e.start))return clock(n);if(n<minutes(e.end))n=minutes(e.end)+5}
 return clock(Math.min(n,END-dur));
}

function renderGoals(){
 $("#goalWeekLabel").textContent=`${weekStart} 至 ${addDays(weekStart,6)}`;
 $("#goalWeekPicker").value=weekStart;
 const weekAllEvents=state.events.filter(e=>e.date>=weekStart&&e.date<=addDays(weekStart,6)),weekEvents=weekAllEvents.filter(countsStudy),weekSubjects=[...new Set(weekAllEvents.map(e=>e.subject).filter(Boolean))];
 const goals=state.goals.filter(g=>g.week===weekStart);
 const currentWeek=monday(dateISO(new Date())),autoGoals=weekStart>=currentWeek?buildAutomaticGoals(weekEvents,weekSubjects):"";
 const manualGoals=goals.map(g=>`<div class="goal-card ${g.done?"done":""}"><input type="checkbox" data-goal="${g.id}" ${g.done?"checked":""}><div><h3>${escapeHtml(g.title)}</h3><small>${escapeHtml(g.subject||"未分类")} · ${g.minutes||0} 分钟</small></div><button data-delgoal="${g.id}" class="ghost">×</button></div>`).join("");
 $("#goalList").innerHTML=autoGoals+manualGoals||`<div class="empty">${weekStart<currentWeek?"该周没有保存目标清单；历史周不再补写。":"该周暂无学习时间块，添加计划后会自动生成目标。"}</div>`;
 $$("[data-goal]").forEach(x=>x.onchange=()=>{snapshot();state.goals.find(g=>g.id===x.dataset.goal).done=x.checked;save()});
 $$("[data-delgoal]").forEach(x=>x.onclick=()=>{snapshot();state.goals=state.goals.filter(g=>g.id!==x.dataset.delgoal);save()});
 const by={};weekSubjects.forEach(s=>by[s]={p:0,d:0});weekEvents.forEach(e=>{const s=e.subject||"其他";by[s]||={p:0,d:0};by[s].p+=duration(e);if(e.completed)by[s].d+=actualDuration(e)});
 const stats=Object.entries(by).sort((a,b)=>b[1].p-a[1].p),maxPlanned=Math.max(1,...stats.map(([,v])=>v.p));
 $("#subjectStats").innerHTML=stats.map(([s,v])=>`<div class="stat-row"><div class="stat-head"><span>${escapeHtml(s)}</span><span>${v.d}/${v.p} 分钟</span></div><div class="meter stat-meter" style="width:${v.p/maxPlanned*100}%"><span style="width:${v.p?Math.min(100,v.d/v.p*100):0}%"></span></div></div>`).join("")||'<div class="empty">本周无学习计划</div>';
 $("#weekReflection").value=state.reflections[weekStart]||"";
}
function buildAutomaticGoals(events,subjects=[]){
 if(!events.length&&!subjects.length)return"";
 const groups={};subjects.forEach(subject=>groups[subject]={events:[],minutes:0,done:0});
 events.forEach(e=>{const subject=e.subject||"其他",g=groups[subject]||={events:[],minutes:0,done:0};g.events.push(e);g.minutes+=duration(e);if(e.completed)g.done++});
 const total=events.reduce((n,e)=>n+duration(e),0),done=events.filter(e=>e.completed).length;
 const overall=`<div class="goal-overview"><strong>完成 ${events.length} 个学习时间块，共 ${formatMinutes(total)}</strong><span>覆盖 ${Object.keys(groups).length} 个科目；当前已完成 ${done}/${events.length} 项。</span></div>`;
 const cards=Object.entries(groups).sort((a,b)=>b[1].minutes-a[1].minutes).map(([subject,g])=>{
  const topics=[...new Set(g.events.map(e=>goalTopic(e.title)))],shown=topics.slice(0,4),more=topics.length-shown.length,zero=g.events.length===0,progress=zero?"0分":g.done===g.events.length?"✓":`${g.done}/${g.events.length}`;
  return `<div class="auto-goal ${!zero&&g.done===g.events.length?"done":""}"><span class="auto-goal-mark">${progress}</span><div><h3>${escapeHtml(subject)}：${zero?"本周课程跟进":"完成本周计划进度"}</h3><p>${zero?"本周暂无单独自学时间块；完成课程学习，需要复习时再添加计划。":shown.map(escapeHtml).join("；")+(more>0?`；另有 ${more} 项`:"")}</p><small>${g.events.length} 个自学时间块 · ${formatMinutes(g.minutes)}</small></div></div>`;
 }).join("");
 return overall+cards;
}
function goalTopic(title){return clean(title).replace(/（[^）]*）/g,"").replace(/^自习\s*[｜|]\s*/,"").trim()}
function formatMinutes(n){return `${Math.floor(n/60)}小时${n%60?`${n%60}分`:""}`}
function addGoal(ev){ev.preventDefault();snapshot();state.goals.push({id:uid(),week:weekStart,title:$("#goalTitle").value.trim(),subject:$("#goalSubject").value.trim(),minutes:Number($("#goalMinutes").value)||0,done:false});$("#goalDialog").close();save()}
function renderList(){
 const q=$("#listSearch").value.trim().toLowerCase(),status=$("#listStatus").value;
 const rows=state.events.filter(e=>(!q||(e.title+" "+e.description+" "+e.subject).toLowerCase().includes(q))&&(!status||(e.type==="study"&&(status==="completed")===!!e.completed))).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
 $("#eventTable").innerHTML=rows.map(e=>`<tr data-row="${e.id}"><td>${e.date}</td><td>${displayRange(e)}</td><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.subject||"")}</td><td>${typeName[e.type]}</td><td>${e.backlog?'<span class="status overdue">拖欠中</span>':e.type==="class"?'<span class="status neutral">无需确认</span>':`<span class="status ${e.completed?"done":""}">${e.completed?"已完成":"未完成"}</span>`}</td></tr>`).join("");
 $$("[data-row]").forEach(r=>r.ondblclick=()=>openEvent(state.events.find(e=>e.id===r.dataset.row)));
}

function renderVisualization(){
 const start=chartMode==="week"?monday(chartAnchor):monthStart(chartAnchor);
 const startDate=parseDate(start),days=chartMode==="week"?7:new Date(startDate.getFullYear(),startDate.getMonth()+1,0).getDate(),end=addDays(start,days-1);
 const values=Array.from({length:days},(_,i)=>{const date=addDays(start,i),learned=eventsOn(date).filter(e=>countsStudy(e)&&e.completed).reduce((n,e)=>n+actualDuration(e),0);return{date,learned}});
 const total=values.reduce((n,x)=>n+x.learned,0),learningDays=values.filter(x=>x.learned>0).length,maxValue=Math.max(60,...values.map(x=>x.learned)),scale=Math.ceil(maxValue/60)*60;
 const a=parseDate(start),b=parseDate(end);$("#visualRangeLabel").textContent=chartMode==="week"?`${start} 至 ${end}`:`${a.getFullYear()}年${a.getMonth()+1}月`;
 $$('[data-chart-mode]').forEach(x=>x.classList.toggle("active",x.dataset.chartMode===chartMode));
 $("#visualSummary").innerHTML=`<div><span>总学习时长</span><strong>${formatMinutes(total)}</strong></div><div><span>有学习记录</span><strong>${learningDays} 天</strong></div><div><span>日均学习</span><strong>${formatMinutes(days?Math.round(total/days):0)}</strong></div>`;
 const yLabels=`<div class="chart-y"><span>${formatMinutes(scale)}</span><span>${formatMinutes(Math.round(scale/2))}</span><span>0</span></div>`;
 const bars=values.map((x,i)=>{const d=parseDate(x.date),pct=x.learned/scale*100,label=chartMode==="week"?`周${DOW[d.getDay()]}<small>${d.getMonth()+1}/${d.getDate()}</small>`:`${d.getDate()}`;return `<div class="chart-column" title="${x.date}：已学 ${formatMinutes(x.learned)}"><span class="bar-value">${x.learned?formatMinutes(x.learned):""}</span><div class="bar-track"><span style="height:${pct}%"></span></div><div class="bar-label">${label}</div></div>`}).join("");
 $("#studyChart").className=`study-chart ${chartMode}`;$("#studyChart").innerHTML=yLabels+`<div class="chart-bars" style="--chart-days:${days}">${bars}</div>`;
}

function renderSettings(){
 const names=["周日","周一","周二","周三","周四","周五","周六"];
 $("#targetGrid").innerHTML=names.map((n,i)=>`<label>${n}<input type="number" min="0" step="5" data-target="${i}" value="${state.settings.targets[i]}"></label>`).join("");
 $("#capWarning").checked=state.settings.warn;
}
function saveSettings(ev){ev.preventDefault();snapshot();$$("[data-target]").forEach(x=>state.settings.targets[Number(x.dataset.target)]=Number(x.value)||0);state.settings.warn=$("#capWarning").checked;$("#settingsDialog").close();save();toast("设置已保存")}
function download(name,text,type="application/json"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportJSON(){download(`学习计划备份-${dateISO(new Date())}.json`,JSON.stringify(state,null,2))}
function exportCSV(){
 const fields=["date","start","end","title","subject","type","completed","backlog","description","notes"];
 const rows=[fields.join(","),...state.events.map(e=>fields.map(k=>'"'+String(e[k]??"").replaceAll('"','""')+'"').join(","))];
 download("学习计划.csv","\ufeff"+rows.join("\n"),"text/csv");
}
function exportICS(){
 const stamp=s=>s.replaceAll("-","").replace(":","")+"00";
 const body=state.events.map(e=>`BEGIN:VEVENT\r\nUID:${e.id}@studyplanner.local\r\nDTSTART:${stamp(e.date+"T"+e.start)}\r\nDTEND:${stamp(e.date+"T"+e.end)}\r\nSUMMARY:${e.title.replace(/[;,]/g," ")}\r\nDESCRIPTION:${(e.description||"").replace(/\n/g,"\\n").replace(/[;,]/g," ")}\r\nEND:VEVENT`).join("\r\n");
 download("学习计划.ics",`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//StudyPlanner//CN\r\n${body}\r\nEND:VCALENDAR`,"text/calendar");
}
function importJSON(file){
 const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);if(!data.events||!Array.isArray(data.events))throw Error();if(!confirm("导入会替换当前全部本地数据，继续吗？"))return;snapshot();data.events=data.events.filter(e=>e.type!=="flex").map(normalizeSubject);data.version=2;state=data;save();toast("备份已导入")}catch{toast("文件不是有效的学习计划备份")}};r.readAsText(file);
}
function reset(){if(!confirm("确认清空当前浏览器中的全部计划？此操作无法直接恢复，请先导出备份。"))return;snapshot();state=defaultState();$("#settingsDialog").close();save();toast("已清空全部计划")}

function bind(){
 $$('dialog button[value="cancel"]').forEach(b=>b.onclick=()=>b.closest("dialog").close());
 $("#addEventSubjectForm").onsubmit=addEventSubject;
 $$(".tab").forEach(b=>b.onclick=()=>{view=b.dataset.view;renderAll()});
 $("#prevWeek").onclick=()=>{if(todayFirst){rangeStart=addDays(rangeStart,-viewDays);weekStart=monday(rangeStart)}else if(viewDays===7)weekStart=addDays(weekStart,-7);else{rangeStart=addDays(rangeStart,-3);weekStart=monday(rangeStart)}renderAll()};
 $("#nextWeek").onclick=()=>{if(todayFirst){rangeStart=addDays(rangeStart,viewDays);weekStart=monday(rangeStart)}else if(viewDays===7)weekStart=addDays(weekStart,7);else{rangeStart=addDays(rangeStart,3);weekStart=monday(rangeStart)}renderAll()};
 $("#daysShown").onchange=e=>{viewDays=Number(e.target.value)===3?3:7;localStorage.setItem(VIEW_STORE,String(viewDays));if(!todayFirst){if(viewDays===3)rangeStart=weekStart;else weekStart=monday(rangeStart)}renderAll()};
 $("#todayFirst").onchange=e=>{todayFirst=e.target.checked;localStorage.setItem(TODAY_FIRST_STORE,String(todayFirst));const today=dateISO(new Date());weekStart=monday(today);rangeStart=todayFirst?today:weekStart;renderAll()};
 $("#todayBtn").onclick=()=>{const today=dateISO(new Date());weekStart=monday(today);rangeStart=viewDays===3?today:weekStart;view="week";renderAll()};
 $("#createBtn").onclick=()=>openEvent(null,{date:dateISO(new Date())});$("#eventForm").onsubmit=submitEvent;
 $("#deleteBtn").onclick=deleteEvent;$("#duplicateBtn").onclick=duplicateEvent;$("#reviewBtn").onclick=generateReviews;
 $("#repeatInput").onchange=toggleUntil;
 $("#typeInput").onchange=toggleRecordBox;
 $("#subjectInput").onchange=chooseEventSubject;
 $("#searchInput").oninput=renderWeek;$("#subjectFilter").onchange=renderWeek;
 $$(".legend-panel input").forEach(x=>x.onchange=renderWeek);
 $("#sideSwitchBtn").onclick=()=>{sidebarRight=!sidebarRight;localStorage.setItem(SIDEBAR_STORE,String(sidebarRight));renderSidebarPosition()};
 $("#backlogSort").onchange=e=>{backlogSort=["oldest","newest","schedule"].includes(e.target.value)?e.target.value:"oldest";localStorage.setItem(BACKLOG_SORT_STORE,backlogSort);renderBacklog()};
 $("#undoBtn").onclick=undo;document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"&&!$("dialog[open]")){e.preventDefault();undo()}});
 $("#addGoalBtn").onclick=()=>{$("#goalForm").reset();$("#goalDialog").showModal()};$("#goalForm").onsubmit=addGoal;
 $("#goalPrevWeek").onclick=()=>{weekStart=addDays(weekStart,-7);rangeStart=weekStart;renderAll()};
 $("#goalNextWeek").onclick=()=>{weekStart=addDays(weekStart,7);rangeStart=weekStart;renderAll()};
 $("#goalThisWeek").onclick=()=>{weekStart=monday(dateISO(new Date()));rangeStart=weekStart;renderAll()};
 $("#goalWeekPicker").onchange=e=>{if(!e.target.value)return;weekStart=monday(e.target.value);rangeStart=weekStart;renderAll()};
 $("#weekReflection").onchange=()=>{snapshot();state.reflections[weekStart]=$("#weekReflection").value;save(false)};
 $("#listSearch").oninput=renderList;$("#listStatus").onchange=renderList;
 $$('[data-chart-mode]').forEach(x=>x.onclick=()=>{chartMode=x.dataset.chartMode;localStorage.setItem(CHART_MODE_STORE,chartMode);renderVisualization()});
 $("#visualPrev").onclick=()=>{chartAnchor=chartMode==="week"?addDays(chartAnchor,-7):addMonths(chartAnchor,-1);renderVisualization()};
 $("#visualNext").onclick=()=>{chartAnchor=chartMode==="week"?addDays(chartAnchor,7):addMonths(chartAnchor,1);renderVisualization()};
 $("#visualCurrent").onclick=()=>{chartAnchor=dateISO(new Date());renderVisualization()};
 $("#settingsBtn").onclick=()=>{renderSettings();$("#settingsDialog").showModal()};$("#settingsForm").onsubmit=saveSettings;
 $("#manageSubjectsBtn").onclick=()=>{renderManagedSubjects();$("#subjectsDialog").showModal()};
 $("#closeSubjectsBtn").onclick=()=>$("#subjectsDialog").close();$("#addSubjectForm").onsubmit=addManagedSubject;
 $("#cancelSubjectDelete").onclick=cancelSubjectDelete;$("#cancelSubjectDeleteClose").onclick=cancelSubjectDelete;
 $("#deleteSubjectDialog").addEventListener("cancel",()=>{pendingSubjectDelete=null});
 $("#keepSubjectEventsBtn").onclick=()=>deleteManagedSubject(false);$("#cascadeSubjectEventsBtn").onclick=()=>deleteManagedSubject(true);
 $("#exportJson").onclick=exportJSON;$("#exportCsv").onclick=exportCSV;$("#exportIcs").onclick=exportICS;$("#importBtn").onclick=()=>$("#importFile").click();$("#importFile").onchange=e=>e.target.files[0]&&importJSON(e.target.files[0]);$("#resetBtn").onclick=reset;
}
function toggleUntil(){$("#untilLabel").hidden=$("#repeatInput").value==="none"}
load();bind();renderAll();
})();
