//#@ logic
// ---------- 機密代號：純邏輯 ----------
const CN_TEAM_LABEL = {red:"紅隊", blue:"藍隊"};
const CN_TEAM_EMOJI = {red:"🔴", blue:"🔵"};
function cnOther(t){ return t==="red" ? "blue" : "red"; }
function cnShuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 25 張牌：先手隊 9、另一隊 8、中立 7、刺客 1；字從詞庫不重複抽出。
function cnGenBoard(startTeam, words){
  const pool = cnShuffle(words || CN_WORDS).slice(0,25);
  const other = cnOther(startTeam);
  const colors = [];
  for(let i=0;i<9;i++) colors.push(startTeam);
  for(let i=0;i<8;i++) colors.push(other);
  for(let i=0;i<7;i++) colors.push("neutral");
  colors.push("assassin");
  const shuffled = cnShuffle(colors);
  return pool.map((w,i)=>({word:w, color:shuffled[i], revealed:false}));
}
function cnCountLeft(board){
  let red = 0, blue = 0;
  (board||[]).forEach(c=>{ if(!c.revealed){ if(c.color==="red") red++; else if(c.color==="blue") blue++; } });
  return {red, blue};
}
// 提示規則：去頭尾空白、不能空、不超過 8 字、不能含空白、不能跟盤面上「還沒翻開」的字相同或互相包含。
function cnValidateClue(raw, board){
  const word = String(raw==null?"":raw).trim();
  if(!word) return {ok:false, msg:"請輸入提示詞", word};
  if(/\s/.test(word)) return {ok:false, msg:"提示只能是一個詞，不能有空白", word};
  if(Array.from(word).length>8) return {ok:false, msg:"提示最多 8 個字", word};
  const lw = word.toLowerCase();
  const bad = (board||[]).find(c=>{
    if(c.revealed) return false;
    const bw = String(c.word).toLowerCase();
    return bw===lw || lw.indexOf(bw)>=0 || bw.indexOf(lw)>=0;
  });
  if(bad) return {ok:false, msg:`提示不能和盤面上的「${bad.word}」相同或互相包含`, word};
  return {ok:true, msg:"", word};
}
// 翻一張牌的結果（純函式）。st = {board, turnTeam, guessesLeft}；牌已翻開或不存在回傳 null。
// 自己顏色：繼續（猜測次數用完就換隊）；中立/對方顏色：換隊；刺客：當前隊伍立刻輸；任一隊的牌全翻開，該隊獲勝。
function cnApplyGuess(st, idx){
  const card = st.board[idx];
  if(!card || card.revealed) return null;
  const team = st.turnTeam, other = cnOther(team);
  const board = st.board.map((c,i)=> i===idx ? {word:c.word, color:c.color, revealed:true} : c);
  const left = cnCountLeft(board);
  let phase = "guess", turnTeam = team, guessesLeft = st.guessesLeft, winner = null, winReason = null, outcome;
  const endTurn = ()=>{ phase = "clue"; turnTeam = other; guessesLeft = 0; };
  if(card.color==="assassin"){
    outcome = "assassin"; winner = other; winReason = "assassin"; phase = "ended"; guessesLeft = 0;
  } else {
    outcome = card.color===team ? "own" : (card.color==="neutral" ? "neutral" : "opponent");
    if(left.red===0) winner = "red"; else if(left.blue===0) winner = "blue";
    if(winner){ winReason = "all"; phase = "ended"; guessesLeft = 0; }
    else if(outcome==="own"){ guessesLeft = st.guessesLeft-1; if(guessesLeft<=0) endTurn(); }
    else endTurn();
  }
  return {board, phase, turnTeam, guessesLeft, winner, winReason, outcome, redLeft:left.red, blueLeft:left.blue};
}
// 隨機分隊：洗牌後輪流分給兩隊，人數差最多 1，奇數時哪隊多一人也是隨機。
function cnBalanceTeams(ids){
  const sh = cnShuffle(ids);
  const first = Math.random()<0.5 ? "red" : "blue";
  const res = {};
  sh.forEach((id,i)=>{ res[id] = (i%2===0) ? first : cnOther(first); });
  return res;
}
function cnPickOne(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
// 開始條件檢查：回傳錯誤訊息，空字串代表可以開始。
function cnTeamsError(players){
  if(players.some(p=>p.team!=="red" && p.team!=="blue")) return "還有人沒加入隊伍，請每位玩家選一隊（或由房主按「隨機分隊」）";
  const r = players.filter(p=>p.team==="red").length, b = players.filter(p=>p.team==="blue").length;
  if(r<2 || b<2) return "每一隊至少需要 2 位玩家";
  return "";
}
let cnSel = null;          // 猜測者目前點選、還沒按「確定翻開」的牌
let cnSelKey = "";         // 換回合/換階段時自動清掉選取
let cnClueDraft = "";      // 指揮官輸入中的提示詞（背景重畫不能洗掉）
let cnNumDraft = 1;
let cnClueError = "";
let cnLogOpen = false;

const JO_WORDS = [
  "蘋果","香蕉","西瓜","草莓","葡萄","芒果","鳳梨","檸檬","木瓜","櫻桃","米飯","麵條",
  "餃子","包子","麵包","蛋糕","餅乾","冰淇淋","巧克力","披薩","漢堡","薯條","火鍋","壽司",
  "牛排","炸雞","便當","豆腐","雞蛋","牛奶","咖啡","奶茶","啤酒","果汁","可樂","開水",
  "蜂蜜","辣椒","大蒜","洋蔥","老虎","獅子","大象","長頸鹿","熊貓","猴子","兔子","老鼠",
  "松鼠","狐狸","企鵝","海豚","鯊魚","烏龜","青蛙","蝴蝶","蜜蜂","螞蟻","蜘蛛","恐龍",
  "貓頭鷹","鸚鵡","孔雀","鴿子","蝙蝠","袋鼠","駱駝","斑馬","鱷魚","章魚","太陽","月亮",
  "星星","彩虹","閃電","颱風","地震","火山","海洋","沙漠","森林","瀑布","島嶼","沙灘",
  "山洞","河流","湖泊","草原","雪人","雲朵","學校","醫院","銀行","郵局","餐廳","超市",
  "圖書館","博物館","動物園","公園","機場","車站","港口","工廠","農場","燈塔","城堡","寺廟",
  "教堂","廣場","桌子","椅子","沙發","冰箱","電視","電腦","手機","相機","耳機","鍵盤",
  "滑鼠","時鐘","鏡子","窗簾","枕頭","棉被","雨傘","眼鏡","手錶","戒指","帽子","鞋子",
  "襪子","外套","裙子","褲子","圍巾","手套","口罩","背包","錢包","鑰匙","剪刀","牙刷",
  "毛巾","肥皂","梳子","筆記本","鉛筆","橡皮擦","汽車","公車","火車","捷運","飛機","輪船",
  "腳踏車","機車","計程車","直升機","火箭","潛水艇","帆船","纜車","救護車","消防車","卡車","摩托車",
  "熱氣球","滑板","醫生","護士","老師","學生","警察","消防員","廚師","農夫","律師","記者",
  "作家","畫家","歌手","演員","司機","店員","國王","公主","騎士","海盜","巫師","小丑",
  "忍者","偵探","天使","惡魔","幽靈","機器人","外星人","超人","足球","籃球","棒球","網球",
  "桌球","羽毛球","游泳","跑步","滑雪","拳擊","釣魚","露營","登山","潛水","衝浪","騎馬",
  "射箭","體操","瑜珈","舉重","鋼琴","吉他","小提琴","笛子","麥克風","喇叭","舞台","電影",
  "魔術","煙火","風箏","氣球","積木","娃娃","拼圖","骰子","撲克牌","象棋","麻將","春天",
  "夏天","秋天","冬天","早晨","夜晚","假期","生日","婚禮","派對","聖誕節","過年","紅包",
  "月餅","粽子","元宵","鞭炮","燈籠","禮物","爸爸","媽媽","哥哥","姐姐","弟弟","妹妹",
  "爺爺","奶奶","朋友","鄰居","老闆","同事","情人","新娘","皇帝","室友","客人","小偷",
  "快樂","悲傷","生氣","害怕","驚喜","無聊","緊張","孤單","幸福","愛情","友情","夢想",
  "回憶","秘密","自由","和平","勇氣","運氣","時間","金錢","頭髮","眼睛","耳朵","鼻子",
  "嘴巴","牙齒","舌頭","手指","心臟","肚子","膝蓋","肩膀","拳頭","指甲","骨頭","皮膚",
  "眉毛","鬍子","鑽石","黃金","珍珠","水晶","玻璃","木頭","石頭","鋼鐵","塑膠","棉花",
  "火焰","冰塊","煙霧","影子","聲音","香水","蠟燭","火柴","電池","燈泡","寶藏","地圖",
  "指南針","望遠鏡","顯微鏡","放大鏡","廚房","臥室","浴室","陽台","屋頂","地下室","樓梯","電梯",
  "走廊","大門","馬桶","浴缸","蓮蓬頭","洗衣機","冷氣","電風扇","微波爐","烤箱","吸塵器","掃把",
  "書本","報紙","雜誌","信封","郵票","鈔票","硬幣","護照","身分證","網路","遊戲","簡訊",
  "照片","影片","音樂","歌曲","笑話","故事","謎語","電話","密碼","網站","訊息","直播",
  "廣告","新聞","天氣","麵粉","砂糖","鹽巴","醬油","胡椒"
];

// 看門狗 / 手動安全閥共用的判斷（純函式）。
//   clue 階段：輪到的隊伍指揮官離線（或不在隊伍裡）→ 換同隊另一位在線的人當指揮官；沒有人可換 → 跳過這隊回合。
//   guess 階段：這隊的猜測者全都離線 → 跳過這隊回合。
function cnPlan(fd, players, now, selfId){
  if(!fd || (fd.phase!=="clue" && fd.phase!=="guess")) return null;
  const team = fd.turnTeam;
  if(team!=="red" && team!=="blue") return null;
  const spyId = (fd.spymasters||{})[team];
  const on = new Set(onlineIdsOf(players, now, selfId));
  const members = joinOrder(players).filter(p=>p.team===team);
  const spyOk = members.some(p=>p.id===spyId) && on.has(spyId);
  if(fd.phase==="clue"){
    if(spyOk) return null;
    const cand = members.find(p=> p.id!==spyId && on.has(p.id));
    return cand ? {kind:"swap", team, spy: cand.id} : {kind:"skip"};
  }
  const guessers = members.filter(p=> p.id!==spyId && on.has(p.id));
  return guessers.length ? null : {kind:"skip"};
}

//#@ view
// ---------- 機密代號：畫面 ----------

function cnTeamTag(team){
  return (team==="red"||team==="blue")
    ? `<span class="cattag cn-${team}">${CN_TEAM_EMOJI[team]} ${CN_TEAM_LABEL[team]}</span>`
    : `<span class="cattag">未分隊</span>`;
}
function cnName(id){
  const p = playersData.find(pp=>pp.id===id);
  return p ? `${avatarOf(p)} ${esc(p.name)}${offBadge(p)}` : "🙂 ?";
}

function renderCnHelpModal(){
  return `
    <div class="modalbackdrop" id="helpBackdrop">
      <div class="modalsheet">
        <div class="modalhead">
          <h2>❓ 玩法說明</h2>
          <button class="modalclose" id="helpClose">✕</button>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--safe);">目標</div>
          <p class="helper" style="text-align:left; margin:0;">4～10 人分成紅隊與藍隊（每隊至少 2 人）。盤面有 25 個詞，每隊各有一位「指揮官」知道哪些詞屬於自己的特工。哪一隊先找出所有己方特工，哪一隊就獲勝。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--accent);">一個回合</div>
          <p class="helper" style="text-align:left; margin:0;">① 輪到的隊伍，指揮官用「一個詞 + 一個數字」暗示隊友（例如「水果 2」），詞不能是盤面上還沒翻開的字，也不能和它們互相包含。② 隊友（猜測者）點一張牌，再按「確定翻開」。最多可以猜 數字＋1 次；數字 0 代表不限次數。③ 翻到自己隊的顏色可以繼續猜；翻到中立或對方的顏色，回合立刻結束；也可以隨時按「結束猜測」。</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div class="helptitle" style="color:var(--warn);">刺客</div>
          <p class="helper" style="text-align:left; margin:0;">盤面有 1 張黑色刺客牌，誰翻到，那一隊立刻輸掉。</p>
        </div>
        <div class="card" style="margin-bottom:0;">
          <div class="helptitle">注意</div>
          <p class="helper" style="text-align:left; margin:0;">指揮官的畫面會顯示所有牌的顏色，請不要讓隊友偷看你的手機。這款遊戲沒有真正的登入驗證，「隱藏資訊」單純是畫面上不顯示給別人看，請大家憑默契。遊戲開始後才加入的人會變成旁觀者。若有人離開卡住回合，房主可以按「強制換隊」。</p>
        </div>
      </div>
    </div>
  `;
}
function wireCnHelpModal(){
  const helpClose = document.getElementById("helpClose");
  if(helpClose) helpClose.onclick = ()=>{ helpModalOpen = false; render(); };
  const helpBackdrop = document.getElementById("helpBackdrop");
  if(helpBackdrop) helpBackdrop.onclick = (e)=>{ if(e.target.id==="helpBackdrop"){ helpModalOpen = false; render(); } };
}

// 大廳：兩個隊伍欄位 + 加入/換隊按鈕 + 房主的隨機分隊。
function renderCnLobbyTeams(isHost){
  const me = playersData.find(p=>p.id===identity.playerId);
  const myTeam = me && me.team;
  const members = t => playersData.filter(p=>p.team===t);
  const col = t => `
    <div class="cnteamcol ${t}">
      <div class="cnteamhead">${CN_TEAM_EMOJI[t]} ${CN_TEAM_LABEL[t]}（${members(t).length}）</div>
      <div class="cnteammembers">
        ${members(t).map(p=>`<div class="cnmember">${avatarOf(p)} ${esc(p.name)}${p.id===identity.playerId?' <span class="you">YOU</span>':''}</div>`).join("") || `<div class="cnmember empty">還沒有人</div>`}
      </div>
      <button class="btn-secondary cnjoinbtn" data-cnteam="${t}" ${myTeam===t?'disabled':''}>${myTeam===t?'你在這隊':(myTeam?'換到這隊':'加入這隊')}</button>
    </div>`;
  const unassigned = playersData.filter(p=>p.team!=="red" && p.team!=="blue");
  return `
    <label style="margin-top:14px;">分隊（每隊至少 2 人）</label>
    <div class="cnteams">${col("red")}${col("blue")}</div>
    ${unassigned.length ? `<p class="helper" style="text-align:left; margin:8px 0 0;">還沒選隊：${unassigned.map(p=>`${avatarOf(p)} ${esc(p.name)}`).join("、")}</p>` : ``}
    ${isHost ? `<button class="btn-secondary" id="cnRandomBtn" style="margin-top:10px;">🎲 隨機分隊</button>` : ``}
  `;
}
function wireCnLobby(isHost){
  document.querySelectorAll("[data-cnteam]").forEach(b=> b.onclick = ()=> doCnJoinTeam(b.dataset.cnteam));
  const rb = document.getElementById("cnRandomBtn");
  if(rb) rb.onclick = doCnRandomTeams;
}

const CN_WIN_REASON = {
  all: "找出了所有己方特工",
  assassin: "對方翻到了刺客"
};
function cnClueLogHtml(){
  const log = roomData.clueLog || [];
  return `
    <div class="card" style="margin-top:12px;">
      <button class="btn-ghost cnlogtoggle" id="cnLogBtn">${cnLogOpen?'▾':'▸'} 提示紀錄（${log.length}）</button>
      ${cnLogOpen ? (log.length ? `<ul class="playerlist" style="margin-top:8px;">${log.slice().reverse().map(l=>`<li><span class="pname">${CN_TEAM_EMOJI[l.team]||''} ${esc(CN_TEAM_LABEL[l.team]||'')}：${esc(l.word)}</span><span class="cattag">${l.num===0?'無限':l.num}</span></li>`).join("")}</ul>` : `<p class="helper" style="margin:8px 0 0;">還沒有提示</p>`) : ``}
    </div>`;
}

function renderCnGame(me, isHost){
  const rd = roomData;
  const phase = rd.phase;
  const board = rd.board || [];
  const myTeam = (me.team==="red" || me.team==="blue") ? me.team : null;
  const sm = rd.spymasters || {};
  const isSpy = !!myTeam && sm[myTeam]===me.id;
  const ended = phase==="ended";
  const turn = rd.turnTeam;
  const canGuess = phase==="guess" && myTeam===turn && !isSpy;
  const canClue = phase==="clue" && myTeam===turn && isSpy;
  const showAll = isSpy || ended;
  const key = `${(rd.clueLog||[]).length}|${turn}|${phase}`;
  if(cnSelKey!==key){ cnSelKey = key; cnSel = null; if(phase==="clue"){ cnClueDraft = ""; cnClueError = ""; } }
  if(cnSel!=null && (!board[cnSel] || board[cnSel].revealed)) cnSel = null;
  const left = cnCountLeft(board);
  const redLeft = (typeof rd.redLeft==="number") ? rd.redLeft : left.red;
  const blueLeft = (typeof rd.blueLeft==="number") ? rd.blueLeft : left.blue;
  const clue = rd.clue;
  const spyGone = !!turn && !!sm[turn] && !playersData.some(p=>p.id===sm[turn] && (p.id===identity.playerId || isOnline(p, Date.now())));

  const roleHtml = myTeam
    ? `<div class="cnrole ${myTeam}">${CN_TEAM_EMOJI[myTeam]} 你是${CN_TEAM_LABEL[myTeam]} · ${isSpy?'指揮官':'猜測者'}</div>${isSpy && !ended ? `<p class="helper" style="margin:6px 0 0; text-align:left;">你看得到所有牌的顏色，別讓隊友偷看你的手機。</p>` : ``}`
    : `<div class="cnrole">👀 旁觀者</div><p class="helper" style="margin:6px 0 0; text-align:left;">這局開始時你還沒加入隊伍，只能看盤面，沒有操作權限。下一局再一起玩！</p>`;

  const statusHtml = ended ? `` : `
    <div class="cnstatus">
      <div class="cnscores"><span class="cnpill red">🔴 剩 ${redLeft}</span><span class="cnpill blue">🔵 剩 ${blueLeft}</span></div>
      <div class="cnturn">輪到 <b class="cn-${turn}">${CN_TEAM_EMOJI[turn]||''} ${esc(CN_TEAM_LABEL[turn]||'')}</b> ${phase==="clue"?'給提示':'猜測'}</div>
      ${clue && phase==="guess" ? `<div class="cnclue">提示：<b>${esc(clue.word)}</b> · ${clue.num===0?'無限':clue.num}<span class="cnleft">剩 ${(rd.guessesLeft||0)>=99?'無限':(rd.guessesLeft||0)} 次猜測</span></div>` : ``}
      <div class="helper" style="margin:6px 0 0; text-align:left;">指揮官：${sm.red?`🔴 ${cnName(sm.red)}`:''}　${sm.blue?`🔵 ${cnName(sm.blue)}`:''}</div>
    </div>`;

  let bannerHtml = "";
  if(ended){
    const w = rd.winner;
    const lost = myTeam && myTeam!==w;
    bannerHtml = `
      <div class="${lost?'losebanner':'winbanner'}">
        <h2>${CN_TEAM_EMOJI[w]||''} ${esc(CN_TEAM_LABEL[w]||'')}勝利！</h2>
        <p>${esc(CN_TEAM_LABEL[w]||'')}${esc(CN_WIN_REASON[rd.winReason]||'贏得了比賽')}</p>
      </div>`;
  }

  const cardsHtml = board.map((c,i)=>{
    const cls = ["cncard"];
    if(c.revealed) cls.push("rev", c.color);
    else if(showAll) cls.push("hint", c.color);
    const tappable = canGuess && !c.revealed;
    if(tappable) cls.push("tap");
    if(cnSel===i) cls.push("sel");
    const mark = (!c.revealed && showAll && c.color==="assassin") ? `<span class="cnmark">☠</span>` : ``;
    return `<div class="${cls.join(" ")}" data-cn="${i}">${esc(c.word)}${mark}</div>`;
  }).join("");

  let actionHtml = "";
  if(!ended){
    if(phase==="clue"){
      if(canClue){
        actionHtml = `
          <div class="card" style="margin-top:12px;">
            <label style="margin-top:0;">給你的隊友一個提示詞</label>
            <input type="text" id="cnClueInput" maxlength="8" placeholder="一個詞（最多 8 字）" autocomplete="off" value="${esc(cnClueDraft)}">
            <label>數字（0 = 不限次數）</label>
            <div class="catchips" id="cnNums">
              ${[0,1,2,3,4,5,6,7,8,9].map(n=>`<button class="catchip ${cnNumDraft===n?'on':''}" data-cnnum="${n}">${n}</button>`).join("")}
            </div>
            <div class="error">${esc(cnClueError)}</div>
            <button class="btn-primary" id="cnClueBtn">送出提示</button>
          </div>`;
      } else if(myTeam===turn && myTeam){
        actionHtml = `<div class="card" style="margin-top:12px; text-align:center;"><p style="margin:0;">等待你們的指揮官給提示…</p></div>`;
      } else {
        actionHtml = `<div class="card" style="margin-top:12px; text-align:center;"><p style="margin:0;">等待 ${esc(CN_TEAM_LABEL[turn]||'')}指揮官給提示…</p></div>`;
      }
    } else if(phase==="guess"){
      if(canGuess){
        const sel = cnSel!=null ? board[cnSel] : null;
        actionHtml = `
          <div class="card" style="margin-top:12px;">
            <p class="helper" style="margin:0 0 10px; text-align:left;">${sel?`已選「<b>${esc(sel.word)}</b>」，確定要翻開嗎？`:'點一張牌選取，再按「確定翻開」。'}</p>
            <button class="btn-primary" id="cnConfirmBtn" ${sel?'':'disabled'}>確定翻開</button>
            <button class="btn-secondary" id="cnEndBtn" style="margin-top:10px;">結束猜測</button>
          </div>`;
      } else if(isSpy && myTeam===turn){
        actionHtml = `<div class="card" style="margin-top:12px; text-align:center;"><p style="margin:0;">隊友猜測中，你只能安靜等待…</p></div>`;
      } else {
        actionHtml = `<div class="card" style="margin-top:12px; text-align:center;"><p style="margin:0;">${esc(CN_TEAM_LABEL[turn]||'')}猜測中…</p></div>`;
      }
    }
    if(isHost){
      actionHtml += `<button class="btn-ghost" id="cnForceBtn">${spyGone?'指揮官已離開或離線，換一位指揮官':'強制換隊（跳過目前回合）'}</button>`;
    }
  }

  const endedExtra = ended ? `
    ${isHost ? `<button class="btn-primary" id="rematchBtn" style="margin-top:12px;">再來一局</button>` : `<p class="helper">等待房主開始下一局</p>`}` : ``;

  app.innerHTML = `
    <div class="card">
      ${roleHtml}
    </div>
    ${bannerHtml}
    ${statusHtml}
    <div class="cngrid">${cardsHtml}</div>
    ${actionHtml}
    ${cnClueLogHtml()}
    ${endedExtra}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
    ${helpModalOpen ? renderCnHelpModal() : ``}
  `;

  document.getElementById("leaveBtn").onclick = doLeave;
  if(helpModalOpen) wireCnHelpModal();
  const logBtn = document.getElementById("cnLogBtn");
  if(logBtn) logBtn.onclick = ()=>{ cnLogOpen = !cnLogOpen; render(); };
  if(canGuess){
    document.querySelectorAll(".cncard.tap").forEach(el=> el.onclick = ()=>{
      const i = parseInt(el.dataset.cn, 10);
      cnSel = (cnSel===i) ? null : i;
      render();
    });
    const cb = document.getElementById("cnConfirmBtn");
    if(cb) cb.onclick = doCnGuess;
    document.getElementById("cnEndBtn").onclick = doCnEndGuess;
  }
  if(canClue){
    const input = document.getElementById("cnClueInput");
    input.oninput = e=>{ cnClueDraft = e.target.value; };
    input.onkeydown = e=>{ if(e.key==="Enter"){ e.preventDefault(); input.blur(); doCnSubmitClue(); } };
    document.querySelectorAll("[data-cnnum]").forEach(b=> b.onclick = ()=>{
      cnNumDraft = parseInt(b.dataset.cnnum, 10);
      document.querySelectorAll("[data-cnnum]").forEach(x=> x.classList.toggle("on", x===b));
    });
    document.getElementById("cnClueBtn").onclick = ()=>{ if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); doCnSubmitClue(); };
  }
  const fb = document.getElementById("cnForceBtn");
  if(fb) fb.onclick = ()=>{ if(confirm(spyGone?'要幫這隊換一位指揮官嗎？':'要跳過這一隊目前的回合嗎？')) doCnForceSkip(); };
  if(isHost && ended) document.getElementById("rematchBtn").onclick = doRematchCodenames;
}

//#@ actions
// ---------- 機密代號：資料 / 動作 ----------

// 這個模式的臨界區間（翻牌改 board、換回合）全部走 withFreshRoom：短租約鎖 + 重新抓資料 + 做完立刻釋放。
// 搶不到鎖會自動退避重試；真的失敗才回傳 false，由呼叫端顯示「請再按一次」。
async function cnLocked(fn){
  const r = await withFreshRoom(fn);
  return r.ok;
}
async function cnFreshPlayers(){
  const snap = await playersCol.get().catch(()=>({docs:[]}));
  return snap.docs.map(dd=>({id:dd.id, ...dd.data()})).sort((a,b)=>a.joinedAt-b.joinedAt);
}
function cnResetLocal(){ cnSel = null; cnSelKey = ""; cnClueDraft = ""; cnClueError = ""; cnNumDraft = 1; }

async function doCnJoinTeam(team){
  if(team!=="red" && team!=="blue") return;
  try{
    if(!roomData || roomData.phase!=="lobby") return;
    await playersCol.doc(identity.playerId).update({team});
  }catch(e){}
}

async function doCnRandomTeams(){
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="lobby") return;
    const players = await cnFreshPlayers();
    const assign = cnBalanceTeams(players.map(p=>p.id));
    await Promise.all(players.map(p=> playersCol.doc(p.id).update({team: assign[p.id]})));
  }catch(e){}
}

function cnNewGameFields(startTeam, spymasters){
  const board = cnGenBoard(startTeam);
  const left = cnCountLeft(board);
  return {
    phase:"clue", round:1, board, spymasters, startTeam, turnTeam:startTeam,
    clue:null, guessesLeft:0, clueLog:[], redLeft:left.red, blueLeft:left.blue,
    winner:null, winReason:null, lastActivityAt: Date.now()
  };
}

async function doStartCodenames(){
  const players = playersData;
  if(players.length<4){ startError = "至少需要 4 位玩家才能開始機密代號"; render(); return; }
  if(players.length>10){ startError = "機密代號最多 10 位玩家"; render(); return; }
  if(!players.every(p=>p.ready)){ startError = "還有人沒按「我準備好了」，等他們準備好才能開始"; render(); return; }
  const err = cnTeamsError(players);
  if(err){ startError = err; render(); return; }
  const spymasters = {
    red: cnPickOne(players.filter(p=>p.team==="red")).id,
    blue: cnPickOne(players.filter(p=>p.team==="blue")).id
  };
  const startTeam = Math.random()<0.5 ? "red" : "blue";
  startError = "";
  cnResetLocal();
  try{
    await roomRef.update(cnNewGameFields(startTeam, spymasters));
  }catch(e){}
}

async function doCnSubmitClue(){
  if(voteBusy) return;
  const v = cnValidateClue(cnClueDraft, (roomData && roomData.board) || []);
  if(!v.ok){ cnClueError = v.msg; render(); return; }
  voteBusy = true;
  const num = Math.max(0, Math.min(9, cnNumDraft|0));
  try{
    const ok = await cnLocked(async (fd)=>{
      if(fd.phase!=="clue") return;
      const team = fd.turnTeam;
      if(!fd.spymasters || fd.spymasters[team]!==identity.playerId) return;
      const v2 = cnValidateClue(v.word, fd.board||[]);
      if(!v2.ok){ cnClueError = v2.msg; return; }
      const log = (fd.clueLog||[]).concat([{team, word:v2.word, num}]);
      await roomRef.update({
        phase:"guess", clue:{word:v2.word, num}, guessesLeft: num===0 ? 99 : num+1,
        clueLog: log, lastActivityAt: Date.now()
      });
      cnClueDraft = ""; cnClueError = "";
      beep(520,70,"sine"); vibrate(15);
    });
    if(!ok) cnClueError = "目前有人正在操作，請再按一次";
  }catch(e){ cnClueError = "目前有人正在操作，請再按一次"; }
  voteBusy = false;
  render();
}

async function doCnGuess(){
  if(voteBusy) return;
  const idx = cnSel;
  if(idx==null) return;
  voteBusy = true;
  try{
    const ok = await cnLocked(async (fd, players)=>{
      if(fd.phase!=="guess") return;
      const meDoc = players.find(p=>p.id===identity.playerId);
      const sm = fd.spymasters || {};
      if(!meDoc || meDoc.team!==fd.turnTeam || sm[fd.turnTeam]===identity.playerId) return;
      const res = cnApplyGuess({board: fd.board||[], turnTeam: fd.turnTeam, guessesLeft: fd.guessesLeft||0}, idx);
      if(!res){ cnSel = null; return; }
      await roomRef.update({
        board: res.board, phase: res.phase, turnTeam: res.turnTeam, guessesLeft: res.guessesLeft,
        clue: res.phase==="guess" ? (fd.clue||null) : null,
        redLeft: res.redLeft, blueLeft: res.blueLeft,
        winner: res.winner, winReason: res.winReason, lastActivityAt: Date.now()
      });
      cnSel = null;
      if(res.outcome==="own"){ beep(660,90,"sine"); vibrate(20); } else { beep(180,220,"sawtooth"); vibrate([40,40,40]); }
    });
    if(!ok) showToast(MSG_RETRY);   // 選取的牌保留著，按「確定翻開」再試一次就好
  }catch(e){ showToast(MSG_RETRY); }
  voteBusy = false;
  render();
}

async function doCnEndGuess(){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const ok = await cnLocked(async (fd, players)=>{
      if(fd.phase!=="guess") return;
      const meDoc = players.find(p=>p.id===identity.playerId);
      const sm = fd.spymasters || {};
      if(!meDoc || meDoc.team!==fd.turnTeam || sm[fd.turnTeam]===identity.playerId) return;
      await roomRef.update({phase:"clue", turnTeam: cnOther(fd.turnTeam), clue:null, guessesLeft:0, lastActivityAt: Date.now()});
      cnSel = null;
    });
    if(!ok) showToast(MSG_RETRY);
  }catch(e){ showToast(MSG_RETRY); }
  voteBusy = false;
  render();
}

async function cnApplyPlan(plan, fd){
  if(plan.kind==="swap"){
    const sm = Object.assign({}, fd.spymasters||{});
    sm[plan.team] = plan.spy;
    await roomRef.update({spymasters: sm, lastActivityAt: Date.now()});
  } else {
    await roomRef.update({phase:"clue", turnTeam: cnOther(fd.turnTeam), clue:null, guessesLeft:0, lastActivityAt: Date.now()});
  }
}

// 房主端看門狗：指揮官離線就自動換人、整隊猜測者都離線就跳過回合。
async function cnWatchdog(){
  if(!cnPlan(roomData, playersData, Date.now(), identity.playerId)) return;
  await withFreshRoom(async (fd, players)=>{
    const plan = cnPlan(fd, players, Date.now(), identity.playerId);
    if(plan) await cnApplyPlan(plan, fd);
  }, {tries:4});
}

// 房主的安全閥（手動按鈕）：指揮官離開/離線了就換同隊另一位當指揮官；否則直接跳過這隊目前的回合。
async function doCnForceSkip(){
  try{
    const r = await withFreshRoom(async (fd, players)=>{
      if(fd.phase!=="clue" && fd.phase!=="guess") return;
      const plan = cnPlan(fd, players, Date.now(), identity.playerId);
      if(plan && plan.kind==="swap" && fd.phase==="clue") await cnApplyPlan(plan, fd);
      else await cnApplyPlan({kind:"skip"}, fd);
    }, {tries:5});
    if(!r.ok) showToast(MSG_RETRY);
  }catch(e){}
}

// 再來一局：保留分隊、直接開新盤面；指揮官輪換成同隊下一位；有隊伍不足 2 人就回大廳重新分隊。
async function doRematchCodenames(){
  try{
    cnResetLocal();
    const players = await cnFreshPlayers();
    const fd = (await roomRef.get()).data() || {};
    const teamed = players.filter(p=>p.team==="red" || p.team==="blue");
    const reds = teamed.filter(p=>p.team==="red"), blues = teamed.filter(p=>p.team==="blue");
    if(reds.length<2 || blues.length<2 || teamed.length<4){
      await Promise.all(players.map(p=> playersCol.doc(p.id).update({ready:false})));
      await roomRef.update({
        phase:"lobby", round:0, board:[], spymasters:null, startTeam:null, turnTeam:null, clue:null, guessesLeft:0,
        clueLog:[], redLeft:0, blueLeft:0, winner:null, winReason:null, lastActivityAt: Date.now()
      });
      return;
    }
    const next = (list, cur)=>{ const i = list.findIndex(p=>p.id===cur); return list[(i+1)%list.length].id; };
    const old = fd.spymasters || {};
    const spymasters = {red: next(reds, old.red), blue: next(blues, old.blue)};
    const startTeam = Math.random()<0.5 ? "red" : "blue";
    await roomRef.update(cnNewGameFields(startTeam, spymasters));
  }catch(e){}
}

