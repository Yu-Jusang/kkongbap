// 확인 대상 출처(원본 source-registry.ts)와 안내 문구.

export const SOURCES=[
  {key:'biosci',name:'생명과학부',url:'https://biosci.snu.ac.kr/board/notice',kind:'notice'},
  {key:'physics',name:'물리·천문학부',url:'https://physics.snu.ac.kr/boards/notice',kind:'notice'},
  {key:'science',name:'자연과학대학',url:'https://science.snu.ac.kr/news/announcement',kind:'notice'},
  {key:'engineering',name:'공과대학',url:'https://eng.snu.ac.kr/communication/notice/notice',kind:'notice'},
  {key:'cals',name:'농업생명과학대학',url:'https://cals.snu.ac.kr/board/notice',kind:'notice'},
  {key:'education',name:'사범대학',url:'https://edu.snu.ac.kr/category/board_17_gn_ldca7if5_20201130072915/',kind:'notice'},
  {key:'humanities',name:'인문대학',url:'https://humanities.snu.ac.kr/community/notice',kind:'notice'},
  {key:'social',name:'사회과학대학',url:'https://social.snu.ac.kr/공지사항/?mod=list',kind:'notice'},
  {key:'statistics',name:'통계학과',url:'https://stat.snu.ac.kr/category/board-18-gn-969abdbt-20210204013659/',kind:'notice'},
  {key:'snuti',name:'첨단융합학부',url:'https://snuti.snu.ac.kr/category/board-215-GN-IWAuloKV-20230830171309/',kind:'notice'},
  {key:'general',name:'서울대학교 대표 공지',url:'https://www.snu.ac.kr/snunow/notice/genernal',kind:'notice'},
  {key:'college',name:'학부대학',url:'https://snuc.snu.ac.kr/공지사항/',kind:'notice'},
  ...['snu_cns','snu.eng_official','snucals_stuco','ed_u_snu','humanities_snu','snucss_official'].map((handle,i)=>({key:'ig_'+handle.replaceAll('.','_'),name:['자연대 학생회','공대 학생회','농생대 학생회','사범대 학생회','인문대 학생회','사회대 학생회'][i],url:`https://www.instagram.com/${handle}/`,kind:'instagram'})),
];
// 시즌 묶음: 제목으로 묶고, 행사 자료에 series가 있으면 그것을 따른다. 위에서부터 먼저 맞는 묶음 하나에 넣는다.
export const BUNDLES=[
  {id:'health-week',title:'2026 서울대 건강주간',short:'건강주간',desc:'학생처 장학복지과 건강주간(11월 4~6일) 프로그램',match:/건강주간/},
  {id:'snack',title:'학생회 간식행사',short:'간식행사',desc:'중간·기말고사 기간을 비롯한 단과대·학과 학생회 간식 배부',match:/간식행사|간식 배부/},
  {id:'career',title:'채용설명회·진로 행사',short:'채용·진로',desc:'기업 설명회·상담회와 진로 행사의 식사·쿠폰·추첨',match:/채용|커리어|campus talk|진로/i},
  {id:'talk',title:'특강·발표회',short:'특강·발표',desc:'특강과 발표회에서 주는 식사·간식·경품',match:/특강|강연|발표회|토크/},
  {id:'join',title:'공모전·퀴즈·설문 참여',short:'참여 이벤트',desc:'수상·추첨·참여 인증으로 상금이나 기프티콘을 주는 행사',match:/공모전|골든벨|베타테스트|설문|조사|진단검사|이벤트/},
];
// 학식: 생협 식단 페이지(2026-11-03 화요일)에 적힌 운영시간. 메뉴는 가져오지 않고 공식 페이지로 안내한다.
// 형식: [구분, 시작, 끝(원문에 없으면 null), 참고]. 요일·학기·방학에 따라 바뀔 수 있다.
export const MENU_URL='https://snuco.snu.ac.kr/foodmenu/';
export const MENU_CHECKED='2026-11-03';
export const CAFETERIAS=[
  {name:'학생회관식당',meals:[['아침','08:00','10:00'],['점심','11:00','14:30','혼잡 11:50~12:20'],['저녁','17:00','19:00']]},
  {name:'자하연식당 2층',meals:[['점심','11:30','14:00','혼잡 11:50~12:30'],['저녁','17:00','18:30','혼잡 17:50~18:20']]},
  {name:'자하연식당 3층',meals:[['점심','11:30','14:00','혼잡 11:30~12:30 · 세미뷔페']]},
  {name:'예술계식당',meals:[['점심','11:30','14:00','B코너는 13:00까지'],['저녁','17:00','18:30']]},
  {name:'두레미담',meals:[['점심','11:00','14:00','혼잡 12:00~12:30'],['저녁','17:00','19:00']]},
  {name:'동원관식당',meals:[['점심','11:00','14:00','혼잡 11:30~12:10']]},
  {name:'기숙사식당',meals:[['점심','11:30','13:30'],['저녁','17:30','19:00']]},
  {name:'3식당',meals:[['점심','11:00','14:00','혼잡 11:50~12:20']]},
  {name:'302동식당',meals:[['점심','11:30','13:30','혼잡 11:50~12:20'],['저녁','17:00','18:30']]},
  {name:'301동식당',meals:[['천원의 아침밥','08:20',null,'준비 수량 소진 시까지 · 학생증 지참 · 테이크아웃'],['점심','11:30','13:30','1층 교직원식당은 학생 12:15~13:30'],['테이크아웃','10:30','16:00']]},
  {name:'버거운버거',meals:[['운영','09:00','20:00','학기 중 평일·주말 · 라스트오더 19:40']],weekend:true},
  {name:'공대간이식당',meals:[['운영','11:00','18:30']]},
];
// 제보 구글 폼(로그인 없이 응답, 응답은 운영자만 본다). 미리 채우기용 질문 번호.
export const TIP_FORM={
  url:'https://docs.google.com/forms/d/e/1FAIpQLScQERykaPcm0gTkBKBiFoXujGY8-f011gSyMnaSuJy8mPWR5g/viewform',
  entries:{source:'entry.1784636216',event:'entry.1698881833',when:'entry.828020470',where:'entry.529625629',benefit:'entry.897347585',conditions:'entry.1454505297',registration:'entry.2132672893',notes:'entry.828285216'},
};
export const SOURCE_LABEL={notice:'학교 공지',instagram:'학생회 인스타',tip:'제보 확인',manual:'직접 추가',gmail:'메일'};
export const CHECK_LABEL={ok:'본문 접근 확인',browser_only:'브라우저 확인 · 자동수집 제한',blocked:'접근 제한',pending:'확인 대기',error:'수집 오류'};
export const CATEGORY={food:'음식·음료',gift:'기프티콘·경품',experience:'체험·기타'};
export const REGISTRATION={required:'필요',none:'불필요',unknown:'확인 필요'};
