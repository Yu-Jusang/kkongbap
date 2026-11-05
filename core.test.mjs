import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conflict,parseICS,calendarText,closed,expired,phase,safeUrl,weekStart,weekGroups,parseNotice,noticeExample,sanitizeSlots,hhmm,snapMinutes,slotOverlaps,freeGaps,windowsInGaps,bundleOf} from './core.js';
import {BUNDLES} from './content.js';
import {labelQRCodes,qrKind} from './qr.js';
import {extractLinks} from './core.js';

// 인스타 캡션·홍보 글을 통째로 붙여넣은 경우(링크가 '▶ 이름표' 다음 줄에 오는 형식)
const SNAAC=`🍕 내가 만든 프로덕트, 투자자 앞에서 데모해볼까? (데모팀 15팀 모집)

11/16(월) 저녁, 카카오벤처스와 함께하는 SNAAC 빌더's 피자파티가 열립니다! 🍕

— 🏆 최종 선발팀에게는 AirPods 5 증정!

시상 이후 1시간 동안 피자를 먹으며 카카오벤처스, 그리고 비슷한 문제를 풀고 있는 학내 빌더들과 자유롭게 이야기 나누고, 못다 한 데모도 마음껏 보여주세요. 🍕

📍 행사 안내
일시: 11월 16일(월) 18:30
장소: 서울대학교 해동학술문화관 해동홀 (32-1동 1층 강연장)
대상: 무언가를 만들고 있는 서울대학교 재학생·휴학생 (개인/팀)
모집: 데모팀 15팀 내외 (청중 참여도 가능)

▶ 데모팀 신청
https://forms.gle/MsUoysAe4Li4dNEcA

▶ 참관자 신청
https://forms.gle/x7JcdouFEgs48avY7

▶ 피자파티 자세히 보기
https://deadpan-base-e6c.notion.site/SNAAC-X-s-3fac66680fba801b8eeece6e06ad3e81`;
test('홍보 글 통째로: 이모지 제목, 일시·장소·대상, 혜택 문장',()=>{const e=parseNotice(SNAAC,2026);assert.equal(e.title,'내가 만든 프로덕트, 투자자 앞에서 데모해볼까? (데모팀 15팀 모집)');assert.equal(e.date,'2026-11-16');assert.equal(e.start,'18:30');assert.equal(e.location,'서울대학교 해동학술문화관 해동홀 (32-1동 1층 강연장)');assert.ok(e.eligibility.startsWith('무언가를 만들고 있는'));assert.ok(e.benefit.includes('AirPods 5 증정'));assert.ok(e.benefit.includes('피자를 먹으며'));assert.equal(e.category,'food');});
test('홍보 글 통째로: 링크 이름표와 신청 링크',()=>{const l=extractLinks(SNAAC);assert.deepEqual(l.map(x=>[x.label,x.kind]),[['데모팀 신청','registration'],['참관자 신청','registration'],['피자파티 자세히 보기','info']]);assert.equal(parseNotice(SNAAC,2026).registrationUrl,'https://forms.gle/MsUoysAe4Li4dNEcA');assert.equal(parseNotice(SNAAC,2026).registration,'required');});

// 사진 속 QR코드: 위에 붙은 글자로 이름표를 달고 신청 링크인지 가린다
test('QR 이름표와 종류',()=>{
  const codes=[{text:'https://forms.gle/abc',box:{x0:30,y0:636,x1:102,y1:708}},{text:'https://sites.google.com/view/x',box:{x0:118,y0:636,x1:190,y1:708}}];
  const items=[{text:'사전신청',x0:33,y0:612,x1:97,y1:630},{text:'홍보페이지',x0:118,y0:612,x1:182,y1:630},{text:'주관: 서울대학교 사범대학',x0:20,y0:550,x1:200,y1:568}];
  const l=labelQRCodes(codes,items);
  assert.deepEqual(l.map(c=>c.label),['사전신청','홍보페이지']);
  assert.deepEqual(l.map(qrKind),['registration','info']);
  assert.equal(qrKind({text:'https://forms.gle/abc',label:''}),'registration');
  assert.equal(qrKind({text:'https://open.kakao.com/o/x',label:'신청 문의'}),'registration');
  assert.equal(qrKind({text:'WIFI:T:WPA;S:x;;',label:''}),'text');
});
test('사전신청시간의 마감 날짜와 시각',()=>{const e=parseNotice('설명회\n일시: 2026년 11월 23일(월) 12시~13시\n(사전신청시간 : ~11월 16일 18:00)',2026,{image:true});assert.equal(e.deadline,'2026-11-16');assert.equal(e.deadlineTime,'18:00');assert.equal(e.start,'12:00');assert.equal(e.end,'13:00');});

// 시간표 편집·공강·학식
test('15분 단위 맞춤과 시각 표기',()=>{assert.equal(hhmm(snapMinutes(9*60+37)),'09:30');assert.equal(hhmm(snapMinutes(9*60+38)),'09:45');});
test('같은 요일 겹치는 수업만',()=>{const s=[{id:'a',title:'A',day:1,start:'09:30',end:'10:45'},{id:'b',title:'B',day:2,start:'09:30',end:'10:45'}];assert.deepEqual(slotOverlaps(s,{day:1,start:'10:30',end:'11:00'}).map(x=>x.id),['a']);assert.equal(slotOverlaps(s,{day:1,start:'10:45',end:'11:00'}).length,0);assert.equal(slotOverlaps(s,{id:'a',day:1,start:'10:00',end:'11:00'},'a').length,0);});
test('공강 구간',()=>{const s=[{day:1,start:'09:30',end:'10:45'},{day:1,start:'11:00',end:'12:15'},{day:1,start:'14:00',end:'15:15'}];assert.deepEqual(freeGaps(s,1,'08:00','20:00'),[{start:'08:00',end:'09:30'},{start:'10:45',end:'11:00'},{start:'12:15',end:'14:00'},{start:'15:15',end:'20:00'}]);assert.deepEqual(freeGaps(s,2,'08:00','20:00'),[{start:'08:00',end:'20:00'}]);});
test('운영시간과 공강의 20분 이상 겹침',()=>{const g=[{start:'10:45',end:'11:00'},{start:'12:15',end:'14:00'}];assert.deepEqual(windowsInGaps(g,'11:00','14:30'),[{start:'12:15',end:'14:00'}]);assert.deepEqual(windowsInGaps(g,'13:45','15:00'),[]);});
test('시즌 묶음: series 우선, 없으면 제목',()=>{assert.equal(bundleOf({title:'2026년 서울대학교 건강주간 행사'},BUNDLES),'health-week');assert.equal(bundleOf({title:'건강주간 · 잔디 위 운동 프로그램'},BUNDLES),'health-week');assert.equal(bundleOf({title:'사회대 중간고사 간식행사'},BUNDLES),'snack');assert.equal(bundleOf({title:'두산DAY with 서울대 · 런치 채용설명회'},BUNDLES),'career');assert.equal(bundleOf({title:'자연대 골든벨'},BUNDLES),'join');assert.equal(bundleOf({title:'영화 단체 관람'},BUNDLES),'');assert.equal(bundleOf({title:'영화 단체 관람',series:'talk'},BUNDLES),'talk');});

// legacy/source 테스트(tests/model.test.mjs)에서 옮긴 것
const event={id:'event-1',title:'점심, 특강',date:'2026-10-19',start:'12:00',end:'13:00',benefit:'샌드위치',rule:'선착순',location:'학생회관',sourceUrl:'https://snu.ac.kr/'};
const slot=(start,end)=>[{id:'a',title:'수업',day:1,start,end}];
test('수업과 겹치는 행사',()=>assert.equal(conflict(event,slot('12:30','14:00'),0),'clash'));
test('맞닿는 시간은 이동 여유 없으면 가능',()=>assert.equal(conflict(event,slot('13:00','14:00'),0),'free'));
test('이동 여유시간을 고려',()=>assert.equal(conflict(event,slot('13:00','14:00'),15),'clash'));
test('15분 여유를 정확히 확보하면 가능',()=>assert.equal(conflict(event,slot('13:15','14:00'),15),'free'));
test('종료시간 미상은 공강으로 확정하지 않음',()=>assert.equal(conflict({...event,end:null},slot('09:00','10:00'),15),'unknown'));
test('여러 날 일정은 공강 확정 불가',()=>assert.equal(conflict({...event,endDate:'2026-10-23'},slot('09:00','10:00'),15),'unknown'));
test('시간표 없으면 미설정',()=>assert.equal(conflict(event,[],15),'unset'));
test('시간대가 없는 단순 주간 ICS 입력',()=>{const rows=parseICS('BEGIN:VEVENT\nDTSTART:20261019T090000\nDTEND:20261019T103000\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE\nSUMMARY:통계학\nEND:VEVENT');assert.deepEqual(rows.map(x=>x.day),[1,3]);assert.equal(rows[0].start,'09:00');});
test('UTC 일정을 한국 시간으로 오인하지 않음',()=>assert.throws(()=>parseICS('BEGIN:VEVENT\nDTSTART:20261019T090000Z\nDTEND:20261019T103000Z\nEND:VEVENT')));
test('캘린더 저장은 한국 시간 및 제목 이스케이프',()=>{const text=calendarText(event);assert.match(text,/TZID=Asia\/Seoul:20261019T120000/);assert.ok(text.includes('SUMMARY:점심\\, 특강'));});
test('미확인 시간으로 캘린더 생성하지 않음',()=>assert.throws(()=>calendarText({...event,end:null})));
test('안전하지 않은 링크 제외',()=>{assert.equal(safeUrl('javascript:alert(1)'),'');assert.equal(safeUrl('http://example.com'),'');});
test('행사는 진행 중이어도 모집 마감은 별도',()=>assert.equal(closed({...event,deadline:'2020-10-01'}),true));

// 상태 구분
const today='2026-11-03',noon=new Date('2026-11-03T12:00:00+09:00').getTime();
test('지난 행사는 종료',()=>assert.equal(phase(event,today,noon),'ended'));
test('날짜·기간 모두 없으면 일정 미정',()=>assert.equal(phase({...event,date:null,deadline:null},today,noon),'tbd'));
test('날짜 없는 참여형은 마감 전 신청 중, 후 종료',()=>{assert.equal(phase({...event,date:null,deadline:'2026-11-13'},today,noon),'open');assert.equal(phase({...event,date:null,deadline:'2026-10-31'},today,noon),'ended');});
test('신청 마감이 지난 예정 행사',()=>assert.equal(phase({...event,date:'2026-11-04',deadline:'2026-10-28'},today,noon),'full'));
test('여러 날 행사 기간 중은 오늘',()=>assert.equal(phase({...event,date:'2026-11-02',endDate:'2026-11-06',end:null},today,noon),'today'));
test('오늘 끝난 시간은 종료',()=>assert.equal(expired({...event,date:today,end:'11:00'},today,noon),true));
test('취소 우선',()=>assert.equal(phase({...event,date:'2026-12-01',cancelled:true},today,noon),'cancelled'));

// 주간 카드
test('주 시작은 월요일',()=>{assert.equal(weekStart('2026-11-03'),'2026-11-02');assert.equal(weekStart('2026-11-08'),'2026-11-02');});
test('주간 묶음: 여러 날 행사는 그 주 첫날에 한 번',()=>{const w=weekGroups([{...event,id:'a',date:'2026-11-04',endDate:'2026-11-06'},{...event,id:'b',date:'2026-11-10'},{...event,id:'c',date:null,deadline:'2026-11-05'}],'2026-11-02');assert.equal(w.count,1);assert.deepEqual(w.days.filter(d=>d.events.length).map(d=>d.date),['2026-11-04']);assert.equal(w.deadlines.length,1);});
test('주간 묶음: 지난주에 시작한 행사는 이번 주 월요일에',()=>{const w=weekGroups([{...event,id:'a',date:'2026-10-30',endDate:'2026-11-03'}],'2026-11-02');assert.deepEqual(w.days.filter(d=>d.events.length).map(d=>d.date),['2026-11-02']);});

// 공지 읽기
test('예시 공지 읽기',()=>{const e=parseNotice(noticeExample,2026);assert.equal(e.date,'2026-10-19');assert.equal(e.start,'17:30');assert.equal(e.end,null);assert.ok(e.location.includes('25동 223호'));assert.ok(e.uncertain.includes('수량 소진 시 종료'));assert.equal(e.category,'food');});
test('여러 날짜 공지는 거절',()=>assert.throws(()=>parseNotice('간식행사\n일시: 10/19, 10/20 12:00',2026)));
test('연락처는 지움',()=>assert.ok(!parseNotice('행사\n일시: 11/5 12:00\n장소: 학생회관 010-1234-5678',2026).location.includes('010')));
test('잘못된 저장값은 버림',()=>assert.equal(sanitizeSlots([{title:'x',day:9,start:'09:00',end:'10:00'},{title:'y',day:1,start:'10:00',end:'09:00'},{title:'z',day:1,start:'09:00',end:'10:00'}]).length,1));
test('사진 글자의 글머리 기호 정리',()=>{const e=parseNotice('간식행사\n일시: 12/10 17:30~19:00\n품목:\nㆍ 샌드위치\n■ 콜라',2026);assert.equal(e.benefit,'샌드위치 · 콜라');});

// 사진에서 읽은 포스터(실제 공지 포스터를 PaddleOCR로 읽은 결과)
const P1='2026 물리천문학부\n학부생 연구 발표회\n일시: 2026년 12월 16일(수)11:30\n장소: 서울대학교 56동 105호 및 해동홀\n대상:서울대학교 전체 학부생(*타학과(부)학생 참여가능)\n행사일정\n시상안내\n11:30 ~ 12:00 1분 발표(56동105호)\n최우수상1팀:40만원\n우수상1팀:30만원\n12:00 ~ 13:00 포스터발표(해동홀, 점심제공)\n인기상1팀:20만원\n13:00 ~ 13:10 시상\n인기상 투표 참여자 대상 경품:10만원\n(스타벽스 2만원 기프티콘 5명)\n발표 참가코드(~12/2)\n일반 참가코드(~12/8)';
const P3='2026년 서울대학교 건강주간행사 신청자 모집\n잔디 위 운동 프로그램\n2026년 건강주간 행사를 맞이하여 잔디광장에서\n다양한 운동을 즐기며 건강한 하루를 만들어보세요!\n일정 2026.11.4.(수)~11.5.(목)\n장소\n행정관 앞 잔디광장 야외무대\n맨몸 필라테스\n건강댄스\n태극권\n11:40~12:40\n13:30~14:30\n15:30~16:30\n참가신청 2026.10.21.(수)~10.28.(수)\n※한 타임당50명선착순\n신청방법\nSNU 비교과 사이트\n※참여 시 간단한 점심 제공';
const P4='2026년 서울대학교 건강주간 행사\n건강샤인 2080 걷기\n서울대학교 개교 80주년을 기념하며,\n관악캠퍼스 순환도로 3km를 함께 걸어요!\n일시 2026.11.6.(금)오후3시\n※등록확인 및 티셔츠 수령 오후 2시 반부터\n장소 잔디광장 야외무대 및 건강샤인 2080 코스\n3km걷기 코스 안내\n급수대 및 간식 제공\n경품 추첨권 배부\n야구장(행사 폐막식 및 경품행사)\n참가신청 2026.10.27.(화)~11.2.(월)\n신청방법 사전 QR코드 신청';
test('포스터: 두 줄 제목, 콜론 있는 항목',()=>{const e=parseNotice(P1,2026,{image:true});assert.equal(e.title,'2026 물리천문학부 학부생 연구 발표회');assert.equal(e.date,'2026-12-16');assert.equal(e.start,'11:30');assert.equal(e.location,'서울대학교 56동 105호 및 해동홀');assert.ok(e.eligibility.startsWith('서울대학교 전체 학부생'));assert.ok(e.benefit.includes('점심제공'));});
test('포스터: 콜론 없는 항목, 다음 줄 값, 기간, 참가신청 마감',()=>{const e=parseNotice(P3,2026,{image:true});assert.equal(e.date,'2026-11-04');assert.equal(e.endDate,'2026-11-05');assert.equal(e.location,'행정관 앞 잔디광장 야외무대');assert.equal(e.deadline,'2026-10-28');assert.ok(e.benefit.includes('간단한 점심 제공'));assert.equal(e.registration,'required');});
test('포스터: 오후 3시, 표시 없는 혜택 문장',()=>{const e=parseNotice(P4,2026,{image:true});assert.equal(e.date,'2026-11-06');assert.equal(e.start,'15:00');assert.equal(e.location,'잔디광장 야외무대 및 건강샤인 2080 코스');assert.equal(e.deadline,'2026-11-02');assert.ok(e.benefit.startsWith('급수대 및 간식 제공'));});
test('붙여넣은 글은 첫 줄만 제목',()=>assert.equal(parseNotice(noticeExample,2026).title,'2026-2학기 통계학과 중간고사 간식행사'));
test('물결표 없는 두 날짜는 거절',()=>assert.throws(()=>parseNotice('행사\n일시: 11/4, 11/6 12:00',2026)));
test('주간 묶음: 오늘 이전에 지난 신청 마감은 빼기',()=>{const w=weekGroups([{...event,id:'a',date:'2026-11-06',deadline:'2026-11-02'},{...event,id:'b',date:null,deadline:'2026-11-05'}],'2026-11-02','2026-11-03');assert.deepEqual(w.deadlines.map(e=>e.id),['b']);});
test('포스터: 두 줄 제목의 둘째 줄은 혜택이 아님',()=>{const e=parseNotice('통계학과 기말고사\n간식행사\n일정 2026.12.9.(수)~12.10.(목)17:30\n장소 25동 223호 과방\n※김밥 +컵라면 제공(하루 60명 선착순)',2026,{image:true});assert.equal(e.title,'통계학과 기말고사 간식행사');assert.equal(e.benefit,'김밥 +컵라면 제공(하루 60명 선착순)');assert.equal(e.endDate,'2026-12-10');assert.equal(e.start,'17:30');});

// 뭐 먹지·지도
import {menuName,menuCandidates,uniqueMenus,bracketSize,roundName,startCup,cupPair,cupChoose,defaultMeal,foodTags,placeOf,project} from './core.js';
const MENU={days:{'2026-11-05':[
  {name:'학생회관식당',meals:{lunch:{items:[{name:'목살김치찌개',price:6000},{name:'꽁치무조림(#)',price:3000}],hours:[['11:00','14:30']]},dinner:{items:[{name:'떡국(#)',price:3000}],hours:[['17:00','19:00']]}}},
  {name:'자하연식당 3층',meals:{lunch:{items:[{name:'<+세미뷔페>',price:null},{name:'김치전',price:null},{name:'마떡갈비구이',price:14000}],hours:[['11:30','14:00']]}}},
  {name:'예술계식당',meals:{lunch:{items:[{name:'<C코너>셀프라면, 밥, 김치',price:3000},{name:'<뷔페> 6,500원',price:null}],hours:[]}}}],
 '2026-11-06':[{name:'학생회관식당',meals:{lunch:{items:[{name:'목살김치찌개',price:6000}],hours:[['11:00','14:30']]}}}]}};
test('메뉴 이름: 코너 머리말과 표시 기호 떼기',()=>{assert.equal(menuName('꽁치무조림(#)'),'꽁치무조림');assert.equal(menuName('<C코너>셀프라면, 밥, 김치'),'셀프라면, 밥, 김치');});
test('메뉴 후보: 가격 있는 메뉴만, 끼니 고르기',()=>{
  const all=menuCandidates(MENU,{dates:['2026-11-05']});assert.deepEqual(all.map(c=>c.name),['목살김치찌개','꽁치무조림','떡국','마떡갈비구이','셀프라면, 밥, 김치']);
  assert.deepEqual(menuCandidates(MENU,{dates:['2026-11-05'],meals:['dinner']}).map(c=>c.name),['떡국']);
  const u=uniqueMenus(menuCandidates(MENU,{dates:['2026-11-05','2026-11-06']}));assert.equal(u.length,5);assert.equal(u[0].servings.length,2);});
test('월드컵: 대진 크기와 라운드 이름',()=>{assert.equal(bracketSize(1),0);assert.equal(bracketSize(5),4);assert.equal(bracketSize(40),32);assert.equal(bracketSize(40,16),16);assert.equal(roundName(2),'결승');assert.equal(roundName(16),'16강');});
test('월드컵: 8강에서 늘 왼쪽을 고르면 7경기 뒤 우승',()=>{
  let s=startCup([1,2,3,4,5,6,7,8,9],8,()=>0.5);assert.equal(s.pool.length,8);let n=0;
  while(!s.champion){const [a]=cupPair(s);s=cupChoose(s,0);n++;assert.ok(s.log.at(-1).winner===a);}
  assert.equal(n,7);assert.equal(s.log.filter(l=>l.round===8).length,4);assert.equal(s.log.at(-1).round,2);assert.equal(cupPair(s),null);});
test('끼니 기본값',()=>{assert.equal(defaultMeal(9*60),'breakfast');assert.equal(defaultMeal(12*60),'lunch');assert.equal(defaultMeal(17*60),'dinner');assert.equal(defaultMeal(20*60),'next-lunch');});
test('음식 태그: 원문에 나온 순서대로 세 개까지',()=>{
  assert.deepEqual(foodTags('샌드위치와 음료 제공 · 추첨 기프티콘'),['샌드위치','음료','기프티콘']);
  assert.deepEqual(foodTags('간단한 저녁 식사가 제공됩니다'),['식사']);
  assert.deepEqual(foodTags('참석자 전원 기념품'),['기념품']);assert.deepEqual(foodTags(''),[]);});
const PLACES=[{no:'301',name:'제1공학관',lat:37.45016,lon:126.95259},{no:'152-1',name:'롯데국제교육관',lat:37.46657,lon:126.95119,aliases:['롯데국제교육관']},{no:'60',name:'행정관',lat:37.46,lon:126.95,aliases:['행정관','본부']},{no:null,key:'lawn',name:'잔디광장',lat:37.4606,lon:126.95,aliases:['잔디광장','잔디 광장']},{no:'101',name:'아시아연구소',lat:37.46,lon:126.95,aliases:['아시아연구소']}];
test('지도: 장소 문구에서 건물 찾기',()=>{
  const at=s=>placeOf(s,PLACES)?.name??null;
  assert.equal(at('서울대학교 301동 118호 강의실'),'제1공학관');
  assert.equal(at('Rooms 207 & 208, Lotte International Education Hall (Building 152-1)'),'롯데국제교육관');
  assert.equal(at('행정관 앞 잔디광장 · 관악캠퍼스 일대 · 야구장(폐막식)'),'잔디광장');
  assert.equal(at('본부 앞 잔디 광장 인권센터 부스'),'잔디광장');
  assert.equal(at('아시아연구소 230호'),'아시아연구소');
  assert.equal(at('비대면 Zoom'),null);assert.equal(at('영등포공원'),null);assert.equal(at('3층 세미나실'),null);});
test('지도: 위도·경도를 지도 좌표로',()=>{const [x,y]=project({latMax:37.47,lonMin:126.95,kx:1000,ky:2000},37.46,126.951);assert.ok(Math.abs(x-1)<1e-9&&Math.abs(y-20)<1e-6);});

// 천식 월드컵
import {chunsikKey,chunsikMenus,chunsikPool,parseGviz,tallyChampions} from './core.js';
const CH={range:['2024-02-20','2026-11-05'],menus:[{name:'두부명란찌개',served:['2024-03-05:d','2025-09-02:d','2026-10-01:d']},{name:'단호박카레',served:['2024-03-05:b','2026-03-03:l']},{name:'쇠고기채소죽',served:['2024-02-20:b']}]};
test('천식 목록: 나온 횟수·처음·마지막·끼니',()=>{
  const l=chunsikMenus(CH);assert.equal(l[0].count,3);assert.equal(l[0].first,'2024-03-05');assert.equal(l[0].last,'2026-10-01');assert.equal(l[0].meals.d,3);assert.equal(l[1].meals.b,1);assert.equal(l[1].meals.l,1);
  const recent=chunsikMenus(CH,'2026-01-01');assert.deepEqual(recent.map(m=>[m.name,m.count,m.first]),[['두부명란찌개',1,'2026-10-01'],['단호박카레',1,'2026-03-03']]);
  assert.deepEqual(chunsikPool(l,'top').map(m=>m.name),['두부명란찌개','단호박카레','쇠고기채소죽']);assert.equal(chunsikPool(l,'all').length,3);});
test('모두의 1등: 시트 집계를 천식 이름으로만 모으기',()=>{
  const rows=parseGviz(`/*O_o*/\ngoogle.visualization.Query.setResponse({"version":"0.6","status":"ok","table":{"cols":[],"rows":[{"c":[{"v":"두부명란찌개"},{"v":3.0}]},{"c":[{"v":"두부 명란찌개"},{"v":1.0}]},{"c":[{"v":"[테스트] 연결 확인"},{"v":1.0}]},{"c":[{"v":"단호박카레"},{"v":2.0}]}]}});`);
  assert.equal(rows.length,4);
  const t=tallyChampions(rows,chunsikMenus(CH));assert.deepEqual(t.map(x=>[x.name,x.count]),[['두부명란찌개',4],['단호박카레',2]]);
  assert.deepEqual(parseGviz('oops'),[]);assert.equal(chunsikKey('두부 명란 찌개'),'두부명란찌개');});
