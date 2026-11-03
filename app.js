import {DAYS,minutes,koreaDate,weekday,conflict,expired,phase,PHASES,safeUrl,calendarText,parseICS,weekStart,addDays,weekGroups,sanitizeSlots,sanitizePersonal,parseNotice,noticeId,noticeExample,demoEvents} from './core.js?v=1';
import {SOURCES,SOURCE_LABEL,CHECK_LABEL,CATEGORY,REGISTRATION} from './content.js?v=1';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SLOT_KEY='gonggang-slots',PERSONAL_KEY='gonggang-personal-events';
const VIEWS=['events','week','timetable','import','guide'];
const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'[]');}catch{return [];}};
let slots=sanitizeSlots(read(SLOT_KEY)),personal=sanitizePersonal(read(PERSONAL_KEY));
let events=[],status={},loaded=false,demo=false,view='events',listView='list',month=koreaDate().slice(0,7),picked='',weekOffset=0,toastTimer,draft=null;

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
const data=()=>demo?demoEvents():[...events,...personal];
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
  const week=weekGroups(all,weekStart(today));
  $('#m-upcoming').textContent=loaded?active.length:'—';
  $('#m-week').textContent=loaded?week.count:'—';
  $('#m-deadline').textContent=loaded?active.filter(e=>e.deadline&&e.deadline>=today).length:'—';
  $('#m-free').textContent=slots.length?active.filter(e=>conflict(e,slots)==='free').length:'—';
  $('#verified-pill').textContent=demo?'체험 모드 · 가상 행사':status.verifiedAt?`자료 확인 ${status.verifiedAt.replaceAll('-','. ')}`:'자료 확인 —';
  $('#slot-count').textContent=slots.length;
  $('#demo-banner').hidden=!demo;
  $('#fit-hint').textContent=slots.length?`수업 ${slots.length}개와 비교합니다. 종료시간이 없는 행사는 ‘시간 미확인’입니다.`:'시간표를 추가하면 비교합니다.';
  $('#sync-text').textContent=status.updatedAt?`최근 갱신 ${new Date(status.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}`:'';
  for(const id of VIEWS)$(`#${id}-view`).hidden=id!==view;
  document.querySelectorAll('[data-tab]').forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.tab===view)));
  if(loaded||demo){renderEvents();renderWeek();}
  renderTimetable();renderMine();renderSources();
}

function filtered(){
  const query=$('#search').value.trim().toLowerCase(),category=$('#category-filter').value,selectedPhase=$('#phase-filter').value,source=$('#source-filter').value,fit=$('#fit-filter').value,past=$('#show-past').checked;
  return data().filter(e=>{
    const p=phase(e);
    if(selectedPhase?p!==selectedPhase:!past&&['ended','cancelled'].includes(p))return false;
    if(category&&e.category!==category)return false;
    if(source&&e.source!==source)return false;
    if(fit&&conflict(e,slots)!==fit)return false;
    if(query&&![e.title,e.location,e.benefit,e.rule,e.eligibility].join(' ').toLowerCase().includes(query))return false;
    if(picked&&!(e.date&&picked>=e.date&&picked<=(e.endDate||e.date))&&e.deadline!==picked)return false;
    return true;
  }).sort((a,b)=>(a.date||a.deadline||'9999').localeCompare(b.date||b.deadline||'9999')||(a.start||'').localeCompare(b.start||''));
}
function card(e){
  const p=phase(e),c=conflict(e,slots),date=e.date||e.deadline;
  const chips=[...ruleTags(e),e.registration==='required'?'사전신청 필요':e.registration==='none'?'신청 없이 참여':'',c==='free'||c==='clash'?fitWord[c]:'',e.demo?'가상 예시':''].filter(Boolean);
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
  $('#cards').innerHTML=list.map(card).join('');
  $('#empty').hidden=list.length>0;
  $('#result-count').textContent=`${list.length}건`;
  $('#result-note').textContent=picked?`${fmt(picked)} 행사만 표시 중 · `:'';
  if(picked)$('#result-note').insertAdjacentHTML('beforeend','<button type="button" class="text-button" id="unpick">날짜 선택 해제</button>');
  else $('#result-note').textContent=demo?'체험 모드의 행사는 실제 일정이 아닙니다.':'날짜순 · 원문에서 확인한 내용만 표시합니다.';
  $('#calendar').hidden=listView!=='calendar';
  if(listView==='calendar')renderCalendar();
}
function renderCalendar(){
  const first=new Date(month+'-01T12:00:00+09:00').getDay(),count=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate(),today=koreaDate();
  const all=data().filter(e=>!e.cancelled);
  const cells=Array.from({length:first},()=>'<span class="cal-cell blank"></span>');
  for(let d=1;d<=count;d++){
    const date=`${month}-${String(d).padStart(2,'0')}`;
    const on=all.filter(e=>e.date&&date>=e.date&&date<=(e.endDate||e.date)),due=all.filter(e=>e.deadline===date&&!e.date);
    cells.push(`<button type="button" class="cal-cell${date===today?' today':''}${date===picked?' picked':''}${on.length||due.length?' has':''}" data-pick="${date}" aria-label="${fmt(date)} 행사 ${on.length}건"><span class="cal-d">${d}</span>${on.slice(0,2).map(e=>`<span class="cal-ev ${esc(e.category)}">${esc(e.title)}</span>`).join('')}${on.length>2?`<span class="cal-more">+${on.length-2}</span>`:''}${due.length?`<span class="cal-due">마감 ${due.length}</span>`:''}</button>`);
  }
  $('#calendar').innerHTML=`<div class="cal-head"><button type="button" class="text-button" data-month="-1" aria-label="이전 달">←</button><h3>${month.slice(0,4)}년 ${Number(month.slice(5))}월</h3><button type="button" class="text-button" data-month="1" aria-label="다음 달">→</button><button type="button" class="text-button" data-month="0">이번 달</button></div><div class="cal-grid">${DAYS.map(d=>`<span class="cal-label">${d}</span>`).join('')}${cells.join('')}</div>`;
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

function renderWeek(){
  const start=addDays(weekStart(koreaDate()),weekOffset*7),w=weekGroups(data(),start);
  $('#week-range').textContent=`${dotDate(w.start)} – ${dotDate(w.end)}`;
  document.querySelectorAll('[data-week]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.week)===weekOffset));
  const days=w.days.filter(d=>d.events.length);
  const meta=e=>[span(e),e.location||'장소 미기재',...ruleTags(e),PHASES[phase(e)]].filter(Boolean).join(' · ');
  $('#week-card').innerHTML=`<header class="wc-head"><p class="eyebrow">꽁밥 · 주간</p><h3>${Number(w.start.slice(5,7))}월 ${Number(w.start.slice(8))}일 – ${Number(w.end.slice(5,7))}월 ${Number(w.end.slice(8))}일</h3><p class="wc-count">이번 주 행사 <strong>${w.count}</strong>건${w.deadlines.length?` · 신청 마감 <strong>${w.deadlines.length}</strong>건`:''}</p></header>
  ${days.length?days.map(d=>`<div class="wc-day"><div class="wc-date"><strong>${DAYS[weekday(d.date)]}</strong><span>${dotDate(d.date)}</span></div><ul>${d.events.map(e=>`<li><a href="#event/${encodeURIComponent(e.id)}"><span class="wc-time">${esc(e.start||'미공지')}</span><span class="wc-title">${esc(e.title)}</span><span class="wc-benefit">${esc(e.benefit)}</span><span class="wc-meta">${esc(meta(e))}</span></a></li>`).join('')}</ul></div>`).join(''):'<p class="tl-empty">이 주에 날짜가 확인된 행사가 없습니다.</p>'}
  ${w.deadlines.length?`<div class="wc-day"><div class="wc-date"><strong>마감</strong><span class="sans">신청</span></div><ul>${w.deadlines.map(e=>`<li><a href="#event/${encodeURIComponent(e.id)}"><span class="wc-time">${dotDate(e.deadline)}</span><span class="wc-title">${esc(e.title)}</span><span class="wc-benefit">${esc(e.benefit)}</span></a></li>`).join('')}</ul></div>`:''}
  <footer class="wc-foot">행사별 대상·신청 방법·장소는 사이트 상세와 원문에서 확인하세요. 일정과 제공 내용은 바뀔 수 있습니다.</footer>`;
  $('#copy-week').onclick=async()=>{
    const base=`${location.origin}${location.pathname}`;
    const text=[`[꽁밥] ${dotDate(w.start)} – ${dotDate(w.end)} 행사 ${w.count}건`,'',...days.flatMap(d=>[`${DAYS[weekday(d.date)]} ${dotDate(d.date)}`,...d.events.map(e=>`- ${e.start||'시간 미공지'} ${e.title}${span(e)?` (${span(e)})`:''} · ${e.benefit} · ${e.location||'장소 미기재'}${e.rule?' · '+e.rule:''}\n  ${base}#event/${encodeURIComponent(e.id)}`)]),...(w.deadlines.length?['','신청 마감',...w.deadlines.map(e=>`- ${dotDate(e.deadline)} ${e.title}\n  ${base}#event/${encodeURIComponent(e.id)}`)]:[]),'','정확한 일정과 참여 조건은 원문을 확인해 주세요.'].join('\n');
    try{await navigator.clipboard.writeText(text);toast('카드 문구를 복사했습니다.');}catch{toast('클립보드에 접근하지 못했습니다.');}
  };
  $('#save-week').onclick=()=>saveWeekImage(w).catch(()=>toast('카드 이미지를 만들지 못했습니다.'));
}

// 주간 카드 이미지(인스타그램 세로 1080×1350). 넘치는 행사는 건수만 적고 사이트로 안내한다.
async function saveWeekImage(w){
  const W=1080,H=1350,P=72,sans='"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',mono='"JetBrains Mono", Consolas, monospace';
  await Promise.all(['400','600','700'].map(weight=>document.fonts.load(`${weight} 32px "Pretendard Variable"`).catch(()=>{})));
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  const font=(size,weight=400,family=sans)=>{ctx.font=`${weight} ${size}px ${family}`;};
  const wrap=(text,width,max)=>{
    const lines=[];let line='';
    for(const ch of String(text)){
      if(ctx.measureText(line+ch).width>width){
        const cut=line.lastIndexOf(' ');
        if(cut>line.length*0.5){lines.push(line.slice(0,cut));line=line.slice(cut+1)+ch;}else{lines.push(line);line=ch.trim();}
        if(lines.length===max)break;
      }else line+=ch;
    }
    if(lines.length<max&&line)lines.push(line);
    else if(lines.length===max&&(line||lines.join('').length<String(text).length)){let last=lines[max-1];while(last&&ctx.measureText(last+'…').width>width)last=last.slice(0,-1);lines[max-1]=last+'…';}
    return lines;
  };
  // 머리
  ctx.fillStyle='#2a160c';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#ffd3b4';font(28,600);ctx.fillText('꽁밥 · 서울대 무료 음식·행사',P,P+20);
  ctx.fillStyle='#ffffff';font(68,700);ctx.fillText(`${Number(w.start.slice(5,7))}월 ${Number(w.start.slice(8))}일 – ${Number(w.end.slice(5,7))}월 ${Number(w.end.slice(8))}일`,P,P+110);
  font(32,400);ctx.fillStyle='rgba(255,255,255,.82)';
  ctx.fillText(`이번 주 행사 ${w.count}건${w.deadlines.length?` · 신청 마감 ${w.deadlines.length}건`:''}`,P,P+165);
  // 본문
  // 같은 배치를 두 번 돈다: 처음엔 높이만 재고, 그 높이로 흰 상자를 그린 뒤 글자를 쓴다.
  const top=290,bottom=H-130;
  const rows=[...w.days.filter(d=>d.events.length).map(d=>({label:DAYS[weekday(d.date)],sub:dotDate(d.date),items:d.events.map(e=>({time:e.start||'시간 미공지',e}))})),...(w.deadlines.length?[{label:'마감',sub:'신청',items:w.deadlines.map(e=>({time:dotDate(e.deadline),e}))}]:[])];
  const total=rows.reduce((n,r)=>n+r.items.length,0),left=P+20,col=left+120,textW=W-col-P-20;
  const body=draw=>{
    const put=(text,x,y,color)=>{if(draw){ctx.fillStyle=color;ctx.fillText(text,x,y);}};
    let y=top+30,shown=0;
    if(!rows.length){font(34,600);put('이 주에 날짜가 확인된 행사가 없습니다.',left,y+30,'#4b4e56');return y+60;}
    const lines=total>5?1:2;// 행사가 많은 주는 제목·혜택을 한 줄로 줄인다.
    const measure=e=>{font(34,700);const title=wrap(e.title,textW-110,lines);font(28,500);const benefit=wrap(e.benefit||'',textW-110,lines);return {title,benefit,need:title.length*44+benefit.length*38+44};};
    outer:for(const [i,row] of rows.entries()){
      if(y+Math.max(measure(row.items[0].e).need,80)>bottom-50)break;
      font(40,700);put(row.label,left,y+34,'#17181c');
      font(22,400,/^\d/.test(row.sub)?mono:sans);put(row.sub,left,y+66,'#6f727a');
      for(const {time,e} of row.items){
        const {title,benefit,need}=measure(e);
        if(y+need>bottom-(shown+1<total?50:0))break outer;
        if(/^\d/.test(time)){font(26,500,mono);put(time,col,y+32,'#c2410c');}
        else{font(22,600);put('시간',col,y+28,'#6f727a');put('미공지',col,y+56,'#6f727a');}
        let ty=y+32;
        font(34,700);for(const t of title){put(t,col+110,ty,'#17181c');ty+=44;}
        font(28,500);for(const t of benefit){put(t,col+110,ty,'#17181c');ty+=38;}
        font(24,400);put(wrap([span(e),e.location||'장소 미기재',...ruleTags(e),PHASES[phase(e)]].filter(Boolean).join(' · '),textW-110,1)[0]||'',col+110,ty,'#6f727a');
        y=ty+30;shown++;
      }
      if(i<rows.length-1){if(draw){ctx.fillStyle='#e4e4df';ctx.fillRect(left,y-8,W-2*left,2);}y+=22;}
    }
    if(shown<total){font(30,700);put(`+ ${total-shown}건 더 · 사이트에서 확인`,left,y+30,'#c2410c');y+=50;}
    return y;
  };
  const end=Math.min(body(false),bottom);
  ctx.fillStyle='#f8f8f5';ctx.beginPath();ctx.roundRect(36,top-24,W-72,end-top+40,28);ctx.fill();
  body(true);
  // 꼬리
  ctx.fillStyle='rgba(255,255,255,.85)';font(26,600);ctx.fillText(`${location.host}${location.pathname.replace(/\/$/,'')}`,P,H-62);
  ctx.fillStyle='rgba(255,255,255,.6)';font(22,400);ctx.fillText('행사별 대상·신청 방법·장소는 원문을 확인하세요. 일정과 제공 내용은 바뀔 수 있습니다.',P,H-28);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error()),'image/png'));
  download(`kkongbap-week-${w.start}.png`,blob,'image/png');toast('카드 이미지를 저장했습니다.');
}

function renderTimetable(){
  const cols=[1,2,3,4,5].map(d=>`<div class="tt-col"><b>${DAYS[d]}</b><div class="tt-body">${slots.filter(s=>s.day===d).map(s=>{const top=Math.max(0,(minutes(s.start)-540)/720*100),height=Math.max(3,Math.min(100-top,(minutes(s.end)-minutes(s.start))/720*100));return `<span class="tt-slot" style="top:${top}%;height:${height}%" title="${esc(s.title)} ${s.start}–${s.end}">${esc(s.title)}</span>`;}).join('')}</div></div>`).join('');
  $('#week-grid').innerHTML=`<div class="tt-times"><span>시간</span>${[9,10,11,12,13,14,15,16,17,18,19,20].map(h=>`<small>${h}:00</small>`).join('')}</div>${cols}`;
  $('#slot-list').innerHTML=slots.length?[...slots].sort((a,b)=>((a.day+6)%7)-((b.day+6)%7)||a.start.localeCompare(b.start)).map(s=>`<div class="slot"><span class="slot-when"><b>${DAYS[s.day]}</b> <span class="mono">${s.start}–${s.end}</span></span><strong>${esc(s.title)}</strong><button type="button" class="text-button" data-remove-slot="${esc(s.id)}" aria-label="${esc(s.title)} 삭제">삭제</button></div>`).join(''):'<p class="tl-empty">아직 추가한 수업이 없습니다.</p>';
}

function renderMine(){
  $('#mine-count').textContent=`${personal.length}건 · 이 브라우저에만 저장`;
  $('#mine').innerHTML=personal.length?personal.map(card).join(''):'<p class="tl-empty">공지를 읽어 추가한 행사가 여기에 표시됩니다.</p>';
}
function renderSources(){
  const checks=status.sourceChecks||[];
  $('#source-updated').textContent=status.verifiedAt?`자료 확인 ${status.verifiedAt}`:'';
  $('#source-rows').innerHTML=SOURCES.map(s=>{const c=checks.find(x=>x.key===s.key);return `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>${s.priority?' <span class="tag tag-both">우선</span>':''}</td><td class="desc">${s.kind==='instagram'?'학생회 인스타 @'+esc(s.url.split('/')[3]):'공식 공지'}</td><td class="desc">${c?`${esc(CHECK_LABEL[c.state]||c.state)} · <span class="mono">${new Date(c.checkedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</span>${c.detail?`<br><span class="small">${esc(c.detail)}</span>`:''}`:'확인 대기'}</td></tr>`;}).join('');
}

// 공지 붙여넣기
const DRAFT_FIELDS=[['title','행사명','text'],['date','행사 날짜','date'],['deadline','신청 마감','date'],['start','시작','time'],['end','종료','time'],['location','장소','text'],['benefit','혜택','text'],['category','혜택 종류','category'],['eligibility','대상','text'],['rule','받는 조건','textarea'],['registrationUrl','신청 링크 (https)','url']];
function showDraft(next){
  draft=next;$('#draft-form').hidden=!draft;if(!draft)return;
  $('#draft-fields').innerHTML=DRAFT_FIELDS.map(([key,label,type])=>{
    const value=draft[key]??'';
    const input=type==='textarea'?`<textarea name="${key}" rows="3">${esc(value)}</textarea>`:type==='category'?`<select name="${key}">${Object.entries(CATEGORY).map(([v,t])=>`<option value="${v}"${v===value?' selected':''}>${t}</option>`).join('')}</select>`:`<input name="${key}" type="${type}" value="${esc(value)}">`;
    return `<label class="field${['date','time'].includes(type)?'':' full'}">${label}${input}</label>`;
  }).join('')+(draft.uncertain.length?`<p class="detail-note"><b>확인 필요</b><br>${draft.uncertain.map(esc).join('<br>')}</p>`:'');
}
function readNotice(){
  try{showDraft(parseNotice($('#notice-text').value,Number($('#notice-year').value)||Number(koreaDate().slice(0,4))));$('#notice-error').textContent='';}
  catch(err){$('#notice-error').textContent=err.message;showDraft(null);}
}
function saveDraft(form){
  const values=Object.fromEntries(new FormData(form));
  const e={...draft,...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,String(v).trim()||null]))};
  e.rule=e.rule||'지급 조건 미기재';e.registrationUrl=e.registrationUrl||'';
  const missing=[!e.title&&'행사명',!e.date&&'행사 날짜',!e.location&&'장소',!e.benefit&&'혜택'].filter(Boolean);
  if(missing.length)return $('#notice-error').textContent=missing.join(', ')+'을 입력해 주세요.';
  if(e.start&&e.end&&e.end<=e.start)return $('#notice-error').textContent='종료시간은 시작시간 이후여야 합니다.';
  if(e.registrationUrl&&!safeUrl(e.registrationUrl))return $('#notice-error').textContent='신청 링크는 https://로 시작해야 합니다.';
  if(events.some(x=>x.title.replace(/\s/g,'')===e.title.replace(/\s/g,'')&&x.date===e.date&&x.start===e.start))return toast('이미 행사 목록에 있는 일정입니다.');
  e.id=noticeId(e);e.evidence=e.benefit;e.uncertain=e.end?[]:[/소진/.test(e.rule)?'수량 소진 시 종료':'종료시간 미기재'];
  personal=[...personal.filter(x=>x.id!==e.id),e];
  if(!persist())return;
  showDraft(null);$('#notice-text').value='';clearImage();
  demo=false;listView='calendar';month=e.date.slice(0,7);picked=e.date;resetFilters({keepPick:true});
  if(expired(e))$('#show-past').checked=true;
  history.replaceState(null,'','#events');setView('events');setListView('calendar');picked=e.date;renderEvents();toast('내 캘린더에 추가했습니다. 이 브라우저에 저장됩니다.');
}

// 사진 글자 인식: 원본과 같은 tesseract.js 6.0.1 + 이 저장소의 ocr/ 파일. 사진은 브라우저 밖으로 나가지 않는다.
let ocrJob=0,ocrWorker=null,imageUrl='';
function ocrStatus(text,busy=false){$('#ocr-status').hidden=!text;$('#ocr-status span').textContent=text;$('#ocr-cancel').hidden=!busy;}
function clearImage(){if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';$('#image-preview').hidden=true;ocrStatus('');$('#ocr-hint').textContent='';}
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
async function readImage(file){
  const job=++ocrJob;$('#notice-error').textContent='';showDraft(null);ocrStatus('사진을 준비하는 중…',true);
  let worker=null;
  try{
    const blob=await prepareImage(file);if(job!==ocrJob)return;
    clearImage();imageUrl=URL.createObjectURL(blob);$('#image-preview img').src=imageUrl;$('#image-name').textContent=file.name||'붙여넣은 사진';$('#image-preview').hidden=false;
    const Tesseract=await loadTesseract(),root=new URL('./ocr/',document.baseURI).href;
    worker=ocrWorker=await Tesseract.createWorker(['kor','eng'],1,{workerPath:root+'worker.min.js',corePath:root+'core',langPath:root+'lang',workerBlobURL:false,logger:m=>{if(job===ocrJob)ocrStatus(m.status==='recognizing text'?'사진 글자 읽는 중 · '+Math.round(m.progress*100)+'%':'한국어 인식기 준비 중 · 처음에는 조금 걸릴 수 있어요.',true);}});
    if(job!==ocrJob)return;
    const {data:result}=await worker.recognize(blob);if(job!==ocrJob)return;
    const text=result.text.trim();
    if(!text)throw Error('사진에서 글자를 찾지 못했습니다. 공지 글자 부분을 선명하게 잘라서 다시 시도해 주세요.');
    if(text.length>16000)throw Error('읽힌 내용이 너무 깁니다. 행사 공지 부분만 잘라서 올려 주세요.');
    $('#notice-text').value=text;ocrStatus('사진 읽기 완료');
    $('#ocr-hint').textContent=result.confidence<60?'일부 글자가 흐리거나 작습니다. 날짜·시간·장소와 혜택을 꼭 확인해 주세요.':'사진에서 읽은 내용입니다. 숫자와 지급 조건을 확인한 뒤 추가해 주세요.';
    readNotice();
  }catch(err){if(job===ocrJob){$('#notice-error').textContent=err.message||'사진을 읽지 못했습니다.';ocrStatus('사진 읽기 실패');}}
  finally{if(worker)await worker.terminate().catch(()=>{});if(ocrWorker===worker)ocrWorker=null;}
}

function resetFilters({keepPick=false}={}){
  for(const name of ['search','category-filter','phase-filter','source-filter','fit-filter'])$(`#${name}`).value='';
  $('#show-past').checked=false;if(!keepPick)picked='';render();
}
function setListView(next){
  listView=next;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===next);b.setAttribute('aria-pressed',String(b.dataset.view===next));});
  if(next==='list')picked='';renderEvents();
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
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.close)$(`#${button.dataset.close}`).close();
    if(button.dataset.detail){history.replaceState(null,'',`#event/${encodeURIComponent(button.dataset.detail)}`);showDetail(button.dataset.detail);}
    if(button.dataset.view)setListView(button.dataset.view);
    if(button.dataset.pick){picked=picked===button.dataset.pick?'':button.dataset.pick;renderEvents();if(picked)$('#result-note').scrollIntoView({block:'nearest'});}
    if(button.id==='unpick'){picked='';renderEvents();}
    if(button.dataset.month){const n=Number(button.dataset.month);if(n){const d=new Date(month+'-15T12:00:00+09:00');d.setMonth(d.getMonth()+n);month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}else month=koreaDate().slice(0,7);picked='';renderEvents();}
    if(button.dataset.week){weekOffset=Number(button.dataset.week)===0?0:weekOffset+Number(button.dataset.week);renderWeek();}
    if(button.dataset.removeSlot){slots=slots.filter(s=>s.id!==button.dataset.removeSlot);persist();render();}
  });
  window.addEventListener('hashchange',followHash);
  $('#detail-dialog').addEventListener('close',()=>{if(location.hash.startsWith('#event/'))history.replaceState(null,'',location.pathname+location.search+'#events');});
  for(const name of ['search','category-filter','phase-filter','source-filter','fit-filter','show-past'])$(`#${name}`).addEventListener(name==='search'?'input':'change',()=>renderEvents());
  $('#reset-filters').onclick=()=>resetFilters();$('#clear-filters').onclick=()=>resetFilters();
  $('#show-past-button').onclick=()=>{$('#show-past').checked=true;renderEvents();};
  $('#demo-on').onclick=()=>{demo=true;render();};$('#demo-off').onclick=()=>{demo=false;render();};
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
  $('#notice-example').onclick=()=>{$('#notice-text').value=noticeExample;readNotice();};
  $('#draft-form').onsubmit=e=>{e.preventDefault();saveDraft(e.target);};
  $('#image-file').onchange=e=>{const f=e.target.files?.[0];e.target.value='';if(f)readImage(f);};
  $('#image-clear').onclick=clearImage;
  $('#ocr-cancel').onclick=()=>{ocrJob++;ocrWorker?.terminate().catch(()=>{});ocrWorker=null;ocrStatus('사진 읽기를 취소했습니다.');};
  const zone=$('#import-zone');
  zone.addEventListener('paste',e=>{const item=[...e.clipboardData.items].find(i=>i.kind==='file'&&i.type.startsWith('image/'));if(item){e.preventDefault();const f=item.getAsFile();if(f)readImage(f);}});
  zone.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
  zone.addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();readImage(e.dataTransfer.files[0]);}});
  $('#clear-data').onclick=()=>{if(!confirm('이 브라우저에 저장된 시간표와 직접 추가한 행사를 지울까요?'))return;slots=[];personal=[];try{localStorage.removeItem(SLOT_KEY);localStorage.removeItem(PERSONAL_KEY);}catch{}render();toast('이 사이트의 개인 기록을 지웠습니다.');};
  watchGuideToc();
  render();followHash();load();
}
initialize();
