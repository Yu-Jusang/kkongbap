"""서울대 생협 식단(https://snuco.snu.ac.kr/foodmenu/)을 읽어 data/menu.json으로 정리한다.

GitHub Actions(.github/workflows/menu.yml)가 하루 세 번 실행한다. 오늘부터 7일 치를 1초 간격으로 한 번씩 읽고,
식단 내용이 바뀌었을 때만 파일을 다시 쓴다. 오늘 학생회관식당의 3,000원 메뉴(천식)는 data/chunsik.json에 쌓는다.
표준 라이브러리만 쓴다.

    python scripts/fetch_menu.py                 # 실제 페이지
    python scripts/fetch_menu.py --html page.html --date 2026-11-04   # 저장한 페이지로 시험
"""
import argparse
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

SOURCE = "https://snuco.snu.ac.kr/foodmenu/"
OUT = Path(__file__).resolve().parent.parent / "data" / "menu.json"
KST = dt.timezone(dt.timedelta(hours=9))
UA = "kkongbap-menu/1.0 (+https://yu-jusang.github.io/kkongbap/)"
MEALS = ("breakfast", "lunch", "dinner")


class MenuTable(HTMLParser):
    """table.menu-table의 tbody 행을 [식당, 아침, 점심, 저녁] 문자열로 모은다. <br>은 줄바꿈."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0  # menu-table 안의 table 깊이
        self.in_body = False
        self.rows, self.row, self.cell = [], None, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table":
            if self.depth or "menu-table" in (a.get("class") or "").split():
                self.depth += 1
        if not self.depth:
            return
        if tag == "tbody":
            self.in_body = True
        elif tag == "tr" and self.in_body:
            self.row = []
        elif tag == "td" and self.row is not None:
            self.cell = []
        elif tag == "br" and self.cell is not None:
            self.cell.append("\n")

    def handle_endtag(self, tag):
        if not self.depth:
            return
        if tag == "td" and self.cell is not None:
            self.row.append("".join(self.cell))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if len(self.row) >= 4:
                self.rows.append(self.row[:4])
            self.row = None
        elif tag == "tbody":
            self.in_body = False
        elif tag == "table":
            self.depth -= 1

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


TIME = r"(\d{1,2})\s*:\s*(\d{2})"
HOURS = re.compile(rf"운영시간\s*:?\s*{TIME}\s*~\s*{TIME}")
HOURS_H = re.compile(r"운영시간\s*:?.*?(\d{1,2})\s*~\s*(\d{1,2})\s*시")  # '09 ~ 20시'
OPEN_ONLY = re.compile(rf"^{TIME}\s*~\s*(?!\s*\d)")  # '08:20~준비수량 소진시까지'
CROWD = re.compile(rf"혼잡시간\s*:?\s*{TIME}\s*~\s*{TIME}")
PRICE = re.compile(r"^(.*?)\s*[:=]\s*([\d,]+)\s*원$")  # '메뉴 : 6,000원', '세트 - … = 16,700원'


def hm(h, m="00"):
    return f"{int(h):02d}:{int(m):02d}"


def parse_cell(text):
    lines = [re.sub(r"\s+", " ", l).strip() for l in html.unescape(text).replace("\xa0", " ").split("\n")]
    lines = [l for l in lines if l]
    meal = {"items": [], "notes": [], "hours": [], "crowd": []}
    for line in lines:
        info = line.lstrip("※*").strip()
        if line.startswith("※") or OPEN_ONLY.match(info):
            if m := HOURS.search(info):
                meal["hours"].append([hm(m[1], m[2]), hm(m[3], m[4])])
            elif m := HOURS_H.search(info):
                meal["hours"].append([hm(m[1]), hm(m[2])])
            elif m := OPEN_ONLY.match(info):
                meal["hours"].append([hm(m[1], m[2]), None])
            if m := CROWD.search(info):
                meal["crowd"].append([hm(m[1], m[2]), hm(m[3], m[4])])
            meal["notes"].append(info)
            continue
        if m := PRICE.match(line):
            meal["items"].append({"name": m[1].strip(), "price": int(m[2].replace(",", ""))})
        else:
            meal["items"].append({"name": line, "price": None})
    return meal if (meal["items"] or meal["notes"]) else None


def parse_page(page):
    table = MenuTable()
    table.feed(page)
    out = []
    for title, *cells in table.rows:
        name = re.sub(r"\s*\([\d\-\s]+\)\s*$", "", html.unescape(title).strip()).lstrip("* ").strip()
        meals = {k: v for k, v in zip(MEALS, map(parse_cell, cells)) if v}
        if len(meals) > 1 and all(v == next(iter(meals.values())) for v in meals.values()):
            meals = {"allday": next(iter(meals.values()))}  # 아침·점심·저녁 칸에 같은 메뉴판을 되풀이한 식당
        if name and meals:
            out.append({"name": name, "meals": meals})
    return out


CHUNSIK = OUT.parent / "chunsik.json"
CHEAP_NAME = re.compile(r"^(.*?)\s*3,?000\s*원?$")  # 2024년 식단은 '쇠고기채소죽 3,000원'처럼 이름 뒤에 값이 붙어 있다
MEAL_CODE = {"breakfast": "b", "lunch": "l", "dinner": "d", "allday": "a"}
# 식단 원문에 한두 번 나온 맞춤법 오타. 같은 메뉴로 합친다.
TYPOS = [("복음", "볶음"), ("찍개", "찌개"), ("스크림블", "스크램블"), ("국백박", "국백반"), ("가지미", "가자미"), ("숙부볶음", "숙주볶음"), ("바칠강정", "바칠리강정")]


def chunsik_items(rows):
    """학생회관식당의 3,000원 메뉴(학생들이 '천식'이라 부르는 메뉴)를 (끼니 코드, 이름)으로 모은다."""
    out = []
    for r in rows:
        if not r["name"].startswith("학생회관"):
            continue
        for meal, m in r["meals"].items():
            for i in m["items"]:
                name = i["name"]
                if i["price"] != 3000:
                    cheap = CHEAP_NAME.match(name)
                    if i["price"] is not None or not cheap:
                        continue
                    name = cheap[1]
                name = re.sub(r"[(\[]\s*[#*]+\s*[)\]]", "", name).strip()
                if len(name) >= 3 and name[-1] == name[-2]:  # 식단 원문의 오타('청국장찌개개')
                    name = name[:-1]
                for typo, fix in TYPOS:
                    name = name.replace(typo, fix)
                if name:
                    out.append((MEAL_CODE.get(meal, "a"), name))
    return out


def update_chunsik(days, today, path=CHUNSIK):
    """지난 날짜(오늘 포함)의 천식을 data/chunsik.json에 쌓는다. 같은 날 같은 끼니는 한 번만 센다."""
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"source": SOURCE, "menus": []}
    menus = {re.sub(r"\s", "", m["name"]): m for m in data["menus"]}
    changed = False
    for date, rows in sorted(days.items()):
        if date > today:
            continue
        for meal, name in chunsik_items(rows):
            m = menus.setdefault(re.sub(r"\s", "", name), {"name": name, "served": []})
            if f"{date}:{meal}" not in m["served"]:
                m["served"].append(f"{date}:{meal}")
                m["served"].sort()
                changed = True
    if changed:
        data["menus"] = sorted(menus.values(), key=lambda m: (-len(m["served"]), m["name"]))
        served = [s[:10] for m in data["menus"] for s in m["served"]]
        data["range"] = [min(served), max(served)]
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return changed


def fetch(date):
    req = urllib.request.Request(f"{SOURCE}?date={date}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", help="저장한 식단 페이지로 시험")
    ap.add_argument("--date", help="--html과 함께 쓰는 날짜(YYYY-MM-DD)")
    ap.add_argument("--days", type=int, default=7)
    args = ap.parse_args()
    if args.html:
        print(json.dumps(parse_page(Path(args.html).read_text(encoding="utf-8")), ensure_ascii=False, indent=1))
        return
    today = dt.datetime.now(KST).date()
    days, failed = {}, []
    for i in range(args.days):
        date = (today + dt.timedelta(days=i)).isoformat()
        try:
            days[date] = parse_page(fetch(date))
        except Exception as e:  # 한 날짜가 실패해도 나머지는 저장한다
            failed.append(f"{date}: {e}")
        time.sleep(1)
    if update_chunsik(days, today.isoformat()):
        print("천식 목록 갱신")
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    if not any(days.values()):
        print("식단을 하나도 읽지 못해 기존 파일을 유지합니다.", *failed, sep="\n", file=sys.stderr)
        sys.exit(1 if failed else 0)
    # 이미 지난 날짜는 버리고, 이번에 못 읽은 날짜는 예전 값을 둔다.
    merged = {d: v for d, v in old.get("days", {}).items() if d >= today.isoformat()}
    merged.update({d: v for d, v in days.items() if v or d not in merged})
    if merged == old.get("days"):
        print("변경 없음")
        return
    data = {"source": SOURCE, "fetchedAt": dt.datetime.now(KST).isoformat(timespec="minutes"), "days": dict(sorted(merged.items()))}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"저장: {', '.join(f'{d} {len(v)}곳' for d, v in data['days'].items())}")
    for f in failed:
        print("실패", f, file=sys.stderr)


if __name__ == "__main__":
    main()
