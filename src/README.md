# 派對遊戲：原始碼與建置

兩份輸出（GitHub Pages 的獨立版、Claude Artifact 版）共用同一份原始碼，用 `build.py` 組出來，不再手動維護兩個 7,000 行的單檔。

## 資料夾配置

```
src/
├── version.js              APP_VERSION / APP_UPDATED（唯一一處，兩個版本共用）
├── styles.css              全部 CSS
├── markup.html             <body> 裡的頁面骨架（.wrap）
├── core.js                 共用資料與工具：頭像/分類、題庫內容、身分/房碼、音效、過期清理、全域狀態
├── home.js                 render() 總入口、首頁、大廳、各模式說明/設定彈窗、題庫管理
├── telepathy.js            「默契」模式的畫面（出題/揭曉/總結）
├── mostlikely.js           誰最可能
├── draw.js                 接力畫猜
├── werewolf.js             狼人殺
├── avalon.js               阿瓦隆
├── codenames.js            機密代號
├── justone.js              只有一個
├── room.js                 建房/加入/連線/輪詢/投票等共用的資料動作
├── sync.js                 同步核心：短租約鎖(withRoomLock)、玩家欄位原子寫入、心跳/在線判斷/房主選舉、看門狗分派
├── boot.js                 題庫種子/修補 + 啟動流程
├── backend.firebase.js     獨立版後端：firebaseConfig、ensureDb()、acquireLock()/releaseLock()、lockRoom()/unlockRoom()、patchDoc()
├── backend.artifact.js     Artifact 版後端：ensureDb()（window.claude.use("db")）、lockRoom()/unlockRoom()（續租縮短 ttl）、patchDoc()、wrapRoomRef()
├── head.standalone.html    獨立版外殼（doctype/head/<script src> Firebase SDK）
├── head.artifact.html      Artifact 版外殼（只有 <title>、字型 <link>、<style>、<script>）
├── build.py                建置腳本
├── check.sh / smoke.js     檢查（語法、後端隔離、煙霧測試、tests/ 全部測試）
├── tests/                  單元 + 整合測試（lib.js = 虛擬時鐘 + 假 Firestore/假 Artifact db + 假 DOM；sync.test.js = 鎖/心跳/房主/看門狗/同時送出）
└── _baseline/              改版前的兩份原始檔（standalone.html / artifact.html），只留作歷史紀錄（已不再逐位元組比對）
```

遊戲模組檔內用 `//#@ logic`、`//#@ view`、`//#@ actions` 分成三個區段（純邏輯 / 畫面 / 資料動作），
`build.py` 的 `script_order()` 決定各區段在最後 `<script>` 裡的順序。

## 建置

```bash
cd src
python3 build.py        # 產生 dist/index.html 與 dist/artifact.html
bash check.sh           # 建置 + node --check + 後端隔離 + 煙霧測試 + 與 _baseline 比對
```

（已移除 `--no-wrapper`：改版後行為本來就和 `_baseline` 不同，check.sh 改成跑 `tests/` 的測試。）

## 兩個版本差異怎麼處理

- 後端：只放在 `backend.*.js` 與 `head.*.html`。遊戲程式**不可以**直接呼叫 `lockRoom` / `acquire`，一律透過 `sync.js`：
  - `withRoomLock(fn, {tries})`：短租約鎖 + 指數退避(150~600ms)+抖動；成功或丟例外都會釋放；搶不到回傳 `{ok:false}`（呼叫端要提示「再按一次」）。
  - `withFreshRoom(fn(fd, players))`：鎖 + 重新抓房間與玩家，所有「結算 / 換階段」都走這條，fn 內要再確認 phase（冪等）。
  - `writeOwnField("teamVotes.<id>", v, phase)`：每個人只寫自己的欄位（不需要鎖）；Artifact 版寫完會讀回確認（平台是 last-writer-wins）。
  - Firestore 的 `update()` 支援 `"a.b"` 點路徑；Artifact 的 `update()` 是巢狀合併、不支援點路徑，所以 `patchDoc()` 在 Artifact 版會展開成巢狀物件；
    另外 Artifact 版房間文件的一般 `update()` 若帶物件值（例如把 `teamVotes` 重設成 `{}`），會改成讀出→取代→`set()`（見 `wrapRoomRef`），否則舊的 key 清不掉。
- 在線 / 房主：每個用戶端頁面可見時每 12 秒寫自己的 `lastSeen`；`isOnline(p, now)` = 40 秒內有心跳；房主 = 最早加入的在線玩家（`pickHostId`，確定性規則，原房主回來且仍是最早的在線者就自動拿回）。
  房主端每 5 秒跑一次看門狗（各模式的 `xxWatchdog`，判斷邏輯是純函式 `xxPlan`），把離線玩家造成的卡關往前推。
- 其餘少數差異（例如過期清理要不要刪 `_locks`、筆畫用 `add()` 還是 `doc().set()`）用條件區塊標記：

  ```js
  //#if standalone     // 或 artifact / wrapper
  ...
  //#else
  ...
  //#endif
  ```

  CSS 內用 `/*#if standalone*/ ... /*#endif*/`。指令必須獨佔一行、從第 1 欄開始。

## 新增一個遊戲模組

1. 新增 `src/mygame.js`，用 `//#@ logic` / `//#@ view` / `//#@ actions` 分區（沒有的區段可省略）。
2. 在 `build.py` 的 `script_order()` 加上 `"mygame.js:logic"`、`"mygame.js:view"`、`"mygame.js:actions"`。
3. 若需要 CSS，加進 `styles.css`；大廳/說明彈窗與 `render()` 的分派寫在 `home.js`。
4. 不要在遊戲程式直接呼叫 `acquireLock` 或 `roomRef.acquire`，一律用 `withRoomLock()` / `withFreshRoom()`；新的「等大家都送出」流程請用 `writeOwnField` + 只等在線玩家，並在 `sync.js` 的 `runWatchdog` 加上該模式的看門狗。
5. `bash check.sh`。

## 部署

- 獨立版：`dist/index.html` 複製到 repo 根目錄的 `index.html`，commit / push，GitHub Pages 自動更新。
- Artifact 版：用 Artifact 工具發佈 `dist/artifact.html`（同一個網址更新就帶原本的 `url`）。
- 改版時只改 `version.js` 的 `APP_VERSION` / `APP_UPDATED`，兩個版本會一起更新。
