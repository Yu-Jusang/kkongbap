// 꽁밥 — 화면과 무관한 계산(겹침 판정, 행사 상태, ICS, 공지 읽기).
// legacy/source/model.ts, notice-import.ts의 규칙을 그대로 옮기고 상태 구분·주간 묶음만 더했다.

export const DAYS=['일','월','화','수','목','금','토'];
export const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
export const koreaDate=(at=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
export const weekday=date=>new Date(date+'T12:00:00+09:00').getDay();
const kst=(date,time)=>new Date(`${date}T${time}:00+09:00`).getTime();

export function conflict(e,slots,buffer=0){
  if(!slots.length)return 'unset';
  if(!e.date||!e.start||!e.end||e.endDate&&e.endDate!==e.date)return 'unknown';
  const day=weekday(e.date);
  return slots.some(s=>s.day===day&&minutes(e.start)<minutes(s.end)+buffer&&minutes(e.end)+buffer>minutes(s.start))?'clash':'free';
}
export function expired(e,today=koreaDate(),now=Date.now()){
  if(!e.date)return !!e.deadline&&(e.deadline<today||e.deadline===today&&!!e.deadlineTime&&now>kst(e.deadline,e.deadlineTime));
  const last=e.endDate||e.date;
  return last<today||last===today&&!!e.end&&kst(last,e.end)<now;
}
export function closed(e,today=koreaDate(),now=Date.now()){
  return !!e.deadline&&(e.deadline<today||e.deadline===today&&!!e.deadlineTime&&now>kst(e.deadline,e.deadlineTime));
}
// 모집·진행 상태. 원문에 날짜가 없으면 '일정 미정'으로 두고 추정하지 않는다.
export function phase(e,today=koreaDate(),now=Date.now()){
  if(e.cancelled)return 'cancelled';
  if(expired(e,today,now))return 'ended';
  if(!e.date)return e.deadline?'open':'tbd';
  if(e.deadline&&closed(e,today,now))return 'full';
  if(e.date<=today&&(e.endDate||e.date)>=today)return 'today';
  return e.deadline?'open':'upcoming';
}
export const PHASES={today:'오늘',open:'신청 중',upcoming:'예정',full:'신청 마감',tbd:'일정 미정',ended:'종료',cancelled:'취소'};

export function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}}

export function calendarText(e,stamp=new Date()){
  if(!e.date||!e.start||!e.end)throw Error('날짜와 시작·종료 시간이 모두 필요합니다.');
  const at=t=>e.date.replaceAll('-','')+'T'+t.replace(':','')+'00';
  const esc=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kkongbap//SNU Events//KO','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+e.id+'@kkongbap','DTSTAMP:'+stamp.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;TZID=Asia/Seoul:'+at(e.start),'DTEND;TZID=Asia/Seoul:'+at(e.end),'SUMMARY:'+esc(e.title),'LOCATION:'+esc(e.location),'DESCRIPTION:'+esc(e.benefit+' / '+e.rule+'\n'+(e.sourceUrl||'')),'END:VEVENT','END:VCALENDAR'].join('\r\n');
}

export function parseICS(text){
  const days={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};
  return [...text.replace(/\r?\n[ \t]/g,'').matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].flatMap((m,i)=>{
    const st=m[1].match(/DTSTART([^:\n]*):(\d{8})T(\d{2})(\d{2})(\d{2})?Z?/),en=m[1].match(/DTEND([^:\n]*):(\d{8})T(\d{2})(\d{2})(\d{2})?Z?/);
    if(!st||!en||st[2]!==en[2])throw Error('종일·여러 날 수업은 직접 입력해 주세요.');
    if(st[0].endsWith('Z')||en[0].endsWith('Z')||st[1].includes('TZID=')&&!st[1].includes('Asia/Seoul'))throw Error('한국 시간(Asia/Seoul) 시간표를 사용해 주세요.');
    const start=st[3]+':'+st[4],end=en[3]+':'+en[4];
    if(minutes(end)<=minutes(start))throw Error('수업 종료시간을 확인해 주세요.');
    const by=m[1].match(/BYDAY=([^;\n\r]+)/)?.[1].split(',');
    const d=st[2].slice(0,4)+'-'+st[2].slice(4,6)+'-'+st[2].slice(6,8);
    const ds=by?by.map(x=>days[x]).filter(x=>x!==undefined):[weekday(d)];
    return ds.map(day=>({id:`ics-${i}-${day}-${Date.now()}`,title:m[1].match(/SUMMARY:(.*)/)?.[1].trim()||'수업',day,start,end}));
  });
}

// 월요일 시작 주간. 카드형 요약('이번 주 카드')에 쓴다.
// 여러 날 이어지는 행사는 그 주에 처음 걸치는 날 한 번만 싣는다(기간은 화면에서 함께 표시).
export function weekStart(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
export function addDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function weekGroups(events,start,from=start){// from: 이 날짜 이전에 지난 신청 마감은 싣지 않는다
  const end=addDays(start,6);
  const days=Array.from({length:7},(_,i)=>({date:addDays(start,i),events:[]}));
  for(const e of events){
    if(e.cancelled||!e.date||e.date>end||(e.endDate||e.date)<start)continue;
    const first=e.date<start?start:e.date;
    days.find(day=>day.date===first).events.push(e);
  }
  for(const day of days)day.events.sort((a,b)=>(a.start||'99').localeCompare(b.start||'99'));
  const deadlines=events.filter(e=>!e.cancelled&&e.deadline&&e.deadline>=(from>start?from:start)&&e.deadline<=end).sort((a,b)=>a.deadline.localeCompare(b.deadline));
  return {start,end,days,deadlines,count:new Set(days.flatMap(d=>d.events.map(e=>e.id))).size};
}

// 시즌 묶음 판정: 자료의 series가 우선, 없으면 제목이 처음 맞는 묶음
export function bundleOf(e,bundles){
  if(e.series&&bundles.some(b=>b.id===e.series))return e.series;
  return bundles.find(b=>b.match.test(e.title||''))?.id||'';
}

// 시간표 편집과 공강 계산
export const hhmm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
export const snapMinutes=(m,step=15)=>Math.round(m/step)*step;
export function slotOverlaps(slots,cand,ignoreId){
  return slots.filter(s=>s.id!==ignoreId&&s.day===cand.day&&minutes(s.start)<minutes(cand.end)&&minutes(cand.start)<minutes(s.end));
}
// 하루 중 수업이 없는 구간. from~to 사이에서 수업을 빼고 남은 시간을 돌려준다.
export function freeGaps(slots,day,from='08:00',to='21:00'){
  const busy=slots.filter(s=>s.day===day).map(s=>[minutes(s.start),minutes(s.end)]).sort((a,b)=>a[0]-b[0]);
  const gaps=[];let cur=minutes(from);const end=minutes(to);
  for(const [a,b] of busy){if(a>cur)gaps.push([cur,Math.min(a,end)]);cur=Math.max(cur,b);if(cur>=end)break;}
  if(cur<end)gaps.push([cur,end]);
  return gaps.filter(([a,b])=>b-a>0).map(([a,b])=>({start:hhmm(a),end:hhmm(b)}));
}
// 운영시간 [open, close]와 공강의 겹침 중 min분 이상인 것
export function windowsInGaps(gaps,open,close,min=20){
  return gaps.map(g=>({start:Math.max(minutes(g.start),minutes(open)),end:Math.min(minutes(g.end),minutes(close))})).filter(w=>w.end-w.start>=min).map(w=>({start:hhmm(w.start),end:hhmm(w.end)}));
}

// 브라우저 저장값 검증
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/,DATE=/^20\d{2}-\d{2}-\d{2}$/;
export function sanitizeSlots(raw){
  return (Array.isArray(raw)?raw:[]).filter(s=>s&&typeof s.title==='string'&&Number.isInteger(s.day)&&s.day>=0&&s.day<=6&&TIME.test(s.start)&&TIME.test(s.end)&&minutes(s.end)>minutes(s.start)).slice(0,80).map(s=>({id:String(s.id||Math.random()),title:s.title.slice(0,80),day:s.day,start:s.start,end:s.end}));
}
export function sanitizePersonal(raw){
  return (Array.isArray(raw)?raw:[]).filter(e=>e&&e.source==='manual'&&typeof e.id==='string'&&typeof e.title==='string'&&(e.date===null||DATE.test(e.date))).slice(0,200);
}

// 공지문 → 행사 초안 (붙여넣은 글자, 또는 사진에서 읽은 글자)
const clean=s=>s.replace(/(?:\+82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,'').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'').replace(/^[\s✔✅☑📌📍📅⏰•*·ㆍ▶►■□○●◆◇※>—–\p{Extended_Pictographic}️-]+/u,'').trim();
// 링크 종류: 이름표(같은 줄이나 바로 윗줄의 글)에 신청·접수·참가가 있거나 신청서 주소면 'registration'
const FORM_HOST=/(^|\.)(forms\.gle|docs\.google\.com|form\.naver\.com|naver\.me|tally\.so|typeform\.com|forms\.office\.com|forms\.microsoft\.com)$/;
export function linkKind(url,label=''){
  let host='';
  try{const u=new URL(url);if(!/^https?:$/.test(u.protocol))return 'text';host=u.hostname;if(host==='docs.google.com'&&!u.pathname.startsWith('/forms'))host='';}catch{return 'text';}
  if(/신청|접수|참가|등록|응모|예약/.test(label))return 'registration';
  if(/홍보|안내|홈페이지|소개|자세히|오픈\s*채팅|카카오|인스타|문의/.test(label))return 'info';
  return FORM_HOST.test(host)?'registration':'info';
}
// 글 속 링크와 그 이름표. 이름표는 같은 줄의 앞 글, 없으면 바로 윗줄.
export function extractLinks(text){
  const lines=text.split(/\r?\n/),out=[];
  for(const [i,line] of lines.entries())for(const m of line.matchAll(/https?:\/\/[^\s<>()"']+/g)){
    const url=m[0].replace(/[.,;:!?)\]]+$/,'');
    let label=clean(line.slice(0,m.index));
    for(let k=i-1;!label&&k>=0&&k>=i-2;k--)if(lines[k].trim()&&!/https?:\/\//.test(lines[k]))label=clean(lines[k]);
    label=label.replace(/[:：]\s*$/,'').slice(0,40);
    if(!out.some(o=>o.url===url))out.push({url,label,kind:linkKind(url,label)});
  }
  return out;
}
// 항목 찾기: '일시: …'처럼 콜론이 있으면 어디서든, 포스터처럼 콜론이 없으면 줄 맨 앞의 항목명만 본다.
// 항목명만 있고 값이 다음 줄에 있으면(사진에서 읽은 포스터) 다음 줄을 값으로 쓴다.
const LABEL=/^(?:일시|일정|장소|대상|품목|메뉴|혜택|참가\s*신청|신청\s*방법|신청\s*기간|문의)(?:\s|:|$)/;
function field(lines,names){
  const colon=new RegExp(String.raw`(?:${names})\s*:\s*(.*)$`);
  for(const [i,l] of lines.entries()){const m=l.match(colon);if(m)return (m[1].trim()||(lines[i+1]&&!LABEL.test(lines[i+1])?lines[i+1]:'')).trim();}
  const bare=new RegExp(String.raw`^[*※]?\s*(?:${names})(?:\s+(.*))?$`);
  for(const [i,l] of lines.entries()){const m=l.match(bare);if(m)return (m[1]?.trim()||(lines[i+1]&&!LABEL.test(lines[i+1])?lines[i+1]:'')).trim();}
  return '';
}
const dateParts=s=>[...s.matchAll(/(?:(20\d{2})\s*[.\/년-]\s*)?(\d{1,2})\s*[.\/월-]\s*(\d{1,2})(?:\s*일)?/g)];
const validDate=(year,month,day)=>{const s=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const d=new Date(s+'T12:00:00Z');if(d.getUTCFullYear()!==year||d.getUTCMonth()+1!==month||d.getUTCDate()!==day)throw Error('공지의 날짜를 확인해 주세요.');return s;};
const BENEFIT=/제공|증정|경품|기프티콘|상품권|간식|식사|도시락|커피|음료|피자|치킨|버거|샌드위치|김밥|다과|뷔페/;
export function parseNotice(text,year,{image=false}={}){
  text=text.replace(/일\s+시/g,'일시').replace(/일\s+정/g,'일정').replace(/장\s+소/g,'장소').replace(/대\s+상/g,'대상').replace(/품\s+목/g,'품목').replace(/혜\s+택/g,'혜택').replace(/메\s+뉴/g,'메뉴').replace(/[：]/g,':').replace(/[∼〜～]/g,'~');
  for(const word of ['학생증','학생회원','중복수령','소진','선착순','간식','중간고사','학기','과방','배부'])text=text.replace(new RegExp([...word].join('[ \\t]*'),'g'),word);
  text=text.replace(/소진[ \t]*시[ \t]*까[ \t]*지/g,'소진 시까지').replace(/(\d)[ \t]+(동|호|인)/g,'$1$2');
  if(text.length>16000)throw Error('공지문은 16,000자 이내로 붙여넣어 주세요.');
  const lines=text.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!lines.length)throw Error('공지문을 붙여넣어 주세요.');
  // 포스터 제목은 두 줄인 경우가 많다. 사진에서 읽은 글이고 둘째 줄이 항목·날짜가 아니면 이어 붙인다.
  const second=lines[1]||'';
  const twoLine=image&&second&&second.length<=40&&!LABEL.test(second)&&!/:/.test(second)&&!dateParts(second).length;
  const title=clean(twoLine?lines[0]+' '+second:lines[0]).replace(/^\[(.*)\]$/,'$1').slice(0,150);
  let schedule=field(lines,'일시|행사 일시|행사일|일자|날짜|일정');
  if(!schedule){const at=lines.findIndex(s=>dateParts(s).length&&!/신청|마감|학기/.test(s));if(at>=0)schedule=lines[at]+(lines[at+1]&&/\d{1,2}[:시]/.test(lines[at+1])?' '+lines[at+1]:'');}
  const dates=dateParts(schedule);
  // 'A ~ B'처럼 물결표로 이은 두 날짜는 기간으로 읽는다. 그 밖의 여러 날짜는 나누어 추가하도록 한다.
  const range=dates.length===2&&/~/.test(schedule.slice(dates[0].index+dates[0][0].length,dates[1].index));
  if(dates.length>1&&!range)throw Error('여러 날짜가 있는 공지는 날짜별로 나누어 추가해 주세요.');
  const explicitYear=Number(text.match(/\b(20\d{2})\b/)?.[1]||year);
  const date=dates[0]?validDate(Number(dates[0][1]||explicitYear),Number(dates[0][2]),Number(dates[0][3])):null;
  const endDate=range?validDate(Number(dates[1][1]||dates[0][1]||explicitYear),Number(dates[1][2]),Number(dates[1][3])):null;
  if(endDate&&endDate<=date)throw Error('기간의 끝 날짜를 확인해 주세요.');
  const timeText=dates.reduceRight((s,m)=>s.slice(0,m.index)+' '.repeat(m[0].length)+s.slice(m.index+m[0].length),schedule);
  const times=[...timeText.matchAll(/(?:([오전후]{2})\s*)?(\d{1,2})\s*[:시]\s*(\d{2})?(?:분)?/g)].map(m=>{let h=Number(m[2]),min=Number(m[3]||0);if(m[1]==='오후'&&h<12)h+=12;if(m[1]==='오전'&&h===12)h=0;if(h>23||min>59)throw Error('공지의 시간을 확인해 주세요.');return String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');});
  const start=times[0]||null,end=times[1]||null;
  if(start&&end&&end<=start)throw Error('종료시간은 시작시간 이후여야 합니다.');
  const location=clean(field(lines,'장소|배부 장소|진행 장소'));
  const eligibility=clean(field(lines,'대상|참여 대상|참가 대상'));
  const benefitIndex=lines.findIndex(s=>/(?:품목|메뉴|혜택|제공 품목|제공 메뉴|간식)\s*:/.test(s));
  const benefits=[];
  if(benefitIndex>=0){
    const first=lines[benefitIndex].split(':').slice(1).join(':').trim();if(first)benefits.push(first);
    for(let i=benefitIndex+1;i<lines.length&&benefits.length<6;i++){if(/안녕|감사|문의|담당|일시|장소|대상|신청|주의|학생증|우선|후순위|중복|\[/.test(lines[i]))break;benefits.push(lines[i]);}
  }else benefits.push(...lines.slice(twoLine?2:1).filter(s=>BENEFIT.test(s)&&!LABEL.test(s)&&!/https?:/.test(s)).slice(0,3));
  const benefit=benefits.map(clean).filter(Boolean).join(' · ')||'';
  // 사진에서는 로고·장식이 '*'로 읽히는 일이 잦아 '*'로 시작하는 줄을 조건으로 보지 않는다.
  const conditions=lines.filter(s=>!image&&/^\*/.test(s)||/선착순|소진 시|추첨|학생증|우선|후순위|중복수령|중복 수령/.test(s)).map(clean);
  const rule=conditions.join(' · ').slice(0,1200)||'지급 조건 미기재';
  const deadlineLine=field(lines,'사전\\s*신청\\s*(?:시간|기간|마감)|신청 마감|마감일|마감|신청 기간|신청기간|참가 신청|참가신청|접수 기간|접수기간|모집 기간');const dl=dateParts(deadlineLine).at(-1);
  const deadline=dl?validDate(Number(dl[1]||dateParts(deadlineLine)[0]?.[1]||explicitYear),Number(dl[2]),Number(dl[3])):null;
  // 마감 날짜 뒤에 시각이 있으면(예: ~11월 16일 18:00) 마감 시각으로 쓴다.
  const dlTime=dl&&deadlineLine.slice(dl.index+dl[0].length).match(/^\s*(?:\([일월화수목금토]\))?\s*(?:([오전후]{2})\s*)?(\d{1,2})\s*[:시]\s*(\d{2})?/);
  const deadlineTime=dlTime?(()=>{let h=Number(dlTime[2]);if(dlTime[1]==='오후'&&h<12)h+=12;return h<24&&Number(dlTime[3]||0)<60?String(h).padStart(2,'0')+':'+(dlTime[3]||'00'):null;})():null;
  // 신청 링크: '신청 링크: https://…'가 있으면 그것, 없으면 글 속 링크 중 신청용(이름표·신청서 주소)인 첫 링크
  const links=extractLinks(text);
  const registrationUrl=text.match(/(?:신청\s*링크|신청\s*주소)\s*:\s*(https:\/\/[^\s<>]+)/)?.[1]||links.find(l=>l.kind==='registration'&&l.url.startsWith('https://'))?.url||'';
  const registration=/사전\s*신청\s*(?:불필요|없이)|신청\s*없이/.test(text)?'none':registrationUrl||/사전\s*신청\s*(?:필수|필요)|신청\s*필수|참가\s*신청|신청\s*방법/.test(text)?'required':'unknown';
  const uncertain=[];
  if(!date)uncertain.push('행사 날짜 미기재');if(!start)uncertain.push('시작시간 미기재');
  if(!end)uncertain.push(/소진/.test(schedule)?'수량 소진 시 종료':'종료시간 미기재');
  const wd=schedule.match(/\(([일월화수목금토])\)/)?.[1];
  if(date&&wd&&'일월화수목금토'[new Date(date+'T12:00:00Z').getUTCDay()]!==wd)uncertain.push('원문 요일과 날짜가 일치하지 않음 · 날짜를 확인해 주세요');
  if(image)uncertain.push('사진에서 읽은 내용 · 숫자와 글자를 원문과 대조해 주세요');
  return {id:'',title,date,endDate,start,end,location,eligibility,benefit,category:/기프티콘|상품권|경품/.test(benefit)?'gift':/간식|음식|도시락|덮밥|버거|콜라|식사|메뉴|점심|저녁|커피|음료|피자|치킨|샌드위치|김밥|다과/.test(title+' '+benefit)?'food':'experience',rule,registration,registrationUrl,links,deadline,deadlineTime,source:'manual',sourceUrl:'',publicVerified:false,evidence:benefit,verifiedAt:koreaDate(),uncertain};
}
export function noticeId(e){let h=2166136261;for(const c of `${e.title}|${e.date}|${e.start}`)h=Math.imul(h^c.charCodeAt(0),16777619);return 'manual-'+(h>>>0).toString(16);}

export const noticeExample=`[2026-2학기 통계학과 중간고사 간식행사]
안녕하세요. 제12대 통계학과 학생회 [노을]입니다.
✔일시: 10/19 (월) 17:30~소진 시까지(선착순)
✔장소: 통계학과 과방 (25동 223호)
✔대상: 통계학과 정회원, 일반회원, 준회원
*학생증 확인 예정이며 실물 학생증 또는 온라인 학생증을 미리 준비해주셔야 합니다.
*학생회원에게 우선 배부될 예정이며 학생회원 미등록시 후순위가 됩니다.
*18:30부터는 1인당 추가로 1번씩 중복수령이 허용될 예정입니다.
✔품목:
• 🍱 제육 많이 덮밥 🍱 (40인)
• 일반 콜라 / 제로 콜라 (택 1)
(코카콜라)`;

// 체험 모드용 가상 행사(원본 seed.ts). 실제 일정이 아님을 화면에 항상 표시한다.
export function demoEvents(today=koreaDate()){
  return [
    {title:'점심 공강, 캠퍼스 토크',start:'12:00',end:'13:00',benefit:'샌드위치 + 아메리카노',location:'학생회관 라운지',rule:'참석자 전원 · 사전신청 40명',registration:'required',category:'food'},
    {title:'작게 시작하는 AI 워크숍',start:'15:00',end:'16:30',benefit:'커피 기프티콘 5천원권',location:'중앙도서관 세미나실',rule:'교육 수료 + 설문 완료 시 지급',registration:'required',category:'gift'},
    {title:'책과 함께하는 느린 오후',start:'12:30',end:'13:30',benefit:'쿠키와 음료',location:'중앙도서관',rule:'현장 선착순 30명 · 소진 시 종료',registration:'none',category:'food'},
    {title:'마음 체크인 온라인 특강',start:'17:00',end:null,benefit:'모바일 상품권 추첨',location:'온라인',rule:'참여 후 추첨 · 전원 지급 아님',registration:'unknown',category:'gift'},
  ].map((e,i)=>({...e,id:'demo-'+i,date:addDays(today,i+2),source:'notice',sourceUrl:'',eligibility:'체험용 가상 행사',evidence:'화면 체험용 가상 데이터입니다.',verifiedAt:today,demo:true,uncertain:i===3?['종료시간 미확인']:[],deadline:i<2?addDays(today,i+1):null}));
}

// ───────── 뭐 먹지: 학식 메뉴 뽑기·월드컵 ─────────
export const MEALS={breakfast:'아침',lunch:'점심',dinner:'저녁',allday:'종일'};
// 메뉴 이름에서 코너 머리말(<A코너>)과 표시 기호((#), (*))를 떼어 보기 좋게 만든다.
export const menuName=name=>String(name||'').replace(/^<[^>]*>\s*/,'').replace(/\(\s*[#*]+\s*\)/g,'').replace(/\s+/g,' ').trim();
// 값이 매겨진 메뉴만 후보로 쓴다(세미뷔페 곁들임·안내 문구·가격 없는 코너 제목은 뺀다).
export function menuCandidates(menu,{dates=[],meals=[]}={}){
  const out=[];
  for(const date of dates)for(const r of menu?.days?.[date]||[])for(const [meal,m] of Object.entries(r.meals||{})){
    if(meals.length&&!meals.includes(meal))continue;
    for(const i of m.items||[]){
      const name=menuName(i.name);
      if(!(i.price>0)||!name)continue;
      out.push({id:`${date}|${r.name}|${meal}|${name}`,name,raw:i.name,price:i.price,cafeteria:r.name,meal,mealLabel:MEALS[meal]||meal,date,hours:(m.hours||[]).filter(h=>h[0])});
    }
  }
  return out;
}
// 같은 이름은 한 번만(첫 번째를 남기고 다른 식당·날짜는 servings로 모은다).
export function uniqueMenus(list){
  const map=new Map();
  for(const c of list){const k=c.name.replace(/\s/g,'');if(map.has(k))map.get(k).servings.push(c);else map.set(k,{...c,servings:[c]});}
  return [...map.values()];
}
export function shuffle(list,rand=Math.random){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// 후보 수로 열 수 있는 가장 큰 대진(2의 거듭제곱, 최대 max강).
export function bracketSize(n,max=32){if(n<2)return 0;let s=2;while(s*2<=Math.min(n,max))s*=2;return s;}
export const roundName=n=>n===2?'결승':n===4?'4강':`${n}강`;
export function startCup(items,size,rand=Math.random){return {size,round:size,pool:shuffle(items,rand).slice(0,size),next:[],match:0,log:[],champion:null};}
export const cupPair=s=>s.champion?null:[s.pool[s.match*2],s.pool[s.match*2+1]];
export function cupChoose(s,side){
  const pair=cupPair(s);if(!pair)return s;
  const winner=pair[side?1:0],loser=pair[side?0:1];
  const log=[...s.log,{round:s.round,winner,loser}],next=[...s.next,winner];
  if(s.match+1<s.pool.length/2)return {...s,next,match:s.match+1,log};
  if(next.length===1)return {...s,next:[],log,champion:winner};
  return {...s,round:s.round/2,pool:next,next:[],match:0,log};
}
// 끼니 기본값: 10:30 전 아침, 15:00 전 점심, 19:30 전 저녁, 그 뒤는 다음 날 점심.
export function defaultMeal(nowMin){return nowMin<630?'breakfast':nowMin<900?'lunch':nowMin<1170?'dinner':'next-lunch';}

// ───────── 음식 태그: 혜택 문구에 적힌 말만 짧게 뽑는다 ─────────
const FOOD_WORDS=[['도시락','도시락'],['샌드위치','샌드위치'],['피자','피자'],['치킨','치킨'],['버거','버거'],['김밥','김밥'],['바비큐|바베큐|BBQ','바비큐'],['떡볶이','떡볶이'],['다과','다과'],['간식|새참|쿠키|베이글|팝콘|과일','간식'],['커피|아메리카노','커피'],['음료|주스|콜라','음료'],['식사|점심|저녁|런치|오찬|만찬|[Ll]unch|[Dd]inner|케이터링','식사'],['기프티콘|상품권|쿠폰','기프티콘'],['경품|에어팟|AirPods','경품'],['기념품|굿즈|티셔츠','기념품'],['상금|장려금','상금'],['무료 관람|무료 티켓|무료로 제공|전석 무료','무료 관람'],['책 나눔|책나눔|도서','책']];
export function foodTags(text,max=3){
  const s=String(text||''),hits=[];
  for(const [re,tag] of FOOD_WORDS){const m=s.match(new RegExp(re));if(m&&!hits.some(h=>h.tag===tag))hits.push({tag,at:m.index});}
  return hits.sort((a,b)=>a.at-b.at).slice(0,max).map(h=>h.tag);
}

// ───────── 지도: 장소 문구에서 관악캠퍼스 건물 찾기 ─────────
// 동 번호(301동, Building 152-1)를 먼저 보고, 없으면 첫 구간(· 앞)에서 가장 뒤에 나온 건물 이름을 고른다("행정관 앞 잔디광장" → 잔디광장).
export function placeOf(location,places){
  const s=String(location||'');if(!s)return null;
  const byNo=new Map(places.filter(p=>p.no).map(p=>[p.no,p]));
  for(const m of s.matchAll(/(?<![\d-])(\d{1,3}(?:-\d)?)\s*동|Building\s+(\d{1,3}(?:-\d)?)/gi)){const p=byNo.get(m[1]||m[2]);if(p)return p;}
  for(const part of [s.split(/\s·\s|·/)[0],s]){
    let best=null;
    for(const p of places)for(const a of p.aliases||[]){const at=part.lastIndexOf(a);if(at>=0&&(!best||at>best.at||at===best.at&&a.length>best.len))best={p,at,len:a.length};}
    if(best)return best.p;
  }
  return null;
}
export const project=(proj,lat,lon)=>[(lon-proj.lonMin)*proj.kx,(proj.latMax-lat)*proj.ky];

// ───────── 천식(학생회관식당 3,000원 메뉴) 월드컵 ─────────
// data/chunsik.json: {range:[처음,마지막], menus:[{name, served:['YYYY-MM-DD:b|l|d|a', …]}]}
export const chunsikKey=name=>String(name||'').replace(/\s/g,'');
export function chunsikMenus(data){
  return (data?.menus||[]).map(m=>{
    const served=[...m.served].sort(),meals={b:0,l:0,d:0,a:0};
    for(const s of served)meals[s.slice(11)||'a']=(meals[s.slice(11)||'a']||0)+1;
    return {id:chunsikKey(m.name),name:m.name,count:served.length,first:served[0]?.slice(0,10)||'',last:served.at(-1)?.slice(0,10)||'',meals};
  });
}
// 후보: top=많이 나온 64개, year=최근 1년 안에 나온 것, all=역대 전체
export function chunsikPool(list,mode='top',today=''){
  if(mode==='year'){const from=`${Number(today.slice(0,4))-1}${today.slice(4)}`;return list.filter(m=>m.last>=from);}
  if(mode==='top')return [...list].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ko')).slice(0,64);
  return list;
}
// 구글 시트 gviz 응답(setResponse({...}))에서 [{name,count}]를 꺼낸다.
export function parseGviz(text){
  const m=String(text||'').match(/setResponse\((\{[\s\S]*\})\);?\s*$/);if(!m)return [];
  try{return (JSON.parse(m[1]).table?.rows||[]).map(r=>({name:String(r.c?.[0]?.v??'').trim(),count:Number(r.c?.[1]?.v)||0})).filter(r=>r.name&&r.count>0);}catch{return [];}
}
// 모두의 1등: 천식 목록에 있는 이름만 모아(띄어쓰기 차이는 하나로) 많이 뽑힌 순서로.
export function tallyChampions(rows,list){
  const known=new Map(list.map(m=>[m.id,m.name])),out=new Map();
  for(const r of rows){const k=chunsikKey(r.name);if(!known.has(k))continue;out.set(k,(out.get(k)||0)+r.count);}
  return [...out].map(([id,count])=>({id,name:known.get(id),count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ko'));
}
