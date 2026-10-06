//#@ config
const firebaseConfig = {
  apiKey: "AIzaSyCAsPtgWtXZG04N8wk40b02sEqpw-tU9m4",
  authDomain: "game-d3351.firebaseapp.com",
  projectId: "game-d3351",
  storageBucket: "game-d3351.firebasestorage.app",
  messagingSenderId: "484596428845",
  appId: "1:484596428845:web:b8d0a66e6db629b21548a4",
  measurementId: "G-J81WCB18BJ"
};

//#@ adapter
async function ensureDb(){
  if(db) return db;
  try{
    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  }catch(e){ db = null; }
  return db;
}

// Firestore 沒有內建的 acquire() 租約機制，這裡用一個 transaction 模擬「同一時間只有一個人能執行」的效果。
async function acquireLock(ref, holder, ttlMs){
  try{
    let acquired = false;
    const lockRef = ref.collection("_locks").doc("resolve");
    await db.runTransaction(async tx=>{
      const snap = await tx.get(lockRef);
      const now = Date.now();
      const data = snap.exists ? snap.data() : null;
      if(data && data.expiresAt > now){ acquired = false; return; }
      tx.set(lockRef, {holder, expiresAt: now + (ttlMs||4000)});
      acquired = true;
    });
    return {acquired};
  }catch(e){ return {acquired:false}; }
}

// 釋放鎖：只有 holder 相符才刪除鎖文件（鎖已經過期被別人拿走時不會誤刪對方的鎖）。
async function releaseLock(ref, holder){
  try{
    const lockRef = ref.collection("_locks").doc("resolve");
    await db.runTransaction(async tx=>{
      const snap = await tx.get(lockRef);
      const data = snap.exists ? snap.data() : null;
      if(data && data.holder === holder) tx.delete(lockRef);
    });
    return true;
  }catch(e){ return false; }
}

// 共用的鎖介面（遊戲程式碼一律透過 sync.js 的 withRoomLock 使用，不直接呼叫）。
function lockRoom(ref, holder, ttlMs){ return acquireLock(ref, holder, ttlMs); }
function unlockRoom(ref, holder){ return releaseLock(ref, holder); }

// 欄位層級的原子更新：Firestore 的 update() 原生支援 "a.b.c" 點路徑，只改那一個欄位，不會蓋掉別人同時寫的其他欄位。
function patchDoc(ref, flat){ return ref.update(flat); }
// 點路徑更新本身就是原子的，不需要寫完再讀回來確認。
const VERIFY_FIELD_WRITES = false;

// 房間文件的參照：Firestore 的 update() 本來就是「頂層欄位取代」，不需要包裝。
function wrapRoomRef(ref){ return ref; }
