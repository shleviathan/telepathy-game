//#if standalone
// 把種子/修正流程中遇到的第一個錯誤顯示在題庫畫面上（例如 Firestore 規則沒開放寫入權限），方便排查。
//#else
// 把種子/修正流程中遇到的第一個錯誤顯示在題庫畫面上（例如權限問題），方便排查。
//#endif
function reportSeedError(prefix, e){
  if(bankLoadError) return; // 只留第一個錯誤，避免畫面被洗掉
  bankLoadError = prefix + "：" + ((e && (e.message||e.code)) || String(e));
  render();
}

async function ensureSeeded(d){
  try{
    const marker = d.doc("meta/questionsSeeded");
    const snap = await marker.get();
    if(snap.exists) return;
    await Promise.all(QUESTIONS.map((item,i)=>
      d.collection("customQuestions").doc("seed_"+i).set({
        q: item[0], options: item[1], category: item[2]||"other", builtin: true, createdAt: Date.now()
      })
    ));
    await marker.set({done:true, at: Date.now()});
  }catch(e){ reportSeedError("題庫初始化失敗（ensureSeeded）", e); }
}
// 第二批種子題（「關於你」題型），跟第一批分開用獨立標記，這樣已經玩過的房間也會補到新題目，不會重複。
async function ensureSeededV2(d){
  try{
    const marker = d.doc("meta/questionsSeededV2");
    const snap = await marker.get();
    if(snap.exists) return;
    await Promise.all(TARGETED_QUESTIONS.map((item,i)=>
      d.collection("customQuestions").doc("seedv2_"+i).set({
        q: item[0], options: item[1], category: item[2]||"aboutyou", builtin: true, targeted: true, createdAt: Date.now()
      })
    ));
    await marker.set({done:true, at: Date.now()});
  }catch(e){ reportSeedError("題庫初始化失敗（ensureSeededV2）", e); }
}

//#if standalone
// 修正題庫的寫入邏輯：改成一筆一筆依序寫入「完整」內容（含 createdAt），把所有 seed_/seedv2_ 題目資料修好，
//#else
// 修正題庫的寫入 bug：先前 V3/V4 用 set(資料,{merge:true}) 想要「合併」寫入，但這個平台的 set() 不支援
// merge 參數，會整份覆蓋掉，導致 createdAt 欄位不見、部分題目在題庫列表裡排到後面甚至看起來像消失了。
// 這裡改成一筆一筆依序寫入「完整」內容（含 createdAt），把所有 seed_/seedv2_ 題目資料修好，
//#endif
// 同時把題目文字裡的 {player}/{P} 改成更短的 PP。
async function ensureContentPatchV5(d){
  try{
    const marker = d.doc("meta/questionsContentPatchV5");
    const snap = await marker.get();
    if(snap.exists) return;
    const col = d.collection("customQuestions");
    for(let i=0;i<QUESTIONS.length;i++){
      const item = QUESTIONS[i];
      try{
        await col.doc("seed_"+i).set({
          q: item[0], options: item[1], category: item[2]||"other",
          builtin: true, targeted: true, createdAt: 1788857016000 + i
        });
      }catch(e){ reportSeedError("題庫寫入失敗（seed_"+i+"）", e); }
    }
    for(let i=0;i<TARGETED_QUESTIONS.length;i++){
      const item = TARGETED_QUESTIONS[i];
      try{
        await col.doc("seedv2_"+i).set({
          q: item[0], options: item[1], category: item[2]||"aboutyou",
          builtin: true, targeted: true, createdAt: 1788857017000 + i
        });
      }catch(e){ reportSeedError("題庫寫入失敗（seedv2_"+i+"）", e); }
    }
    await marker.set({done:true, at: Date.now()});
  }catch(e){ reportSeedError("題庫修正失敗（ensureContentPatchV5）", e); }
}

// 內建題庫擴充（V6）：QUESTIONS / TARGETED_QUESTIONS 只在「尾端」追加新題。
// 已經玩過的資料庫早就有 V5 之前的 seed_0~seed_100 與 seedv2_0~seedv2_19，所以這裡只補第 SEED_V5_Q_COUNT / SEED_V5_T_COUNT 筆以後的題目，
// 用同樣的決定性文件 id（seed_<索引> / seedv2_<索引>）寫入：重跑、多人同時跑都是覆寫同一份文件，不會產生重複題。
// 之後再擴充內建題目，只要繼續在陣列尾端追加，並複製這個函式改成 V7（基準改成 V6 之後的筆數）、換新的 marker 即可。
// 注意：不可以在 QUESTIONS / TARGETED_QUESTIONS 中間插入或重排，否則索引（也就是文件 id）會對不上。
const SEED_V5_Q_COUNT = 101, SEED_V5_T_COUNT = 20;
async function ensureContentPatchV6(d){
  try{
    const marker = d.doc("meta/questionsContentPatchV6");
    const snap = await marker.get();
    if(snap.exists) return;
    const col = d.collection("customQuestions");
    for(let i=SEED_V5_Q_COUNT;i<QUESTIONS.length;i++){
      const item = QUESTIONS[i];
      try{
        await col.doc("seed_"+i).set({
          q: item[0], options: item[1], category: item[2]||"other",
          builtin: true, targeted: true, createdAt: 1788857016000 + i
        });
      }catch(e){ reportSeedError("題庫寫入失敗（seed_"+i+"）", e); }
    }
    for(let i=SEED_V5_T_COUNT;i<TARGETED_QUESTIONS.length;i++){
      const item = TARGETED_QUESTIONS[i];
      try{
        await col.doc("seedv2_"+i).set({
          q: item[0], options: item[1], category: item[2]||"aboutyou",
          builtin: true, targeted: true, createdAt: 1788857017000 + i
        });
      }catch(e){ reportSeedError("題庫寫入失敗（seedv2_"+i+"）", e); }
    }
    await marker.set({done:true, at: Date.now()});
  }catch(e){ reportSeedError("題庫修正失敗（ensureContentPatchV6）", e); }
}

// ---------- boot ----------
(async ()=>{
  const vLine = document.getElementById("versionLine");
  if(vLine) vLine.textContent = `${APP_VERSION} · 更新於 ${APP_UPDATED}`;
  pgWireChrome();
  render();
  const d = await ensureDb();
  if(d){
    customQuestionsCol = d.collection("customQuestions");
    unsubCustomQuestions = customQuestionsCol.orderBy("createdAt","asc").onSnapshot(qsnap=>{
      bankLoadError = "";
      customQuestionsData = qsnap.docs.map(dd=>({id:dd.id, ...dd.data()}));
      render();
    }, err=>{
//#if standalone
      // 常見原因：Firestore 安全規則沒開放 customQuestions 這個 collection 的讀取權限。
//#endif
      bankLoadError = (err && (err.message||err.code)) || String(err);
      render();
    });
    ensureSeeded(d);
    ensureSeededV2(d);
    // V5 先跑完再跑 V6（V5 沒做完就沒有 marker，下次啟動會重跑；V6 只補新增的題目，兩者互不衝突）。
    ensureContentPatchV5(d).then(()=>ensureContentPatchV6(d));
  }
  if(identity){
    if(!db){
      app.innerHTML = `<div class="card" style="text-align:center;"><p>目前無法連線到房間服務。</p><button class="btn-secondary" id="backBtn">回首頁</button></div>`;
      document.getElementById("backBtn").onclick = leaveToHome;
      return;
    }
    connectRoom();
  }
})();

// 手機切到背景、螢幕鎖定或網路重新連上時，即時連線常常會斷掉但不會自動補上；
// 回到前景 / 恢復網路時主動重新訂閱，不用使用者自己重新整理頁面。
let lastReconnectAt = 0;
function reconnectIfNeeded(){
  if(!identity || !roomRef) return;
  const now = Date.now();
  if(now - lastReconnectAt < 1500) return; // 避免短時間內重複觸發
  lastReconnectAt = now;
  connectRoom();
}
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible"){ reconnectIfNeeded(); sendHeartbeat(true); }
});
window.addEventListener("focus", ()=>{ reconnectIfNeeded(); sendHeartbeat(true); });
window.addEventListener("online", ()=>{ reconnectIfNeeded(); sendHeartbeat(true); });

//#if standalone
// ---------- PWA：註冊 service worker（只有獨立版；只在 https 或 localhost 才註冊）----------
// 新版接手後（controllerchange）提醒使用者重新整理；第一次安裝（原本沒有 controller）不提醒。
function pgRegisterServiceWorker(){
  try{
    if(!("serviceWorker" in navigator)) return;
    const host = location.hostname;
    if(!(location.protocol==="https:" || host==="localhost" || host==="127.0.0.1" || host==="[::1]")) return;
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", ()=>{
      if(hadController) showToast("有新版本，重新整理即可更新", 8000);
      hadController = true;
    });
    window.addEventListener("load", ()=>{
      try{ navigator.serviceWorker.register("./sw.js", {scope:"./"}).catch(()=>{}); }catch(e){}
    });
  }catch(e){}
}
pgRegisterServiceWorker();
//#endif
