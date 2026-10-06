//#@ logic
// ---------- 只有一個：純邏輯 ----------
function joShuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 比對用的正規化：全形轉半形、轉小寫，去掉空白與標點符號。
function joNorm(s){
  let out = "";
  for(const ch of String(s==null?"":s)){
    const c = ch.codePointAt(0);
    if(c===0x3000) out += " ";
    else if(c>=0xFF01 && c<=0xFF5E) out += String.fromCodePoint(c-0xFEE0);
    else out += ch;
  }
  return out.toLowerCase().replace(/[\s\p{P}\p{S}​-‍﻿]/gu, "");
}
function joTotal(settings){ return settings && settings.totalRounds===7 ? 7 : 13; }
function joKeyOf(rd){ return `${(rd&&rd.round)||0}|${(rd&&rd.deckIndex)||0}|${(rd&&rd.guesserId)||""}`; }
// 牌堆：洗牌後取 totalRounds+2 個字（猜錯會連帶丟掉下一張，多備 2 張）。
function joBuildDeck(total, words){
  return joShuffle(words || JO_WORDS).slice(0, total+2);
}
// 提示規則：去頭尾空白、不能空、不能含空白、最多 8 字、不能和神祕詞相同或互相包含。
function joValidateHint(raw, word){
  const text = String(raw==null?"":raw).trim();
  if(!text) return {ok:false, msg:"請輸入提示", text};
  if(/\s/.test(text)) return {ok:false, msg:"提示只能是一個詞，不能有空白", text};
  if(Array.from(text).length>8) return {ok:false, msg:"提示最多 8 個字", text};
  const nt = joNorm(text), nw = joNorm(word);
  if(!nt) return {ok:false, msg:"提示不能只有符號", text};
  if(nw && (nt===nw || nt.indexOf(nw)>=0 || nw.indexOf(nt)>=0)) return {ok:false, msg:"提示不能和答案相同或互相包含", text};
  return {ok:true, msg:"", text};
}
// 結算提示：正規化後相同的提示，只要有 2 人以上寫一樣，全部作廢（包含寫的人都算）。
// 回傳的 validHints 順序是洗牌過的（不會洩漏是誰寫的）。word 有給的話，順便把違規提示也作廢。
function joResolveHints(hints, eligibleIds, word){
  const entries = [];
  (eligibleIds||[]).forEach(pid=>{
    const raw = hints ? hints[pid] : null;
    if(raw==null) return;
    const text = String(raw).trim();
    entries.push({pid, text, n: joNorm(text)});
  });
  const count = {};
  entries.forEach(e=>{ count[e.n] = (count[e.n]||0)+1; });
  const kept = [], removedIds = [];
  entries.forEach(e=>{
    const bad = !e.n || count[e.n]>=2 || (word!=null && !joValidateHint(e.text, word).ok);
    if(bad) removedIds.push(e.pid); else kept.push({pid:e.pid, text:e.text});
  });
  return {validHints: joShuffle(kept), removedIds};
}
function joGuessCorrect(guess, word){
  const g = joNorm(guess);
  return !!g && g===joNorm(word);
}
// 一輪結算：答對 +1 分、用 1 張；跳過用 1 張；答錯用 2 張（下一張牌也丟掉）。
function joApplyResult(st, action){
  const cardsUsed = st.cardsUsed||0, score = st.score||0;
  if(action==="correct") return {cardsUsed: cardsUsed+1, score: score+1, verdict:"correct"};
  if(action==="skip") return {cardsUsed: cardsUsed+1, score, verdict:"skip"};
  return {cardsUsed: cardsUsed+2, score, verdict:"wrong"};
}
// 房主改判（同義詞）：只有「猜錯」且還沒改判過才能改，改完等於答對：+1 分、用牌數變成只用 1 張。
function joOverride(st){
  if(st.verdict!=="wrong" || st.overridden) return null;
  return {cardsUsed: (st.cardsUsed||0)-1, score: (st.score||0)+1, verdict:"correct", overridden:true};
}
// 這輪結束後：下一張牌的位置（猜錯要多丟一張）與是否結束。
function joAfterRound(st){
  const nextIndex = (st.deckIndex||0) + (st.verdict==="wrong" ? 2 : 1);
  const over = (st.cardsUsed||0) >= st.total || nextIndex >= st.deckLen;
  return {nextIndex, over};
}
// 猜詞者依加入順序輪流；目前這位不在名單或離開了也能從他的位置往後找；找不到在場的人回傳 null。
function joNextGuesser(order, currentId, presentIds){
  const n = (order||[]).length;
  if(!n) return null;
  const present = new Set(presentIds||[]);
  const start = order.indexOf(currentId);
  for(let k=1;k<=n;k++){
    const id = order[(start+k) % n];
    if(present.has(id)) return id;
  }
  return null;
}
function joEligible(order, guesserId, presentIds){
  const present = new Set(presentIds||[]);
  return (order||[]).filter(id=> id!==guesserId && present.has(id));
}
// 換下一輪（或結束）要寫進房間的欄位。fd = 目前房間資料；cardsUsed/nextIndex = 這輪結算後的值。
function joAdvancePatch(fd, cardsUsed, nextIndex, presentIds){
  const total = joTotal(fd.settings);
  const over = cardsUsed>=total || nextIndex>=(fd.deck||[]).length;
  const nextG = over ? null : joNextGuesser(fd.guesserOrder||[], fd.guesserId, presentIds);
  const elig = nextG ? joEligible(fd.guesserOrder||[], nextG, presentIds) : [];
  if(over || !nextG || elig.length<1) return {phase:"ended", cardsUsed, deckIndex: nextIndex};
  return {
    phase:"clue", round:(fd.round||0)+1, deckIndex: nextIndex, cardsUsed, guesserId: nextG, clueEligible: elig,
    hints:{}, validHints:[], removedIds:[], joGuess:null, joVerdict:null, joOverridden:false
  };
}
// 看門狗 / 手動安全閥共用的判斷（純函式）。
//   clue 階段：猜詞者離開/離線 → 換猜詞者（這張牌當跳過）；在線的提示者都送出了 → 結算進猜測。
//   guess 階段：猜詞者離開/離線 → 換猜詞者（這張牌當跳過）。
function joPlan(fd, players, now, selfId){
  if(!fd || (fd.phase!=="clue" && fd.phase!=="guess")) return null;
  const on = new Set(onlineIdsOf(players, now, selfId));
  const g = fd.guesserId;
  if(g && !on.has(g)) return {kind:"replace"};   // 不在名單裡的人 onlineIdsOf 也不會包含
  if(fd.phase==="clue"){
    const elig = (fd.clueEligible||[]).filter(id=>on.has(id));
    if(elig.every(id=> (fd.hints||{})[id]!=null)) return {kind:"resolve"};
  }
  return null;
}
// 評語：13 張為基準，7 張的局依比例換算。
function joRating(score, total){
  let s = Math.round((score||0)/total*13);
  if(score<total && s>=13) s = 12;
  if(s>=13) return "完美！";
  if(s===12) return "太神啦";
  if(s===11) return "太強了";
  if(s>=9) return "很優秀";
  if(s>=7) return "不錯喔";
  if(s>=5) return "普通";
  return "再接再厲";
}
const JO_VERDICT_LABEL = {correct:"✅ 猜中", wrong:"❌ 猜錯", skip:"⏭️ 跳過"};
let joHintDraft = "";      // 提示者輸入中的提示（背景重畫不能洗掉）
let joHintError = "";
let joGuessDraft = "";     // 猜詞者輸入中的答案
let joGuessError = "";
let joDraftKey = "";       // 換輪/換猜詞者時自動清掉草稿
let joRenderedKey = "";    // 目前畫面對應的階段+輪次，用來判斷輸入中可不可以略過重畫

//#@ view
// ---------- 只有一個：畫面 ----------
function joName(id){
  const p = playersData.find(pp=>pp.id===id);
  return p ? `${avatarOf(p)} ${esc(p.name)}` : "🙂 （已離開）";
}

function renderJoHelpModal(){
  return `
    <div class="modalbackdrop" id="helpBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>❓ 玩法說明</h2>
          <button class="modalclose" id="helpClose">✕</button>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--safe);">目標</div>
          <p class="helper" style="text-align:left; margin:0;">3～8 人全員合作！每一輪輪流指定一位「猜詞者」，他看不到神祕詞；其他人各寫一個提示，幫他猜中。一局共有 7 或 13 張牌（房主設定），猜中越多越好。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--accent);">一輪流程</div>
          <p class="helper" style="text-align:left; margin:0;">① 其他人看到神祕詞，各自秘密寫下 1 個提示（最多 8 字，不能有空白，不能和神祕詞相同或互相包含）。② 全部送出後，寫出一樣提示的人通通作廢（包含寫的人都算，整體以去掉空白、標點、大小寫、全半形後比對）。③ 猜詞者只看得到沒被作廢的提示，輸入答案，或選擇跳過。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--warn);">計分</div>
          <p class="helper" style="text-align:left; margin:0;">猜中：+1 分，用掉 1 張牌。跳過：不得分，用掉 1 張牌。猜錯：不得分，這張和下一張牌都作廢（用掉 2 張牌）。如果猜的是同義詞，房主可以按「改判為正確」（每輪限一次）。</p>
        </div>
        <div class="card" style="margin-bottom:0;">
          <div class="helptitle">注意</div>
          <p class="helper" style="text-align:left; margin:0;">牌用完遊戲結束，依得分給評語。猜詞者請不要偷看別人的手機；這款遊戲沒有真正的登入驗證，「隱藏資訊」只是畫面上不顯示，請大家憑默契。遊戲開始後才加入的人會變成旁觀者；有人離開卡住時，房主可以按「強制進入猜測」或「換一位猜詞者」。</p>
        </div>
      </div>
    </div>
  `;
}
function wireJoHelpModal(){
  const helpClose = document.getElementById("helpClose");
  if(helpClose) helpClose.onclick = ()=>{ helpModalOpen = false; render(); };
  const helpBackdrop = document.getElementById("helpBackdrop");
  if(helpBackdrop) helpBackdrop.onclick = (e)=>{ if(e.target.id==="helpBackdrop"){ helpModalOpen = false; render(); } };
}

function renderJoSettingsModal(isHost, settings){
  const total = joTotal(settings);
  return `
    <div class="modalbackdrop" id="settingsBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>⚙️ 遊戲設定</h2>
          <button class="modalclose" id="settingsClose">✕</button>
        </div>
        <div style="padding-top:4px;">
          <span style="font-size:14px; font-weight:700; display:block; margin-bottom:10px;">牌數（一局要玩幾張牌）</span>
          <div class="catchips">
            ${[7,13].map(n=>`<button class="catchip ${total===n?'on':''}" data-jorounds="${n}" ${isHost?'':'disabled'}>${n} 張</button>`).join("")}
          </div>
          ${!isHost ? `<p class="helper" style="margin:16px 0 0;">只有房主可以調整這些設定。</p>` : ``}
        </div>
      </div>
    </div>
  `;
}
function wireJoSettingsModal(isHost, settings){
  document.getElementById("settingsClose").onclick = ()=>{ settingsModalOpen = false; render(); };
  document.getElementById("settingsBackdrop").onclick = (e)=>{ if(e.target.id==="settingsBackdrop"){ settingsModalOpen = false; render(); } };
  if(!isHost) return;
  document.querySelectorAll("[data-jorounds]").forEach(b=>{
    b.onclick = ()=> updateSettings({totalRounds: parseInt(b.dataset.jorounds, 10)===7 ? 7 : 13});
  });
}

function joLogHtml(log){
  return `<ul class="playerlist">${(log||[]).map((l,i)=>`<li><span class="pname">#${i+1} ${esc(l.word)}</span><span class="cattag" style="margin-top:0;">${esc(JO_VERDICT_LABEL[l.verdict]||'')}${l.overridden?'（改判）':''} · ${joName(l.guesser)}</span></li>`).join("")}</ul>`;
}

function renderJoGame(me, isHost){
  const rd = roomData;
  const phase = rd.phase;
  const myId = identity.playerId;
  const total = joTotal(rd.settings);
  const word = (rd.deck||[])[rd.deckIndex||0] || "";
  const guesserId = rd.guesserId;
  const eligible = rd.clueEligible || [];
  const hints = rd.hints || {};
  const removed = rd.removedIds || [];
  const validHints = rd.validHints || [];
  const role = myId===guesserId ? "guesser" : (eligible.includes(myId) ? "hinter" : "spectator");
  const ended = phase==="ended";
  const key = joKeyOf(rd);
  if(joDraftKey!==key){ joDraftKey = key; joHintDraft = ""; joHintError = ""; joGuessDraft = ""; joGuessError = ""; }
  joRenderedKey = phase + "|" + key;
  const nowMs = Date.now();
  const isPresent = id=> playersData.some(p=>p.id===id && (p.id===myId || isOnline(p, nowMs)));
  const guesserGone = !!guesserId && !isPresent(guesserId);
  const presentEl = eligible.filter(isPresent);
  const submitted = presentEl.filter(id=> hints[id]!=null);
  const score = rd.score || 0;
  const used = Math.min(rd.cardsUsed || 0, total);
  const verdict = rd.joVerdict;

  const roleHtml = role==="guesser"
    ? `<div class="cnrole">🤔 你是猜詞者</div>`
    : role==="hinter"
    ? `<div class="cnrole">💡 你是提示者</div>`
    : `<div class="cnrole">👀 旁觀者</div><p class="helper" style="margin:6px 0 0; text-align:left;">這局開始時你還沒加入，只能旁觀，沒有操作權限。下一局再一起玩！</p>`;

  const statusHtml = ended ? `` : `
    <div class="jostatus">
      <span class="jopill">🏆 得分 ${score}</span>
      <span class="jopill">🃏 已用 ${used}/${total}</span>
      <span class="jopill">第 ${rd.round||1} 輪</span>
    </div>
    <p class="helper" style="margin:0 0 10px; text-align:left;">猜詞者：${joName(guesserId)}${offBadge(playersData.find(p=>p.id===guesserId))}</p>`;

  const wordHtml = `<div class="jolabel">神祕詞</div><div class="joword">${esc(word)}</div>`;
  const hintChips = (list, cls)=> list.length ? `<div class="jochips">${list.map(t=>`<span class="jochip ${cls||''}">${esc(t)}</span>`).join("")}</div>` : ``;
  const progressHtml = `<p class="helper" style="margin:0; text-align:center;">已送出 ${submitted.length}/${presentEl.length}</p>`;

  let bodyHtml = "";
  if(phase==="clue"){
    if(role==="guesser"){
      bodyHtml = `
        <div class="card" style="text-align:center;">
          <div style="font-size:42px;">🤔</div>
          <p style="font-size:18px; font-weight:800; margin:8px 0;">大家正在想提示…</p>
          ${progressHtml}
          <p class="helper" style="margin:6px 0 0;">你看不到神祕詞，請別偷看別人的手機喔</p>
        </div>`;
    } else if(role==="hinter" && hints[myId]==null){
      bodyHtml = `
        <div class="card">
          ${wordHtml}
          <label>寫一個提示，幫猜詞者猜出來</label>
          <input type="text" id="joHintInput" maxlength="8" placeholder="一個詞（最多 8 字）" autocomplete="off" value="${esc(joHintDraft)}">
          <p class="helper" style="margin:-6px 0 10px; text-align:left;">不能有空白，也不能和神祕詞相同或互相包含。和別人寫一樣的提示會一起作廢！</p>
          <div class="error">${esc(joHintError)}</div>
          <button class="btn-primary" id="joHintBtn">送出</button>
          <div style="margin-top:10px;">${progressHtml}</div>
        </div>`;
    } else if(role==="hinter"){
      bodyHtml = `
        <div class="card" style="text-align:center;">
          ${wordHtml}
          <p style="font-size:17px; font-weight:800; margin:8px 0;">已送出，等待其他人</p>
          <p class="helper" style="margin:0 0 6px;">你的提示：<b>${esc(hints[myId])}</b></p>
          ${progressHtml}
        </div>`;
    } else {
      bodyHtml = `
        <div class="card" style="text-align:center;">
          ${wordHtml}
          <p style="font-size:16px; font-weight:800; margin:8px 0;">大家正在寫提示…</p>
          ${progressHtml}
        </div>`;
    }
  } else if(phase==="guess"){
    if(role==="guesser"){
      bodyHtml = `
        <div class="card">
          <label style="margin-top:0;">你的提示（${validHints.length}）</label>
          ${validHints.length ? hintChips(validHints.map(h=>h.text)) : `<p class="helper" style="text-align:left;">所有提示都被作廢了…只能憑直覺猜，或選擇跳過。</p>`}
          <label>你的答案</label>
          <input type="text" id="joGuessInput" maxlength="20" placeholder="輸入你猜的詞" autocomplete="off" value="${esc(joGuessDraft)}">
          <div class="error">${esc(joGuessError)}</div>
          <button class="btn-primary" id="joGuessBtn">猜！</button>
          <button class="btn-secondary" id="joSkipBtn" style="margin-top:10px;">跳過</button>
        </div>`;
    } else {
      const removedTexts = removed.map(pid=>hints[pid]).filter(t=>t!=null);
      bodyHtml = `
        <div class="card">
          ${wordHtml}
          <label>提示</label>
          ${validHints.length ? hintChips(validHints.map(h=>h.text)) : ``}
          ${removedTexts.length ? hintChips(removedTexts, "off") : ``}
          ${(!validHints.length && !removedTexts.length) ? `<p class="helper" style="text-align:left;">沒有任何提示</p>` : ``}
          <p style="text-align:center; font-weight:800; margin:10px 0 0;">${joName(guesserId)} 正在猜…</p>
        </div>`;
    }
  } else if(phase==="result"){
    const bannerCls = verdict==="correct" ? "winbanner" : "losebanner";
    const bannerTitle = verdict==="correct" ? "🎉 猜中了！" : (verdict==="skip" ? "⏭️ 跳過" : "😵 猜錯了");
    const bannerSub = verdict==="correct"
      ? (rd.joOverridden ? "房主改判為正確，+1 分" : "+1 分，用掉 1 張牌")
      : (verdict==="skip" ? "不得分，用掉 1 張牌" : "不得分，這張和下一張牌都作廢（用掉 2 張牌）");
    const rows = eligible.map(pid=>{
      const raw = hints[pid];
      const isRemoved = removed.includes(pid);
      return `<li><span class="pname">${joName(pid)}</span><span class="jotext ${isRemoved?'off':''}">${raw!=null?esc(raw):'（沒給提示）'}${isRemoved?' <span class="cattag" style="margin-top:0;">重複作廢</span>':''}</span></li>`;
    }).join("");
    const after = joAfterRound({cardsUsed: rd.cardsUsed||0, total, deckIndex: rd.deckIndex||0, deckLen: (rd.deck||[]).length, verdict});
    bodyHtml = `
      <div class="${bannerCls}">
        <h2>${bannerTitle}</h2>
        <p>${esc(bannerSub)}</p>
      </div>
      <div class="card">
        ${wordHtml}
        <p class="helper" style="margin:0 0 10px; text-align:center;">${joName(guesserId)} 的答案：<b>${verdict==="skip" ? '（跳過）' : esc(rd.joGuess||'')}</b></p>
        <label>大家的提示</label>
        <ul class="playerlist">${rows || `<li><span class="pname">（沒有提示者）</span></li>`}</ul>
      </div>
      ${isHost ? `
        ${(verdict==="wrong" && !rd.joOverridden) ? `<button class="btn-secondary" id="joOverrideBtn" style="margin-bottom:10px;">改判為正確（同義詞）</button>` : ``}
        <button class="btn-primary" id="joNextBtn">${after.over ? '查看最終成績' : '下一輪'}</button>
      ` : `<p class="helper">等待房主繼續</p>`}`;
  } else if(ended){
    const rating = joRating(score, total);
    const good = Math.round(score/total*13) >= 7;
    bodyHtml = `
      <div class="${good?'winbanner':'losebanner'}">
        <h2>${score} / ${total}　${esc(rating)}</h2>
        <p>全員合作，共猜中 ${score} 張牌</p>
      </div>
      <div class="card">
        <label style="margin-top:0;">每輪紀錄</label>
        ${(rd.joLog||[]).length ? joLogHtml(rd.joLog) : `<p class="helper" style="margin:0;">沒有紀錄</p>`}
      </div>
      ${isHost ? `<button class="btn-primary" id="rematchBtn">再來一局</button>` : `<p class="helper">等待房主開始下一局</p>`}`;
  }

  let hostHtml = "";
  if(isHost && (phase==="clue" || phase==="guess")){
    if(guesserGone) hostHtml += `<button class="btn-secondary" id="joReplaceBtn" style="margin-top:4px;">猜詞者已離開或離線，換一位猜詞者（跳過這張牌）</button>`;
    if(phase==="clue") hostHtml += `<button class="btn-ghost" id="joForceBtn">強制進入猜測</button>`;
  }

  app.innerHTML = `
    <div class="card">
      ${roleHtml}
    </div>
    ${statusHtml}
    ${bodyHtml}
    ${hostHtml}
    <button class="btn-ghost" id="joHelpBtn">❓ 玩法說明</button>
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
    ${helpModalOpen ? renderJoHelpModal() : ``}
  `;

  document.getElementById("leaveBtn").onclick = doLeave;
  document.getElementById("joHelpBtn").onclick = ()=>{ helpModalOpen = true; render(); };
  if(helpModalOpen) wireJoHelpModal();
  const hi = document.getElementById("joHintInput");
  if(hi){
    hi.oninput = e=>{ joHintDraft = e.target.value; };
    hi.onkeydown = e=>{ if(e.key==="Enter"){ e.preventDefault(); hi.blur(); doJoSubmitHint(); } };
    document.getElementById("joHintBtn").onclick = ()=>{ if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); doJoSubmitHint(); };
  }
  const gi = document.getElementById("joGuessInput");
  if(gi){
    gi.oninput = e=>{ joGuessDraft = e.target.value; };
    gi.onkeydown = e=>{ if(e.key==="Enter"){ e.preventDefault(); gi.blur(); doJoGuess(false); } };
    document.getElementById("joGuessBtn").onclick = ()=>{ if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); doJoGuess(false); };
    document.getElementById("joSkipBtn").onclick = ()=>{ if(confirm("確定要跳過這張牌嗎？（不得分，用掉 1 張牌）")) doJoGuess(true); };
  }
  const fb = document.getElementById("joForceBtn");
  if(fb) fb.onclick = ()=>{ if(confirm("要用目前已送出的提示直接進入猜測嗎？沒送出的人就沒有提示了。")) doJoForce(); };
  const rb = document.getElementById("joReplaceBtn");
  if(rb) rb.onclick = ()=>{ if(confirm("要跳過這張牌，換下一位猜詞者嗎？（用掉 1 張牌）")) doJoReplaceGuesser(); };
  const ob = document.getElementById("joOverrideBtn");
  if(ob) ob.onclick = doJoOverride;
  const nb = document.getElementById("joNextBtn");
  if(nb) nb.onclick = doJoContinue;
  if(isHost && ended) document.getElementById("rematchBtn").onclick = doRematchJustone;
}

//#@ actions
// ---------- 只有一個：資料 / 動作 ----------

async function joFreshPlayers(){
  const snap = await playersCol.get().catch(()=>({docs:[]}));
  return snap.docs.map(dd=>({id:dd.id, ...dd.data()})).sort((a,b)=>a.joinedAt-b.joinedAt);
}
function joResetLocal(){ joHintDraft = ""; joHintError = ""; joGuessDraft = ""; joGuessError = ""; joDraftKey = ""; joRenderedKey = ""; }

async function doStartJustone(){
  const players = playersData;
  if(players.length<3){ startError = "至少需要 3 位玩家才能開始只有一個"; render(); return; }
  if(players.length>8){ startError = "只有一個最多 8 位玩家"; render(); return; }
  if(!players.every(p=>p.ready)){ startError = "還有人沒按「我準備好了」，等他們準備好才能開始"; render(); return; }
  const total = joTotal(roomData.settings);
  const deck = joBuildDeck(total);
  const guesserOrder = players.slice().sort((a,b)=>a.joinedAt-b.joinedAt).map(p=>p.id);
  const guesserId = guesserOrder[0];
  startError = "";
  joResetLocal();
  try{
    await roomRef.update({
      phase:"clue", round:1, deck, deckIndex:0, guesserOrder, guesserId, cardsUsed:0, score:0,
      clueEligible: guesserOrder.filter(id=>id!==guesserId), hints:{}, validHints:[], removedIds:[],
      joGuess:null, joVerdict:null, joOverridden:false, joLog:[], lastActivityAt: Date.now()
    });
  }catch(e){}
}

// 在線的、而且有玩家文件的 id（給「下一位猜詞者 / 提示者」用）；沒有任何人在線時退回全部。
function joPresentOnline(players){
  const on = onlineIdsOf(players, Date.now(), identity.playerId);
  return on.length ? on : players.map(p=>p.id);
}

// 每位提示者只寫「自己的」hints.<id>，不需要鎖，同時送出不會互相蓋掉；只有結算會拿短租約鎖（重抓資料、確認階段，冪等）。
async function doJoSubmitHint(){
  if(voteBusy) return;
  const rd0 = roomData;
  if(!rd0 || rd0.phase!=="clue") return;
  const v = joValidateHint(joHintDraft, (rd0.deck||[])[rd0.deckIndex||0] || "");
  if(!v.ok){ joHintError = v.msg; render(); return; }
  voteBusy = true;
  let wrote = false;
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="clue"){ voteBusy=false; return; }
    const fd = fresh.data();
    const me = identity.playerId;
    if(fd.guesserId===me || !(fd.clueEligible||[]).includes(me)){ voteBusy=false; return; }
    if((fd.hints||{})[me]!=null){ voteBusy=false; return; }
    const v2 = joValidateHint(v.text, (fd.deck||[])[fd.deckIndex||0] || "");
    if(!v2.ok){ joHintError = v2.msg; voteBusy=false; render(); return; }
    wrote = await writeOwnField("hints."+me, v2.text, "clue");
    if(wrote){ joHintDraft = ""; joHintError = ""; playVoteSound(); }
    else { joHintError = MSG_RETRY; }   // 草稿還在，再按一次送出就好
  }catch(e){ joHintError = MSG_RETRY; }
  voteBusy = false;
  render();
  if(wrote) await joResolve(false);
}

// 結算提示：鎖 + 重新讀房間、確認還在 clue 階段，再把重複的提示作廢並進入 guess。
// force=true 時不要求每個人都送出（房主強制進入猜測）。
async function joResolveInner(fd, force){
  if(fd.phase!=="clue") return;
  const elig = fd.clueEligible || [];
  const r = joResolveHints(fd.hints || {}, elig, (fd.deck||[])[fd.deckIndex||0] || "");
  await roomRef.update({phase:"guess", validHints: r.validHints, removedIds: r.removedIds, lastActivityAt: Date.now()});
}
async function joResolve(force){
  try{
    await withFreshRoom(async (fd, players)=>{
      if(force){ if(isHostNow(players)) await joResolveInner(fd, true); return; }
      const plan = joPlan(fd, players, Date.now(), identity.playerId);
      if(plan && plan.kind==="resolve") await joResolveInner(fd, false);
    }, {tries:6});
  }catch(e){}
}

async function doJoForce(){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const r = await withFreshRoom(async (fd, players)=>{
      if(!isHostNow(players)) return;
      await joResolveInner(fd, true);
    }, {tries:5});
    if(!r.ok) showToast(MSG_RETRY);
  }catch(e){}
  voteBusy = false;
  render();
}

async function doJoGuess(skip){
  if(voteBusy) return;
  let text = "";
  if(!skip){
    text = String(joGuessDraft||"").trim();
    if(!text){ joGuessError = "請輸入你的答案"; render(); return; }
    if(Array.from(text).length>20){ joGuessError = "答案最多 20 個字"; render(); return; }
  }
  voteBusy = true;
  try{
    const r = await withFreshRoom(async (fd)=>{
      if(fd.phase!=="guess") return;
      if(fd.guesserId!==identity.playerId) return;
      const word = (fd.deck||[])[fd.deckIndex||0] || "";
      const action = skip ? "skip" : (joGuessCorrect(text, word) ? "correct" : "wrong");
      const r = joApplyResult({cardsUsed: fd.cardsUsed||0, score: fd.score||0}, action);
      const joLog = (fd.joLog||[]).concat([{word, verdict: r.verdict, guesser: fd.guesserId, overridden:false}]);
      await roomRef.update({
        phase:"result", joGuess: skip ? null : text, joVerdict: r.verdict, joOverridden:false,
        cardsUsed: r.cardsUsed, score: r.score, joLog, lastActivityAt: Date.now()
      });
      joGuessDraft = ""; joGuessError = "";
      if(r.verdict==="correct") playResultSound(true); else if(r.verdict==="wrong") playResultSound(false);
    });
    if(!r.ok) joGuessError = "目前有人正在操作，請再按一次";   // 答案草稿還在
  }catch(e){ joGuessError = "目前有人正在操作，請再按一次"; }
  voteBusy = false;
  render();
}

// 房主把「猜錯」改判成「猜中」（同義詞）：只能改一次。
async function doJoOverride(){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const r = await withFreshRoom(async (fd, players)=>{
      if(fd.phase!=="result") return;
      if(!isHostNow(players)) return;
      const r = joOverride({cardsUsed: fd.cardsUsed||0, score: fd.score||0, verdict: fd.joVerdict, overridden: !!fd.joOverridden});
      if(!r) return;
      const joLog = (fd.joLog||[]).slice();
      if(joLog.length) joLog[joLog.length-1] = Object.assign({}, joLog[joLog.length-1], {verdict:"correct", overridden:true});
      await roomRef.update({joVerdict:"correct", joOverridden:true, cardsUsed: r.cardsUsed, score: r.score, joLog, lastActivityAt: Date.now()});
      playResultSound(true);
    }, {tries:5});
    if(!r.ok) showToast(MSG_RETRY);
  }catch(e){}
  voteBusy = false;
  render();
}

// 房主按「下一輪」：換下一位（在線的）猜詞者與下一張牌，或牌用完就結束。
async function doJoContinue(){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const r = await withFreshRoom(async (fd, players)=>{
      if(fd.phase!=="result") return;
      if(!isHostNow(players)) return;
      const after = joAfterRound({cardsUsed: fd.cardsUsed||0, total: joTotal(fd.settings), deckIndex: fd.deckIndex||0, deckLen: (fd.deck||[]).length, verdict: fd.joVerdict});
      const patch = joAdvancePatch(fd, fd.cardsUsed||0, after.nextIndex, joPresentOnline(players));
      patch.lastActivityAt = Date.now();
      await roomRef.update(patch);
      joResetLocal();
    }, {tries:5});
    if(!r.ok) showToast(MSG_RETRY);
  }catch(e){}
  voteBusy = false;
  render();
}

// 猜詞者離開/離線後沒人能猜，把這張牌當作跳過、換下一位猜詞者（房主手動按，或看門狗自動做）。
async function joReplaceInner(fd, players){
  const word = (fd.deck||[])[fd.deckIndex||0] || "";
  const r = joApplyResult({cardsUsed: fd.cardsUsed||0, score: fd.score||0}, "skip");
  const joLog = (fd.joLog||[]).concat([{word, verdict:"skip", guesser: fd.guesserId, overridden:false}]);
  const patch = joAdvancePatch(fd, r.cardsUsed, (fd.deckIndex||0)+1, joPresentOnline(players));
  patch.joLog = joLog; patch.score = r.score; patch.lastActivityAt = Date.now();
  await roomRef.update(patch);
  joResetLocal();
}
async function doJoReplaceGuesser(){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const r = await withFreshRoom(async (fd, players)=>{
      if(!isHostNow(players)) return;
      const plan = joPlan(fd, players, Date.now(), identity.playerId);
      if(plan && plan.kind==="replace") await joReplaceInner(fd, players);
    }, {tries:5});
    if(!r.ok) showToast(MSG_RETRY);
  }catch(e){}
  voteBusy = false;
  render();
}

// 房主端看門狗：猜詞者離線 → 跳過這張牌換人；在線的提示者都送出了卻沒人結算 → 補結算。
async function joWatchdog(){
  if(!joPlan(roomData, playersData, Date.now(), identity.playerId)) return;
  await withFreshRoom(async (fd, players)=>{
    const plan = joPlan(fd, players, Date.now(), identity.playerId);
    if(!plan) return;
    if(plan.kind==="replace") await joReplaceInner(fd, players);
    else if(plan.kind==="resolve") await joResolveInner(fd, false);
  }, {tries:4});
}

// 再來一局：回到大廳（保留玩家與設定），大家重新按準備。
async function doRematchJustone(){
  try{
    joResetLocal();
    await Promise.all(playersData.map(p=> playersCol.doc(p.id).update({ready:false})));
    await roomRef.update({
      phase:"lobby", round:0, deck:[], deckIndex:0, guesserOrder:[], guesserId:null, cardsUsed:0, score:0,
      clueEligible:[], hints:{}, validHints:[], removedIds:[], joGuess:null, joVerdict:null, joOverridden:false, joLog:[],
      lastActivityAt: Date.now()
    });
  }catch(e){}
}

