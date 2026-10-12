// PWA 輸出檢查：dist 檔案清單、manifest 內容、sw.js 行為（假 self/caches）、Artifact 版完全沒有 PWA 痕跡。
// 用法：node tests/pwa.test.js [dist目錄]
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const dir = path.resolve(process.argv[2] || path.join(__dirname, "..", "dist"));
let pass = 0, fail = 0;
function test(name, fn){ try{ const r = fn(); if(r && r.then){ return r.then(()=>{pass++; console.log("  ok  ", name);}, e=>{fail++; console.log("  FAIL", name, "\n      ", e && e.stack || e);}); } pass++; console.log("  ok  ", name); }catch(e){ fail++; console.log("  FAIL", name, "\n      ", e && e.stack || e); } }
const rd = f => fs.readFileSync(path.join(dir, f), "utf8");
function pngSize(f){ const b = fs.readFileSync(path.join(dir, f)); assert.strictEqual(b.slice(1,4).toString(), "PNG"); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }

(async()=>{
test("dist 檔案清單剛好是預期的 8 個", ()=>{
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ["apple-touch-icon.png","artifact.html","icon-192.png","icon-512.png","icon-maskable-512.png","index.html","manifest.webmanifest","sw.js"]);
});
test("manifest 是合法 JSON 且欄位正確、圖示檔存在且尺寸對", ()=>{
  const m = JSON.parse(rd("manifest.webmanifest"));
  assert.strictEqual(m.name, "派對遊戲"); assert.ok(m.short_name); assert.strictEqual(m.lang, "zh-Hant");
  assert.strictEqual(m.display, "standalone"); assert.ok(/^#[0-9a-f]{6}$/i.test(m.theme_color) && /^#[0-9a-f]{6}$/i.test(m.background_color));
  assert.strictEqual(m.start_url, "./"); assert.strictEqual(m.scope, "./");
  assert.ok(m.icons.some(i=>i.sizes==="192x192") && m.icons.some(i=>i.sizes==="512x512" && i.purpose==="any") && m.icons.some(i=>i.purpose==="maskable"));
  for(const i of m.icons){ assert.ok(i.src.startsWith("./"), "相對路徑"); const [w,h] = pngSize(i.src.slice(2)); assert.strictEqual(`${w}x${h}`, i.sizes); assert.strictEqual(i.type, "image/png"); }
  assert.deepStrictEqual(pngSize("apple-touch-icon.png"), [180,180]);
});
test("standalone 有 manifest / theme-color / apple metas / SW 註冊（相對路徑）；artifact 一個都沒有", ()=>{
  const s = rd("index.html"), a = rd("artifact.html");
  for(const needle of ['<link rel="manifest" href="./manifest.webmanifest">','name="theme-color"','name="apple-mobile-web-app-capable"','rel="apple-touch-icon" href="./apple-touch-icon.png"','register("./sw.js", {scope:"./"})','加到主畫面','安裝應用程式','有新版本，重新整理即可更新'])
    assert.ok(s.includes(needle), "standalone 缺：" + needle);
  assert.ok(/location\.protocol==="https:"/.test(s) && /localhost/.test(s), "只在 https/localhost 註冊");
  assert.ok(!/manifest|serviceWorker|sw\.js|apple-touch|apple-mobile|theme-color|加到主畫面|安裝應用程式|有新版本/i.test(a), "artifact 出現 PWA 字樣");
});
test("sw.js：版本與雜湊已填入、快取名稱含 APP_VERSION、語法正確", ()=>{
  const sw = rd("sw.js"), ver = /APP_VERSION = "([^"]+)"/.exec(rd("index.html"))[1];
  assert.ok(!sw.includes("__VERSION__") && !sw.includes("__HASH__"));
  assert.ok(sw.includes(`const VERSION = "${ver}"`));
  new vm.Script(sw);
});
await test("sw.js 行為：install 預先快取、activate 清舊快取 + claim、跨來源不攔截、外殼 cache-first（忽略 ?code=）、其他 network-first", async()=>{
  const handlers = {}; const stores = {}; const log = {skip:0, claim:0, deleted:[]};
  const mkCache = name => stores[name] || (stores[name] = { map:new Map(),
    async add(req){ this.map.set(typeof req==="string"?req:req.url, "SHELL:"+(typeof req==="string"?req:req.url)); },
    async put(req,res){ this.map.set(req.url, res); },
    async match(req, o){ const u = typeof req==="string" ? new URL(req, "https://x.github.io/app/").href : req.url; const k = [...this.map.keys()].find(k=> (o&&o.ignoreSearch) ? new URL(k, "https://x.github.io/app/").pathname===new URL(u).pathname : k===u); return k ? this.map.get(k) : undefined; } });
  class Req { constructor(u,o){ this.url = new URL(u, "https://x.github.io/app/").href; this.method="GET"; this.mode=(o&&o.mode)||"cors"; } }
  const self_ = { location:{origin:"https://x.github.io"}, registration:{scope:"https://x.github.io/app/"},
    addEventListener:(t,fn)=>{ handlers[t]=fn; }, skipWaiting:async()=>{ log.skip++; }, clients:{claim:async()=>{ log.claim++; }} };
  let fetched = [];
  const ctx = vm.createContext({ self:self_, Request:Req, URL, Response:{error:()=>"ERR"},
    fetch: async r=>{ fetched.push(r.url); return {ok:true, url:r.url, clone(){return this;}}; },
    caches:{ open: async n=>mkCache(n), keys: async()=>Object.keys(stores), delete: async k=>{ log.deleted.push(k); delete stores[k]; }, match: async r=>undefined } });
  stores["pg-shell-old"] = mkCache("pg-shell-old"); stores["other-cache"] = mkCache("other-cache");
  vm.runInContext(rd("sw.js"), ctx);
  let waited; await handlers.install({waitUntil:p=>{waited=p;}}); await waited;
  const cacheName = Object.keys(stores).find(k=>k.startsWith("pg-shell-") && k!=="pg-shell-old");
  assert.ok(/^pg-shell-.+-[0-9a-f]{8}$/.test(cacheName)); assert.strictEqual(log.skip, 1);
  assert.ok(stores[cacheName].map.size >= 5, "外殼已預先快取");
  await handlers.activate({waitUntil:p=>{waited=p;}}); await waited;
  assert.ok(log.deleted.includes("pg-shell-old") && !log.deleted.includes("other-cache")); assert.strictEqual(log.claim, 1);
  const fire = (url, o) => { let r; const ev = {request:new Req(url,o), respondWith:p=>{ r = p; }}; handlers.fetch(ev); return r; };
  assert.strictEqual(fire("https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen"), undefined, "Firestore 不攔截");
  assert.strictEqual(fire("https://www.gstatic.com/firebasejs/x.js"), undefined, "gstatic 不攔截");
  const nav = await fire("./index.html?code=ABCD", {mode:"navigate"});
  assert.ok(String(nav).startsWith("SHELL:"), "導覽走快取（忽略 ?code）"); assert.strictEqual(fetched.length, 0);
  const icon = await fire("./icon-192.png"); assert.ok(String(icon).startsWith("SHELL:"));
  const other = await fire("./data.json"); assert.strictEqual(fetched.length, 1, "其他檔案 network-first"); assert.ok(other.ok);
  let post; handlers.fetch({request:Object.assign(new Req("./x"),{method:"POST"}), respondWith:p=>{post=p;}}); assert.strictEqual(post, undefined);
});
console.log(`\npwa: ${pass} 通過, ${fail} 失敗`);
process.exit(fail ? 1 : 0);
})();
