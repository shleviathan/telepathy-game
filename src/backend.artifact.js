//#@ adapter
async function ensureDb(){ if(db) return db; db = await window.claude.use("db"); return db; }

// 共用的鎖介面（遊戲程式碼一律透過 sync.js 的 withRoomLock 使用，不直接呼叫）。
// 平台的租約只有 acquire()：沒有 release 動詞，租約會自己過期（ttl 最短 1 秒）。
function lockRoom(ref, holder, ttlMs){ return ref.acquire({holder: holder, ttlMs: ttlMs}); }
// 「釋放」= 用同一個 holder 續租、把 ttl 縮到平台允許的最短值（1 秒），讓下一個人最多等 1 秒。
function unlockRoom(ref, holder){ return ref.acquire({holder: holder, ttlMs: 1000}).then(()=>true, ()=>false); }

// 平台的 update() 是「巢狀物件遞迴合併」，不支援 "a.b" 點路徑：把點路徑展開成巢狀物件再送出。
function patchDoc(ref, flat){ return (ref._raw || ref).update(expandDotted(flat)); }
// 平台是 last-writer-wins、沒有 transaction：自己寫完欄位後讀回來確認還在，不在就重寫（見 sync.js 的 writeOwnField）。
const VERIFY_FIELD_WRITES = true;

// 平台的 update() 是「巢狀物件遞迴合併」：update({teamVotes:{}}) 不會清掉舊的票、update({roles:{...}}) 也不會刪掉舊的 key，
// 但遊戲程式碼（和 Firestore 版）都是照「頂層欄位整個取代」在寫（每一輪把 teamVotes/hints/wolfVotes… 重設成 {}）。
// 所以房間文件的 update() 只要帶有物件值，就改成「讀出 → 頂層欄位取代 → set() 整份寫回」；只有純數值/字串/陣列的 update 才走平台原生的合併。
// （欄位層級的原子寫入 patchDoc 不經過這裡，仍然是原生的巢狀合併。）
function wrapRoomRef(ref){
  const w = Object.create(ref);
  w._raw = ref;   // patchDoc 要繞過下面的包裝，直接用平台原生的巢狀合併
  w.update = async function(data){
    const hasObj = Object.keys(data).some(k=>{ const v = data[k]; return v && typeof v==="object" && !Array.isArray(v); });
    if(!hasObj) return ref.update(data);
    const snap = await ref.get();
    if(!snap.exists) throw Object.assign(new Error("not-found"), {code:"not-found"});
    const cur = Object.assign({}, snap.data());
    Object.keys(data).forEach(k=>{ cur[k] = data[k]; });
    return ref.set(cur);
  };
  return w;
}
