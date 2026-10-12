//#@ logic
// ---------- 體驗功能：設定（音效/字體/色盲）、提示音 cue、第一次玩的教學旗標、本機戰績 ----------
// 全部只存在這支裝置的 localStorage；localStorage 不能用（隱私模式、被封鎖、Artifact 沙盒）時，
// 每一項都退回「記憶體內」的值，功能照常、只是重新整理後不會記得。
function pgLsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function pgLsSet(k, v){ try{ localStorage.setItem(k, v); return true; }catch(e){ return false; } }
function pgJson(s, fallback){ try{ const v = JSON.parse(s); return (v && typeof v==="object") ? v : fallback; }catch(e){ return fallback; } }

const PG_FONT_LABELS = ["A−", "A", "A+"];
function pgLoadSettings(){
  let sound = pgLsGet("pg_sound");
  if(sound===null) sound = pgLsGet("telepathySound");        // 舊版的 key，沿用使用者原本的選擇
  const fs = parseInt(pgLsGet("pg_fontscale"), 10);
  return { sound: sound!=="off", fs: (fs>=0 && fs<=2) ? fs : 1, cb: pgLsGet("pg_cb")==="1" };
}
let pgSettings = pgLoadSettings();
let soundEnabled = pgSettings.sound;
let audioCtx = null;

function setSoundEnabled(v){
  soundEnabled = !!v; pgSettings.sound = soundEnabled;
  pgLsSet("pg_sound", soundEnabled ? "on" : "off");
  pgSyncControls();
}
function pgSetFontScale(n){
  n = Math.max(0, Math.min(2, n|0)); pgSettings.fs = n;
  pgLsSet("pg_fontscale", String(n)); pgApplyDisplay();
}
function pgSetColorblind(on){
  pgSettings.cb = !!on; pgLsSet("pg_cb", on ? "1" : "0"); pgApplyDisplay();
}
function pgApplyDisplay(){
  try{
    const el = document.documentElement;
    el.setAttribute("data-fs", String(pgSettings.fs));
    el.setAttribute("data-cb", pgSettings.cb ? "1" : "0");
  }catch(e){}
}
function pgReducedMotion(){
  try{ return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }catch(e){ return false; }
}
function pgTabHidden(){
  try{ return document.visibilityState==="hidden" || document.hidden===true; }catch(e){ return false; }
}

// ----- 聲音 / 震動 -----
function pgGetAudio(){
  try{
    if(!audioCtx){
      const C = window.AudioContext || window.webkitAudioContext;
      if(!C) return null;
      audioCtx = new C();
    }
    if(audioCtx.state !== "running") audioCtx.resume().catch(()=>{});
    return audioCtx;
  }catch(e){ return null; }
}
function beep(freq, durMs, type, delayMs){
  if(!soundEnabled || pgTabHidden()) return;
  try{
    const ctx = pgGetAudio(); if(!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const t0 = ctx.currentTime + (delayMs||0)/1000;
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.16, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + durMs/1000);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + durMs/1000);
  }catch(e){}
}
function vibrate(pattern){
  if(!soundEnabled) return;
  try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(e){}
}
// iOS / 部分瀏覽器要在「第一次使用者手勢」裡建立並啟動 AudioContext，之後才能自動發聲。
function pgUnlockAudio(){
  try{
    if(audioCtx && audioCtx.state==="running") return;
    const ctx = pgGetAudio(); if(!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination); src.start(0);
  }catch(e){}
}
function pgInstallAudioUnlock(){
  ["pointerdown", "touchend", "click", "keydown"].forEach(ev=>{ try{ document.addEventListener(ev, pgUnlockAudio, {passive:true}); }catch(e){} });
}

// 五種提示：turn 輪到你 / success 成功·贏 / fail 失敗·輸 / reveal 揭曉 / tick 輕點與倒數
// tones: [頻率, 毫秒, 波形, 延遲毫秒]；vibHidden：分頁在背景時仍用震動提醒（只給「輪到你」）。
const PG_CUES = {
  turn:    {tones:[[784,90,"sine",0],[1047,130,"sine",110]], vib:[30,50,30], vibHidden:true},
  success: {tones:[[660,90,"sine",0],[880,120,"sine",90]], vib:20},
  fail:    {tones:[[220,200,"sawtooth",0],[165,260,"sawtooth",160]], vib:[40,40,40]},
  reveal:  {tones:[[523,80,"triangle",0],[659,80,"triangle",80],[784,150,"triangle",160]], vib:[15,30,15]},
  tick:    {tones:[[520,60,"sine",0]], vib:15}
};
let pgLastCueAt = {};
// 回傳是否真的發出聲音。關閉音效、分頁在背景（不發聲）、同一種提示 400ms 內重複，都不會響。
function cue(kind){
  const def = PG_CUES[kind];
  if(!def || !soundEnabled) return false;
  const now = Date.now();
  if(pgLastCueAt[kind] && now - pgLastCueAt[kind] < 400) return false;
  pgLastCueAt[kind] = now;
  if(pgTabHidden()){
    if(def.vibHidden) vibrate(def.vib);
    return false;
  }
  def.tones.forEach(t=> beep(t[0], t[1], t[2], t[3]));
  vibrate(def.vib);
  return true;
}
// 一次狀態更新可能同時觸發好幾種，只播最重要的那一個（結果 > 揭曉 > 輪到你）。
function pgPlayCues(list){
  if(list && list.length) cue(list[0]);
}

// ----- 狀態轉換偵測（純函式）-----
// pgCueState 把「房間文件 + 玩家」壓成一個小物件：我現在要不要動作(turn)、是不是在揭曉畫面(reveal)、遊戲有沒有結束(end)。
// 只有「前一個狀態 → 後一個狀態」的差異才會發出提示，所以同樣的快照重複進來（輪詢、重畫、重連）不會再響。
function pgOutcome(rd, players, myId){
  if(!rd || rd.phase!=="ended") return null;
  const gt = rd.gameType || "telepathy";
  const ps = players || [];
  const me = ps.find(p=>p.id===myId);
  if(!me) return null;
  const roles = rd.roles || {};
  if(gt==="telepathy"){
    const loserIds = new Set((rd.losers||[]).map(l=>l.id));
    const minStrikes = ps.length ? Math.min(...ps.map(p=>p.strikes||0)) : 0;
    const win = !loserIds.has(myId) && (me.strikes||0)===minStrikes;
    return {win, cue: loserIds.has(myId) ? "fail" : "success"};
  }
  if(gt==="mostlikely"){
    const top = ps.reduce((m,p)=>Math.max(m, p.mlScore||0), 0);
    const win = top>0 && (me.mlScore||0)===top;
    return {win, cue: win ? "success" : "reveal"};
  }
  if(gt==="draw") return {win:null, cue:"success"};
  if(gt==="werewolf"){
    if(!roles[myId]) return null;
    const win = (rd.winner==="wolf") === (roles[myId]==="wolf");
    return {win, cue: win ? "success" : "fail"};
  }
  if(gt==="avalon"){
    if(!roles[myId]) return null;
    const win = (rd.winner==="evil") === isEvilRole(roles[myId]);
    return {win, cue: win ? "success" : "fail"};
  }
  if(gt==="codenames"){
    if(me.team!=="red" && me.team!=="blue") return null;
    const win = me.team===rd.winner;
    return {win, cue: win ? "success" : "fail"};
  }
  if(gt==="justone"){
    const total = joTotal(rd.settings), score = rd.score||0;
    const good = Math.round(score/total*13) >= 7;
    return {win:null, score, total, cue: good ? "success" : "fail"};
  }
  return null;
}

function pgCueState(rd, players, myId){
  if(!rd || !rd.exists || !myId) return null;
  const ps = players || [];
  const me = ps.find(p=>p.id===myId);
  if(!me) return null;                      // 玩家資料還沒載入完：先不判斷，避免重新整理時誤報「輪到你」
  const gt = rd.gameType || "telepathy", phase = rd.phase;
  const st = {gt, phase, turn:null, reveal:null, end:null};
  const roles = rd.roles || {};
  if(phase==="ended"){ const o = pgOutcome(rd, ps, myId); st.end = o ? o : {win:null, cue:null}; return st; }
  if(gt==="telepathy" || gt==="mostlikely"){
    if(phase==="question") st.turn = "q|"+rd.round;
  } else if(gt==="draw"){
    const drawerId = (rd.drawOrder||[])[rd.currentDrawerIndex||0];
    if(phase==="drawing" && drawerId===myId) st.turn = `d|${rd.round}|${rd.currentDrawerIndex||0}`;
    else if(phase==="guessing" && rd.currentGuesserId===myId) st.turn = "g|"+rd.round;
    else if(phase==="reveal") st.reveal = "r|"+rd.round;
  } else if(gt==="werewolf"){
    const role = roles[myId], alive = me.alive!==false;
    if(phase==="night" && alive && role && rd.nightStep===role){
      const acted = role==="wolf" && (rd.wolfVotes||{})[myId]!=null;
      if(!acted) st.turn = `n|${rd.round}|${rd.nightStep}`;
    } else if(phase==="hunter" && (rd.hunterQueue||[])[0]===myId) st.turn = `h|${rd.round}`;
    else if(phase==="vote" && alive && role && (rd.voteTally||{})[myId]==null) st.turn = "v|"+rd.round;
    else if(phase==="daydeaths") st.reveal = "dd|"+rd.round;
    else if(phase==="voteresult") st.reveal = "vr|"+rd.round;
  } else if(gt==="avalon"){
    const role = roles[myId], mn = rd.missionNo||1, rc = rd.rejectCount||0;
    if(!role){ /* 旁觀者：沒有提示 */ }
    else if(phase==="reveal") st.reveal = "role";
    else if(phase==="team" && rd.leaderId===myId) st.turn = `t|${mn}|${rc}|${myId}`;
    else if(phase==="vote" && (rd.teamVotes||{})[myId]==null) st.turn = `v|${mn}|${rc}`;
    else if(phase==="mission" && (rd.teamSelection||[]).includes(myId) && (rd.missionVotes||{})[myId]==null) st.turn = "m|"+mn;
    else if(phase==="assassin" && role==="assassin") st.turn = "a";
    else if(phase==="voteresult") st.reveal = `vr|${mn}|${rc}`;
    else if(phase==="missionresult") st.reveal = `mr|${mn}`;
  } else if(gt==="codenames"){
    const team = me.team, sm = rd.spymasters || {};
    if(team==="red" || team==="blue"){
      const isSpy = sm[team]===myId, n = (rd.clueLog||[]).length;
      if(phase==="clue" && rd.turnTeam===team && isSpy) st.turn = `c|${n}|${team}`;
      else if(phase==="guess" && rd.turnTeam===team && !isSpy) st.turn = `g|${n}|${team}`;
    }
  } else if(gt==="justone"){
    const eligible = rd.clueEligible || [], key = joKeyOf(rd);
    if(phase==="clue" && eligible.includes(myId) && myId!==rd.guesserId && (rd.hints||{})[myId]==null) st.turn = "h|"+key;
    else if(phase==="guess" && rd.guesserId===myId) st.turn = "g|"+key;
    else if(phase==="result") st.reveal = "r|"+key;
  }
  return st;
}
function pgDiffCues(prev, next){
  if(!prev || !next || prev.gt!==next.gt) return [];
  const out = [];
  if(next.end){
    if(!prev.end && next.end.cue) out.push(next.end.cue);
    return out;
  }
  if(next.reveal && next.reveal!==prev.reveal) out.push("reveal");
  if(next.turn && next.turn!==prev.turn) out.push("turn");
  return out;
}
let pgPrevCue = null, pgPrevCueRoom = "";
// 每次狀態更新呼叫一次：第一次看到某個房間只記錄基準線（不響），之後只在「轉換」時回傳要播的提示。
function pgCueTick(rd, players, myId, roomKey){
  const next = pgCueState(rd, players, myId);
  if(!next) return [];                       // 暫時沒資料（重連中）：保留基準線，不當成轉換
  if(pgPrevCueRoom!==roomKey || !pgPrevCue){ pgPrevCueRoom = roomKey; pgPrevCue = next; return []; }
  const cues = pgDiffCues(pgPrevCue, next);
  pgPrevCue = next;
  return cues;
}
function pgResetCue(){ pgPrevCue = null; pgPrevCueRoom = ""; pgCountdownKey = ""; }

// 倒數最後 3 秒的輕點聲（每個整數秒只響一次）：只給「現在輪到我、還沒送出」的人。
let pgCountdownKey = "";
function pgCountdownTick(rd, myId, votes, remainSec){
  if(!rd || (rd.phase!=="question" && rd.phase!=="drawing")) return false;
  const sec = Math.ceil(remainSec);
  if(!(remainSec>0) || sec>3) return false;
  let mine = false;
  if(rd.phase==="question") mine = !(votes||[]).some(v=>v.playerId===myId && v.round===rd.round);
  else mine = (rd.drawOrder||[])[rd.currentDrawerIndex||0]===myId;
  if(!mine) return false;
  const key = `${rd.phase}|${rd.round}|${rd.currentDrawerIndex||0}|${sec}`;
  if(key===pgCountdownKey) return false;
  pgCountdownKey = key;
  return true;
}

// ----- 第一次玩的玩法說明旗標（pg_seen_help = {gameType: true}）-----
let pgHelpMem = {};
function pgHelpMap(){
  const raw = pgLsGet("pg_seen_help");
  const m = raw ? pgJson(raw, null) : null;
  return Object.assign({}, pgHelpMem, m || {});
}
function pgHelpSeen(gt){ return !!pgHelpMap()[gt]; }
function pgMarkHelpSeen(gt){
  pgHelpMem[gt] = true;
  const m = pgHelpMap(); m[gt] = true;
  pgLsSet("pg_seen_help", JSON.stringify(m));
}
let pgHelpAuto = false;     // 目前開著的玩法說明是自動跳出來的（按鈕文字不同）

// ----- 本機戰績（pg_stats）-----
const PG_GAMES = ["telepathy", "mostlikely", "draw", "werewolf", "avalon", "codenames", "justone"];
const PG_GAME_INFO = {
  telepathy:{icon:"🔮", name:"心電感應", wins:true},
  mostlikely:{icon:"👑", name:"誰最可能", wins:true},
  draw:{icon:"✏️", name:"接力畫猜", wins:false, note:"合作遊戲，沒有輸贏"},
  werewolf:{icon:"🌙", name:"狼人殺", wins:true},
  avalon:{icon:"🗡️", name:"阿瓦隆", wins:true},
  codenames:{icon:"🔍", name:"機密代號", wins:true},
  justone:{icon:"💡", name:"只有一個", wins:false, note:"合作遊戲，看最高分"}
};
let pgStatsMem = null;
function pgStatsLoad(){
  const raw = pgLsGet("pg_stats");
  let s = raw ? pgJson(raw, null) : null;
  if(!s) s = pgStatsMem ? JSON.parse(JSON.stringify(pgStatsMem)) : {};
  if(!Array.isArray(s._seen)) s._seen = [];
  return s;
}
function pgStatsSave(s){
  pgStatsMem = JSON.parse(JSON.stringify(s));
  pgLsSet("pg_stats", JSON.stringify(s));
}
function pgStatsClear(){
  pgStatsMem = null;
  pgLsSet("pg_stats", "{}");
  try{ localStorage.removeItem("pg_stats"); }catch(e){}
}
function pgHash(str){
  let h = 5381;
  for(let i=0;i<str.length;i++) h = ((h<<5) + h + str.charCodeAt(i)) | 0;
  return (h>>>0).toString(36);
}
// 同一個房間可以「再玩一局」，所以除了 房號+建立時間，還要加上這一局的內容指紋（角色、牌盤、牌堆、題目…），
// 重新整理後算出來一樣的 key 不會重複記，下一局則不同。
function pgGameKey(rd, code){
  const sig = [
    rd.roles ? JSON.stringify(rd.roles) : "", (rd.board||[]).map(c=>c.word).join(","), (rd.deck||[]).join(","),
    (rd.usedQKeys||[]).join(","), (rd.usedDrawPromptIdx||[]).join(","), (rd.usedGuesserIds||[]).join(","),
    rd.round||0, rd.winner||"", rd.score||0, rd.cardsUsed||0, (rd.revealLog||[]).length
  ].join("|");
  return [code, rd.createdAt||0, rd.gameType||"telepathy", pgHash(sig)].join("|");
}
// 轉換到「結束」時呼叫；同一局只會記一次。回傳是否真的記了。
function pgRecordGame(rd, players, myId, code, nowMs){
  if(!rd || rd.phase!=="ended") return false;
  const out = pgOutcome(rd, players, myId);
  if(!out) return false;                    // 旁觀者 / 沒有參與
  const key = pgGameKey(rd, code);
  const s = pgStatsLoad();
  if(s._seen.indexOf(key)>=0) return false;
  const gt = rd.gameType || "telepathy";
  const g = s[gt] || {played:0, wins:0, lastPlayed:0};
  g.played = (g.played||0) + 1;
  if(out.win===true) g.wins = (g.wins||0) + 1;
  g.lastPlayed = nowMs || Date.now();
  if(gt==="justone" && out.total){
    if(!g.best || out.score/out.total > g.best.score/g.best.total) g.best = {score:out.score, total:out.total};
  }
  s[gt] = g;
  s._seen.push(key);
  s._seen = s._seen.slice(-40);
  pgStatsSave(s);
  return true;
}
function pgStatsRows(){
  const s = pgStatsLoad();
  return PG_GAMES.map(gt=>{
    const g = s[gt] || {played:0, wins:0, lastPlayed:0};
    const info = PG_GAME_INFO[gt];
    return {gt, icon:info.icon, name:info.name, tracksWins:info.wins, note:info.note||"",
      played:g.played||0, wins:g.wins||0, lastPlayed:g.lastPlayed||0, best:g.best||null,
      rate: (info.wins && g.played) ? Math.round((g.wins||0)/g.played*100) : null};
  });
}

//#@ view
// ---------- 體驗功能：畫面（頂端小按鈕、顯示設定、戰績、首次教學、render 前後的掛勾）----------
let pgOverlay = null;          // "display" | "stats" | null
let pgStatsAskClear = false;
let pgFocusBack = null;

function pgSyncControls(){
  try{
    const b = document.getElementById("pgSndBtn");
    if(b){
      b.textContent = soundEnabled ? "🔊" : "🔇";
      b.setAttribute("aria-label", soundEnabled ? "音效與震動：開（點一下關閉）" : "音效與震動：關（點一下開啟）");
      b.setAttribute("aria-pressed", soundEnabled ? "true" : "false");
    }
  }catch(e){}
}

//#if standalone
function pgInstallRowHtml(){
  return `
    <div class="card" style="margin-bottom:10px;">
      <div class="helptitle">📲 加到主畫面</div>
      <p class="pgdesc" style="margin:0; font-size:13px; color:var(--muted); text-align:left; line-height:1.7;">iPhone／iPad：Safari 的 分享 → 加入主畫面<br>Android：Chrome 的 ⋮ → 安裝應用程式</p>
    </div>`;
}
//#else
function pgInstallRowHtml(){ return ""; }
//#endif

function pgDisplayModalHtml(){
  const fsBtns = PG_FONT_LABELS.map((l,i)=>`<button class="catchip ${pgSettings.fs===i?'on':''}" data-pgfs="${i}" aria-pressed="${pgSettings.fs===i}" aria-label="字體大小：${['縮小','標準','放大'][i]}">${l}</button>`).join("");
  return `
    <div class="modalbackdrop" id="pgBackdrop">
      <div class="modalsheet" role="dialog" aria-modal="true" aria-label="顯示設定">
        <div class="modalhead"><h2>⚙️ 顯示設定</h2><button class="modalclose" id="pgClose" aria-label="關閉">✕</button></div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle">字體大小</div>
          <div class="seg" role="group" aria-label="字體大小">${fsBtns}</div>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="pgrow"><div><div class="helptitle" style="margin:0;">音效與震動</div><p class="pgdesc">輪到你、揭曉、勝負時的短提示音</p></div>
          <button class="pgswitch" id="pgSndToggle" role="switch" aria-checked="${soundEnabled}" aria-label="音效與震動">${soundEnabled?'🔊 開':'🔇 關'}</button></div>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="pgrow"><div><div class="helptitle" style="margin:0;">色盲友善模式</div><p class="pgdesc">機密代號的牌加上 ▲ ● ✕ 記號與紋路，不只靠顏色分辨</p></div>
          <button class="pgswitch" id="pgCbToggle" role="switch" aria-checked="${pgSettings.cb}" aria-label="色盲友善模式">${pgSettings.cb?'開':'關'}</button></div>
        </div>
        ${pgInstallRowHtml()}
        <button class="btn-primary" id="pgDone">完成</button>
      </div>
    </div>`;
}
function pgStatsModalHtml(){
  const rows = pgStatsRows();
  const any = rows.some(r=>r.played>0);
  const li = rows.map(r=>{
    let nums;
    if(!r.played) nums = "還沒玩過";
    else if(r.gt==="justone") nums = `玩 ${r.played} 場 · 最高 ${r.best ? r.best.score+"/"+r.best.total : "—"}`;
    else if(!r.tracksWins) nums = `玩 ${r.played} 場`;
    else nums = `玩 ${r.played} 場 · 勝 ${r.wins} · ${r.rate}%`;
    return `<li class="pgstat"><span class="pname">${r.icon} ${esc(r.name)}</span><span class="pgnums">${esc(nums)}</span></li>`;
  }).join("");
  return `
    <div class="modalbackdrop" id="pgBackdrop">
      <div class="modalsheet" role="dialog" aria-modal="true" aria-label="我的戰績">
        <div class="modalhead"><h2>📊 我的戰績</h2><button class="modalclose" id="pgClose" aria-label="關閉">✕</button></div>
        <p class="pgnote" style="margin-top:-6px;">只存在這支手機（換手機或清除瀏覽器資料就會消失），沒有帳號、不會上傳。</p>
        <ul class="playerlist">${li}</ul>
        <p class="pgnote">勝場：陣營／隊伍遊戲算己方獲勝；心電感應、誰最可能算名次第一。接力畫猜與只有一個是合作遊戲，不計勝率。</p>
        ${pgStatsAskClear ? `
          <p class="error" style="text-align:center; margin:0 0 8px;">確定要清除全部戰績嗎？清除後無法復原。</p>
          <div class="row"><button class="btn-secondary" id="pgClearNo">取消</button><button class="btn-secondary pgdanger" id="pgClearYes">確定清除</button></div>
        ` : `<button class="btn-secondary pgdanger" id="pgClearBtn" ${any?'':'disabled'}>清除戰績</button>`}
      </div>
    </div>`;
}
function pgRenderOverlay(){
  try{
    const el = document.getElementById("pgOverlay");
    if(!el) return;
    el.innerHTML = pgOverlay==="display" ? pgDisplayModalHtml() : pgOverlay==="stats" ? pgStatsModalHtml() : "";
    if(!pgOverlay) return;
    const $ = id => document.getElementById(id);
    $("pgClose").onclick = pgCloseOverlay;
    $("pgBackdrop").onclick = e=>{ if(e.target.id==="pgBackdrop") pgCloseOverlay(); };
    if(pgOverlay==="display"){
      $("pgDone").onclick = pgCloseOverlay;
      $("pgSndToggle").onclick = ()=>{ setSoundEnabled(!soundEnabled); if(soundEnabled) cue("tick"); pgRenderOverlay(); $("pgSndToggle").focus(); };
      $("pgCbToggle").onclick = ()=>{ pgSetColorblind(!pgSettings.cb); pgRenderOverlay(); $("pgCbToggle").focus(); };
      document.querySelectorAll("[data-pgfs]").forEach(b=> b.onclick = ()=>{ const n = parseInt(b.dataset.pgfs,10); pgSetFontScale(n); pgRenderOverlay(); const nb = document.querySelector(`[data-pgfs="${n}"]`); if(nb) nb.focus(); });
    } else {
      const cb = $("pgClearBtn"); if(cb) cb.onclick = ()=>{ pgStatsAskClear = true; pgRenderOverlay(); const y = $("pgClearNo"); if(y) y.focus(); };
      const no = $("pgClearNo"); if(no) no.onclick = ()=>{ pgStatsAskClear = false; pgRenderOverlay(); };
      const yes = $("pgClearYes"); if(yes) yes.onclick = ()=>{ pgStatsClear(); pgStatsAskClear = false; pgRenderOverlay(); };
    }
  }catch(e){}
}
function pgOpenOverlay(kind){
  try{ pgFocusBack = document.activeElement; }catch(e){}
  pgOverlay = kind; pgStatsAskClear = false;
  pgRenderOverlay();
  try{ document.getElementById("pgClose").focus(); }catch(e){}
}
function pgCloseOverlay(){
  pgOverlay = null; pgStatsAskClear = false;
  pgRenderOverlay();
  try{ if(pgFocusBack && pgFocusBack.focus && document.contains(pgFocusBack)) pgFocusBack.focus(); }catch(e){}
  pgFocusBack = null;
}

// 包在原本的 render() 外面：先做「狀態轉換」的事（提示音、戰績、第一次教學），再畫，最後補無障礙屬性。
function render(){
  pgBeforeRender();
  renderScreen();
  pgAfterRender();
}
function pgBeforeRender(){
  try{
    if(!helpModalOpen) pgHelpAuto = false;
    if(!identity || !roomData || !roomData.exists) return;
    const code = identity.code, gt = roomData.gameType || "telepathy";
    pgPlayCues(pgCueTick(roomData, playersData, identity.playerId, code));
    if(roomData.phase==="ended") pgRecordGame(roomData, playersData, identity.playerId, code);
    if(pgCountdownTick(roomData, identity.playerId, votesData, remainingSeconds())) cue("tick");
    // 第一次進到這個遊戲的大廳：自動打開玩法說明一次（記起來之後不再自動跳出；手動 ❓ 仍可開）
    if(roomData.phase==="lobby" && !pgHelpSeen(gt)){
      pgMarkHelpSeen(gt);
      if(!helpModalOpen){ helpModalOpen = true; pgHelpAuto = true; }
    }
  }catch(e){}
}
function pgAfterRender(){
  try{
    // 玩法說明：補上「我知道了」收尾按鈕（自動跳出的那次文字是「我知道了，不再自動顯示」）
    if(helpModalOpen){
      const sheet = document.querySelector("#helpBackdrop .modalsheet");
      if(sheet && !sheet.querySelector(".helpgot")){
        const b = document.createElement("button");
        b.className = "btn-primary helpgot";
        b.textContent = pgHelpAuto ? "我知道了，不再自動顯示" : "我知道了";
        b.onclick = ()=>{ helpModalOpen = false; pgHelpAuto = false; render(); };
        sheet.appendChild(b);
      }
    }
    // 無障礙：彈窗角色、頭像按鈕狀態
    document.querySelectorAll("#app .modalsheet").forEach(m=>{ m.setAttribute("role","dialog"); m.setAttribute("aria-modal","true"); });
    document.querySelectorAll("#app .modalclose").forEach(b=>{ if(!b.getAttribute("aria-label")) b.setAttribute("aria-label","關閉"); });
    document.querySelectorAll("#app .tab").forEach(t=>{ t.setAttribute("role","button"); t.setAttribute("tabindex","0"); });
  }catch(e){}
}
function pgWireChrome(){
  try{
    pgApplyDisplay(); pgSyncControls(); pgInstallAudioUnlock();
    const s = document.getElementById("pgSndBtn");
    if(s) s.onclick = ()=>{ setSoundEnabled(!soundEnabled); if(soundEnabled) cue("tick"); try{ render(); }catch(e){} };
    const d = document.getElementById("pgDispBtn");
    if(d) d.onclick = ()=> pgOpenOverlay("display");
    document.addEventListener("keydown", e=>{
      if(e.key==="Escape"){
        if(pgOverlay){ pgCloseOverlay(); return; }
        if(helpModalOpen){ helpModalOpen = false; pgHelpAuto = false; render(); }
        return;
      }
      // role="button" 的非 <button> 元素（分頁標籤、機密代號的牌）：Enter / 空白鍵等同點擊
      const t = e.target;
      if((e.key==="Enter" || e.key===" ") && t && t.getAttribute && t.getAttribute("role")==="button" && t.tagName!=="BUTTON"){ e.preventDefault(); t.click(); }
    });
  }catch(e){}
}
