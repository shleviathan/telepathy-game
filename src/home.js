function render(){
  if(mlDragging || drawingInProgress || drawPromptAnimating) return; // 拖曳排序中/畫畫中/抽題拉霸動畫中先不要整頁重畫，不然手指動作或動畫會被背景更新打斷、跳掉
  if(!identity){ renderHome(); return; }
  if(!roomData){ renderConnecting(); return; }
  if(!roomData.exists){ renderGone(); return; }
  if(roomData.lastActivityAt && (Date.now()-roomData.lastActivityAt > ROOM_EXPIRE_MS)){ renderExpired(); return; }
  const me = playersData.find(p=>p.id===identity.playerId);
  if(!me){ renderRejoining(); return; }
  const hostId = playersData.length ? pickHostId(playersData, Date.now(), identity.playerId) : null;
  const isHost = hostId === identity.playerId;
  const phase = roomData.phase;
  const gameType = roomData.gameType || "telepathy";
  manageTicking(phase);
  manageVoteSub(phase);
  manageStrokeSub(phase);
  if(gameType==="mostlikely"){
    if(phase==="lobby") return renderLobby(isHost);
    if(phase==="question") return renderMLQuestion(me, isHost);
    if(phase==="reveal") return renderMLReveal(isHost);
    if(phase==="ended") return renderMLEnded(isHost);
    return renderConnecting();
  }
  if(gameType==="draw"){
    if(phase==="lobby") return renderLobby(isHost);
    if(phase==="drawing") return renderDrawTurn(me, isHost);
    if(phase==="guessing") return renderDrawGuessing(isHost);
    if(phase==="reveal") return renderDrawReveal(isHost);
    if(phase==="ended") return renderDrawEnded(isHost);
    return renderConnecting();
  }
  if(gameType==="werewolf"){
    if(phase==="lobby") return renderLobby(isHost);
    // 遊戲已經開始後才加入/重新整理進來的人，房間裡沒有幫他分配角色，這些畫面都預設看得到者已有角色，直接擋掉。
    if(!(roomData.roles && roomData.roles[identity.playerId])) return renderWerewolfNoRole();
    if(phase==="night") return renderWerewolfNight(me, isHost);
    if(phase==="hunter") return renderWerewolfHunterShoot(me, isHost);
    if(phase==="daydeaths") return renderWerewolfDayDeaths(isHost);
    if(phase==="discuss") return renderWerewolfDiscuss(isHost);
    if(phase==="vote") return renderWerewolfVote(me, isHost);
    if(phase==="voteresult") return renderWerewolfVoteResult(isHost);
    if(phase==="ended") return renderWerewolfEnded(isHost);
    return renderConnecting();
  }
  if(gameType==="avalon"){
    if(phase==="lobby") return renderLobby(isHost);
    // 遊戲已經開始後才加入/重新整理進來的人，房間裡沒有幫他分配角色，這些畫面都預設看得到者已有角色，直接擋掉。
    if(!(roomData.roles && roomData.roles[identity.playerId])) return renderAvalonNoRole();
    if(phase==="reveal") return renderAvalonReveal(me, isHost);
    if(phase==="team") return renderAvalonTeam(me, isHost);
    if(phase==="vote") return renderAvalonVote(me, isHost);
    if(phase==="voteresult") return renderAvalonVoteResult(isHost);
    if(phase==="mission") return renderAvalonMission(me, isHost);
    if(phase==="missionresult") return renderAvalonMissionResult(isHost);
    if(phase==="assassin") return renderAvalonAssassin(me, isHost);
    if(phase==="ended") return renderAvalonEnded(isHost);
    return renderConnecting();
  }
  if(gameType==="codenames"){
    if(phase==="lobby") return renderLobby(isHost);
    if(phase==="clue" || phase==="guess" || phase==="ended"){
      // 指揮官正在輸入提示時，背景更新不要整頁重畫（會讓輸入框失焦、鍵盤收起）；階段一變就會照常重畫。
      const ae = document.activeElement;
      if(phase==="clue" && ae && ae.id==="cnClueInput") return;
      return renderCnGame(me, isHost);
    }
    return renderConnecting();
  }
  if(gameType==="justone"){
    if(phase==="lobby") return renderLobby(isHost);
    if(phase==="clue" || phase==="guess" || phase==="result" || phase==="ended"){
      // 正在輸入提示/答案時，背景更新不要整頁重畫（會讓輸入框失焦、鍵盤收起）；階段或輪次一變就會照常重畫。
      const ae = document.activeElement;
      if(ae && ((phase==="clue" && ae.id==="joHintInput") || (phase==="guess" && ae.id==="joGuessInput")) && joRenderedKey===phase+"|"+joKeyOf(roomData)) return;
      return renderJoGame(me, isHost);
    }
    return renderConnecting();
  }
  if(phase==="lobby") return renderLobby(isHost);
  if(phase==="question") return renderQuestion(me, isHost);
  if(phase==="reveal") return renderReveal(isHost);
  if(phase==="ended") return renderEnded(isHost);
  renderConnecting();
}

function renderHome(){
  app.innerHTML = `
    <div class="card">
      <div class="tabs">
        <div class="tab ${homeTab==='create'?'active':''}" data-tab="create">開新房間</div>
        <div class="tab ${homeTab==='join'?'active':''}" data-tab="join">加入房間</div>
      </div>
      ${homeTab==='create' ? `
        <label>選擇遊戲</label>
        <div class="gamepicker">
          <button class="gamecard ${homeGameType==='telepathy'?'on':''}" data-game="telepathy">
            <span class="gc-icon" style="--gc:#9a86b8"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="12" r="5.2"/><circle cx="15" cy="12" r="5.2"/><path d="M12 4.2v1.6M12 18.2v1.6" /></svg></span>
            <span class="gc-title">心電感應</span>
            <span class="gc-desc">大家一起選，跟別人不一樣就扣分</span>
          </button>
          <button class="gamecard ${homeGameType==='mostlikely'?'on':''}" data-game="mostlikely">
            <span class="gc-icon" style="--gc:var(--gold)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7.2l2 2 3-4.4 3 4.4 2-2v4.2H7z"/><circle cx="12" cy="15" r="2.2"/><path d="M6.8 21.2c.4-3 2.4-4.4 5.2-4.4s4.8 1.4 5.2 4.4"/></svg></span>
            <span class="gc-title">誰最可能</span>
            <span class="gc-desc">選出全場最像的那個人</span>
          </button>
          <button class="gamecard ${homeGameType==='draw'?'on':''}" data-game="draw">
            <span class="gc-icon" style="--gc:#d08a6a"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.2-4.4L16 4.8a1.8 1.8 0 0 1 2.6 0l.6.6a1.8 1.8 0 0 1 0 2.6L8.4 18.8z"/><path d="M14.2 6.6l3.2 3.2M5.2 15.6l3.2 3.2"/></svg></span>
            <span class="gc-title">接力畫猜</span>
            <span class="gc-desc">大家接力畫一張圖，猜謎者猜猜是什麼</span>
          </button>
          <button class="gamecard ${homeGameType==='werewolf'?'on':''}" data-game="werewolf">
            <span class="gc-icon" style="--gc:#7c8aa8"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z"/><path d="M17 4v3M15.5 5.5h3"/></svg></span>
            <span class="gc-title">狼人殺</span>
            <span class="gc-desc">藏好身分，白天投票揭發狼人</span>
          </button>
          <button class="gamecard ${homeGameType==='avalon'?'on':''}" data-game="avalon">
            <span class="gc-icon" style="--gc:var(--warn)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.2 2.4v9.6H9.8V5.2z"/><path d="M6.5 14.8h11"/><path d="M12 14.8v4.4"/><circle cx="12" cy="20.6" r="1.1"/></svg></span>
            <span class="gc-title">阿瓦隆</span>
            <span class="gc-desc">隱藏陣營，組隊出任務，找出邪惡爪牙</span>
          </button>
          <button class="gamecard ${homeGameType==='codenames'?'on':''}" data-game="codenames">
            <span class="gc-icon" style="--gc:var(--safe)"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.6"/><path d="M14.6 14.6L20 20"/><circle cx="10.5" cy="10.5" r="1.4"/></svg></span>
            <span class="gc-title">機密代號</span>
            <span class="gc-desc">兩隊對抗，用一個詞帶隊友找特工</span>
          </button>
          <button class="gamecard wide ${homeGameType==='justone'?'on':''}" data-game="justone">
            <span class="gc-icon" style="--gc:#b88aa0"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H11.5L7.5 19.5v-4H5z"/><path d="M10.6 9l1.9-1.2v6.2"/></svg></span>
            <span class="gc-title">只有一個</span>
            <span class="gc-desc">全員合作，提示重複就作廢，幫猜詞的人猜中</span>
          </button>
        </div>
      ` : ``}
      <label>你的暱稱</label>
      <input type="text" id="nameInput" maxlength="10" placeholder="例如：小八" value="${esc(homeName)}">
      ${homeTab==='create' ? `
        <label>房間密碼（選填，4 位數字）</label>
        <input type="text" id="passwordInput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="4" placeholder="不設密碼就留空" value="${esc(homePassword)}">
      ` : ``}
      ${homeTab==='join' ? `
        <label>房間代碼</label>
        <input type="text" id="codeInput" class="roomcode-input" maxlength="4" placeholder="XXXX" value="${esc(homeCode)}">
        <label>房間密碼（若有）</label>
        <input type="text" id="passwordInput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="4" placeholder="沒有密碼就留空" value="${esc(homePassword)}">
      ` : ``}
      <label>選一個代表你的頭像</label>
      <div class="avatargrid">
        ${AVATARS.map(a=>`<button class="avatarbtn ${homeAvatar===a?'on':''}" data-avatar="${a}">${a}</button>`).join("")}
      </div>
      <div class="error">${esc(joinError)}</div>
      <button class="btn-primary" id="goBtn">${homeTab==='create' ? '建立房間' : '加入房間'}</button>
    </div>
    <p class="helper">${homeTab==='create'
      ? (homeGameType==='mostlikely' ? '2 人以上就能玩，猜猜大家心裡最可能是誰。'
        : homeGameType==='draw' ? '3 人以上更好玩，大家接力在畫布上畫畫，猜謎者最後猜猜是什麼。'
        : homeGameType==='werewolf' ? '4 人以上才好玩，記得留一個人當主持人念流程也可以，但用手機會更順。'
        : homeGameType==='avalon' ? '5～10 人，隱藏身分的組隊推理遊戲。'
        : homeGameType==='codenames' ? '4～10 人，分成兩隊的猜詞遊戲。'
        : homeGameType==='justone' ? '3～8 人，合作型猜詞遊戲。'
        : '2 人以上就能玩，選到跟別人不一樣的人會被扣分。')
      : '輸入房號就能加入朋友的房間，遊戲類型由房主決定。'}</p>
  `;
  document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{ homeTab=t.dataset.tab; joinError=""; homePassword=""; render(); });
  document.querySelectorAll("[data-game]").forEach(b=> b.onclick = ()=>{ homeGameType = b.dataset.game; render(); });
  document.getElementById("nameInput").oninput = e=>homeName=e.target.value;
  const pwEl = document.getElementById("passwordInput");
  if(pwEl) pwEl.oninput = e=>{ homePassword = e.target.value.replace(/[^0-9]/g,"").slice(0,4); if(e.target.value!==homePassword) e.target.value = homePassword; };
  // 密碼錯誤/沒填時，把游標帶到密碼欄，讓使用者直接重填。
  if(joinError && pwEl && /密碼/.test(joinError) && homeTab==='join'){ try{ pwEl.focus(); }catch(e){} }
  if(sharedLinkProbePending){ sharedLinkProbePending = false; probeSharedRoomPassword(); }
  const codeEl = document.getElementById("codeInput");
  if(codeEl) codeEl.oninput = e=>homeCode = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,4);
  document.querySelectorAll("[data-avatar]").forEach(b=> b.onclick = ()=>{ homeAvatar = b.dataset.avatar; render(); });
  document.getElementById("goBtn").onclick = ()=> homeTab==='create' ? doCreate() : doJoin();
}

function renderConnecting(){ app.innerHTML = `<div class="card" style="text-align:center; color:var(--muted);"><span class="spin"></span>連線中…</div>`; }
function renderGone(){
  app.innerHTML = `<div class="card" style="text-align:center;"><p>這個房間已經不存在了。</p><button class="btn-secondary" id="backBtn">回首頁</button></div>`;
  document.getElementById("backBtn").onclick = leaveToHome;
}
function renderRejoining(){
  app.innerHTML = `<div class="card" style="text-align:center;"><p>你已不在這個房間裡了。</p><button class="btn-secondary" id="backBtn">回首頁</button></div>`;
  document.getElementById("backBtn").onclick = leaveToHome;
}
function renderExpired(){
  if(!expireCleanupDone && roomRef){ expireCleanupDone = true; deleteRoomBestEffort(roomRef); }
  app.innerHTML = `<div class="card" style="text-align:center;"><p>這個房間已經太久沒有動靜，已經自動關閉了。</p><button class="btn-secondary" id="backBtn">回首頁</button></div>`;
  document.getElementById("backBtn").onclick = leaveToHome;
}

let settingsModalOpen = false;
let bankModalOpen = false;

function renderLobby(isHost){
  const players = playersData;
  const gameType = roomData.gameType || "telepathy";
  const isML = gameType === "mostlikely";
  const isDraw = gameType === "draw";
  const isWolf = gameType === "werewolf";
  const isAvalon = gameType === "avalon";
  const isCodenames = gameType === "codenames";
  const isJustone = gameType === "justone";
  const settings = roomData.settings || (isML ? {duration:25, totalRounds:8} : isDraw ? {turnSeconds:12, totalRounds:6} : isWolf ? {roles:{seer:true, witch:false, hunter:false, guard:false}} : isAvalon ? {roles:{percival:true, morgana:true, mordred:false}} : isCodenames ? {} : isJustone ? {totalRounds:13} : {duration:15, targetStrikes:3, enabledCategories:ALL_CATEGORY_IDS, mode:"normal"});
  const enabledCats = new Set(settings.enabledCategories && settings.enabledCategories.length ? settings.enabledCategories : ALL_CATEGORY_IDS);
  const mode = settings.mode || "normal";
  const hostId = pickHostId(players, Date.now(), identity.playerId);
  const readyCount = players.filter(p=>p.ready).length;
  const allReady = players.length>0 && players.every(p=>p.ready);
  const minPlayers = isAvalon ? 5 : (isWolf || isCodenames) ? 4 : isJustone ? 3 : 2;
  const maxPlayers = (isAvalon || isCodenames) ? 10 : isJustone ? 8 : Infinity;
  const canStart = players.length>=minPlayers && players.length<=maxPlayers && allReady;
  const me = players.find(p=>p.id===identity.playerId);
  const myReady = !!(me && me.ready);
  const gameLabel = isML ? '誰最可能' : isDraw ? '接力畫猜' : isWolf ? '狼人殺' : isAvalon ? '阿瓦隆' : isCodenames ? '機密代號' : isJustone ? '只有一個' : '心電感應';
  app.innerHTML = `
    <div class="card">
      <div class="badge purple">LOBBY · ${gameLabel}</div>
      <div class="codeshare clear-badge">
        <span class="mono" style="font-size:11px;color:var(--muted);letter-spacing:.2em;">房號</span>
        <span class="code">${esc(identity.code)}</span>
        ${roomData.password ? `<span class="lockbadge" title="這個房間有密碼">🔒</span>` : ``}
        <button class="copybtn" id="copyBtn">複製</button>
        <button class="copybtn" id="shareBtn">分享</button>
      </div>
      ${roomData.password ? `<p class="helper" id="roomPasswordInfo">密碼：<b class="mono">${esc(roomData.password)}</b>（告訴朋友才進得來）</p>` : ``}
      <p class="helper">把這串代碼傳給朋友，請他們打開同一頁輸入</p>
      <label style="margin-top:6px;">玩家（${players.length}）· 已準備 ${readyCount}/${players.length}</label>
      <ul class="playerlist">
        ${players.map(p=>{
          const isMe = p.id===identity.playerId;
          const scoreSpan = isCodenames ? cnTeamTag(p.team) : isML
            ? `<span class="strikes">🎯 ${p.mlScore||0}</span>`
            : (isDraw || isWolf || isAvalon || isJustone) ? `` : `<span class="strikes">${p.strikes||0}</span>`;
          const rightSide = isMe
            ? `<button class="avatarpick" id="changeAvatarBtn">換頭像</button>`
            : (isHost
                ? `<span class="prow-actions">${scoreSpan}<button class="kickbtn" data-kick="${p.id}">踢除</button></span>`
                : scoreSpan);
          return `<li><span class="pname">${p.ready?'✅':'⏳'} ${avatarOf(p)} ${esc(p.name)} ${isMe?'<span class="you">YOU</span>':''} ${p.id===hostId?'<span class="host">HOST</span>':''}${offBadge(p)}</span>${rightSide}</li>`;
        }).join("")}
      </ul>
      ${lobbyAvatarPickOpen ? `
        <div class="avatargrid" style="margin-top:12px;">
          ${AVATARS.map(a=>`<button class="avatarbtn ${(playersData.find(p=>p.id===identity.playerId)||{}).avatar===a?'on':''}" data-avatar2="${a}">${a}</button>`).join("")}
        </div>
      ` : ``}
      ${isCodenames ? renderCnLobbyTeams(isHost) : ``}
      <button class="btn-secondary" id="readyBtn" style="margin-top:12px;">${myReady?'✅ 已準備（點擊取消）':'我準備好了'}</button>
    </div>

    <div class="iconrow">
      <button class="iconbtn" id="openHelpBtn"><span class="iconbtn-emoji">❓</span><span>玩法</span></button>
      ${isCodenames ? `` : `<button class="iconbtn" id="openSettingsBtn"><span class="iconbtn-emoji">⚙️</span><span>設定</span></button>`}
      ${(isML || isDraw || isWolf || isAvalon || isCodenames || isJustone) ? `` : `<button class="iconbtn" id="openBankBtn"><span class="iconbtn-emoji">📚</span><span>題庫</span></button>`}
      <button class="iconbtn" id="toggleSoundBtn"><span class="iconbtn-emoji">${soundEnabled?'🔊':'🔇'}</span><span>音效</span></button>
    </div>

    ${isHost ? `
      <div class="error">${esc(startError)}</div>
      <button class="btn-primary" id="startBtn" ${canStart?'':'disabled'}>${canStart?'開始遊戲':(players.length<minPlayers?`至少需要 ${minPlayers} 位玩家`:players.length>maxPlayers?`最多 ${maxPlayers} 位玩家`:`等待 ${players.length-readyCount} 人準備`)}</button>
    ` : `<p class="helper">等待房主 <b>${esc(players.find(p=>p.id===hostId)?.name||'')}</b> 開始遊戲…</p>`}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>

    ${settingsModalOpen ? (isML ? renderMLSettingsModal(isHost, settings) : isDraw ? renderDrawSettingsModal(isHost, settings) : isWolf ? renderWerewolfSettingsModal(isHost, settings) : isAvalon ? renderAvalonSettingsModal(isHost, settings) : isJustone ? renderJoSettingsModal(isHost, settings) : renderSettingsModal(isHost, settings, enabledCats, mode)) : ``}
    ${bankModalOpen && !isML && !isDraw && !isWolf && !isAvalon && !isCodenames && !isJustone ? renderBankModal() : ``}
    ${helpModalOpen ? (isML ? renderMLHelpModal() : isDraw ? renderDrawHelpModal() : isWolf ? renderWerewolfHelpModal() : isAvalon ? renderAvalonHelpModal() : isCodenames ? renderCnHelpModal() : isJustone ? renderJoHelpModal() : renderHelpModal()) : ``}
  `;
  document.getElementById("copyBtn").onclick = ()=>{ navigator.clipboard && navigator.clipboard.writeText(identity.code).catch(()=>{}); };
  document.getElementById("shareBtn").onclick = ()=>{
    const gameName = gameLabel;
    const shareUrl = `${location.origin}${location.pathname}?code=${identity.code}`;
    const shareText = `一起來玩${gameName}吧！房號 ${identity.code}\n${shareUrl}`;
    if(navigator.share){
      navigator.share({title:gameName, text:`一起來玩${gameName}吧！房號 ${identity.code}`, url: shareUrl}).catch(()=>{});
    } else if(navigator.clipboard){
      navigator.clipboard.writeText(shareText).catch(()=>{});
    }
  };
  document.getElementById("leaveBtn").onclick = doLeave;
  document.getElementById("readyBtn").onclick = toggleReady;
  document.getElementById("toggleSoundBtn").onclick = ()=>{
    setSoundEnabled(!soundEnabled);
    if(soundEnabled) beep(660,90,"sine");
    render();
  };
  if(isHost){
    document.querySelectorAll("[data-kick]").forEach(b=>{
      b.onclick = ()=> doKick(b.dataset.kick);
    });
  }
  const changeAvatarBtn = document.getElementById("changeAvatarBtn");
  if(changeAvatarBtn) changeAvatarBtn.onclick = ()=>{ lobbyAvatarPickOpen = !lobbyAvatarPickOpen; render(); };
  document.querySelectorAll("[data-avatar2]").forEach(b=>{
    b.onclick = async ()=>{
      const a = b.dataset.avatar2;
      lobbyAvatarPickOpen = false;
      try{ await playersCol.doc(identity.playerId).update({avatar:a}); }catch(e){}
      render();
    };
  });
  document.getElementById("openHelpBtn").onclick = ()=>{ helpModalOpen = true; render(); };
  const openSettingsBtn = document.getElementById("openSettingsBtn");
  if(openSettingsBtn) openSettingsBtn.onclick = ()=>{ settingsModalOpen = true; render(); };
  if(isCodenames) wireCnLobby(isHost);
  const openBankBtn = document.getElementById("openBankBtn");
  if(openBankBtn) openBankBtn.onclick = ()=>{ bankModalOpen = true; render(); };
  if(isHost){
    document.getElementById("startBtn").onclick = isML ? doStartML : isDraw ? doStartDraw : isWolf ? doStartWerewolf : isAvalon ? doStartAvalon : isCodenames ? doStartCodenames : isJustone ? doStartJustone : doStartGame;
  }
  if(settingsModalOpen){ if(isML) wireMLSettingsModal(isHost, settings); else if(isDraw) wireDrawSettingsModal(isHost, settings); else if(isWolf) wireWerewolfSettingsModal(isHost, settings); else if(isAvalon) wireAvalonSettingsModal(isHost, settings); else if(isJustone) wireJoSettingsModal(isHost, settings); else wireSettingsModal(isHost, settings); }
  if(bankModalOpen && !isML && !isDraw && !isWolf && !isAvalon && !isCodenames && !isJustone) wireQuestionBank();
  if(helpModalOpen){ if(isML) wireMLHelpModal(); else if(isDraw) wireDrawHelpModal(); else if(isWolf) wireWerewolfHelpModal(); else if(isAvalon) wireAvalonHelpModal(); else if(isCodenames) wireCnHelpModal(); else if(isJustone) wireJoHelpModal(); else wireHelpModal(); }
}
let lobbyAvatarPickOpen = false;

function renderHelpModal(){
  return `
    <div class="modalbackdrop" id="helpBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>❓ 玩法說明</h2>
          <button class="modalclose" id="helpClose">✕</button>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--safe);">目標</div>
          <p class="helper" style="text-align:left; margin:0;">每一題畫面會出現 A / B / C / D 四個選項，倒數時間內大家一起選，看誰能跟大家有默契。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--accent);">一般模式</div>
          <p class="helper" style="text-align:left; margin:0;">全場只有你選的答案，才會扣分；沒在時間內作答也會扣分。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--warn);">從眾模式</div>
          <p class="helper" style="text-align:left; margin:0;">沒跟到「當輪最多人選」的答案就扣分，猜中大家想的才安全。</p>
        </div>
        <div class="card" style="margin-bottom:0;">
          <div class="helptitle">結束</div>
          <p class="helper" style="text-align:left; margin:0;">扣分累積到房主設定的次數（預設 3 次）就淘汰，遊戲結束後看誰扣分最少、誰扣分最多。</p>
        </div>
      </div>
    </div>
  `;
}
let helpModalOpen = false;
function wireHelpModal(){
  const helpClose = document.getElementById("helpClose");
  if(helpClose) helpClose.onclick = ()=>{ helpModalOpen = false; render(); };
  const helpBackdrop = document.getElementById("helpBackdrop");
  if(helpBackdrop) helpBackdrop.onclick = (e)=>{ if(e.target.id==="helpBackdrop"){ helpModalOpen = false; render(); } };
}

function renderSettingsModal(isHost, settings, enabledCats, mode){
  return `
    <div class="modalbackdrop" id="settingsBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>⚙️ 遊戲設定</h2>
          <button class="modalclose" id="settingsClose">✕</button>
        </div>
        ${isHost ? `
          <div class="settingsrow" style="border-top:none;">
            <span>思考時間</span>
            <div class="stepper">
              <button id="durMinus">−</button><span class="n">${settings.duration} 秒</span><button id="durPlus">+</button>
            </div>
          </div>
          <div class="settingsrow">
            <span>扣幾分算輸</span>
            <div class="stepper">
              <button id="tgtMinus">−</button><span class="n">${settings.targetStrikes} 分</span><button id="tgtPlus">+</button>
            </div>
          </div>
          <div style="padding-top:12px; border-top:1px solid var(--line); margin-top:2px;">
            <span style="font-size:14px; font-weight:700; display:block; margin-bottom:10px;">遊戲模式</span>
            <div class="tabs" style="margin-bottom:0;">
              <div class="tab ${mode==='normal'?'active':''}" data-mode="normal">一般模式</div>
              <div class="tab ${mode==='majority'?'active':''}" data-mode="majority">從眾模式</div>
            </div>
            <p class="helper" style="text-align:left; margin:10px 0 0;">${mode==='normal' ? '全場只有你選的答案，才會扣分。' : '沒跟到「當輪最多人選」的答案就扣分，猜中大家想的才安全。'}</p>
          </div>
          <div style="padding-top:12px; border-top:1px solid var(--line); margin-top:12px;">
            <span style="font-size:14px; font-weight:700; display:block; margin-bottom:10px;">想抽的題目類型（可多選）</span>
            <div class="catchips">
              ${CATEGORIES.map(c=>`<button class="catchip ${enabledCats.has(c.id)?'on':''}" data-cat="${c.id}">${esc(c.label)}</button>`).join("")}
            </div>
          </div>
        ` : `
          <div class="settingsrow" style="border-top:none;">
            <span>思考時間</span><span class="n" style="font-family:'JetBrains Mono',monospace;">${settings.duration} 秒</span>
          </div>
          <div class="settingsrow">
            <span>扣幾分算輸</span><span class="n" style="font-family:'JetBrains Mono',monospace;">${settings.targetStrikes} 分</span>
          </div>
          <div style="padding-top:12px; border-top:1px solid var(--line); margin-top:2px;">
            <span style="font-size:14px; font-weight:700; display:block; margin-bottom:6px;">遊戲模式</span>
            <p class="helper" style="text-align:left; margin:0;">${mode==='normal' ? '一般模式：全場只有你選的答案才扣分' : '從眾模式：沒跟到當輪最多人選的答案就扣分'}</p>
          </div>
          <div style="padding-top:12px; border-top:1px solid var(--line); margin-top:12px;">
            <span style="font-size:14px; font-weight:700; display:block; margin-bottom:10px;">目前抽題類型</span>
            <div class="catchips">
              ${CATEGORIES.filter(c=>enabledCats.has(c.id)).map(c=>`<span class="catchip on" style="cursor:default;">${esc(c.label)}</span>`).join("")}
            </div>
          </div>
          <p class="helper" style="margin:16px 0 0;">只有房主可以調整這些設定。</p>
        `}
      </div>
    </div>
  `;
}

function wireSettingsModal(isHost, settings){
  document.getElementById("settingsClose").onclick = ()=>{ settingsModalOpen = false; render(); };
  document.getElementById("settingsBackdrop").onclick = (e)=>{ if(e.target.id==="settingsBackdrop"){ settingsModalOpen = false; render(); } };
  if(!isHost) return;
  document.getElementById("durMinus").onclick = ()=> updateSettings({duration: Math.max(10, settings.duration-5)});
  document.getElementById("durPlus").onclick = ()=> updateSettings({duration: Math.min(30, settings.duration+5)});
  document.getElementById("tgtMinus").onclick = ()=> updateSettings({targetStrikes: Math.max(2, settings.targetStrikes-1)});
  document.getElementById("tgtPlus").onclick = ()=> updateSettings({targetStrikes: Math.min(10, settings.targetStrikes+1)});
  document.querySelectorAll("[data-mode]").forEach(b=> b.onclick = ()=> updateSettings({mode: b.dataset.mode}));
  document.querySelectorAll("[data-cat]").forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.cat;
      const current = new Set(settings.enabledCategories && settings.enabledCategories.length ? settings.enabledCategories : ALL_CATEGORY_IDS);
      if(current.has(id)){
        if(current.size>1) current.delete(id); // keep at least one category enabled
      } else {
        current.add(id);
      }
      updateSettings({enabledCategories: ALL_CATEGORY_IDS.filter(c=>current.has(c))});
    };
  });
}

function renderMLHelpModal(){
  return `
    <div class="modalbackdrop" id="helpBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>❓ 玩法說明</h2>
          <button class="modalclose" id="helpClose">✕</button>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--safe);">目標</div>
          <p class="helper" style="text-align:left; margin:0;">每一題會丟出一句敘述，例如「最有可能半夜傳訊息找朋友聊天的人」。每一輪會輪流指定一位玩家當「基準者」🎯。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--accent);">怎麼玩</div>
          <p class="helper" style="text-align:left; margin:0;">包含基準者在內，所有人都要把全部玩家從「最不可能」排到「最可能」，可以自由拖拉調整順序，排好再送出，不用照順序一個一個選。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--warn);">計分</div>
          <p class="helper" style="text-align:left; margin:0;">公布時會用基準者的排序當標準答案，你的排序和基準者同一個位置排同一個人，就算猜中該位置、加一分；猜中越多分數越高，基準者本人這輪不計分。</p>
        </div>
        <div class="card" style="margin-bottom:0;">
          <div class="helptitle">結束</div>
          <p class="helper" style="text-align:left; margin:0;">玩完房主設定的題數後遊戲結束，猜中位置數最多的人就是全場最強讀心者。</p>
        </div>
      </div>
    </div>
  `;
}
function wireMLHelpModal(){
  const helpClose = document.getElementById("helpClose");
  if(helpClose) helpClose.onclick = ()=>{ helpModalOpen = false; render(); };
  const helpBackdrop = document.getElementById("helpBackdrop");
  if(helpBackdrop) helpBackdrop.onclick = (e)=>{ if(e.target.id==="helpBackdrop"){ helpModalOpen = false; render(); } };
}

function renderMLSettingsModal(isHost, settings){
  const totalRounds = settings.totalRounds || 8;
  return `
    <div class="modalbackdrop" id="settingsBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>⚙️ 遊戲設定</h2>
          <button class="modalclose" id="settingsClose">✕</button>
        </div>
        ${isHost ? `
          <div class="settingsrow" style="border-top:none;">
            <span>排序時間</span>
            <div class="stepper">
              <button id="durMinus">−</button><span class="n">${settings.duration} 秒</span><button id="durPlus">+</button>
            </div>
          </div>
          <div class="settingsrow">
            <span>玩幾題</span>
            <div class="stepper">
              <button id="roundsMinus">−</button><span class="n">${totalRounds} 題</span><button id="roundsPlus">+</button>
            </div>
          </div>
        ` : `
          <div class="settingsrow" style="border-top:none;">
            <span>排序時間</span><span class="n" style="font-family:'JetBrains Mono',monospace;">${settings.duration} 秒</span>
          </div>
          <div class="settingsrow">
            <span>玩幾題</span><span class="n" style="font-family:'JetBrains Mono',monospace;">${totalRounds} 題</span>
          </div>
          <p class="helper" style="margin:16px 0 0;">只有房主可以調整這些設定。</p>
        `}
      </div>
    </div>
  `;
}
function wireMLSettingsModal(isHost, settings){
  document.getElementById("settingsClose").onclick = ()=>{ settingsModalOpen = false; render(); };
  document.getElementById("settingsBackdrop").onclick = (e)=>{ if(e.target.id==="settingsBackdrop"){ settingsModalOpen = false; render(); } };
  if(!isHost) return;
  document.getElementById("durMinus").onclick = ()=> updateSettings({duration: Math.max(15, settings.duration-5)});
  document.getElementById("durPlus").onclick = ()=> updateSettings({duration: Math.min(60, settings.duration+5)});
  const totalRounds = settings.totalRounds || 8;
  document.getElementById("roundsMinus").onclick = ()=> updateSettings({totalRounds: Math.max(3, totalRounds-1)});
  document.getElementById("roundsPlus").onclick = ()=> updateSettings({totalRounds: Math.min(20, totalRounds+1)});
}

function renderDrawHelpModal(){
  return `
    <div class="modalbackdrop" id="helpBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>❓ 玩法說明</h2>
          <button class="modalclose" id="helpClose">✕</button>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--safe);">目標</div>
          <p class="helper" style="text-align:left; margin:0;">每一輪會指定一位「猜謎者」🙈，其他人都知道題目，依序輪流在同一張畫布上接力畫畫。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--accent);">怎麼玩</div>
          <p class="helper" style="text-align:left; margin:0;">輪到你畫的時候，時間到就會自動換下一個人接著畫；猜謎者全程看不到題目，只能看畫布。</p>
        </div>
        <div class="card" style="margin-bottom:0;">
          <div class="helptitle">猜謎</div>
          <p class="helper" style="text-align:left; margin:0;">大家都畫完之後，猜謎者看著完成的畫猜是什麼，猜完（或用嘴巴講也行）就公布答案，換下一輪、換下一個人當猜謎者。沒有計分，純粹好玩！</p>
        </div>
      </div>
    </div>
  `;
}
function wireDrawHelpModal(){
  const helpClose = document.getElementById("helpClose");
  if(helpClose) helpClose.onclick = ()=>{ helpModalOpen = false; render(); };
  const helpBackdrop = document.getElementById("helpBackdrop");
  if(helpBackdrop) helpBackdrop.onclick = (e)=>{ if(e.target.id==="helpBackdrop"){ helpModalOpen = false; render(); } };
}

function renderDrawSettingsModal(isHost, settings){
  const totalRounds = settings.totalRounds || 6;
  return `
    <div class="modalbackdrop" id="settingsBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>⚙️ 遊戲設定</h2>
          <button class="modalclose" id="settingsClose">✕</button>
        </div>
        ${isHost ? `
          <div class="settingsrow" style="border-top:none;">
            <span>每人畫幾秒</span>
            <div class="stepper">
              <button id="durMinus">−</button><span class="n">${settings.turnSeconds} 秒</span><button id="durPlus">+</button>
            </div>
          </div>
          <div class="settingsrow">
            <span>玩幾輪</span>
            <div class="stepper">
              <button id="roundsMinus">−</button><span class="n">${totalRounds} 輪</span><button id="roundsPlus">+</button>
            </div>
          </div>
        ` : `
          <div class="settingsrow" style="border-top:none;">
            <span>每人畫幾秒</span><span class="n" style="font-family:'JetBrains Mono',monospace;">${settings.turnSeconds} 秒</span>
          </div>
          <div class="settingsrow">
            <span>玩幾輪</span><span class="n" style="font-family:'JetBrains Mono',monospace;">${totalRounds} 輪</span>
          </div>
          <p class="helper" style="margin:16px 0 0;">只有房主可以調整這些設定。</p>
        `}
      </div>
    </div>
  `;
}
function wireDrawSettingsModal(isHost, settings){
  document.getElementById("settingsClose").onclick = ()=>{ settingsModalOpen = false; render(); };
  document.getElementById("settingsBackdrop").onclick = (e)=>{ if(e.target.id==="settingsBackdrop"){ settingsModalOpen = false; render(); } };
  if(!isHost) return;
  document.getElementById("durMinus").onclick = ()=> updateSettings({turnSeconds: Math.max(6, settings.turnSeconds-2)});
  document.getElementById("durPlus").onclick = ()=> updateSettings({turnSeconds: Math.min(30, settings.turnSeconds+2)});
  const totalRounds = settings.totalRounds || 6;
  document.getElementById("roundsMinus").onclick = ()=> updateSettings({totalRounds: Math.max(2, totalRounds-1)});
  document.getElementById("roundsPlus").onclick = ()=> updateSettings({totalRounds: Math.min(15, totalRounds+1)});
}

function renderWerewolfHelpModal(){
  return `
    <div class="modalbackdrop" id="helpBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>❓ 玩法說明</h2>
          <button class="modalclose" id="helpClose">✕</button>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--safe);">目標</div>
          <p class="helper" style="text-align:left; margin:0;">每個人會拿到一個隱藏身分：狼人、村民，或是房主開啟的特殊角色。狼人每晚要淘汰一位好人，好人要在白天用討論跟投票找出所有狼人。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--accent);">夜晚</div>
          <p class="helper" style="text-align:left; margin:0;">依序輪到醫生、狼人、預言家、女巫行動（只有開啟的角色才會輪到），其他人這時候手機上只會看到「夜深了」的等待畫面，記得閉眼安靜等待，不要偷看別人手機。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--warn);">白天</div>
          <p class="helper" style="text-align:left; margin:0;">公布晚上死了誰之後，大家開嘴巴討論、指控、辯論，最後一起投票淘汰一位嫌疑最大的人（平票就沒有人被淘汰）。</p>
        </div>
        <div class="card" style="margin-bottom:0;">
          <div class="helptitle">結束</div>
          <p class="helper" style="text-align:left; margin:0;">狼人全部被淘汰，好人陣營勝利；狼人數量到達或超過好人數量，狼人陣營勝利。這款遊戲沒有真正的登入驗證，「隱藏身分」單純是畫面上不顯示給別人看，請大家憑默契不要偷看別人手機喔！</p>
        </div>
      </div>
    </div>
  `;
}
function wireWerewolfHelpModal(){
  const helpClose = document.getElementById("helpClose");
  if(helpClose) helpClose.onclick = ()=>{ helpModalOpen = false; render(); };
  const helpBackdrop = document.getElementById("helpBackdrop");
  if(helpBackdrop) helpBackdrop.onclick = (e)=>{ if(e.target.id==="helpBackdrop"){ helpModalOpen = false; render(); } };
}

const WEREWOLF_ROLE_DEFS = [
  {id:"seer", label:"預言家"},
  {id:"witch", label:"女巫"},
  {id:"hunter", label:"獵人"},
  {id:"guard", label:"醫生"}
];
function renderWerewolfSettingsModal(isHost, settings){
  const rolesSettings = settings.roles || {seer:true, witch:false, hunter:false, guard:false};
  const wolfCount = computeWolfCount(playersData.length);
  return `
    <div class="modalbackdrop" id="settingsBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>⚙️ 遊戲設定</h2>
          <button class="modalclose" id="settingsClose">✕</button>
        </div>
        <div class="settingsrow" style="border-top:none;">
          <span>狼人人數（依人數自動算）</span><span class="n" style="font-family:'JetBrains Mono',monospace;">${wolfCount} 人</span>
        </div>
        <div style="padding-top:12px; border-top:1px solid var(--line); margin-top:2px;">
          <span style="font-size:14px; font-weight:700; display:block; margin-bottom:10px;">開啟的特殊角色（可多選）</span>
          <div class="catchips">
            ${WEREWOLF_ROLE_DEFS.map(r=>`<button class="catchip ${rolesSettings[r.id]?'on':''}" data-role="${r.id}" ${isHost?'':'disabled'}>${esc(r.label)}</button>`).join("")}
          </div>
          ${!isHost ? `<p class="helper" style="margin:16px 0 0;">只有房主可以調整這些設定。</p>` : ``}
        </div>
      </div>
    </div>
  `;
}
function wireWerewolfSettingsModal(isHost, settings){
  document.getElementById("settingsClose").onclick = ()=>{ settingsModalOpen = false; render(); };
  document.getElementById("settingsBackdrop").onclick = (e)=>{ if(e.target.id==="settingsBackdrop"){ settingsModalOpen = false; render(); } };
  if(!isHost) return;
  const rolesSettings = settings.roles || {seer:true, witch:false, hunter:false, guard:false};
  document.querySelectorAll("[data-role]").forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.role;
      updateSettings({roles: Object.assign({}, rolesSettings, {[id]: !rolesSettings[id]})});
    };
  });
}

function renderAvalonHelpModal(){
  return `
    <div class="modalbackdrop" id="helpBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>❓ 玩法說明</h2>
          <button class="modalclose" id="helpClose">✕</button>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--safe);">目標</div>
          <p class="helper" style="text-align:left; margin:0;">5～10 人分成好人與壞人兩個陣營。好人要成功完成 3 次任務；壞人要讓 3 次任務失敗，或在最後刺殺梅林。每個人手機上會看到自己的隱藏身分。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--accent);">一輪流程</div>
          <p class="helper" style="text-align:left; margin:0;">① 隊長挑選本輪任務的隊員。② 全員投票同意或反對（同意票要嚴格多於反對票才通過，平票視為否決）。③ 通過後，隊員各自秘密出「成功」或「失敗」（好人只能出成功），只公開失敗票有幾張。隊長依加入順序輪流，連續 5 次組隊被否決，壞人直接獲勝。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--warn);">特殊規則</div>
          <p class="helper" style="text-align:left; margin:0;">7 人以上時，第 4 輪任務要 2 張失敗票才算失敗，其餘輪次 1 張即失敗。房主可以開關派西維爾、莫甘娜、莫德雷德；梅林與刺客一定存在。</p>
        </div>
        <div class="card" style="margin-bottom:0;">
          <div class="helptitle">結束</div>
          <p class="helper" style="text-align:left; margin:0;">任務失敗滿 3 次，壞人勝利；任務成功滿 3 次，刺客可以指認梅林，指對則壞人逆轉獲勝，指錯則好人勝利。這款遊戲沒有真正的登入驗證，「隱藏身分」單純是畫面上不顯示給別人看，請大家憑默契不要偷看別人手機喔！</p>
        </div>
      </div>
    </div>
  `;
}
function wireAvalonHelpModal(){
  const helpClose = document.getElementById("helpClose");
  if(helpClose) helpClose.onclick = ()=>{ helpModalOpen = false; render(); };
  const helpBackdrop = document.getElementById("helpBackdrop");
  if(helpBackdrop) helpBackdrop.onclick = (e)=>{ if(e.target.id==="helpBackdrop"){ helpModalOpen = false; render(); } };
}

const AVALON_ROLE_DEFS = [
  {id:"percival", label:"派西維爾"},
  {id:"morgana", label:"莫甘娜"},
  {id:"mordred", label:"莫德雷德"}
];
function renderAvalonSettingsModal(isHost, settings){
  const rolesSettings = settings.roles || {percival:true, morgana:true, mordred:false};
  const n = playersData.length;
  const counts = (n>=5 && n<=10) ? AVALON_FACTION_COUNTS[n] : null;
  return `
    <div class="modalbackdrop" id="settingsBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>⚙️ 遊戲設定</h2>
          <button class="modalclose" id="settingsClose">✕</button>
        </div>
        <div class="settingsrow" style="border-top:none;">
          <span>陣營人數（依人數自動算）</span><span class="n" style="font-family:'JetBrains Mono',monospace;">${counts ? `好 ${counts.good} / 壞 ${counts.evil}` : '需 5～10 人'}</span>
        </div>
        <div style="padding-top:12px; border-top:1px solid var(--line); margin-top:2px;">
          <span style="font-size:14px; font-weight:700; display:block; margin-bottom:10px;">開啟的特殊角色（梅林、刺客一定存在）</span>
          <div class="catchips">
            ${AVALON_ROLE_DEFS.map(r=>`<button class="catchip ${rolesSettings[r.id]?'on':''}" data-role="${r.id}" ${isHost?'':'disabled'}>${esc(r.label)}</button>`).join("")}
          </div>
          ${!isHost ? `<p class="helper" style="margin:16px 0 0;">只有房主可以調整這些設定。</p>` : ``}
        </div>
      </div>
    </div>
  `;
}
function wireAvalonSettingsModal(isHost, settings){
  document.getElementById("settingsClose").onclick = ()=>{ settingsModalOpen = false; render(); };
  document.getElementById("settingsBackdrop").onclick = (e)=>{ if(e.target.id==="settingsBackdrop"){ settingsModalOpen = false; render(); } };
  if(!isHost) return;
  const rolesSettings = settings.roles || {percival:true, morgana:true, mordred:false};
  document.querySelectorAll("[data-role]").forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.role;
      updateSettings({roles: Object.assign({}, rolesSettings, {[id]: !rolesSettings[id]})});
    };
  });
}

function renderBankModal(){
  return `
    <div class="modalbackdrop" id="bankBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>📚 題庫</h2>
          <button class="modalclose" id="bankClose">✕</button>
        </div>
        ${renderQuestionBank()}
      </div>
    </div>
  `;
}

function renderQuestionBank(){
  return `
    <div class="card">
      <div class="badge green">題庫</div>
      <div id="bankAddArea">
        ${bankFormOpen ? `
          <div class="stack">
            <div style="display:flex; justify-content:flex-end; margin-bottom:-4px;">
              <button class="btn-ghost" id="bankRuleToggle" style="width:auto; padding:2px 4px; font-size:12px;">？ 題目撰寫規則</button>
            </div>
            ${bankRuleHelpOpen ? `
              <p class="helper" style="text-align:left; margin:0;">每一題都要帶入「本輪主角」：題目裡要打上 <b>PP</b> 這兩個字，出題時會自動換成當輪輪到的玩家名字，例如「你猜PP最想去的地方是？」。系統會依玩家加入順序輪流分配主角，讓每個人被當主角的次數公平，不用手動指定。</p>
            ` : ``}
            <input type="text" id="bankQ" placeholder="題目（需包含 PP）" value="${esc(bankDraft.q)}" maxlength="60">
            <input type="text" id="bankA" placeholder="A 選項" value="${esc(bankDraft.opts[0])}" maxlength="30">
            <input type="text" id="bankB" placeholder="B 選項" value="${esc(bankDraft.opts[1])}" maxlength="30">
            <input type="text" id="bankC" placeholder="C 選項" value="${esc(bankDraft.opts[2])}" maxlength="30">
            <input type="text" id="bankD" placeholder="D 選項" value="${esc(bankDraft.opts[3])}" maxlength="30">
            <select id="bankCat">
              ${CATEGORIES.map(c=>`<option value="${c.id}" ${bankDraft.cat===c.id?'selected':''}>${esc(c.label)}</option>`).join("")}
            </select>
            <div class="error">${esc(bankError)}</div>
            <div class="row">
              <button class="btn-secondary" id="bankCancel">取消</button>
              <button class="btn-primary" id="bankSave">${bankEditingId ? '更新題目' : '儲存題目'}</button>
            </div>
          </div>
        ` : `<button class="btn-secondary" id="bankOpen">＋ 新增一題</button>`}
      </div>
      ${bankLoadError ? `<p class="helper" style="color:var(--warn); text-align:left; margin-top:10px;">題庫載入失敗：${esc(bankLoadError)}</p>` : ``}
      ${customQuestionsData.length ? `
        <div class="stack" style="margin-top:14px; max-height:360px; overflow-y:auto; padding-right:2px;">
          ${customQuestionsData.map(c=>`
            <div class="tallyrow" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
              <span style="font-size:13.5px; font-weight:700;">${c.builtin?'<span class="cattag" style="opacity:.7;">內建</span> ':''}${esc(c.q)}<span class="cattag">${esc(CATEGORY_LABEL[c.category]||'其他')}</span></span>
              <span style="display:flex; gap:4px; flex:none;">
                <button class="btn-ghost" style="width:auto; padding:6px 8px;" data-edit="${c.id}">編輯</button>
                <button class="btn-ghost" style="width:auto; padding:6px 8px;" data-del="${c.id}">刪除</button>
              </span>
            </div>
          `).join("")}
        </div>
      ` : (bankLoadError ? `` : `<p class="helper" style="margin-top:14px;">目前題庫是空的</p>`)}
    </div>
  `;
}

let bankFormOpen = false;
let bankDraft = {q:"", opts:["","","",""], cat:"life"};
let bankError = "";
let bankEditingId = null;
let bankLoadError = "";
let bankRuleHelpOpen = false;

function wireQuestionBank(){
  const bankClose = document.getElementById("bankClose");
  if(bankClose) bankClose.onclick = ()=>{ bankModalOpen = false; render(); };
  const bankBackdrop = document.getElementById("bankBackdrop");
  if(bankBackdrop) bankBackdrop.onclick = (e)=>{ if(e.target.id==="bankBackdrop"){ bankModalOpen = false; render(); } };
  const bankRuleToggle = document.getElementById("bankRuleToggle");
  if(bankRuleToggle) bankRuleToggle.onclick = ()=>{ bankRuleHelpOpen = !bankRuleHelpOpen; render(); };

  const openBtn = document.getElementById("bankOpen");
  if(openBtn) openBtn.onclick = ()=>{ bankFormOpen=true; bankEditingId=null; bankDraft={q:"",opts:["","","",""],cat:"life"}; bankError=""; render(); };
  const cancelBtn = document.getElementById("bankCancel");
  if(cancelBtn) cancelBtn.onclick = ()=>{ bankFormOpen=false; bankEditingId=null; bankDraft={q:"",opts:["","","",""],cat:"life"}; bankError=""; render(); };
  const saveBtn = document.getElementById("bankSave");
  if(saveBtn){
    ["bankQ","bankA","bankB","bankC","bankD"].forEach((id,i)=>{
      const el = document.getElementById(id);
      if(!el) return;
      el.oninput = e=>{ if(i===0) bankDraft.q=e.target.value; else bankDraft.opts[i-1]=e.target.value; };
    });
    const catEl = document.getElementById("bankCat");
    if(catEl) catEl.onchange = e=> bankDraft.cat = e.target.value;
    saveBtn.onclick = doSaveCustomQuestion;
  }
  document.querySelectorAll("[data-del]").forEach(b=> b.onclick = ()=> doDeleteCustomQuestion(b.dataset.del));
  document.querySelectorAll("[data-edit]").forEach(b=>{
    b.onclick = ()=>{
      const c = customQuestionsData.find(cc=>cc.id===b.dataset.edit);
      if(!c) return;
      bankEditingId = c.id;
      bankDraft = {q:c.q, opts:(c.options||["","","",""]).slice(), cat:c.category||"life"};
      bankFormOpen = true;
      bankError = "";
      render();
    };
  });
}

async function doSaveCustomQuestion(){
  const q = bankDraft.q.trim();
  const opts = bankDraft.opts.map(o=>o.trim());
  if(!q || opts.some(o=>!o)){ bankError = "題目跟四個選項都要填喔"; render(); return; }
  if(!q.includes("PP")){ bankError = "題目裡要包含 PP，出題時才會換成本輪主角的名字"; render(); return; }
  const d = await ensureDb();
  if(!d){ bankError = "目前無法連線儲存"; render(); return; }
  try{
    if(bankEditingId){
      await customQuestionsCol.doc(bankEditingId).update({q, options:opts, category: bankDraft.cat||"life", targeted:true});
    } else {
      await customQuestionsCol.add({q, options:opts, category: bankDraft.cat||"life", targeted:true, createdAt: Date.now()});
    }
    bankFormOpen = false; bankEditingId = null; bankDraft = {q:"", opts:["","","",""], cat:"life"}; bankError = "";
    render();
  }catch(e){ bankError = "儲存失敗：" + ((e && (e.message||e.code)) || String(e)); render(); }
}

async function doDeleteCustomQuestion(id){
  try{ await customQuestionsCol.doc(id).delete(); }catch(e){}
}

