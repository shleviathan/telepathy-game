//#@ logic
// 「狼人殺」角色設定：狼人/村民一定存在，其他角色由房主開關決定要不要加進這一局。
const WEREWOLF_ROLE_TOGGLES = ["seer","witch","hunter","guard"];
const ROLE_LABEL = {
  wolf:"🐺 狼人", villager:"😇 村民", seer:"🔮 預言家", witch:"🧪 女巫", hunter:"🔫 獵人", guard:"🛡️ 醫生"
};
// 狼人人數不給房主調整，直接依人數自動算：5人以下1隻、9人以下2隻、其餘3隻。
function computeWolfCount(n){ return n<=5 ? 1 : (n<=9 ? 2 : 3); }
// 洗牌玩家順序後依序分配：狼人優先，接著依開關分配特殊角色，剩下的人都是村民。
function assignWerewolfRoles(players, rolesSettings){
  const shuffled = players.map(p=>p.id);
  for(let i=shuffled.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const roles = {};
  const wolfCount = computeWolfCount(players.length);
  const pool = shuffled.slice();
  pool.splice(0, wolfCount).forEach(id=>{ roles[id] = "wolf"; });
  WEREWOLF_ROLE_TOGGLES.forEach(role=>{
    if(rolesSettings && rolesSettings[role] && pool.length){
      const id = pool.shift();
      roles[id] = role;
    }
  });
  pool.forEach(id=>{ roles[id] = "villager"; });
  return roles;
}
// 夜晚行動的固定順序：醫生 → 狼人 → 預言家 → 女巫。狼人一定會行動，其他角色要開關開著、且該角色還活著才會輪到。
// 找不到下一個該行動的角色就回傳 null，代表這一夜的行動都做完了，該進入結算。
const WEREWOLF_NIGHT_STEPS = ["guard","wolf","seer","witch"];
function nextNightStep(afterStep, rolesSettings, roles, players){
  const startIdx = afterStep ? WEREWOLF_NIGHT_STEPS.indexOf(afterStep)+1 : 0;
  for(let i=startIdx;i<WEREWOLF_NIGHT_STEPS.length;i++){
    const step = WEREWOLF_NIGHT_STEPS[i];
    if(step==="wolf"){
      const aliveWolves = players.filter(p=>p.alive!==false && roles[p.id]==="wolf");
      if(aliveWolves.length>0) return step;
      continue;
    }
    if(!rolesSettings || !rolesSettings[step]) continue;
    const holder = players.find(p=>p.alive!==false && roles[p.id]===step);
    if(holder) return step;
  }
  return null;
}

// 看門狗 / 結算共用的判斷（純函式）：目前狀態下「該不該往前推一步」。離線的人一律當作缺席：
//   夜晚：醫生/預言家/女巫離線 → 跳過該步驟（安全預設：不守護 / 不查驗 / 不用藥）；
//         狼人：在線的活狼都投了（或活狼全部離線）→ 結算（沒人投 = 今晚沒人被襲擊）；
//   獵人離線 → 不開槍；投票階段：在線且活著的玩家都投了 → 結算（沒投的人當棄票）。
function wwPlan(fd, players, now, selfId){
  if(!fd) return null;
  const roles = fd.roles || {};
  const on = new Set(onlineIdsOf(players, now, selfId));
  const alive = players.filter(p=> p.alive!==false && roles[p.id]);
  if(fd.phase==="night"){
    const step = fd.nightStep;
    if(step==="wolf"){
      const wv = fd.wolfVotes || {};
      const onWolves = alive.filter(p=> roles[p.id]==="wolf" && on.has(p.id));
      return onWolves.every(w=> wv[w.id]!=null) ? {kind:"resolveWolf"} : null;
    }
    if(step==="guard" || step==="seer" || step==="witch"){
      const holder = alive.find(p=> roles[p.id]===step);
      if(!holder || !on.has(holder.id)) return {kind:"skipStep", step};
    }
    return null;
  }
  if(fd.phase==="hunter"){
    const h = (fd.hunterQueue||[])[0];
    if(h && !on.has(h)) return {kind:"hunterSkip"};
    return null;
  }
  if(fd.phase==="vote"){
    const vt = fd.voteTally || {};
    return alive.filter(p=>on.has(p.id)).every(p=> vt[p.id]!=null) ? {kind:"resolveVote"} : null;
  }
  return null;
}

//#@ view
// ---------- 狼人殺：畫面 ----------

// 遊戲開始後才加入（或重新整理進來卻沒被分配角色）的人，看到這個畫面，等這局結束再一起玩下一局。
function renderWerewolfNoRole(){
  app.innerHTML = `
    <div class="card" style="text-align:center;">
      <p>遊戲已經開始，請等待這局結束</p>
    </div>
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  document.getElementById("leaveBtn").onclick = doLeave;
}

// 夜晚每個步驟給「不是本步驟行動者」的人看的等待文字，配合當前 nightStep 換字。
const WEREWOLF_NIGHT_WAIT_TEXT = {
  guard:"🌙 夜深了，醫生正在行動…",
  wolf:"🌙 夜深了，狼人正在行動…",
  seer:"🌙 夜深了，預言家正在行動…",
  witch:"🌙 夜深了，女巫正在行動…"
};
let witchPoisonPickOpen = false;

function renderWerewolfNight(me, isHost){
  const step = roomData.nightStep;
  const roles = roomData.roles || {};
  const myRole = roles[identity.playerId];
  const alivePlayers = playersData.filter(p=>p.alive!==false);
  const iAmAlive = me.alive!==false;

  if(step==="guard" && myRole==="guard" && iAmAlive){
    app.innerHTML = `
      <div class="card">
        <div class="badge purple">🛡️ 醫生時刻 · 第 ${roomData.round} 夜</div>
        <p class="helper" style="margin-top:-4px;">選一位玩家守護，被你守護的人今晚不會被狼人殺死。你也可以守護自己。</p>
        <div class="pickgrid">
          ${alivePlayers.map(p=>`<button class="pickbtn" data-pick="${p.id}">${avatarOf(p)} ${esc(p.name)}${p.id===identity.playerId?' <span class="you">YOU</span>':''}</button>`).join("")}
        </div>
      </div>
      <button class="btn-ghost" id="leaveBtn">離開房間</button>
    `;
    document.querySelectorAll("[data-pick]").forEach(b=> b.onclick = ()=> doGuardPick(b.dataset.pick));
    document.getElementById("leaveBtn").onclick = doLeave;
    return;
  }

  if(step==="wolf" && myRole==="wolf" && iAmAlive){
    const wolfVotes = roomData.wolfVotes || {};
    const myPick = wolfVotes[identity.playerId];
    app.innerHTML = `
      <div class="card">
        <div class="badge purple">🐺 狼人時刻 · 第 ${roomData.round} 夜</div>
        ${myPick==null ? `
          <p class="helper" style="margin-top:-4px;">選一位玩家襲擊。</p>
          <div class="pickgrid">
            ${alivePlayers.map(p=>`<button class="pickbtn" data-pick="${p.id}">${avatarOf(p)} ${esc(p.name)}${p.id===identity.playerId?' <span class="you">YOU</span>':''}</button>`).join("")}
          </div>
        ` : `
          <p class="helper" style="margin-top:-4px;">已送出，等待其他狼人…</p>
          <div class="pickgrid">
            ${alivePlayers.map(p=>`<button class="pickbtn ${p.id===myPick?'picked':''}" disabled>${avatarOf(p)} ${esc(p.name)}${p.id===identity.playerId?' <span class="you">YOU</span>':''}</button>`).join("")}
          </div>
        `}
      </div>
      <button class="btn-ghost" id="leaveBtn">離開房間</button>
    `;
    if(myPick==null) document.querySelectorAll("[data-pick]").forEach(b=> b.onclick = ()=> doWolfVote(b.dataset.pick));
    document.getElementById("leaveBtn").onclick = doLeave;
    return;
  }

  if(step==="seer" && myRole==="seer" && iAmAlive){
    const others = alivePlayers.filter(p=>p.id!==identity.playerId);
    const result = roomData.seerResult;
    const checkedP = result ? playersData.find(p=>p.id===result.target) : null;
    app.innerHTML = `
      <div class="card">
        <div class="badge purple">🔮 預言家時刻 · 第 ${roomData.round} 夜</div>
        ${!result ? `
          <p class="helper" style="margin-top:-4px;">選一位玩家查驗身分。</p>
          <div class="pickgrid">
            ${others.map(p=>`<button class="pickbtn" data-pick="${p.id}">${avatarOf(p)} ${esc(p.name)}</button>`).join("")}
          </div>
        ` : `
          <p class="helper" style="margin-top:-4px;">${checkedP?avatarOf(checkedP):'🙂'} ${esc(checkedP?checkedP.name:'?')} 的身分是：</p>
          <div class="qtext" style="font-size:22px;">${result.isWolf ? '🐺 是狼人' : '😇 不是狼人'}</div>
        `}
      </div>
      <button class="btn-ghost" id="leaveBtn">離開房間</button>
    `;
    if(!result) document.querySelectorAll("[data-pick]").forEach(b=> b.onclick = ()=> doSeerCheck(b.dataset.pick));
    document.getElementById("leaveBtn").onclick = doLeave;
    return;
  }

  if(step==="witch" && myRole==="witch" && iAmAlive){
    const wolfTarget = roomData.wolfTarget;
    const targetP = wolfTarget ? playersData.find(p=>p.id===wolfTarget) : null;
    const canSave = !roomData.witchSaveUsed && wolfTarget!=null;
    const canPoison = !roomData.witchPoisonUsed;
    app.innerHTML = `
      <div class="card">
        <div class="badge purple">🧪 女巫時刻 · 第 ${roomData.round} 夜</div>
        <p class="helper" style="margin-top:-4px;">${targetP ? `今晚狼人選擇襲擊 ${avatarOf(targetP)} ${esc(targetP.name)}` : '今晚狼人沒有動手'}</p>
        <div class="stack" style="margin-top:10px;">
          ${canSave ? `<button class="btn-secondary" id="witchSaveBtn">救</button>` : ``}
          ${canPoison ? `<button class="btn-secondary" id="witchPoisonBtn">毒</button>` : ``}
          <button class="btn-secondary" id="witchPassBtn">跳過</button>
        </div>
        ${witchPoisonPickOpen ? `
          <p class="helper" style="margin:10px 0 4px;">選一位玩家下毒：</p>
          <div class="pickgrid">
            ${alivePlayers.filter(p=>p.id!==identity.playerId).map(p=>`<button class="pickbtn" data-pick="${p.id}">${avatarOf(p)} ${esc(p.name)}</button>`).join("")}
          </div>
        ` : ``}
      </div>
      <button class="btn-ghost" id="leaveBtn">離開房間</button>
    `;
    const saveBtn = document.getElementById("witchSaveBtn");
    if(saveBtn) saveBtn.onclick = ()=> doWitchAct("save", null);
    const poisonBtn = document.getElementById("witchPoisonBtn");
    if(poisonBtn) poisonBtn.onclick = ()=>{ witchPoisonPickOpen = true; render(); };
    document.getElementById("witchPassBtn").onclick = ()=> doWitchAct("pass", null);
    if(witchPoisonPickOpen){
      document.querySelectorAll("[data-pick]").forEach(b=> b.onclick = ()=>{ witchPoisonPickOpen = false; doWitchAct("poison", b.dataset.pick); });
    }
    document.getElementById("leaveBtn").onclick = doLeave;
    return;
  }

  // 不是這一步驟行動者的人（包含已死亡的人），看到跟目前 nightStep 對應的通用等待畫面。
  const waitText = WEREWOLF_NIGHT_WAIT_TEXT[step] || "🌙 夜深了…";
  app.innerHTML = `
    <div class="card" style="text-align:center;">
      <div class="badge purple">🌙 第 ${roomData.round} 夜</div>
      <p class="helper" style="margin-top:10px;">${waitText}</p>
    </div>
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  document.getElementById("leaveBtn").onclick = doLeave;
}

function renderWerewolfHunterShoot(me, isHost){
  const queue = roomData.hunterQueue || [];
  const isMe = queue[0] === identity.playerId;
  if(!isMe){
    app.innerHTML = `
      <div class="card" style="text-align:center;">
        <div class="badge red">🔫 獵人時刻</div>
        <p class="helper" style="margin-top:10px;">🔫 獵人正在做最後的反擊…</p>
      </div>
      <button class="btn-ghost" id="leaveBtn">離開房間</button>
    `;
    document.getElementById("leaveBtn").onclick = doLeave;
    return;
  }
  const alive = playersData.filter(p=>p.alive!==false && p.id!==identity.playerId);
  app.innerHTML = `
    <div class="card">
      <div class="badge red">🔫 你被淘汰了，開最後一槍</div>
      <p class="helper" style="margin-top:-4px;">選一位玩家一起帶走，或選擇不開槍。</p>
      <div class="pickgrid">
        ${alive.map(p=>`<button class="pickbtn" data-pick="${p.id}">${avatarOf(p)} ${esc(p.name)}</button>`).join("")}
      </div>
      <button class="btn-secondary" id="skipShootBtn" style="margin-top:10px;">不開槍</button>
    </div>
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  document.querySelectorAll("[data-pick]").forEach(b=> b.onclick = ()=> doHunterShoot(b.dataset.pick));
  document.getElementById("skipShootBtn").onclick = ()=> doHunterShoot(null);
  document.getElementById("leaveBtn").onclick = doLeave;
}

function renderWerewolfDayDeaths(isHost){
  const deaths = roomData.nightDeaths || [];
  const roles = roomData.roles || {};
  app.innerHTML = `
    <div class="card">
      <div class="badge red">☀️ 天亮了</div>
      ${deaths.length ? `
        <ul class="playerlist">
          ${deaths.map(id=>{
            const p = playersData.find(pp=>pp.id===id);
            return `<li><span class="pname">${p?avatarOf(p):'🙂'} ${esc(p?p.name:'?')}</span><span class="cattag">${esc(ROLE_LABEL[roles[id]]||'村民')}</span></li>`;
          }).join("")}
        </ul>
      ` : `<p class="helper" style="margin-top:10px;">平安夜，沒有人死亡</p>`}
    </div>
    ${isHost ? `<button class="btn-primary" id="startDiscussBtn">開始討論</button>` : `<p class="helper">等待房主開始討論</p>`}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(isHost) document.getElementById("startDiscussBtn").onclick = doStartDiscuss;
  document.getElementById("leaveBtn").onclick = doLeave;
}

function renderWerewolfDiscuss(isHost){
  const alive = playersData.filter(p=>p.alive!==false);
  app.innerHTML = `
    <div class="card">
      <div class="badge purple">💬 討論時間</div>
      <p class="helper" style="margin-top:-4px;">大家open嘴巴討論、指控、辯論吧！</p>
      <ul class="playerlist">
        ${alive.map(p=>`<li><span class="pname">${avatarOf(p)} ${esc(p.name)} ${p.id===identity.playerId?'<span class="you">YOU</span>':''}${offBadge(p)}</span></li>`).join("")}
      </ul>
    </div>
    ${isHost ? `<button class="btn-primary" id="startVoteBtn">開始投票</button>` : `<p class="helper">等待房主開始投票</p>`}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(isHost) document.getElementById("startVoteBtn").onclick = doStartVote;
  document.getElementById("leaveBtn").onclick = doLeave;
}

function renderWerewolfVote(me, isHost){
  if(me.alive===false){
    app.innerHTML = `
      <div class="card" style="text-align:center;">
        <div class="badge red">🗳️ 投票中</div>
        <p class="helper" style="margin-top:10px;">你已經死亡，等待遊戲結束</p>
      </div>
      <button class="btn-ghost" id="leaveBtn">離開房間</button>
    `;
    document.getElementById("leaveBtn").onclick = doLeave;
    return;
  }
  const voteTally = roomData.voteTally || {};
  const myVote = voteTally[identity.playerId];
  const alive = playersData.filter(p=>p.alive!==false);
  const votedCount = alive.filter(p=> voteTally[p.id]!=null).length;
  app.innerHTML = `
    <div class="card">
      <div class="badge red">🗳️ 投票淘汰</div>
      <p class="helper" style="margin-top:-4px;">已投票 ${votedCount}/${alive.length}</p>
      ${myVote==null ? `
        <div class="pickgrid">
          ${alive.map(p=>`<button class="pickbtn" data-pick="${p.id}">${avatarOf(p)} ${esc(p.name)}${p.id===identity.playerId?' <span class="you">YOU</span>':''}</button>`).join("")}
        </div>
        <button class="btn-secondary" id="abstainBtn" style="margin-top:10px;">棄票</button>
      ` : `<p class="helper" style="margin-top:14px;">✅ 已送出，等待其他人…</p>`}
    </div>
    ${isHost ? `<button class="btn-secondary" id="forceVoteBtn" style="margin-top:10px;">強制結束投票</button>` : ``}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(myVote==null){
    document.querySelectorAll("[data-pick]").forEach(b=> b.onclick = ()=> doVoteCast(b.dataset.pick));
    document.getElementById("abstainBtn").onclick = ()=> doVoteCast(null);
  }
  if(isHost) document.getElementById("forceVoteBtn").onclick = doForceEndVote;
  document.getElementById("leaveBtn").onclick = doLeave;
}

function renderWerewolfVoteResult(isHost){
  const result = roomData.voteResult || {};
  const roles = roomData.roles || {};
  const eliminated = result.eliminatedId ? playersData.find(p=>p.id===result.eliminatedId) : null;
  app.innerHTML = `
    <div class="card">
      <div class="badge red">🗳️ 投票結果</div>
      ${eliminated ? `
        <ul class="playerlist">
          <li><span class="pname">${avatarOf(eliminated)} ${esc(eliminated.name)}</span><span class="cattag">${esc(ROLE_LABEL[roles[eliminated.id]]||'村民')}</span></li>
        </ul>
      ` : `<p class="helper" style="margin-top:10px;">投票結果平票，沒有人被淘汰</p>`}
    </div>
    ${isHost ? `<button class="btn-primary" id="nextNightBtn">進入下一個夜晚</button>` : `<p class="helper">等待房主繼續</p>`}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(isHost) document.getElementById("nextNightBtn").onclick = doNextNight;
  document.getElementById("leaveBtn").onclick = doLeave;
}

function renderWerewolfEnded(isHost){
  const winner = roomData.winner;
  const roles = roomData.roles || {};
  const isWolfWin = winner==="wolf";
  app.innerHTML = `
    <div class="${isWolfWin?'losebanner':'winbanner'}">
      <h2>${isWolfWin?'🐺 狼人陣營勝利！':'😇 好人陣營勝利！'}</h2>
      <p>遊戲結束，公開所有人的身分</p>
    </div>
    <div class="card">
      <label>身分公開</label>
      <ul class="playerlist">
        ${playersData.map(p=>`
          <li><span class="pname">${p.alive===false?'💀':'🙂'} ${avatarOf(p)} ${esc(p.name)} ${p.id===identity.playerId?'<span class="you">YOU</span>':''}${offBadge(p)}</span><span class="cattag">${esc(ROLE_LABEL[roles[p.id]]||'村民')}</span></li>
        `).join("")}
      </ul>
    </div>
    ${isHost ? `<button class="btn-primary" id="rematchBtn">再玩一局</button>` : `<p class="helper">等待房主開始下一局</p>`}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(isHost) document.getElementById("rematchBtn").onclick = doRematchWerewolf;
  document.getElementById("leaveBtn").onclick = doLeave;
}

//#@ actions
// ---------- 狼人殺：資料 / 動作 ----------

async function doStartWerewolf(){
  const players = playersData;
  if(players.length<4){ startError = "至少需要 4 位玩家才能開始狼人殺"; render(); return; }
  if(!players.every(p=>p.ready)){ startError = "還有人沒按「我準備好了」，等他們準備好才能開始"; render(); return; }
  const settings = roomData.settings || {roles:{seer:true, witch:false, hunter:false, guard:false}};
  const roles = assignWerewolfRoles(players, settings.roles);
  startError = "";
  try{
    await Promise.all(players.map(p=> playersCol.doc(p.id).update({alive:true})));
    const nStep = nextNightStep(null, settings.roles, roles, players);
    await roomRef.update({
      phase:"night", round:1, roles, nightStep: nStep,
      guardTarget:null, wolfVotes:{}, wolfTarget:null, seerTarget:null, seerResult:null,
      witchAction:null, witchPoisonTarget:null, witchSaveUsed:false, witchPoisonUsed:false,
      nightDeaths:[], hunterQueue:[], hunterNextPhase:null, voteTally:{}, voteResult:null, winner:null,
      lastActivityAt: Date.now()
    });
  }catch(e){}
}

// 夜晚的每個動作都在短租約鎖裡「重新抓房間、確認還在對的步驟」才寫入（冪等），
// 這樣房主端看門狗跳過離線玩家的步驟時，不會和剛好回來的玩家互相蓋掉。
async function wwNightAct(step, myRole, fn){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const r = await withFreshRoom(async (fd, players)=>{
      if(fd.phase!=="night" || fd.nightStep!==step) return;
      if((fd.roles||{})[identity.playerId]!==myRole) return;
      await fn(fd, players);
    }, {tries:6});
    if(!r.ok) showToast(MSG_RETRY);
  }catch(e){ showToast(MSG_RETRY); }
  voteBusy = false;
}
// 這個步驟做完：有下一步就換步驟，沒有就直接結算死亡（呼叫時已經在鎖裡）。
async function wwFinishStep(step, fd, players, patch){
  const nStep = nextNightStep(step, (fd.settings||{}).roles, fd.roles||{}, players);
  patch.lastActivityAt = Date.now();
  if(nStep) patch.nightStep = nStep;
  await roomRef.update(patch);
  if(!nStep) await wwResolveNightDeathsInner();
}

async function doGuardPick(targetId){
  await wwNightAct("guard", "guard", (fd, players)=> wwFinishStep("guard", fd, players, {guardTarget: targetId}));
}

// 狼人投票：每隻狼只寫自己的 wolfVotes.<id>（不需要鎖）；寫完由 resolveWolfVotes 拿短租約鎖結算
// （在線的活狼都投了才算出最多票的目標；平票時採用「加入順序最早的那隻狼投的目標」當決勝）。
async function doWolfVote(targetId){
  if(voteBusy) return;
  voteBusy = true;
  let wrote = false;
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="night" || fresh.data().nightStep!=="wolf"){ voteBusy=false; return; }
    wrote = await writeOwnField("wolfVotes."+identity.playerId, targetId, "night");
    if(!wrote) showToast(MSG_RETRY);
  }catch(e){ showToast(MSG_RETRY); }
  voteBusy = false;
  if(wrote) await resolveWolfVotes();
}
async function wwResolveWolfInner(fd, players){
  const roles = fd.roles || {};
  const wolfVotes = fd.wolfVotes || {};
  const voters = joinOrder(players.filter(p=>p.alive!==false && roles[p.id]==="wolf")).filter(w=> wolfVotes[w.id]!=null);
  const counts = {};
  voters.forEach(w=>{ const t = wolfVotes[w.id]; counts[t] = (counts[t]||0)+1; });
  let bestTarget = null, bestCount = -1;
  voters.forEach(w=>{
    const t = wolfVotes[w.id];
    if(counts[t] > bestCount){ bestCount = counts[t]; bestTarget = t; }
  });
  await wwFinishStep("wolf", fd, players, {wolfTarget: bestTarget});
}
async function resolveWolfVotes(){
  try{
    await withFreshRoom(async (fd, players)=>{
      if(fd.phase!=="night" || fd.nightStep!=="wolf") return;
      const plan = wwPlan(fd, players, Date.now(), identity.playerId);
      if(plan && plan.kind==="resolveWolf") await wwResolveWolfInner(fd, players);
    }, {tries:6});
  }catch(e){}
}

async function doSeerCheck(targetId){
  await wwNightAct("seer", "seer", (fd, players)=>{
    const roles = fd.roles || {};
    return wwFinishStep("seer", fd, players, {seerTarget: targetId, seerResult: {target: targetId, isWolf: roles[targetId]==="wolf"}});
  });
}

// 女巫永遠是夜晚行動順序的最後一步，所以做完動作之後一定直接進結算，不用再算下一步。
async function doWitchAct(action, targetId){
  await wwNightAct("witch", "witch", async (fd)=>{
    const patch = {witchAction: action, lastActivityAt: Date.now()};
    if(action==="save") patch.witchSaveUsed = true;
    if(action==="poison"){ patch.witchPoisonTarget = targetId; patch.witchPoisonUsed = true; }
    await roomRef.update(patch);
    await wwResolveNightDeathsInner();
  });
}

// 夜晚行動全部做完後結算死亡名單：醫生守到的人不會死、女巫救的人不會死，剩下才是真的死掉的人。
// （Inner 版本：呼叫時必須已經拿著鎖。）
async function wwResolveNightDeathsInner(){
  const fresh = await roomRef.get().catch(()=>null);
  if(!fresh || !fresh.exists || fresh.data().phase!=="night") return;
  const fd = fresh.data();
  const guardTarget = fd.guardTarget, wolfTarget = fd.wolfTarget;
  const survivedByGuard = guardTarget!=null && guardTarget===wolfTarget;
  const survivedByWitch = fd.witchAction==="save";
  const wolfKilled = (wolfTarget && !survivedByGuard && !survivedByWitch) ? wolfTarget : null;
  const poisonKilled = fd.witchAction==="poison" ? fd.witchPoisonTarget : null;
  const deathsSet = new Set();
  if(wolfKilled) deathsSet.add(wolfKilled);
  if(poisonKilled) deathsSet.add(poisonKilled);
  const nightDeaths = Array.from(deathsSet);
  await Promise.all(nightDeaths.map(id=> playersCol.doc(id).update({alive:false})));
  await finalizeDeaths(nightDeaths, "daydeaths");
}

// 淘汰名單裡如果有還沒開過槍的獵人，先讓獵人補一槍再繼續；沒有獵人就直接檢查有沒有人獲勝。
async function finalizeDeaths(newDeathIds, nextPhaseIfNoWinner){
  try{
    const fresh = await roomRef.get().catch(()=>null);
    const fd = fresh && fresh.exists ? fresh.data() : {};
    const roles = fd.roles || {};
    const hunterQueue = newDeathIds.filter(id=> roles[id]==="hunter");
    if(hunterQueue.length>0){
      await roomRef.update({
        nightDeaths: [...(fd.nightDeaths||[]), ...newDeathIds],
        hunterQueue, hunterNextPhase: nextPhaseIfNoWinner, phase:"hunter", lastActivityAt: Date.now()
      });
    } else {
      await checkWinAndAdvance(nextPhaseIfNoWinner, newDeathIds);
    }
  }catch(e){}
}

// 每次死人之後都重新用資料庫現場的玩家名單算一次雙方存活人數，判斷有沒有人贏了；
// 沒人贏就照原本排定的下一個 phase 繼續。
async function checkWinAndAdvance(nextPhase, newDeathIdsToAppend){
  try{
    const fresh = await roomRef.get().catch(()=>null);
    const fd = fresh && fresh.exists ? fresh.data() : {};
    const roles = fd.roles || {};
    const freshPlayersSnap = await playersCol.get().catch(()=>({docs:[]}));
    const freshPlayers = freshPlayersSnap.docs.map(dd=>({id:dd.id, ...dd.data()}));
    const aliveWolves = freshPlayers.filter(p=>p.alive!==false && roles[p.id]==="wolf");
    const aliveGood = freshPlayers.filter(p=>p.alive!==false && roles[p.id]!=="wolf");
    const patch = {lastActivityAt: Date.now()};
    if(newDeathIdsToAppend && newDeathIdsToAppend.length){
      patch.nightDeaths = [...(fd.nightDeaths||[]), ...newDeathIdsToAppend];
    }
    if(aliveWolves.length===0){
      patch.winner = "villager"; patch.phase = "ended";
    } else if(aliveWolves.length >= aliveGood.length){
      patch.winner = "wolf"; patch.phase = "ended";
    } else {
      patch.phase = nextPhase;
    }
    await roomRef.update(patch);
  }catch(e){}
}

// 獵人開槍（targetId=null 代表不開槍；獵人離線時看門狗也會用「不開槍」往前推）。
async function wwHunterInner(fd, targetId){
  let deaths = [];
  if(targetId){
    await playersCol.doc(targetId).update({alive:false});
    deaths = [targetId];
  }
  const nightDeaths = [...(fd.nightDeaths||[]), ...deaths];
  const hunterQueue = (fd.hunterQueue||[]).slice(1);
  await roomRef.update({nightDeaths, hunterQueue, lastActivityAt: Date.now()});
  if(hunterQueue.length===0){
    await checkWinAndAdvance(fd.hunterNextPhase, []);
  }
}
async function doHunterShoot(targetId){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const r = await withFreshRoom(async (fd)=>{
      if(fd.phase!=="hunter") return;
      if((fd.hunterQueue||[])[0] !== identity.playerId) return;
      await wwHunterInner(fd, targetId);
    }, {tries:6});
    if(!r.ok) showToast(MSG_RETRY);
  }catch(e){ showToast(MSG_RETRY); }
  voteBusy = false;
}

async function doStartDiscuss(){
  try{ await roomRef.update({phase:"discuss", lastActivityAt: Date.now()}); }catch(e){}
}

async function doStartVote(){
  try{ await roomRef.update({voteTally:{}, voteResult:null, phase:"vote", lastActivityAt: Date.now()}); }catch(e){}
}

// 統計非棄票的票數，票數最高且唯一的目標才會被淘汰；平票（或大家都棄票）就沒有人被淘汰。
async function resolveVoteWith(voteTally, alivePlayers){
  const counts = {};
  alivePlayers.forEach(p=>{
    const t = voteTally[p.id];
    if(t && t!=="abstain") counts[t] = (counts[t]||0)+1;
  });
  let maxCount = 0;
  Object.keys(counts).forEach(id=>{ if(counts[id]>maxCount) maxCount = counts[id]; });
  const topTargets = Object.keys(counts).filter(id=>counts[id]===maxCount);
  const eliminatedId = (maxCount>0 && topTargets.length===1) ? topTargets[0] : null;
  await roomRef.update({voteTally, voteResult: {eliminatedId, tally: counts}, phase:"voteresult", lastActivityAt: Date.now()});
  let deaths = [];
  if(eliminatedId){
    await playersCol.doc(eliminatedId).update({alive:false});
    deaths = [eliminatedId];
  }
  await finalizeDeaths(deaths, "voteresult");
}

// 投票：每個人只寫自己的 voteTally.<id>（不需要鎖）；寫完由 resolveVotes 拿短租約鎖結算。
async function doVoteCast(targetIdOrNull){
  if(voteBusy) return;
  voteBusy = true;
  let wrote = false;
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="vote"){ voteBusy=false; return; }
    wrote = await writeOwnField("voteTally."+identity.playerId, targetIdOrNull==null ? "abstain" : targetIdOrNull, "vote");
    if(!wrote) showToast(MSG_RETRY);
  }catch(e){ showToast(MSG_RETRY); }
  voteBusy = false;
  if(wrote) await resolveVotes();
}
// 沒投的人（離線或強制結束）當棄票。
async function wwResolveVoteInner(fd, players){
  const roles = fd.roles || {};
  const alive = players.filter(p=>p.alive!==false);
  const voteTally = Object.assign({}, fd.voteTally||{});
  alive.forEach(p=>{ if(voteTally[p.id]==null) voteTally[p.id] = "abstain"; });
  await resolveVoteWith(voteTally, alive);
}
async function resolveVotes(){
  try{
    await withFreshRoom(async (fd, players)=>{
      if(fd.phase!=="vote") return;
      const plan = wwPlan(fd, players, Date.now(), identity.playerId);
      if(plan && plan.kind==="resolveVote") await wwResolveVoteInner(fd, players);
    }, {tries:6});
  }catch(e){}
}

// 房主的「強制結束投票」：沒投的人當棄票處理，直接進結算，不用等所有人都投完。
async function doForceEndVote(){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const r = await withFreshRoom(async (fd, players)=>{
      if(fd.phase!=="vote") return;
      await wwResolveVoteInner(fd, players);
    }, {tries:6});
    if(!r.ok) showToast(MSG_RETRY);
  }catch(e){ showToast(MSG_RETRY); }
  voteBusy = false;
}

// 房主端看門狗：離線的醫生/預言家/女巫步驟自動跳過、獵人離線不開槍、在線的人都投完卻沒人結算就補結算。
async function wwWatchdog(){
  if(!wwPlan(roomData, playersData, Date.now(), identity.playerId)) return;
  await withFreshRoom(async (fd, players)=>{
    const plan = wwPlan(fd, players, Date.now(), identity.playerId);
    if(!plan) return;
    if(plan.kind==="resolveWolf") await wwResolveWolfInner(fd, players);
    else if(plan.kind==="skipStep"){
      if(plan.step==="witch"){ await roomRef.update({witchAction:"pass", lastActivityAt: Date.now()}); await wwResolveNightDeathsInner(); }
      else await wwFinishStep(plan.step, fd, players, {});
    }
    else if(plan.kind==="hunterSkip") await wwHunterInner(fd, null);
    else if(plan.kind==="resolveVote") await wwResolveVoteInner(fd, players);
  }, {tries:4});
}

async function doNextNight(){
  try{
    const settings = roomData.settings || {};
    const roles = roomData.roles || {};
    const freshPlayersSnap = await playersCol.get().catch(()=>({docs:[]}));
    const freshPlayers = freshPlayersSnap.docs.map(dd=>({id:dd.id, ...dd.data()}));
    const nStep = nextNightStep(null, settings.roles, roles, freshPlayers);
    await roomRef.update({
      guardTarget:null, wolfVotes:{}, wolfTarget:null, seerTarget:null, seerResult:null,
      witchAction:null, witchPoisonTarget:null, nightDeaths:[],
      round: (roomData.round||1)+1, phase:"night", nightStep: nStep, lastActivityAt: Date.now()
    });
  }catch(e){}
}

async function doRematchWerewolf(){
  try{
    await Promise.all(playersData.map(p=> playersCol.doc(p.id).update({alive:true, ready:false})));
    await roomRef.update({
      phase:"lobby", round:0, roles:{}, nightStep:null,
      guardTarget:null, wolfVotes:{}, wolfTarget:null, seerTarget:null, seerResult:null,
      witchAction:null, witchPoisonTarget:null, witchSaveUsed:false, witchPoisonUsed:false,
      nightDeaths:[], hunterQueue:[], hunterNextPhase:null, voteTally:{}, voteResult:null, winner:null,
      lastActivityAt: Date.now()
    });
  }catch(e){}
}

