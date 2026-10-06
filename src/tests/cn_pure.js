const fs=require('fs'), vm=require('vm'), assert=require('assert');
for(const f of process.argv.slice(2)){
  const t=fs.readFileSync(f,'utf8');
  const ia=t.indexOf('const CN_WORDS = ['); const ib=t.indexOf('let cnSel = null;');
  assert(ia>0&&ib>ia);
  const ctx={}; vm.createContext(ctx);
  vm.runInContext(t.slice(ia,ib)+';this.api={CN_WORDS,cnGenBoard,cnValidateClue,cnApplyGuess,cnBalanceTeams,cnCountLeft,cnTeamsError,cnOther};',ctx);
  const {CN_WORDS,cnGenBoard,cnValidateClue,cnApplyGuess,cnBalanceTeams,cnCountLeft,cnTeamsError}=ctx.api;
  assert(CN_WORDS.length>=25); assert.strictEqual(new Set(CN_WORDS).size,CN_WORDS.length);
  console.log(f,'words',CN_WORDS.length);
  for(let it=0;it<3000;it++){
    const st=it%2?"red":"blue"; const bb0=cnGenBoard(st);
    assert.strictEqual(bb0.length,25); assert.strictEqual(new Set(bb0.map(c=>c.word)).size,25);
    const n={red:0,blue:0,neutral:0,assassin:0}; bb0.forEach(c=>{n[c.color]++; assert(!c.revealed);});
    assert.strictEqual(n[st],9); assert.strictEqual(n[st==='red'?'blue':'red'],8); assert.strictEqual(n.neutral,7); assert.strictEqual(n.assassin,1);
  }
  // clue validation
  const bd=[{word:'蘋果',revealed:false},{word:'火',revealed:false},{word:'老虎',revealed:true},{word:'水',revealed:false}];
  assert(cnValidateClue('水果',bd).ok===false); // contains 水
  assert(cnValidateClue('蘋果',bd).ok===false);
  assert(cnValidateClue('  ',bd).ok===false); assert(cnValidateClue('',bd).ok===false);
  assert(cnValidateClue('老虎機',bd).ok===true); // revealed word ignored
  assert(cnValidateClue('動物',bd).ok===true);
  assert(cnValidateClue('a b',bd).ok===false);
  assert(cnValidateClue('一二三四五六七八九',bd).ok===false);
  assert(cnValidateClue('  動物  ',bd).word==='動物');
  const bd2=[{word:'蘋果派',revealed:false}]; assert(!cnValidateClue('蘋果',bd2).ok); // contained-in
  // guess logic
  const mk=(cols)=>cols.map((c,i)=>({word:'w'+i,color:c,revealed:false}));
  var b=mk(['red','red','blue','neutral','assassin','blue','red']);
  var r=cnApplyGuess({board:b,turnTeam:'red',guessesLeft:3},0);
  assert.deepStrictEqual([r.outcome,r.phase,r.turnTeam,r.guessesLeft,r.redLeft],['own','guess','red',2,2]);
  r=cnApplyGuess({board:b,turnTeam:'red',guessesLeft:1},0); assert.deepStrictEqual([r.phase,r.turnTeam],['clue','blue']);
  r=cnApplyGuess({board:b,turnTeam:'red',guessesLeft:3},3); assert.deepStrictEqual([r.outcome,r.phase,r.turnTeam],['neutral','clue','blue']);
  r=cnApplyGuess({board:b,turnTeam:'red',guessesLeft:3},2); assert.deepStrictEqual([r.outcome,r.phase,r.turnTeam,r.blueLeft],['opponent','clue','blue',1]);
  r=cnApplyGuess({board:b,turnTeam:'red',guessesLeft:3},4); assert.deepStrictEqual([r.outcome,r.phase,r.winner,r.winReason],['assassin','ended','blue','assassin']);
  r=cnApplyGuess({board:b,turnTeam:'blue',guessesLeft:3},4); assert.strictEqual(r.winner,'red');
  // win by all revealed (own)
  b=mk(['red','blue','blue']); b[0].revealed=true;
  // red all revealed earlier is impossible in play, but test cause-by-opponent: blue team reveals last red
  b=mk(['red','blue','blue']); r=cnApplyGuess({board:b,turnTeam:'blue',guessesLeft:2},0); assert.deepStrictEqual([r.phase,r.winner,r.winReason],['ended','red','all']);
  b=mk(['red','blue','blue']); b[1].revealed=true; r=cnApplyGuess({board:b,turnTeam:'blue',guessesLeft:2},2); assert.deepStrictEqual([r.phase,r.winner],['ended','blue']);
  assert.strictEqual(cnApplyGuess({board:r.board,turnTeam:'blue',guessesLeft:2},2),null);
  assert.strictEqual(cnApplyGuess({board:b,turnTeam:'blue',guessesLeft:2},99),null);
  // unlimited
  r=cnApplyGuess({board:mk(['red','red','red','blue']),turnTeam:'red',guessesLeft:99},0); assert.strictEqual(r.guessesLeft,98);
  // balance
  for(let n=4;n<=10;n++) for(let it=0;it<500;it++){
    const ids=Array.from({length:n},(_,i)=>'p'+i); const m=cnBalanceTeams(ids);
    assert.strictEqual(Object.keys(m).length,n);
    const rr=ids.filter(i=>m[i]==='red').length, bb=n-rr; assert(Math.abs(rr-bb)<=1); assert(rr>=2&&bb>=2);
  }
  assert(cnTeamsError([{team:'red'},{team:'red'},{team:'blue'},{team:null}]));
  assert(cnTeamsError([{team:'red'},{team:'red'},{team:'red'},{team:'blue'}]));
  assert.strictEqual(cnTeamsError([{team:'red'},{team:'red'},{team:'blue'},{team:'blue'}]),'');
}
console.log('ALL TESTS PASS');
