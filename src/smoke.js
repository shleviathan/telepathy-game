// 煙霧測試：把建置後的 <script> 放進 vm（假 DOM + 記憶體內假資料庫）跑，
// 檢查首頁、七種模式的大廳能渲染，且 lockRoom() 的回傳形狀/互斥/例外行為在兩個版本都正確。
// 用法：node smoke.js dist/index.html standalone | node smoke.js dist/artifact.html artifact
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const [file, kind] = process.argv.slice(2);
const html = fs.readFileSync(file, "utf8");
const scripts = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)];
assert.strictEqual(scripts.length, 1, "應該只有一段內嵌 <script>");
const script = scripts[0][1];

const els = {};
const mk = id => ({ id, innerHTML: "", style: {}, classList: { add() {}, remove() {} }, textContent: "" });
const any = new Proxy(function () {}, { get: (t, p) => p === "then" ? undefined : any, apply: () => any });
const doc = { activeElement: null, getElementById: id => els[id] || (els[id] = mk(id)), querySelectorAll: () => [],
  addEventListener() {}, documentElement: { setAttribute() {} } };

// ---- 記憶體內假資料庫（只實作 lock 會用到的部分）----
const store = new Map();
// 沒實作到的方法（orderBy/onSnapshot…）一律回傳萬用假物件，讓 boot 流程不會因此中斷
const withFallback = o => new Proxy(o, { get: (t, p) => (p in t ? t[p] : any) });
function makeRef(path) {
  return {
    path,
    collection: n => withFallback({ doc: id => makeRef(path + "/" + n + "/" + id), get: async () => ({ docs: [] }) }),
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    // Artifact 平台的租約 API（假實作：同一 ref 的租約未過期就拿不到）
    acquire: async ({ holder, ttlMs }) => {
      const k = path + "#lease", cur = store.get(k), now = Date.now();
      if (cur && cur.expiresAt > now) return { acquired: false };
      store.set(k, { holder, expiresAt: now + ttlMs }); return { acquired: true };
    },
  };
}
const fakeDb = {
  collection: n => withFallback({ doc: id => makeRef(n + "/" + id), get: async () => ({ docs: [] }) }),
  runTransaction: async fn => fn({
    get: async r => ({ exists: store.has(r.path), data: () => store.get(r.path) }),
    set: (r, d) => store.set(r.path, d),
  }),
};
const ctx = vm.createContext({
  console, setTimeout() { return 0 }, clearTimeout() {}, setInterval() { return 0 }, clearInterval() {},
  document: doc, localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {} },
  navigator: {}, location: { origin: "x", pathname: "/", search: "" }, AbortController,
  crypto: require("crypto").webcrypto, Uint32Array, confirm: () => true, Date,
  firebase: { apps: [1], initializeApp() {}, firestore: () => fakeDb },
});
ctx.window = ctx; ctx.addEventListener = () => {};
if (kind === "artifact") { delete ctx.firebase; ctx.window.claude = { use: async () => fakeDb }; }
vm.runInContext(script, ctx);

(async () => {
  await new Promise(r => setImmediate(r));
  // 版本行
  assert.ok(/v\d/.test(els.versionLine.innerHTML || els.versionLine.textContent), "版本行沒有顯示");
  // 首頁
  vm.runInContext(`identity=null; roomData=null; render();`, ctx);
  const home = els.app.innerHTML; assert.ok(home.length > 500, "首頁沒有渲染");
  // 各模式大廳
  for (const gt of ["telepathy", "mostlikely", "draw", "werewolf", "avalon", "codenames", "justone"]) {
    vm.runInContext(`identity={code:"ABCD",playerId:"a",name:"x"}; roomData={exists:true,gameType:${JSON.stringify(gt)},phase:"lobby",round:0,settings:undefined,lastActivityAt:Date.now()}; playersData=[{id:"a",name:"A",joinedAt:1,ready:true},{id:"b",name:"B",joinedAt:2,ready:true}]; render();`, ctx);
    assert.ok(els.app.innerHTML.includes("LOBBY"), "大廳沒有渲染：" + gt);
  }
  // lockRoom：回傳形狀 + 互斥 + 例外被呼叫端的 .catch 吸收
  assert.strictEqual(vm.runInContext("typeof lockRoom", ctx), "function");
  assert.strictEqual(vm.runInContext("typeof unlockRoom + typeof withRoomLock + typeof patchDoc", ctx), "functionfunctionfunction");
  await vm.runInContext("ensureDb()", ctx);
  const t = vm.runInContext(`(async()=>{
    const ref = db.collection("rooms").doc("R1");
    const first = await lockRoom(ref, "p1", 4000).catch(()=>({acquired:false}));
    const second = await lockRoom(ref, "p2", 4000).catch(()=>({acquired:false}));
    const bad = await lockRoom({collection(){throw new Error("x")}, acquire: async()=>{throw new Error("x")}}, "p1", 4000).catch(()=>({acquired:false}));
    return {first, second, bad};
  })()`, ctx);
  const r = await t;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), { first: { acquired: true }, second: { acquired: false }, bad: { acquired: false } });
  console.log(kind + ": 首頁 + 7 種大廳 + lockRoom 煙霧測試通過");
})().catch(e => { console.error(kind + " 失敗:", e); process.exit(1); });
