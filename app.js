import {DAYS,minutes,koreaDate,weekday,conflict,expired,phase,PHASES,safeUrl,calendarText,parseICS,weekStart,addDays,weekGroups,sanitizeSlots,sanitizePersonal,parseNotice,noticeId,noticeExample,hhmm,snapMinutes,slotOverlaps,freeGaps,windowsInGaps,bundleOf,menuCandidates,uniqueMenus,bracketSize,chunsikKey,chunsikMenus,chunsikPool,parseGviz,tallyChampions,roundName,startCup,cupPair,cupChoose,defaultMeal,foodTags,placeOf,project} from './core.js?v=7';
import {SOURCES,SOURCE_GROUPS,KIND_LABEL,SOURCE_LABEL,CHECK_LABEL,CATEGORY,REGISTRATION,BUNDLES,CAFETERIAS,MENU_URL,MENU_CHECKED,TIP_FORM,CAFETERIA_PLACES,CUP_FORM} from './content.js?v=8';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SLOT_KEY='gonggang-slots',PERSONAL_KEY='gonggang-personal-events';
const VIEWS=['events','food','pick','timetable','import','guide'];
const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'[]');}catch{return [];}};
let slots=sanitizeSlots(read(SLOT_KEY)),personal=sanitizePersonal(read(PERSONAL_KEY));
let events=[],status={},loaded=false,view='events',listView='list',month=koreaDate().slice(0,7),picked='',toastTimer,draft=null;

function toast(message){
  $('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);
}
function persist(){
  try{localStorage.setItem(SLOT_KEY,JSON.stringify(slots));localStorage.setItem(PERSONAL_KEY,JSON.stringify(personal));return true;}
  catch{toast('브라우저 저장소에 접근하지 못했습니다.');return false;}
}
function download(name,text,mime='text/calendar;charset=utf-8'){
  const objectUrl=URL.createObjectURL(new Blob([text],{type:mime}));
  const a=document.createElement('a');a.href=objectUrl;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}
const data=()=>[...events,...personal];
const online=e=>!e.date&&/온라인/.test(e.location||'');
const dotDate=date=>date.slice(5).replace('-','. ');
const fmt=date=>date?`${Number(date.slice(5,7))}월 ${Number(date.slice(8))}일 (${DAYS[weekday(date)]})`:'일정 확인 필요';
const eventTime=e=>online(e)?'기간 내 온라인 참여':e.start?e.start+(e.end?'–'+e.end:'부터'):'시간 미공지';
const when=e=>e.date?`${fmt(e.date)}${e.endDate&&e.endDate!==e.date?' ~ '+fmt(e.endDate):''} · ${eventTime(e)}`:e.deadline?`${fmt(e.deadline)} 마감${e.deadlineTime?' '+e.deadlineTime:''} · 날짜 없는 참여형`:'일정 미정';
// '선착순 여부 미기재'처럼 없다는 문장은 표시하지 않는다.
const ruleTags=e=>{const r=String(e.rule||'').split(/[·\n]/).filter(x=>!/여부|미기재/.test(x)).join(' ');return [/선착순/.test(r)&&'선착순',/추첨|lucky draw/i.test(r)&&'추첨',/전원/.test(r)&&'전원',/우승|최우수|수상/.test(r)&&'수상자'].filter(Boolean);};
const phaseClass={today:'',open:'upcoming',upcoming:'upcoming',full:'closed',tbd:'unknown',ended:'closed',cancelled:'closed'};
const pill=e=>{const p=phase(e);return `<span class="status ${phaseClass[p]}">${PHASES[p]}</span>`;};
const span=e=>e.date&&e.endDate&&e.endDate!==e.date?`${dotDate(e.date)}–${dotDate(e.endDate)}`:'';
const fitWord={free:'공강에 가능',clash:'수업과 겹침',unknown:'시간 미확인'};

// hero art: 월~금 시간표. 옅은 칸은 빈 시간, 긴 막대는 수업, 진한 칸은 공강에 열리는 행사.
function heroArt(){
  const classes=[[0,1,3],[0,7,2],[1,0,2],[1,4,3],[2,2,2],[2,8,3],[3,1,3],[3,6,2],[4,3,2],[4,9,2]];
  const finds=[[0,5],[1,8],[2,5],[3,10],[4,6]],gaps=[[1,3],[2,11],[4,0]];
  const busy=new Set(classes.flatMap(([c,r,n])=>Array.from({length:n},(_,i)=>`${c}-${r+i}`)));
  let s='<rect x="250" y="44" width="318" height="1.2" opacity="0.55"/>';
  for(let c=0;c<5;c++)s+=`<rect x="${252+c*64}" y="56" width="20" height="3" rx="1.5" opacity="0.5"/>`;
  for(let c=0;c<5;c++)for(let r=0;r<12;r++){
    if(busy.has(`${c}-${r}`)||finds.some(([a,b])=>a===c&&b===r)||gaps.some(([a,b])=>a===c&&b===r))continue;
    s+=`<rect x="${252+c*64}" y="${70+r*24}" width="52" height="18" rx="3" opacity="${(0.08+((c*7+r*5)%6)*0.018).toFixed(3)}"/>`;
  }
  for(const [c,r,n] of classes)s+=`<rect x="${252+c*64}" y="${70+r*24}" width="52" height="${n*24-6}" rx="3" opacity="0.3"/>`;
  for(const [c,r] of gaps)s+=`<rect x="${252.5+c*64}" y="${70.5+r*24}" width="51" height="17" rx="3" fill="none" stroke="currentColor" stroke-width="1" opacity="0.75"/>`;
  for(const [c,r] of finds)s+=`<rect x="${252+c*64}" y="${70+r*24}" width="52" height="18" rx="3" opacity="0.95"/>`;
  s+='<path d="M60 360 C 190 340, 290 300, 400 290 S 540 250, 600 214" fill="none" stroke="currentColor" stroke-width="1" opacity="0.45"/>';
  $('#hero-svg').innerHTML=s;
}

async function load(){
  $('#reload').disabled=true;
  try{
    const r=await fetch('data/events.json',{cache:'no-store'});if(!r.ok)throw Error();
    const j=await r.json();events=Array.isArray(j.events)?j.events:[];status=j.status||{};loaded=true;
  }catch{toast('행사 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');}
  finally{$('#reload').disabled=false;}
  render();followHash();
}

function setView(next,{scroll=true}={}){
  view=VIEWS.includes(next)?next:'events';render();
  const bar=$('.tabbar .wrap'),tab=bar.querySelector(`[data-tab="${view}"]`);
  if(bar.scrollWidth>bar.clientWidth&&(tab.offsetLeft<bar.scrollLeft||tab.offsetLeft+tab.offsetWidth>bar.scrollLeft+bar.clientWidth))bar.scrollLeft=tab.offsetLeft-16;
  if(scroll&&window.scrollY>$('.tabbar').offsetTop)window.scrollTo({top:$('.tabbar').offsetTop});
}
function render(){
  const all=data(),today=koreaDate();
  const active=all.filter(e=>!['ended','cancelled'].includes(phase(e)));
  const week=weekGroups(all,weekStart(today),today);
  $('#m-upcoming').textContent=loaded?active.length:'—';
  $('#m-week').textContent=loaded?week.count:'—';
  $('#m-deadline').textContent=loaded?active.filter(e=>e.deadline&&e.deadline>=today).length:'—';
  $('#m-free').textContent=slots.length?active.filter(e=>conflict(e,slots)==='free').length:'—';
  $('#verified-pill').textContent=status.verifiedAt?`자료 확인 ${status.verifiedAt.replaceAll('-','. ')}`:'자료 확인 —';
  $('#slot-count').textContent=slots.length;
  $('#fit-hint').textContent=slots.length?`수업 ${slots.length}개와 비교합니다. 종료시간이 없는 행사는 ‘시간 미확인’입니다.`:'시간표를 추가하면 비교합니다.';
  $('#sync-text').textContent=status.updatedAt?`최근 갱신 ${new Date(status.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}`:'';
  for(const id of VIEWS)$(`#${id}-view`).hidden=id!==view;
  document.querySelectorAll('[data-tab]').forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.tab===view)));
  if(loaded){renderEvents();renderToday();}
  renderTimetable();renderSources();renderFood();renderPick();
}

// 날짜 보기: 8일 이상 이어지는 공모전·설문 기간은 그날의 행사와 따로 보여 준다.
const LONG_DAYS=7;
const onDay=(e,d)=>!!e.date&&d>=e.date&&d<=(e.endDate||e.date);
const isLong=e=>!!e.date&&(new Date((e.endDate||e.date)+'T12:00:00+09:00')-new Date(e.date+'T12:00:00+09:00'))/864e5>=LONG_DAYS;
const byTime=(a,b)=>(a.start||'99').localeCompare(b.start||'99')||a.title.localeCompare(b.title,'ko');
// 달력과 날짜 선택은 지난 행사도 보여 준다(취소된 행사는 ‘지난 행사 보기’를 켰을 때만).
function filtered({forCalendar=false}={}){
  const query=$('#search').value.trim().toLowerCase(),category=$('#category-filter').value,selectedPhase=$('#phase-filter').value,source=$('#source-filter').value,fit=$('#fit-filter').value,bundle=$('#bundle-filter').value,past=$('#show-past').checked;
  const dayMode=forCalendar||!!picked;
  return data().filter(e=>{
    const p=phase(e);
    if(selectedPhase?p!==selectedPhase:!past&&(dayMode?p==='cancelled':['ended','cancelled'].includes(p)))return false;
    if(category&&e.category!==category)return false;
    if(source&&e.source!==source)return false;
    if(fit&&conflict(e,slots)!==fit)return false;
    if(bundle&&bundleOf(e,BUNDLES)!==bundle)return false;
    if(query&&![e.title,e.location,e.benefit,e.rule,e.eligibility].join(' ').toLowerCase().includes(query))return false;
    if(!forCalendar&&picked&&!onDay(e,picked)&&e.deadline!==picked)return false;
    return true;
  }).sort((a,b)=>(a.date||a.deadline||'9999').localeCompare(b.date||b.deadline||'9999')||(a.start||'').localeCompare(b.start||''));
}
function card(e){
  const p=phase(e),c=conflict(e,slots),date=e.date||e.deadline;
  const series=BUNDLES.find(b=>b.id===bundleOf(e,BUNDLES));
  const chips=[series?series.short:'',...ruleTags(e),e.registration==='required'?'사전신청 필요':e.registration==='none'?'신청 없이 참여':'',c==='free'||c==='clash'?fitWord[c]:'',e.demo?'가상 예시':''].filter(Boolean);
  return `<article class="s-card ev-card ${['ended','cancelled'].includes(p)?'archived':''}"><div class="ev-row"><div class="date-block" aria-hidden="true"><span>${date?Number(date.slice(5,7))+'월':'일정'}</span><strong>${date?Number(date.slice(8)):'—'}</strong><small>${!e.date&&e.deadline?'마감':e.date?DAYS[weekday(e.date)]+'요일':'미공지'}</small></div><div class="ev-main">
    <div class="meta-row"><p class="eyebrow">${esc(CATEGORY[e.category]||'')} · ${esc(SOURCE_LABEL[e.source]||'')}</p>${pill(e)}</div>
    <div class="s-card-title"><button type="button" class="title-button" data-detail="${esc(e.id)}">${esc(e.title)}</button></div>
    <p class="summary benefit">${esc(e.benefit||'혜택 원문 확인 필요')}</p>
    <dl class="facts"><div><dt>언제</dt><dd>${esc(when(e))}</dd></div><div><dt>어디서</dt><dd>${esc(e.location||'원문에 미기재')}</dd></div>${e.deadline&&e.date?`<div><dt>신청 마감</dt><dd>${esc(fmt(e.deadline))}${e.deadlineTime?' '+esc(e.deadlineTime):''}</dd></div>`:''}</dl>
    ${chips.length?`<ul class="chips">${chips.map(x=>`<li${x==='수업과 겹침'?' class="warn"':x==='공강에 가능'?' class="ok"':''}>${esc(x)}</li>`).join('')}</ul>`:''}
  </div></div><div class="card-links"><span class="muted small">확인 ${esc(e.verifiedAt||'—')}</span><button type="button" class="detail-button" data-detail="${esc(e.id)}">상세 보기 →</button></div></article>`;
}
function renderEvents(){
  const list=filtered();
  if(picked){
    // 그날 열리는 행사 → 그날 마감 → 그날에도 걸쳐 있는 긴 기간 행사 순서로 나눈다. 지도에서 건물을 고르면 그 건물 행사만.
    const atPlace=listView==='map'&&mapPlace?e=>placeKey(placeOf(e.location,places))===mapPlace:()=>true;
    const day=list.filter(e=>onDay(e,picked)&&!isLong(e)&&atPlace(e)).sort(byTime);
    const due=list.filter(e=>e.deadline===picked&&!day.includes(e));
    const span=list.filter(e=>onDay(e,picked)&&isLong(e)&&!due.includes(e));
    const head=(text,n)=>`<h3 class="day-head">${text} <span class="muted">${n}건</span></h3>`;
    $('#cards').innerHTML=(day.length?day.map(card).join(''):`<p class="day-none">${fmt(picked)}에 열리는 행사는 없습니다.</p>`)
      +(due.length?head(`${fmt(picked)} 신청·참여 마감`,due.length)+due.map(card).join(''):'')
      +(span.length?`<details class="day-more"><summary>이 날도 참여할 수 있는 공모전·기간 행사 <span class="muted">${span.length}건</span></summary><div class="results">${span.map(card).join('')}</div></details>`:'');
    $('#empty').hidden=true;
    $('#result-count').textContent=`${day.length}건`;
    const where=listView==='map'&&mapPlace?places.find(p=>placeKey(p)===mapPlace):null;
    $('#result-note').textContent=where?`${placeLabel(where)} · ${fmt(picked)} 행사 ${day.length}건 · `:`${fmt(picked)}에 열리는 행사 ${day.length}건${listView==='map'?'':' · '}`;
    $('#result-note').insertAdjacentHTML('beforeend',where?'<button type="button" class="text-button" id="unplace">건물 선택 해제</button>':listView==='map'?'':'<button type="button" class="text-button" id="unpick">날짜 선택 해제</button>');
    if(where){$('#cards').innerHTML=day.length?day.map(card).join(''):`<p class="day-none">이 건물에서 ${fmt(picked)}에 열리는 행사는 없습니다.</p>`;}
  }else{
    $('#cards').innerHTML=list.map(card).join('');
    $('#empty').hidden=list.length>0;
    $('#result-count').textContent=`${list.length}건`;
    $('#result-note').textContent='날짜순 · 원문에서 확인한 내용만 표시합니다.';
  }
  $('#calendar').hidden=listView!=='calendar';
  $('#map').hidden=listView!=='map';
  if(listView==='calendar')renderCalendar();
  if(listView==='map')renderMap();
}
function renderCalendar(){
  const first=new Date(month+'-01T12:00:00+09:00').getDay(),count=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate(),today=koreaDate();
  // 칸에는 목록과 같은 필터를 적용하고, 긴 기간 행사는 제목 대신 개수만 적는다.
  const all=filtered({forCalendar:true});
  const cells=Array.from({length:first},()=>'<span class="cal-cell blank"></span>');
  for(let d=1;d<=count;d++){
    const date=`${month}-${String(d).padStart(2,'0')}`;
    const on=all.filter(e=>onDay(e,date)&&!isLong(e)).sort(byTime),span=all.filter(e=>onDay(e,date)&&isLong(e)).length,due=all.filter(e=>e.deadline===date&&!e.date);
    const note=[span?`기간 ${span}`:'',due.length?`마감 ${due.length}`:''].filter(Boolean).join(' · ');
    cells.push(`<button type="button" class="cal-cell${date===today?' today':''}${date===picked?' picked':''}${on.length||due.length?' has':''}" data-pick="${date}" aria-pressed="${date===picked}" aria-label="${fmt(date)} 행사 ${on.length}건${note?' · '+note:''}"><span class="cal-d">${d}</span>${on.slice(0,2).map(e=>`<span class="cal-ev ${esc(e.category)}">${esc(e.title)}</span>`).join('')}${on.length>2?`<span class="cal-more">+${on.length-2}</span>`:''}${note?`<span class="cal-due">${note}</span>`:''}</button>`);
  }
  $('#calendar').innerHTML=`<div class="cal-head"><button type="button" class="text-button" data-month="-1" aria-label="이전 달">←</button><h3>${month.slice(0,4)}년 ${Number(month.slice(5))}월</h3><button type="button" class="text-button" data-month="1" aria-label="다음 달">→</button><button type="button" class="text-button" data-month="0">이번 달</button></div><div class="cal-grid">${DAYS.map(d=>`<span class="cal-label">${d}</span>`).join('')}${cells.join('')}</div>`;
}

// 오늘의 꽁밥: 오늘(없으면 다음으로 꽁밥이 있는 날) 열리는 행사를 시간순으로 몇 건만.
const nowMinutes=()=>{const [h,m]=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).split(':').map(Number);return h*60+m;};
const tagHTML=e=>foodTags(e.benefit).map(t=>`<span class="food-tag">${esc(t)}</span>`).join('');
const shortPlace=e=>{const s=e.location||'';const m=s.match(/(?<![\d-])(\d{1,3}(?:-\d)?)\s*동/);return m?`${m[1]}동`:s.length>18?s.slice(0,17)+'…':s;};
function renderToday(){
  const box=$('#today-strip'),today=koreaDate(),now=nowMinutes();
  const all=data().filter(e=>phase(e)!=='cancelled'&&e.date&&!isLong(e));
  const on=d=>all.filter(e=>onDay(e,d)).sort(byTime);
  // 오늘 행사가 모두 끝났으면 다음으로 꽁밥이 있는 날을 보여 준다. 기간 행사는 그날 시간이 지나면 끝난 것으로 본다.
  const done=e=>!!e.end&&now>=minutes(e.end);
  let day=today,list=on(today).sort((a,b)=>done(a)-done(b));const over=list.length&&list.every(done);
  if(!list.length||over){day=all.map(e=>e.date).filter(d=>d>today).sort()[0]||'';list=day?on(day):[];}
  if(!list.length){box.hidden=true;return;}
  const isToday=day===today;
  const row=e=>{const finished=isToday&&done(e);return `<li${finished?' class="done"':''}><span class="ts-time mono">${esc(e.start||'시간 미정')}</span><span class="ts-body"><button type="button" class="ts-title" data-detail="${esc(e.id)}">${esc(e.title)}</button><span class="ts-meta">${tagHTML(e)}${shortPlace(e)?`<span class="muted">${esc(shortPlace(e))}</span>`:''}${finished?'<span class="muted">끝남</span>':''}</span></span></li>`;};
  box.innerHTML=`<div class="ts-head"><p>${isToday?`<b>오늘의 꽁밥</b> <span class="muted">${fmt(today)} · ${list.length}건</span>`:`<b>${over?'오늘 꽁밥은 끝났어요':'오늘은 꽁밥이 없어요'}</b> <span class="muted">다음 꽁밥 ${fmt(day)} · ${list.length}건</span>`}</p><button type="button" class="text-button" data-pick-day="${day}">그날 전부 보기 →</button></div><ol class="ts-list">${list.slice(0,4).map(row).join('')}</ol>${list.length>4?`<button type="button" class="text-button ts-more" data-pick-day="${day}">+ ${list.length-4}건 더</button>`:''}`;
  box.hidden=false;
}
function pickDay(day){month=day.slice(0,7);if(listView==='list')setListView('calendar');picked=day;mapPlace='';mapVB=null;renderEvents();$('#result-note').scrollIntoView({block:'nearest'});}

// 꽁밥 지도: 고른 날 열리는 행사를 건물 위에 표시한다. 바탕은 OpenStreetMap 건물·길(data/campus.json),
// 건물 위치는 서울대 캠퍼스맵에서 확인한 좌표(data/places.json). 장소 문구에서 건물을 못 찾으면 지도에 올리지 않는다.
let campus=null,places=[],campusLoading=false,mapVB=null,mapPlace='',mapDrag=null;
const placeKey=p=>p?p.no||p.key:'';
const placeLabel=p=>p.no?`${p.no}동 ${p.name}`:p.name;
async function loadCampus(){
  if(campus||campusLoading)return;campusLoading=true;
  try{const [c,p]=await Promise.all(['data/campus.json','data/places.json'].map(u=>fetch(u).then(r=>{if(!r.ok)throw Error();return r.json();})));campus=c;places=p.places;}
  catch{$('#map-foot').textContent='지도 자료를 불러오지 못했습니다. 새로 고침해 주세요.';}
  finally{campusLoading=false;}
  if(campus)renderEvents();
}
const mapDayEvents=day=>filtered({forCalendar:true}).filter(e=>onDay(e,day)&&!isLong(e));
function mapGroups(day){
  const groups=new Map(),off=[];
  for(const e of mapDayEvents(day)){const p=placeOf(e.location,places);if(!p){off.push(e);continue;}const k=placeKey(p);if(!groups.has(k))groups.set(k,{p,events:[]});groups.get(k).events.push(e);}
  return {groups:[...groups.values()],off};
}
// 그날 식단이 있는 식당(위치를 확인한 곳만)과 운영 상태
function cafeGroups(day){
  const groups=new Map(),today=koreaDate(),now=nowMinutes();
  for(const c of foodCards(day)){
    const p=places.find(x=>x.no===CAFETERIA_PLACES[c.name]);if(!p||c.fallback)continue;
    const hours=c.meals.flatMap(m=>(m.hours||[]).filter(([a,b])=>a&&b));
    const open=day===today&&hours.some(([a,b])=>now>=minutes(a)&&now<minutes(b));
    const g=groups.get(p.no)||{p,names:[],open:false};g.names.push(c.name);g.open||=open;groups.set(p.no,g);
  }
  return [...groups.values()];
}
function fitMap(points){
  const box=$('#map-box'),aspect=(box.clientHeight||420)/(box.clientWidth||640);
  const pts=points.length?points:places.filter(p=>p.no).map(p=>project(campus.proj,p.lat,p.lon));
  let x0=Math.min(...pts.map(p=>p[0])),x1=Math.max(...pts.map(p=>p[0])),y0=Math.min(...pts.map(p=>p[1])),y1=Math.max(...pts.map(p=>p[1]));
  const pad=points.length?110:40;x0-=pad;x1+=pad;y0-=pad;y1+=pad;
  let w=Math.max(x1-x0,320),h=Math.max(y1-y0,320*aspect);
  if(h/w>aspect)w=h/aspect;else h=w*aspect;
  mapVB={x:(x0+x1)/2-w/2,y:(y0+y1)/2-h/2,w,h};
}
function renderMap(){
  if(!campus){$('#map-foot').textContent='지도를 불러오는 중…';loadCampus();return;}
  const today=koreaDate(),days=Array.from({length:7},(_,i)=>addDays(today,i));
  $('#map-days').innerHTML=days.map(d=>{const n=mapDayEvents(d).length;return `<button type="button" data-map-day="${d}" class="${d===picked?'selected':''}" aria-pressed="${d===picked}">${d===today?'오늘':`${Number(d.slice(5,7))}/${Number(d.slice(8))}(${DAYS[weekday(d)]})`}${n?` <span class="mono">${n}</span>`:''}</button>`;}).join('');
  const svg=$('#map-svg');
  if(!svg.dataset.ready){svg.innerHTML=`<path class="m-campus" d="${campus.outline}"/><path class="m-path" d="${campus.minor}"/><path class="m-road" d="${campus.major}"/><path class="m-bld" d="${campus.buildings}"/><g id="m-cafes"></g><g id="m-marks"></g>`;svg.dataset.ready='1';}
  const {groups,off}=mapGroups(picked),cafes=$('#map-cafes').checked?cafeGroups(picked):[];
  if(!mapVB)fitMap([...groups,...cafes].map(g=>project(campus.proj,g.p.lat,g.p.lon)));
  drawMarks(groups,cafes);
  const mapped=groups.reduce((n,g)=>n+g.events.length,0);
  $('#map-foot').innerHTML=`${mapped?`건물에 올린 행사 ${mapped}건`:'이 날 건물에 올릴 행사가 없습니다'}${off.length?` · 온라인·캠퍼스 밖·장소 미확인 ${off.length}건은 아래 목록에만 있습니다`:''}. 표시를 누르면 그 건물 행사만 봅니다. <span class="muted">${esc(campus.attribution)}</span>`;
}
function drawMarks(groups,cafes){
  const svg=$('#map-svg'),u=mapVB.w/(svg.clientWidth||640),r=13*u,fs=12*u;
  svg.setAttribute('viewBox',`${mapVB.x} ${mapVB.y} ${mapVB.w} ${mapVB.h}`);
  $('#m-cafes').innerHTML=cafes.map(g=>{const [x,y]=project(campus.proj,g.p.lat,g.p.lon),s=9*u;return `<g class="m-cafe${g.open?' open':''}" data-cafe="${esc(g.names[0])}" tabindex="0" role="button" aria-label="${esc(g.names.join(', '))}${g.open?' · 지금 운영':''} · 식단 보기"><title>${esc(g.names.join(' · '))}${g.open?' · 지금 운영':''}</title><rect x="${x-s}" y="${y-s}" width="${2*s}" height="${2*s}" rx="${3*u}"/><text x="${x}" y="${y+fs*.34}" font-size="${fs*.85}">식</text></g>`;}).join('');
  $('#m-marks').innerHTML=groups.map(g=>{
    const [x,y]=project(campus.proj,g.p.lat,g.p.lon),k=placeKey(g.p),sel=k===mapPlace,food=g.events.some(e=>e.category==='food');
    return `<g class="m-mark${food?' food':''}${sel?' sel':''}" data-place="${esc(k)}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(placeLabel(g.p))} 행사 ${g.events.length}건"><title>${esc(placeLabel(g.p))}\n${g.events.map(e=>`${e.start||''} ${e.title}`.trim()).map(esc).join('\n')}</title><circle cx="${x}" cy="${y}" r="${sel?r*1.25:r}"/><text x="${x}" y="${y+fs*.36}" font-size="${fs}">${g.events.length}</text><text class="m-lbl" x="${x}" y="${y+r*(sel?1.25:1)+fs*1.05}" font-size="${fs*.92}">${esc(g.p.no?g.p.no+'동':g.p.name)}</text></g>`;
  }).join('');
}
function zoomMap(f,cx=mapVB.x+mapVB.w/2,cy=mapVB.y+mapVB.h/2){
  const w=Math.min(Math.max(mapVB.w*f,140),campus.width*1.15),k=w/mapVB.w;
  mapVB={x:cx-(cx-mapVB.x)*k,y:cy-(cy-mapVB.y)*k,w,h:mapVB.h*k};renderMap();
}
function mapPoint(e){const svg=$('#map-svg'),b=svg.getBoundingClientRect();return [mapVB.x+(e.clientX-b.left)/b.width*mapVB.w,mapVB.y+(e.clientY-b.top)/b.height*mapVB.h];}
function setupMapGestures(){
  const svg=$('#map-svg'),pts=new Map();
  svg.addEventListener('pointerdown',e=>{if(!mapVB)return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});mapDrag={vb:{...mapVB},pts:new Map([...pts].map(([k,v])=>[k,{...v}])),moved:false};});
  svg.addEventListener('pointermove',e=>{
    if(!mapDrag||!pts.has(e.pointerId))return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const b=svg.getBoundingClientRect(),[a,c]=[...pts.values()],[a0,c0]=[...mapDrag.pts.values()];
    if(pts.size>=2&&c&&c0){// 두 손가락: 확대·축소
      const k=Math.hypot(a0.x-c0.x,a0.y-c0.y)/Math.max(1,Math.hypot(a.x-c.x,a.y-c.y)),v=mapDrag.vb,w=Math.min(Math.max(v.w*k,140),campus.width*1.15),mx=(a0.x+c0.x)/2-b.left,my=(a0.y+c0.y)/2-b.top;
      const cx=v.x+mx/b.width*v.w,cy=v.y+my/b.height*v.h,s=w/v.w;mapVB={x:cx-(cx-v.x)*s,y:cy-(cy-v.y)*s,w,h:v.h*s};mapDrag.moved=true;renderMap();return;
    }
    const dx=a.x-a0.x,dy=a.y-a0.y;if(!mapDrag.moved&&Math.hypot(dx,dy)<5)return;
    if(!mapDrag.moved){mapDrag.moved=true;svg.setPointerCapture(e.pointerId);svg.classList.add('dragging');}
    mapVB={...mapVB,x:mapDrag.vb.x-dx/b.width*mapDrag.vb.w,y:mapDrag.vb.y-dy/b.height*mapDrag.vb.h};svg.setAttribute('viewBox',`${mapVB.x} ${mapVB.y} ${mapVB.w} ${mapVB.h}`);
  });
  const end=e=>{pts.delete(e.pointerId);svg.classList.remove('dragging');if(mapDrag?.moved)mapSuppressClick=performance.now()+250;if(!pts.size)mapDrag=null;else mapDrag={vb:{...mapVB},pts:new Map([...pts].map(([k,v])=>[k,{...v}])),moved:true};};
  svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
  svg.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey)||!mapVB)return;e.preventDefault();const [cx,cy]=mapPoint(e);zoomMap(e.deltaY>0?1.2:1/1.2,cx,cy);},{passive:false});
  svg.addEventListener('dblclick',e=>{if(!mapVB)return;e.preventDefault();const [cx,cy]=mapPoint(e);zoomMap(.6,cx,cy);});
  svg.addEventListener('keydown',e=>{const g=e.target.closest('[data-place],[data-cafe]');if(g&&(e.key==='Enter'||e.key===' ')){e.preventDefault();g.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
  window.addEventListener('resize',()=>{if(listView==='map'&&mapVB&&!$('#map').hidden){const box=$('#map-box');mapVB={...mapVB,h:mapVB.w*box.clientHeight/Math.max(1,box.clientWidth)};renderMap();}});
}
let mapSuppressClick=0;

// 뭐 먹지: 학식 메뉴 뽑기와 월드컵. 후보는 menu.json의 가격 있는 메뉴(core.js menuCandidates).
const FOOD_EMOJI=[[/라면|우동|국수|짬뽕|짜장|소바|쌀국수|냉면|칼국수|라멘|면$/,'🍜'],[/카레/,'🍛'],[/찌개|전골|국밥|[국탕죽]$/,'🍲'],[/돈까스|돈가스|까스|커틀릿|튀김/,'🍤'],[/덮밥|비빔밥|볶음밥|컵밥|오므라이스|리조또|밥/,'🍚'],[/치킨|닭/,'🍗'],[/갈비|목살|삼겹|불고기|제육|보쌈|족발|스테이크/,'🍖'],[/파스타|스파게티|까르보나라/,'🍝'],[/피자/,'🍕'],[/버거/,'🍔'],[/샌드위치|토스트/,'🥪'],[/초밥|연어|회덮/,'🍣'],[/생선|고등어|꽁치|동태|가자미|삼치|임연수/,'🐟'],[/오징어|낙지|쭈꾸미|주꾸미/,'🦑'],[/새우/,'🍤'],[/만두/,'🥟'],[/샐러드/,'🥗'],[/김밥|주먹밥/,'🍙'],[/떡볶이|떡/,'🍢'],[/계란|오믈렛|에그/,'🍳'],[/두유|우유/,'🥛']];
const foodEmoji=name=>FOOD_EMOJI.find(([re])=>re.test(name))?.[1]||'🍽️';
const shortDay=d=>`${Number(d.slice(5,7))}/${Number(d.slice(8))}(${DAYS[weekday(d)]})`;
const hoursText=c=>c.hours.map(([a,b])=>`${a}${b?'–'+b:'~'}`).join(', ');
function openState(c){
  if(c.date!==koreaDate())return {open:false,label:''};
  const now=nowMinutes(),h=c.hours.find(([a,b])=>b&&now>=minutes(a)&&now<minutes(b));
  if(h)return {open:true,label:`지금 운영 · ${h[1]}까지`};
  const next=c.hours.find(([a])=>minutes(a)>now);return {open:false,label:next?`오늘 ${next[0]}부터`:'오늘은 운영 끝'};
}
let drawDate='',drawMeal='',drawTimer=0,drawPicked=null;
let cupMode='top',cupSize=32,cup=null,cupStack=[],cupBusy=false;
const CUP_KEY='gonggang-chunsik-history';
function drawPool(){
  let list=menuCandidates(menu,{dates:[drawDate],meals:drawMeal?[drawMeal]:[]});
  const max=Number($('#draw-price').value)||0;if(max)list=list.filter(c=>c.price<=max);
  if($('#draw-open').checked&&drawDate===koreaDate())list=list.filter(c=>openState(c).open);
  if($('#draw-fit').checked&&slots.length){const gaps=freeGaps(slots,weekday(drawDate),'08:00','21:00');list=list.filter(c=>c.hours.some(([a,b])=>b&&windowsInGaps(gaps,a,b,20).length));}
  return list;
}
function renderPick(){
  const days=menuDays(),today=koreaDate();
  if(!days.length){$('#draw-count').textContent=menu?'가져온 식단이 없습니다. 생협 식단 페이지를 확인하세요.':'식단을 불러오는 중…';$('#draw-go').disabled=true;$('#pick-aside').textContent='';renderCup();loadBoard();return;}
  if(!drawDate||!days.includes(drawDate)){
    const m=defaultMeal(nowMinutes());
    drawDate=m==='next-lunch'?days.find(d=>d>today)||days[0]:days[0];drawMeal=m==='next-lunch'?'lunch':m;
    if(!menuCandidates(menu,{dates:[drawDate],meals:[drawMeal]}).length)drawMeal='';
  }
  $('#pick-aside').textContent=`식단 ${shortDay(days[0])}~${shortDay(days.at(-1))}`;
  $('#draw-days').innerHTML=days.slice(0,5).map(d=>`<button type="button" data-draw-day="${d}" class="${d===drawDate?'selected':''}" aria-pressed="${d===drawDate}">${d===today?'오늘':shortDay(d)}</button>`).join('');
  $('#draw-meals').innerHTML=[['','전체'],['breakfast','아침'],['lunch','점심'],['dinner','저녁']].map(([k,t])=>{const n=menuCandidates(menu,{dates:[drawDate],meals:k?[k]:[]}).length;return `<button type="button" data-draw-meal="${k}" class="${k===drawMeal?'selected':''}" aria-pressed="${k===drawMeal}"${n?'':' disabled'}>${t} <span class="mono">${n}</span></button>`;}).join('');
  $('#draw-open').disabled=drawDate!==today;$('#draw-open').closest('label').classList.toggle('off',drawDate!==today);
  $('#draw-fit').disabled=!slots.length;$('#draw-fit').closest('label').title=slots.length?'':'내 시간표에 수업을 넣으면 쓸 수 있어요';$('#draw-fit').closest('label').classList.toggle('off',!slots.length);
  const pool=drawPool();
  $('#draw-count').textContent=pool.length?`후보 ${pool.length}개 · ${new Set(pool.map(c=>c.cafeteria)).size}곳`:'조건에 맞는 메뉴가 없습니다. 조건을 넓혀 보세요.';
  if(!drawTimer)$('#draw-go').disabled=!pool.length;
  renderCup();loadBoard();
}
function showReel(c,final){
  $('#draw-emoji').textContent=foodEmoji(c.name);$('#draw-name').textContent=c.name;
  $('#draw-sub').textContent=final?[c.cafeteria,`${c.date===koreaDate()?'':shortDay(c.date)+' '}${c.mealLabel} ${hoursText(c)}`.trim(),won(c.price),openState(c).label].filter(Boolean).join(' · '):c.cafeteria;
}
function runDraw(){
  const pool=drawPool();if(!pool.length)return;
  const pick=pool[Math.floor(Math.random()*pool.length)],steps=matchMedia('(prefers-reduced-motion: reduce)').matches?0:14;let n=0;
  clearTimeout(drawTimer);$('#draw-go').disabled=true;$('#draw-see').hidden=true;$('#draw-reel').classList.add('spinning');
  const tick=()=>{
    if(n<steps){showReel(pool[Math.floor(Math.random()*pool.length)],false);n++;drawTimer=setTimeout(tick,28+n*n*1.3);return;}
    drawTimer=0;drawPicked=pick;showReel(pick,true);$('#draw-reel').classList.remove('spinning');$('#draw-reel').classList.add('landed');setTimeout(()=>$('#draw-reel').classList.remove('landed'),600);
    $('#draw-go').disabled=false;$('#draw-go').textContent='다시 뽑기';$('#draw-see').hidden=false;
  };
  tick();
}
function seeInFood(c){foodDate=c.date;$('#menu-search').value=c.cafeteria;location.hash='#food';renderFood();}

// 천식 이상형 월드컵: 학생회관식당의 역대 3,000원 메뉴(data/chunsik.json, 생협 식단 2024년 2월부터)만 겨룬다.
// 우승하면 천식 월드컵 구글 폼(CUP_FORM)에 우승 메뉴만 보내고, 응답 시트의 집계로 ‘모두의 천식 1등’을 보여 준다.
let chunsik=null,board=null,boardAt=0,lastVote=0;
const SIZES=[16,32,64],MODES=[['top','많이 나온 64개'],['year','최근 1년'],['all','역대 전체']];
async function loadChunsik(){
  try{const r=await fetch('data/chunsik.json',{cache:'no-store'});if(r.ok){const d=await r.json();chunsik={range:d.range||[],list:chunsikMenus(d)};}}catch{}
  renderCup();loadBoard();
}
async function loadBoard(force=false){
  if(!chunsik||(!force&&Date.now()-boardAt<60000))return;boardAt=Date.now();
  const q=encodeURIComponent("select B, count(A) where B is not null group by B order by count(A) desc label count(A) ''");
  try{const r=await fetch(`${CUP_FORM.sheet}?tqx=out:json&headers=1&tq=${q}`,{cache:'no-store'});if(r.ok)board=tallyChampions(parseGviz(await r.text()),chunsik.list);}catch{}
  renderBoard();
}
const dotDay=d=>d?d.replaceAll('-','.'):'';
// 이번 주 식단(menu.json)에서 학생회관식당 3,000원 메뉴로 다시 나오는 날
const upcomingHall=c=>menuCandidates(menu,{dates:menuDays()}).filter(x=>x.cafeteria.startsWith('학생회관')&&x.price===3000&&chunsikKey(x.name)===c.id);
const MEAL_SHORT={b:'아침',l:'점심',d:'저녁',a:'종일'};
const mealMix=c=>Object.entries(c.meals).filter(([,n])=>n).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${MEAL_SHORT[k]} ${n}`).join(' · ');
const cupPool=()=>chunsik?chunsikPool(chunsik.list,cupMode,koreaDate()):[];
function renderCup(){
  const setup=!cup,done=cup?.champion;
  $('#cup-setup').hidden=!setup;$('#cup-play').hidden=setup||!!done;$('#cup-result').hidden=!done;
  if(!chunsik){$('#cup-count').textContent='천식 목록을 불러오는 중…';$('#cup-start').disabled=true;return;}
  $('#cup-intro').textContent=`학생회관식당의 3,000원 메뉴, 천식만 모아 겨룹니다. 생협 식단 ${dotDay(chunsik.range[0])}~${dotDay(chunsik.range[1])}에 나온 천식 ${chunsik.list.length}개가 후보입니다.`;
  if(setup){
    const pool=cupPool(),max=bracketSize(pool.length,64),size=Math.min(cupSize,max);
    $('#cup-mode').innerHTML=MODES.map(([k,t])=>`<button type="button" data-cup-mode="${k}" class="${k===cupMode?'selected':''}" aria-pressed="${k===cupMode}">${t} <span class="mono">${chunsikPool(chunsik.list,k,koreaDate()).length}</span></button>`).join('');
    $('#cup-size').innerHTML=SIZES.map(n=>`<button type="button" data-cup-size="${n}" class="${n===size?'selected':''}" aria-pressed="${n===size}"${n>max?' disabled':''}>${n}강</button>`).join('');
    $('#cup-count').textContent=size>=4?`후보 ${pool.length}개 중 ${size}개를 무작위로 뽑아 ${roundName(size)}부터 겨룹니다.`:'후보가 모자라 월드컵을 열 수 없습니다.';
    $('#cup-start').disabled=size<4;$('#cup-status').textContent='';
  }else if(!done){
    const pair=cupPair(cup),total=cup.size-1;
    $('#cup-round').textContent=roundName(cup.round);$('#cup-match').textContent=cup.round===2?'':`${cup.match+1} / ${cup.pool.length/2}`;
    $('#cup-bar').style.width=`${cup.log.length/total*100}%`;$('#cup-status').textContent=`${roundName(cup.size)} · ${cup.log.length}/${total}경기`;
    const side=(c,i)=>{const next=upcomingHall(c)[0];return `<button type="button" class="cup-card" data-cup="${i}" aria-label="${esc(c.name)} 고르기"><span class="cup-emoji" aria-hidden="true">${foodEmoji(c.name)}</span><strong>${esc(c.name)}</strong><span class="cup-meta">지금까지 ${c.count}번 · 마지막 ${dotDay(c.last)}</span>${next?`<span class="cup-more">${next.date===koreaDate()?'오늘':shortDay(next.date)} ${esc(next.mealLabel)}에 또 나와요</span>`:''}</button>`;};
    $('#cup-pair').innerHTML=`${side(pair[0],0)}<span class="cup-vs-mark" aria-hidden="true">VS</span>${side(pair[1],1)}`;
    $('#cup-undo').disabled=!cupStack.length;
  }else{
    const c=cup.champion,final=cup.log.at(-1),semi=cup.log.filter(l=>l.round===4).map(l=>l.loser),next=upcomingHall(c);
    $('#cup-status').textContent=`${roundName(cup.size)} 끝`;
    $('#cup-result').innerHTML=`<div class="cup-win"><span class="cup-emoji big" aria-hidden="true">${foodEmoji(c.name)}</span><div><p class="eyebrow">🏆 천식 ${roundName(cup.size)} 우승</p><h4>${esc(c.name)}</h4><p class="muted">결승 상대 ${esc(final.loser.name)}${semi.length?` · 4강 ${semi.map(x=>esc(x.name)).join(', ')}`:''}</p></div></div>
      <h5 class="cup-sub">학생회관식당에서</h5><ul class="cup-where">${next.length?next.map(x=>{const st=openState(x);return `<li><span class="mono">${x.date===koreaDate()?'오늘':shortDay(x.date)}</span> <b>${esc(x.mealLabel)}</b> <span class="mono">${esc(hoursText(x))}</span> · 3,000원${st.label?` <span class="${st.open?'ok':'muted'}">${esc(st.label)}</span>`:''}</li>`;}).join(''):`<li>이번 주 식단에는 없어요. 마지막으로 나온 날은 <span class="mono">${dotDay(c.last)}</span>입니다.</li>`}<li class="muted">${dotDay(c.first)}부터 지금까지 ${c.count}번 나왔어요 (${mealMix(c)})</li></ul>
      <div class="actions"><button type="button" class="btn btn-primary" id="cup-again">한 판 더</button><button type="button" class="btn btn-secondary" id="cup-share">결과 공유</button><button type="button" class="text-button" id="cup-reset">설정 바꾸기</button></div>`;
  }
  const hist=read(CUP_KEY).slice(0,8);
  $('#cup-history').innerHTML=hist.length?`<p class="opt-label">내 우승 기록 <button type="button" class="text-button" id="cup-clear">지우기</button></p><ul class="chips">${hist.map(h=>`<li>${esc(h.name)} <span class="muted">${esc(h.label)}</span></li>`).join('')}</ul>`:'';
  renderBoard();
}
function renderBoard(){
  const el=$('#cup-board');if(!el)return;
  if(!board){el.innerHTML=`<h5 class="cup-sub" id="board-h">모두의 천식 1등</h5><p class="muted small">${chunsik?'집계를 불러오는 중…':''}</p>`;return;}
  const total=board.reduce((n,r)=>n+r.count,0),top=board.slice(0,10),max=top[0]?.count||1,mine=cup?.champion?.id;
  const rank=mine?board.findIndex(r=>r.id===mine)+1:0;
  el.innerHTML=`<h5 class="cup-sub" id="board-h">모두의 천식 1등 <span class="muted">지금까지 ${total}판</span></h5>${top.length?`<ol class="board">${top.map((r,i)=>`<li class="${r.id===mine?'mine':''}"><span class="mono b-rank">${i+1}</span><span class="b-name">${esc(r.name)}</span><span class="b-bar" aria-hidden="true"><span style="width:${r.count/max*100}%"></span></span><span class="mono b-n">${r.count}</span></li>`).join('')}</ol>`:'<p class="muted small">아직 기록이 없어요. 첫 우승 메뉴를 정해 주세요.</p>'}${mine&&rank>10?`<p class="small">내 우승 메뉴 순위: ${rank}위 (${esc(cup.champion.name)})</p>`:''}<p class="muted small">월드컵이 끝나면 우승 메뉴 이름만 익명으로 더해집니다. 1분쯤 늦게 반영될 수 있어요.</p>`;
}
// 우승 메뉴만 폼으로 보낸다(로그인·개인정보 없음). 같은 브라우저에서 30초 안에 다시 끝낸 판은 세지 않는다.
function sendVote(c,size){
  if(Date.now()-lastVote<30000)return;lastVote=Date.now();
  const body=new URLSearchParams({[CUP_FORM.entries.menu]:c.name,[CUP_FORM.entries.size]:`${size}강`});
  fetch(CUP_FORM.url,{method:'POST',mode:'no-cors',body}).catch(()=>{});
  if(board){const r=board.find(x=>x.id===c.id);if(r)r.count++;else board.push({id:c.id,name:c.name,count:1});board.sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ko'));}
  setTimeout(()=>loadBoard(true),4000);
}
function cupBegin(){const pool=cupPool(),size=Math.min(cupSize,bracketSize(pool.length,64));if(size<4)return;cup=startCup(pool,size);cupStack=[];renderCup();$('#cup-box').scrollIntoView({block:'nearest'});}
function cupPick(side){
  if(!cup||cup.champion||cupBusy)return;
  const card=document.querySelector(`[data-cup="${side}"]`),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  cupBusy=true;card?.classList.add('chosen');
  setTimeout(()=>{cupBusy=false;cupStack.push(cup);cup=cupChoose(cup,side);
    if(cup.champion){const h=read(CUP_KEY);h.unshift({name:cup.champion.name,label:`${shortDay(koreaDate())} ${roundName(cup.size)}`});try{localStorage.setItem(CUP_KEY,JSON.stringify(h.slice(0,20)));}catch{}sendVote(cup.champion,cup.size);}
    renderCup();},reduce?0:170);
}
async function shareCup(){
  const c=cup?.champion;if(!c)return;
  const text=`꽁밥 천식 이상형 월드컵 ${roundName(cup.size)} 우승: ${c.name}`,url=location.href.split('#')[0]+'#pick';
  try{if(navigator.share){await navigator.share({title:'천식 이상형 월드컵',text,url});return;}await navigator.clipboard.writeText(`${text}\n${url}`);toast('결과를 복사했습니다.');}catch{}
}

function showDetail(id){
  const e=data().find(x=>x.id===id);if(!e)return;
  const p=phase(e),c=conflict(e,slots),src=safeUrl(e.sourceUrl||''),reg=safeUrl(e.registrationUrl||'');
  const duration=e.duration?e.duration+'분':e.start&&e.end?minutes(e.end)-minutes(e.start)+'분':'';
  const canSave=e.date&&e.start&&e.end&&!e.cancelled&&!(e.endDate&&e.endDate!==e.date);
  $('#detail-content').innerHTML=`<div class="dialog-head"><div class="detail-dialog-meta"><p class="eyebrow">${esc(CATEGORY[e.category]||'')} · ${esc(SOURCE_LABEL[e.source]||'')}${e.demo?' · 가상 예시':''}</p>${pill(e)}</div><button type="button" class="close" data-close="detail-dialog" aria-label="상세 닫기">×</button></div><div class="dialog-body">
    <h2 id="detail-title" class="detail-title">${esc(e.title)}</h2><p class="detail-lead benefit-lead">${esc(e.benefit||'혜택 원문 확인 필요')}</p>
    ${p==='ended'?'<p class="detail-note">이미 종료된 행사입니다. 신청 링크는 표시하지 않습니다.</p>':p==='full'?'<p class="detail-note">신청 마감일이 지났습니다. 현장 참여 가능 여부는 원문에서 확인하세요.</p>':''}
    <dl class="deflist detail-facts">
      <div><dt>언제</dt><dd>${esc(online(e)?'정해진 행사 시간 없이 기간 내 온라인 참여':when(e))}</dd></div>
      ${duration&&e.duration!==null?`<div><dt>소요시간</dt><dd>${esc(duration)}</dd></div>`:''}
      <div><dt>어디서</dt><dd>${esc(e.location||'원문에 미기재')}</dd></div>
      <div><dt>참가 대상</dt><dd>${esc(e.eligibility||'원문에 미기재')}</dd></div>
      <div><dt>받는 조건</dt><dd>${esc(e.rule||'원문에 미기재')}</dd></div>
      <div><dt>사전신청</dt><dd>${REGISTRATION[e.registration]||'확인 필요'}</dd></div>
      <div><dt>신청 마감</dt><dd>${e.deadline?esc(fmt(e.deadline))+(e.deadlineTime?' '+esc(e.deadlineTime):' · 마감시간 미기재'):'원문에 미기재'}</dd></div>
      <div><dt>내 시간표</dt><dd>${c==='unset'?'시간표를 추가하면 비교합니다.':fitWord[c]}</dd></div>
    </dl>
    ${(e.uncertain||[]).length?`<section class="detail-section"><div class="sec-head"><span class="n">!</span><h3>꼭 확인하세요</h3></div><ul class="detail-list">${e.uncertain.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section>`:''}
    <section class="detail-section"><div class="sec-head"><span class="n">≡</span><h3>원문에서 확인한 근거</h3></div><blockquote class="quote">${esc(e.evidence||'—')}</blockquote><p class="detail-foot">확인일 <span class="mono">${esc(e.verifiedAt||'—')}</span> · 혜택 변경·소진 여부는 주최 측 안내를 확인하세요.</p></section>
    <div class="detail-actions">${src&&!e.demo?`<a class="btn btn-primary" href="${esc(src)}" target="_blank" rel="noopener noreferrer">원문 보기</a>`:''}${reg&&!e.demo&&!['ended','full','cancelled'].includes(p)?`<a class="btn btn-secondary" href="${esc(reg)}" target="_blank" rel="noopener noreferrer">신청 페이지</a>`:''}<button type="button" class="btn btn-secondary" id="save-ics" ${canSave?'':'disabled title="날짜와 시작·종료 시간이 모두 있어야 저장할 수 있습니다."'}>캘린더 저장(.ics)</button>${e.demo?'':'<button type="button" class="btn btn-secondary" id="copy-link">링크 복사</button>'}${e.source==='manual'?'<button type="button" class="btn btn-secondary" id="delete-mine">직접 추가한 행사 삭제</button>':''}</div>
  </div>`;
  $('#save-ics').onclick=()=>{try{download(e.title+'.ics',calendarText(e));toast('캘린더 파일을 저장했습니다.');}catch(err){toast(err.message);}};
  if($('#copy-link'))$('#copy-link').onclick=async()=>{const link=`${location.origin}${location.pathname}#event/${encodeURIComponent(id)}`;try{await navigator.clipboard.writeText(link);toast('이 행사 링크를 복사했습니다.');}catch{toast(link);}};
  if($('#delete-mine'))$('#delete-mine').onclick=()=>{personal=personal.filter(x=>x.id!==id);persist();$('#detail-dialog').close();render();toast('직접 추가한 행사를 삭제했습니다.');};
  if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
}

// 주간 시간표: 08~22시, 1분 = 0.7px, 15분 단위로 맞춘다.
const TT={from:8*60,to:22*60,px:0.7,step:15,tap:75};
const ttY=m=>(m-TT.from)*TT.px,ttMin=y=>TT.from+y/TT.px;
const clampMin=m=>Math.min(TT.to,Math.max(TT.from,m));
const ttDays=()=>[1,2,3,4,5,...[6,0].filter(d=>slots.some(s=>s.day===d))];
let drawMode=false,ttDrag=null,ttSuppressUntil=0;// 끌기를 마친 직후 따라오는 click은 수정 창을 열지 않는다
function slotBlock(s){
  const a=clampMin(minutes(s.start)),b=clampMin(minutes(s.end));
  return `<button type="button" class="tt-slot" data-slot="${esc(s.id)}" style="top:${ttY(a)}px;height:${Math.max(14,ttY(b)-ttY(a))}px" aria-label="${esc(s.title)} ${DAYS[s.day]} ${s.start}–${s.end} 수정"><span class="tt-name">${esc(s.title)}</span><span class="tt-when">${s.start}–${s.end}</span><span class="tt-resize" aria-hidden="true"></span></button>`;
}
function renderTimetable(){
  const days=ttDays(),height=ttY(TT.to);
  const hours=Array.from({length:(TT.to-TT.from)/60},(_,i)=>TT.from/60+i);
  $('#week-grid').style.gridTemplateColumns=`var(--tt-times-w) repeat(${days.length},minmax(0,1fr))`;
  $('#week-grid').classList.toggle('draw',drawMode);
  $('#week-grid').innerHTML=`<div class="tt-times"><span>시간</span><div class="tt-times-body" style="height:${height}px">${hours.map(h=>`<small style="top:${ttY(h*60)}px">${h}</small>`).join('')}</div></div>${days.map(d=>`<div class="tt-col"><b>${DAYS[d]}</b><div class="tt-body" data-day="${d}" style="height:${height}px">${slots.filter(s=>s.day===d).map(slotBlock).join('')}</div></div>`).join('')}`;
  $('#slot-list').innerHTML=slots.length?[...slots].sort((a,b)=>((a.day+6)%7)-((b.day+6)%7)||a.start.localeCompare(b.start)).map(s=>`<div class="slot"><span class="slot-when"><b>${DAYS[s.day]}</b> <span class="mono">${s.start}–${s.end}</span></span><strong>${esc(s.title)}</strong><button type="button" class="text-button" data-remove-slot="${esc(s.id)}" aria-label="${esc(s.title)} 삭제">삭제</button></div>`).join(''):'<p class="tl-empty">아직 추가한 수업이 없습니다.</p>';
}

// 수업 추가·수정 창
let slotEditing=null;
function openSlotEditor(s){
  slotEditing=s;const f=$('#slot-form');
  $('#slot-title').textContent=s.id?'수업 수정':'수업 추가';
  f.elements.title.value=s.title||'';f.elements.day.value=String(s.day);f.elements.start.value=s.start;f.elements.end.value=s.end;
  $('#slot-delete').hidden=!s.id;slotWarning();
  $('#slot-dialog').showModal();f.elements.title.focus();
}
function slotFromForm(){const f=$('#slot-form').elements;return {id:slotEditing?.id,title:f.title.value.trim(),day:Number(f.day.value),start:f.start.value,end:f.end.value};}
function slotWarning(){
  const c=slotFromForm();
  const clash=c.start&&c.end&&c.end>c.start?slotOverlaps(slots,c,c.id):[];
  $('#slot-warning').textContent=clash.length?`겹치는 수업: ${clash.map(s=>`${s.title} ${s.start}–${s.end}`).join(', ')}`:'';
}
function saveSlot(){
  const c=slotFromForm();
  if(!c.title)return toast('수업 이름을 입력해 주세요.');
  if(!c.start||!c.end||minutes(c.end)<=minutes(c.start))return toast('종료시간은 시작시간 이후여야 합니다.');
  const slot={...c,title:c.title.slice(0,80),id:c.id||Date.now().toString(36)+Math.random().toString(36).slice(2,6)};
  slots=c.id?slots.map(s=>s.id===c.id?slot:s):[...slots,slot];
  if(persist())toast(c.id?'수업을 고쳤습니다.':'시간표에 수업을 추가했습니다.');
  $('#slot-dialog').close();render();
}

// 표 위에서 끌기: 빈 칸은 새 수업, 수업 블록은 옮기기, 블록 아래 끝은 길이 바꾸기.
// 휴대폰에서는 화면 스크롤과 겹치지 않도록 '끌어서 그리기'를 켰을 때만 끌기를 받고, 평소엔 탭만 받는다.
function ttPoint(e,body){const r=body.getBoundingClientRect();return clampMin(snapMinutes(ttMin(e.clientY-r.top),TT.step));}
function ttBodyAt(e){return document.elementFromPoint(e.clientX,e.clientY)?.closest('.tt-body');}
function ttPreview(body,a,b,label){
  let el=$('#tt-preview');
  if(!el){el=document.createElement('div');el.id='tt-preview';el.className='tt-preview';}
  if(el.parentNode!==body)body.append(el);
  el.style.top=ttY(a)+'px';el.style.height=Math.max(10,ttY(b)-ttY(a))+'px';el.textContent=label;
}
function ttStart(e){
  if(e.button!==0)return;
  const body=e.target.closest('.tt-body');if(!body)return;
  const block=e.target.closest('.tt-slot'),touch=e.pointerType==='touch'&&!drawMode;
  const slot=block&&slots.find(s=>s.id===block.dataset.slot);
  ttDrag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,touch,body,day:Number(body.dataset.day),at:ttPoint(e,body),slot,
    mode:!block?'new':e.target.closest('.tt-resize')?'resize':'move',grab:slot?ttPoint(e,body)-minutes(slot.start):0};
  if(!touch){e.preventDefault();body.setPointerCapture?.(e.pointerId);}
}
function ttMove(e){
  const d=ttDrag;if(!d||d.id!==e.pointerId||d.touch)return;
  if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<5)return;
  d.moved=true;
  const body=ttBodyAt(e)||d.body,m=ttPoint(e,body);
  if(d.mode==='new'){const a=Math.min(d.at,m),b=Math.max(d.at,m,a+TT.step);d.result={day:d.day,start:a,end:b};ttPreview(d.body,a,b,`${hhmm(a)}–${hhmm(b)}`);}
  else if(d.mode==='move'){
    const len=minutes(d.slot.end)-minutes(d.slot.start),a=Math.min(TT.to-len,Math.max(TT.from,m-snapMinutes(d.grab,TT.step)));
    d.result={day:Number(body.dataset.day),start:a,end:a+len};ttPreview(body,a,a+len,`${d.slot.title} ${hhmm(a)}–${hhmm(a+len)}`);
  }else{
    const a=minutes(d.slot.start),b=Math.max(a+TT.step,m);
    d.result={day:d.slot.day,start:a,end:b};ttPreview(d.body,a,b,`${d.slot.title} ${hhmm(a)}–${hhmm(b)}`);
  }
}
function ttEnd(e){
  const d=ttDrag;if(!d||d.id!==e.pointerId)return;ttDrag=null;$('#tt-preview')?.remove();
  if(e.type==='pointercancel')return;
  const tapped=!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<10;
  if(d.mode==='new'){
    if(tapped){const a=Math.min(d.at,TT.to-TT.tap);openSlotEditor({day:d.day,start:hhmm(a),end:hhmm(a+TT.tap),title:''});}
    else if(d.result)openSlotEditor({day:d.result.day,start:hhmm(d.result.start),end:hhmm(d.result.end),title:''});
    return;
  }
  if(tapped||!d.result)return;// 수업 블록을 누른 것은 click에서 수정 창을 연다
  ttSuppressUntil=performance.now()+400;
  slots=slots.map(s=>s.id===d.slot.id?{...s,day:d.result.day,start:hhmm(d.result.start),end:hhmm(d.result.end)}:s);
  persist();render();
  const clash=slotOverlaps(slots,slots.find(s=>s.id===d.slot.id),d.slot.id);
  toast(clash.length?`옮겼습니다 · ${clash[0].title}와 겹칩니다.`:`${d.slot.title} ${DAYS[d.result.day]} ${hhmm(d.result.start)}–${hhmm(d.result.end)}`);
}
function setDrawMode(on){
  drawMode=on;$('#draw-mode').setAttribute('aria-pressed',String(on));$('#draw-mode').textContent=on?'그리기 끄기':'끌어서 그리기';
  $('#tt-hint').textContent=on?'표를 끌어서 수업 추가 · 블록을 끌어서 옮기기':'빈 칸을 눌러 75분 수업 추가 · 블록을 눌러 수정';
  $('#week-grid').classList.toggle('draw',on);
}

// 학식: GitHub Actions가 하루 세 번 생협 식단을 읽어 둔 data/menu.json을 보여 준다(scripts/fetch_menu.py).
// 그날 식단이 없으면 content.js CAFETERIAS의 운영시간만 보여 준다.
let menu=null,foodDate=null;
const MEAL_LABEL={breakfast:'아침',lunch:'점심',dinner:'저녁',allday:'종일'};
const CHEAP=3000;
const won=n=>n==null?'':n.toLocaleString('ko-KR')+'원';
async function loadMenu(){
  try{const r=await fetch('data/menu.json',{cache:'no-store'});if(r.ok)menu=await r.json();}catch{}
  renderFood();renderPick();
}
function menuDays(){const today=koreaDate();return Object.keys(menu?.days||{}).filter(d=>d>=today&&menu.days[d].length);}
function foodCards(date){
  const list=menu?.days?.[date];
  if(list?.length)return list.map(r=>({name:r.name,meals:Object.entries(r.meals).map(([k,m])=>({label:MEAL_LABEL[k]||k,...m}))}));
  return CAFETERIAS.map(c=>({name:c.name,fallback:true,meals:c.meals.map(([label,a,b,note])=>({label,hours:[[a,b]],crowd:[],items:[],notes:note?[note]:[]}))}));
}
function renderFood(){
  const today=koreaDate(),days=menuDays();
  if(!foodDate||foodDate<today)foodDate=days[0]||today;
  const date=days.includes(foodDate)?foodDate:today,day=weekday(date),isToday=date===today;
  const [hour,minute]=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).split(':').map(Number),nowMin=hour*60+minute;
  const query=($('#menu-search')?.value||'').trim().toLowerCase(),cheapOnly=$('#cheap-only')?.checked,fitOnly=$('#fit-only')?.checked;
  const chips=days.length?days:[today];
  $('#food-days').innerHTML=chips.map(d=>`<button type="button" data-food-date="${d}" class="${d===date?'selected':''}" aria-pressed="${d===date}">${d===today?'오늘 ':''}${Number(d.slice(5,7))}/${Number(d.slice(8))}(${DAYS[weekday(d)]})</button>`).join('');
  const gaps=slots.length?freeGaps(slots,day,'08:00','20:00'):[];
  $('#food-gaps').innerHTML=!slots.length?'시간표를 넣으면 공강에 갈 수 있는 식당을 골라 줍니다. <a href="#timetable">내 시간표</a>':gaps.length?`${DAYS[day]}요일 공강: ${gaps.map(g=>`<span class="mono">${g.start}–${g.end}</span>`).join(' · ')}`:`${DAYS[day]}요일에는 08~20시 사이 공강이 없습니다.`;
  const cards=foodCards(date).map(c=>{
    const windows=c.meals.flatMap(m=>(m.hours||[]).filter(([,b])=>b).map(([a,b])=>({label:m.label,a,b})));
    const fits=slots.length?windows.flatMap(w=>windowsInGaps(gaps,w.a,w.b,20).map(x=>`${w.label} ${x.start}–${x.end}`)):[];
    const open=isToday&&windows.some(w=>nowMin>=minutes(w.a)&&nowMin<minutes(w.b));
    const hit=t=>!query||t.toLowerCase().includes(query);
    const meals=c.meals.map(m=>({...m,items:m.items.filter(i=>(!cheapOnly||i.price!=null&&i.price<=CHEAP)&&(hit(i.name)||hit(c.name)))})).filter(m=>m.items.length||(!query&&!cheapOnly));
    return {...c,meals,fits:[...new Set(fits)],open};
  }).filter(c=>c.meals.length&&(!fitOnly||c.fits.length)).sort((x,y)=>(y.open-x.open)||(y.fits.length>0)-(x.fits.length>0));
  // 천원의 아침밥(식단에 '천원' 머리말이 있는 칸)을 맨 위에 따로 보여 준다.
  const cheap=foodCards(date).flatMap(c=>c.meals.filter(m=>m.items.some(i=>/천원/.test(i.name))).map(m=>({c,m})));
  $('#cheap-box').innerHTML=cheap.map(({c,m})=>`<strong>천원의 아침밥</strong> · ${esc(c.name)} · ${m.items.filter(i=>i.price!=null&&i.price<=1000).map(i=>esc(i.name)).join(', ')}${m.notes.length?`<br><span class="muted">${m.notes.map(esc).join(' · ')}</span>`:''}`).join('<br>');
  $('#cheap-box').hidden=!cheap.length;
  const mealHTML=m=>{
    const hours=(m.hours||[]).map(([a,b])=>`${a}${b?'–'+b:'~'}`).join(', '),crowd=(m.crowd||[]).map(([a,b])=>`혼잡 ${a}–${b}`).join(' · ');
    const notes=(m.notes||[]).filter(n=>!/운영시간|혼잡시간|^\d{1,2}\s*:\s*\d{2}\s*~/.test(n));
    const li=i=>`<li class="${i.price!=null&&i.price<=CHEAP?'cheap':''}"><span>${esc(i.name)}</span>${i.price!=null?`<span class="mono">${won(i.price)}</span>`:''}</li>`;
    const items=m.items.length>8?`${m.items.slice(0,6).map(li).join('')}<li class="more"><details><summary>+ ${m.items.length-6}개 더</summary><ul>${m.items.slice(6).map(li).join('')}</ul></details></li>`:m.items.map(li).join('');
    return `<div class="meal"><p class="meal-head"><b>${esc(m.label)}</b> <span class="mono">${esc(hours)}</span>${crowd?` <span class="muted">${esc(crowd)}</span>`:''}</p>${m.items.length?`<ul class="menu-items">${items}</ul>`:''}${notes.length?`<p class="meal-note">${notes.map(esc).join(' · ')}</p>`:''}</div>`;
  };
  $('#food-cards').innerHTML=cards.length?cards.map(c=>`<article class="food-card${c.open?' open':''}"><div class="meta-row"><h3>${esc(c.name)}</h3>${c.open?'<span class="status">지금 운영</span>':''}</div>${c.meals.map(mealHTML).join('')}${slots.length?`<p class="food-fit${c.fits.length?' ok':''}">${c.fits.length?'공강에 가능: '+c.fits.map(esc).join(' · '):'이 날 공강과 운영시간이 20분 이상 겹치지 않음'}</p>`:''}</article>`).join(''):'<p class="tl-empty">조건에 맞는 메뉴가 없습니다.</p>';
  const hasMenu=!!menu?.days?.[date]?.length;
  $('#food-now').textContent=isToday?`지금 운영 ${cards.filter(c=>c.open).length}곳`:`${Number(date.slice(5,7))}/${Number(date.slice(8))} 식단`;
  $('#food-foot').textContent=hasMenu?`메뉴와 운영시간은 생협 식단 페이지에서 ${menu.fetchedAt.replace('T',' ').slice(0,16)}에 가져왔습니다. 품절·변경이 있을 수 있으니 공식 식단에서 다시 확인하세요. 학생회관식당·제3식당·기숙사식당·302동식당·동원관식당·자하연식당은 비구성원 1,000원 추가(생협 안내).`:`이 날 식단을 아직 가져오지 못해 ${MENU_CHECKED} 생협 페이지에 적힌 운영시간만 보여 줍니다. 메뉴는 공식 식단에서 확인하세요.`;
  $('#menu-link').href=`${MENU_URL}?date=${date}`;
}

function renderSources(){
  const checks=status.sourceChecks||[];
  $('#source-updated').textContent=status.verifiedAt?`자료 확인 ${status.verifiedAt}`:'';
  const day=iso=>new Date(iso).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
  const ig=SOURCES.filter(s=>s.kind==='instagram').length;
  $('#source-count').textContent=`공식 공지·행사 일정 ${SOURCES.length-ig}곳과 단체 공개 인스타그램 ${ig}곳`;
  const row=s=>{const c=checks.find(x=>x.key===s.key);return `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a></td><td class="desc">${esc(KIND_LABEL[s.kind]||'')}${s.kind==='instagram'?' @'+esc(s.url.split('/')[3]):''}</td><td class="desc">${c?`${esc(CHECK_LABEL[c.state]||c.state)} · <span class="mono">${day(c.checkedAt)}</span>${c.detail?`<br><span class="small">${esc(c.detail)}</span>`:''}`:'확인 대기'}</td></tr>`;};
  $('#source-groups').innerHTML=SOURCE_GROUPS.map(g=>{
    const list=SOURCES.filter(s=>s.group===g);if(!list.length)return '';
    const last=list.map(s=>checks.find(c=>c.key===s.key)?.checkedAt).filter(Boolean).sort().at(-1);
    return `<details class="src-group"><summary><b>${esc(g)}</b> <span class="muted">${list.length}곳${last?` · 최근 확인 ${day(last)}`:''}</span></summary><div class="table-wrap"><table class="directory"><thead><tr><th scope="col">출처</th><th scope="col">종류</th><th scope="col">마지막 확인</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div></details>`;
  }).join('');
}

// 공지 붙여넣기
const DRAFT_FIELDS=[['title','행사명','text'],['date','행사 날짜','date'],['endDate','끝 날짜 (기간 행사)','date'],['deadline','신청 마감','date'],['deadlineTime','마감 시각','time'],['start','시작','time'],['end','종료','time'],['location','장소','text'],['benefit','혜택','text'],['category','혜택 종류','category'],['eligibility','대상','text'],['rule','받는 조건','textarea'],['registrationUrl','신청 링크 (https)','url'],['sourceUrl','원문 링크 (https · 제보할 때 필요)','url']];
// 제보: GitHub 이슈 양식(.github/ISSUE_TEMPLATE/tip.yml)의 칸을 초안 값으로 채워 연다. 사진·원문 전체는 보내지 않는다.
function tipFields(d){
  const when=[d.date&&(d.endDate&&d.endDate!==d.date?`${d.date} ~ ${d.endDate}`:d.date),d.start&&(d.end?`${d.start}~${d.end}`:`${d.start}부터`)].filter(Boolean).join(' ');
  const conditions=[d.eligibility&&`대상: ${d.eligibility}`,d.rule&&d.rule!=='지급 조건 미기재'&&`조건: ${d.rule}`,d.deadline&&`신청 마감: ${d.deadline}${d.deadlineTime?' '+d.deadlineTime:''}`].filter(Boolean).join(' / ');
  return {source:safeUrl(d.sourceUrl||'')||'',event:d.title||'',when,where:d.location||'',benefit:d.benefit||'',conditions,registration:safeUrl(d.registrationUrl||'')||''};
}
// 지금 보낼 제보 내용: 읽어낸 초안에 고친 값을 덮는다
function currentTip(){
  return draft?{...draft,...Object.fromEntries([...new FormData($('#draft-form'))].map(([k,v])=>[k,String(v).trim()]))}:{};
}
function updateTipLink(){updateTipBox();}
// 제보 상자: 붙여넣은 글이 있으면 바로 보낼 수 있게 하고, 읽어낸 핵심만 요약해 보여 준다.
let tipSent='';
function tipKey(){return $('#notice-text').value.trim();}
function updateTipBox(){
  const text=$('#notice-text').value.trim(),ready=text.length>=5;
  // 글 속 링크와 사진 속 QR을 이름표로 보여 준다(예: 데모팀 신청 · 참관자 신청 · 자세히 보기)
  const d=currentTip(),links=[...(d.links||[]).map(l=>({label:l.label,kind:l.kind})),...(d.qr||[]).map(c=>({label:c.label?`${c.label} (QR)`:'QR',kind:c.kind}))];
  const rows=[['행사',d.title],['언제',d.date?when(d):''],['어디서',d.location],['혜택',d.benefit],['링크',links.map(l=>(l.kind==='registration'?'신청 · ':'')+(l.label||'이름 없는 링크')).join(', ')]].filter(([,v])=>v);
  $('#tip-summary').hidden=!rows.length;
  $('#tip-summary').innerHTML=rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v.length>140?v.slice(0,138)+'…':v)}</dd></div>`).join('');
  const sent=tipSent&&tipSent===tipKey();
  $('#tip-title').textContent=sent?'제보했습니다. 고마워요!':ready?(rows.length?'이렇게 읽었어요. 그대로 보낼게요':'붙여넣은 글을 그대로 보낼게요'):'원문을 통째로 붙여넣으세요';
  $('#tip-send').disabled=!ready||sent;
  $('#tip-send').textContent=sent?'보냈습니다':'꽁밥에 제보하기';
  if(!sent&&$('#tip-status').dataset.sent){$('#tip-status').textContent='';delete $('#tip-status').dataset.sent;}
}
// 구글 폼 응답 주소로 바로 보낸다(로그인 없음). 응답 내용은 운영자만 본다.
async function sendTip(){
  const d=currentTip(),f=tipFields(d),text=$('#notice-text').value.trim();
  const qr=(draft?.qr||imageQR||[]).map(c=>`${c.label||'QR'}: ${c.text}`).join('\n');
  const notes=[text.slice(0,6000),qr&&`[사진 속 QR]\n${qr}`,textFromImage&&'(사진에서 읽은 글 · 사이트에서 보냄)'].filter(Boolean).join('\n\n');
  const body=new URLSearchParams();
  for(const [k,entry] of Object.entries(TIP_FORM.entries)){const v=k==='notes'?notes:f[k];if(v)body.set(entry,v.slice(0,k==='notes'?8000:1000));}
  $('#tip-send').disabled=true;$('#tip-status').textContent='보내는 중…';
  try{
    await fetch(TIP_FORM.url.replace(/\/viewform$/,'/formResponse'),{method:'POST',mode:'no-cors',body});
    tipSent=tipKey();$('#tip-status').textContent='운영자가 원문을 확인한 뒤 사이트에 올립니다.';$('#tip-status').dataset.sent='1';toast('꽁밥에 제보했습니다.');
  }catch{$('#tip-status').textContent='보내지 못했습니다. 인터넷 연결을 확인하거나 ‘구글 폼에서 직접 쓰기’를 이용해 주세요.';}
  updateTipBox();
}
function showDraft(next){
  draft=next;$('#draft-wrap').hidden=!draft;if(!draft){updateTipBox();return;}
  $('#draft-fields').innerHTML=DRAFT_FIELDS.map(([key,label,type])=>{
    const value=draft[key]??'';
    const input=type==='textarea'?`<textarea name="${key}" rows="3">${esc(value)}</textarea>`:type==='category'?`<select name="${key}">${Object.entries(CATEGORY).map(([v,t])=>`<option value="${v}"${v===value?' selected':''}>${t}</option>`).join('')}</select>`:`<input name="${key}" type="${type}" value="${esc(value)}">`;
    return `<label class="field${['date','time'].includes(type)?'':' full'}">${label}${input}</label>`;
  }).join('')+(draft.qr?.length?`<div class="qr-list full"><b>사진 속 QR코드 ${draft.qr.length}개</b><ul>${draft.qr.map((c,i)=>`<li><span class="tag ${c.kind==='registration'?'tag-server':'tag-none'}">${c.kind==='registration'?'신청':c.kind==='info'?'안내':'글자'}</span> <span class="qr-label">${esc(c.label||'이름표 없음')}</span><span class="qr-url">${safeUrl(c.text)?`<a href="${esc(safeUrl(c.text))}" target="_blank" rel="noopener noreferrer">${esc(c.text)}</a>`:esc(c.text)}</span>${safeUrl(c.text)?`<span class="qr-use"><button type="button" class="text-button" data-qr-use="registrationUrl" data-qr-i="${i}">신청 링크로</button><button type="button" class="text-button" data-qr-use="sourceUrl" data-qr-i="${i}">원문 링크로</button></span>`:''}</li>`).join('')}</ul></div>`:'')+(draft.uncertain.length?`<p class="detail-note"><b>확인 필요</b><br>${draft.uncertain.map(esc).join('<br>')}</p>`:'');
  updateTipLink();
}
let textFromImage=false,imageQR=[];// 사진에서 읽은 글이면 포스터 형식(두 줄 제목 등)과 사진 속 QR코드를 함께 쓴다.
// 사진 속 QR 중 신청용(이름표에 '신청' 등, 또는 신청서 주소)이 있으면 신청 링크 칸을 채운다.
function withQR(d){
  const out={...d,qr:imageQR},reg=imageQR.find(c=>c.kind==='registration'&&safeUrl(c.text));
  if(reg&&!out.registrationUrl){out.registrationUrl=safeUrl(reg.text);out.registration='required';out.uncertain=[...out.uncertain,`신청 링크는 사진 속 QR코드${reg.label?`(‘${reg.label}’)`:''}에서 읽었습니다 · 주소를 확인해 주세요`];}
  return out;
}
function readNotice(){
  try{const d=parseNotice($('#notice-text').value,Number($('#notice-year').value)||Number(koreaDate().slice(0,4)),{image:textFromImage});showDraft(textFromImage&&imageQR.length?withQR(d):d);$('#notice-error').textContent='';}
  catch(err){$('#notice-error').textContent=err.message;showDraft(null);}
}
function saveDraft(form){
  const values=Object.fromEntries(new FormData(form));
  const e={...draft,...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,String(v).trim()||null]))};
  e.rule=e.rule||'지급 조건 미기재';e.registrationUrl=e.registrationUrl||'';
  const missing=[!e.title&&'행사명',!e.date&&'행사 날짜',!e.location&&'장소',!e.benefit&&'혜택'].filter(Boolean);
  if(missing.length)return $('#notice-error').textContent=missing.join(', ')+'을 입력해 주세요.';
  if(e.start&&e.end&&e.end<=e.start)return $('#notice-error').textContent='종료시간은 시작시간 이후여야 합니다.';
  if(e.endDate===e.date)e.endDate=null;
  if(e.endDate&&e.endDate<e.date)return $('#notice-error').textContent='끝 날짜는 행사 날짜 이후여야 합니다.';
  if(e.registrationUrl&&!safeUrl(e.registrationUrl))return $('#notice-error').textContent='신청 링크는 https://로 시작해야 합니다.';
  e.sourceUrl=e.sourceUrl||'';
  if(e.sourceUrl&&!safeUrl(e.sourceUrl))return $('#notice-error').textContent='원문 링크는 https://로 시작해야 합니다.';
  if(events.some(x=>x.title.replace(/\s/g,'')===e.title.replace(/\s/g,'')&&x.date===e.date&&x.start===e.start))return toast('이미 행사 목록에 있는 일정입니다.');
  delete e.qr;e.id=noticeId(e);e.evidence=e.benefit;e.uncertain=e.end?[]:[/소진/.test(e.rule)?'수량 소진 시 종료':'종료시간 미기재'];
  personal=[...personal.filter(x=>x.id!==e.id),e];
  if(!persist())return;
  showDraft(null);$('#notice-text').value='';clearImage();
  listView='calendar';month=e.date.slice(0,7);picked=e.date;resetFilters({keepPick:true});
  if(expired(e))$('#show-past').checked=true;
  history.replaceState(null,'','#events');setView('events');setListView('calendar');picked=e.date;renderEvents();toast('내 캘린더에 추가했습니다. 이 브라우저에 저장됩니다.');
}

// 사진 글자 인식: PaddleOCR(ocr-paddle.js, 모델 ocr/paddle/)을 먼저 쓰고, 불러오지 못하면 원본의 tesseract.js(ocr/)로 읽는다.
// 어느 쪽이든 사진은 브라우저 밖으로 나가지 않는다.
let ocrJob=0,ocrAbort=null,paddle=null,imageUrl='';
function ocrStatus(text,busy=false){$('#ocr-status').hidden=!text;$('#ocr-status span').textContent=text;$('#ocr-cancel').hidden=!busy;}
function clearImage(){if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';imageQR=[];$('#image-preview').hidden=true;ocrStatus('');$('#ocr-hint').textContent='';}
async function prepareImage(file){
  if(!['image/png','image/jpeg','image/webp','image/bmp'].includes(file.type))throw Error('PNG·JPG·WebP·BMP 사진을 사용해 주세요. HEIC·PDF는 PNG나 JPG로 바꿔 주세요.');
  if(file.size>12*1024*1024)throw Error('사진은 12MB 이하로 올려 주세요.');
  const bitmap=await createImageBitmap(file).catch(()=>{throw Error('사진을 열 수 없습니다. 다른 사진으로 다시 시도해 주세요.');});
  try{
    if(bitmap.width*bitmap.height>28000000)throw Error('사진이 너무 큽니다. 공지 부분만 잘라서 다시 올려 주세요.');
    const scale=Math.min(2,2400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('사진 변환에 실패했습니다.')),'image/png'));
  }finally{bitmap.close();}
}
function loadTesseract(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';s.onload=()=>resolve(window.Tesseract);s.onerror=()=>reject(Error('글자 인식기를 불러오지 못했습니다.'));document.head.append(s);});
}
async function readWithTesseract(blob,job){
  const Tesseract=await loadTesseract(),root=new URL('./ocr/',document.baseURI).href;
  const worker=await Tesseract.createWorker(['kor','eng'],1,{workerPath:root+'worker.min.js',corePath:root+'core',langPath:root+'lang',workerBlobURL:false,logger:m=>{if(job===ocrJob)ocrStatus(m.status==='recognizing text'?'기본 인식기로 읽는 중 · '+Math.round(m.progress*100)+'%':'기본 인식기 준비 중',true);}});
  try{const {data}=await worker.recognize(blob);return {text:data.text,confidence:data.confidence};}
  finally{await worker.terminate().catch(()=>{});}
}
async function readImage(file){
  const job=++ocrJob;ocrAbort?.abort();const abort=ocrAbort=new AbortController();
  $('#notice-error').textContent='';showDraft(null);ocrStatus('사진을 준비하는 중…',true);
  try{
    const blob=await prepareImage(file);if(job!==ocrJob)return;
    clearImage();imageUrl=URL.createObjectURL(blob);$('#image-preview img').src=imageUrl;$('#image-name').textContent=file.name||'붙여넣은 사진';$('#image-preview').hidden=false;
    ocrStatus('한국어 인식 모델 준비 중 · 처음 한 번 약 18MB를 내려받아요.',true);
    let result;
    try{
      paddle??=import('./ocr-paddle.js?v=3').then(m=>m.createPaddleReader({modelBase:new URL('./ocr/paddle/',document.baseURI).href,onProgress:m=>{if(!abort.signal.aborted)ocrStatus(m,true);}}));
      const reader=await paddle;if(job!==ocrJob)return;
      result=await reader.recognize(blob,{signal:abort.signal});
    }catch(err){
      if(err?.name==='AbortError'||job!==ocrJob)return;
      paddle=null;console.warn('PaddleOCR 실패, tesseract로 전환',err);
      result=await readWithTesseract(blob,job);
    }
    if(job!==ocrJob)return;
    // 사진 속 QR코드: 위에 붙은 글자(이름표)로 신청 링크인지 가린다. 실패해도 글자 결과는 그대로 쓴다.
    ocrStatus('QR코드 찾는 중',true);
    try{const q=await import('./qr.js?v=2');imageQR=q.labelQRCodes(await q.findQRCodes(blob),result.items||[]).map(c=>({...c,kind:q.qrKind(c)}));}
    catch(err){console.warn('QR 찾기 실패',err);imageQR=[];}
    if(job!==ocrJob)return;
    const text=result.text.trim();
    if(!text)throw Error('사진에서 글자를 찾지 못했습니다. 공지 글자 부분을 선명하게 잘라서 다시 시도해 주세요.');
    if(text.length>16000)throw Error('읽힌 내용이 너무 깁니다. 행사 공지 부분만 잘라서 올려 주세요.');
    $('#notice-text').value=text;textFromImage=true;ocrStatus('사진 읽기 완료');
    $('#ocr-hint').textContent=result.confidence<80?'일부 글자가 흐리거나 작습니다. 날짜·시간·장소와 혜택을 꼭 확인해 주세요.':'사진에서 읽은 내용입니다. 숫자와 지급 조건을 원문과 대조한 뒤 추가해 주세요.';
    readNotice();
  }catch(err){if(job===ocrJob){$('#notice-error').textContent=err.message||'사진을 읽지 못했습니다.';ocrStatus('사진 읽기 실패');}}
}

function resetFilters({keepPick=false}={}){
  for(const name of ['search','category-filter','phase-filter','source-filter','fit-filter','bundle-filter'])$(`#${name}`).value='';
  $('#show-past').checked=false;if(!keepPick)picked='';render();
}
function setListView(next){
  listView=next;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===next);b.setAttribute('aria-pressed',String(b.dataset.view===next));});
  if(next==='list')picked='';
  if(next==='map'){picked=picked||koreaDate();mapPlace='';mapVB=null;}
  renderEvents();
}
function followHash(){
  const hash=decodeURIComponent(location.hash.slice(1));
  if(hash.startsWith('event/')){setView('events',{scroll:false});if(loaded)showDetail(hash.slice(6));return;}
  if(hash.startsWith('g-')){setView('guide',{scroll:false});requestAnimationFrame(()=>document.getElementById(hash)?.scrollIntoView({block:'start'}));return;}
  setView(VIEWS.includes(hash)?hash:'events',{scroll:false});
}
function watchGuideToc(){
  const links=[...document.querySelectorAll('#guide-view .toc a')];
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)links.forEach(a=>a.classList.toggle('active',a.dataset.jump===entry.target.id));},{rootMargin:'-30% 0px -60% 0px'});
  links.forEach(a=>{const section=document.getElementById(a.dataset.jump);if(section)observer.observe(section);});
}

function initialize(){
  heroArt();
  $('#notice-year').value=koreaDate().slice(0,4);
  // 좁은 화면에서만 필터를 접는다. 창 폭이 바뀌면 다시 맞춘다.
  const narrow=matchMedia('(max-width:1000px)');
  $('#filter-details').open=!narrow.matches;
  narrow.addEventListener('change',e=>{$('#filter-details').open=!e.matches;});
  $('#filter-details summary').addEventListener('click',e=>{if(!narrow.matches)e.preventDefault();});
  document.addEventListener('click',e=>{
    const jump=e.target.closest('a[data-jump]');
    if(jump){e.preventDefault();history.replaceState(null,'',`#${jump.dataset.jump}`);setView('guide',{scroll:false});document.getElementById(jump.dataset.jump)?.scrollIntoView({block:'start'});return;}
    // 지도 표시: 행사 건물을 누르면 그 건물 행사만, 식당을 누르면 학식 탭으로
    const mark=e.target.closest('#map-svg [data-place],#map-svg [data-cafe]');
    if(mark){
      if(performance.now()<mapSuppressClick)return;
      if(mark.dataset.place){mapPlace=mapPlace===mark.dataset.place?'':mark.dataset.place;renderEvents();if(mapPlace&&matchMedia('(max-width:700px)').matches)$('#result-note').scrollIntoView({block:'nearest',behavior:'smooth'});}
      else{foodDate=picked;$('#menu-search').value=mark.dataset.cafe;location.hash='#food';renderFood();}
      return;
    }
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.close)$(`#${button.dataset.close}`).close();
    if(button.dataset.detail){history.replaceState(null,'',`#event/${encodeURIComponent(button.dataset.detail)}`);showDetail(button.dataset.detail);}
    if(button.dataset.view)setListView(button.dataset.view);
    if(button.dataset.pick){picked=picked===button.dataset.pick?'':button.dataset.pick;renderEvents();if(picked)$('#result-note').scrollIntoView({block:'nearest'});}
    if(button.id==='unpick'){picked='';renderEvents();}
    if(button.dataset.pickDay)pickDay(button.dataset.pickDay);
    if(button.dataset.mapDay){picked=button.dataset.mapDay;mapPlace='';mapVB=null;renderEvents();}
    if(button.dataset.zoom&&mapVB){if(button.dataset.zoom==='fit'){mapVB=null;renderEvents();}else zoomMap(button.dataset.zoom==='in'?.7:1/.7);}
    if(button.id==='unplace'){mapPlace='';renderEvents();}
    if(button.dataset.drawDay){drawDate=button.dataset.drawDay;if(!menuCandidates(menu,{dates:[drawDate],meals:drawMeal?[drawMeal]:[]}).length)drawMeal='';renderPick();}
    if(button.dataset.drawMeal!==undefined){drawMeal=button.dataset.drawMeal;renderPick();}
    if(button.id==='draw-go')runDraw();
    if(button.id==='draw-see'&&drawPicked)seeInFood(drawPicked);
    if(button.dataset.cupMode){cupMode=button.dataset.cupMode;renderCup();}
    if(button.dataset.cupSize){cupSize=Number(button.dataset.cupSize);renderCup();}
    if(button.id==='cup-start'||button.id==='cup-again')cupBegin();
    if(button.dataset.cup!==undefined)cupPick(Number(button.dataset.cup));
    if(button.id==='cup-undo'&&cupStack.length){cup=cupStack.pop();renderCup();}
    if(button.id==='cup-quit'||button.id==='cup-reset'){cup=null;cupStack=[];renderCup();}
    if(button.id==='cup-share')shareCup();
    if(button.id==='cup-clear'){try{localStorage.removeItem(CUP_KEY);}catch{}renderCup();}
    if(button.dataset.month){const n=Number(button.dataset.month);if(n){const d=new Date(month+'-15T12:00:00+09:00');d.setMonth(d.getMonth()+n);month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}else month=koreaDate().slice(0,7);picked='';renderEvents();}
    if(button.dataset.foodDate){foodDate=button.dataset.foodDate;renderFood();}
    if(button.dataset.qrUse&&draft?.qr){const c=draft.qr[Number(button.dataset.qrI)],input=$('#draft-form').elements[button.dataset.qrUse];if(c&&input){input.value=safeUrl(c.text);updateTipLink();toast(button.dataset.qrUse==='sourceUrl'?'원문 링크에 넣었습니다.':'신청 링크에 넣었습니다.');}}
    if(button.dataset.removeSlot){slots=slots.filter(s=>s.id!==button.dataset.removeSlot);persist();render();}
    if(button.dataset.slot&&performance.now()>ttSuppressUntil){const s=slots.find(x=>x.id===button.dataset.slot);if(s)openSlotEditor({...s});}
  });
  window.addEventListener('hashchange',followHash);
  $('#detail-dialog').addEventListener('close',()=>{if(location.hash.startsWith('#event/'))history.replaceState(null,'',location.pathname+location.search+'#events');});
  for(const name of ['search','category-filter','phase-filter','source-filter','fit-filter','bundle-filter','show-past'])$(`#${name}`).addEventListener(name==='search'?'input':'change',()=>renderEvents());
  $('#reset-filters').onclick=()=>resetFilters();$('#clear-filters').onclick=()=>resetFilters();
  $('#show-past-button').onclick=()=>{$('#show-past').checked=true;renderEvents();};
  $('#reload').onclick=load;
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&view==='events'){e.preventDefault();$('#search').focus();}});
  $('#class-form').onsubmit=e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
    if(!String(f.title).trim())return toast('수업 이름을 입력해 주세요.');
    if(minutes(f.end)<=minutes(f.start))return toast('종료시간은 시작시간 이후여야 합니다.');
    slots=[...slots,{id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),title:String(f.title).trim().slice(0,80),day:Number(f.day),start:f.start,end:f.end}];
    if(persist()){e.target.elements.title.value='';toast('시간표에 수업을 추가했습니다.');}render();
  };
  $('#ics-file').onchange=async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{if(file.size>1024*1024)throw Error('1MB 이하 .ics 파일을 선택해 주세요.');const rows=sanitizeSlots(parseICS(await file.text()));if(!rows.length)throw Error('읽을 수 있는 수업이 없습니다.');slots=[...slots,...rows];persist();render();toast(rows.length+'개 수업을 추가했습니다.');}
    catch(err){toast(err.message);}
  };
  $('#read-notice').onclick=readNotice;
  $('#notice-example').onclick=()=>{$('#notice-text').value=noticeExample;textFromImage=false;readNotice();};
  $('#draft-form').onsubmit=e=>{e.preventDefault();saveDraft(e.target);};
  $('#image-file').onchange=e=>{const f=e.target.files?.[0];e.target.value='';if(f)readImage(f);};
  $('#image-clear').onclick=clearImage;
  $('#ocr-cancel').onclick=()=>{ocrJob++;ocrAbort?.abort();ocrStatus('사진 읽기를 취소했습니다.');};
  // 글을 붙여넣거나 고치면 잠시 뒤 저절로 다시 읽는다(‘다시 읽기’를 누르지 않아도 된다).
  let readTimer;
  $('#notice-text').addEventListener('input',e=>{if(!e.target.value.trim()){textFromImage=false;showDraft(null);$('#notice-error').textContent='';}clearTimeout(readTimer);readTimer=setTimeout(()=>{if($('#notice-text').value.trim())readNotice();},500);updateTipBox();});
  $('#tip-send').onclick=sendTip;
  const zone=$('#import-zone');
  zone.addEventListener('paste',e=>{const item=[...e.clipboardData.items].find(i=>i.kind==='file'&&i.type.startsWith('image/'));if(item){e.preventDefault();const f=item.getAsFile();if(f)readImage(f);}});
  zone.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
  zone.addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();readImage(e.dataTransfer.files[0]);}});
  $('#clear-data').onclick=()=>{if(!confirm('이 브라우저에 저장된 시간표와 직접 추가한 행사를 지울까요?'))return;slots=[];personal=[];try{localStorage.removeItem(SLOT_KEY);localStorage.removeItem(PERSONAL_KEY);}catch{}render();toast('이 사이트의 개인 기록을 지웠습니다.');};
  $('#bundle-filter').insertAdjacentHTML('beforeend',BUNDLES.map(b=>`<option value="${b.id}">${esc(b.short)}</option>`).join(''));
  $('#draft-form').addEventListener('input',updateTipLink);
  $('#menu-search').addEventListener('input',renderFood);
  for(const id of ['cheap-only','fit-only'])$(`#${id}`).addEventListener('change',renderFood);
  for(const id of ['draw-price','draw-open','draw-fit'])$(`#${id}`).addEventListener('change',renderPick);
  $('#map-cafes').addEventListener('change',()=>renderEvents());
  setupMapGestures();
  // 월드컵: ← → 로 고르고 Backspace로 되돌린다.
  document.addEventListener('keydown',e=>{
    if(view!=='pick'||!cup||cup.champion||e.target.closest('input,select,textarea'))return;
    if(e.key==='ArrowLeft'){e.preventDefault();cupPick(0);}
    else if(e.key==='ArrowRight'){e.preventDefault();cupPick(1);}
    else if(e.key==='Backspace'&&cupStack.length){e.preventDefault();cup=cupStack.pop();renderCup();}
  });
  const grid=$('#week-grid');
  grid.addEventListener('pointerdown',ttStart);
  grid.addEventListener('pointermove',ttMove);
  grid.addEventListener('pointerup',ttEnd);
  grid.addEventListener('pointercancel',ttEnd);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ttDrag){ttDrag=null;$('#tt-preview')?.remove();}});
  $('#draw-mode').onclick=()=>setDrawMode(!drawMode);
  setDrawMode(false);
  if(!matchMedia('(pointer:coarse)').matches)$('#tt-hint').textContent='빈 칸을 끌어서 수업 추가 · 블록을 끌어서 옮기기 · 아래 끝을 끌어서 길이 조절';
  $('#slot-form').onsubmit=e=>{e.preventDefault();saveSlot();};
  $('#slot-form').addEventListener('input',slotWarning);
  $('#slot-delete').onclick=()=>{const id=slotEditing?.id;if(!id)return;const s=slots.find(x=>x.id===id);slots=slots.filter(x=>x.id!==id);persist();$('#slot-dialog').close();render();toast(`${s?.title||'수업'}을 지웠습니다.`);};
  watchGuideToc();
  render();followHash();load();loadMenu();loadChunsik();
}
initialize();
