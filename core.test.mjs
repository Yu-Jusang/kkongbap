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
