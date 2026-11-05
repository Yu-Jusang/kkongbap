"""관악캠퍼스 바탕 지도(data/campus.json)를 OpenStreetMap 자료로 한 번 만든다. 자동 실행하지 않는다.

1) Overpass에서 받은 자료 두 개를 준비한다.
   snu.json     : [out:json];(way["building"](37.4475,126.9390,37.4725,126.9630);way["highway"](같은 범위););out geom tags;
   outline.json : [out:json];rel(11917142);way(r);out geom;   (relation 11917142 = 서울대학교 관악캠퍼스)
2) python scripts/build_campus_map.py snu.json outline.json data/campus.json

지도 자료 © OpenStreetMap contributors (ODbL). 화면에 출처를 표시한다.
"""
import json, math, sys, pathlib

snu, outline, out = map(pathlib.Path, sys.argv[1:4])
elements = json.loads(snu.read_text(encoding='utf-8'))['elements']
rings = [e['geometry'] for e in json.loads(outline.read_text(encoding='utf-8'))['elements'] if len(e.get('geometry', [])) > 2]

# 캠퍼스 경계에 여백을 조금 두고 자른다.
lat_min, lat_max, lon_min, lon_max = 37.4465, 37.4703, 126.9468, 126.9628
lat0 = (lat_min + lat_max) / 2
W = 1000.0
ky = W / ((lon_max - lon_min) * math.cos(math.radians(lat0)))
kx = ky * math.cos(math.radians(lat0))
H = (lat_max - lat_min) * ky


def xy(p):
    return ((p['lon'] - lon_min) * kx, (lat_max - p['lat']) * ky)


def simplify(pts, tol=0.7):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-9
    far, idx = 0, 0
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm if norm > 1e-9 else math.hypot(x - x1, y - y1)
        if d > far:
            far, idx = d, i
    if far <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[:idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def inside(pts):
    return any(-30 <= x <= W + 30 and -30 <= y <= H + 30 for x, y in pts)


def path(pts, close=False):
    s = 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    return s + ('Z' if close else '')


buildings, major, minor = [], [], []
MAJOR = {'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
         'residential', 'service', 'living_street', 'unclassified', 'road'}
MINOR = {'footway', 'path', 'pedestrian', 'steps', 'cycleway', 'track'}
for e in elements:
    if e['type'] != 'way' or 'geometry' not in e:
        continue
    tags = e.get('tags', {})
    pts = [xy(p) for p in e['geometry']]
    if not inside(pts):
        continue
    if 'building' in tags:
        pts = simplify(pts, 0.4)
        if len(pts) >= 3:
            buildings.append(path(pts, True))
    elif tags.get('highway') in MAJOR:
        major.append(path(simplify(pts)))
    elif tags.get('highway') in MINOR:
        minor.append(path(simplify(pts)))

data = {
    'attribution': '지도 © OpenStreetMap contributors · 건물 위치 서울대학교 캠퍼스맵',
    'width': W, 'height': round(H, 1),
    'proj': {'latMax': lat_max, 'lonMin': lon_min, 'kx': kx, 'ky': ky},
    'outline': ''.join(path(simplify([xy(p) for p in r], 0.5), True) for r in rings),
    'buildings': ''.join(buildings),
    'major': ''.join(major),
    'minor': ''.join(minor),
}
out.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'{len(buildings)} buildings, {len(major)} roads, {len(minor)} paths, {out.stat().st_size // 1024} KB, {W:.0f}x{H:.0f}')
