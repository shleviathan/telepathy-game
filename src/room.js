//#@ head
// ---------- data / actions ----------

//#@ actions
async function doCreate(){
  joinError = "";
  const name = homeName.trim();
  if(!name){ joinError = "請先輸入暱稱"; render(); return; }
  // 房間密碼（選填）：只是 UI 層的小門檻，明文存在房間文件裡、由用戶端比對，
  // 跟整個 app 其他部分一樣沒有伺服器端驗證，擋不住刻意去讀資料庫的人。
  const password = (homePassword||"").trim() || null;
  if(password!==null && !/^[0-9]{4}$/.test(password)){ joinError = "密碼要 4 位數字"; render(); return; }
  const d = await ensureDb();
  if(!d){ joinError = "目前無法連線建立房間，稍後再試"; render(); return; }
  app.innerHTML = `<div class="card" style="text-align:center;color:var(--muted);"><span class="spin"></span>建立房間中…</div>`;
  let code, ref, snap;
  for(let i=0;i<6;i++){
    code = roomCode(); ref = d.doc(`telepathyrooms/${code}`);
    snap = await ref.get().catch(()=>({exists:false}));
    if(!snap.exists) break;
  }
  const pid = uid();
  const gameType = homeGameType==='mostlikely' ? 'mostlikely' : (homeGameType==='draw' ? 'draw' : (homeGameType==='werewolf' ? 'werewolf' : (homeGameType==='avalon' ? 'avalon' : (homeGameType==='codenames' ? 'codenames' : (homeGameType==='justone' ? 'justone' : 'telepathy')))));
  const settings = gameType==='mostlikely'
    ? {duration:25, totalRounds:8}
    : gameType==='draw'
    ? {turnSeconds:12, totalRounds:6}
    : gameType==='werewolf'
    ? {roles:{seer:true, witch:false, hunter:false, guard:false}}
    : gameType==='avalon'
    ? {roles:{percival:true, morgana:true, mordred:false}}
    : gameType==='codenames'
    ? {}
    : gameType==='justone'
    ? {totalRounds:13}
    : {duration:15, targetStrikes:3, enabledCategories:ALL_CATEGORY_IDS, mode:"normal"};
  try{
    await ref.set({
      gameType, phase:"lobby", round:0, settings, password,
      currentQuestion:null, currentPrompt:null, roundEndAt:null, revealLog:[], losers:[],
      usedQKeys:[], usedPromptIdx:[],
      currentGuesserId:null, usedGuesserIds:[], usedDrawPromptIdx:[], drawOrder:[], currentDrawerIndex:0, guesserGuess:null,
      roles:{}, nightStep:null, guardTarget:null, wolfVotes:{}, wolfTarget:null, seerTarget:null, seerResult:null,
      witchAction:null, witchPoisonTarget:null, witchSaveUsed:false, witchPoisonUsed:false,
      nightDeaths:[], hunterQueue:[], hunterNextPhase:null, voteTally:{}, voteResult:null, winner:null,
      acks:{}, leaderId:null, missionNo:0, missionResults:[], rejectCount:0, teamSelection:[], teamVotes:{}, missionVotes:{},
      lastMissionFails:0, assassinTarget:null, winReason:null,
      board:[], spymasters:null, startTeam:null, turnTeam:null, clue:null, guessesLeft:0, clueLog:[], redLeft:0, blueLeft:0,
      deck:[], deckIndex:0, guesserOrder:[], guesserId:null, cardsUsed:0, score:0, clueEligible:[], hints:{}, validHints:[], removedIds:[],
      joGuess:null, joVerdict:null, joOverridden:false, joLog:[],
      createdAt: Date.now(), lastActivityAt: Date.now()
    });
    await ref.collection("players").doc(pid).set({ name, avatar:homeAvatar, joinedAt: Date.now(), lastSeen: Date.now(), strikes:0, mlScore:0, ready:false });
  }catch(e){ joinError="建立房間失敗，請再試一次"; render(); return; }
  identity = {code, playerId: pid, name};
  homePassword = "";
  saveIdentity(identity);
  connectRoom();
}

async function doJoin(){
  joinError = "";
  const name = homeName.trim();
  const code = homeCode.trim().toUpperCase();
  if(!name){ joinError = "請先輸入暱稱"; render(); return; }
  if(code.length!==4){ joinError = "房間代碼是 4 碼"; render(); return; }
  const d = await ensureDb();
  if(!d){ joinError = "目前無法連線加入房間，稍後再試"; render(); return; }
  const ref = d.doc(`telepathyrooms/${code}`);
  const snap = await ref.get().catch(()=>({exists:false}));
  if(!snap.exists){ joinError = "找不到這個房間，確認代碼是否正確"; render(); return; }
  const rd = snap.data()||{};
  const lastActive = rd.lastActivityAt || rd.createdAt || 0;
  if(lastActive && (Date.now()-lastActive > ROOM_EXPIRE_MS)){
    joinError = "這個房間已經太久沒有動靜、過期了，請朋友開一個新房間";
    deleteRoomBestEffort(ref);
    render(); return;
  }
  // 舊房間沒有 password 欄位（undefined/null）= 不需要密碼。已加入者的 identity 存在 sessionStorage，
  // 重新整理走 connectRoom()，不經過這裡，所以不用重填密碼。（UI 層門檻，見 doCreate 註解。）
  if(rd.password){
    if(String(homePassword||"").trim() !== String(rd.password)){ joinError = "這個房間需要密碼，或密碼不正確"; render(); return; }
  }
  const pid = uid();
  try{ await ref.collection("players").doc(pid).set({ name, avatar:homeAvatar, joinedAt: Date.now(), lastSeen: Date.now(), strikes:0, mlScore:0, ready:false }); }
  catch(e){ joinError="加入房間失敗，請再試一次"; render(); return; }
  try{ await ref.update({lastActivityAt: Date.now()}); }catch(e){}
  identity = {code, playerId: pid, name};
  homePassword = "";
  saveIdentity(identity);
  connectRoom();
}

// 從分享連結（?code=XXXX）進來時，查一次房間有沒有密碼；有的話把游標放到密碼欄。查不到就算了。
async function probeSharedRoomPassword(){
  try{
    const code = homeCode;
    const d = await ensureDb(); if(!d || identity || homeTab!=='join' || homeCode!==code) return;
    const snap = await d.doc(`telepathyrooms/${code}`).get();
    if(!snap.exists || !(snap.data()||{}).password) return;
    const el = document.getElementById("passwordInput");
    if(el && el.focus) el.focus();
  }catch(e){}
}

// 資料內容沒變就不要重新 render()：避免彈跳視窗（設定/玩法說明）在開著的時候，
// 因為背景輪詢或監聽觸發整個畫面重繪、視窗看起來一直閃一下（重新播放滑入動畫）。
function sameData(a,b){
  try{ return JSON.stringify(a)===JSON.stringify(b); }catch(e){ return false; }
}

function connectRoom(){
  const d = db;
  roomRef = wrapRoomRef(d.doc(`telepathyrooms/${identity.code}`));
  playersCol = roomRef.collection("players");
  roomData = null; playersData = [];
  expireCleanupDone = false;
  soundedRound = null;
  mlRevealAnimRound = null; mlRevealReady = false; mlSoundedRound = null; mlRankOrder = null; mlRankOrderRound = null;
  drawingInProgress = false; drawGuessInput = ""; strokesData = []; drawPromptAnimRound = null; drawPromptAnimating = false;
  witchPoisonPickOpen = false;
  if(unsubRoom) unsubRoom();
  if(unsubPlayers) unsubPlayers();
  unsubRoom = roomRef.onSnapshot(snap=>{
    const next = {exists: snap.exists, ...(snap.data()||{})};
    if(sameData(next, roomData)) return;
    roomData = next;
    render();
  }, ()=>{ roomData = {exists:false}; render(); });
  unsubPlayers = playersCol.onSnapshot(qsnap=>{
    applyPlayers(qsnap.docs.map(dd=>({id:dd.id, ...dd.data()})));
  }, ()=>{});
  render();
  if(pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollRoomOnce, 2000);
  startPresence();
}

// 保底機制：即時監聽偶爾會漏更新（尤其手機網路不穩時），
// 每幾秒主動抓一次最新房間狀態，避免有人卡在舊畫面看不到別人已經開始遊戲。
// 資料跟目前畫面一樣的話就不 render()，不然設定/玩法說明視窗開著的時候會一直被重畫、看起來像自動刷新。
async function pollRoomOnce(){
  if(!roomRef) return;
  try{
    const snap = await roomRef.get();
    const next = {exists: snap.exists, ...(snap.data()||{})};
    if(!sameData(next, roomData)){ roomData = next; render(); }
  }catch(e){}
  if(!playersCol) return;
  try{
    const qsnap = await playersCol.get();
    applyPlayers(qsnap.docs.map(dd=>({id:dd.id, ...dd.data()})));
  }catch(e){}
}

// 這一題「在線的玩家」是不是都投了（離線的人不用等，不然會卡到時間結束）。
function voteRoundComplete(){
  if(!playersData.length || !identity) return false;
  const voted = new Set(votesData.map(v=>v.playerId));
  return onlineIdsOf(playersData, Date.now(), identity.playerId).every(id=> voted.has(id));
}

function manageVoteSub(phase){
  const wantVotes = phase === "question";
  if(wantVotes && !unsubVotes){
    votesCol = roomRef.collection("votes");
    unsubVotes = votesCol.where("round","==",roomData.round).onSnapshot(qsnap=>{
      votesData = qsnap.docs.map(dd=>({id:dd.id, ...dd.data()}));
      render();
      if(voteRoundComplete()){
        if(roomData && roomData.gameType==="mostlikely") tryResolveML(); else tryResolve();
      }
    }, ()=>{});
  } else if(!wantVotes && unsubVotes){
    unsubVotes(); unsubVotes = null; votesData = [];
  }
}

function manageTicking(phase){
  const should = phase === "question" || phase === "drawing";
  if(should && !tickTimer){
    tickTimer = setInterval(()=>{
      if(drawingInProgress || drawPromptAnimating) return; // 正在畫的時候/拉霸動畫播放中先不要因為倒數計時重畫打斷
      render();
      if(remainingSeconds()<=0){
        if(roomData && roomData.gameType==="mostlikely") tryResolveML();
        else if(roomData && roomData.gameType==="draw") tryAdvanceDraw();
        else tryResolve();
      }
    }, 250);
  } else if(!should && tickTimer){
    clearInterval(tickTimer); tickTimer = null;
  }
}

// 「接力畫猜」的筆畫：跟 votes 一樣，依目前這一輪 round 訂閱，畫畫/猜謎/公布答案時都要看得到已經畫的東西。
function manageStrokeSub(phase){
  const wantStrokes = roomData && roomData.gameType==="draw" && (phase==="drawing" || phase==="guessing" || phase==="reveal");
  if(wantStrokes && !unsubStrokes){
    strokesCol = roomRef.collection("strokes");
    unsubStrokes = strokesCol.where("round","==",roomData.round).onSnapshot(qsnap=>{
      strokesData = qsnap.docs.map(dd=>({id:dd.id, ...dd.data()}));
      if(!drawingInProgress) render();
    }, ()=>{});
  } else if(!wantStrokes && unsubStrokes){
    unsubStrokes(); unsubStrokes = null; strokesData = [];
  }
}

function leaveToHome(){
  if(unsubRoom) unsubRoom(); if(unsubPlayers) unsubPlayers(); if(unsubVotes) unsubVotes(); if(unsubStrokes) unsubStrokes();
  if(pollTimer){ clearInterval(pollTimer); pollTimer=null; }
  stopPresence();
  if(tickTimer){ clearInterval(tickTimer); tickTimer=null; }
  clearRevealTimers(); revealAnimRound = null; revealStage = 0;
  mlRevealAnimRound = null; mlRevealReady = false; mlSoundedRound = null; mlRankOrder = null; mlRankOrderRound = null;
  drawingInProgress = false; drawGuessInput = ""; strokesData = []; drawPromptAnimRound = null; drawPromptAnimating = false;
  witchPoisonPickOpen = false;
  unsubRoom=unsubPlayers=unsubVotes=unsubStrokes=null; roomRef=playersCol=votesCol=strokesCol=null; roomData=null; playersData=[]; votesData=[];
  identity = null; saveIdentity(null);
  render();
}

async function doLeave(){
  try{ await playersCol.doc(identity.playerId).delete(); }catch(e){}
  leaveToHome();
}

async function updateSettings(patch){
  const s = Object.assign({}, roomData.settings||{}, patch);
  try{ await roomRef.update({settings:s}); }catch(e){}
}

async function doStartGame(){
  const players = playersData;
  if(players.length<2) return;
  if(!players.every(p=>p.ready)){ startError = "還有人沒按「我準備好了」，等他們準備好才能開始"; render(); return; }
  const settings = roomData.settings || {duration:15, targetStrikes:3, enabledCategories:ALL_CATEGORY_IDS};
  const {idx, pool, resetUsed} = pickQuestion([], settings.enabledCategories);
  if(idx<0){ startError = "選取的題目類型目前沒有任何題目，請至少勾選一種類型"; render(); return; }
  startError = "";
  const {q, options} = materializeQuestion(pool[idx], players, 1);
  const usedQKeys = [pool[idx].key];
  try{
    await clearAllVotes();
    await Promise.all(players.map(p=> playersCol.doc(p.id).update({strikes:0})));
    clearRevealTimers(); revealAnimRound = null; revealStage = 0;
    await roomRef.update({
      phase:"question", round:1, currentQuestion:{q, options},
      roundEndAt: Date.now() + settings.duration*1000, revealLog:[], losers:[], usedQKeys, lastActivityAt: Date.now()
    });
  }catch(e){}
}
let startError = "";

async function castVote(choice){
  if(voteBusy) return;
  voteBusy = true;
  const voteId = `${roomData.round}_${identity.playerId}`;
  try{
    await votesCol.doc(voteId).set({round: roomData.round, playerId: identity.playerId, choice, ts: Date.now()});
    playVoteSound();
    touchActivity();
  }catch(e){}
  voteBusy = false;
}

async function tryResolve(){
  if(resolveBusy) return;
  if(!roomData || roomData.phase!=="question") return;
  resolveBusy = true;
  try{
    // 短租約鎖 + 重新抓房間/玩家（冪等：已經結算過 phase 就不是 question 了）。搶不到鎖就算了，
    // 別的客戶端正在結算，或之後由計時器 / 房主看門狗再試。
    await withFreshRoom(async (fd, freshPlayers)=>{
      if(fd.phase!=="question") return;
      // 玩家名單用現場抓的，不要用本地快取的 playersData——
//#if standalone
      // 這裡會有 await，快取可能在等待期間被 onSnapshot 換成「已經扣過分」的新資料，
//#else
      // 這裡會有 await，快取可能在等待期間被即時監聽換成「已經扣過分」的新資料，
//#endif
      // 如果還拿快取來算「扣分後是不是達標」會整組多算一次分（導致明明還沒到目標分數就結束遊戲）。
      const allVotedSnap = await votesCol.where("round","==",fd.round).get().catch(()=>({docs:[]}));
      const roundVotes = allVotedSnap.docs.map(dd=>dd.data());
      const timeUp = Date.now() >= (fd.roundEndAt||0);
      const voted = new Set(roundVotes.map(v=>v.playerId));
      // 離線的人不用等：只要在線的人都投了就結算（沒投的人照舊算沒作答）。
      const allVoted = freshPlayers.length>0 && onlineIdsOf(freshPlayers, Date.now(), identity.playerId).every(id=> voted.has(id));
      if(!timeUp && !allVoted) return;

      const byOption = {A:[],B:[],C:[],D:[]};
      const votedIds = new Set();
      roundVotes.forEach(v=>{ if(byOption[v.choice]){ byOption[v.choice].push(v.playerId); votedIds.add(v.playerId); } });
      const mode = (fd.settings && fd.settings.mode) || "normal";
      const struckIds = [];
      if(mode==="majority"){
        const counts = LETTERS.map(L=>byOption[L].length).filter(c=>c>0);
        const maxCount = counts.length ? Math.max(...counts) : 0;
        const leading = new Set(LETTERS.filter(L=>byOption[L].length===maxCount && maxCount>0));
        LETTERS.forEach(L=>{ if(byOption[L].length>0 && !leading.has(L)) struckIds.push(...byOption[L]); });
      } else {
        LETTERS.forEach(L=>{ if(byOption[L].length===1) struckIds.push(byOption[L][0]); });
      }
      const noAnswerIds = freshPlayers.map(p=>p.id).filter(id=>!votedIds.has(id));
      const allStruck = new Set([...struckIds, ...noAnswerIds]);

      const newStrikesById = new Map();
      await Promise.all(freshPlayers.map(p=>{
        if(allStruck.has(p.id)){
          const ns = (p.strikes||0)+1;
          newStrikesById.set(p.id, ns);
          return playersCol.doc(p.id).update({strikes:ns});
        }
        return Promise.resolve();
      }));

      const target = (fd.settings && fd.settings.targetStrikes) || 3;
      const losers = freshPlayers.filter(p=> newStrikesById.has(p.id) && newStrikesById.get(p.id) >= target).map(p=>({id:p.id, name:p.name}));

      const log = (fd.revealLog||[]).slice();
      log.push({round: fd.round, q: fd.currentQuestion.q, options: fd.currentQuestion.options, byOption, struckIds, noAnswerIds});

      if(losers.length>0){
        await roomRef.update({phase:"ended", losers, revealLog: log, lastActivityAt: Date.now()});
      } else {
        await roomRef.update({phase:"reveal", revealLog: log, lastActivityAt: Date.now()});
      }
    }, {tries:4});
  }catch(e){}
  resolveBusy = false;
}

async function doNextQuestion(){
  const settings = roomData.settings || {duration:15, targetStrikes:3, enabledCategories:ALL_CATEGORY_IDS};
  const {idx, pool, resetUsed} = pickQuestion(roomData.usedQKeys, settings.enabledCategories);
  if(idx<0) return;
  const nextRound = (roomData.round||1)+1;
  const {q, options} = materializeQuestion(pool[idx], playersData, nextRound);
  const usedQKeys = resetUsed ? [pool[idx].key] : [...(roomData.usedQKeys||[]), pool[idx].key];
  try{
    await roomRef.update({
      phase:"question", round:nextRound, currentQuestion:{q, options},
      roundEndAt: Date.now() + settings.duration*1000, usedQKeys, lastActivityAt: Date.now()
    });
  }catch(e){}
}

// 投票紀錄的文件 id 是「回合數_玩家id」，重開一局後回合數會從 1 重新算，
// 如果不清掉舊局留下的投票紀錄，新局第 1 題一開始就會直接讀到「上一局第 1 題」的舊答案，
// 造成「一進去就顯示已經選過答案」甚至看起來像亂選一個選項。
async function clearAllVotes(){
  try{
    const vcol = roomRef.collection("votes");
    const snap = await vcol.get();
    await Promise.all(snap.docs.map(dd=> vcol.doc(dd.id).delete()));
  }catch(e){}
}

async function doRematch(){
  try{
    await clearAllVotes();
    await Promise.all(playersData.map(p=> playersCol.doc(p.id).update({strikes:0, ready:false})));
    await roomRef.update({phase:"lobby", round:0, currentQuestion:null, roundEndAt:null, revealLog:[], losers:[], usedQKeys:[], lastActivityAt: Date.now()});
  }catch(e){}
}

async function toggleReady(){
  try{
    const me = playersData.find(p=>p.id===identity.playerId);
    await playersCol.doc(identity.playerId).update({ready: !(me && me.ready)});
    touchActivity();
  }catch(e){}
}

// 房主踢除某位玩家：直接把對方的玩家文件刪掉，
// 對方的畫面偵測到自己不在玩家名單裡（render() 裡的 !me 判斷）就會自動顯示「已不在房間」。
async function doKick(id){
  try{ await playersCol.doc(id).delete(); }catch(e){}
}

