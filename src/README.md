# 派對遊戲：原始碼與建置

兩份輸出（GitHub Pages 的獨立版、Claude Artifact 版；獨立版另外多 PWA 檔案）共用同一份原始碼，用 `build.py` 組出來，不再手動維護兩個 7,000 行的單檔。

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
├── ux.js                   體驗功能：設定（音效/字體/色盲）、cue() 提示音、狀態轉換偵測、首次教學旗標、本機戰績、顯示設定/戰績彈窗、render() 外包
├── sw.js                   service worker 樣板（只有獨立版；build.py 填入版本與雜湊後輸出到 dist/sw.js）
├── sync.js                 同步核心：短租約鎖(withRoomLock)、玩家欄位原子寫入、心跳/在線判斷/房主選舉、看門狗分派
├── boot.js                 題庫種子/修補 + 啟動流程
├── backend.firebase.js     獨立版後端：firebaseConfig、ensureDb()、acquireLock()/releaseLock()、lockRoom()/unlockRoom()、patchDoc()
├── backend.artifact.js     Artifact 版後端：ensureDb()（window.claude.use("db")）、lockRoom()/unlockRoom()（續租縮短 ttl）、patchDoc()、wrapRoomRef()
├── head.standalone.html    獨立版外殼（doctype/head/<script src> Firebase SDK）
├── head.artifact.html      Artifact 版外殼（只有 <title>、字型 <link>、<style>、<script>）
├── build.py                建置腳本
├── check.sh / smoke.js     檢查（語法、後端隔離、煙霧測試、tests/ 全部測試）
├── tests/                  單元 + 整合測試（ux.test.js = 提示音轉換/戰績/教學旗標/設定持久化；pwa.test.js = dist 檔案清單/manifest/sw.js 行為/Artifact 無 PWA；lib.js = 虛擬時鐘 + 假 Firestore/假 Artifact db + 假 DOM；sync.test.js = 鎖/心跳/房主/看門狗/同時送出；content.test.js = 內建內容庫結構/重複/下限/舊項目凍結 + 題庫補丁 V6）
└── _baseline/              改版前的兩份原始檔（standalone.html / artifact.html），只留作歷史紀錄（已不再逐位元組比對）
```

遊戲模組檔內用 `//#@ logic`、`//#@ view`、`//#@ actions` 分成三個區段（純邏輯 / 畫面 / 資料動作），
`build.py` 的 `script_order()` 決定各區段在最後 `<script>` 裡的順序。

## 建置

```bash
cd src
python3 build.py        # 產生 dist/index.html、dist/artifact.html，以及獨立版專用的 PWA 檔案（見下）
bash check.sh           # 建置 + node --check + 後端隔離 + 煙霧測試 + 與 _baseline 比對
```

（已移除 `--no-wrapper`：改版後行為本來就和 `_baseline` 不同，check.sh 改成跑 `tests/` 的測試。）

### dist/ 會有哪些檔案

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 獨立版（GitHub Pages） |
| `manifest.webmanifest` | PWA manifest（name/short_name「派對遊戲」、lang `zh-Hant`、standalone、icons 全部用 `./` 相對路徑） |
| `sw.js` | service worker：外殼（index.html、圖示、manifest）cache-first、其他同源檔案 network-first、跨來源（Firestore / gstatic / 字型）完全不攔截；快取名稱 `pg-shell-<APP_VERSION>-<index.html 雜湊>`，舊快取在 activate 時刪掉；`skipWaiting` + `clients.claim` |
| `icon-192.png` `icon-512.png` | 一般圖示（圓角） |
| `icon-maskable-512.png` | maskable 圖示（滿版，圖案縮在安全區） |
| `apple-touch-icon.png` | 180×180，iOS 加到主畫面用 |
| `artifact.html` | Artifact 版（單一頁面，**沒有**任何 manifest / service worker / PWA 字樣，`check.sh` 會檢查） |

圖示由 `build.py` 用 Pillow 畫（accent→safe 漸層 + 一顆骰子，不需要字型）；沒裝 Pillow 會中止並提示 `pip install pillow`。
`<link rel="manifest">`、theme-color、apple-mobile-web-app 等 meta 只在 `head.standalone.html`；SW 註冊在 `boot.js` 的 `//#if standalone` 區塊
（只在 https 或 localhost 註冊，新版接手後用 `showToast` 顯示「有新版本，重新整理即可更新」）。顯示設定彈窗裡的「📲 加到主畫面」說明也只在獨立版。

## 體驗功能（`ux.js`）

- **提示音 `cue(kind)`**：`turn`（輪到你）/ `success` / `fail` / `reveal` / `tick` 五種，各自有 WebAudio 音型與震動。
  音效總開關 `pg_sound`（預設開；頂端 🔊 按鈕、顯示設定、大廳的音效鈕都會切）。分頁在背景時不發聲，只有 `turn` 仍會震動；同種提示 400ms 內不重複。
  第一次使用者手勢會解鎖 AudioContext（iOS）。**只在狀態轉換時響**：`pgCueState()` 把房間文件壓成「我現在要不要動作 / 是不是揭曉畫面 / 有沒有結束」，`pgCueTick()` 比較前後狀態，同樣的快照重複進來不會響；
  第一次看到某個房間只記基準線。新增模式時在 `pgCueState` / `pgOutcome` 補一個分支，並在 `tests/ux.test.js` 補測試。
- **首次教學**：進到某個遊戲大廳時，若 `pg_seen_help`（`{遊戲: true}`）沒有這個遊戲，就自動開一次玩法說明並記起來；說明視窗底部有「我知道了，不再自動顯示」。手動 ❓ 照舊。
- **戰績**：`pg_stats`，每個遊戲 `{played, wins, lastPlayed}`（只有一個另有 `best`）。進入 `ended` 時記一次，以「房號 + createdAt + 遊戲 + 這一局內容指紋」去重（重新整理、再玩一局都正確）。
  勝負：心電感應＝沒被淘汰且扣分最少；誰最可能＝最高分（>0）；狼人殺／阿瓦隆／機密代號＝己方陣營獲勝（旁觀者不計）；接力畫猜、只有一個是合作遊戲，不計勝率（只有一個記最高分）。首頁「📊 我的戰績」可看／清除，標示「只存在這支手機」。
- **無障礙**：顯示設定（`pg_fontscale` 0/1/2 → CSS `zoom` .9/1/1.18、`pg_cb` 色盲友善）；機密代號牌有 ▲ ● ✕ 記號（色盲模式另有紋路）與 aria-label；圖示按鈕有 aria-label；鍵盤焦點外框；`prefers-reduced-motion` 會跳過拉霸、逐張翻牌與揭曉停頓。
- 所有 localStorage 讀寫都包 try/catch，不能用時退回記憶體（Artifact 沙盒可能就是這樣）。

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

- 獨立版：把 `dist/` 裡**所有檔案**（`index.html`、`manifest.webmanifest`、`sw.js`、`icon-192.png`、`icon-512.png`、`icon-maskable-512.png`、`apple-touch-icon.png`）複製到 repo 根目錄，commit / push，GitHub Pages 自動更新。
  （`artifact.html` 不用放上去。路徑都是相對的，所以放在子路徑 `https://<user>.github.io/<repo>/` 也能運作。）
  使用者端：舊版 SW 偵測到新的 `sw.js`（版本或 index.html 內容一變就會不同）會自動換新，頁面顯示「有新版本，重新整理即可更新」。
- Artifact 版：用 Artifact 工具發佈 `dist/artifact.html`（同一個網址更新就帶原本的 `url`）。
- 改版時只改 `version.js` 的 `APP_VERSION` / `APP_UPDATED`，兩個版本會一起更新。

## 擴充內建內容

內建題庫（QUESTIONS / TARGETED_QUESTIONS / MOST_LIKELY_PROMPTS / DRAW_* / CN_WORDS / JO_WORDS）只能在陣列**尾端追加**，不可移除、改動或重排（房間存的是索引；心電感應題庫文件 id 是 `seed_<索引>` / `seedv2_<索引>`）。
心電感應題目實際是從 Firestore/Artifact db 的 `customQuestions` 抽的，所以追加題目後要在 `boot.js` 加新一版補丁（照 `ensureContentPatchV6`：只補新索引、換新的 `meta/...` 標記、更新 `SEED_V5_*_COUNT` 的基準），並更新 `tests/content.test.js` 的 `BASE`/`MIN`。其他清單是程式內建、不需補丁。
