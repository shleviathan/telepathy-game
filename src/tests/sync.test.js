// 同步 / 鎖 / 在線狀態 / 房主 / 看門狗 測試。用法：node tests/sync.test.js dist/index.html standalone  |  dist/artifact.html artifact
const assert = require("assert");
const L = require("./lib");
const { Clock, Store, createClient, seedPlayers, seedRoom, roomPath, playerPath, test, summary } = L;
const [file, kind] = process.argv.slice(2);
const CODE = "R1";

async function setup({ gameType, ids, room, each, connect }){
  const clock = new Clock();
  const store = new Store(clock, kind);
  seedRoom(store, CODE, Object.assign({ gameType }, room||{}));
  seedPlayers(store, CODE, ids, { each });
  const clients = {};
  for(const id of ids){
    if(connect && !connect.includes(id)) continue;
    clients[id] = createClient({ file, kind, store, clock });
    await clients[id].connect(CODE, id, id.toUpperCase());
  }
  await clock.run(500);
  return { clock, store, clients, ids };
}
const jv = x => JSON.parse(JSON.stringify(x));
const room = (store) => store.getDoc(roomPath(CODE));
// 讓某位玩家「離線」：把他的 lastSeen 改成很久以前（沒有用戶端替他送心跳）
const goOffline = (store, clock, id) => store.patch(playerPath(CODE, id), d=>{ d.lastSeen = clock.now - 120000; d.joinedAt = d.joinedAt; });

(async ()=>{
console.log(`== ${kind} ==`);

// ---------------- 純函式 ----------------
const probe = createClient({ file, kind, store: new Store(new Clock(), kind), clock: new Clock() });
const P = (code)=>{ const v = probe.ev(`(function(){ return (${code}); })()`); return v===undefined ? undefined : JSON.parse(JSON.stringify(v)); };
await test("isOnline：lastSeen / joinedAt 後備 / 邊界", ()=>{
  assert.strictEqual(P(`isOnline({lastSeen:1000}, 1000+39999)`), true);
  assert.strictEqual(P(`isOnline({lastSeen:1000}, 1000+40000)`), false);
  assert.strictEqual(P(`isOnline({joinedAt:1000}, 1000+10)`), true);
  assert.strictEqual(P(`isOnline({joinedAt:1000, lastSeen:900000}, 900100)`), true);
  assert.strictEqual(P(`isOnline(null, 5)`), false);
  assert.strictEqual(P(`isOnline({}, 100000)`), false);
});
await test("pickHostId：最早加入的在線者；原房主離線→下一位；回來→拿回；自己永遠算在線", ()=>{
  const now = 1e6;
  const ps = [{id:"a",joinedAt:1,lastSeen:now},{id:"b",joinedAt:2,lastSeen:now},{id:"c",joinedAt:3,lastSeen:now}];
  const run = (arr, self)=> probe.ev(`pickHostId(${JSON.stringify(arr)}, ${now}, ${JSON.stringify(self)})`);
  assert.strictEqual(run(ps,"c"), "a");
  const off = ps.map(p=> p.id==="a" ? {...p, lastSeen: now-50000} : p);
  assert.strictEqual(run(off,"c"), "b");
  assert.strictEqual(run(off,"a"), "a");                     // 在 a 自己的裝置上，a 一定算在線
  const back = ps.map(p=> p.id==="a" ? {...p, lastSeen: now-1000} : p);
  assert.strictEqual(run(back,"c"), "a");                    // 回來又是最早的在線者 → 拿回
  const allOff = ps.map(p=>({...p, lastSeen: now-90000}));
  assert.strictEqual(run(allOff, null), "a");                // 沒人在線 → 退回最早加入
  assert.strictEqual(run([], "x"), null);
  // 每個用戶端看到同樣資料算出同一位（確定性）
  const r = ["b","c"].map(s=>run(off,s)); assert.deepStrictEqual(r, ["b","b"]);
});
await test("pickHostId 防抖：心跳週期 12s < TTL 40s，單次漏拍不會換房主", ()=>{
  const ps = (t)=>[{id:"a",joinedAt:1,lastSeen:t},{id:"b",joinedAt:2,lastSeen:1e6}];
  // a 的心跳每 12 秒一次：任何時間點 now-lastSeen <= 12s（漏 2 拍 = 24s 仍 < 40s）都維持 a
  for(const gap of [0, 5000, 12000, 24000, 36000, 39999]) assert.strictEqual(probe.ev(`pickHostId(${JSON.stringify(ps(1e6-gap))}, 1000000, "b")`), "a");
  assert.strictEqual(probe.ev(`pickHostId(${JSON.stringify(ps(1e6-40000))}, 1000000, "b")`), "b");
});
await test("backoffDelay：150~600ms、隨 attempt 非遞減的上限、rnd 抖動", ()=>{
  for(let a=0;a<12;a++){
    const lo = probe.ev(`backoffDelay(${a}, 0)`), hi = probe.ev(`backoffDelay(${a}, 1)`), mid = probe.ev(`backoffDelay(${a}, 0.5)`);
    assert(lo===150, "lo "+lo); assert(hi>=150 && hi<=600, "hi "+hi); assert(mid>=lo && mid<=hi);
    if(a>0) assert(hi >= probe.ev(`backoffDelay(${a-1}, 1)`));
  }
  assert.strictEqual(probe.ev(`backoffDelay(10, 1)`), 600);
});
await test("expandDotted / getPathValue / stripSeen / allOnlineSubmitted", ()=>{
  assert.deepStrictEqual(P(`expandDotted({"a.b.c":1,"a.d":2,"e":3})`), {a:{b:{c:1},d:2},e:3});
  assert.strictEqual(P(`getPathValue({a:{b:{c:5}}}, "a.b.c")`), 5);
  assert.strictEqual(P(`getPathValue({a:1}, "a.b.c")`), undefined);
  assert.deepStrictEqual(P(`stripSeen([{id:"a",lastSeen:5,x:1}])`), [{id:"a",x:1}]);
  const now = 1e6;
  const ps = [{id:"a",joinedAt:1,lastSeen:now},{id:"b",joinedAt:2,lastSeen:now},{id:"c",joinedAt:3,lastSeen:now-99999}];
  assert.strictEqual(P(`allOnlineSubmitted(["a","b","c"], {a:1,b:1}, ${JSON.stringify(ps)}, ${now}, "a")`), true);   // c 離線不用等
  assert.strictEqual(P(`allOnlineSubmitted(["a","b","c"], {a:1}, ${JSON.stringify(ps)}, ${now}, "a")`), false);
  assert.strictEqual(P(`allOnlineSubmitted(["c"], {}, ${JSON.stringify(ps)}, ${now}, "a")`), true);                  // 全離線也算齊
});

// ---------------- 各模式的 plan（純函式）----------------
const NOW = 1e6;
const mkP = (id, j, off, extra) => Object.assign({ id, joinedAt: j, lastSeen: off ? NOW-90000 : NOW }, extra||{});
const plan = (fn, fd, ps, self) => P(`${fn}(${JSON.stringify(fd)}, ${JSON.stringify(ps)}, ${NOW}, ${JSON.stringify(self||"p1")})`);
await test("avalonPlan：隊長離線→換下一位在線隊長；投票/出牌只等在線者；刺客離線→沒刺中", ()=>{
  const ps = [mkP("p1",1),mkP("p2",2,true),mkP("p3",3,true),mkP("p4",4),mkP("p5",5)];
  const roles = {p1:"merlin",p2:"assassin",p3:"minion",p4:"loyal",p5:"loyal"};
  assert.deepStrictEqual(plan("avalonPlan", {phase:"team", roles, leaderId:"p2"}, ps), {kind:"leader", leaderId:"p4"});
  assert.strictEqual(plan("avalonPlan", {phase:"team", roles, leaderId:"p1"}, ps), null);
  assert.deepStrictEqual(plan("avalonPlan", {phase:"team", roles, leaderId:"zz"}, ps), {kind:"leader", leaderId:"p1"});
  assert.deepStrictEqual(plan("avalonPlan", {phase:"vote", roles, teamVotes:{p1:"approve",p4:"reject"}}, ps), null);
  assert.deepStrictEqual(plan("avalonPlan", {phase:"vote", roles, teamVotes:{p1:"approve",p4:"reject",p5:"approve"}}, ps), {kind:"resolveVote"});
  assert.deepStrictEqual(plan("avalonPlan", {phase:"mission", roles, teamSelection:["p1","p3"], missionVotes:{p1:"success"}}, ps), {kind:"resolveMission"});
  assert.strictEqual(plan("avalonPlan", {phase:"mission", roles, teamSelection:["p1","p4"], missionVotes:{p1:"success"}}, ps), null);
  assert.deepStrictEqual(plan("avalonPlan", {phase:"mission", roles, teamSelection:["p2","p3"], missionVotes:{}}, ps), {kind:"resolveMission"}); // 隊員全離線
  assert.deepStrictEqual(plan("avalonPlan", {phase:"assassin", roles}, ps), {kind:"assassinMiss"});
  assert.strictEqual(plan("avalonPlan", {phase:"reveal", roles}, ps), null);
});
await test("cnPlan：指揮官離線→換在線隊友/無人可換則跳過；整隊猜測者離線→跳過", ()=>{
  const ps = [mkP("a",1,false,{team:"red"}),mkP("b",2,true,{team:"red"}),mkP("c",3,false,{team:"red"}),mkP("d",4,false,{team:"blue"}),mkP("e",5,false,{team:"blue"})];
  const fd = {phase:"clue", turnTeam:"red", spymasters:{red:"b", blue:"d"}};
  assert.deepStrictEqual(plan("cnPlan", fd, ps, "a"), {kind:"swap", team:"red", spy:"a"});
  assert.strictEqual(plan("cnPlan", {...fd, spymasters:{red:"a",blue:"d"}}, ps, "a"), null);
  const ps2 = [mkP("a",1,true,{team:"red"}),mkP("b",2,true,{team:"red"}),mkP("d",4,false,{team:"blue"}),mkP("e",5,false,{team:"blue"})];
  assert.deepStrictEqual(plan("cnPlan", {phase:"clue", turnTeam:"red", spymasters:{red:"a",blue:"d"}}, ps2, "d"), {kind:"skip"});
  assert.deepStrictEqual(plan("cnPlan", {phase:"guess", turnTeam:"red", spymasters:{red:"a",blue:"d"}}, ps2, "d"), {kind:"skip"});
  assert.strictEqual(plan("cnPlan", {phase:"guess", turnTeam:"blue", spymasters:{red:"a",blue:"d"}}, ps2, "d"), null);
  assert.strictEqual(plan("cnPlan", {phase:"ended", turnTeam:"blue"}, ps2, "d"), null);
});
await test("joPlan：猜詞者離線→replace；在線提示者都交了→resolve", ()=>{
  const ps = [mkP("p1",1),mkP("p2",2),mkP("p3",3,true),mkP("p4",4)];
  const fd = {phase:"clue", guesserId:"p1", clueEligible:["p2","p3","p4"], hints:{p2:"x"}};
  assert.strictEqual(plan("joPlan", fd, ps), null);
  assert.deepStrictEqual(plan("joPlan", {...fd, hints:{p2:"x",p4:"y"}}, ps), {kind:"resolve"});
  assert.deepStrictEqual(plan("joPlan", {...fd, guesserId:"p3", clueEligible:["p1","p2","p4"]}, ps), {kind:"replace"});
  assert.deepStrictEqual(plan("joPlan", {phase:"guess", guesserId:"p3"}, ps), {kind:"replace"});
  assert.strictEqual(plan("joPlan", {phase:"guess", guesserId:"p2"}, ps), null);
  assert.strictEqual(plan("joPlan", {phase:"result", guesserId:"p3"}, ps), null);
});
await test("wwPlan：夜晚各步驟/獵人/投票遇離線的安全預設", ()=>{
  const ps = [mkP("w1",1),mkP("w2",2,true),mkP("g",3,true),mkP("s",4),mkP("v",5),mkP("h",6,true)];
  const roles = {w1:"wolf",w2:"wolf",g:"guard",s:"seer",v:"villager",h:"hunter"};
  const night = (step, more)=> Object.assign({phase:"night", roles, nightStep:step, wolfVotes:{}}, more||{});
  assert.deepStrictEqual(plan("wwPlan", night("guard"), ps, "w1"), {kind:"skipStep", step:"guard"});
  assert.strictEqual(plan("wwPlan", night("seer"), ps, "w1"), null);
  assert.strictEqual(plan("wwPlan", night("wolf"), ps, "w1"), null);                                  // 在線的狼 w1 還沒投
  assert.deepStrictEqual(plan("wwPlan", night("wolf",{wolfVotes:{w1:"v"}}), ps, "w1"), {kind:"resolveWolf"});
  const ps2 = ps.map(p=> p.id==="w1" ? {...p, lastSeen: NOW-90000} : p);
  assert.deepStrictEqual(plan("wwPlan", night("wolf"), ps2, "s"), {kind:"resolveWolf"});             // 活狼全離線→今晚沒人被襲擊
  assert.deepStrictEqual(plan("wwPlan", {phase:"night", roles, nightStep:"witch"}, ps, "s"), {kind:"skipStep", step:"witch"}); // 沒有女巫角色→視為缺席
  assert.deepStrictEqual(plan("wwPlan", {phase:"hunter", roles, hunterQueue:["h"]}, ps, "s"), {kind:"hunterSkip"});
  assert.strictEqual(plan("wwPlan", {phase:"hunter", roles, hunterQueue:["s"]}, ps, "s"), null);
  assert.strictEqual(plan("wwPlan", {phase:"vote", roles, voteTally:{w1:"v"}}, ps, "w1"), null);
  assert.deepStrictEqual(plan("wwPlan", {phase:"vote", roles, voteTally:{w1:"v",s:"abstain",v:"w1"}}, ps, "w1"), {kind:"resolveVote"});
  const dead = ps.map(p=> p.id==="v" ? {...p, alive:false} : p);
  assert.deepStrictEqual(plan("wwPlan", {phase:"vote", roles, voteTally:{w1:"v",s:"abstain"}}, dead, "w1"), {kind:"resolveVote"}); // 死人不用投
});
await test("drawPlan：畫家離線→跳過；猜謎者離線→公布；時間到→換人", ()=>{
  const ps = [mkP("a",1),mkP("b",2,true),mkP("c",3)];
  const fd = {phase:"drawing", drawOrder:["b","c"], currentDrawerIndex:0, roundEndAt: NOW+9999, currentGuesserId:"a"};
  assert.deepStrictEqual(plan("drawPlan", fd, ps, "a"), {kind:"advance", reason:"offline"});
  assert.strictEqual(plan("drawPlan", {...fd, currentDrawerIndex:1}, ps, "a"), null);
  assert.deepStrictEqual(plan("drawPlan", {...fd, currentDrawerIndex:1, roundEndAt: NOW-1}, ps, "a"), {kind:"advance", reason:"time"});
  assert.deepStrictEqual(plan("drawPlan", {phase:"guessing", currentGuesserId:"b"}, ps, "a"), {kind:"reveal"});
  assert.strictEqual(plan("drawPlan", {phase:"guessing", currentGuesserId:"c"}, ps, "a"), null);
});

// ---------------- 鎖 ----------------
await test("lockRoom/unlockRoom：搶到、忙碌、釋放後立刻可再搶（standalone）／縮短 ttl（artifact）", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:["p1"] });
  const c = clients.p1;
  const r = await c.ev(`(async()=>{ const a = await lockRoom(roomRef,"h1",4000); const b = await lockRoom(roomRef,"h2",4000); return {a,b}; })()`);
  assert.deepStrictEqual([r.a.acquired, r.b.acquired], [true, false]);
  await c.ev(`unlockRoom(roomRef,"h1")`);
  if(kind==="standalone"){
    const r2 = await c.ev(`lockRoom(roomRef,"h2",4000)`);
    assert.strictEqual(r2.acquired, true, "釋放後應該立刻搶得到");
  } else {
    const lease = store.leases.get(roomPath(CODE));
    assert(lease.expiresAt - clock.now <= 1000, "artifact 釋放 = ttl 縮到最短（1 秒）, 實際 " + (lease.expiresAt-clock.now));
    await clock.run(1100);
    const r2 = await c.ev(`lockRoom(roomRef,"h2",4000)`);
    assert.strictEqual(r2.acquired, true);
  }
});
if(kind==="standalone") await test("releaseLock 只刪自己的鎖：鎖過期被別人拿走後，舊持有者釋放不會誤刪", async ()=>{
  const { clock, clients, store } = await setup({ gameType:"avalon", ids:["p1"] });
  const c = clients.p1;
  await c.ev(`lockRoom(roomRef,"A",1000)`);
  await clock.run(1500);
  assert.strictEqual((await c.ev(`lockRoom(roomRef,"B",4000)`)).acquired, true);
  await c.ev(`unlockRoom(roomRef,"A")`);
  assert.strictEqual((await c.ev(`lockRoom(roomRef,"C",4000)`)).acquired, false, "B 的鎖還在");
  await c.ev(`unlockRoom(roomRef,"B")`);
  assert.strictEqual((await c.ev(`lockRoom(roomRef,"C",4000)`)).acquired, true);
});
await test("withRoomLock：成功後釋放", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:["p1","p2"] });
  const [a,b] = [clients.p1, clients.p2];
  const t0 = clock.now;
  const r = await a.ev(`withRoomLock(async()=>42)`);
  assert.deepStrictEqual(jv(r), {ok:true, value:42});
  if(kind==="standalone") assert.strictEqual(store.getDoc(roomPath(CODE)+"/_locks/resolve"), undefined, "鎖文件應該被刪掉");
  else assert(store.leases.get(roomPath(CODE)).expiresAt - clock.now <= 1000);
  let r2 = null; b.ev(`withRoomLock(async()=>7)`).then(v=>{ r2 = v; });   // 另一個人馬上就能拿（artifact 租約最多再撐 1 秒，退避重試後拿到）
  await clock.run(2500);
  assert(r2 && r2.ok === true && r2.value === 7);
});
await test("withRoomLock：fn 丟例外也會釋放，例外原樣往外丟", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:["p1"] });
  const c = clients.p1;
  const out = await c.ev(`(async()=>{ try{ await withRoomLock(async()=>{ throw new Error("boom"); }); return "no throw"; }catch(e){ return e.message; } })()`);
  assert.strictEqual(out, "boom");
  if(kind==="standalone") assert.strictEqual(store.getDoc(roomPath(CODE)+"/_locks/resolve"), undefined);
  else assert(store.leases.get(roomPath(CODE)).expiresAt - clock.now <= 1000);
  let r = null; c.ev(`withRoomLock(async()=>"again")`).then(v=>{ r = v; }); await clock.run(2500); assert.strictEqual(r && r.ok, true);
});
await test("withRoomLock：別人占著鎖 → 退避重試最後成功；一直占著 → 回傳 {ok:false} 而不是默默吞掉", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:["p1","p2"] });
  const a = clients.p1, b = clients.p2;
  await b.ev(`lockRoom(roomRef,"other",1500)`);
  const t0 = clock.now;
  let done = null;
  a.ev(`withRoomLock(async()=>"got")`).then(v=>{ done = jv(v); });
  await clock.run(100); assert.strictEqual(done, null, "還在重試");
  await clock.run(3000);
  assert.deepStrictEqual(done, {ok:true, value:"got"});
  assert(clock.now - t0 >= 1500 - 1);
  // 一直占著（ttl 很長）
  const { clock: c2, clients: cl2 } = await setup({ gameType:"avalon", ids:["p1","p2"] });
  await cl2.p2.ev(`lockRoom(roomRef,"hog",600000)`);
  let res = null; cl2.p1.ev(`withRoomLock(async()=>"x", {tries:4})`).then(v=>{ res = jv(v); });
  await c2.run(4000);
  assert.deepStrictEqual(res, {ok:false});
});
await test("writeOwnField：寫入失敗會重試；artifact 的 last-writer-wins 被蓋掉時讀回發現並重寫", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:["p1"], room:{phase:"vote"} });
  const c = clients.p1;
  if(kind==="artifact") store.dropUpdates = 2;   // 前兩次 update 被「蓋掉」
  let ok = null; c.ev(`writeOwnField("teamVotes.p1","approve","vote")`).then(v=>ok=v);
  await clock.run(3000);
  assert.strictEqual(ok, true);
  assert.strictEqual(room(store).teamVotes.p1, "approve");
  if(kind==="standalone"){
    // 網路錯誤：先丟錯再成功
    const orig = c.ev("patchDoc"); let n = 0;
    c.ev(`(function(){ const o = patchDoc; let n=0; patchDoc = function(ref, flat){ if(n++<2) return Promise.reject(new Error("net")); return o(ref, flat); }; })()`);
    ok = null; c.ev(`writeOwnField("teamVotes.p1","reject","vote")`).then(v=>ok=v);
    await clock.run(3000); assert.strictEqual(ok, true); assert.strictEqual(room(store).teamVotes.p1, "reject");
  }
});

// ---------------- 同時送出 ----------------
const six = ["p1","p2","p3","p4","p5","p6"];
const roles6 = {p1:"merlin",p2:"assassin",p3:"morgana",p4:"percival",p5:"loyal",p6:"loyal"};
await test("阿瓦隆：6 人同時組隊投票 → 全部計入、只結算一次、沒有人被丟掉", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:six, room:{ phase:"vote", roles:roles6, leaderId:"p1", missionNo:1, round:1, teamSelection:["p1","p4"], rejectCount:0 } });
  const choices = {p1:"approve",p2:"reject",p3:"approve",p4:"approve",p5:"reject",p6:"approve"};
  const ps = six.map(id=> clients[id].ev(`doTeamVote(${JSON.stringify(choices[id])})`));
  void ps; await clock.run(8000);
  const r = room(store);
  assert.strictEqual(Object.keys(r.teamVotes).length, 6); assert.deepStrictEqual(r.teamVotes, choices);
  assert.strictEqual(r.phase, "voteresult"); assert.strictEqual(r.teamApproved, true);
  assert.strictEqual(store.writes(w=>w.path===roomPath(CODE) && w.data && w.data.phase==="voteresult").length, 1, "只該結算一次");
});
await test("阿瓦隆：同時投票時被反對（平票）→ 否決 rejectCount+1，且只結算一次", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:six, room:{ phase:"vote", roles:roles6, leaderId:"p1", missionNo:1, round:1, teamSelection:["p1","p4"], rejectCount:2 } });
  void (six.map((id,i)=> clients[id].ev(`doTeamVote(${i%2?'"approve"':'"reject"'})`)));
  await clock.run(8000);
  const r = room(store); assert.strictEqual(r.phase, "voteresult"); assert.strictEqual(r.teamApproved, false); assert.strictEqual(r.rejectCount, 3);
});
await test("阿瓦隆：4 位隊員同時出任務牌 → 全部計入、只結算一次", async ()=>{
  const team = ["p1","p2","p3","p5"];
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:six, room:{ phase:"mission", roles:roles6, leaderId:"p1", missionNo:3, round:1, teamSelection:team, missionResults:[{ok:true,fails:0},{ok:true,fails:0}] } });
  void (team.map(id=> clients[id].ev(`doMissionCard(${id==="p2"||id==="p3"?'"fail"':'"success"'})`)));
  await clock.run(8000);
  const r = room(store);
  assert.deepStrictEqual(r.missionVotes, {p1:"success",p2:"fail",p3:"fail",p5:"success"});
  assert.strictEqual(r.phase, "missionresult"); assert.strictEqual(r.missionResults.length, 3); assert.strictEqual(r.lastMissionFails, 2);
  assert.strictEqual(store.writes(w=>w.path===roomPath(CODE) && w.data && w.data.phase==="missionresult").length, 1);
});
await test("阿瓦隆：6 人同時按「我記住了」→ 6 個 ack 都在", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:six, room:{ phase:"reveal", roles:roles6, leaderId:"p1", missionNo:1, round:1 } });
  void (six.map(id=> clients[id].ev(`doAvalonAck()`)));
  await clock.run(3000);
  assert.deepStrictEqual(Object.keys(room(store).acks).sort(), six);
});
await test("只有一個：5 人同時送提示 → 4 個提示都計入、只結算一次進入 guess", async ()=>{
  const ids = ["p1","p2","p3","p4","p5"];
  const { clock, store, clients } = await setup({ gameType:"justone", ids, room:{ phase:"clue", round:1, deck:["蘋果","香蕉","西瓜"], deckIndex:0, guesserOrder:ids, guesserId:"p1", clueEligible:["p2","p3","p4","p5"], hints:{}, settings:{totalRounds:13}, cardsUsed:0, score:0 } });
  const words = {p2:"水果",p3:"紅色",p4:"甜",p5:"樹"};
  void (["p2","p3","p4","p5"].map(id=> clients[id].ev(`joHintDraft=${JSON.stringify(words[id])}; doJoSubmitHint()`)));
  await clock.run(8000);
  const r = room(store);
  assert.deepStrictEqual(r.hints, words); assert.strictEqual(r.phase, "guess"); assert.strictEqual(r.validHints.length, 4);
  assert.strictEqual(store.writes(w=>w.path===roomPath(CODE) && w.data && w.data.phase==="guess").length, 1);
});
await test("狼人殺：2 隻狼同時投票 + 6 人同時白天投票 → 都計入、各只結算一次", async ()=>{
  const ids = ["w1","w2","a","b","c","d"];
  const rolesW = {w1:"wolf",w2:"wolf",a:"villager",b:"villager",c:"villager",d:"villager"};
  const { clock, store, clients } = await setup({ gameType:"werewolf", ids, each:(id)=>({alive:true}), room:{ phase:"night", nightStep:"wolf", round:1, roles:rolesW, settings:{roles:{}} } });
  void (["w1","w2"].map(id=> clients[id].ev(`doWolfVote("a")`)));
  await clock.run(6000);
  let r = room(store);
  assert.deepStrictEqual(r.wolfVotes, {w1:"a",w2:"a"}); assert.strictEqual(r.wolfTarget, "a");
  assert.strictEqual(r.phase, "daydeaths"); assert.deepStrictEqual(r.nightDeaths, ["a"]);
  assert.strictEqual(store.getDoc(playerPath(CODE,"a")).alive, false);
  // 白天投票：把房間直接設成 vote 階段
  store.patch(roomPath(CODE), d=>{ d.phase="vote"; d.voteTally={}; d.voteResult=null; });
  await clock.run(500);
  const alive = ["w1","w2","b","c","d"];
  void (alive.map(id=> clients[id].ev(`doVoteCast(${id==="w1"?'"b"':'"w1"'})`)));
  await clock.run(8000);
  r = room(store);
  assert.strictEqual(Object.keys(r.voteTally).length, 5);
  assert.strictEqual(r.voteResult.eliminatedId, "w1");
  assert.strictEqual(store.writes(w=>w.path===roomPath(CODE) && w.data && w.data.voteResult).length, 1, "只該結算一次");
  assert.strictEqual(store.getDoc(playerPath(CODE,"w1")).alive, false);
});
await test("機密代號：多個隊友同時翻牌 → 鎖讓它們依序處理，每次操作都不會被丟掉（最終都套用或明確失敗）", async ()=>{
  const ids = ["r1","r2","r3","b1","b2","b3"];
  const board = Array.from({length:25},(_,i)=>({word:"字"+i, color: i<9?"red":(i<17?"blue":(i<24?"neutral":"assassin")), revealed:false}));
  const { clock, store, clients } = await setup({ gameType:"codenames", ids, each:(id)=>({team:id[0]==="r"?"red":"blue"}), room:{ phase:"guess", round:1, board, spymasters:{red:"r1",blue:"b1"}, startTeam:"red", turnTeam:"red", clue:{word:"提示",num:3}, guessesLeft:4, clueLog:[{team:"red",word:"提示",num:3}], redLeft:9, blueLeft:8 } });
  // r2、r3 同時各翻一張自己隊的牌
  clients.r2.ev(`cnSel=0`); clients.r3.ev(`cnSel=1`);
  void ([clients.r2.ev(`doCnGuess()`), clients.r3.ev(`doCnGuess()`)]);
  await clock.run(8000);
  const r = room(store);
  assert.strictEqual(r.board[0].revealed, true); assert.strictEqual(r.board[1].revealed, true, "兩張都要翻開");
  assert.strictEqual(r.redLeft, 7);
  // 鎖已釋放：之後馬上還能再操作
  const rr = await clients.r2.ev(`withRoomLock(async()=>1)`); assert.strictEqual(rr.ok, true);
});

// ---------------- 在線狀態 / 房主 ----------------
await test("心跳：可見時每 ~12 秒寫 lastSeen；頁面隱藏不寫；回到前景/focus 立刻寫", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:["p1","p2"], each:(id)=>({lastSeen: 0, joinedAt: 5}) });
  const seen = ()=> store.getDoc(playerPath(CODE,"p1")).lastSeen;
  assert(seen() >= clock.now - 1000, "連上房間就應該先寫一次");
  const t1 = seen(); await clock.run(13000); const t2 = seen(); assert(t2 > t1, "12 秒後應該又寫了");
  const beats = store.writes(w=>w.op==="update" && w.path===playerPath(CODE,"p1") && w.data.lastSeen).length;
  clients.p1.setHidden(true); await clock.run(40000);
  assert.strictEqual(store.writes(w=>w.op==="update" && w.path===playerPath(CODE,"p1") && w.data.lastSeen).length, beats, "隱藏時不該寫入");
  clients.p1.setHidden(false); clients.p1.fire("visibilitychange"); await clock.run(100);
  assert(seen() >= clock.now - 200, "回前景立刻寫");
  const before = seen(); await clock.run(3000); clients.p1.fire("focus"); await clock.run(100); assert(seen() > before, "focus 立刻寫");
  clients.p1.fire("online"); clients.p1.fire("focus"); await clock.run(100);   // 同時觸發不會連寫兩次（2 秒內只寫一次）
});
await test("房主轉移：原房主離線 >40 秒 → 下一位最早加入的在線者；他回來就拿回；各端算出同一位", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:["p1","p2","p3"] });
  const H = id => clients[id].ev("currentHostId()");
  assert.deepStrictEqual(["p1","p2","p3"].map(H), ["p1","p1","p1"]);
  clients.p1.setHidden(true);            // 房主把頁面關掉/鎖屏：不再有心跳
  await clock.run(30000); assert.strictEqual(H("p2"), "p1", "30 秒還沒到 40 秒門檻");
  await clock.run(15000);
  assert.strictEqual(H("p2"), "p2"); assert.strictEqual(H("p3"), "p2"); assert.strictEqual(clients.p2.ev("isHostNow()"), true); assert.strictEqual(clients.p3.ev("isHostNow()"), false);
  clients.p1.setHidden(false); clients.p1.fire("visibilitychange"); await clock.run(3000);
  assert.deepStrictEqual(["p1","p2","p3"].map(H), ["p1","p1","p1"]);
});
await test("房主轉移不會來回抖動：房主偶爾漏一兩拍（網路慢）時房主不變", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:["p1","p2"] });
  const seq = [];
  for(let i=0;i<10;i++){
    clients.p1.setHidden(i%3===1);      // 隱藏 ~12~24 秒就恢復，永遠沒超過 40 秒
    await clock.run(14000);
    seq.push(clients.p2.ev("currentHostId()"));
  }
  assert(seq.every(h=>h==="p1"), seq.join(","));
});
await test("離線標籤：大廳與遊戲畫面都顯示「離線」，自己不顯示", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:["p1","p2","p3"], connect:["p1","p2"] });
  goOffline(store, clock, "p3"); await clock.run(6000);
  assert(clients.p1.html().includes("離線"), "大廳要有離線標籤");
  assert(!clients.p1.html().includes("離線</span>") || clients.p1.html().split("離線</span>").length===2, "只有 p3 一個");
  store.patch(roomPath(CODE), d=>{ d.phase="ended"; d.roles={p1:"merlin",p2:"assassin",p3:"loyal"}; d.winner="good"; d.winReason="assassinMiss"; });
  await clock.run(6000);
  assert(clients.p1.html().includes("offtag"), "結束畫面的玩家列表也要有");
});
await test("只有 lastSeen 變動不會重畫畫面；誰在線的集合變了才重畫", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:["p1","p2"] });
  const c = clients.p1;
  c.ev(`globalThis.__r = 0; (function(){ const o = render; render = function(){ globalThis.__r++; return o.apply(this, arguments); }; })()`);
  await clock.run(1000);
  const base = c.ev("__r");
  store.patch(playerPath(CODE,"p2"), d=>{ d.lastSeen += 5; });
  await clock.run(1000);
  assert.strictEqual(c.ev("__r"), base, "lastSeen 微調不該重畫");
  store.patch(playerPath(CODE,"p2"), d=>{ d.lastSeen -= 200000; });   // p2 變離線
  await clock.run(6000);
  assert(c.ev("__r") > base, "在線集合變了要重畫");
});
await test("重新整理後用存下來的身分回到房間（resume）：不用重新加入，並馬上送心跳", async ()=>{
  const clock = new Clock(), store = new Store(clock, kind);
  seedRoom(store, CODE, { gameType:"avalon", phase:"lobby" }); seedPlayers(store, CODE, ["p1","p2"]);
  store.patch(playerPath(CODE,"p2"), d=>{ d.lastSeen = clock.now - 200000; });
  const c = createClient({ file, kind, store, clock, session:{ telepathy_identity_v1: JSON.stringify({code:CODE, playerId:"p2", name:"P2"}) } });
  await clock.run(1500);
  assert.strictEqual(c.ev("identity && identity.playerId"), "p2");
  assert.strictEqual(c.ev("playersData.length"), 2); assert.strictEqual(c.ev("roomData.gameType"), "avalon");
  assert(store.getDoc(playerPath(CODE,"p2")).lastSeen >= clock.now - 1600, "回來就送心跳");
  assert(!c.html().includes("已不在房間"));
});

// ---------------- 看門狗：離線玩家造成的卡關 ----------------
const five = ["p1","p2","p3","p4","p5"];
const roles5 = {p1:"merlin",p2:"assassin",p3:"morgana",p4:"percival",p5:"loyal"};
await test("阿瓦隆看門狗：隊長離線 → 自動換下一位在線隊長", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:five, connect:["p1","p3","p4","p5"], room:{ phase:"team", roles:roles5, leaderId:"p2", missionNo:1, round:1 } });
  goOffline(store, clock, "p2");
  await clock.run(15000);
  assert.strictEqual(room(store).leaderId, "p3");
});
await test("阿瓦隆：房主兼隊長離線（關頁面）→ 新房主的看門狗換隊長，新房主能按「繼續」", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:five, connect:["p2","p3","p4","p5"], room:{ phase:"team", roles:roles5, leaderId:"p1", missionNo:1, round:1 } });
  goOffline(store, clock, "p1");
  await clock.run(15000);
  assert.strictEqual(room(store).leaderId, "p2");
  assert.strictEqual(clients.p2.ev("isHostNow()"), true);
  store.patch(roomPath(CODE), d=>{ d.phase="voteresult"; d.teamVotes={p2:"approve",p3:"approve",p4:"approve",p5:"reject"}; d.teamApproved=true; d.teamSelection=["p2","p3"]; });
  await clock.run(1500);
  assert(clients.p2.html().includes("continueBtn"), "新房主要看得到繼續按鈕");
  assert(!clients.p3.html().includes("continueBtn"));
  clients.p2.ev("doAvalonContinueVote()"); await clock.run(2000);
  assert.strictEqual(room(store).phase, "mission");
});
await test("阿瓦隆：有人離線沒投票 → 在線的人投完就結算（不卡住）", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:five, connect:["p1","p2","p3","p4"], room:{ phase:"vote", roles:roles5, leaderId:"p1", missionNo:1, round:1, teamSelection:["p1","p4"] } });
  goOffline(store, clock, "p5");
  void (["p1","p2","p3","p4"].map(id=> clients[id].ev(`doTeamVote("approve")`)));
  await clock.run(8000);
  assert.strictEqual(room(store).phase, "voteresult"); assert.strictEqual(room(store).teamApproved, true);
});
await test("阿瓦隆看門狗：在線的人早就投完但沒人結算 → 房主補結算；出任務牌同理", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:five, connect:["p1","p2","p3","p4"], room:{ phase:"vote", roles:roles5, leaderId:"p1", missionNo:1, round:1, teamSelection:["p1","p4"], teamVotes:{p1:"approve",p2:"reject",p3:"reject",p4:"reject"} } });
  goOffline(store, clock, "p5");
  await clock.run(12000);
  assert.strictEqual(room(store).phase, "voteresult"); assert.strictEqual(room(store).teamApproved, false); assert.strictEqual(room(store).rejectCount, 1);
  store.patch(roomPath(CODE), d=>{ d.phase="mission"; d.teamSelection=["p1","p5"]; d.missionVotes={p1:"success"}; d.missionResults=[]; });
  await clock.run(12000);
  assert.strictEqual(room(store).phase, "missionresult"); assert.strictEqual(room(store).missionResults.length, 1); assert.strictEqual(room(store).missionResults[0].ok, true);
});
await test("阿瓦隆看門狗：刺客離線 → 當作沒刺中，好人獲勝", async ()=>{
  const { clock, store, clients } = await setup({ gameType:"avalon", ids:five, connect:["p1","p3","p4","p5"], room:{ phase:"assassin", roles:roles5, leaderId:"p1", missionNo:4, round:1 } });
  goOffline(store, clock, "p2");
  await clock.run(15000);
  const r = room(store); assert.strictEqual(r.phase, "ended"); assert.strictEqual(r.winner, "good"); assert.strictEqual(r.winReason, "assassinMiss");
});
await test("機密代號看門狗：指揮官離線 → 換同隊在線隊友；整隊猜測者離線 → 跳過回合", async ()=>{
  const ids = ["r1","r2","r3","b1","b2","b3"];
  const board = Array.from({length:25},(_,i)=>({word:"字"+i, color: i<9?"red":(i<17?"blue":(i<24?"neutral":"assassin")), revealed:false}));
  const base = { round:1, board, spymasters:{red:"r1",blue:"b1"}, startTeam:"red", turnTeam:"red", clue:null, guessesLeft:0, clueLog:[], redLeft:9, blueLeft:8 };
  let t = await setup({ gameType:"codenames", ids, connect:["b1","b2","b3","r2","r3"], each:(id)=>({team:id[0]==="r"?"red":"blue"}), room:{ ...base, phase:"clue" } });
  goOffline(t.store, t.clock, "r1");
  await t.clock.run(15000);
  assert.strictEqual(room(t.store).spymasters.red, "r2", "換成同隊最早加入的在線隊友");
  assert.strictEqual(room(t.store).phase, "clue");
  // 整隊猜測者都離線（只剩指揮官在線）→ 猜測階段跳過
  t = await setup({ gameType:"codenames", ids, connect:["r1","b1","b2","b3"], each:(id)=>({team:id[0]==="r"?"red":"blue"}), room:{ ...base, phase:"guess", clue:{word:"提示",num:2}, guessesLeft:3 } });
  goOffline(t.store, t.clock, "r2"); goOffline(t.store, t.clock, "r3");
  await t.clock.run(15000);
  const r = room(t.store); assert.strictEqual(r.phase, "clue"); assert.strictEqual(r.turnTeam, "blue");
  // 整隊離線（只剩對隊）：輪到沒有人的隊 → 跳過
  t = await setup({ gameType:"codenames", ids, connect:["b1","b2","b3"], each:(id)=>({team:id[0]==="r"?"red":"blue"}), room:{ ...base, phase:"clue" } });
  ["r1","r2","r3"].forEach(id=>goOffline(t.store, t.clock, id));
  await t.clock.run(15000);
  assert.strictEqual(room(t.store).turnTeam, "blue");
});
await test("只有一個看門狗：猜詞者離線（且是房主）→ 這張牌當跳過、換下一位在線猜詞者", async ()=>{
  const ids = ["p1","p2","p3","p4"];
  const rm = { phase:"clue", round:1, deck:["蘋果","香蕉","西瓜","梨子"], deckIndex:0, guesserOrder:ids, guesserId:"p1", clueEligible:["p2","p3","p4"], hints:{}, settings:{totalRounds:13}, cardsUsed:0, score:0, joLog:[] };
  const { clock, store, clients } = await setup({ gameType:"justone", ids, connect:["p2","p3","p4"], room:rm });
  goOffline(store, clock, "p1");
  await clock.run(15000);
  const r = room(store);
  assert.strictEqual(r.round, 2); assert.strictEqual(r.guesserId, "p2"); assert.strictEqual(r.cardsUsed, 1); assert.strictEqual(r.joLog.length, 1);
  assert.deepStrictEqual(r.clueEligible, ["p3","p4"]); assert.strictEqual(r.phase, "clue");
});
await test("只有一個：提示者離線 → 在線的人都交了就進猜測；guess 階段猜詞者離線 → 跳過", async ()=>{
  const ids = ["p1","p2","p3","p4"];
  const rm = { phase:"clue", round:1, deck:["蘋果","香蕉","西瓜","梨子"], deckIndex:0, guesserOrder:ids, guesserId:"p1", clueEligible:["p2","p3","p4"], hints:{p2:"水果"}, settings:{totalRounds:13}, cardsUsed:0, score:0, joLog:[] };
  const { clock, store, clients } = await setup({ gameType:"justone", ids, connect:["p1","p2","p3"], room:rm });
  goOffline(store, clock, "p4");
  clients.p3.ev(`joHintDraft="紅色"; doJoSubmitHint()`); await clock.run(8000);
  assert.strictEqual(room(store).phase, "guess"); assert.strictEqual(room(store).validHints.length, 2);
  clients.p1.setHidden(true); goOffline(store, clock, "p1"); await clock.run(15000);
  assert.strictEqual(room(store).guesserId, "p2"); assert.strictEqual(room(store).phase, "clue");
});
await test("狼人殺看門狗：醫生/預言家離線 → 夜晚步驟自動跳過，狼人投完直接進白天", async ()=>{
  const ids = ["w1","g","s","v1","v2","v3"];
  const rolesW = {w1:"wolf",g:"guard",s:"seer",v1:"villager",v2:"villager",v3:"villager"};
  const { clock, store, clients } = await setup({ gameType:"werewolf", ids, connect:["w1","v1","v2","v3"], each:()=>({alive:true}), room:{ phase:"night", nightStep:"guard", round:1, roles:rolesW, settings:{roles:{seer:true, guard:true}} } });
  goOffline(store, clock, "g"); goOffline(store, clock, "s");
  await clock.run(12000);
  assert.strictEqual(room(store).nightStep, "wolf", "醫生離線 → 跳到狼人");
  clients.w1.ev(`doWolfVote("v1")`); await clock.run(12000);
  const r = room(store);
  assert.strictEqual(r.phase, "daydeaths", "預言家離線 → 跳過並結算"); assert.deepStrictEqual(r.nightDeaths, ["v1"]);
  assert.strictEqual(store.getDoc(playerPath(CODE,"v1")).alive, false);
});
await test("狼人殺看門狗：活狼全離線 → 今晚沒人被殺；女巫離線 → 跳過；獵人離線 → 不開槍；投票只等在線的人", async ()=>{
  const ids = ["w1","wi","h","v1","v2"];
  const rolesW = {w1:"wolf",wi:"witch",h:"hunter",v1:"villager",v2:"villager"};
  let t = await setup({ gameType:"werewolf", ids, connect:["v1","v2","h"], each:()=>({alive:true}), room:{ phase:"night", nightStep:"wolf", round:1, roles:rolesW, nightDeaths:[], settings:{roles:{witch:true,hunter:true}} } });
  goOffline(t.store, t.clock, "w1"); goOffline(t.store, t.clock, "wi");
  await t.clock.run(20000);
  let r = room(t.store);
  assert.strictEqual(r.phase, "daydeaths"); assert.deepStrictEqual(r.nightDeaths, []); assert.strictEqual(r.wolfTarget, null);
  // 獵人離線
  t = await setup({ gameType:"werewolf", ids, connect:["v1","v2","wi"], each:()=>({alive:true}), room:{ phase:"hunter", round:1, roles:rolesW, hunterQueue:["h"], hunterNextPhase:"daydeaths", nightDeaths:["h"], settings:{roles:{witch:true,hunter:true}} } });
  t.store.patch(playerPath(CODE,"h"), d=>{ d.alive=false; });
  goOffline(t.store, t.clock, "h"); goOffline(t.store, t.clock, "w1");
  await t.clock.run(15000);
  r = room(t.store); assert.strictEqual(r.phase, "daydeaths"); assert.deepStrictEqual(r.hunterQueue, []);
  // 白天投票：離線的人沒投
  t = await setup({ gameType:"werewolf", ids, connect:["w1","v1","v2","wi"], each:()=>({alive:true}), room:{ phase:"vote", round:1, roles:rolesW, voteTally:{}, settings:{roles:{witch:true,hunter:true}} } });
  goOffline(t.store, t.clock, "h");
  void (["w1","v1","v2","wi"].map(id=> t.clients[id].ev(`doVoteCast("w1")`)));
  await t.clock.run(10000);
  r = room(t.store); assert.strictEqual(r.voteResult.eliminatedId, "w1"); assert.strictEqual(r.voteTally.h, "abstain");
});
await test("接力畫猜看門狗：畫家離線 → 跳過他的回合；猜謎者離線 → 直接公布答案", async ()=>{
  const ids = ["a","b","c","d"];
  const rm = { phase:"drawing", round:1, currentGuesserId:"a", currentPrompt:"貓在廚房跳舞", drawOrder:["b","c","d"], currentDrawerIndex:0, roundEndAt: 1700000000000 + 600000, settings:{turnSeconds:12,totalRounds:6}, guesserGuess:null };
  let t = await setup({ gameType:"draw", ids, connect:["a","c","d"], room:rm });
  goOffline(t.store, t.clock, "b");
  await t.clock.run(15000);
  assert.strictEqual(room(t.store).currentDrawerIndex, 1, "跳過離線的畫家 b");
  t.store.patch(roomPath(CODE), d=>{ d.phase="guessing"; });
  goOffline(t.store, t.clock, "a");
  await t.clock.run(15000);
  const r = room(t.store); assert.strictEqual(r.phase, "reveal"); assert.strictEqual(r.guesserGuess, null);
});
await test("誰最可能 / 心電感應：離線的人不用等，在線的人都投完立刻結算（不等時間到）", async ()=>{
  const ids = ["p1","p2","p3"];
  let t = await setup({ gameType:"telepathy", ids, connect:["p1","p2"], room:{ phase:"question", round:1, currentQuestion:{q:"測試？", options:["a","b","c","d"]}, roundEndAt: 1700000000000 + 600000, settings:{duration:15,targetStrikes:3,mode:"normal"}, revealLog:[], losers:[], usedQKeys:[] } });
  goOffline(t.store, t.clock, "p3"); await t.clock.run(6000);
  void ([t.clients.p1.ev(`castVote("A")`), t.clients.p2.ev(`castVote("A")`)]);
  await t.clock.run(8000);
  let r = room(t.store);
  assert.strictEqual(r.phase, "reveal"); assert.deepStrictEqual(r.revealLog[0].noAnswerIds, ["p3"]);
  t = await setup({ gameType:"mostlikely", ids, connect:["p1","p2"], room:{ phase:"question", round:1, currentPrompt:"最愛遲到", currentBaseId:"p1", roundEndAt: 1700000000000 + 600000, settings:{duration:25,totalRounds:8}, revealLog:[] } });
  goOffline(t.store, t.clock, "p3"); await t.clock.run(6000);
  t.clients.p1.ev(`mlRankOrder=["p2","p3","p1"]; mlRankOrderRound=1`); t.clients.p2.ev(`mlRankOrder=["p2","p3","p1"]; mlRankOrderRound=1`);
  void ([t.clients.p1.ev(`submitMLRanking()`), t.clients.p2.ev(`submitMLRanking()`)]);
  await t.clock.run(8000);
  r = room(t.store); assert.strictEqual(r.phase, "reveal"); assert.strictEqual(r.revealLog.length, 1);
  assert.strictEqual(t.store.getDoc(playerPath(CODE,"p2")).mlScore, 3);
});
await test("房主關頁面不會卡住：七種模式的結束畫面，新房主（次早在線者）看得到「再玩一局」", async ()=>{
  const ids = ["p1","p2","p3"];
  const board = Array.from({length:25},(_,i)=>({word:"字"+i, color: i<9?"red":(i<17?"blue":(i<24?"neutral":"assassin")), revealed:false}));
  const variants = {
    telepathy:{ phase:"ended", losers:[{id:"p3",name:"P3"}], revealLog:[] },
    mostlikely:{ phase:"ended", revealLog:[], round:1 },
    draw:{ phase:"ended", round:2 },
    werewolf:{ phase:"ended", roles:{p1:"wolf",p2:"villager",p3:"villager"}, winner:"wolf" },
    avalon:{ phase:"ended", roles:{p1:"merlin",p2:"assassin",p3:"loyal"}, winner:"good", winReason:"assassinMiss" },
    codenames:{ phase:"ended", board, spymasters:{red:"p1",blue:"p2"}, winner:"red", winReason:"allFound", turnTeam:"red" },
    justone:{ phase:"ended", deck:["a"], score:3, cardsUsed:13, joLog:[], guesserOrder:ids, settings:{totalRounds:13} },
  };
  for(const gt of Object.keys(variants)){
    const { clock, store, clients } = await setup({ gameType:gt, ids, connect:["p2","p3"], each:(id)=>({alive:true, team:id==="p1"?"red":"blue"}), room:variants[gt] });
    goOffline(store, clock, "p1"); await clock.run(8000);
    assert(clients.p2.html().includes("rematchBtn"), gt+"：新房主要有再玩一局");
    assert(!clients.p3.html().includes("rematchBtn"), gt+"：其他人不該有");
  }
});

summary(kind);
})().catch(e=>{ console.error(e); process.exit(1); });
