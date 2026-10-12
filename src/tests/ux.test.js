// 體驗功能測試：提示音轉換偵測、戰績記錄（冪等 + 各模式勝負）、第一次教學旗標、設定持久化（含 localStorage 丟例外）。
// 用法：node tests/ux.test.js dist/index.html dist/artifact.html
const fs = require("fs"), vm = require("vm"), assert = require("assert");
let pass = 0, fail = 0;
function test(name, fn){ try{ fn(); pass++; console.log("  ok  ", name); }catch(e){ fail++; console.log("  FAIL", name, "\n      ", e && e.stack || e); } }

function makeCtx(file, opts){
  opts = opts || {};
  const html = fs.readFileSync(file, "utf8");
  const script = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)][0][1];
  const els = {};
  const attrs = {};
  const mk = id => ({ id, innerHTML:"", style:{}, classList:{add(){},remove(){}}, textContent:"", setAttribute(k,v){ this.attrs=this.attrs||{}; this.attrs[k]=v; }, attrs:{} });
  const any = new Proxy(function(){}, { get:(t,p)=> p==="then" ? undefined : any, apply:()=>any });
  const doc = { visibilityState: "visible", hidden:false, activeElement:null,
    getElementById: id => els[id] || (els[id] = mk(id)), querySelectorAll: ()=>[], querySelector: ()=>null,
    addEventListener(){}, documentElement:{ setAttribute(k,v){ attrs[k]=v; } } };
  const lsStore = opts.store || {};
  const localStorage = opts.throwing
    ? { getItem(){ throw new Error("blocked"); }, setItem(){ throw new Error("blocked"); }, removeItem(){ throw new Error("blocked"); } }
    : { getItem:k=> (k in lsStore ? lsStore[k] : null), setItem(k,v){ lsStore[k]=String(v); }, removeItem(k){ delete lsStore[k]; } };
  const ctx = vm.createContext({ console, setTimeout(){return 0}, clearTimeout(){}, setInterval(){return 0}, clearInterval(){},
    document: doc, localStorage, sessionStorage:{getItem:()=>null,setItem(){}}, navigator:{}, location:{origin:"x",pathname:"/",search:"",protocol:"https:",hostname:"x"},
    AbortController, crypto: require("crypto").webcrypto, Uint32Array, confirm:()=>true, Date,
    firebase:{apps:[1], initializeApp(){}, firestore:()=>any} });
  ctx.window = ctx; ctx.addEventListener = ()=>{};
  if(/artifact/.test(file)){ delete ctx.firebase; ctx.window.claude = { use: async()=>any }; }
  vm.runInContext(script, ctx);
  ctx.__els = els; ctx.__attrs = attrs; ctx.__store = lsStore; ctx.__doc = doc;
  return ctx;
}
const run = (ctx, code) => { const r = vm.runInContext(code, ctx); return (r && typeof r==="object") ? JSON.parse(JSON.stringify(r)) : r; };   // 跨 realm：轉成一般物件才能 deepStrictEqual
const J = v => JSON.stringify(v);

function P(id, extra){ return Object.assign({id, name:id.toUpperCase(), joinedAt: id.charCodeAt(0), lastSeen: Date.now()}, extra||{}); }
const base = (gt, extra) => Object.assign({exists:true, gameType:gt, createdAt:111, lastActivityAt:Date.now()}, extra);

for(const file of process.argv.slice(2)){
  console.log("--", file);
  const C = () => makeCtx(file);

  test("提示音：重複相同快照不會再響，只有轉換才響（心電感應/誰最可能）", ()=>{
    const c = C();
    for(const gt of ["telepathy","mostlikely"]){
      run(c, "pgResetCue()");
      const ps = [P("a"),P("b")];
      const tick = rd => run(c, `pgCueTick(${J(rd)}, ${J(ps)}, "a", "R_${gt}")`);
      assert.deepStrictEqual(tick(base(gt,{phase:"lobby"})), []);          // 基準線
      assert.deepStrictEqual(tick(base(gt,{phase:"lobby"})), []);
      assert.deepStrictEqual(tick(base(gt,{phase:"question",round:1})), ["turn"]);
      assert.deepStrictEqual(tick(base(gt,{phase:"question",round:1})), []);   // 同一快照重複
      assert.deepStrictEqual(tick(base(gt,{phase:"question",round:1,lastActivityAt:5})), []);
      assert.deepStrictEqual(tick(base(gt,{phase:"reveal",round:1})), []);     // 揭曉音由動畫同步播，偵測器不重複響
      assert.deepStrictEqual(tick(base(gt,{phase:"question",round:2})), ["turn"]);
    }
  });
  test("提示音：第一次看到房間（含重新整理中途加入）只記基準，不響；暫時沒資料不重置基準", ()=>{
    const c = C();
    const ps = [P("a"),P("b")];
    const rd = base("telepathy",{phase:"question",round:3});
    assert.deepStrictEqual(run(c, `pgCueTick(${J(rd)}, ${J(ps)}, "a", "R")`), []);
    assert.deepStrictEqual(run(c, `pgCueTick(${J(rd)}, [], "a", "R")`), []);        // 玩家資料還沒進來
    assert.deepStrictEqual(run(c, `pgCueTick(${J(rd)}, ${J(ps)}, "a", "R")`), []);  // 回來後相同 → 不響
    assert.deepStrictEqual(run(c, `pgCueTick(${J(base("telepathy",{phase:"question",round:4}))}, ${J(ps)}, "a", "R")`), ["turn"]);
    assert.deepStrictEqual(run(c, `pgCueTick(${J(rd)}, ${J(ps)}, "a", "OTHER")`), []);   // 換房間 → 新基準
  });
  test("提示音：阿瓦隆 隊長/投票/任務/刺客/揭曉/勝負", ()=>{
    const c = C();
    const ps = ["a","b","c","d","e"].map(i=>P(i));
    const roles = {a:"merlin",b:"loyal",c:"assassin",d:"minion",e:"loyal"};
    const tick = (rd,me) => run(c, `pgCueTick(${J(rd)}, ${J(ps)}, "${me||"a"}", "AV")`);
    const av = x => base("avalon", Object.assign({roles, missionNo:1, rejectCount:0}, x));
    tick(av({phase:"reveal"}));
    assert.deepStrictEqual(tick(av({phase:"team", leaderId:"b"})), []);
    assert.deepStrictEqual(tick(av({phase:"vote", leaderId:"b", teamSelection:["a","b"], teamVotes:{}})), ["turn"]);
    assert.deepStrictEqual(tick(av({phase:"vote", leaderId:"b", teamSelection:["a","b"], teamVotes:{b:"approve"}})), []);
    assert.deepStrictEqual(tick(av({phase:"vote", leaderId:"b", teamSelection:["a","b"], teamVotes:{a:"approve"}})), []);   // 我已投
    assert.deepStrictEqual(tick(av({phase:"voteresult", teamSelection:["a","b"], teamVotes:{a:"approve"}})), ["reveal"]);
    assert.deepStrictEqual(tick(av({phase:"mission", teamSelection:["a","b"], missionVotes:{}})), ["turn"]);
    assert.deepStrictEqual(tick(av({phase:"missionresult"})), ["reveal"]);
    assert.deepStrictEqual(tick(av({phase:"team", missionNo:2, leaderId:"a"})), ["turn"]);          // 我是隊長
    assert.deepStrictEqual(tick(av({phase:"team", missionNo:2, leaderId:"a", lastActivityAt:9})), []);
  });
  test("提示音：阿瓦隆 刺客視角與結束（贏/輸）", ()=>{
    const c = C();
    const ps = ["a","b","c","d","e"].map(i=>P(i));
    const roles = {a:"merlin",b:"loyal",c:"assassin",d:"minion",e:"loyal"};
    const tick = (rd,me) => run(c, `pgCueTick(${J(rd)}, ${J(ps)}, "${me}", "AV2_${me}")`);
    const av = x => base("avalon", Object.assign({roles, missionNo:3, rejectCount:0}, x));
    tick(av({phase:"missionresult"}),"c");
    assert.deepStrictEqual(tick(av({phase:"assassin"}),"c"), ["turn"]);
    assert.deepStrictEqual(tick(av({phase:"ended", winner:"evil"}),"c"), ["success"]);
    tick(av({phase:"missionresult"}),"b");
    assert.deepStrictEqual(tick(av({phase:"ended", winner:"evil"}),"b"), ["fail"]);
    assert.deepStrictEqual(tick(av({phase:"ended", winner:"evil"}),"b"), []);
  });
  test("提示音：機密代號 指揮官給提示 / 猜測者猜測 / 對方回合不響 / 勝負", ()=>{
    const c = C();
    const ps = [P("a",{team:"red"}),P("b",{team:"red"}),P("c",{team:"blue"}),P("d",{team:"blue"})];
    const cn = x => base("codenames", Object.assign({spymasters:{red:"a",blue:"c"}, clueLog:[]}, x));
    const ctxs = {};   // 每個玩家各是一個用戶端（各自的基準線）
    const tick = (rd,me) => run(ctxs[me] || (ctxs[me] = C()), `pgCueTick(${J(rd)}, ${J(ps)}, "${me}", "CN")`);
    tick(cn({phase:"lobby"}),"a"); tick(cn({phase:"lobby"}),"b"); tick(cn({phase:"lobby"}),"c");
    assert.deepStrictEqual(tick(cn({phase:"clue", turnTeam:"red"}),"a"), ["turn"]);   // 紅隊指揮官
    assert.deepStrictEqual(tick(cn({phase:"clue", turnTeam:"red"}),"b"), []);          // 猜測者還在等
    assert.deepStrictEqual(tick(cn({phase:"clue", turnTeam:"red"}),"c"), []);          // 對隊
    assert.deepStrictEqual(tick(cn({phase:"guess", turnTeam:"red", clueLog:[{}]}),"b"), ["turn"]);
    assert.deepStrictEqual(tick(cn({phase:"guess", turnTeam:"red", clueLog:[{}], board:[1]}),"b"), []);   // 翻了牌但還是同一回合
    assert.deepStrictEqual(tick(cn({phase:"ended", winner:"red"}),"b"), ["success"]);
    assert.deepStrictEqual(tick(cn({phase:"ended", winner:"red"}),"c"), ["fail"]);
  });
  test("提示音：只有一個 / 接力畫猜 / 狼人殺", ()=>{
    const c = C();
    const ps = [P("a"),P("b"),P("c")];
    const tick = (rd,me,key) => run(c, `pgCueTick(${J(rd)}, ${J(ps)}, "${me}", "${key}")`);
    const jo = x => base("justone", Object.assign({round:1, deckIndex:0, guesserId:"a", clueEligible:["b","c"], hints:{}, settings:{totalRounds:13}, score:0}, x));
    tick(jo({phase:"lobby"}),"b","JO");
    assert.deepStrictEqual(tick(jo({phase:"clue"}),"b","JO"), ["turn"]);
    assert.deepStrictEqual(tick(jo({phase:"clue", hints:{b:"x"}}),"b","JO"), []);
    assert.deepStrictEqual(tick(jo({phase:"result", hints:{b:"x"}}),"b","JO"), ["reveal"]);
    tick(jo({phase:"clue"}),"a","JO2");
    assert.deepStrictEqual(tick(jo({phase:"guess"}),"a","JO2"), ["turn"]);
    assert.deepStrictEqual(tick(jo({phase:"ended", score:9, cardsUsed:13}),"a","JO2"), ["success"]);
    // draw
    const dr = x => base("draw", Object.assign({round:1, drawOrder:["b","c"], currentDrawerIndex:0, currentGuesserId:"a"}, x));
    tick(dr({phase:"lobby"}),"c","DR");
    assert.deepStrictEqual(tick(dr({phase:"drawing"}),"c","DR"), []);
    assert.deepStrictEqual(tick(dr({phase:"drawing", currentDrawerIndex:1}),"c","DR"), ["turn"]);
    assert.deepStrictEqual(tick(dr({phase:"guessing"}),"c","DR"), []);
    assert.deepStrictEqual(tick(dr({phase:"reveal"}),"c","DR"), ["reveal"]);
    // werewolf
    const roles = {a:"wolf", b:"seer", c:"villager"};
    const ww = x => base("werewolf", Object.assign({round:1, roles, wolfVotes:{}, voteTally:{}}, x));
    tick(ww({phase:"lobby"}),"b","WW");
    assert.deepStrictEqual(tick(ww({phase:"night", nightStep:"wolf"}),"b","WW"), []);
    assert.deepStrictEqual(tick(ww({phase:"night", nightStep:"seer"}),"b","WW"), ["turn"]);
    assert.deepStrictEqual(tick(ww({phase:"daydeaths"}),"b","WW"), ["reveal"]);
    assert.deepStrictEqual(tick(ww({phase:"vote"}),"b","WW"), ["turn"]);
    assert.deepStrictEqual(tick(ww({phase:"vote", voteTally:{b:"a"}}),"b","WW"), []);
    assert.deepStrictEqual(tick(ww({phase:"ended", winner:"wolf"}),"b","WW"), ["fail"]);
    tick(ww({phase:"vote"}),"a","WW2");
    assert.deepStrictEqual(tick(ww({phase:"ended", winner:"wolf"}),"a","WW2"), ["success"]);
  });
  test("cue()：關閉音效不響；分頁在背景不發聲（只有「輪到你」震動）；開啟時會響並震動", ()=>{
    const c = C();
    run(c, `globalThis.__beeps=[]; globalThis.__vibs=[]; beep=(f,d,t,l)=>__beeps.push(f); navigator.vibrate=p=>{__vibs.push(p);return true}; setSoundEnabled(true);`);
    assert.strictEqual(run(c, `cue("success")`), true);
    assert.ok(run(c, `__beeps.length`) >= 2); assert.strictEqual(run(c, `__vibs.length`), 1);
    run(c, `__beeps.length=0; __vibs.length=0; pgLastCueAt={}; document.visibilityState="hidden";`);
    assert.strictEqual(run(c, `cue("reveal")`), false);
    assert.strictEqual(run(c, `__beeps.length + __vibs.length`), 0);
    assert.strictEqual(run(c, `cue("turn")`), false);
    assert.strictEqual(run(c, `__beeps.length`), 0); assert.strictEqual(run(c, `__vibs.length`), 1);
    run(c, `document.visibilityState="visible"; pgLastCueAt={}; __beeps.length=0; setSoundEnabled(false);`);
    assert.strictEqual(run(c, `cue("fail")`), false); assert.strictEqual(run(c, `__beeps.length`), 0);
    run(c, `setSoundEnabled(true); pgLastCueAt={};`);
    assert.strictEqual(run(c, `cue("tick")`), true);
    assert.strictEqual(run(c, `cue("tick")`), false, "400ms 內同種提示不重複");
    assert.strictEqual(run(c, `cue("nope")`), false);
    assert.deepStrictEqual(run(c, `Object.keys(PG_CUES)`).sort(), ["fail","reveal","success","tick","turn"]);
  });
  test("倒數 tick：每個整數秒只響一次，只給還沒送出的人", ()=>{
    const c = C();
    const rd = base("telepathy",{phase:"question", round:2});
    const t = (rem, votes) => run(c, `pgCountdownTick(${J(rd)}, "a", ${J(votes||[])}, ${rem})`);
    assert.strictEqual(t(5), false);
    assert.strictEqual(t(2.9), true); assert.strictEqual(t(2.5), false); assert.strictEqual(t(1.9), true);
    assert.strictEqual(t(0.4), true); assert.strictEqual(t(0.2), false); assert.strictEqual(t(0), false);
    run(c, `pgCountdownKey=""`);
    assert.strictEqual(t(2.9, [{playerId:"a", round:2}]), false);
  });

  test("戰績：各模式勝負判定", ()=>{
    const c = C();
    const out = (rd, ps, me) => run(c, `pgOutcome(${J(rd)}, ${J(ps)}, "${me}")`);
    // 心電感應：沒被淘汰且扣分最少 = 勝
    const tp = [P("a",{strikes:0}),P("b",{strikes:2}),P("c",{strikes:3})];
    const t = base("telepathy",{phase:"ended", losers:[{id:"c",name:"C"}]});
    assert.strictEqual(out(t,tp,"a").win, true); assert.strictEqual(out(t,tp,"b").win, false); assert.strictEqual(out(t,tp,"c").win, false);
    // 誰最可能：最高分（>0）= 勝，並列都算
    const mp = [P("a",{mlScore:5}),P("b",{mlScore:5}),P("c",{mlScore:1})];
    const m = base("mostlikely",{phase:"ended"});
    assert.strictEqual(out(m,mp,"a").win, true); assert.strictEqual(out(m,mp,"b").win, true); assert.strictEqual(out(m,mp,"c").win, false);
    assert.strictEqual(out(m,[P("a",{mlScore:0})],"a").win, false);
    // 狼人殺 / 阿瓦隆 / 機密代號
    const w = base("werewolf",{phase:"ended", winner:"villager", roles:{a:"wolf", b:"seer", c:"villager"}});
    assert.strictEqual(out(w,[P("a"),P("b"),P("c")],"a").win, false); assert.strictEqual(out(w,[P("a"),P("b"),P("c")],"b").win, true);
    assert.strictEqual(out(Object.assign({},w,{winner:"wolf"}),[P("a"),P("b"),P("c")],"a").win, true);
    const av = base("avalon",{phase:"ended", winner:"good", roles:{a:"merlin", b:"minion"}});
    assert.strictEqual(out(av,[P("a"),P("b")],"a").win, true); assert.strictEqual(out(av,[P("a"),P("b")],"b").win, false);
    const cn = base("codenames",{phase:"ended", winner:"blue"});
    const cp = [P("a",{team:"red"}),P("b",{team:"blue"}),P("s")];
    assert.strictEqual(out(cn,cp,"a").win, false); assert.strictEqual(out(cn,cp,"b").win, true); assert.strictEqual(out(cn,cp,"s"), null, "旁觀者不計");
    // 合作遊戲：不算勝負
    assert.strictEqual(out(base("draw",{phase:"ended"}),[P("a")],"a").win, null);
    const jo = out(base("justone",{phase:"ended", score:8, settings:{totalRounds:13}}),[P("a")],"a");
    assert.strictEqual(jo.win, null); assert.strictEqual(jo.score, 8); assert.strictEqual(jo.total, 13);
    assert.strictEqual(out(base("telepathy",{phase:"question"}),[P("a")],"a"), null);
  });
  test("戰績：同一局只記一次（重畫、重新整理後再進來），再玩一局會再記；justone 最高分；旁觀者不記", ()=>{
    const store = {};
    let c = makeCtx(file, {store});
    const rec = (rd, ps, me) => run(c, `pgRecordGame(${J(rd)}, ${J(ps)}, "${me}", "ABCD", 1000)`);
    const ps = [P("a",{team:"red"}),P("b",{team:"blue"}),P("s")];
    const g1 = base("codenames",{phase:"ended", winner:"red", board:[{word:"甲"},{word:"乙"}]});
    assert.strictEqual(rec(g1,ps,"a"), true);
    assert.strictEqual(rec(g1,ps,"a"), false); assert.strictEqual(rec(g1,ps,"a"), false);
    c = makeCtx(file, {store});             // 模擬重新整理
    assert.strictEqual(rec(g1,ps,"a"), false, "重新整理後不重複");
    const g2 = base("codenames",{phase:"ended", winner:"blue", board:[{word:"丙"},{word:"丁"}]});
    assert.strictEqual(rec(g2,ps,"a"), true, "同房間再玩一局要再記一次");
    assert.strictEqual(rec(g2,ps,"s"), false, "旁觀者不記");
    assert.strictEqual(rec(Object.assign({},g2,{phase:"clue"}),ps,"a"), false, "還沒結束不記");
    const rows = run(c, `pgStatsRows()`);
    const cnRow = rows.find(r=>r.gt==="codenames");
    assert.strictEqual(cnRow.played, 2); assert.strictEqual(cnRow.wins, 1); assert.strictEqual(cnRow.rate, 50);
    // justone 最高分
    const jps = [P("a")];
    const j = (s, n) => base("justone",{phase:"ended", score:s, cardsUsed:13, deck:["x"+n], settings:{totalRounds:13}});
    rec(j(7,1),jps,"a"); rec(j(11,2),jps,"a"); rec(j(9,3),jps,"a");
    const jr = run(c, `pgStatsRows()`).find(r=>r.gt==="justone");
    assert.strictEqual(jr.played, 3); assert.strictEqual(jr.wins, 0); assert.deepStrictEqual(jr.best, {score:11,total:13}); assert.strictEqual(jr.rate, null);
    assert.ok(JSON.parse(store.pg_stats).codenames.lastPlayed === 1000);
    // 清除
    run(c, `pgStatsClear()`);
    assert.strictEqual(run(c, `pgStatsRows()`).every(r=>r.played===0), true);
    assert.strictEqual(run(c, `pgRecordGame(${J(g1)}, ${J(ps)}, "a", "ABCD", 5)`), true, "清除後可再記");
  });
  test("戰績：render 進入 ended 只記一次（走真正的 render 流程）", ()=>{
    const c = C();
    const ps = [P("a",{strikes:0, ready:true}),P("b",{strikes:1, ready:true})];
    run(c, `identity={code:"ZZZZ",playerId:"a",name:"A"}; playersData=${J(ps)}; roomData=${J(base("telepathy",{phase:"question",round:1,settings:{duration:15,targetStrikes:3}}))};`);
    run(c, `roomData=${J(base("telepathy",{phase:"ended",round:3,losers:[{id:"b",name:"B"}],revealLog:[{}]}))}; render(); render(); render();`);
    const r = run(c, `pgStatsRows()`).find(x=>x.gt==="telepathy");
    assert.strictEqual(r.played, 1); assert.strictEqual(r.wins, 1);
  });
  test("localStorage 丟例外：戰績/教學旗標/設定都退回記憶體，不崩潰", ()=>{
    const c = makeCtx(file, {throwing:true});
    assert.strictEqual(run(c, `soundEnabled`), true);
    run(c, `setSoundEnabled(false)`); assert.strictEqual(run(c, `soundEnabled`), false);
    run(c, `pgSetFontScale(2); pgSetColorblind(true)`);
    assert.strictEqual(run(c, `pgSettings.fs`), 2); assert.strictEqual(run(c, `pgSettings.cb`), true);
    assert.strictEqual(c.__attrs["data-fs"], "2"); assert.strictEqual(c.__attrs["data-cb"], "1");
    assert.strictEqual(run(c, `pgHelpSeen("avalon")`), false);
    run(c, `pgMarkHelpSeen("avalon")`); assert.strictEqual(run(c, `pgHelpSeen("avalon")`), true);
    assert.strictEqual(run(c, `pgRecordGame(${J(base("draw",{phase:"ended"}))}, ${J([P("a")])}, "a", "Q", 1)`), true);
    assert.strictEqual(run(c, `pgRecordGame(${J(base("draw",{phase:"ended"}))}, ${J([P("a")])}, "a", "Q", 1)`), false);
    assert.strictEqual(run(c, `pgStatsRows().find(r=>r.gt==="draw").played`), 1);
    run(c, `pgStatsClear()`); assert.strictEqual(run(c, `pgStatsRows().find(r=>r.gt==="draw").played`), 0);
    assert.doesNotThrow(()=> run(c, `render(); pgOpenOverlay("display"); pgOpenOverlay("stats"); pgCloseOverlay();`));
  });
  test("設定持久化：pg_sound / pg_fontscale / pg_cb 寫入與重新載入；舊的 telepathySound 沿用；壞資料用預設", ()=>{
    const store = {};
    let c = makeCtx(file, {store});
    assert.strictEqual(run(c, `soundEnabled`), true); assert.strictEqual(run(c, `pgSettings.fs`), 1); assert.strictEqual(run(c, `pgSettings.cb`), false);
    assert.strictEqual(c.__attrs["data-fs"], "1"); assert.strictEqual(c.__attrs["data-cb"], "0");
    run(c, `setSoundEnabled(false); pgSetFontScale(0); pgSetColorblind(true);`);
    assert.strictEqual(store.pg_sound, "off"); assert.strictEqual(store.pg_fontscale, "0"); assert.strictEqual(store.pg_cb, "1");
    c = makeCtx(file, {store});
    assert.strictEqual(run(c, `soundEnabled`), false); assert.strictEqual(run(c, `pgSettings.fs`), 0); assert.strictEqual(run(c, `pgSettings.cb`), true);
    c = makeCtx(file, {store:{telepathySound:"off"}});
    assert.strictEqual(run(c, `soundEnabled`), false);
    c = makeCtx(file, {store:{pg_fontscale:"99", pg_stats:"{{not json", pg_seen_help:"garbage"}});
    assert.strictEqual(run(c, `pgSettings.fs`), 1);
    assert.strictEqual(run(c, `pgStatsRows().every(r=>r.played===0)`), true);
    assert.strictEqual(run(c, `pgHelpSeen("telepathy")`), false);
  });
  test("第一次教學：每個遊戲大廳自動跳一次，之後（含重畫、重新整理）不再自動跳；手動 ❓ 仍可開", ()=>{
    const store = {};
    let c = makeCtx(file, {store});
    const ps = [P("a",{ready:true}),P("b",{ready:true})];
    for(const gt of ["telepathy","mostlikely","draw","werewolf","avalon","codenames","justone"]){
      run(c, `helpModalOpen=false; pgHelpAuto=false; identity={code:"LB${gt.slice(0,2).toUpperCase()}",playerId:"a",name:"A"}; playersData=${J(ps)}; roomData=${J(base(gt,{phase:"lobby",round:0}))};`);
      run(c, `render();`);
      assert.strictEqual(run(c, `helpModalOpen`), true, gt+" 第一次要自動跳");
      assert.ok(c.__els.app.innerHTML.includes("玩法說明"), gt+" 說明內容");
      run(c, `helpModalOpen=false; render(); render();`);
      assert.strictEqual(run(c, `helpModalOpen`), false, gt+" 重畫不會再跳");
      assert.strictEqual(run(c, `pgHelpSeen("${gt}")`), true);
    }
    assert.deepStrictEqual(Object.keys(JSON.parse(store.pg_seen_help)).sort(), ["avalon","codenames","draw","justone","mostlikely","telepathy","werewolf"]);
    c = makeCtx(file, {store});            // 重新整理
    run(c, `identity={code:"LBTE",playerId:"a",name:"A"}; playersData=${J(ps)}; roomData=${J(base("telepathy",{phase:"lobby",round:0}))}; render();`);
    assert.strictEqual(run(c, `helpModalOpen`), false);
    run(c, `helpModalOpen=true; render();`); assert.ok(c.__els.app.innerHTML.includes("玩法說明"));
  });
  test("第一次教學：遊戲進行中不會因為重畫彈出", ()=>{
    const c = C();
    const ps = [P("a",{team:"red"}),P("b",{team:"blue"})];
    run(c, `identity={code:"PLAY",playerId:"a",name:"A"}; playersData=${J(ps)}; roomData=${J(base("codenames",{phase:"guess",turnTeam:"red",board:[],clueLog:[],spymasters:{red:"b",blue:"x"}}))}; helpModalOpen=false; render(); render();`);
    assert.strictEqual(run(c, `helpModalOpen`), false);
  });
  test("顯示設定 / 戰績彈窗內容", ()=>{
    const c = C();
    run(c, `pgOpenOverlay("display")`);
    const html = c.__els.pgOverlay.innerHTML;
    assert.ok(html.includes("字體大小") && html.includes("色盲友善") && html.includes("音效與震動"));
    if(/index/.test(file)) assert.ok(html.includes("加到主畫面") && html.includes("安裝應用程式"));
    else assert.ok(!html.includes("加到主畫面"), "Artifact 版不該有安裝提示");
    run(c, `pgOpenOverlay("stats")`);
    assert.ok(c.__els.pgOverlay.innerHTML.includes("只存在這支手機") && c.__els.pgOverlay.innerHTML.includes("清除戰績"));
  });
}
console.log(`\n${pass} 通過, ${fail} 失敗`);
process.exit(fail ? 1 : 0);
