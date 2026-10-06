function remainingSeconds(){
  if(!roomData || !roomData.roundEndAt) return 0;
  return Math.max(0, (roomData.roundEndAt - Date.now())/1000);
}

function renderQuestion(me, isHost){
  const q = roomData.currentQuestion || {q:"", options:[]};
  const duration = (roomData.settings && roomData.settings.duration) || 15;
  const remain = remainingSeconds();
  const remainInt = Math.ceil(remain);
  const frac = Math.max(0, Math.min(1, remain/duration));
  const R = 44, C = 2*Math.PI*R;
  const dashoffset = C*(1-frac);
  const myVote = votesData.find(v=>v.playerId===identity.playerId && v.round===roomData.round);
  const votedIds = new Set(votesData.map(v=>v.playerId));
  const target = (roomData.settings && roomData.settings.targetStrikes) || 3;
  const myStrikes = (me && me.strikes) || 0;
  const closeToOut = target>0 && myStrikes >= target-1;

  app.innerHTML = `
    <div class="card">
      <div class="badge purple">${(roomData.settings&&roomData.settings.mode==='majority')?'從眾':'一般'} · 第 ${roomData.round} 題</div>
      <div class="mono" style="font-size:12px; font-weight:800; color:${closeToOut?'var(--warn)':'var(--muted)'};">你目前 ${myStrikes}/${target} 分</div>
      <div class="timerzone">
        <div class="ring-wrap">
          <svg viewBox="0 0 100 100">
            <circle class="ring-bg" cx="50" cy="50" r="${R}"></circle>
            <circle class="ring-fg ${frac<0.25?'low':''}" cx="50" cy="50" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${dashoffset}"></circle>
          </svg>
          <div class="ring-num digits">${remainInt}</div>
        </div>
      </div>
      <div class="qtext">${esc(q.q)}</div>
      <div class="optgrid">
        ${q.options.map((opt,i)=>`
          <button class="optbtn ${myVote && myVote.choice===LETTERS[i] ? 'picked':''}" data-choice="${LETTERS[i]}" ${myVote?'disabled':''}>
            <span class="letter">${LETTERS[i]}</span>
            <span class="txt">${esc(opt)}</span>
          </button>
        `).join("")}
      </div>
      <div class="answeredrow">
        ${playersData.map(p=>`<span class="achip ${votedIds.has(p.id)?'done':''}">${avatarOf(p)} ${esc(p.name)}${votedIds.has(p.id)?' ✓':''}</span>`).join("")}
      </div>
    </div>
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(!myVote){
    document.querySelectorAll(".optbtn").forEach(b=> b.onclick = ()=> castVote(b.dataset.choice));
  }
  document.getElementById("leaveBtn").onclick = doLeave;
}

let revealAnimRound = null;
let revealStage = 0;
let revealTimers = [];
function clearRevealTimers(){ revealTimers.forEach(t=>clearTimeout(t)); revealTimers=[]; }
function startRevealAnim(round){
  clearRevealTimers();
  revealAnimRound = round;
  revealStage = 0;
  // 翻牌的 CSS 動畫要 0.55 秒才轉完，原本每 420ms 就翻下一張，
  // 會在前一張還沒轉完時就疊上新的翻轉，看起來像在「搶拍」、一閃而過。
  // 這裡把起始停頓跟每張間隔都拉長到比動畫時間長一點，讓每張牌都轉完才翻下一張，
  // 同時也讓答題畫面切過來後有個喘息的瞬間，不會覺得畫面在硬切。
  const startDelay = 700;
  const stepDelay = 650;
  LETTERS.forEach((_,i)=>{
    revealTimers.push(setTimeout(()=>{ revealStage = i+1; render(); }, startDelay + stepDelay*i));
  });
}

function renderScoreboard(){
  const target = (roomData.settings && roomData.settings.targetStrikes) || 3;
  const ranked = playersData.slice().sort((a,b)=>{
    const ra = target-(a.strikes||0), rb = target-(b.strikes||0);
    return rb-ra;
  });
  return `
    <div class="card revealfade">
      <div class="badge purple">戰況</div>
      <label>目前戰況（剩餘分數，越多越安全）</label>
      <div class="barchart">
        ${ranked.map(p=>{
          const remain = Math.max(0, target-(p.strikes||0));
          const pct = target>0 ? Math.round(remain/target*100) : 0;
          return `<div class="barrow ${p.id===identity.playerId?'me':''}">
            <div class="barlabel">${avatarOf(p)} ${esc(p.name)}</div>
            <div class="bartrack"><div class="barfill" style="width:${pct}%"></div></div>
            <div class="barvalue">${remain}</div>
          </div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderReveal(isHost){
  const log = (roomData.revealLog||[]);
  const last = log[log.length-1];
  if(!last){ renderConnecting(); return; }
  if(revealAnimRound !== last.round) startRevealAnim(last.round);
  const struckSet = new Set(last.struckIds||[]);
  const noAnswer = (last.noAnswerIds||[]).map(id=> avatarOf(playersData.find(p=>p.id===id)) + " " + ((playersData.find(p=>p.id===id)||{}).name || "?"));
  const doneFlipping = revealStage >= LETTERS.length;
  if(doneFlipping && soundedRound !== last.round){
    soundedRound = last.round;
    const iWasOut = struckSet.has(identity.playerId) || (last.noAnswerIds||[]).includes(identity.playerId);
    playResultSound(!iWasOut);
  }

  app.innerHTML = `
    <div class="card">
      <div class="badge red">結果揭曉</div>
      <div class="qtext" style="font-size:17px;">${esc(last.q)}</div>
      <div class="tallywrap">
        ${last.options.map((opt,i)=>{
          const letter = LETTERS[i];
          const ids = last.byOption[letter]||[];
          const isStruck = ids.length>0 && ids.every(id=>struckSet.has(id));
          const chips = ids.map(id=>{
            const p = playersData.find(pp=>pp.id===id);
            const nm = p ? esc(p.name) : "?";
            const av = p ? avatarOf(p) : "🙂";
            return `<span class="avatarchip mini ${isStruck?'struckchip':''}">${av} ${nm}</span>`;
          }).join("");
          const revealed = i < revealStage;
          return `<div class="flipcard">
            <div class="flipcard-inner ${revealed?'flipped':''}">
              <div class="flipface front">${letter}</div>
              <div class="flipface back ${isStruck?'struck':''} ${(doneFlipping&&isStruck)?'struck-blink':''}">
                <div class="tallyhead"><span class="opt">${letter}．${esc(opt)}</span><span class="cnt">${ids.length} 人</span></div>
                <div class="tallynames">${chips || '沒有人選'}</div>
              </div>
            </div>
          </div>`;
        }).join("")}
      </div>
      ${doneFlipping && noAnswer.length ? `<div class="noanswer">未作答（自動扣分）：${noAnswer.join('、')}</div>` : ``}
    </div>
    ${doneFlipping ? renderScoreboard() : ``}
    ${doneFlipping ? (isHost ? `<button class="btn-primary" id="nextBtn">繼續下一題</button>` : `<p class="helper">等待房主繼續下一題</p>`) : ``}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(doneFlipping && isHost) document.getElementById("nextBtn").onclick = doNextQuestion;
  document.getElementById("leaveBtn").onclick = doLeave;
}

function renderEnded(isHost){
  const losers = roomData.losers || [];
  const loserIds = new Set(losers.map(l=>l.id));
  const minStrikes = playersData.length ? Math.min(...playersData.map(p=>p.strikes||0)) : 0;
  const champions = playersData.filter(p=>(p.strikes||0)===minStrikes && !loserIds.has(p.id));
  const rounds = (roomData.revealLog||[]).length;
  const dateStr = new Date().toLocaleDateString("zh-TW",{month:"numeric",day:"numeric"});

  app.innerHTML = `
    <div class="card">
      <div class="badge red">戰績卡</div>
      <div style="text-align:center;">
        <div class="mono" style="font-size:11px;color:var(--muted);letter-spacing:.18em;">房號 ${esc(identity.code)} · ${esc(dateStr)} · 共 ${rounds} 題</div>
        <h2 style="font-size:23px; margin-top:8px; background:linear-gradient(100deg, var(--accent), var(--safe)); -webkit-background-clip:text; background-clip:text; color:transparent;">心電感應戰績卡</h2>
      </div>

      <div class="sharerow lose">
        <div class="sharerow-label">😵 電最慘</div>
        <div class="sharerow-people">${losers.map(l=>{
          const p = playersData.find(pp=>pp.id===l.id);
          return `<span class="avatarchip">${p?avatarOf(p):'🙂'} ${esc(l.name)}</span>`;
        }).join("") || `<span class="avatarchip">—</span>`}</div>
      </div>
      <div class="sharerow win">
        <div class="sharerow-label">🏆 默契最好</div>
        <div class="sharerow-people">${champions.length ? champions.map(p=>`<span class="avatarchip">${avatarOf(p)} ${esc(p.name)}</span>`).join("") : `<span class="avatarchip">—</span>`}</div>
      </div>

      <div style="margin-top:18px;">
        <label>完整排名（扣分由少到多）</label>
        <ul class="playerlist">
          ${playersData.slice().sort((a,b)=>(a.strikes||0)-(b.strikes||0)).map(p=>`
            <li><span class="pname">${avatarOf(p)} ${esc(p.name)} ${p.id===identity.playerId?'<span class="you">YOU</span>':''}${offBadge(p)}</span><span class="strikes">${p.strikes||0}</span></li>
          `).join("")}
        </ul>
      </div>
      <p class="helper" style="margin:16px 0 0;">截圖這張卡片，傳到聊天群組吧！</p>
    </div>
    ${isHost ? `<button class="btn-primary" id="rematchBtn">再玩一局</button>` : `<p class="helper">等待房主開始下一局</p>`}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(isHost) document.getElementById("rematchBtn").onclick = doRematch;
  document.getElementById("leaveBtn").onclick = doLeave;
}

