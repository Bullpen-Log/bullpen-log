#!/bin/bash
# 맥에 연결한 아이폰(맥에서 깐 개발용 앱)의 현장 기록을 가져온다 — 앱이 측정 중 장면을 1분 조각(H.264 30Mbps)으로
# Documents/lab/<세션 시각>/ 에 남긴다(DualCameraPlugin.swift LabRecorder). 받는 곳 ~/bullpen-velocity-lab/device/<세션>/(저장소 밖).
# 이미 받은 파일은 건너뛴다. 받은 뒤 공 찾기 시험대에 돌려 폰이 낸 알림(events.jsonl)과 나란히 보인다.
#   scripts/velocity-lab/pull-device.sh            (케이블이든 같은 와이파이든 — 짝 맺은 폰이 하나면 그것)
#   DEVICE=<UDID> scripts/velocity-lab/pull-device.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
APP=com.bullpenlog.app
DEV="${DEVICE:-$(xcrun devicectl list devices 2>/dev/null | awk '/physical/ && !/unavailable/ {for (i=1;i<=NF;i++) if ($i ~ /^[0-9A-F]{8}-/) {print $i; exit}}')}"
[ -n "$DEV" ] || { echo "연결된 아이폰이 없어요(케이블 또는 같은 와이파이 · 잠금 풀기)."; exit 1; }
DEST="$HOME/bullpen-velocity-lab/device"
mkdir -p "$DEST"
LIST="$(mktemp)"
xcrun devicectl device info files --device "$DEV" --domain-type appDataContainer --domain-identifier "$APP" \
  --subdirectory Documents/lab --recurse --json-output "$LIST" >/dev/null 2>&1 || { echo "폰에 현장 기록이 아직 없어요 — 맥에서 깐 개발용 앱으로 측정 화면을 열고 측정을 시작하면 생겨요."; exit 1; }
python3 - "$LIST" > "$LIST.txt" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
for f in d.get("result", {}).get("files", []):
    p = f.get("relativePath") or f.get("name") or ""
    if (f.get("resources") or {}).get("isDirectory") or not p:
        continue
    # 목록의 자리는 lab 기준이거나 앱 폴더 기준이다 — lab 기준으로 맞춘다
    for pre in ("Documents/lab/", "lab/"):
        if p.startswith(pre):
            p = p[len(pre):]
    print(p)
PY
n=0
while read -r rel; do
  [ -n "$rel" ] || continue
  out="$DEST/$rel"
  case "$rel" in *.jsonl|*.json) ;; *) [ -s "$out" ] && continue ;; esac
  mkdir -p "$(dirname "$out")"
  xcrun devicectl device copy from --device "$DEV" --domain-type appDataContainer --domain-identifier "$APP" \
    --source "Documents/lab/$rel" --destination "$out" >/dev/null 2>&1 && n=$((n + 1)) || echo "못 받음: $rel"
done < "$LIST.txt"
rm -f "$LIST" "$LIST.txt"
echo "받은 파일 $n 개 → $DEST"
# 세션마다: 폰이 낸 알림 · 맥 시험대가 같은 영상에서 찾은 알림
for s in "$DEST"/*/; do
  [ -d "$s" ] || continue
  vids=$(ls "$s"*.mp4 2>/dev/null || true)
  [ -n "$vids" ] || continue
  echo "== $(basename "$s")"
  [ -f "$s/events.jsonl" ] && echo "폰 알림:" && sed 's/^/  /' "$s/events.jsonl"
  echo "맥 시험대:" && "$HERE/ball-trigger/run.sh" $vids | sed 's/^/  /'
done
