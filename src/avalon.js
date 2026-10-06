//#@ logic
// 「阿瓦隆」：人數對應的好壞人數、每輪任務隊伍人數，以及角色分配等純邏輯。
const AVALON_TEAM_SIZES = {
  5:[2,3,2,3,3], 6:[2,3,4,3,4], 7:[2,3,3,4,4], 8:[3,4,4,5,5], 9:[3,4,4,5,5], 10:[3,4,4,5,5]
};
const AVALON_FACTION_COUNTS = {
  5:{good:3, evil:2}, 6:{good:4, evil:2}, 7:{good:4, evil:3}, 8:{good:5, evil:3}, 9:{good:6, evil:3}, 10:{good:6, evil:4}
};
const AVALON_ROLE_LABEL = {
  merlin:"🧙 梅林", percival:"🛡️ 派西維爾", loyal:"⚔️ 忠臣",
  assassin:"🗡️ 刺客", morgana:"🧛 莫甘娜", mordred:"👿 莫德雷德", minion:"😈 爪牙"
};
const AVALON_ROLE_DESC = {
  merlin:"你知道誰是壞人（莫德雷德除外）。任務成功三次後，要小心別被刺客認出來。",
  percival:"你看得到兩個人，其中一個是梅林、另一個可能是莫甘娜，請判斷誰才是真的梅林並保護他。",
  loyal:"你沒有任何情報，靠推理與觀察找出壞人，確保任務成功。",
  assassin:"你是壞人。如果好人完成三次任務，你有最後一次機會刺殺梅林翻盤。",
  morgana:"你是壞人，會被派西維爾誤認為梅林，盡量裝得像梅林。",
  mordred:"你是壞人，而且梅林看不到你，可以放心混進好人當中。",
  minion:"你是壞人，和夥伴一起暗中破壞任務。"
};
function isEvilRole(role){ return role==="assassin" || role==="morgana" || role==="mordred" || role==="minion"; }
function avalonClampN(n){ return Math.max(5, Math.min(10, n|0)); }
function avalonTeamSize(n, missionNo){
  const row = AVALON_TEAM_SIZES[avalonClampN(n)];
  return row[Math.max(0, Math.min(4, (missionNo|0)-1))];
}
// 第 4 輪任務在 7 人以上要 2 張失敗票才算失敗，其餘一律 1 張。
function avalonFailsNeeded(n, missionNo){ return (missionNo===4 && n>=7) ? 2 : 1; }
// 組隊投票：同意票嚴格多於反對票才通過，平票視為否決。
function avalonTally(teamVotes){
  let approve = 0, reject = 0;
  Object.keys(teamVotes||{}).forEach(id=>{
    if(teamVotes[id]==="approve") approve++;
    else if(teamVotes[id]==="reject") reject++;
  });
  return {approve, reject, approved: approve>reject};
}
// 隊長依加入順序輪流；找不到目前隊長（例如他離開了）就回到第一位。
function avalonNextLeader(orderedIds, currentId){
  if(!orderedIds.length) return null;
  const idx = orderedIds.indexOf(currentId);
  return orderedIds[(idx+1) % orderedIds.length];
}
// 隊長輪替但跳過離線的人（從目前隊長的下一位往後找第一位在線者；找不到在線者就維持原本的下一位）。
function avalonNextOnlineLeader(orderedIds, currentId, onlineSet){
  const n = orderedIds.length;
  if(!n) return null;
  const start = orderedIds.indexOf(currentId);
  for(let k=1;k<=n;k++){
    const id = orderedIds[(start+k) % n];
    if(onlineSet.has(id)) return id;
  }
  return avalonNextLeader(orderedIds, currentId);
}
// 這局有角色的玩家（依加入順序）。
function avalonRolled(fd, players){
  const roles = (fd && fd.roles) || {};
  return joinOrder(players).filter(p=>roles[p.id]);
}
// 看門狗 / 結算共用的判斷（純函式）：目前這個房間狀態下「該不該往前推一步」。
//   team：隊長離開或離線 → 換下一位在線隊長；vote：在線的有角色玩家都投了 → 結算；
//   mission：在線的隊員都出牌了（或隊員全離線）→ 結算；assassin：刺客離線 → 當作沒刺中。
function avalonPlan(fd, players, now, selfId){
  if(!fd) return null;
  const rolled = avalonRolled(fd, players);
  const ids = rolled.map(p=>p.id);
  const on = new Set(onlineIdsOf(rolled, now, selfId));
  if(fd.phase==="team"){
    if(!ids.includes(fd.leaderId) || !on.has(fd.leaderId)){
      const nxt = avalonNextOnlineLeader(ids, fd.leaderId, on);
      if(nxt && nxt!==fd.leaderId) return {kind:"leader", leaderId:nxt};
    }
    return null;
  }
  if(fd.phase==="vote"){
    return ids.filter(id=>on.has(id)).every(id=> (fd.teamVotes||{})[id]!=null) ? {kind:"resolveVote"} : null;
  }
  if(fd.phase==="mission"){
    const members = (fd.teamSelection||[]).filter(id=>ids.includes(id));
    return members.filter(id=>on.has(id)).every(id=> (fd.missionVotes||{})[id]!=null) ? {kind:"resolveMission"} : null;
  }
  if(fd.phase==="assassin"){
    const a = ids.find(id=> (fd.roles||{})[id]==="assassin");
    if(!a || !on.has(a)) return {kind:"assassinMiss"};
  }
  return null;
}
// 洗牌後先抽壞人：刺客 → 莫甘娜 → 莫德雷德（依開關、名額還有才給），剩下是爪牙；
// 好人：梅林 → 派西維爾（依開關、名額還有才給），剩下是忠臣。
function assignAvalonRoles(players, rolesSettings){
  const shuffled = players.map(p=>p.id);
  for(let i=shuffled.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const counts = AVALON_FACTION_COUNTS[avalonClampN(players.length)];
  const rs = rolesSettings || {};
  const roles = {};
  const evilIds = shuffled.slice(0, counts.evil);
  const goodIds = shuffled.slice(counts.evil, counts.evil + counts.good);
  const evilRoles = ["assassin"];
  if(rs.morgana) evilRoles.push("morgana");
  if(rs.mordred) evilRoles.push("mordred");
  evilIds.forEach((id,i)=>{ roles[id] = i<evilRoles.length ? evilRoles[i] : "minion"; });
  const goodRoles = ["merlin"];
  if(rs.percival) goodRoles.push("percival");
  goodIds.forEach((id,i)=>{ roles[id] = i<goodRoles.length ? goodRoles[i] : "loyal"; });
  return roles;
}
// 夜晚情報（純前端計算）：壞人互相認識；梅林看得到壞人（莫德雷德除外）；派西維爾看到梅林和莫甘娜但分不出誰是誰；忠臣什麼都看不到。
function avalonNightInfo(roles, myId, orderedIds){
  const my = roles[myId];
  const ids = orderedIds || Object.keys(roles);
  if(isEvilRole(my)) return {kind:"evil", ids: ids.filter(id=> id!==myId && roles[id] && isEvilRole(roles[id]))};
  if(my==="merlin") return {kind:"merlin", ids: ids.filter(id=> roles[id] && isEvilRole(roles[id]) && roles[id]!=="mordred")};
  if(my==="percival") return {kind:"percival", ids: ids.filter(id=> roles[id]==="merlin" || roles[id]==="morgana")};
  return {kind:"none", ids:[]};
}
// 隊長正在挑選中的隊員（本地暫存，送出前不寫進資料庫）；avalonPickKey 用來在換輪/換隊長時自動清空，避免背景更新重畫把選擇洗掉。
let avalonPickDraft = [];
let avalonPickKey = "";
let avalonPeek = false; // 是否展開「我的身分」提示

const CN_WORDS = [
  "蘋果","香蕉","西瓜","葡萄","橘子","檸檬","草莓","鳳梨","芒果","櫻桃","椰子","柚子",
  "蓮霧","木瓜","荔枝","龍眼","柿子","桃子","梨子","番茄","米飯","麵條","饅頭","餃子",
  "包子","麵包","蛋糕","餅乾","糖果","巧克力","牛奶","豆漿","咖啡","果汁","啤酒","茶葉",
  "蜂蜜","奶油","起司","雞蛋","豆腐","青菜","白菜","蘿蔔","洋蔥","大蒜","辣椒","玉米",
  "馬鈴薯","香菇","花生","核桃","紅豆","粽子","湯圓","火鍋","牛排","漢堡","披薩","壽司",
  "老虎","獅子","大象","長頸鹿","熊貓","猴子","兔子","老鼠","松鼠","狐狸","狼","熊",
  "鹿","馬","牛","羊","豬","狗","貓","雞","鴨","鵝","老鷹","麻雀",
  "烏鴉","鴿子","企鵝","貓頭鷹","孔雀","蝙蝠","鯨魚","海豚","鯊魚","章魚","螃蟹","蝦子",
  "烏龜","青蛙","蛇","鱷魚","蝴蝶","蜜蜂","螞蟻","蚊子","蒼蠅","蜘蛛","蜻蜓","蝸牛",
  "毛毛蟲","恐龍","龍","鳳凰","駱駝","袋鼠","河馬","犀牛","斑馬","海豹","水母","海星",
  "太陽","月亮","星星","白雲","彩虹","閃電","雷","雨","雪","風","颱風","地震",
  "火山","海洋","河流","湖泊","瀑布","沙漠","森林","草原","山","島嶼","沙灘","洞穴",
  "橋","道路","隧道","城堡","皇宮","寺廟","教堂","學校","醫院","銀行","郵局","警局",
  "餐廳","商店","市場","超市","圖書館","博物館","動物園","公園","機場","車站","港口","工廠",
  "農場","燈塔","金字塔","長城","鐵塔","廣場","花園","廚房","臥室","浴室","陽台","屋頂",
  "地下室","桌子","椅子","沙發","床","櫃子","書架","鏡子","窗戶","門","樓梯","電梯",
  "地毯","窗簾","枕頭","棉被","時鐘","檯燈","電視","冰箱","洗衣機","冷氣","電風扇","微波爐",
  "電話","手機","電腦","鍵盤","滑鼠","耳機","相機","收音機","電池","插頭","燈泡","蠟燭",
  "火柴","鑰匙","鎖","刀子","叉子","湯匙","筷子","盤子","碗","杯子","茶壺","鍋子",
  "瓶子","籃子","袋子","箱子","盒子","雨傘","帽子","眼鏡","手錶","戒指","項鍊","皮帶",
  "手套","襪子","鞋子","靴子","外套","裙子","褲子","襯衫","領帶","圍巾","口罩","背包",
  "錢包","書包","毛巾","肥皂","牙刷","梳子","剪刀","針","線","紙","筆","鉛筆",
  "橡皮擦","尺","書","報紙","雜誌","地圖","信","郵票","鈔票","硬幣","支票","帳單",
  "卡片","照片","畫","相框","旗子","鼓","吉他","鋼琴","小提琴","喇叭","笛子","麥克風",
  "舞台","電影","戲劇","魔術","馬戲團","煙火","風箏","氣球","積木","娃娃","拼圖","骰子",
  "撲克牌","棋盤","足球","籃球","棒球","網球","桌球","羽毛球","游泳","跑步","滑雪","拳擊",
  "柔道","射箭","釣魚","露營","登山","潛水","衝浪","騎馬","舉重","體操","汽車","公車",
  "火車","捷運","飛機","輪船","腳踏車","機車","卡車","救護車","消防車","計程車","直升機","火箭",
  "潛水艇","太空船","帆船","木筏","馬車","纜車","醫生","護士","老師","學生","警察","消防員",
  "軍人","廚師","農夫","漁夫","律師","法官","記者","作家","畫家","歌手","演員","工程師",
  "司機","店員","國王","皇后","王子","公主","騎士","海盜","巫師","小丑","忍者","偵探",
  "間諜","強盜","天使","惡魔","鬼","幽靈","外星人","機器人","雪人","稻草人","頭","眼睛",
  "耳朵","鼻子","嘴巴","牙齒","舌頭","頭髮","手","腳","心臟","骨頭","血","皮膚",
  "肚子","背","肩膀","膝蓋","指甲","拳頭","翅膀","尾巴","角","爪子","羽毛","鱗片",
  "殼","根","葉子","花","樹","草","竹子","種子","果實","稻米","麥子","荷花",
  "玫瑰","向日葵","仙人掌","蘑菇","金","銀","銅","鐵","鋼","玻璃","石頭","木頭",
  "塑膠","橡膠","棉花","絲綢","皮革","鑽石","珍珠","水晶","黃金","沙子","泥土","冰",
  "火","水","煙","灰","霧","影子","光","聲音","夢","鬼火","時間","春天",
  "夏天","秋天","冬天","早晨","夜晚","假期","生日","婚禮","節日","派對","錢","價格",
  "地址","名字","號碼","密碼","答案","問題","秘密","謎語","故事","歌曲","詩","笑話",
  "遊戲","比賽","冠軍","獎盃","獎牌","勝利","戰爭","和平","軍隊","士兵","大砲","盾牌",
  "劍","弓","槍","炸彈","坦克","戰艦","城牆","陷阱","寶藏","寶箱","皇冠","魔杖",
  "水晶球","燈籠"
];

//#@ view
// ---------- 阿瓦隆：畫面 ----------

// 遊戲開始後才加入（或重新整理進來卻沒被分配角色）的人，看到這個畫面，等這局結束再一起玩下一局。
function renderAvalonNoRole(){
  app.innerHTML = `
    <div class="card" style="text-align:center;">
      <p>遊戲已經開始，請等待這局結束</p>
    </div>
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  document.getElementById("leaveBtn").onclick = doLeave;
}

function avalonN(){ return avalonClampN(Object.keys(roomData.roles||{}).length); }
function avalonName(id){
  const p = playersData.find(pp=>pp.id===id);
  return p ? `${avatarOf(p)} ${esc(p.name)}${offBadge(p)}` : "🙂 ?";
}
// 這局有角色的玩家（遊戲開始後才加入的人不算）。
function avalonPlayers(){
  const roles = roomData.roles || {};
  return playersData.filter(p=>roles[p.id]);
}

// 我的身分 + 夜晚情報（揭示畫面與「查看我的身分」共用）。
function avalonRoleInfoHtml(){
  const roles = roomData.roles || {};
  const my = roles[identity.playerId];
  const info = avalonNightInfo(roles, identity.playerId, playersData.map(p=>p.id));
  const rows = info.ids.filter(id=>playersData.some(p=>p.id===id));
  let infoHtml = "";
  if(info.kind==="evil"){
    infoHtml = rows.length
      ? `<label>你的邪惡夥伴</label><ul class="playerlist">${rows.map(id=>`<li><span class="pname">${avalonName(id)}</span><span class="cattag">壞人</span></li>`).join("")}</ul>`
      : `<p class="helper" style="text-align:left;">你沒有其他邪惡夥伴。</p>`;
  } else if(info.kind==="merlin"){
    infoHtml = `<label>你看到的壞人（莫德雷德看不到）</label><ul class="playerlist">${rows.map(id=>`<li><span class="pname">${avalonName(id)}</span><span class="cattag">壞人</span></li>`).join("")}</ul>`;
  } else if(info.kind==="percival"){
    infoHtml = `<label>你看到的人</label><ul class="playerlist">${rows.map(id=>`<li><span class="pname">${avalonName(id)}</span><span class="cattag">梅林或莫甘娜</span></li>`).join("")}</ul>`;
  } else {
    infoHtml = `<p class="helper" style="text-align:left;">你沒有任何額外情報。</p>`;
  }
  return `
    <div class="qtext" style="font-size:24px; margin:8px 0;">${esc(AVALON_ROLE_LABEL[my]||'⚔️ 忠臣')}</div>
    <p class="helper" style="text-align:left; margin:0 0 10px;">${esc(AVALON_ROLE_DESC[my]||'')}</p>
    ${infoHtml}
  `;
}

// 遊戲中途隨時可以展開看自己的身分，預設收起來，避免旁邊的人偷看。
function avalonFooterHtml(){
  return `
    ${avalonPeek ? `<div class="card" style="margin-top:12px;">${avalonRoleInfoHtml()}</div>` : ``}
    <button class="btn-secondary" id="avPeekBtn" style="margin-top:10px;">${avalonPeek?'🙈 隱藏我的身分':'👁 查看我的身分'}</button>
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
}
function wireAvalonFooter(){
  const peekBtn = document.getElementById("avPeekBtn");
  if(peekBtn) peekBtn.onclick = ()=>{ avalonPeek = !avalonPeek; render(); };
  const leaveBtn = document.getElementById("leaveBtn");
  if(leaveBtn) leaveBtn.onclick = doLeave;
}

// 5 個任務圓圈（成功/失敗/目前這輪/尚未進行的隊伍人數）+ 連續否決計數。
function renderAvalonTracker(){
  const n = avalonN();
  const results = roomData.missionResults || [];
  const missionNo = roomData.missionNo || 1;
  const rc = Math.max(0, Math.min(5, roomData.rejectCount || 0));
  const dots = [1,2,3,4,5].map(i=>{
    const r = results[i-1];
    if(r) return `<div class="avdot ${r.ok?'ok':'bad'}">${r.ok?'✓':'✗'}</div>`;
    const size = avalonTeamSize(n, i) + (avalonFailsNeeded(n, i)===2 ? '*' : '');
    return `<div class="avdot ${(i===missionNo && roomData.phase!=='ended')?'cur':''}">${size}</div>`;
  }).join("");
  return `
    <div class="avtracker">
      <div class="avdots">${dots}</div>
      <div class="avreject">否決 ${"●".repeat(rc)}${"○".repeat(5-rc)}</div>
    </div>
  `;
}

function renderAvalonReveal(me, isHost){
  const acks = roomData.acks || {};
  const myAck = !!acks[identity.playerId];
  const ap = avalonPlayers();
  const ackCount = ap.filter(p=>acks[p.id]).length;
  const allAcked = ap.length>0 && ackCount===ap.length;
  app.innerHTML = `
    <div class="card">
      <div class="badge purple">🗡️ 你的身分</div>
      ${avalonRoleInfoHtml()}
      ${myAck ? `<p class="helper" style="margin-top:14px;">✅ 已確認，等待其他人… ${ackCount}/${ap.length}</p>` : `<button class="btn-primary" id="ackBtn" style="margin-top:14px;">我記住了</button>`}
    </div>
    ${isHost ? `<button class="btn-secondary" id="beginBtn" style="margin-top:10px;">${allAcked?'全員就緒，開始任務':`直接開始任務（已確認 ${ackCount}/${ap.length}）`}</button>` : ``}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(!myAck) document.getElementById("ackBtn").onclick = doAvalonAck;
  if(isHost) document.getElementById("beginBtn").onclick = doAvalonBegin;
  document.getElementById("leaveBtn").onclick = doLeave;
}

function renderAvalonTeam(me, isHost){
  const n = avalonN();
  const missionNo = roomData.missionNo || 1;
  const size = avalonTeamSize(n, missionNo);
  const need = avalonFailsNeeded(n, missionNo);
  const leaderId = roomData.leaderId;
  const leaderHere = avalonPlayers().some(p=>p.id===leaderId && (p.id===identity.playerId || isOnline(p, Date.now())));
  const isLeader = leaderId === identity.playerId;
  const key = `team-${missionNo}-${roomData.rejectCount||0}-${leaderId}`;
  if(avalonPickKey!==key){ avalonPickKey = key; avalonPickDraft = []; }
  avalonPickDraft = avalonPickDraft.filter(id=>avalonPlayers().some(p=>p.id===id));
  const picked = avalonPickDraft;
  const canSubmit = picked.length===size;
  app.innerHTML = `
    <div class="card">
      <div class="badge purple">第 ${missionNo} 輪任務</div>
      ${renderAvalonTracker()}
      <p class="helper" style="margin:0 0 8px; text-align:left;">本輪需要 <b>${size}</b> 人出任務${need===2?'（需要 2 張失敗票才算失敗）':''}。隊長：${leaderHere?avalonName(leaderId):'（已離開或離線）'}</p>
      ${isLeader ? `
        <p class="helper" style="margin:0 0 8px; text-align:left;">你是隊長，選出 ${size} 位隊員（可以選自己）。已選 ${picked.length}/${size}</p>
        <div class="pickgrid">
          ${avalonPlayers().map(p=>`<button class="pickbtn ${picked.includes(p.id)?'picked':''}" data-pick="${p.id}">${avatarOf(p)} ${esc(p.name)}${p.id===identity.playerId?' <span class="you">YOU</span>':''}</button>`).join("")}
        </div>
        <button class="btn-primary" id="proposeBtn" style="margin-top:12px;" ${canSubmit?'':'disabled'}>送出隊伍，開始投票</button>
      ` : `<p class="helper" style="margin-top:10px;">⏳ 等待隊長挑選隊員…</p>`}
    </div>
    ${(!leaderHere && isHost) ? `<button class="btn-secondary" id="skipLeaderBtn" style="margin-top:10px;">隊長已離開或離線，換下一位隊長</button>` : ``}
    ${avalonFooterHtml()}
  `;
  if(isLeader){
    document.querySelectorAll("[data-pick]").forEach(b=> b.onclick = ()=>{
      const id = b.dataset.pick;
      if(avalonPickDraft.includes(id)) avalonPickDraft = avalonPickDraft.filter(x=>x!==id);
      else if(avalonPickDraft.length<size) avalonPickDraft = [...avalonPickDraft, id];
      render();
    });
    document.getElementById("proposeBtn").onclick = doProposeTeam;
  }
  const skipBtn = document.getElementById("skipLeaderBtn");
  if(skipBtn) skipBtn.onclick = doAvalonSkipLeader;
  wireAvalonFooter();
}

function renderAvalonVote(me, isHost){
  const votes = roomData.teamVotes || {};
  const myVote = votes[identity.playerId];
  const team = roomData.teamSelection || [];
  const ap = avalonPlayers();
  const votedCount = ap.filter(p=>votes[p.id]!=null).length;
  app.innerHTML = `
    <div class="card">
      <div class="badge red">🗳️ 組隊投票</div>
      ${renderAvalonTracker()}
      <p class="helper" style="margin:0 0 8px; text-align:left;">隊長 ${avalonName(roomData.leaderId)} 提議的隊伍：</p>
      <ul class="playerlist">
        ${team.map(id=>`<li><span class="pname">${avalonName(id)}</span></li>`).join("")}
      </ul>
      <p class="helper" style="margin:10px 0 0;">已投票 ${votedCount}/${ap.length}（全員投完才會公開）</p>
      ${myVote==null ? `
        <button class="btn-primary" id="approveBtn" style="margin-top:12px;">👍 同意</button>
        <button class="btn-secondary" id="rejectBtn" style="margin-top:10px;">👎 反對</button>
      ` : `<p class="helper" style="margin-top:14px;">✅ 你投了${myVote==="approve"?'同意':'反對'}，等待其他人…</p>`}
    </div>
    ${avalonFooterHtml()}
  `;
  if(myVote==null){
    document.getElementById("approveBtn").onclick = ()=> doTeamVote("approve");
    document.getElementById("rejectBtn").onclick = ()=> doTeamVote("reject");
  }
  wireAvalonFooter();
}

function renderAvalonVoteResult(isHost){
  const votes = roomData.teamVotes || {};
  const t = avalonTally(votes);
  // 結算當下的結果存在 teamApproved：之後如果有人（例如剛重新上線的玩家）又補寫了票，也不會改變結果。
  if(typeof roomData.teamApproved==="boolean") t.approved = roomData.teamApproved;
  const rc = roomData.rejectCount || 0;
  const team = roomData.teamSelection || [];
  const btnLabel = t.approved ? '出發執行任務' : (rc>=5 ? '查看結果' : '換下一位隊長');
  app.innerHTML = `
    <div class="card">
      <div class="badge ${t.approved?'green':'red'}">🗳️ 投票結果</div>
      ${renderAvalonTracker()}
      <div class="qtext" style="font-size:22px; margin:6px 0;">${t.approved?'✅ 隊伍通過':'❌ 隊伍被否決'}（👍 ${t.approve} : 👎 ${t.reject}）</div>
      <p class="helper" style="margin:0 0 8px; text-align:left;">提議的隊伍：${team.map(id=>avalonName(id)).join("、")}</p>
      <ul class="playerlist">
        ${avalonPlayers().map(p=>`<li><span class="pname">${avatarOf(p)} ${esc(p.name)} ${p.id===identity.playerId?'<span class="you">YOU</span>':''}${offBadge(p)}</span><span class="cattag">${votes[p.id]==="approve"?'👍 同意':(votes[p.id]==="reject"?'👎 反對':'—')}</span></li>`).join("")}
      </ul>
      ${(!t.approved && rc>=5) ? `<p class="helper" style="margin-top:10px;">已經連續 5 次組隊被否決！</p>` : ``}
    </div>
    ${isHost ? `<button class="btn-primary" id="continueBtn">${btnLabel}</button>` : `<p class="helper">等待房主繼續</p>`}
    ${avalonFooterHtml()}
  `;
  if(isHost) document.getElementById("continueBtn").onclick = doAvalonContinueVote;
  wireAvalonFooter();
}

function renderAvalonMission(me, isHost){
  const team = roomData.teamSelection || [];
  const mv = roomData.missionVotes || {};
  const isMember = team.includes(identity.playerId);
  const myCard = mv[identity.playerId];
  const myRole = (roomData.roles||{})[identity.playerId];
  const evil = isEvilRole(myRole);
  const doneCount = team.filter(id=>mv[id]!=null).length;
  app.innerHTML = `
    <div class="card">
      <div class="badge purple">⚔️ 執行任務</div>
      ${renderAvalonTracker()}
      <p class="helper" style="margin:0 0 8px; text-align:left;">出任務的隊員：</p>
      <ul class="playerlist">
        ${team.map(id=>`<li><span class="pname">${avalonName(id)} ${id===identity.playerId?'<span class="you">YOU</span>':''}</span></li>`).join("")}
      </ul>
      ${isMember ? (myCard==null ? `
        <p class="helper" style="margin:10px 0 0;">秘密選擇任務結果${evil?'':'（好人只能選成功）'}：</p>
        <button class="btn-primary" id="successBtn" style="margin-top:10px;">✅ 任務成功</button>
        ${evil ? `<button class="btn-secondary" id="failBtn" style="margin-top:10px;">❌ 任務失敗</button>` : ``}
      ` : `<p class="helper" style="margin-top:14px;">✅ 已送出，等待其他隊員…（${doneCount}/${team.length}）</p>`)
      : `<p class="helper" style="margin-top:14px;">⏳ 隊員正在執行任務…（${doneCount}/${team.length}）</p>`}
    </div>
    ${avalonFooterHtml()}
  `;
  if(isMember && myCard==null){
    document.getElementById("successBtn").onclick = ()=> doMissionCard("success");
    const failBtn = document.getElementById("failBtn");
    if(failBtn) failBtn.onclick = ()=> doMissionCard("fail");
  }
  wireAvalonFooter();
}

function renderAvalonMissionResult(isHost){
  const results = roomData.missionResults || [];
  const last = results[results.length-1] || {ok:true, fails:0};
  const wins = results.filter(r=>r.ok).length;
  const losses = results.length - wins;
  const fails = roomData.lastMissionFails != null ? roomData.lastMissionFails : last.fails;
  const btnLabel = losses>=3 ? '查看結果' : (wins>=3 ? '進入刺殺階段' : '下一輪任務');
  app.innerHTML = `
    <div class="card">
      <div class="badge ${last.ok?'green':'red'}">📜 任務結果</div>
      ${renderAvalonTracker()}
      <div class="qtext" style="font-size:24px; margin:6px 0;">${last.ok?'✅ 任務成功':'❌ 任務失敗'}</div>
      <p class="helper" style="margin:0; text-align:left;">本輪出現 <b>${fails}</b> 張失敗票。目前好人 ${wins} 勝 / 壞人 ${losses} 勝。</p>
    </div>
    ${isHost ? `<button class="btn-primary" id="continueBtn">${btnLabel}</button>` : `<p class="helper">等待房主繼續</p>`}
    ${avalonFooterHtml()}
  `;
  if(isHost) document.getElementById("continueBtn").onclick = doAvalonContinueMission;
  wireAvalonFooter();
}

function renderAvalonAssassin(me, isHost){
  const roles = roomData.roles || {};
  const isAssassin = roles[identity.playerId]==="assassin";
  if(!isAssassin){
    app.innerHTML = `
      <div class="card" style="text-align:center;">
        <div class="badge red">🗡️ 刺殺時刻</div>
        ${renderAvalonTracker()}
        <p class="helper" style="margin-top:10px;">好人完成了 3 次任務！刺客正在決定要刺殺誰…</p>
      </div>
      ${avalonFooterHtml()}
    `;
    wireAvalonFooter();
    return;
  }
  if(avalonPickKey!=="assassin"){ avalonPickKey = "assassin"; avalonPickDraft = []; }
  const candidates = playersData.filter(p=> roles[p.id] && !isEvilRole(roles[p.id]));
  avalonPickDraft = avalonPickDraft.filter(id=>candidates.some(p=>p.id===id)).slice(0,1);
  const picked = avalonPickDraft[0] || null;
  app.innerHTML = `
    <div class="card">
      <div class="badge red">🗡️ 刺殺梅林</div>
      ${renderAvalonTracker()}
      <p class="helper" style="margin:0 0 8px; text-align:left;">好人完成了 3 次任務，你是刺客！選出你認為的梅林，刺中就能逆轉獲勝。</p>
      <div class="pickgrid">
        ${candidates.map(p=>`<button class="pickbtn ${picked===p.id?'picked':''}" data-pick="${p.id}">${avatarOf(p)} ${esc(p.name)}</button>`).join("")}
      </div>
      <button class="btn-primary" id="stabBtn" style="margin-top:12px;" ${picked?'':'disabled'}>確認刺殺</button>
    </div>
    ${avalonFooterHtml()}
  `;
  document.querySelectorAll("[data-pick]").forEach(b=> b.onclick = ()=>{ avalonPickDraft = [b.dataset.pick]; render(); });
  document.getElementById("stabBtn").onclick = ()=>{ if(picked) doAssassinPick(picked); };
  wireAvalonFooter();
}

const AVALON_WIN_REASON = {
  reject5: "連續 5 次組隊被否決",
  fail3: "3 次任務失敗",
  assassinHit: "刺客刺中了梅林",
  assassinMiss: "好人完成 3 次任務，刺客沒有找到梅林"
};
function renderAvalonEnded(isHost){
  const winner = roomData.winner;
  const roles = roomData.roles || {};
  const isEvilWin = winner==="evil";
  const target = roomData.assassinTarget;
  app.innerHTML = `
    <div class="${isEvilWin?'losebanner':'winbanner'}">
      <h2>${isEvilWin?'🗡️ 邪惡陣營勝利！':'⚔️ 正義陣營勝利！'}</h2>
      <p>${esc(AVALON_WIN_REASON[roomData.winReason]||'遊戲結束')}</p>
    </div>
    <div class="card">
      ${renderAvalonTracker()}
      ${target ? `<p class="helper" style="margin:0 0 8px; text-align:left;">刺客指認的對象：${avalonName(target)}（${esc(AVALON_ROLE_LABEL[roles[target]]||'')}）</p>` : ``}
      <label>身分公開</label>
      <ul class="playerlist">
        ${playersData.map(p=>`
          <li><span class="pname">${avatarOf(p)} ${esc(p.name)} ${p.id===identity.playerId?'<span class="you">YOU</span>':''}${offBadge(p)}</span><span class="cattag">${esc(AVALON_ROLE_LABEL[roles[p.id]]||'（旁觀）')}</span></li>
        `).join("")}
      </ul>
    </div>
    ${isHost ? `<button class="btn-primary" id="rematchBtn">再玩一局</button>` : `<p class="helper">等待房主開始下一局</p>`}
    <button class="btn-ghost" id="leaveBtn">離開房間</button>
  `;
  if(isHost) document.getElementById("rematchBtn").onclick = doRematchAvalon;
  document.getElementById("leaveBtn").onclick = doLeave;
}

//#@ actions
// ---------- 阿瓦隆：資料 / 動作 ----------

// 投票 / 出任務牌 / 確認身分：每個人只寫「自己的」欄位（teamVotes.<id> 等），不需要鎖，同時送出不會互相蓋掉；
// 只有「結算」會拿短租約鎖，重新抓資料、確認階段後才寫入（冪等）。
async function avalonFreshPlayers(roles){
  const snap = await playersCol.get().catch(()=>({docs:[]}));
  return snap.docs.map(dd=>({id:dd.id, ...dd.data()})).filter(p=>!roles || roles[p.id]).sort((a,b)=>a.joinedAt-b.joinedAt);
}
// 下一位隊長（跳過離線的人）。
function avalonLeaderAfter(fd, players){
  const rolled = avalonRolled(fd, players);
  const on = new Set(onlineIdsOf(rolled, Date.now(), identity.playerId));
  return avalonNextOnlineLeader(rolled.map(p=>p.id), fd.leaderId, on);
}

async function doStartAvalon(){
  const players = playersData;
  if(players.length<5){ startError = "至少需要 5 位玩家才能開始阿瓦隆"; render(); return; }
  if(players.length>10){ startError = "阿瓦隆最多 10 位玩家"; render(); return; }
  if(!players.every(p=>p.ready)){ startError = "還有人沒按「我準備好了」，等他們準備好才能開始"; render(); return; }
  const settings = roomData.settings || {roles:{percival:true, morgana:true, mordred:false}};
  const roles = assignAvalonRoles(players, settings.roles);
  const leaderId = players[Math.floor(Math.random()*players.length)].id;
  startError = "";
  avalonPickDraft = []; avalonPickKey = ""; avalonPeek = false;
  try{
    await roomRef.update({
      phase:"reveal", round:1, roles, acks:{}, leaderId, missionNo:1, missionResults:[], rejectCount:0,
      teamSelection:[], teamVotes:{}, missionVotes:{}, lastMissionFails:0, assassinTarget:null,
      winner:null, winReason:null, lastActivityAt: Date.now()
    });
  }catch(e){}
}

async function doAvalonAck(){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="reveal"){ voteBusy=false; return; }
    if(!(await writeOwnField("acks."+identity.playerId, true, "reveal"))) showToast(MSG_RETRY);
  }catch(e){ showToast(MSG_RETRY); }
  voteBusy = false;
}

async function doAvalonBegin(){
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="reveal") return;
    await roomRef.update({phase:"team", teamSelection:[], teamVotes:{}, missionVotes:{}, lastActivityAt: Date.now()});
  }catch(e){}
}

// 隊長離開或離線後沒人能組隊，房主可以把隊長換給下一位在線的人（看門狗也會自動做同一件事）。
async function doAvalonSkipLeader(){
  try{
    await withFreshRoom(async (fd, players)=>{
      const plan = avalonPlan(fd, players, Date.now(), identity.playerId);
      if(plan && plan.kind==="leader") await roomRef.update({leaderId: plan.leaderId, lastActivityAt: Date.now()});
    }, {tries:5});
  }catch(e){}
}

async function doProposeTeam(){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="team"){ voteBusy=false; return; }
    const fd = fresh.data();
    if(fd.leaderId !== identity.playerId){ voteBusy=false; return; }
    const n = avalonClampN(Object.keys(fd.roles||{}).length);
    const size = avalonTeamSize(n, fd.missionNo||1);
    const sel = Array.from(new Set(avalonPickDraft));
    const players = await avalonFreshPlayers(fd.roles||{});
    if(sel.length!==size || !sel.every(id=>players.some(p=>p.id===id))){ voteBusy=false; return; }
    await roomRef.update({phase:"vote", teamSelection: sel, teamVotes:{}, missionVotes:{}, lastActivityAt: Date.now()});
    avalonPickDraft = []; avalonPickKey = "";
  }catch(e){}
  voteBusy = false;
}

async function doTeamVote(choice){
  if(voteBusy) return;
  voteBusy = true;
  let wrote = false;
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="vote"){ voteBusy=false; return; }
    if((fresh.data().teamVotes||{})[identity.playerId]!=null){ voteBusy=false; return; }
    wrote = await writeOwnField("teamVotes."+identity.playerId, choice==="approve" ? "approve" : "reject", "vote");
    if(!wrote) showToast(MSG_RETRY);
  }catch(e){ showToast(MSG_RETRY); }
  voteBusy = false;
  if(wrote) await resolveTeamVote();
}

// 在線的有角色玩家都投完後結算：同意票嚴格多於反對票才通過（平票否決）。離線沒投的人當作缺席。
// 結算 = 短租約鎖 + 重新抓資料 + 確認還在 vote 階段（冪等：多人同時呼叫只會有一個真的寫入）。
async function resolveTeamVote(){
  try{
    await withFreshRoom(async (fd, players)=>{
      const plan = avalonPlan(fd, players, Date.now(), identity.playerId);
      if(plan && plan.kind==="resolveVote") await avalonResolveVoteInner(fd);
    }, {tries:6});
  }catch(e){}
}
async function avalonResolveVoteInner(fd){
  const t = avalonTally(fd.teamVotes || {});
  const patch = {phase:"voteresult", teamApproved: t.approved, lastActivityAt: Date.now()};
  if(!t.approved) patch.rejectCount = (fd.rejectCount||0)+1;
  await roomRef.update(patch);
}

async function doAvalonContinueVote(){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="voteresult"){ voteBusy=false; return; }
    const fd = fresh.data();
    const t = avalonTally(fd.teamVotes);
    const approved = typeof fd.teamApproved==="boolean" ? fd.teamApproved : t.approved;
    if(approved){
      await roomRef.update({phase:"mission", missionVotes:{}, rejectCount:0, lastActivityAt: Date.now()});
    } else if((fd.rejectCount||0)>=5){
      await roomRef.update({phase:"ended", winner:"evil", winReason:"reject5", lastActivityAt: Date.now()});
    } else {
      const players = await avalonFreshPlayers(fd.roles||{});
      const leaderId = avalonLeaderAfter(fd, players);
      await roomRef.update({phase:"team", leaderId, teamSelection:[], teamVotes:{}, missionVotes:{}, teamApproved:null, lastActivityAt: Date.now()});
    }
  }catch(e){}
  voteBusy = false;
}

async function doMissionCard(card){
  if(voteBusy) return;
  voteBusy = true;
  let wrote = false;
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="mission"){ voteBusy=false; return; }
    const fd = fresh.data();
    const team = fd.teamSelection || [];
    if(!team.includes(identity.playerId)){ voteBusy=false; return; }
    if((fd.missionVotes||{})[identity.playerId]!=null){ voteBusy=false; return; }
    // 好人只能出成功，就算畫面被改過也一樣。
    const myCard = (card==="fail" && isEvilRole((fd.roles||{})[identity.playerId])) ? "fail" : "success";
    wrote = await writeOwnField("missionVotes."+identity.playerId, myCard, "mission");
    if(!wrote) showToast(MSG_RETRY);
  }catch(e){ showToast(MSG_RETRY); }
  voteBusy = false;
  if(wrote) await resolveMission();
}

// 在線的隊員都出完牌後結算：失敗票數達標（第 4 輪 7 人以上要 2 張）任務才失敗。同樣是鎖 + 重抓 + 確認階段（冪等）。
async function resolveMission(){
  try{
    await withFreshRoom(async (fd, players)=>{
      const plan = avalonPlan(fd, players, Date.now(), identity.playerId);
      if(plan && plan.kind==="resolveMission") await avalonResolveMissionInner(fd);
    }, {tries:6});
  }catch(e){}
}
async function avalonResolveMissionInner(fd){
  const team = fd.teamSelection || [];
  const mv = fd.missionVotes || {};
  const missionNo = fd.missionNo || 1;
  const prev = fd.missionResults || [];
  if(prev.length>=missionNo) return;
  const fails = team.filter(id=> mv[id]==="fail").length;
  const n = avalonClampN(Object.keys(fd.roles||{}).length);
  const ok = fails < avalonFailsNeeded(n, missionNo);
  await roomRef.update({
    phase:"missionresult", missionResults:[...prev, {ok, fails}], lastMissionFails: fails, lastActivityAt: Date.now()
  });
}

// 房主端看門狗：隊長離線 → 換隊長；在線的人都投完/出完牌但沒人結算 → 補結算；刺客離線 → 當作沒刺中。
async function avalonWatchdog(){
  if(!avalonPlan(roomData, playersData, Date.now(), identity.playerId)) return;
  await withFreshRoom(async (fd, players)=>{
    const plan = avalonPlan(fd, players, Date.now(), identity.playerId);
    if(!plan) return;
    if(plan.kind==="leader") await roomRef.update({leaderId: plan.leaderId, lastActivityAt: Date.now()});
    else if(plan.kind==="resolveVote") await avalonResolveVoteInner(fd);
    else if(plan.kind==="resolveMission") await avalonResolveMissionInner(fd);
    else if(plan.kind==="assassinMiss") await roomRef.update({phase:"ended", winner:"good", winReason:"assassinMiss", assassinTarget:null, lastActivityAt: Date.now()});
  }, {tries:4});
}

async function doAvalonContinueMission(){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="missionresult"){ voteBusy=false; return; }
    const fd = fresh.data();
    const results = fd.missionResults || [];
    const wins = results.filter(r=>r.ok).length;
    const losses = results.length - wins;
    if(losses>=3){
      await roomRef.update({phase:"ended", winner:"evil", winReason:"fail3", lastActivityAt: Date.now()});
    } else if(wins>=3){
      avalonPickDraft = []; avalonPickKey = "";
      await roomRef.update({phase:"assassin", assassinTarget:null, lastActivityAt: Date.now()});
    } else {
      const players = await avalonFreshPlayers(fd.roles||{});
      const leaderId = avalonLeaderAfter(fd, players);
      await roomRef.update({
        phase:"team", leaderId, missionNo:(fd.missionNo||1)+1, rejectCount:0,
        teamSelection:[], teamVotes:{}, missionVotes:{}, lastActivityAt: Date.now()
      });
    }
  }catch(e){}
  voteBusy = false;
}

async function doAssassinPick(targetId){
  if(voteBusy) return;
  voteBusy = true;
  try{
    const fresh = await roomRef.get().catch(()=>null);
    if(!fresh || !fresh.exists || fresh.data().phase!=="assassin"){ voteBusy=false; return; }
    const fd = fresh.data();
    const roles = fd.roles || {};
    if(roles[identity.playerId]!=="assassin" || !roles[targetId]){ voteBusy=false; return; }
    const hit = roles[targetId]==="merlin";
    await roomRef.update({
      assassinTarget: targetId, phase:"ended",
      winner: hit ? "evil" : "good", winReason: hit ? "assassinHit" : "assassinMiss",
      lastActivityAt: Date.now()
    });
  }catch(e){}
  voteBusy = false;
}

async function doRematchAvalon(){
  try{
    avalonPickDraft = []; avalonPickKey = ""; avalonPeek = false;
    await Promise.all(playersData.map(p=> playersCol.doc(p.id).update({ready:false})));
    await roomRef.update({
      phase:"lobby", round:0, roles:{}, acks:{}, leaderId:null, missionNo:0, missionResults:[], rejectCount:0,
      teamSelection:[], teamVotes:{}, missionVotes:{}, lastMissionFails:0, assassinTarget:null,
      winner:null, winReason:null, lastActivityAt: Date.now()
    });
  }catch(e){}
}

