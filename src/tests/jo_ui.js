const fs=require('fs'), vm=require('vm');
// 只有一個：畫面/動作的 UI 煙霧測試（假 DOM）。用法：node tests/jo_ui.js dist/index.html
const f=process.argv[2]; const s=fs.readFileSync(f,'utf8');
const a=s.indexOf('const JO_WORDS = ['), bm='let joRenderedKey = "";', b=s.indexOf(bm)+bm.length;
const ua=s.indexOf('// ---------- 只有一個：畫面'), ub=s.indexOf('// ---------- data / actions');
const aa=s.indexOf('// ---------- 只有一個：資料 / 動作'), ab=s.indexOf('// 把種子/修正流程中遇到的第一個錯誤');
const code=s.slice(a,b)+s.slice(ua,ub)+s.slice(aa,ab);
const els={};
const ctx={console, Math, Date, Promise, setTimeout,
  esc:x=>String(x==null?"":x), isOnline:()=>true, offBadge:()=>"", onlineIdsOf:()=>[], isHostNow:()=>true, avatarOf:p=>p.avatar||"🙂", helpModalOpen:false, settingsModalOpen:false,
  updateSettings(){}, render(){}, doLeave(){}, playVoteSound(){}, playResultSound(){}, voteBusy:false, resolveBusy:false,
  startError:"", identity:{playerId:'p1'}, playersData:[], roomData:null, app:{innerHTML:''},
  confirm:()=>true,
  document:{activeElement:null,getElementById:id=>els[id]||(els[id]={}),querySelectorAll:()=>[]}};
vm.createContext(ctx); vm.runInContext(code+'\nthis.R={renderJoGame,renderJoHelpModal,renderJoSettingsModal,wireJoSettingsModal,wireJoHelpModal,doStartJustone,doRematchJustone,doJoSubmitHint,doJoGuess,doJoContinue,doJoOverride,doJoReplaceGuesser,doJoForce};',ctx);
const R=ctx.R;
const ps=['p1','p2','p3','p4'].map((id,i)=>({id,name:'N'+id,joinedAt:i,avatar:'🐱'}));
ctx.playersData=ps;
const base={phase:'clue',round:1,settings:{totalRounds:13},deck:['蘋果','香蕉'],deckIndex:0,guesserOrder:['p1','p2','p3','p4'],guesserId:'p1',cardsUsed:0,score:0,clueEligible:['p2','p3','p4'],hints:{},validHints:[],removedIds:[],joGuess:null,joVerdict:null,joOverridden:false,joLog:[]};
const cases=[];
for(const me of ['p1','p2','p5']) for(const host of [true,false]){
  const mk=o=>Object.assign({},base,o);
  cases.push([me,host,mk({})]);
  cases.push([me,host,mk({hints:{p2:'水果'}})]);
  cases.push([me,host,mk({phase:'guess',hints:{p2:'水果',p3:'水果',p4:'紅'},validHints:[{pid:'p4',text:'紅'}],removedIds:['p2','p3']})]);
  cases.push([me,host,mk({phase:'guess'})]);
  for(const v of ['correct','wrong','skip']) cases.push([me,host,mk({phase:'result',joVerdict:v,joGuess:'x',hints:{p2:'a',p3:'b'},joLog:[{word:'蘋果',verdict:v,guesser:'p1'}],cardsUsed:v==='wrong'?2:1})]);
  cases.push([me,host,mk({phase:'ended',score:9,cardsUsed:13,joLog:[{word:'蘋果',verdict:'correct',guesser:'p1',overridden:true},{word:'x',verdict:'skip',guesser:'zz'}]})]);
  cases.push([me,host,mk({guesserId:'zz'})]);
}
let n=0;
for(const [me,host,rd] of cases){ ctx.identity.playerId=me; ctx.roomData=rd; ctx.app.innerHTML=''; R.renderJoGame(ps.find(p=>p.id===me)||{id:me},host); if(!ctx.app.innerHTML.includes('離開房間')||/undefined|\[object/.test(ctx.app.innerHTML)) throw new Error('bad html '+JSON.stringify(rd).slice(0,80)+me); n++; }
// role-specific content checks
function html(me,host,o){ ctx.identity.playerId=me; ctx.roomData=Object.assign({},base,o); ctx.app.innerHTML=''; R.renderJoGame({id:me},host); return ctx.app.innerHTML; }
let h=html('p1',false,{}); if(h.includes('蘋果')||!h.includes('大家正在想提示')) throw new Error('guesser sees word');
h=html('p2',false,{}); if(!h.includes('蘋果')||!h.includes('joHintInput')) throw new Error('hinter');
h=html('p2',false,{hints:{p2:'水果',p3:'紅'}}); if(!h.includes('已送出，等待其他人')||h.includes('紅')||h.includes('joHintInput')) throw new Error('submitted view leaks');
h=html('p1',false,{phase:'guess',hints:{p2:'水果',p3:'水果',p4:'紅'},validHints:[{pid:'p4',text:'紅'}],removedIds:['p2','p3']}); if(h.includes('水果')||!h.includes('紅')||!h.includes('joGuessInput')) throw new Error('guesser guess view');
h=html('p2',false,{phase:'guess',hints:{p2:'水果',p3:'水果',p4:'紅'},validHints:[{pid:'p4',text:'紅'}],removedIds:['p2','p3']}); if(!h.includes('jochip off')||!h.includes('蘋果')||h.includes('joGuessInput')) throw new Error('other guess view');
h=html('p5',true,{}); if(h.includes('joHintInput')||!h.includes('旁觀者')) throw new Error('spectator');
h=html('p2',true,{phase:'result',joVerdict:'wrong',cardsUsed:2}); if(!h.includes('joOverrideBtn')||!h.includes('joNextBtn')) throw new Error('host result');
h=html('p2',true,{phase:'result',joVerdict:'wrong',joOverridden:true,cardsUsed:2}); if(h.includes('joOverrideBtn')) throw new Error('override twice');
h=html('p2',false,{phase:'result',joVerdict:'wrong',cardsUsed:2}); if(h.includes('joOverrideBtn')||h.includes('joNextBtn')) throw new Error('nonhost buttons');
h=html('p2',true,{guesserId:'zz'}); if(!h.includes('joReplaceBtn')||!h.includes('joForceBtn')) throw new Error('replace btn');
h=html('p2',true,{phase:'ended',score:13,cardsUsed:13}); if(!h.includes('完美')||!h.includes('rematchBtn')) throw new Error('ended');
R.renderJoHelpModal(); R.renderJoSettingsModal(true,{totalRounds:7});
console.log(f.split('/').pop(),'smoke ok',n,'cases');
