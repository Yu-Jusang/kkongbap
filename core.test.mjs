import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conflict,parseICS,calendarText,closed,expired,phase,safeUrl,weekStart,weekGroups,parseNotice,noticeExample,sanitizeSlots} from './core.js';

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
