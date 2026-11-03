// 공강에 뭐먹지 — 화면과 무관한 계산(겹침 판정, 행사 상태, ICS, 공지 읽기).
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
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Gonggang//SNU Events//KO','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+e.id+'@gonggang','DTSTAMP:'+stamp.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;TZID=Asia/Seoul:'+at(e.start),'DTEND;TZID=Asia/Seoul:'+at(e.end),'SUMMARY:'+esc(e.title),'LOCATION:'+esc(e.location),'DESCRIPTION:'+esc(e.benefit+' / '+e.rule+'\n'+(e.sourceUrl||'')),'END:VEVENT','END:VCALENDAR'].join('\r\n');
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
export function weekGroups(events,start){
  const end=addDays(start,6);
  const days=Array.from({length:7},(_,i)=>({date:addDays(start,i),events:[]}));
  for(const e of events){
    if(e.cancelled||!e.date||e.date>end||(e.endDate||e.date)<start)continue;
    const first=e.date<start?start:e.date;
    days.find(day=>day.date===first).events.push(e);
  }
  for(const day of days)day.events.sort((a,b)=>(a.start||'99').localeCompare(b.start||'99'));
  const deadlines=events.filter(e=>!e.cancelled&&e.deadline&&e.deadline>=start&&e.deadline<=end).sort((a,b)=>a.deadline.localeCompare(b.deadline));
  return {start,end,days,deadlines,count:new Set(days.flatMap(d=>d.events.map(e=>e.id))).size};
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
const clean=s=>s.replace(/(?:\+82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,'').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'').replace(/^[\s✔✅☑📌📍📅⏰•*·ㆍ▶►■□○●◆◇※>-]+/u,'').trim();
const line=(text,names)=>text.match(new RegExp('(?:'+names+')\\s*[:：]\\s*([^\\n]+)'))?.[1]?.trim()||'';
const dateParts=s=>[...s.matchAll(/(?:(20\d{2})\s*[.\/년-]\s*)?(\d{1,2})\s*[.\/월-]\s*(\d{1,2})(?:\s*일)?/g)];
const validDate=(year,month,day)=>{const s=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const d=new Date(s+'T12:00:00Z');if(d.getUTCFullYear()!==year||d.getUTCMonth()+1!==month||d.getUTCDate()!==day)throw Error('공지의 날짜를 확인해 주세요.');return s;};
export function parseNotice(text,year){
  text=text.replace(/일\s+시/g,'일시').replace(/장\s+소/g,'장소').replace(/대\s+상/g,'대상').replace(/품\s+목/g,'품목').replace(/혜\s+택/g,'혜택').replace(/메\s+뉴/g,'메뉴').replace(/[：]/g,':');
  for(const word of ['학생증','학생회원','중복수령','소진','선착순','간식','중간고사','학기','과방','배부'])text=text.replace(new RegExp([...word].join('[ \\t]*'),'g'),word);
  text=text.replace(/소진[ \t]*시[ \t]*까[ \t]*지/g,'소진 시까지').replace(/(\d)[ \t]+(동|호|인)/g,'$1$2');
  if(text.length>16000)throw Error('공지문은 16,000자 이내로 붙여넣어 주세요.');
  const lines=text.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!lines.length)throw Error('공지문을 붙여넣어 주세요.');
  const title=clean(lines[0]).replace(/^\[(.*)\]$/,'$1').slice(0,150);
  let schedule=line(text,'일시|행사 일시|행사일|일자|날짜');
  if(!schedule){const at=lines.findIndex(s=>dateParts(s).length&&!/신청|마감|학기/.test(s));if(at>=0)schedule=lines[at]+(lines[at+1]&&/\d{1,2}[:시]/.test(lines[at+1])?' '+lines[at+1]:'');}
  const dates=dateParts(schedule);
  if(dates.length>1)throw Error('여러 날짜가 있는 공지는 날짜별로 나누어 추가해 주세요.');
  const explicitYear=Number(text.match(/\b(20\d{2})\b/)?.[1]||year);
  const date=dates[0]?validDate(Number(dates[0][1]||explicitYear),Number(dates[0][2]),Number(dates[0][3])):null;
  const times=[...schedule.matchAll(/(?:([오전후]{2})\s*)?(\d{1,2})\s*[:시]\s*(\d{2})?(?:분)?/g)].map(m=>{let h=Number(m[2]),min=Number(m[3]||0);if(m[1]==='오후'&&h<12)h+=12;if(m[1]==='오전'&&h===12)h=0;if(h>23||min>59)throw Error('공지의 시간을 확인해 주세요.');return String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');});
  const start=times[0]||null,end=times[1]||null;
  if(start&&end&&end<=start)throw Error('종료시간은 시작시간 이후여야 합니다.');
  const location=clean(line(text,'장소|배부 장소|진행 장소'));
  const eligibility=clean(line(text,'대상|참여 대상|참가 대상'));
  const benefitIndex=lines.findIndex(s=>/(?:품목|메뉴|혜택|제공 품목|제공 메뉴|간식)\s*[:：]/.test(s));
  const benefits=[];
  if(benefitIndex>=0){
    const first=lines[benefitIndex].split(/[:：]/).slice(1).join(':').trim();if(first)benefits.push(first);
    for(let i=benefitIndex+1;i<lines.length&&benefits.length<6;i++){if(/안녕|감사|문의|담당|일시|장소|대상|신청|주의|학생증|우선|후순위|중복|\[/.test(lines[i]))break;benefits.push(lines[i]);}
  }
  const benefit=benefits.map(clean).filter(Boolean).join(' · ')||'';
  const conditions=lines.filter(s=>/^\*/.test(s)||/선착순|소진 시|추첨|학생증|우선|후순위|중복수령|중복 수령/.test(s)).map(clean);
  const rule=conditions.join(' · ').slice(0,1200)||'지급 조건 미기재';
  const deadlineLine=line(text,'신청 마감|마감일|마감|신청 기간|신청기간');const dl=dateParts(deadlineLine).at(-1);
  const deadline=dl?validDate(Number(dl[1]||explicitYear),Number(dl[2]),Number(dl[3])):null;
  const registrationUrl=text.match(/(?:신청\s*링크|신청\s*주소)\s*[:：]\s*(https:\/\/[^\s<>]+)/)?.[1]||'';
  const registration=/사전\s*신청\s*(?:불필요|없이)|신청\s*없이/.test(text)?'none':registrationUrl||/사전\s*신청\s*(?:필수|필요)|신청\s*필수/.test(text)?'required':'unknown';
  const uncertain=[];
  if(!date)uncertain.push('행사 날짜 미기재');if(!start)uncertain.push('시작시간 미기재');
  if(!end)uncertain.push(/소진/.test(schedule)?'수량 소진 시 종료':'종료시간 미기재');
  const wd=schedule.match(/\(([일월화수목금토])\)/)?.[1];
  if(date&&wd&&'일월화수목금토'[new Date(date+'T12:00:00Z').getUTCDay()]!==wd)uncertain.push('원문 요일과 날짜가 일치하지 않음 · 날짜를 확인해 주세요');
  return {id:'',title,date,start,end,location,eligibility,benefit,category:/기프티콘|상품권|경품/.test(benefit)?'gift':/간식|음식|도시락|덮밥|버거|콜라|식사|메뉴/.test(title+' '+benefit)?'food':'experience',rule,registration,registrationUrl,deadline,source:'manual',sourceUrl:'',publicVerified:false,evidence:benefit,verifiedAt:koreaDate(),uncertain};
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
