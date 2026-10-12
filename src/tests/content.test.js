// 內建內容庫測試：結構、重複、下限、只能尾端追加（凍結基準雜湊）、題庫補丁（V6）整合。
// 用法：node tests/content.test.js dist/index.html dist/artifact.html   （兩份輸出各跑一次，並比對兩份內容一致）
const assert = require("assert"), vm = require("vm"), crypto = require("crypto");
const L = require("./lib");
const { Clock, Store, createClient, test, summary } = L;
const files = process.argv.slice(2);
if(!files.length){ console.error("用法：node tests/content.test.js <html...>"); process.exit(2); }

// 改版前（v4.6 內容擴充之前）每個題庫的長度與 JSON 的 sha1。基準區段只允許被「尾端追加」，不能移除、改動或重排，
// 因為房間裡存的是索引（usedQKeys 的 seed_<索引>、usedPromptIdx、usedDrawPromptIdx 的 si-pi-ai）與題庫文件 id。
const BASE = {
  QUESTIONS:           [101, "5be4c3078c295fbdc9b798f484a6ab31436529ec"],
  TARGETED_QUESTIONS:  [20,  "62d2b0cc252f09d5a8a35fd0a3b07d360d7c34c4"],
  MOST_LIKELY_PROMPTS: [40,  "aba3a42efa6dab0d0a3660dc601a012d527d2f3b"],
  DRAW_SUBJECTS:       [50,  "ee960cd8921411f85657c2c01c9269ca39559080"],
  DRAW_PLACES:         [50,  "5c2d871b79c5bc326ad50300b55c81dba836cc16"],
  DRAW_ACTIONS:        [50,  "2dde72f69d08bdd826c656f4891024a020ff39b2"],
  CN_WORDS:            [506, "499337bd4441c6fda419261c862f0eaa048a6605"],
  JO_WORDS:            [392, "7fa6ee156edf8b3460c4b41f34b2bc0dfb70c9a8"],
};
// 尾端追加之後的最低數量（防止之後不小心刪掉一大塊）。
const MIN = { QUESTIONS:200, TARGETED_QUESTIONS:40, MOST_LIKELY_PROMPTS:95, DRAW_SUBJECTS:115, DRAW_PLACES:115, DRAW_ACTIONS:115, CN_WORDS:1000, JO_WORDS:680 };
const PER_CAT_MIN = 14;      // 每個類別（含「其他」「關於你」）至少幾題（QUESTIONS + TARGETED 合計）
const CATS = ["food","travel","life","work_money","relationship","entertainment","values","fantasy","memory","aboutyou","other"];
// 台灣用語：這些中國大陸用詞不該出現（地鐵站是改版前就有的舊項目，列為已知例外）。
const MAINLAND = ["出租車","地鐵","軟件","硬件","視頻","土豆","西紅柿","酸奶","公交","摩的","手機殼子","老鐵","小哥哥","打call"];
const MAINLAND_KNOWN = new Set(["地鐵站"]);
// 家庭友善：不放性、暴力血腥、政治、宗教衝突、真人、族群刻板印象等字眼（簡易黑名單，只擋明顯的）。
const UNSAFE = ["色情","性愛","做愛","裸","毒品","吸毒","自殺","強姦","殺人","納粹","恐怖份子","共產","國民黨","民進黨","總統","選舉","佛祖","耶穌","上帝","阿拉","穆斯林","基督徒","外勞","外籍","黑人","白人","原住民","同性戀","賭博","酒駕","槍殺","屍體"];

function grab(script, name){
  const i = script.indexOf("const " + name + " = [");
  assert(i >= 0, "找不到 " + name);
  const j = script.indexOf("\n];", i);
  return vm.runInNewContext(script.slice(i + ("const " + name + " = ").length, j + 2));
}
const sha = a => crypto.createHash("sha1").update(JSON.stringify(a)).digest("hex");
const norm = s => String(s).normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const len = w => Array.from(w).length;
const dups = arr => { const seen = new Set(), d = []; arr.forEach(x=>{ const k = JSON.stringify(x); if(seen.has(k)) d.push(x); seen.add(k); }); return d; };
function containPairs(words, baseLen){      // 回傳「牽涉到新詞」且互相包含的詞對（長度 >= 2 才算；單字詞舊庫就有，不追究）
  const out = [];
  for(let i = 0; i < words.length; i++) for(let j = 0; j < words.length; j++){
    if(i === j || (i < baseLen && j < baseLen)) continue;
    const a = words[i], b = words[j];
    if(len(b) >= 2 && a.includes(b)) out.push(a + "⊃" + b);
  }
  return out;
}

const loaded = [];
(async ()=>{
for(const file of files){
  const kind = /artifact/.test(file) ? "artifact" : "standalone";
  const script = L.extractScript(file);
  const D = {};
  for(const k of Object.keys(BASE)) D[k] = grab(script, k);
  loaded.push(D);
  console.log(`== ${file} (${kind}) ==`);

  await test("基準區段凍結：舊項目沒被移除/改動/重排，只在尾端追加", ()=>{
    for(const [k, [n, h]] of Object.entries(BASE)){
      assert(D[k].length >= n, k + " 變短了");
      assert.strictEqual(sha(D[k].slice(0, n)), h, k + " 的舊項目被改動或重排");
      assert(D[k].length >= MIN[k], `${k} 數量 ${D[k].length} < ${MIN[k]}`);
    }
  });

  await test("心電感應 QUESTIONS / TARGETED：4 個非空且不同的選項、合法類別、含 PP、題目不重複", ()=>{
    const all = [...D.QUESTIONS, ...D.TARGETED_QUESTIONS];
    for(const [q, opts, cat] of all){
      assert(typeof q === "string" && q.trim() === q && len(q) >= 6 && len(q) <= 40, "題目長度怪怪的：" + q);
      assert(q.includes("PP"), "缺少 PP：" + q);
      assert(Array.isArray(opts) && opts.length === 4, "選項不是 4 個：" + q);
      opts.forEach(o=>{ assert(typeof o === "string" && o.trim() === o && o.length > 0 && len(o) <= 20, "選項怪怪的：" + q + " / " + o); });
      assert.strictEqual(new Set(opts.map(norm)).size, 4, "選項重複：" + q);
      assert(CATS.includes(cat), "類別不合法：" + q + " / " + cat);
    }
    assert.deepStrictEqual(dups(all.map(x=>x[0])), [], "題目文字重複");
    assert.deepStrictEqual(dups(all.map(x=>norm(x[0]))), [], "題目正規化後重複");
    assert(D.TARGETED_QUESTIONS.every(x=>x[2] === "aboutyou"), "TARGETED 都應是 aboutyou");
  });

  await test(`每個類別至少 ${PER_CAT_MIN} 題（QUESTIONS + TARGETED 合計）`, ()=>{
    const c = Object.fromEntries(CATS.map(x=>[x, 0]));
    [...D.QUESTIONS, ...D.TARGETED_QUESTIONS].forEach(x=>c[x[2]]++);
    for(const k of CATS) assert(c[k] >= PER_CAT_MIN, `${k} 只有 ${c[k]} 題`);
  });

  await test("誰最可能：不重複、以「的人」結尾、長度合理", ()=>{
    const M = D.MOST_LIKELY_PROMPTS;
    assert.deepStrictEqual(dups(M.map(norm)), []);
    M.forEach(s=>{ assert(s.trim() === s && len(s) >= 6 && len(s) <= 40, s); assert(/的人$/.test(s), "要以「的人」結尾：" + s); });
  });

  await test("接力畫猜：三份清單無重複（含彼此之間）、無禁用字元；所有「主體在地點動作」組合都是非空字串", ()=>{
    const { DRAW_SUBJECTS: S, DRAW_PLACES: P, DRAW_ACTIONS: A } = D;
    const FORBID = /[\s"'`<>&\\\u0000-\u001f\u007f]/;
    const everything = [...S, ...P, ...A];
    assert.deepStrictEqual(dups(everything.map(norm)), [], "三份清單內或之間有重複");
    for(const [name, arr] of [["主體", S], ["地點", P], ["動作", A]]){
      arr.forEach(w=>{ assert(typeof w === "string" && w.length > 0 && w === w.trim() && !FORBID.test(w), name + " 有問題：" + JSON.stringify(w)); assert(len(w) >= 1 && len(w) <= 8, name + " 太長：" + w); });
      assert.deepStrictEqual(containPairs(arr, BASE[{主體:"DRAW_SUBJECTS",地點:"DRAW_PLACES",動作:"DRAW_ACTIONS"}[name]][0]), [], name + " 有互相包含的詞");
    }
    // 組合：不能含有「在」以外的怪字、不能出現 undefined；抽查全部組合（約百萬級，仍然很快）
    let n = 0;
    for(const s of S) for(const p of P) for(const a of A){
      const t = `${s}在${p}${a}`;
      if(!t || t.includes("undefined") || FORBID.test(t)) assert.fail("組合有問題：" + t);
      n++;
    }
    assert.strictEqual(n, S.length * P.length * A.length);
    assert(n >= 1500000, "組合數 " + n);
    assert(S.every(w=>!w.includes("在")), "主體不應含「在」");     // 避免句子斷句歧義
  });

  await test("機密代號 CN_WORDS：不重複、2~3 字、新詞無英數、新詞與其他詞不互相包含（單字舊詞除外）", ()=>{
    const W = D.CN_WORDS, base = BASE.CN_WORDS[0];
    assert.deepStrictEqual(dups(W), []); assert.deepStrictEqual(dups(W.map(norm)), []);
    W.forEach((w, i)=>{ assert(w === w.trim() && len(w) >= 1 && len(w) <= 3, "長度：" + w); if(i >= base){ assert(len(w) >= 2, "新詞至少 2 字：" + w); assert(!/[A-Za-z0-9]/.test(w), "新詞不該有英數：" + w); } });
    assert.deepStrictEqual(containPairs(W, base), [], "新詞與其他詞互相包含");
  });

  await test("只有一個 JO_WORDS：不重複、2~4 字（新詞）、新詞與其他詞不互相包含", ()=>{
    const W = D.JO_WORDS, base = BASE.JO_WORDS[0];
    assert.deepStrictEqual(dups(W), []); assert.deepStrictEqual(dups(W.map(norm)), []);
    W.forEach((w, i)=>{ assert(w === w.trim() && len(w) >= 1 && len(w) <= 4, "長度：" + w); if(i >= base){ assert(len(w) >= 2, w); assert(!/[A-Za-z0-9]/.test(w), "新詞不該有英數：" + w); } });
    assert.deepStrictEqual(containPairs(W, base), [], "新詞與其他詞互相包含");
  });

  await test("用語：沒有大陸用語、沒有明顯不適合的字眼", ()=>{
    const texts = [];
    for(const [k, arr] of Object.entries(D)) arr.forEach(x=>texts.push([k, Array.isArray(x) ? x[0] + x[1].join("|") : x]));
    for(const [k, t] of texts){
      for(const m of MAINLAND) if(t.includes(m) && ![...MAINLAND_KNOWN].some(kn=>t.includes(kn))) assert.fail(`${k} 含大陸用語「${m}」：${t}`);
      for(const u of UNSAFE) assert(!t.includes(u), `${k} 含不適合字眼「${u}」：${t}`);
    }
  });

  // ---------- 題庫補丁（V6）整合 ----------
  const prefixDocs = (store, ctx) => {       // 模擬「V5 之前就玩過的資料庫」：已有 seed_0~100 / seedv2_0~19，標記齊全
    const Q = vm.runInContext("QUESTIONS", ctx), T = vm.runInContext("TARGETED_QUESTIONS", ctx);
    for(let i = 0; i < BASE.QUESTIONS[0]; i++) store.put("customQuestions/seed_" + i, { q:Q[i][0], options:Q[i][1], category:Q[i][2], builtin:true, targeted:true, createdAt:1788857016000 + i });
    for(let i = 0; i < BASE.TARGETED_QUESTIONS[0]; i++) store.put("customQuestions/seedv2_" + i, { q:T[i][0], options:T[i][1], category:T[i][2], builtin:true, targeted:true, createdAt:1788857017000 + i });
  };
  const bank = store => store.listCol("customQuestions");

  await test("V6 補丁：舊資料庫只補新增題目，舊文件原封不動，補完不重複；再開一次也不重複", async ()=>{
    const clock = new Clock(), store = new Store(clock, kind);
    const probe = createClient({ file, kind, store: new Store(new Clock(), kind), clock: new Clock() });   // 只為了取得內建陣列
    prefixDocs(store, probe.ctx);
    store.put("customQuestions/seed_5", Object.assign(store.getDoc("customQuestions/seed_5"), { userEdited:true }));    // 舊文件若被覆寫就會掉這個欄位
    const writesBefore = store.log.length;
    const c = createClient({ file, kind, store, clock }); await clock.run(3000);
    const nQ = D.QUESTIONS.length, nT = D.TARGETED_QUESTIONS.length;
    assert.strictEqual(bank(store).length, nQ + nT, "題庫文件數");
    assert(store.getDoc("meta/questionsContentPatchV6"), "V6 標記沒寫");
    assert.strictEqual(store.getDoc("customQuestions/seed_5").userEdited, true, "舊文件被覆寫了");
    const texts = bank(store).map(x=>x.data.q);
    assert.strictEqual(new Set(texts).size, texts.length, "題庫出現重複題目");
    for(let i = BASE.QUESTIONS[0]; i < nQ; i++) assert.deepStrictEqual(store.getDoc("customQuestions/seed_" + i).q, D.QUESTIONS[i][0]);
    for(let i = BASE.TARGETED_QUESTIONS[0]; i < nT; i++) assert.deepStrictEqual(store.getDoc("customQuestions/seedv2_" + i).q, D.TARGETED_QUESTIONS[i][0]);
    // 抽題池：全部類別都有題、總數正確
    const poolN = c.ev("getPool().length"); assert.strictEqual(poolN, nQ + nT);
    for(const cat of CATS) assert(c.ev(`getPool(${JSON.stringify([cat])}).length`) >= PER_CAT_MIN, cat);
    // 第二個用戶端（模擬另一支手機/重新整理）：不再寫入、不重複
    const w1 = store.log.length;
    createClient({ file, kind, store, clock }); await clock.run(3000);
    assert.strictEqual(bank(store).length, nQ + nT); assert.strictEqual(store.log.length, w1, "已有 V6 標記，不該再寫入");
    assert(store.log.length > writesBefore);
  });

  await test("V6 補丁：全新資料庫（沒有任何標記）最後也恰好每題一份、沒有重複", async ()=>{
    const clock = new Clock(), store = new Store(clock, kind);
    ["meta/questionsSeeded","meta/questionsSeededV2","meta/questionsContentPatchV5"].forEach(p=>store.docs.delete(p));
    createClient({ file, kind, store, clock }); await clock.run(8000);
    const rows = bank(store).filter(r=>r.id.startsWith("seed"));
    assert.strictEqual(rows.length, D.QUESTIONS.length + D.TARGETED_QUESTIONS.length);
    assert.strictEqual(new Set(rows.map(r=>r.data.q)).size, rows.length);
    ["meta/questionsSeeded","meta/questionsSeededV2","meta/questionsContentPatchV5","meta/questionsContentPatchV6"].forEach(p=>assert(store.getDoc(p), "缺標記 " + p));
  });
}

if(loaded.length > 1) await test("兩份輸出的內建內容完全一致", ()=>{ for(const D of loaded.slice(1)) assert.strictEqual(JSON.stringify(D), JSON.stringify(loaded[0])); });
summary("content");
})();
