// 房間密碼（選填）測試。用法：node tests/password.test.js dist/index.html standalone | dist/artifact.html artifact
const assert = require("assert");
const L = require("./lib");
const { Clock, Store, createClient, seedPlayers, seedRoom, roomPath, playerPath, test, summary } = L;
const [file, kind] = process.argv.slice(2);

const mk = () => { const clock = new Clock(), store = new Store(clock, kind); const c = createClient({ file, kind, store, clock }); return { clock, store, c }; };
const players = (store, code) => store.listCol(`${L.ROOT}/${code}/players`);
const rooms = store => [...store.docs.keys()].filter(k=>/^telepathyrooms\/[^/]+$/.test(k));
async function create(t, { pw, game, name }){
  t.c.ev(`homeTab="create"; homeName=${JSON.stringify(name||"房主")}; homePassword=${JSON.stringify(pw)}; homeGameType=${JSON.stringify(game||"telepathy")}; joinError="";`);
  await t.c.ev(`doCreate()`); await t.clock.run(300);
}
async function join(t, { code, pw, name }){
  t.c.ev(`identity=null; homeTab="join"; homeName=${JSON.stringify(name||"客人")}; homeCode=${JSON.stringify(code)}; homePassword=${JSON.stringify(pw)}; joinError="";`);
  await t.c.ev(`doJoin()`); await t.clock.run(300);
  return t.c.ev(`joinError`);
}
const ERR = "這個房間需要密碼，或密碼不正確";

(async ()=>{
console.log(`== ${kind} password ==`);
for(const game of ["telepathy","mostlikely","draw","werewolf","avalon","codenames","justone"]){
  await test(`建房 ${game}：有密碼 → room.password 為字串，大廳顯示 🔒 與密碼`, async ()=>{
    const t = mk(); await create(t, { pw:"1234", game });
    const [rp] = rooms(t.store); const rd = t.store.getDoc(rp);
    assert.strictEqual(rd.gameType, game); assert.strictEqual(rd.password, "1234");
    const h = t.c.html(); assert(h.includes("🔒")); assert(h.includes("密碼：")); assert(h.includes("1234"));
  });
}
await test("建房：沒填 → password 為 null（不是 undefined），大廳沒有 🔒", async ()=>{
  for(const pw of ["", "   "]){
    const t = mk(); await create(t, { pw });
    const rd = t.store.getDoc(rooms(t.store)[0]);
    assert(Object.prototype.hasOwnProperty.call(rd, "password")); assert.strictEqual(rd.password, null);
    assert(!t.c.html().includes("🔒")); assert(!t.c.html().includes("密碼："));
  }
});
await test("建房：格式不對 → 「密碼要 4 位數字」且不建房", async ()=>{
  for(const pw of ["12","123","12345","abcd","12a4","１２３４","12 4"]){
    const t = mk(); await create(t, { pw });
    assert.strictEqual(t.c.ev(`joinError`), "密碼要 4 位數字", pw);
    assert.strictEqual(rooms(t.store).length, 0, pw); assert.strictEqual(t.c.ev(`identity`), null);
  }
});
await test("建房頁與加入頁有密碼輸入欄（numeric, maxlength 4）", async ()=>{
  const t = mk(); t.c.ev(`homeTab="create"; render();`);
  let h = t.c.html(); assert(h.includes("房間密碼（選填，4 位數字）")); assert(/id="passwordInput"[^>]*inputmode="numeric"[^>]*maxlength="4"/.test(h));
  t.c.ev(`homeTab="join"; render();`); h = t.c.html();
  assert(h.includes("房間密碼（若有）")); assert(/id="passwordInput"[^>]*inputmode="numeric"[^>]*maxlength="4"/.test(h));
});
await test("加入：對的密碼成功；錯的 / 空的 → 錯誤訊息且不建立玩家文件", async ()=>{
  const t = mk(); seedRoom(t.store, "PW01", { password:"4321" }); seedPlayers(t.store, "PW01", ["h"]);
  for(const pw of ["", "0000", "432", "43210", "  "]){
    assert.strictEqual(await join(t, { code:"PW01", pw }), ERR, JSON.stringify(pw));
    assert.strictEqual(players(t.store, "PW01").length, 1); assert.strictEqual(t.c.ev(`identity`), null);
  }
  assert.strictEqual(t.store.writes(w=>w.op==="set" && w.path.startsWith(playerPath("PW01","")) ).length, 0);
  assert.strictEqual(await join(t, { code:"PW01", pw:"4321" }), "");
  assert.strictEqual(players(t.store, "PW01").length, 2); assert.strictEqual(t.c.ev(`identity.code`), "PW01");
  assert(t.c.html().includes("4321"));        // 加入者在大廳也看得到密碼
  assert(t.c.html().includes("🔒"));
});
await test("加入：沒有密碼的房間（null 與舊房間無此欄位）不需要密碼", async ()=>{
  for(const extra of [{ password:null }, {}]){
    const t = mk(); seedRoom(t.store, "OLD1", extra);
    if(!("password" in extra)) t.store.patch(roomPath("OLD1"), d=>{ delete d.password; });
    seedPlayers(t.store, "OLD1", ["h"]);
    assert.strictEqual(await join(t, { code:"OLD1", pw:"" }), "");
    assert.strictEqual(players(t.store, "OLD1").length, 2);
    assert(!t.c.html().includes("🔒"));
  }
});
await test("自己建的有密碼房間：重新整理（sessionStorage 身分）不用密碼就能回到房間", async ()=>{
  const t = mk(); await create(t, { pw:"7777" });
  const id = t.c.ev(`JSON.stringify(identity)`); const code = JSON.parse(id).code;
  const c2 = createClient({ file, kind, store:t.store, clock:t.clock, session:{ [t.c.ev(`LS_KEY`)]: id } });
  await t.clock.run(2000);
  assert.strictEqual(c2.ev(`identity.code`), code);
  c2.ev(`homePassword=""`); await t.clock.flush();
  await c2.connect(code, JSON.parse(id).playerId, "房主"); await t.clock.run(500);
  assert.strictEqual(players(t.store, code).length, 1);
  assert(c2.html().includes("7777"));
});
await test("一般 connectRoom（已加入者）不檢查密碼；雙人：房主與朋友在大廳都看到密碼", async ()=>{
  const t = mk(); await create(t, { pw:"2468" });
  const code = t.c.ev(`identity.code`);
  const t2 = { clock:t.clock, store:t.store, c:createClient({ file, kind, store:t.store, clock:t.clock }) };
  assert.strictEqual(await join(t2, { code, pw:"9999" }), ERR);
  assert.strictEqual(await join(t2, { code, pw:"2468" }), "");
  await t.clock.run(3000);
  assert.strictEqual(players(t.store, code).length, 2);
  assert(t.c.html().includes("2468")); assert(t2.c.html().includes("2468"));
});
summary(kind + " password");
})().catch(e=>{ console.error(e); process.exit(1); });
