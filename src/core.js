//#@ base
const CATEGORIES = [
  {id:"food", label:"飲食"},
  {id:"travel", label:"旅行"},
  {id:"life", label:"生活日常"},
  {id:"work_money", label:"工作與金錢"},
  {id:"relationship", label:"感情與人際"},
  {id:"entertainment", label:"娛樂嗜好"},
  {id:"values", label:"個性與價值觀"},
  {id:"fantasy", label:"幻想與假設"},
  {id:"memory", label:"回憶"},
  {id:"aboutyou", label:"關於你"},
  {id:"other", label:"其他"}
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c=>[c.id, c.label]));
const ALL_CATEGORY_IDS = CATEGORIES.map(c=>c.id);
const AVATARS = ["🦊","🐱","🐶","🐼","🐨","🐸","🦁","🐵","🐰","🐯","🦄","🐙","🦉","🐢","🐧","🦋","🐻","🐮","🐷","🦖"];
function randomAvatar(){ return AVATARS[Math.floor(Math.random()*AVATARS.length)]; }

//#@ content
function avatarOf(p){ return (p && p.avatar) || "🙂"; }
const QUESTIONS = [
["你覺得如果PP中了一億，會先做什麼？",["環遊世界", "買房子", "捐一半出去", "存起來不動"],"work_money"],
["你猜PP以前上課傳紙條最常聊什麼？",["八卦誰喜歡誰", "抱怨老師", "約放學要幹嘛", "作業或考試"],"memory"],
["你認為PP假日比較想做什麼？",["在家耍廢", "出門爬山", "逛街購物", "找朋友聚餐"],"life"],
["你覺得PP覺得哪個最重要？",["健康", "金錢", "愛情", "自由"],"values"],
["你猜PP以前段考完最常做什麼放鬆？",["馬上出去玩", "睡到爽", "打電動", "聚餐慶祝"],"memory"],
["你認為PP早餐會選哪一種？",["蛋餅", "吐司", "漢堡", "飯糰"],"food"],
["你覺得PP週末旅行想去哪裡？",["海邊", "山上", "城市", "鄉下"],"travel"],
["你猜PP最怕的是？",["蟑螂", "蛇", "高處", "黑暗"],"life"],
["你認為以前營養午餐PP最期待哪一道？",["咖哩飯", "炸雞腿", "義大利麵", "水果優格"],"memory"],
["你覺得PP會怎麼跨年？",["看煙火", "在家看電視", "跟朋友吃飯", "早點睡"],"life"],
["你猜PP最想學的才藝是？",["吉他", "畫畫", "跳舞", "烹飪"],"entertainment"],
["你認為PP會選哪種飲料？",["珍珠奶茶", "咖啡", "果汁", "氣泡水"],"food"],
["你覺得PP出國想去哪裡？",["日本", "歐洲", "美國", "東南亞"],"travel"],
["你猜PP覺得最浪漫的驚喜？",["燭光晚餐", "驚喜派對", "手寫信", "說走就走的旅行"],"relationship"],
["你認為PP遇到塞車會怎麼做？",["聽音樂", "滑手機", "按喇叭抱怨", "冷靜等待"],"life"],
["你覺得PP比較想住哪裡？",["海邊小屋", "市中心公寓", "山上木屋", "鄉下農舍"],"life"],
["你猜PP會選哪個當寵物？",["貓", "狗", "兔子", "魚"],"life"],
["你認為PP半夜肚子餓會怎麼做？",["泡麵", "吃水果", "忍住不吃", "叫外送"],"food"],
["你覺得放學後PP最常去哪裡晃？",["補習班", "同學家", "便利商店", "直接回家"],"memory"],
["你猜PP會選哪種電影？",["喜劇", "恐怖片", "愛情片", "動作片"],"entertainment"],
["你認為以前上學PP最常用哪種方式抵達學校？",["走路", "騎腳踏車", "家人接送", "搭公車或捷運"],"memory"],
["你覺得假如可以回到過去，PP想回到哪個階段？",["小學", "高中", "大學", "不想回去"],"memory"],
["你猜PP比較討厭哪一種？",["遲到", "被放鴿子", "被說謊", "對方小氣"],"values"],
["你認為PP會選哪種旅遊方式？",["自由行", "跟團", "背包客", "家庭旅遊"],"travel"],
["你覺得PP最想住哪個時代？",["古代", "未來", "現代", "中世紀"],"fantasy"],
["你猜PP會選哪個宵夜？",["鹽酥雞", "滷味", "燒烤", "火鍋"],"food"],
["你認為PP遇到蟑螂會怎麼做？",["尖叫逃跑", "拿拖鞋打", "假裝沒看到", "叫別人處理"],"life"],
["你覺得PP會選哪個假日活動？",["看電影", "打電動", "運動", "睡覺"],"entertainment"],
["你猜PP最想要的生日禮物？",["驚喜派對", "現金", "親手做的禮物", "一起出去玩"],"relationship"],
["你認為PP會選哪個交通工具環島？",["機車", "開車", "火車", "腳踏車"],"travel"],
["你覺得PP覺得最重要的朋友特質？",["幽默", "可靠", "真誠", "聰明"],"relationship"],
["你猜PP會怎麼慶祝生日？",["跟家人吃飯", "朋友聚會", "自己一個人過", "出去旅行"],"relationship"],
["你認為PP會選哪種鍋？",["麻辣鍋", "涮涮鍋", "酸菜白肉鍋", "石頭火鍋"],"food"],
["你覺得PP最想精通哪個語言？",["英文", "日文", "韓文", "法文"],"values"],
["你猜PP週末下雨會怎麼做？",["在家追劇", "睡到自然醒", "看書", "打掃家裡"],"life"],
["你認為PP會選哪個超市必買？",["零食", "飲料", "冰淇淋", "水果"],"food"],
["你覺得PP最想收到的訊息？",["生日快樂", "我愛你", "加薪了", "中獎了"],"relationship"],
["你猜PP會選哪個當週末早餐地點？",["早餐店", "便利商店", "自己煮", "不吃早餐"],"food"],
["你認為PP比較想要更多哪一種？",["時間", "金錢", "才華", "朋友"],"values"],
["你覺得PP會選哪個顏色的天空最美？",["日出的橘色", "正午的藍色", "黃昏的紫色", "夜晚的黑色"],"life"],
["你猜PP會選哪個當作生活必需品？",["手機", "咖啡", "音樂", "陽光"],"life"],
["你認為PP覺得哪一種天氣最舒服？",["晴天", "雨天", "多雲", "下雪天"],"life"],
["你覺得PP會選哪個當背景音樂？",["抒情歌", "搖滾", "爵士", "古典樂"],"entertainment"],
["你猜PP比較想要哪種工作型態？",["朝九晚五", "彈性上班", "遠端工作", "自己創業"],"work_money"],
["你認為小時候下課十分鐘PP最常做什麼？",["聊天", "去福利社", "趴著休息", "跑出去玩"],"memory"],
["你覺得PP假日想睡到什麼時候？",["自然醒", "中午", "下午", "照常早起"],"life"],
["你猜PP這群朋友揪聚餐，最常吃哪一種？",["火鍋", "燒肉", "熱炒", "小吃店"],"life"],
["你認為PP最想擁有哪種才能？",["唱歌好聽", "很會說話", "過目不忘", "運動神經好"],"values"],
["你覺得PP會選哪個社群平台最常用？",["Instagram", "Facebook", "YouTube", "TikTok"],"entertainment"],
["你猜PP比較想跟誰一起旅行？",["家人", "另一半", "朋友", "自己一個人"],"travel"],
["你認為PP會選哪種咖啡？",["美式", "拿鐵", "卡布奇諾", "黑咖啡"],"food"],
["你覺得PP最想住在哪種城市？",["台北", "東京", "紐約", "小鎮"],"travel"],
["你猜PP會選哪個休閒運動？",["打籃球", "游泳", "慢跑", "瑜珈"],"entertainment"],
["你認為PP會選哪種零食？",["洋芋片", "巧克力", "軟糖", "堅果"],"food"],
["你覺得PP比較想要哪種假期？",["海島度假", "文化古蹟之旅", "極限運動", "什麼都不做"],"travel"],
["你猜PP會選哪個當手機桌布？",["風景照", "家人朋友合照", "寵物照", "簡約純色"],"life"],
["你認為PP會選哪種手作課程？",["陶藝", "烘焙", "繪畫", "木工"],"entertainment"],
["你覺得PP覺得哪個最能代表友情？",["互相陪伴", "互相幫忙", "可以說真心話", "一起經歷過的事"],"relationship"],
["你猜PP以前教室座位最想坐哪裡？",["最後一排", "靠窗", "中間", "靠門口"],"memory"],
["你認為PP會選哪種派對主題？",["萬聖節", "生日派對", "尾牙", "畢業派對"],"entertainment"],
["你覺得PP比較想要哪種存款目標？",["買車", "買房", "出國旅遊", "提早退休"],"work_money"],
["你猜PP會選哪個當週末電影院爆米花口味？",["原味鹹", "焦糖", "起司", "巧克力"],"food"],
["你認為PP會選哪種鬧鐘鈴聲？",["輕音樂", "鳥叫聲", "傳統鬧鐘聲", "自己選的歌"],"life"],
["你覺得PP覺得哪個最浪費時間？",["滑手機", "追劇", "打電動", "發呆"],"values"],
["你猜PP會選哪個當紀念日禮物？",["首飾", "香水", "手錶", "體驗券"],"relationship"],
["你認為PP會選哪種家庭聚餐？",["在家煮", "訂外送", "出去吃", "自助餐"],"food"],
["你覺得PP比較想學會哪種運動？",["衝浪", "滑雪", "攀岩", "潛水"],"entertainment"],
["你猜PP以前段考前一晚通常在幹嘛？",["臨時抱佛腳", "早就唸完了", "跟同學討論", "已經放棄掙扎"],"memory"],
["你認為PP會選哪種寵物零食？",["罐頭", "零食條", "凍乾", "自製鮮食"],"life"],
["你覺得朋友揪團出去玩，PP通常負責哪個角色？",["排行程規劃", "訂位搶票", "拍照記錄", "負責聊天炒氣氛"],"life"],
["你猜PP會選哪個電玩類型？",["角色扮演", "射擊遊戲", "解謎遊戲", "模擬經營"],"entertainment"],
["你認為PP比較想住哪種房子？",["透天厝", "電梯大樓", "老公寓", "鄉間別墅"],"life"],
["你覺得PP會選哪種下午茶？",["蛋糕", "鬆餅", "馬卡龍", "司康"],"food"],
["你猜PP會選哪個當旅行紀念品？",["磁鐵", "明信片", "當地特產", "照片"],"travel"],
["你認為PP小時候最愛玩哪種下課遊戲？",["跳格子", "橡皮筋", "紙牌交換", "躲避球"],"memory"],
["你覺得PP會選哪個當緊急聯絡對象？",["家人", "另一半", "好朋友", "同事"],"relationship"],
["你猜PP覺得哪個最療癒？",["看海", "看夕陽", "看星星", "看雲"],"life"],
["你認為PP會選哪種考試複習方式？",["做題目", "看筆記", "找人討論", "臨時抱佛腳"],"values"],
["你覺得PP比較想收到哪種稱讚？",["你很聰明", "你很善良", "你很有才華", "你很努力"],"relationship"],
["你猜PP會選哪個當生日蛋糕口味？",["巧克力", "草莓", "抹茶", "起司"],"food"],
["你認為PP會選哪種書？",["小說", "漫畫", "心理勵志", "工具書"],"entertainment"],
["你覺得PP比較想學哪種樂器？",["鋼琴", "吉他", "爵士鼓", "小提琴"],"entertainment"],
["你猜PP會選哪個當旅行交通方式？",["搭飛機", "搭火車", "自駕", "搭船"],"travel"],
["你認為PP覺得哪個是最重要的人生階段？",["學生時期", "出社會工作", "成家立業", "退休生活"],"values"],
["你覺得PP會選哪種筆記方式？",["手寫筆記本", "手機備忘錄", "電腦文件", "不做筆記"],"life"],
["你猜PP比較想要哪種天氣的婚禮？",["晴天戶外", "室內宴會廳", "雨天也浪漫", "海邊夕陽"],"relationship"],
["你認為PP會選哪個當週末睡前習慣？",["滑手機", "看書", "聽音樂", "立刻睡著"],"life"],
["你覺得PP覺得哪個最考驗耐心？",["排隊", "塞車", "等人", "等外送"],"life"],
["你猜PP會選哪種家事最不想做？",["洗碗", "拖地", "洗衣服", "倒垃圾"],"life"],
["你認為PP比較想養哪種植物？",["多肉植物", "香草植物", "花", "不想養植物"],"life"],
["你覺得PP會選哪個當週年慶必買？",["保養品", "衣服", "家電", "什麼都不買"],"life"],
["你猜PP覺得哪個最能讓心情變好？",["吃美食", "聽音樂", "運動", "睡一覺"],"life"],
["你認為PP會選哪種旅遊住宿？",["星級飯店", "民宿", "青年旅館", "露營"],"travel"],
["你覺得朋友生日聚會PP通常怎麼慶祝？",["訂蛋糕唱生日歌", "揪出去吃大餐", "準備驚喜禮物", "單純聚在一起聊天"],"relationship"],
["你猜PP會選哪個當生活小確幸？",["喝一杯好咖啡", "曬太陽", "完成待辦清單", "收到朋友訊息"],"life"],
["你認為PP覺得哪個工作福利最重要？",["高薪", "彈性工時", "多天假", "好同事"],"work_money"],
["你覺得PP會選哪種旅行伴手禮預算？",["精打細算", "適量就好", "喜歡就買", "不買紀念品"],"travel"],
["你猜PP比較想要哪種週末天氣？",["晴朗涼爽", "溫暖有陽光", "微雨舒服", "在家吹冷氣最好"],"life"],
["你認為PP會選哪個當減壓方式？",["運動流汗", "找人聊天", "獨處放空", "大吃一頓"],"life"],
["你覺得PP覺得哪個最能代表台灣？",["夜市小吃", "便利商店", "珍珠奶茶", "機車"],"life"],
["你猜PP會選哪個人生座右銘方向？",["活在當下", "凡事努力", "順其自然", "勇敢冒險"],"values"],
];
// 「關於你」題型：PP 會在出題時被隨機替換成場上其中一位玩家的名字，全場一起猜這個人的答案。
const TARGETED_QUESTIONS = [
["你認為PP最討厭做哪件家事？",["洗碗", "拖地", "倒垃圾", "摺衣服"],"aboutyou"],
["你覺得PP半夜肚子餓最可能吃什麼？",["泡麵", "餅乾", "水果", "什麼都不吃"],"aboutyou"],
["你猜PP最想立刻擁有的超能力是？",["飛行", "隱形", "讀心", "瞬間移動"],"aboutyou"],
["如果PP中了樂透，你猜他/她最先做的事？",["環遊世界", "買房子", "存起來", "請大家吃飯"],"aboutyou"],
["你覺得PP壓力大的時候最可能做什麼？",["大吃一頓", "睡覺", "滑手機", "找人聊天"],"aboutyou"],
["你猜PP最不擅長的家務是？",["煮飯", "洗衣服", "整理房間", "修東西"],"aboutyou"],
["你認為PP最有可能因為什麼遲到？",["睡過頭", "塞車", "找不到東西", "出門前又折返"],"aboutyou"],
["你猜PP週末最想做的事是？",["躺平耍廢", "出去玩", "運動", "加班或唸書"],"aboutyou"],
["你覺得PP最怕的是？",["蟑螂", "鬼片", "打針", "上台報告"],"aboutyou"],
["你猜PP的手機桌布最可能是？",["自己的照片", "風景", "家人朋友", "預設桌布"],"aboutyou"],
["你認為PP最容易因為什麼生氣？",["被放鴿子", "東西亂放", "講話被打斷", "輸遊戲"],"aboutyou"],
["你猜PP小時候的夢想職業是？",["老師", "太空人", "明星", "忘記了"],"aboutyou"],
["你覺得PP最常忘記帶的東西是？",["鑰匙", "手機", "雨傘", "錢包或悠遊卡"],"aboutyou"],
["你猜PP最想學會的才藝是？",["唱歌", "畫畫", "彈樂器", "跳舞"],"aboutyou"],
["你認為PP遇到困難時最先找誰幫忙？",["家人", "朋友", "另一半", "自己解決"],"aboutyou"],
["你猜PP如果放假一整週會怎麼安排？",["在家耍廢", "出國旅行", "學新東西", "陪家人朋友"],"aboutyou"],
["你覺得PP最喜歡的天氣是？",["晴天", "下雨天", "下雪天", "涼爽陰天"],"aboutyou"],
["你猜PP最捨不得丟掉的東西是？",["舊照片", "舊衣服", "紀念品", "書信卡片"],"aboutyou"],
["你認為PP最想去的地方是？",["日本", "歐洲", "美國", "東南亞"],"aboutyou"],
["你猜PP如果突然變有錢，第一件事會？",["犒賞自己", "孝親或給家人", "拿去投資", "低調不改變生活"],"aboutyou"],
];
const LETTERS = ["A","B","C","D"];

const LS_KEY = "telepathy_identity_v1";
function loadIdentity(){ try{ return JSON.parse(sessionStorage.getItem(LS_KEY)||"null"); }catch(e){ return null; } }
function saveIdentity(v){ try{ sessionStorage.setItem(LS_KEY, JSON.stringify(v)); }catch(e){} }
function uid(){ return Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); }
function roomCode(){ const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s=""; for(let i=0;i<4;i++) s+=chars[Math.floor(Math.random()*chars.length)]; return s; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function getPool(enabledCategories){
  const enabled = enabledCategories && enabledCategories.length ? new Set(enabledCategories) : new Set(ALL_CATEGORY_IDS);
  const all = customQuestionsData.map(c=>({q:c.q, options:c.options, category:c.category||"other", kind:c.builtin?"builtin":"custom", key:c.id, targeted:!!c.targeted}));
  return all.filter(item=>enabled.has(item.category));
}
// 每一題都會帶入「本輪主角」：PP 會被換成本輪輪到的玩家名字，全場一起猜這個人的答案。
// 主角是依加入順序（joinedAt）輪流分配，用回合數(round)決定輪到誰，不是隨機挑，確保每個人被當主角的次數公平。
function pickProtagonist(players, round){
  if(!players || !players.length) return null;
  const ordered = players.slice().sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));
  const idx = ((round||1)-1) % ordered.length;
  return ordered[idx];
}
function materializeQuestion(item, players, round){
  if(!players || !players.length) return {q:item.q, options:item.options};
  const p = pickProtagonist(players, round);
  const nm = p ? p.name : "某人";
  return {q:item.q.replace(/PP/g, nm), options:item.options};
}
//#@ runtime
// ---------- 音效 / 震動回饋 ----------
function setSoundEnabled(v){
  soundEnabled = v;
  try{ localStorage.setItem("telepathySound", v?"on":"off"); }catch(e){}
}
function beep(freq, durMs, type){
  if(!soundEnabled) return;
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type||"sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.16, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durMs/1000);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + durMs/1000);
  }catch(e){}
}
function vibrate(pattern){
  if(!soundEnabled) return;
  try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(e){}
}
function playVoteSound(){ beep(520,70,"sine"); vibrate(15); }
function playResultSound(safe){
  if(safe){
    beep(660,90,"sine");
    setTimeout(()=>beep(880,120,"sine"), 90);
    vibrate(20);
  } else {
    beep(180,220,"sawtooth");
    vibrate([40,40,40]);
  }
}

// ---------- 房間過期清理 ----------
//#if standalone
// 房間資料一直沒動作就會永遠留在資料庫裡，這裡順手把整組房間（玩家/投票/鎖）都清掉。
//#else
// 房間資料一直沒動作就會永遠留在資料庫裡，這裡順手把整組房間（玩家/投票）都清掉。
//#endif
async function deleteRoomBestEffort(ref){
  try{
    const pCol = ref.collection("players");
    const vCol = ref.collection("votes");
//#if standalone
    const lCol = ref.collection("_locks");
    const [pSnap, vSnap, lSnap] = await Promise.all([
//#else
    const [pSnap, vSnap] = await Promise.all([
//#endif
      pCol.get().catch(()=>({docs:[]})),
      vCol.get().catch(()=>({docs:[]})),
//#if standalone
      lCol.get().catch(()=>({docs:[]})),
//#endif
    ]);
    await Promise.all([
      ...pSnap.docs.map(dd=>pCol.doc(dd.id).delete().catch(()=>{})),
      ...vSnap.docs.map(dd=>vCol.doc(dd.id).delete().catch(()=>{})),
//#if standalone
      ...lSnap.docs.map(dd=>lCol.doc(dd.id).delete().catch(()=>{})),
//#endif
    ]);
    await ref.delete();
  }catch(e){}
}
function touchActivity(){
  if(roomRef) roomRef.update({lastActivityAt: Date.now()}).catch(()=>{});
}

// 用 usedKeys（這一局已經抽過的題目 id）排除掉抽過的題目，同一局不會再抽到同一題。
// 如果選的類型池子小、整組都抽完了，就重新洗牌繼續玩（resetUsed 會告訴呼叫端把已抽清單重新算）。
function pickQuestion(usedKeys, enabledCategories){
  const pool = getPool(enabledCategories);
  if(pool.length===0) return {idx:-1, pool, resetUsed:false};
  const usedSet = new Set(usedKeys||[]);
  let candidates = pool.map((item,i)=>i).filter(i=>!usedSet.has(pool[i].key));
  let resetUsed = false;
  if(candidates.length===0){
    candidates = pool.map((item,i)=>i);
    resetUsed = true;
  }
  const idx = candidates[Math.floor(Math.random()*candidates.length)];
  return {idx, pool, resetUsed};
}

let db=null;
let identity = loadIdentity();
let roomRef=null, playersCol=null, votesCol=null, customQuestionsCol=null;
let unsubRoom=null, unsubPlayers=null, unsubVotes=null, unsubCustomQuestions=null;
let pollTimer=null;
let roomData=null, playersData=[], votesData=[], customQuestionsData=[];
let joinError = "";
let sharedLinkProbePending = false; // 從 ?code= 連結進來時，第一次畫出首頁後偷偷查一次房間有沒有密碼
let homeTab="create", homeName="", homeCode="", homePassword="", homeAvatar=randomAvatar();
let homeGameType = "telepathy"; // 開新房間時選的遊戲；加入房間時不用選，遊戲類型由房主的房間決定
let mlRevealAnimRound = null, mlRevealReady = false, mlSoundedRound = null;
let mlRankOrder = null, mlRankOrderRound = null; // 「誰最可能」排序中的本地暫存排序（送出前不寫進資料庫）
let mlDragging = false; // 是否正在拖曳排序中，拖曳時暫停畫面重畫
let strokesCol = null, unsubStrokes = null, strokesData = [];
let drawingInProgress = false; // 目前是否正在畫一筆，畫的當下不要整頁重畫
let drawGuessInput = ""; // 猜謎者輸入中的猜測文字
let drawPromptAnimRound = null; // 已經播放過拉霸抽題動畫的回合，避免重複播放
let drawPromptAnimating = false; // 拉霸動畫播放中，暫停整頁重繪
// 分享出去的連結會帶 ?code=XXXX，開啟時直接幫忙切到「加入房間」分頁並帶入代碼。
try{
  const _params = new URLSearchParams(location.search);
  const _sharedCode = (_params.get("code")||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,4);
  if(_sharedCode){ homeTab = "join"; homeCode = _sharedCode; sharedLinkProbePending = true; }
}catch(e){}
let tickTimer=null;
// 房間超過這麼久沒有任何動作，視為過期，加入時會被擋下並順手清掉舊資料。
const ROOM_EXPIRE_MS = 12*60*60*1000;
let expireCleanupDone = false;
let soundEnabled = (function(){ try{ return localStorage.getItem("telepathySound") !== "off"; }catch(e){ return true; } })();
let audioCtx = null;
let soundedRound = null;
let voteBusy=false, resolveBusy=false;

const app = document.getElementById("app");

