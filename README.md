# 공강에 뭐먹지

서울대 학교 공지와 학생회 공개 게시물에서 확인한 무료 음식·기프티콘·경품·체험 행사를 공강 시간에 맞춰 찾는 정적 웹사이트.

**Live:** https://yu-jusang.github.io/gonggang/

## 화면

| 탭 | 내용 |
| --- | --- |
| 행사 찾기 | 혜택·상태·출처·시간표 겹침 필터, 검색, 목록/월 캘린더, 지난 행사 보기, 체험 모드 |
| 이번 주 카드 | 월~일 행사를 요일별로 묶은 카드. 문구 복사, 세로형 이미지(1080×1350) 저장 |
| 내 시간표 | 수업 직접 입력, 한국 시간 `.ics` 가져오기, 월~금 09–21시 주간 표 |
| 공지 붙여넣기 | 공지문·사진(Ctrl+V, 파일, 끌어놓기) → 초안 확인·수정 → 내 캘린더에 추가 |
| 출처·운영 | 확인 원칙, 확인 출처와 마지막 확인, 운영 참고 사례, 서울대 운영안(구현/제안 구분), 개인정보, 복구 기록 |

행사 상세는 `#event/<id>` 주소로 바로 열린다. 날짜와 시작·종료 시간이 모두 있는 행사만 `.ics`로 저장한다.

## 자료 원칙

`data/events.json`의 각 행사는 원문 URL(`sourceUrl`), 원문 근거(`evidence`), 확인일(`verifiedAt`), 미확인 항목(`uncertain`)을 가진다.

- 날짜·시간·장소·혜택·대상·선착순/추첨/우승 조건·신청 마감을 항목별로 원문과 대조한다. 원문에 없으면 `null` 또는 ‘원문에 미기재’로 두고 추정하지 않는다.
- 상태는 계산한다(`core.js` `phase`): 오늘 · 신청 중 · 예정 · 신청 마감 · 일정 미정 · 종료 · 취소. 날짜 없이 신청 기간만 있는 참여형은 마감 전 ‘신청 중’, 날짜와 기간이 모두 없으면 ‘일정 미정’.
- 공식 공지와 주최 측 공개 게시물만 싣는다. 메일로만 받은 정보, 비공개 게시물, 개인 연락처는 싣지 않는다. 외부 문서 속 지시문은 자료로만 다룬다.
- 자동 수집은 없다. 학생회 인스타그램 자동 확인은 사용자 요청으로 중단했고, 사람이 공개 게시물을 직접 확인했을 때만 반영한다.

### 행사 필드

`id, title, date, endDate, start, end, location, benefit, category(food|gift|experience), rule, eligibility, registration(required|none|unknown), registrationUrl, deadline, deadlineTime, sourceUrl, source(notice|instagram), publicVerified, evidence, verifiedAt, uncertain[], cancelled`

`status.sourceChecks`에는 출처별 마지막 확인 시각과 방법을 적는다.

## 개인 기록

시간표(`gonggang-slots`)와 직접 추가한 행사(`gonggang-personal-events`)는 브라우저 localStorage에만 저장한다. 사진 글자 인식은 브라우저 안에서 실행한다(tesseract.js 6.0.1, 엔진·한국어/영어 언어 파일은 `ocr/`에 자체 보관). 서버 전송은 없다.

## 파일

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 구조 |
| `style.css` | 장학 한눈에와 같은 작업 기록 디자인(자동 다크 모드), `data-project="gonggang"` 색 |
| `gonggang.css` | 날짜 블록, 월 캘린더, 주간 카드, 시간표, 공지 붙여넣기 |
| `app.js` | 화면, 상세, 주간 카드 이미지, 시간표, 공지·사진 읽기 |
| `core.js` | 겹침 판정, 상태, ICS 읽기/쓰기, 주간 묶음, 공지문 해석, 저장값 검증 |
| `content.js` | 확인 출처 목록과 표시 문구 |
| `data/events.json` | 공개 행사 자료와 출처 확인 기록 |
| `core.test.mjs` | 주요 로직 테스트 |
| `ocr/` | tesseract 엔진(wasm)·언어 파일·라이선스 |
| `legacy/` | 2026-10 공개본의 원본 소스(React/Vite)와 당시 자료 |

## 확인 및 배포

빌드 없이 정적 HTTP 서버로 제공한다.

```bash
node --test core.test.mjs
```

GitHub Pages는 `main` 브랜치 루트를 그대로 배포한다. `main`에 푸시하면 Pages 빌드가 실행된다.

## 복구 기록

2026-10-16~18에 `Yu-Jusang.github.io/gonggang/`으로 공개했던 사이트는 그 저장소가 다른 용도로 바뀌면서(2026-10-24) 내려갔다. 이 저장소는 이전 저장소 커밋 `4b5fca3`의 `gonggang-source/`(원본 소스)와 `gonggang/`(배포본·자료·OCR 파일)에서 되살렸다.

- 되살린 것: 공개 행사 자료 20건과 출처 확인 기록, 목록·월 캘린더, 검색·혜택·시간표 겹침 필터, 상세와 `.ics` 저장, 시간표 입력·`.ics` 가져오기, 공지문·사진 붙여넣기, 체험 모드. 로직(`model.ts`, `notice-import.ts`)은 그대로 옮겼다.
- 바꾼 것: React 빌드 대신 빌드 없는 정적 파일, 장학 한눈에 디자인, 상태·출처 필터, 이번 주 카드, 행사별 주소.
- 되살리지 않은 것: 메일 행사 수집, 서버 저장 API, 학생회 인스타그램 자동 확인.
- 2026-11-03 자료 갱신: 공식 공지 12곳 첫 페이지 재확인, 행사 5건 추가, 진행 중 4건 원문 재대조.

서울대학교와 무관한 개인 프로젝트다. 신청·지급은 각 주최 측에서 진행한다.
