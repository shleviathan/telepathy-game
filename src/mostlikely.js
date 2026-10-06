//#@ logic
// 「誰最可能」的題目：不需要主角/選項，每題就是丟一句敘述，大家投票選房間裡的某個人。
const MOST_LIKELY_PROMPTS = [
  "最有可能半夜傳訊息找朋友聊天的人",
  "最有可能忘記帶鑰匙或錢包出門的人",
  "最有可能中樂透後低調不說的人",
  "最有可能遲到卻理由一堆的人",
  "最有可能偷偷存錢去做一件瘋狂事的人",
  "最有可能在聚會上突然消失的人",
  "最有可能把秘密講出去的人",
  "最有可能三十歲後才轉行的人",
  "最有可能半夜還在滑手機的人",
  "最有可能買東西從不看價錢的人",
  "最有可能被路人問路的人",
  "最有可能在KTV搶麥的人",
  "最有可能忘記朋友生日的人",
  "最有可能最先結婚的人",
  "最有可能最晚結婚的人",
  "最有可能一個人去旅行的人",
  "最有可能把工作辭掉去環遊世界的人",
  "最有可能在群組已讀不回的人",
  "最有可能半夜餓了會爬起來煮泡麵的人",
  "最有可能被騙但還不知道的人",
  "最有可能養很多寵物的人",
  "最有可能哭點很低的人",
  "最有可能吵架時先道歉的人",
  "最有可能記得所有人生日的人",
  "最有可能突然搬去別的城市生活的人",
  "最有可能開直播被笑場的人",
  "最有可能一年沒運動的人",
  "最有可能敢一個人去看恐怖片的人",
  "最有可能私底下很有才藝但沒讓大家知道的人",
  "最有可能欠錢不還（然後忘記）的人",
  "最有可能明明很累還撐著陪朋友聊天的人",
  "最有可能買很貴的東西卻捨不得用的人",
  "最有可能睡過頭錯過重要行程的人",
  "最有可能同時談好幾個興趣但都學一半的人",
  "最有可能是這群人裡最會忍耐的人",
  "最有可能突然翻臉的人",
  "最有可能是這群人裡最會賺錢的人",
  "最有可能被求婚會當場愣住的人",
  "最有可能默默觀察大家、其實什麼都知道的人",
  "最有可能十年後變得完全不一樣的人"
];
// 用 usedIdx（這一局已經抽過的題目索引）排除重複，抽完整組才重新洗牌。
function pickMLPrompt(usedIdx){
  const usedSet = new Set(usedIdx||[]);
  let candidates = MOST_LIKELY_PROMPTS.map((_,i)=>i).filter(i=>!usedSet.has(i));
  let resetUsed = false;
  if(candidates.length===0){
    candidates = MOST_LIKELY_PROMPTS.map((_,i)=>i);
    resetUsed = true;
  }
  const idx = candidates[Math.floor(Math.random()*candidates.length)];
  return {idx, resetUsed};
}
// 挑本輪「誰最可能」的基準玩家：輪流讓每個人都當過基準，玩家都輪過一次後才重新洗牌。
function pickMLBase(playerIds, usedIds){
  const usedSet = new Set(usedIds||[]);
  let candidates = playerIds.filter(id=>!usedSet.has(id));
  let resetUsed = false;
  if(candidates.length===0){
    candidates = playerIds.slice();
    resetUsed = true;
  }
  const id = candidates[Math.floor(Math.random()*candidates.length)];
  return {id, resetUsed};
}
//#@ view
// ---------- 誰最可能：畫面 ----------

function renderMLQuestion(me, isHost){
  const duration = (roomData.settings && roomData.settings.duration) || 25;
  const remain = remainingSeconds();
  const remainInt = Math.ceil(remain);
  const frac = Math.max(0, Math.min(1, remain/duration));
  const R = 44, C = 2*Math.PI*R;
  const dashoffset = C*(1-frac);
  const myVote = votesData.find(v=>v.playerId===identity.playerId && v.round===roomData.round);
  const votedIds = new Set(votesData.map(v=>v.playerId));
  const totalRounds = (roomData.settings && roomData.settings.totalRounds) || 8;
  const baseId = roomData.currentBaseId;
  const iAmBase = baseId === identity.playerId;

  if(mlRankOrderRound !== roomData.round){
    mlRankOrderRound = roomData.round;
    mlRankOrder = playersData.map(p=>p.id);
  }
  // 排序清單：已送出就顯示自己送出的排序（唯讀），否則顯示本地暫存的排序（可調整）。
  const order = myVote ? myVote.ranking : (mlRankOrder || playersData.map(p=>p.id));

  app.innerHTML = `
    <div class="card">
      <div class="badge purple">誰最可能 · 第 ${roomData.round}/${totalRounds} 題</div>
      <div class="timerzone">
        <div class="ring-wrap">
          <svg viewBox="0 0 100 100">
            <circle class="ring-bg" cx="50" cy="50" r="${R}"></circle>
            <circle class="ring-fg ${frac<0.25?'low':''}" cx="50" cy="50" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${dashoffset}"></circle>
          </svg>
          <div class="ring-num digits">${remainInt}</div>
        </div>
      </div>
      <div class="qtext">${esc(roomData.currentPrompt||"")}</div>
      <p class="helper" style="margin:-4px 0 12px;">${iAmBase ? '🎯 這輪你是基準者，你的排序就是這一題的標準答案！' : `🎯 這輪基準者是 <b>${esc((playersData.find(p=>p.id===baseId)||{}).name||'')}</b>，猜猜看 ta 會怎麼排`}</p>
      <div class="mlscale"><span>⬅ 最不可能</span><span>最可能 ➡</span></div>
      <div class="mlranklist">
        ${order.map((id,i)=>{
          const p = playersData.find(pp=>pp.id===id);
          if(!p) return "";
          return `<div class="mlrankitem ${id===baseId?'base':''}" data-id="${id}">
            <span class="mlrankidx">${i+1}</span>
            <span class="mlrankname">${avatarOf(p)} ${esc(p.name)}${id===identity.playerId?' <span class="you">YOU</span>':''}${id===baseId?' 🎯':''}</span>
            ${!myVote ? `<span class="mlrankhandle" data-handle="${id}">⠿</span>` : ``}
          </div>`;
        }).join("")}
      </div>
      ${!myVote ? `<button class="btn-primary" id="submitRankBtn" style="margin-top:14px;">確定送出排序</button>` : `<p class="helper" style="margin-top:14px;">✅ 已送出，等待其他人…</p>`}
      <div class="answeredrow">
        ${playersData.map(p=>`<span class="achip ${votedIds.has(p.id)?'done':''}">${avatarOf(p)} ${esc(p.name)}${votedIds.has(p.id)?' ✓':''}</span>`).join("")}
      </div>
    </div>
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(!myVote){
    wireMLDrag();
    document.getElementById("submitRankBtn").onclick = submitMLRanking;
  }
  document.getElementById("leaveBtn").onclick = doLeave;
}

// 用手指/滑鼠拖曳排序：拖曳過程中不整頁重畫（只移動被拖的那一列＋讓其他列讓位），
// 放開時才把新順序寫回 mlRankOrder 並重新整頁畫面。
function wireMLDrag(){
  const list = document.querySelector(".mlranklist");
  if(!list) return;
  list.querySelectorAll("[data-handle]").forEach(handle=>{
    handle.addEventListener("pointerdown", (e)=> startMLDrag(e, handle.closest(".mlrankitem"), list));
  });
}

function startMLDrag(e, item, list){
  if(!item || !list) return;
  e.preventDefault();
  const id = item.dataset.id;
  const baseOrder = mlRankOrder.slice();
  const fromIndex = baseOrder.indexOf(id);
  if(fromIndex<0) return;
  mlDragging = true;
  const rows = Array.from(list.children);
  const gap = 8; // 對應 .mlranklist 的 gap
  const rowHeight = item.getBoundingClientRect().height + gap;
  const startY = e.clientY;
  let lastToIndex = fromIndex;
  try{ item.setPointerCapture(e.pointerId); }catch(err){}
  item.classList.add("dragging");

  function applyOffsets(toIndex){
    rows.forEach((row,i)=>{
      if(row===item) return;
      let shift = 0;
      if(fromIndex < toIndex && i > fromIndex && i <= toIndex) shift = -rowHeight;
      else if(fromIndex > toIndex && i >= toIndex && i < fromIndex) shift = rowHeight;
      row.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  }
  function onMove(ev){
    const dy = ev.clientY - startY;
    item.style.transform = `translateY(${dy}px)`;
    let toIndex = fromIndex + Math.round(dy / rowHeight);
    toIndex = Math.max(0, Math.min(rows.length-1, toIndex));
    if(toIndex !== lastToIndex){ lastToIndex = toIndex; applyOffsets(toIndex); }
  }
  function onUp(){
    item.removeEventListener("pointermove", onMove);
    item.removeEventListener("pointerup", onUp);
    item.removeEventListener("pointercancel", onUp);
    item.classList.remove("dragging");
    rows.forEach(row=>{ row.style.transform = ""; });
    if(lastToIndex !== fromIndex){
      const next = baseOrder.slice();
      next.splice(fromIndex,1);
      next.splice(lastToIndex,0,id);
      mlRankOrder = next;
    }
    mlDragging = false;
    render();
  }
  item.addEventListener("pointermove", onMove);
  item.addEventListener("pointerup", onUp);
  item.addEventListener("pointercancel", onUp);
}

function startMLRevealAnim(round){
  clearRevealTimers();
  mlRevealAnimRound = round;
  mlRevealReady = false;
  // 跟心電感應一樣，答題畫面切到結算畫面之間留一點停頓，不會覺得畫面在硬切。
  revealTimers.push(setTimeout(()=>{ mlRevealReady = true; render(); }, 700));
}

function renderMLReveal(isHost){
  const log = (roomData.revealLog||[]);
  const last = log[log.length-1];
  if(!last){ renderConnecting(); return; }
  if(mlRevealAnimRound !== last.round) startMLRevealAnim(last.round);
  if(mlRevealReady && mlSoundedRound !== last.round){
    mlSoundedRound = last.round;
    beep(700,90,"sine");
    setTimeout(()=>beep(900,110,"sine"), 90);
    vibrate(15);
  }
  const totalRounds = (roomData.settings && roomData.settings.totalRounds) || 8;
  const isLastRound = last.round >= totalRounds;
  const baseP = playersData.find(p=>p.id===last.baseId);
  const baseRanking = last.baseRanking;
  const gainedById = last.gainedById || {};
  const votesById = {};
  (last.votes||[]).forEach(v=>{ votesById[v.playerId] = v.ranking; });
  const others = playersData.filter(p=>p.id!==last.baseId).slice().sort((a,b)=>(gainedById[b.id]||0)-(gainedById[a.id]||0));
  const N = playersData.length;

  app.innerHTML = `
    <div class="card">
      <div class="badge red">結果揭曉</div>
      <div class="qtext" style="font-size:17px;">${esc(last.prompt)}</div>
      ${!mlRevealReady ? `<p class="helper" style="text-align:center; margin-top:16px;"><span class="spin"></span>揭曉中…</p>` : (!baseRanking ? `
        <p class="helper" style="margin-top:16px;">🎯 基準者 ${baseP?esc(baseP.name):''} 這輪沒有完成排序，這題不計分。</p>
      ` : `
        <div class="mlanswerkey">
          <div class="helptitle" style="color:var(--accent);">🎯 基準：${baseP?avatarOf(baseP):''} ${baseP?esc(baseP.name):''} 的排序（最不可能 → 最可能）</div>
          <div class="mlrankrow">
            ${baseRanking.map((id,i)=>{
              const p = playersData.find(pp=>pp.id===id);
              return `<span class="mlrankchip">${i+1}. ${p?avatarOf(p):'🙂'} ${esc(p?p.name:'?')}</span>`;
            }).join("")}
          </div>
        </div>
        <div class="mlcomparewrap">
          ${others.map(p=>{
            const ranking = votesById[p.id];
            const gained = gainedById[p.id]||0;
            return `<div class="mlcomparerow ${p.id===identity.playerId?'me':''}">
              <div class="mlcomparehead"><span>${avatarOf(p)} ${esc(p.name)}</span><span class="cnt">猜中 ${gained}/${N}</span></div>
              ${ranking ? `<div class="mlrankrow">
                ${ranking.map((id,i)=>{
                  const pp = playersData.find(x=>x.id===id);
                  const match = baseRanking[i]===id;
                  return `<span class="mlrankchip ${match?'match':''}">${pp?avatarOf(pp):'🙂'} ${esc(pp?pp.name:'?')}</span>`;
                }).join("")}
              </div>` : `<p class="helper" style="margin:4px 0 0;">未完成排序</p>`}
            </div>`;
          }).join("")}
        </div>
      `)}
    </div>
    ${mlRevealReady ? (isHost ? `<button class="btn-primary" id="nextBtn">${isLastRound?'看總結':'繼續下一題'}</button>` : `<p class="helper">等待房主繼續</p>`) : ``}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(mlRevealReady && isHost) document.getElementById("nextBtn").onclick = isLastRound ? doEndML : doNextML;
  document.getElementById("leaveBtn").onclick = doLeave;
}

function renderMLEnded(isHost){
  const ranked = playersData.slice().sort((a,b)=>(b.mlScore||0)-(a.mlScore||0));
  const topScore = ranked.length ? (ranked[0].mlScore||0) : 0;
  const champions = topScore>0 ? ranked.filter(p=>(p.mlScore||0)===topScore) : [];
  const rounds = (roomData.revealLog||[]).length;
  const dateStr = new Date().toLocaleDateString("zh-TW",{month:"numeric",day:"numeric"});

  app.innerHTML = `
    <div class="card">
      <div class="badge red">總結</div>
      <div style="text-align:center;">
        <div class="mono" style="font-size:11px;color:var(--muted);letter-spacing:.18em;">房號 ${esc(identity.code)} · ${esc(dateStr)} · 共 ${rounds} 題</div>
        <h2 style="font-size:23px; margin-top:8px; background:linear-gradient(100deg, var(--accent), var(--safe)); -webkit-background-clip:text; background-clip:text; color:transparent;">誰最可能戰績卡</h2>
      </div>

      <div class="sharerow win">
        <div class="sharerow-label">🧠 全場最強讀心者</div>
        <div class="sharerow-people">${champions.length ? champions.map(p=>`<span class="avatarchip">${avatarOf(p)} ${esc(p.name)}</span>`).join("") : `<span class="avatarchip">—</span>`}</div>
      </div>

      <div style="margin-top:18px;">
        <label>完整排行（猜中位置數，多到少）</label>
        <ul class="playerlist">
          ${ranked.map(p=>`
            <li><span class="pname">${avatarOf(p)} ${esc(p.name)} ${p.id===identity.playerId?'<span class="you">YOU</span>':''}${offBadge(p)}</span><span class="strikes">${p.mlScore||0} 分</span></li>
          `).join("")}
        </ul>
      </div>
      <p class="helper" style="margin:16px 0 0;">截圖這張卡片，傳到聊天群組吧！</p>
    </div>
    ${isHost ? `<button class="btn-primary" id="rematchBtn">再玩一局</button>` : `<p class="helper">等待房主開始下一局</p>`}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(isHost) document.getElementById("rematchBtn").onclick = doRematchML;
  document.getElementById("leaveBtn").onclick = doLeave;
}

//#@ actions
// ---------- 誰最可能：資料 / 動作 ----------

async function doStartML(){
  const players = playersData;
  if(players.length<2) return;
  if(!players.every(p=>p.ready)){ startError = "還有人沒按「我準備好了」，等他們準備好才能開始"; render(); return; }
  const settings = roomData.settings || {duration:25, totalRounds:8};
  const {idx} = pickMLPrompt([]);
  const {id: baseId} = pickMLBase(presentIds(), []);
  startError = "";
  try{
    await clearAllVotes();
    await Promise.all(players.map(p=> playersCol.doc(p.id).update({mlScore:0})));
    clearRevealTimers(); mlRevealAnimRound = null; mlRevealReady = false; mlSoundedRound = null; mlRankOrder = null; mlRankOrderRound = null;
    await roomRef.update({
      phase:"question", round:1, currentPrompt: MOST_LIKELY_PROMPTS[idx], currentBaseId: baseId,
      roundEndAt: Date.now() + settings.duration*1000, revealLog:[], usedPromptIdx:[idx], usedBaseIds:[baseId], lastActivityAt: Date.now()
    });
  }catch(e){}
}

async function submitMLRanking(){
  if(voteBusy) return;
  if(!mlRankOrder || mlRankOrder.length !== playersData.length) return;
  voteBusy = true;
  const voteId = `${roomData.round}_${identity.playerId}`;
  try{
    await votesCol.doc(voteId).set({round: roomData.round, playerId: identity.playerId, ranking: mlRankOrder.slice(), ts: Date.now()});
    playVoteSound();
    touchActivity();
  }catch(e){}
  voteBusy = false;
  render();
}

async function tryResolveML(){
  if(resolveBusy) return;
  if(!roomData || roomData.phase!=="question") return;
  resolveBusy = true;
  try{
    await withFreshRoom(async (fd, freshPlayers)=>{
      if(fd.phase!=="question") return;
      const allVotedSnap = await votesCol.where("round","==",fd.round).get().catch(()=>({docs:[]}));
      const roundVotes = allVotedSnap.docs.map(dd=>dd.data());
      const timeUp = Date.now() >= (fd.roundEndAt||0);
      const voted = new Set(roundVotes.map(v=>v.playerId));
      // 離線的人不用等：在線的人都送出排序就結算。
      const allVoted = freshPlayers.length>0 && onlineIdsOf(freshPlayers, Date.now(), identity.playerId).every(id=> voted.has(id));
      if(!timeUp && !allVoted) return;

      // 用基準者自己送出的排序當這一題的標準答案；基準者沒送出就整題不計分。
      const baseVote = roundVotes.find(v=>v.playerId===fd.currentBaseId);
      const baseRanking = baseVote ? baseVote.ranking : null;
      const gainedById = {};
      freshPlayers.forEach(p=>{ gainedById[p.id]=0; });
      if(baseRanking){
        roundVotes.forEach(v=>{
          if(v.playerId===fd.currentBaseId) return; // 基準者這輪不跟自己比對、不計分
          let matches = 0;
          (v.ranking||[]).forEach((id,i)=>{ if(baseRanking[i]===id) matches++; });
          gainedById[v.playerId] = matches;
        });
        await Promise.all(freshPlayers.map(p=>{
          const gained = gainedById[p.id]||0;
          if(gained>0) return playersCol.doc(p.id).update({mlScore:(p.mlScore||0)+gained});
          return Promise.resolve();
        }));
      }

      const log = (fd.revealLog||[]).slice();
      log.push({
        round: fd.round, prompt: fd.currentPrompt, baseId: fd.currentBaseId, baseRanking,
        votes: roundVotes.map(v=>({playerId:v.playerId, ranking:v.ranking})), gainedById
      });

      // 一律先進 reveal 讓大家看這輪結果；是不是最後一題、要不要看總結，交給房主在 reveal 畫面按按鈕決定。
      await roomRef.update({phase:"reveal", revealLog: log, lastActivityAt: Date.now()});
    }, {tries:4});
  }catch(e){}
  resolveBusy = false;
}

async function doNextML(){
  const settings = roomData.settings || {duration:25, totalRounds:8};
  const {idx, resetUsed} = pickMLPrompt(roomData.usedPromptIdx);
  const {id: baseId, resetUsed: baseReset} = pickMLBase(presentIds(), roomData.usedBaseIds);
  const nextRound = (roomData.round||1)+1;
  const usedPromptIdx = resetUsed ? [idx] : [...(roomData.usedPromptIdx||[]), idx];
  const usedBaseIds = baseReset ? [baseId] : [...(roomData.usedBaseIds||[]), baseId];
  try{
    await roomRef.update({
      phase:"question", round:nextRound, currentPrompt: MOST_LIKELY_PROMPTS[idx], currentBaseId: baseId,
      roundEndAt: Date.now() + settings.duration*1000, usedPromptIdx, usedBaseIds, lastActivityAt: Date.now()
    });
  }catch(e){}
}

async function doEndML(){
  try{ await roomRef.update({phase:"ended", lastActivityAt: Date.now()}); }catch(e){}
}

async function doRematchML(){
  try{
    await clearAllVotes();
    await Promise.all(playersData.map(p=> playersCol.doc(p.id).update({mlScore:0, ready:false})));
    await roomRef.update({phase:"lobby", round:0, currentPrompt:null, currentBaseId:null, roundEndAt:null, revealLog:[], usedPromptIdx:[], usedBaseIds:[], lastActivityAt: Date.now()});
  }catch(e){}
}

