//#@ logic
//#if standalone

// 「接力畫猜」的題目：主體 + 地點 + 動作 隨機各抽一個組成一句情境描述，增加難度與變化。
//#endif
const DRAW_SUBJECTS = [
  "貓","狗","大象","鯊魚","恐龍","忍者","海盜","巫婆","超人","機器人",
  "美人魚","殭屍","外星人","國王","公主","消防員","太空人","企鵝","蜜蜂","老鼠",
  "老虎","猴子","長頸鹿","無尾熊","浣熊","狐狸","兔子","貓頭鷹","烏龜","章魚",
  "螃蟹","蝙蝠","袋鼠","北極熊","獅子","牛仔","騎士","吸血鬼","狼人","精靈",
  "矮人","巨人","天使","魔法師","偵探","廚師","醫生","老師","郵差","警察"
];
const DRAW_PLACES = [
  "廚房","月球","海底","沙漠","教室","電梯裡","游泳池","山頂","超市","動物園",
  "辦公室","地下室","遊樂園","叢林","火山口","機場","圖書館","婚禮現場","塞車的馬路上","外太空",
  "沙灘","雪山","溫泉","便利商店","電影院","百貨公司","菜市場","夜市","公園","溜冰場",
  "健身房","美容院","加油站","停車場","郵局","銀行","法院","醫院","消防局","警察局",
  "墓地","城堡裡","地鐵站","火車上","飛機上","潛水艇裡","太空站","遊輪甲板上","馬戲團","足球場"
];
const DRAW_ACTIONS = [
  "跳舞","打噴嚏","吃火鍋","打電動","彈鋼琴","放風箏","刷牙","打籃球","修理東西","拍照",
  "逃跑","打瞌睡","唱卡拉OK","綁鞋帶","騎腳踏車","洗澡","打架","烤肉","滑雪","扮鬼臉",
  "跳繩","游泳","潛水","衝浪","滑板","溜滑梯","盪鞦韆","爬樹","野餐","露營",
  "釣魚","打排球","打羽球","踢足球","拳擊","舉重","做瑜珈","跑步","騎馬","划船",
  "彈吉他","唱歌","跳芭蕾","變魔術","表演雜耍","吹泡泡","放煙火","親吻","打呼","哭泣"
];
function pickDrawPrompt(usedKeys){
  const usedSet = new Set(usedKeys||[]);
  let key, si, pi, ai, tries = 0;
  do{
    si = Math.floor(Math.random()*DRAW_SUBJECTS.length);
    pi = Math.floor(Math.random()*DRAW_PLACES.length);
    ai = Math.floor(Math.random()*DRAW_ACTIONS.length);
    key = si+"-"+pi+"-"+ai;
    tries++;
  }while(usedSet.has(key) && tries<30);
  const resetUsed = usedSet.has(key);
  const subject = DRAW_SUBJECTS[si], place = DRAW_PLACES[pi], action = DRAW_ACTIONS[ai];
  const text = `${subject}在${place}${action}`;
  return {key, text, subject, place, action, resetUsed};
}

//#@ view
//#if standalone
// ---------- 接力畫猜：畫布 ----------

// 畫布固定內部解析度，用 CSS 縮放成響應式大小；座標一律換算成 0~1 的相對位置存進資料庫，
// 這樣不同螢幕大小/裝置的人看到的畫都會對齊，不會因為畫布尺寸不同而變形錯位。
//#endif
function replayStrokesOnCanvas(canvas, strokes){
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#2b2b2b";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  (strokes||[]).forEach(s=>{
    const path = s.path||[];
    if(path.length<1) return;
    ctx.beginPath();
    path.forEach((pt,i)=>{
      const x = pt[0]*canvas.width, y = pt[1]*canvas.height;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  });
}

function setupDrawCanvas(canvasId, enabled){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  canvas.width = 600; canvas.height = 450;
  replayStrokesOnCanvas(canvas, strokesData);
  if(!enabled) return;
  let currentPath = null;
  function posFromEvent(e){
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return [Math.max(0,Math.min(1,x)), Math.max(0,Math.min(1,y))];
  }
  function onDown(e){
    e.preventDefault();
    drawingInProgress = true; // 畫的當下暫停整頁重畫，不然畫布會被背景更新換掉、畫一半跳掉
    currentPath = [posFromEvent(e)];
    try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
  }
  function onMove(e){
    if(!currentPath) return;
    currentPath.push(posFromEvent(e));
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#2b2b2b"; ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.lineCap = "round";
    const n = currentPath.length;
    if(n>=2){
      const [x1,y1] = currentPath[n-2], [x2,y2] = currentPath[n-1];
      ctx.beginPath();
      ctx.moveTo(x1*canvas.width, y1*canvas.height);
      ctx.lineTo(x2*canvas.width, y2*canvas.height);
      ctx.stroke();
    }
  }
  function onUp(){
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    const path = currentPath;
    currentPath = null;
    drawingInProgress = false;
    if(path && path.length>1) commitStroke(path);
    else render();
  }
  canvas.addEventListener("pointerdown", onDown);
}

async function commitStroke(path){
  const stroke = {round: roomData.round, playerId: identity.playerId, path, ts: Date.now()};
  // 先樂觀地把這一筆加進本地資料重畫一次，免得放開手指那瞬間、資料庫還沒回傳前畫面閃一下不見；
  // 等 onSnapshot 真的收到這筆資料時，strokesData 會整包被換成資料庫的版本，這筆本地暫存會自然被取代掉。
  strokesData = strokesData.concat([{...stroke, id:`local_${Date.now()}_${Math.random().toString(36).slice(2,7)}`}]);
  render();
  try{
//#if standalone
    await strokesCol.doc().set(stroke);
//#else
    await strokesCol.add(stroke);
//#endif
    touchActivity();
  }catch(e){}
}

// ---------- 接力畫猜：畫面 ----------

// 拉霸式抽題動畫：三個字詞欄位各自快速跑動後依序停下，最後停在真正抽到的題目。
// 期間把 drawPromptAnimating 設為 true，讓 render() 暫停整頁重畫，避免動畫被打斷。
function playDrawSlotAnim(subject, place, action){
  const elS = document.getElementById("slotSubject");
  const elP = document.getElementById("slotPlace");
  const elA = document.getElementById("slotAction");
  if(!elS || !elP || !elA){ drawPromptAnimating = false; return; }
  drawPromptAnimating = true;
  const reels = [
    {el: elS, pool: DRAW_SUBJECTS, final: subject, stopAt: 650},
    {el: elP, pool: DRAW_PLACES, final: place, stopAt: 950},
    {el: elA, pool: DRAW_ACTIONS, final: action, stopAt: 1300}
  ];
  const start = Date.now();
  reels.forEach((r, i)=>{
    r.el.classList.add("spin");
    const tick = ()=>{
      const elapsed = Date.now() - start;
      if(elapsed >= r.stopAt){
        r.el.textContent = r.final;
        r.el.classList.remove("spin");
        r.el.classList.add("landed");
        beep(520 + i*160, 70, "square");
        vibrate(12);
        return;
      }
      r.el.textContent = r.pool[Math.floor(Math.random()*r.pool.length)];
      const delay = (r.stopAt - elapsed) < 220 ? 110 : 55;
      setTimeout(tick, delay);
    };
    tick();
  });
  setTimeout(()=>{ drawPromptAnimating = false; render(); }, 1300 + 120);
}

function renderDrawTurn(me, isHost){
  const duration = (roomData.settings && roomData.settings.turnSeconds) || 12;
  const remain = remainingSeconds();
  const remainInt = Math.ceil(remain);
  const frac = Math.max(0, Math.min(1, remain/duration));
  const R = 44, C = 2*Math.PI*R;
  const dashoffset = C*(1-frac);
  const totalRounds = (roomData.settings && roomData.settings.totalRounds) || 6;
  const drawOrder = roomData.drawOrder || [];
  const drawerIndex = roomData.currentDrawerIndex || 0;
  const currentDrawerId = drawOrder[drawerIndex];
  const guesserId = roomData.currentGuesserId;
  const iAmGuesser = identity.playerId === guesserId;
  const iAmDrawer = identity.playerId === currentDrawerId;
  const guesserP = playersData.find(p=>p.id===guesserId);
  const drawerP = playersData.find(p=>p.id===currentDrawerId);
  const needSlotAnim = !iAmGuesser && drawPromptAnimRound !== roomData.round;

  app.innerHTML = `
    <div class="card">
      <div class="badge purple">接力畫猜 · 第 ${roomData.round}/${totalRounds} 輪</div>
      <div class="timerzone">
        <div class="ring-wrap">
          <svg viewBox="0 0 100 100">
            <circle class="ring-bg" cx="50" cy="50" r="${R}"></circle>
            <circle class="ring-fg ${frac<0.25?'low':''}" cx="50" cy="50" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${dashoffset}"></circle>
          </svg>
          <div class="ring-num digits">${remainInt}</div>
        </div>
      </div>
      ${iAmGuesser ? `
        <p class="helper" style="margin:-4px 0 4px;">🙈 這輪你是猜謎者，先別偷看題目，等大家畫完你再猜！</p>
      ` : needSlotAnim ? `
        <div class="qtext">題目：🎰 <span class="drawslot" id="slotSubject">${esc(DRAW_SUBJECTS[0])}</span>在<span class="drawslot" id="slotPlace">${esc(DRAW_PLACES[0])}</span><span class="drawslot" id="slotAction">${esc(DRAW_ACTIONS[0])}</span></div>
        <p class="helper" style="margin:-4px 0 4px;">抽題中…</p>
      ` : `
        <div class="qtext">題目：${esc(roomData.currentPrompt||"")}</div>
        <p class="helper" style="margin:-4px 0 4px;">${iAmDrawer ? '✏️ 輪到你畫了！' : `⏳ 輪到 <b>${drawerP?esc(drawerP.name):''}</b> 畫`}</p>
      `}
      <div class="drawcanvas-wrap ${iAmDrawer ? '' : 'locked'}">
        <canvas id="drawCanvas"></canvas>
      </div>
      <div class="drawturnstrip">
        ${drawOrder.map((id,i)=>{
          const p = playersData.find(pp=>pp.id===id);
          if(!p) return "";
          const cls = i<drawerIndex ? 'done' : (i===drawerIndex ? 'current' : '');
          return `<span class="drawturnchip ${cls}">${avatarOf(p)} ${esc(p.name)}${i<drawerIndex?' ✓':''}</span>`;
        }).join("")}
        ${guesserP ? `<span class="drawturnchip">🙈 ${avatarOf(guesserP)} ${esc(guesserP.name)}</span>` : ``}
      </div>
    </div>
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  setupDrawCanvas("drawCanvas", iAmDrawer);
  document.getElementById("leaveBtn").onclick = doLeave;
  if(needSlotAnim){
    drawPromptAnimRound = roomData.round;
    playDrawSlotAnim(roomData.drawSubject || "", roomData.drawPlace || "", roomData.drawAction || "");
  }
}

function renderDrawGuessing(isHost){
  const guesserId = roomData.currentGuesserId;
  const iAmGuesser = identity.playerId === guesserId;
  const guesserP = playersData.find(p=>p.id===guesserId);

  app.innerHTML = `
    <div class="card">
      <div class="badge red">🙈 猜謎時間</div>
      <p class="helper" style="margin-top:-4px;">${iAmGuesser ? '仔細看這張接力畫，猜猜大家畫的是什麼！' : `等待 <b>${guesserP?esc(guesserP.name):''}</b> 看畫猜答案…`}</p>
      <div class="drawcanvas-wrap">
        <canvas id="drawCanvas"></canvas>
      </div>
      ${iAmGuesser ? `
        <input type="text" id="guessInput" class="guessinput" maxlength="20" placeholder="輸入你猜的答案" value="${esc(drawGuessInput)}">
        <button class="btn-primary" id="submitGuessBtn">送出猜的答案</button>
      ` : ``}
    </div>
    ${isHost ? `<button class="btn-secondary" id="revealBtn" style="margin-top:10px;">直接公布答案</button>` : ``}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  setupDrawCanvas("drawCanvas", false);
  if(iAmGuesser){
    const input = document.getElementById("guessInput");
    input.oninput = (e)=>{ drawGuessInput = e.target.value; };
    document.getElementById("submitGuessBtn").onclick = submitDrawGuess;
  }
  if(isHost){
    document.getElementById("revealBtn").onclick = ()=> revealDrawAnswer(null);
  }
  document.getElementById("leaveBtn").onclick = doLeave;
}

function renderDrawReveal(isHost){
  const totalRounds = (roomData.settings && roomData.settings.totalRounds) || 6;
  const isLastRound = roomData.round >= totalRounds;
  const guess = roomData.guesserGuess;
  const guesserP = playersData.find(p=>p.id===roomData.currentGuesserId);

  app.innerHTML = `
    <div class="card">
      <div class="badge red">結果公布</div>
      <div class="drawcanvas-wrap">
        <canvas id="drawCanvas"></canvas>
      </div>
      <p class="helper" style="margin-top:12px;">🎯 答案是：<b>${esc(roomData.currentPrompt||"")}</b></p>
      <p class="helper" style="margin-top:-8px;">${guess ? `${guesserP?esc(guesserP.name):'猜謎者'} 猜的是：「${esc(guess)}」` : `${guesserP?esc(guesserP.name):'猜謎者'} 用嘴巴講的，沒有輸入答案`}</p>
    </div>
    ${isHost ? `<button class="btn-primary" id="nextBtn">${isLastRound?'看總結':'繼續下一輪'}</button>` : `<p class="helper">等待房主繼續</p>`}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  setupDrawCanvas("drawCanvas", false);
  if(isHost) document.getElementById("nextBtn").onclick = isLastRound ? doEndDraw : doNextDraw;
  document.getElementById("leaveBtn").onclick = doLeave;
}

function renderDrawEnded(isHost){
  const rounds = roomData.round || 0;
  app.innerHTML = `
    <div class="card">
      <div class="badge red">完賽</div>
      <div style="text-align:center;">
        <h2 style="font-size:23px; margin-top:8px; background:linear-gradient(100deg, var(--accent), var(--safe)); -webkit-background-clip:text; background-clip:text; color:transparent;">接力畫猜結束！</h2>
        <p class="helper" style="margin-top:8px;">這局一起接力畫了 ${rounds} 輪，辛苦大家的畫工了！</p>
      </div>
    </div>
    ${isHost ? `<button class="btn-primary" id="rematchBtn">再玩一局</button>` : `<p class="helper">等待房主開始下一局</p>`}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(isHost) document.getElementById("rematchBtn").onclick = doRematchDraw;
  document.getElementById("leaveBtn").onclick = doLeave;
}

//#@ actions
// ---------- 接力畫猜：資料 / 動作 ----------

async function clearAllStrokes(){
  try{
    const scol = roomRef.collection("strokes");
    const snap = await scol.get();
    await Promise.all(snap.docs.map(dd=> scol.doc(dd.id).delete()));
  }catch(e){}
}

// 畫畫順序：依加入順序、排除猜謎者與離線的人（全員離線時退回全部，避免空名單）。
function drawOrderFor(players, guesserId){
  const now = Date.now(), me = identity && identity.playerId;
  const ord = joinOrder(players).filter(p=>p.id!==guesserId);
  const on = ord.filter(p=> p.id===me || isOnline(p, now));
  return (on.length ? on : ord).map(p=>p.id);
}

async function doStartDraw(){
  const players = playersData;
  if(players.length<2) return;
  if(!players.every(p=>p.ready)){ startError = "還有人沒按「我準備好了」，等他們準備好才能開始"; render(); return; }
  const settings = roomData.settings || {turnSeconds:12, totalRounds:6};
  const {id: guesserId} = pickMLBase(presentIds(), []);
  const {key, text, subject, place, action} = pickDrawPrompt([]);
  const drawOrder = drawOrderFor(players, guesserId);
  startError = "";
  try{
    await clearAllStrokes();
    await roomRef.update({
      phase:"drawing", round:1, currentGuesserId: guesserId, currentPrompt: text,
      drawSubject: subject, drawPlace: place, drawAction: action,
      drawOrder, currentDrawerIndex:0, roundEndAt: Date.now()+settings.turnSeconds*1000,
      usedGuesserIds:[guesserId], usedDrawPromptIdx:[key], guesserGuess:null, lastActivityAt: Date.now()
    });
  }catch(e){}
}

// 接力畫猜的「下一步」判斷（純函式）：畫畫階段時間到、或目前輪到的畫家離線 → 換下一位（或進猜謎）；
// 猜謎階段猜謎者離線 → 直接公布答案（沒有輸入答案）。其他情況回傳 null。
function drawPlan(fd, players, now, selfId){
  if(!fd) return null;
  const on = new Set(onlineIdsOf(players, now, selfId));
  const present = new Set((players||[]).map(p=>p.id));
  if(fd.phase==="drawing"){
    const drawerId = (fd.drawOrder||[])[fd.currentDrawerIndex||0];
    const timeUp = now >= (fd.roundEndAt||0);
    const gone = !!drawerId && (!present.has(drawerId) || !on.has(drawerId));
    if(timeUp || gone) return {kind:"advance", reason: timeUp ? "time" : "offline"};
    return null;
  }
  if(fd.phase==="guessing"){
    const g = fd.currentGuesserId;
    if(g && (!present.has(g) || !on.has(g))) return {kind:"reveal"};
  }
  return null;
}

async function tryAdvanceDraw(){
  if(resolveBusy) return;
  if(!roomData || roomData.phase!=="drawing") return;
  resolveBusy = true;
  try{
    await withFreshRoom(async (fd, players)=>{
      if(fd.phase!=="drawing") return;
      const plan = drawPlan(fd, players, Date.now(), identity.playerId);
      if(!plan || plan.kind!=="advance") return;
      const drawOrder = fd.drawOrder||[];
      const nextIndex = (fd.currentDrawerIndex||0)+1;
      const settings = fd.settings || {turnSeconds:12, totalRounds:6};
      if(nextIndex >= drawOrder.length){
        await roomRef.update({phase:"guessing", lastActivityAt: Date.now()});
      } else {
        await roomRef.update({currentDrawerIndex: nextIndex, roundEndAt: Date.now()+settings.turnSeconds*1000, lastActivityAt: Date.now()});
      }
    }, {tries:4});
  }catch(e){}
  resolveBusy = false;
}

// 房主端看門狗：畫家離線就跳過他的回合、猜謎者離線就直接公布答案。
async function drawWatchdog(){
  if(!drawPlan(roomData, playersData, Date.now(), identity.playerId)) return;
  if(roomData.phase==="drawing") return tryAdvanceDraw();
  if(roomData.phase==="guessing") return revealDrawAnswer(null);
}

async function revealDrawAnswer(guess){
  try{
    const r = await withFreshRoom(async (fd)=>{
      if(fd.phase!=="guessing") return;   // 已經公布過了（猜謎者和房主同時按）
      await roomRef.update({phase:"reveal", guesserGuess: (guess && guess.trim()) ? guess.trim() : null, lastActivityAt: Date.now()});
    }, {tries:5});
    if(!r.ok) showToast(MSG_RETRY);
  }catch(e){}
  drawGuessInput = "";
}

async function submitDrawGuess(){
  await revealDrawAnswer(drawGuessInput);
}

async function doNextDraw(){
  const settings = roomData.settings || {turnSeconds:12, totalRounds:6};
  const nextRound = (roomData.round||1)+1;
  const {id: guesserId, resetUsed: gReset} = pickMLBase(presentIds(), roomData.usedGuesserIds);
  const {key, text, subject, place, action, resetUsed: pReset} = pickDrawPrompt(roomData.usedDrawPromptIdx);
  const usedGuesserIds = gReset ? [guesserId] : [...(roomData.usedGuesserIds||[]), guesserId];
  const usedDrawPromptIdx = pReset ? [key] : [...(roomData.usedDrawPromptIdx||[]), key];
  const drawOrder = drawOrderFor(playersData, guesserId);
  try{
    await clearAllStrokes();
    await roomRef.update({
      phase:"drawing", round: nextRound, currentGuesserId: guesserId, currentPrompt: text,
      drawSubject: subject, drawPlace: place, drawAction: action,
      drawOrder, currentDrawerIndex:0, roundEndAt: Date.now()+settings.turnSeconds*1000,
      usedGuesserIds, usedDrawPromptIdx, guesserGuess:null, lastActivityAt: Date.now()
    });
  }catch(e){}
}

async function doEndDraw(){
  try{ await roomRef.update({phase:"ended", lastActivityAt: Date.now()}); }catch(e){}
}

async function doRematchDraw(){
  try{
    await clearAllStrokes();
    await Promise.all(playersData.map(p=> playersCol.doc(p.id).update({ready:false})));
    await roomRef.update({
      phase:"lobby", round:0, currentPrompt:null, currentGuesserId:null, drawOrder:[], currentDrawerIndex:0,
      roundEndAt:null, usedGuesserIds:[], usedDrawPromptIdx:[], guesserGuess:null, lastActivityAt: Date.now()
    });
  }catch(e){}
}

