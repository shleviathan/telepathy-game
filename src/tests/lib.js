// 測試用函式庫：虛擬時鐘 + 記憶體內假資料庫（Firestore 風格 / Artifact db 風格）+ 假 DOM，
// 把建置後的 <script> 放進 vm 當一個「用戶端」跑。多個用戶端共用同一個 Store，就能模擬多人同時操作。
const fs = require("fs"), vm = require("vm");

function extractScript(file){
  const html = fs.readFileSync(file, "utf8");
  const m = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)];
  if(m.length !== 1) throw new Error("應該只有一段內嵌 <script>");
  return m[0][1];
}

// ---------- 虛擬時鐘 ----------
class Clock {
  constructor(start){ this.now = start || 1700000000000; this.timers = []; this.seq = 1; }
  setTimeout(fn, ms){ const id = this.seq++; this.timers.push({id, at: this.now + Math.max(0, ms||0), fn, every: 0}); return id; }
  setInterval(fn, ms){ const id = this.seq++; this.timers.push({id, at: this.now + ms, fn, every: ms}); return id; }
  clear(id){ this.timers = this.timers.filter(t=>t.id!==id); }
  async flush(){ for(let i=0;i<4;i++) await new Promise(r=>setImmediate(r)); }
  // 往前推 ms 毫秒，途中到期的計時器依序執行，每一步都讓 promise 跑完。
  async run(ms){
    const end = this.now + ms;
    await this.flush();
    for(;;){
      this.timers.sort((a,b)=>a.at-b.at);
      const t = this.timers[0];
      if(!t || t.at > end) break;
      this.now = Math.max(this.now, t.at);
      if(t.every){ t.at += t.every; } else { this.timers.shift(); }
      try{ t.fn(); }catch(e){}
      await this.flush();
    }
    this.now = end;
    await this.flush();
  }
}

const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));

// ---------- 假資料庫 ----------
class Store {
  constructor(clock, mode){
    this.clock = clock; this.mode = mode;       // mode: "standalone"（Firestore 風格）| "artifact"
    this.docs = new Map(); this.listeners = new Set(); this.log = [];
    this.leases = new Map(); this.txChain = Promise.resolve();
    this.dropUpdates = 0;                        // 模擬 last-writer-wins 把寫入蓋掉：接下來 N 次 update 默默不生效
    this.seedMarkers();
  }
  seedMarkers(){ ["meta/questionsSeeded","meta/questionsSeededV2","meta/questionsContentPatchV5"].forEach(p=> this.docs.set(p, {done:true})); }
  async tick(){ await null; await null; }
  notify(path){
    const parent = path.split("/").slice(0,-1).join("/");
    for(const l of [...this.listeners]){
      if(l.path === path || l.path === parent) Promise.resolve().then(()=>{ if(this.listeners.has(l)) l.emit(); });
    }
  }
  getDoc(path){ return this.docs.has(path) ? clone(this.docs.get(path)) : undefined; }
  listCol(path){
    const out = [];
    for(const [p, d] of this.docs){
      if(p.startsWith(path+"/") && !p.slice(path.length+1).includes("/")) out.push({id: p.slice(path.length+1), data: clone(d)});
    }
    return out.sort((a,b)=> a.id<b.id?-1:1);
  }
  // 測試用：直接改資料（不經過任何用戶端）
  put(path, data){ this.docs.set(path, clone(data)); this.notify(path); }
  patch(path, fn){ const d = this.getDoc(path); fn(d); this.put(path, d); }
  writes(pred){ return this.log.filter(pred); }
}

function applyFirestoreUpdate(doc, flat){
  for(const k of Object.keys(flat)){
    const parts = k.split(".");
    let o = doc;
    for(let i=0;i<parts.length-1;i++){ if(typeof o[parts[i]]!=="object" || o[parts[i]]===null) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length-1]] = clone(flat[k]);
  }
}
function mergeDeep(dst, src){
  for(const k of Object.keys(src)){
    const v = src[k];
    if(v && typeof v==="object" && !Array.isArray(v) && dst[k] && typeof dst[k]==="object" && !Array.isArray(dst[k])) mergeDeep(dst[k], v);
    else dst[k] = clone(v);
  }
}

function makeDb(store){
  const snapOf = (path)=>({ id: path.split("/").pop(), exists: store.docs.has(path), data: ()=> store.getDoc(path), metadata:{} });
  function colRef(path, filt){
    const self = {
      path,
      doc: id => docRef(path + "/" + (id || Math.random().toString(36).slice(2,10))),
      async add(d){ const r = self.doc(); await r.set(d); return r; },
      where(f, op, v){ if(op!=="==") throw new Error("fake db: 只支援 =="); return colRef(path, (filt||[]).concat([[f,v]])); },
      orderBy(){ return colRef(path, filt); },
      limit(){ return colRef(path, filt); },
      _snap(){
        let rows = store.listCol(path);
        (filt||[]).forEach(([f,v])=>{ rows = rows.filter(r=> r.data[f]===v); });
        return { docs: rows.map(r=>({id:r.id, data:()=>clone(r.data)})), size: rows.length, empty: !rows.length };
      },
      async get(){ await store.tick(); return self._snap(); },
      onSnapshot(next){
        const l = { path, emit: ()=>{ try{ next(self._snap()); }catch(e){ store.renderErrors = (store.renderErrors||0)+1; } } };
        store.listeners.add(l); Promise.resolve().then(()=>{ if(store.listeners.has(l)) l.emit(); });
        return ()=> store.listeners.delete(l);
      },
    };
    return self;
  }
  function docRef(path){
    const ref = {
      path, id: path.split("/").pop(),
      collection: n => colRef(path + "/" + n),
      async get(){ await store.tick(); return snapOf(path); },
      async set(d){ await store.tick(); store.docs.set(path, clone(d)); store.log.push({op:"set", path, data: clone(d)}); store.notify(path); },
      async update(flat){
        await store.tick();
        if(!store.docs.has(path)) throw Object.assign(new Error("not-found"), {code:"not-found"});
        store.log.push({op:"update", path, data: clone(flat)});
        if(store.dropUpdates > 0){ store.dropUpdates--; return; }
        const d = store.docs.get(path);
        if(store.mode==="artifact"){
          if(Object.keys(flat).some(k=>k.includes("."))) throw Object.assign(new Error("invalid_argument: dotted path"), {code:"invalid_argument"});
          mergeDeep(d, flat);
        } else applyFirestoreUpdate(d, flat);
        store.notify(path);
      },
      async delete(){ await store.tick(); store.docs.delete(path); store.log.push({op:"delete", path}); store.notify(path); },
      onSnapshot(next){
        const l = { path, emit: ()=>{ try{ next(snapOf(path)); }catch(e){ store.renderErrors = (store.renderErrors||0)+1; } } };
        store.listeners.add(l); Promise.resolve().then(()=>{ if(store.listeners.has(l)) l.emit(); });
        return ()=> store.listeners.delete(l);
      },
    };
    if(store.mode==="artifact"){
      // 平台租約：ttl 夾在 [1000, 600000]；同一個 holder 可以續租（把到期時間改成 now+ttl）；沒有 release。
      ref.acquire = async ({holder, ttlMs})=>{
        await store.tick();
        const ttl = Math.min(600000, Math.max(1000, ttlMs||30000));
        const cur = store.leases.get(path), now = store.clock.now;
        if(cur && cur.expiresAt > now && cur.holder !== holder) return {acquired:false, expiresAt: new Date(cur.expiresAt).toISOString()};
        store.leases.set(path, {holder, expiresAt: now + ttl});
        store.log.push({op:"acquire", path, holder, ttl});
        return {acquired:true, holder};
      };
    }
    return ref;
  }
  return {
    doc: docRef, collection: n => colRef(n),
    // Firestore 風格的 transaction（依序執行）
    runTransaction(fn){
      const run = store.txChain.then(async ()=>{
        const tx = {
          get: async r => { await store.tick(); return snapOf(r.path); },
          set: (r, d) => { store.docs.set(r.path, clone(d)); store.log.push({op:"set", path:r.path, data:clone(d), tx:true}); },
          delete: r => { store.docs.delete(r.path); store.log.push({op:"delete", path:r.path, tx:true}); },
        };
        return fn(tx);
      });
      store.txChain = run.catch(()=>{});
      return run;
    },
  };
}

// ---------- 用戶端（一個 vm = 一台手機）----------
function mkEl(id){
  const el = { id, innerHTML:"", textContent:"", style:{}, value:"", classList:{add(){},remove(){},toggle(){}}, dataset:{},
    appendChild(){}, addEventListener(){}, focus(){}, blur(){}, setAttribute(){},
    getBoundingClientRect: ()=>({left:0,top:0,width:300,height:300}), width:300, height:300 };
  el.getContext = ()=> new Proxy(function(){}, { get:(t,p)=> p==="then" ? undefined : any, apply:()=>any, set:()=>true });
  return el;
}
const any = new Proxy(function(){}, { get:(t,p)=> p==="then" ? undefined : any, apply:()=>any, set:()=>true });

function createClient({file, kind, store, clock, session}){
  const script = extractScript(file);
  const els = {};
  const sess = Object.assign({}, session||{});
  const doc = {
    activeElement:null, visibilityState:"visible",
    getElementById: id => els[id] || (els[id] = mkEl(id)),
    querySelectorAll: ()=>[], createElement: ()=> mkEl("x"), body: { appendChild(){} },
    addEventListener(){}, documentElement:{ setAttribute(){} },
  };
  const FDate = class extends Date { constructor(...a){ if(a.length===0) super(clock.now); else super(...a); } static now(){ return clock.now; } };
  const db = makeDb(store);
  const handlers = {};
  const ctx = vm.createContext({
    console,
    setTimeout:(f,ms)=>clock.setTimeout(f,ms), clearTimeout:id=>clock.clear(id), setInterval:(f,ms)=>clock.setInterval(f,ms), clearInterval:id=>clock.clear(id),
    document: doc, Date: FDate,
    localStorage:{ getItem:()=>null, setItem(){} },
    sessionStorage:{ getItem:k=> (k in sess ? sess[k] : null), setItem:(k,v)=>{ sess[k]=v; } },
    navigator:{}, location:{ origin:"x", pathname:"/", search:"" }, AbortController,
    crypto: require("crypto").webcrypto, Uint32Array, confirm:()=>true, alert(){},
    requestAnimationFrame: f=>clock.setTimeout(f,16), cancelAnimationFrame(){},
  });
  ctx.window = ctx;
  ctx.addEventListener = (n,f)=>{ (handlers[n] = handlers[n]||[]).push(f); };
  doc.addEventListener = (n,f)=>{ (handlers[n] = handlers[n]||[]).push(f); };
  if(kind==="artifact") ctx.window.claude = { use: async ()=> db };
  else ctx.firebase = { apps:[1], initializeApp(){}, firestore: ()=> db };
  vm.runInContext(script, ctx);
  const c = {
    ctx, els, doc, handlers, sess,
    ev: code => vm.runInContext(code, ctx),
    html: ()=> els.app ? els.app.innerHTML : "",
    // 設定身分並連上房間（等於這個人加入或重新整理後回到房間）
    async connect(code, playerId, name){
      await vm.runInContext("ensureDb()", ctx);
      vm.runInContext(`identity = ${JSON.stringify({code, playerId, name: name||playerId})}; connectRoom();`, ctx);
      await clock.flush();
    },
    fire(name){ (handlers[name]||[]).forEach(f=>f({})); },
    setHidden(h){ doc.visibilityState = h ? "hidden" : "visible"; },
  };
  return c;
}

// ---------- 房間 / 玩家種子 ----------
const ROOT = "telepathyrooms";
function seedPlayers(store, code, ids, opts){
  opts = opts || {};
  ids.forEach((id, i)=>{
    store.put(`${ROOT}/${code}/players/${id}`, Object.assign({ name: id.toUpperCase(), avatar:"🐱", joinedAt: store.clock.now - 100000 + i, lastSeen: store.clock.now, strikes:0, mlScore:0, ready:true }, (opts.each && opts.each(id,i)) || {}));
  });
}
function seedRoom(store, code, fields){
  store.put(`${ROOT}/${code}`, Object.assign({ gameType:"telepathy", phase:"lobby", round:0, settings:{}, createdAt: store.clock.now, lastActivityAt: store.clock.now, teamVotes:{}, missionVotes:{}, acks:{}, hints:{}, wolfVotes:{}, voteTally:{}, roles:{} }, fields||{}));
}
const roomPath = code => `${ROOT}/${code}`;
const playerPath = (code, id) => `${ROOT}/${code}/players/${id}`;

let passed = 0, failed = 0;
const failures = [];
async function test(name, fn){
  try{ await fn(); passed++; console.log("  ok   " + name); }
  catch(e){ failed++; failures.push(name); console.log("  FAIL " + name + "\n       " + (e && e.stack ? e.stack.split("\n").slice(0,4).join("\n       ") : e)); }
}
function summary(label){
  console.log(`${label}: ${passed} 通過, ${failed} 失敗`);
  if(failed){ console.log("失敗項目：", failures.join(" | ")); process.exit(1); }
}

module.exports = { extractScript, Clock, Store, makeDb, createClient, seedPlayers, seedRoom, roomPath, playerPath, ROOT, test, summary, clone };
