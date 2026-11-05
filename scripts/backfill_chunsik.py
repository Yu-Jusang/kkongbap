"""지난 생협 식단에서 천식(학생회관식당 3,000원 메뉴)을 모아 data/chunsik.json을 처음 만든다. 손으로 한 번만 실행한다.

생협 식단 페이지는 2024년 2월 식단부터 날짜별로 볼 수 있다. 하루에 한 번씩 1.2초 간격으로 읽는다(약 1,000일 ≈ 20분).
읽은 학생회관식당 칸은 --cache(JSON Lines)에 남겨 두어, 끊겼다가 다시 실행해도 이어서 읽는다.
그 뒤로는 fetch_menu.py가 매일 오늘 천식을 더한다.

    python scripts/backfill_chunsik.py --from 2024-02-07 --to 2026-11-06 --cache hall.jsonl
"""
import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_menu as fm  # noqa: E402


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", required=True)
    ap.add_argument("--to", dest="end", required=True)
    ap.add_argument("--cache", required=True)
    args = ap.parse_args()
    cache = Path(args.cache)
    seen = {json.loads(l)["date"]: json.loads(l)["hall"] for l in cache.read_text(encoding="utf-8").splitlines()} if cache.exists() else {}
    d, end = dt.date.fromisoformat(args.start), dt.date.fromisoformat(args.end)
    with cache.open("a", encoding="utf-8") as f:
        while d <= end:
            iso = d.isoformat()
            if iso not in seen:
                try:
                    hall = [r for r in fm.parse_page(fm.fetch(iso)) if r["name"].startswith("학생회관")]
                    seen[iso] = hall
                    f.write(json.dumps({"date": iso, "hall": hall}, ensure_ascii=False) + "\n")
                except Exception as e:
                    print("실패", iso, e, file=sys.stderr)
                time.sleep(1.2)
            d += dt.timedelta(days=1)
    fm.update_chunsik(seen, args.end)
    data = json.loads(fm.CHUNSIK.read_text(encoding="utf-8"))
    print(f"천식 {len(data['menus'])}개, {data['range'][0]}~{data['range'][1]}")


if __name__ == "__main__":
    main()
