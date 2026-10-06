//#@ logic
// ---------- 同步：鎖 / 在線狀態 / 房主 的純邏輯（不碰 DOM、不碰資料庫，方便單元測試） ----------

const PRESENCE_TTL_MS = 40000;   // 超過這麼久沒有心跳就當作離線
const HEARTBEAT_MS = 12000;      // 頁面可見時每隔多久寫一次 lastSeen
const WATCHDOG_MS = 5000;        // 房主端的看門狗週期
const LOCK_TTL_MS = 4000;        // 短租約：臨界區間做完就釋放，這只是當機時的保險
const LOCK_TRIES = 8;            // 搶鎖最多嘗試次數（指數退避 + 抖動）

// 玩家是否在線：沒有 lastSeen 的舊資料用 joinedAt 當最後一次看到的時間。
function isOnline(p, now){
  if(!p) return false;
  const t = p.lastSeen || p.joinedAt || 0;
  return (now - t) < PRESENCE_TTL_MS;
}
function joinOrder(players){
  return (players||[]).slice().sort((a,b)=> ((a.joinedAt||0)-(b.joinedAt||0)) || (a.id<b.id ? -1 : (a.id>b.id ? 1 : 0)));
}
// 在線的玩家 id（selfId 一定算在線：程式正在這個人的裝置上跑）。
function onlineIdsOf(players, now, selfId){
  return (players||[]).filter(p=> p.id===selfId || isOnline(p, now)).map(p=>p.id);
}
// 房主 = 最早加入的「在線」玩家。規則是確定性的（每個人看到同樣的資料就算出同一位），
// 原房主離線超過 PRESENCE_TTL_MS 控制權自動轉給下一位；他回來（心跳恢復）且仍是最早的在線者就自動拿回。
// 沒有任何人在線時退回最早加入者。
function pickHostId(players, now, selfId){
  const ord = joinOrder(players);
  const h = ord.find(p=> p.id===selfId || isOnline(p, now));
  return h ? h.id : (ord[0] ? ord[0].id : null);
}
// 搶鎖失敗後的等待時間：150ms 起跳、上限約 600ms 的指數退避，rnd(0~1) 是抖動，避免大家同時重試。
function backoffDelay(attempt, rnd){
  const hi = Math.min(600, 250 * Math.pow(1.4, attempt));
  return Math.round(150 + (hi - 150) * (rnd==null ? Math.random() : rnd));
}
// {"a.b.c":1, "a.d":2} -> {a:{b:{c:1}, d:2}}（Artifact 版 update() 不支援點路徑）
function expandDotted(flat){
  const out = {};
  Object.keys(flat).forEach(k=>{
    const parts = k.split(".");
    let o = out;
    for(let i=0;i<parts.length-1;i++){
      if(typeof o[parts[i]]!=="object" || o[parts[i]]===null) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length-1]] = flat[k];
  });
  return out;
}
function getPathValue(obj, path){
  let o = obj;
  const parts = path.split(".");
  for(let i=0;i<parts.length;i++){
    if(o==null || typeof o!=="object") return undefined;
    o = o[parts[i]];
  }
  return o;
}
function deepEq(a, b){ try{ return JSON.stringify(a)===JSON.stringify(b); }catch(e){ return false; } }
// 比較玩家名單時忽略 lastSeen（心跳每 12 秒就會讓資料變一次，不能每次都重畫畫面）。
function stripSeen(players){
  return (players||[]).map(p=>{ const q = Object.assign({}, p); delete q.lastSeen; return q; });
}
// 這些 id 之中「在線」的。
function onlineSubset(ids, players, now, selfId){
  const on = new Set(onlineIdsOf(players, now, selfId));
  return (ids||[]).filter(id=> on.has(id));
}
// 通用「全員送出了嗎」：required 之中在線的人都有交（在線的人數為 0 也算齊了，避免永遠卡住）。
function allOnlineSubmitted(requiredIds, submitted, players, now, selfId){
  return onlineSubset(requiredIds, players, now, selfId).every(id=> submitted && submitted[id]!=null);
}
// 離線標籤（小的灰色字，大廳與各遊戲畫面共用）。
function offBadgeHtml(p, now, selfId){
  if(!p || p.id===selfId || isOnline(p, now)) return "";
  return `<span class="offtag">離線</span>`;
}

//#@ actions
// ---------- 同步：短租約鎖 + 退避重試 / 玩家欄位原子寫入 / 心跳 / 看門狗 ----------

function sleepMs(ms){ return new Promise(r=>setTimeout(r, ms)); }

// 在「短租約鎖」裡執行 fn：搶不到就指數退避 + 抖動重試（最多 tries 次）；不管 fn 成功或丟例外，一定釋放鎖。
// 回傳 {ok:true, value}；搶不到回傳 {ok:false}（呼叫端必須處理，不可以默默吞掉使用者的動作）；fn 丟的例外會原樣往外丟。
async function withRoomLock(fn, opts){
  opts = opts || {};
  const tries = opts.tries || LOCK_TRIES;
  const ttl = opts.ttl || LOCK_TTL_MS;
  const ref = roomRef;
  const me = identity ? identity.playerId : "anon";
  for(let i=0;i<tries;i++){
    const holder = me + "#" + Math.random().toString(36).slice(2,8);
    let lease = null;
    try{ lease = await lockRoom(ref, holder, ttl); }catch(e){ lease = null; }
    if(lease && lease.acquired){
      try{
        return {ok:true, value: await fn()};
      } finally {
        try{ await unlockRoom(ref, holder); }catch(e){}
      }
    }
    if(i<tries-1) await sleepMs(backoffDelay(i));
  }
  return {ok:false};
}

async function freshPlayerList(){
  const snap = await playersCol.get().catch(()=>({docs:[]}));
  return snap.docs.map(dd=>({id:dd.id, ...dd.data()}));
}
// 鎖 + 重新抓房間與玩家 + 呼叫 fn(fd, players)：所有「結算」類動作都走這條（fn 自己要再確認 phase，保持冪等）。
async function withFreshRoom(fn, opts){
  return withRoomLock(async ()=>{
    const snap = await roomRef.get().catch(()=>null);
    if(!snap || !snap.exists) return undefined;
    const players = await freshPlayerList();
    return fn(snap.data(), players);
  }, opts);
}

// 每個人只寫「自己的」欄位（例如 teamVotes.<我的id>），不需要鎖，同時送出也不會互相蓋掉。
// 寫入失敗（網路）會退避重試；回傳 true 表示確定寫進去了（或房間已經進到下一階段）。
async function writeOwnField(path, value, expectPhase){
  for(let i=0;i<4;i++){
    try{
      await patchDoc(roomRef, {[path]: value, lastActivityAt: Date.now()});
      if(!VERIFY_FIELD_WRITES) return true;
      const snap = await roomRef.get().catch(()=>null);
      if(!snap || !snap.exists) return false;
      const d = snap.data();
      if(expectPhase && d.phase!==expectPhase) return true;   // 已經進到下一階段，不要再往新階段重寫
      if(deepEq(getPathValue(d, path), value)) return true;
    }catch(e){}
    await sleepMs(backoffDelay(i));
  }
  return false;
}

// 小提示（沒送出成功時叫使用者再按一次）。不依賴畫面重繪。
let toastTimer = null;
function showToast(msg){
  try{
    let el = document.getElementById("syncToast");
    if(!el){
      el = document.createElement("div"); el.id = "syncToast"; el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.opacity = "1";
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{ try{ el.style.opacity = "0"; }catch(e){} }, 2800);
  }catch(e){}
}
const MSG_RETRY = "沒有送出成功，請再按一次";

// ---------- 在線狀態（心跳）----------
let hbTimer = null, wdTimer = null, lastHbAt = 0, lastOnlineKey = "", watchdogBusy = false;

function pageVisible(){
  try{ return !document.visibilityState || document.visibilityState==="visible"; }catch(e){ return true; }
}
function sendHeartbeat(force){
  if(!identity || !playersCol) return;
  if(!pageVisible()) return;
  const now = Date.now();
  if(now - lastHbAt < 2000) return;   // 事件（focus / visibilitychange / online）可能一起觸發，擋掉重複寫入
  lastHbAt = now;
  try{ playersCol.doc(identity.playerId).update({lastSeen: now}).catch(()=>{}); }catch(e){}
}
function onlineKey(){
  const now = Date.now();
  return playersData.filter(p=> p.id===(identity&&identity.playerId) || isOnline(p, now)).map(p=>p.id).join(",");
}
function currentHostId(){
  return pickHostId(playersData, Date.now(), identity ? identity.playerId : null);
}
function isHostNow(players){
  return !!identity && pickHostId(players||playersData, Date.now(), identity.playerId)===identity.playerId;
}
// 在線玩家的 id（沒有任何人在線時退回全部）：挑下一位猜謎者/基準者/隊長時不要挑到離線的人。
function presentIds(){
  const o = onlineIdsOf(playersData, Date.now(), identity && identity.playerId);
  return o.length ? o : playersData.map(p=>p.id);
}
function offBadge(p){ return offBadgeHtml(p, Date.now(), identity && identity.playerId); }

// 玩家名單更新：只有 lastSeen 變了而其他資料沒變時不重畫；但「誰在線」的集合變了要重畫。
function applyPlayers(next){
  const changed = !sameData(stripSeen(next), stripSeen(playersData));
  playersData = next;
  const k = onlineKey();
  const kc = k !== lastOnlineKey;
  lastOnlineKey = k;
  if(changed || kc) render();
}

function startPresence(){
  stopPresence();
  lastHbAt = 0; lastOnlineKey = "";
  sendHeartbeat(true);
  hbTimer = setInterval(()=> sendHeartbeat(false), HEARTBEAT_MS);
  wdTimer = setInterval(watchdogTick, WATCHDOG_MS);
}
function stopPresence(){
  if(hbTimer){ clearInterval(hbTimer); hbTimer = null; }
  if(wdTimer){ clearInterval(wdTimer); wdTimer = null; }
}

// ---------- 看門狗：由「目前的房主」每 ~5 秒檢查一次，離線玩家造成的卡關自動往前推 ----------
async function watchdogTick(){
  if(!identity || !roomRef || !roomData || !roomData.exists) return;
  const k = onlineKey();
  if(k !== lastOnlineKey){ lastOnlineKey = k; render(); }
  if(watchdogBusy || !pageVisible()) return;
  const phase = roomData.phase;
  if(!phase || phase==="lobby" || phase==="ended") return;
  if(!isHostNow()) return;
  watchdogBusy = true;
  try{ await runWatchdog(); }catch(e){}
  watchdogBusy = false;
}
async function runWatchdog(){
  const gt = (roomData && roomData.gameType) || "telepathy";
  if(gt==="avalon") return avalonWatchdog();
  if(gt==="codenames") return cnWatchdog();
  if(gt==="justone") return joWatchdog();
  if(gt==="werewolf") return wwWatchdog();
  if(gt==="draw") return drawWatchdog();
  // 誰最可能 / 心電感應：在線的人都投完、或時間到，就由房主補一次結算（平常是最後一位投票者自己觸發）
  if(voteRoundComplete() || remainingSeconds()<=0) return gt==="mostlikely" ? tryResolveML() : tryResolve();
}
