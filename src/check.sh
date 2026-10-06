#!/usr/bin/env bash
# 建置 + 檢查：語法、後端隔離、煙霧測試、單元/整合測試。用法：bash check.sh
# （改版後行為已和 _baseline 不同，不再做 --no-wrapper 逐位元組比對；_baseline/ 留作歷史紀錄。）
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "需要 node 才能做語法檢查"; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
fail=0
ok(){ echo "  OK   $*"; }
bad(){ echo "  FAIL $*"; fail=1; }

echo "[1] 建置"
python3 build.py

echo "[2] 取出 <script>（沒有 src= 的那段）並 node --check"
extract(){ python3 - "$1" "$2" <<'PY'
import re,sys
html=open(sys.argv[1],encoding='utf-8').read()
m=re.findall(r'<script>\n(.*?)\n</script>',html,re.S)
assert len(m)==1,'應該剛好一段內嵌 <script>，實際 %d 段'%len(m)
open(sys.argv[2],'w',encoding='utf-8').write(m[0]+'\n')
PY
}
for pair in "dist/index.html:standalone" "dist/artifact.html:artifact"; do
  f="${pair%%:*}"; n="${pair##*:}"
  extract "$f" "$TMP/$n.js"
  if node --check "$TMP/$n.js"; then ok "$n 語法正確"; else bad "$n 語法錯誤"; fi
done

echo "[3] 後端隔離"
[ "$(grep -c 'acquireLock(' dist/artifact.html || true)" = 0 ] && ok "artifact 沒有 acquireLock(" || bad "artifact 出現 acquireLock("
grep -q 'window\.claude\.use' dist/index.html && bad "standalone 出現 window.claude.use" || ok "standalone 沒有 window.claude.use"
grep -q 'firebase' dist/artifact.html && bad "artifact 出現 firebase" || ok "artifact 沒有 firebase"
grep -q 'window\.claude\.use("db")' dist/artifact.html && ok "artifact 使用 window.claude.use(\"db\")" || bad "artifact 缺 window.claude.use"
grep -q '^<!doctype html>' dist/artifact.html && bad "artifact 不該有 doctype" || ok "artifact 沒有 doctype"
grep -qiE '<(html|head|body)[ >]' dist/artifact.html && bad "artifact 出現 html/head/body" || ok "artifact 沒有 html/head/body"
[ "$(grep -c 'roomRef\.acquire(' dist/index.html || true)" = 0 ] && ok "standalone 沒有 roomRef.acquire(" || bad "standalone 出現 roomRef.acquire("
[ "$(grep -c 'withRoomLock(\|withFreshRoom(' dist/index.html)" = "$(grep -c 'withRoomLock(\|withFreshRoom(' dist/artifact.html)" ] && ok "兩邊 withRoomLock/withFreshRoom 呼叫數相同" || bad "withRoomLock/withFreshRoom 呼叫數不同"
# 遊戲程式碼不可以直接碰鎖（只有 sync.js 與 backend.*.js 可以）
leak=$(grep -ln 'lockRoom(\|unlockRoom(\|acquireLock(\|\.acquire(' *.js | grep -v '^sync.js$\|^backend\.\|^smoke.js$' || true)
[ -z "$leak" ] && ok "遊戲程式碼沒有直接呼叫 lockRoom/acquire" || bad "這些檔案直接碰鎖：$leak"
v1=$(grep -o 'APP_VERSION = "[^"]*"' dist/index.html); v2=$(grep -o 'APP_VERSION = "[^"]*"' dist/artifact.html)
[ "$v1" = "$v2" ] && ok "版本號一致（$v1）" || bad "版本號不一致"

echo "[3b] 煙霧測試（假 DOM + 記憶體內假資料庫）"
node smoke.js dist/index.html standalone && ok "standalone smoke" || bad "standalone smoke"
node smoke.js dist/artifact.html artifact && ok "artifact smoke" || bad "artifact smoke"

echo "[4] 純邏輯 / UI 單元測試（兩份輸出都跑）"
node tests/avalon_pure.js dist/index.html >/dev/null && node tests/avalon_pure.js dist/artifact.html >/dev/null && ok "阿瓦隆純邏輯" || bad "阿瓦隆純邏輯"
node tests/cn_pure.js dist/index.html dist/artifact.html >/dev/null && ok "機密代號純邏輯" || bad "機密代號純邏輯"
node tests/jo_pure.js dist/index.html dist/artifact.html >/dev/null && ok "只有一個純邏輯" || bad "只有一個純邏輯"
node tests/jo_ui.js dist/index.html >/dev/null && node tests/jo_ui.js dist/artifact.html >/dev/null && ok "只有一個畫面" || bad "只有一個畫面"

echo "[5] 鎖 / 同步 / 在線 / 房主 / 看門狗 整合測試（虛擬時鐘 + 假 Firestore / 假 Artifact db）"
node tests/sync.test.js dist/index.html standalone | tail -3 ; [ "${PIPESTATUS[0]}" = 0 ] && ok "standalone 同步測試" || bad "standalone 同步測試"
node tests/sync.test.js dist/artifact.html artifact | tail -3 ; [ "${PIPESTATUS[0]}" = 0 ] && ok "artifact 同步測試" || bad "artifact 同步測試"

echo "[6] 房間密碼測試"
node tests/password.test.js dist/index.html standalone | tail -3 ; [ "${PIPESTATUS[0]}" = 0 ] && ok "standalone 房間密碼測試" || bad "standalone 房間密碼測試"
node tests/password.test.js dist/artifact.html artifact | tail -3 ; [ "${PIPESTATUS[0]}" = 0 ] && ok "artifact 房間密碼測試" || bad "artifact 房間密碼測試"

[ $fail = 0 ] && echo "全部通過" || { echo "有項目失敗"; exit 1; }
