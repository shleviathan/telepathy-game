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

// ---------- boot ----------
(async ()=>{
  const vLine = document.getElementById("versionLine");
  if(vLine) vLine.textContent = `${APP_VERSION} · 更新於 ${APP_UPDATED}`;
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
    ensureContentPatchV5(d);
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
