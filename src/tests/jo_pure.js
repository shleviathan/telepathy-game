const fs=require('fs'), vm=require('vm'), assert=require('assert');
function load(f){
  const s=fs.readFileSync(f,'utf8');
  const a=s.indexOf('const JO_WORDS = ['), bMark='let joRenderedKey = "";';
  const b=s.indexOf(bMark)+bMark.length;
  const code=s.slice(a,b)+'\nthis.X={JO_WORDS,joNorm,joValidateHint,joResolveHints,joGuessCorrect,joApplyResult,joOverride,joAfterRound,joNextGuesser,joEligible,joAdvancePatch,joRating,joBuildDeck,joTotal,joKeyOf};';
  const ctx={}; vm.createContext(ctx); vm.runInContext(code,ctx); return ctx.X;
}
for(const f of process.argv.slice(2)){
  const J=load(f); console.log('--',f);
  // words
  assert.strictEqual(new Set(J.JO_WORDS).size, J.JO_WORDS.length);
  assert(J.JO_WORDS.length>=15+2 && J.JO_WORDS.length>=300, J.JO_WORDS.length);
  assert(J.JO_WORDS.every(w=>w===w.trim() && w.length>=1 && Array.from(w).length<=4));
  assert.strictEqual(new Set(J.JO_WORDS.map(J.joNorm)).size, J.JO_WORDS.length);
  const d13=J.joBuildDeck(13), d7=J.joBuildDeck(7);
  assert.strictEqual(d13.length,15); assert.strictEqual(d7.length,9); assert.strictEqual(new Set(d13).size,15);
  // normalization
  assert.strictEqual(J.joNorm(' Ａｐple！ '), 'apple');
  assert.strictEqual(J.joNorm('蘋 果。'), '蘋果');
  assert.strictEqual(J.joNorm('蘋，果'), '蘋果');
  assert.strictEqual(J.joNorm('ＡＢＣ　ｄ'), 'abcd');
  assert.strictEqual(J.joNorm(null), '');
  assert.strictEqual(J.joNorm('？！…'), '');
  // hint validity
  assert(J.joValidateHint('水果','蘋果').ok);
  assert(!J.joValidateHint('蘋果','蘋果').ok);
  assert(!J.joValidateHint('蘋果派','蘋果').ok);   // contains
  assert(!J.joValidateHint('果','蘋果').ok);       // contained
  assert(!J.joValidateHint('  ','蘋果').ok);
  assert(!J.joValidateHint('紅 色','蘋果').ok);
  assert(!J.joValidateHint('紅　色','蘋果').ok);
  assert(!J.joValidateHint('一二三四五六七八九','蘋果').ok);
  assert(J.joValidateHint('一二三四五六七八','蘋果').ok);
  assert(!J.joValidateHint('！！','蘋果').ok);
  assert(!J.joValidateHint('ＡPple','apple').ok);
  assert.strictEqual(J.joValidateHint('  水果 ','蘋果').text,'水果');
  // resolve: 3 players, two same
  let r=J.joResolveHints({a:'水果',b:' 水果！',c:'紅色'},['a','b','c'],'蘋果');
  assert.deepEqual(r.removedIds.sort(),['a','b']); assert.deepEqual(r.validHints,[{pid:'c',text:'紅色'}]);
  // all duplicates
  r=J.joResolveHints({a:'x1',b:'Ｘ1',c:'x 1'},['a','b','c'],'蘋果');
  assert.strictEqual(r.validHints.length,0); assert.strictEqual(r.removedIds.length,3);
  // 2 pairs + singleton, 3 same
  r=J.joResolveHints({a:'甲',b:'甲',c:'乙',d:'乙',e:'丙',f:'甲'},['a','b','c','d','e','f'],'蘋果');
  assert.deepEqual(r.removedIds.sort(),['a','b','c','d','f']); assert.deepEqual(r.validHints.map(h=>h.pid),['e']);
  // missing hints, non-eligible ignored, invalid-vs-word removed
  r=J.joResolveHints({a:'紅',b:'蘋果醬',z:'紅'},['a','b','c'],'蘋果');
  assert.deepEqual(r.validHints,[{pid:'a',text:'紅'}]); assert.deepEqual(r.removedIds,['b']);
  r=J.joResolveHints({},['a'],'蘋果'); assert.strictEqual(r.validHints.length,0); assert.strictEqual(r.removedIds.length,0);
  // shuffle keeps set
  r=J.joResolveHints({a:'1甲',b:'2乙',c:'3丙',d:'4丁'},['a','b','c','d'],'蘋果'); assert.strictEqual(r.validHints.length,4);
  // guess equality
  assert(J.joGuessCorrect(' 蘋果 ','蘋果')); assert(J.joGuessCorrect('ＡＢ','ab')); assert(!J.joGuessCorrect('','蘋果')); assert(!J.joGuessCorrect('香蕉','蘋果')); assert(!J.joGuessCorrect('！','！'));
  // scoring
  let st={cardsUsed:0,score:0};
  assert.deepEqual(J.joApplyResult(st,'correct'),{cardsUsed:1,score:1,verdict:'correct'});
  assert.deepEqual(J.joApplyResult(st,'skip'),{cardsUsed:1,score:0,verdict:'skip'});
  const w=J.joApplyResult(st,'wrong'); assert.deepEqual(w,{cardsUsed:2,score:0,verdict:'wrong'});
  const o=J.joOverride({...w,overridden:false}); assert.deepEqual(o,{cardsUsed:1,score:1,verdict:'correct',overridden:true});
  assert.strictEqual(J.joOverride({...o}),null); assert.strictEqual(J.joOverride({cardsUsed:1,score:1,verdict:'correct',overridden:false}),null);
  assert.strictEqual(J.joOverride({cardsUsed:1,score:0,verdict:'skip'}),null);
  // end condition
  assert.strictEqual(J.joAfterRound({cardsUsed:6,total:7,deckIndex:5,deckLen:9,verdict:'correct'}).over,false);
  assert.strictEqual(J.joAfterRound({cardsUsed:7,total:7,deckIndex:6,deckLen:9,verdict:'correct'}).over,true);
  assert.strictEqual(J.joAfterRound({cardsUsed:12,total:13,deckIndex:10,deckLen:15,verdict:'skip'}).over,false);
  assert.strictEqual(J.joAfterRound({cardsUsed:13,total:13,deckIndex:11,deckLen:15,verdict:'correct'}).over,true);
  assert.strictEqual(J.joAfterRound({cardsUsed:14,total:13,deckIndex:11,deckLen:15,verdict:'wrong'}).over,true);
  assert.strictEqual(J.joAfterRound({cardsUsed:7,total:7,deckIndex:5,deckLen:9,verdict:'wrong'}).nextIndex,7);
  // full-game simulations: random verdicts; pointer never exceeds deck; terminates; score<=total
  for(const total of [7,13]) for(let t=0;t<2000;t++){
    let used=0,score=0,idx=0,over=false,steps=0; const deckLen=total+2;
    while(!over){ assert(idx<deckLen); steps++;
      const act=['correct','skip','wrong'][Math.floor(Math.random()*3)];
      let r=J.joApplyResult({cardsUsed:used,score},act);
      if(act==='wrong' && Math.random()<0.5){ const o=J.joOverride({...r,overridden:false}); r={...r,...o}; }
      used=r.cardsUsed; score=r.score; const a=J.joAfterRound({cardsUsed:used,total,deckIndex:idx,deckLen,verdict:r.verdict}); idx=a.nextIndex; over=a.over; }
    assert(score<=total && steps<=total);
  }
  // perfect game
  { let used=0,score=0,idx=0,over=false; const total=13; while(!over){ const r=J.joApplyResult({cardsUsed:used,score},'correct'); used=r.cardsUsed; score=r.score; const a=J.joAfterRound({cardsUsed:used,total,deckIndex:idx,deckLen:15,verdict:'correct'}); idx=a.nextIndex; over=a.over; } assert.strictEqual(score,13); }
  // rotation
  const ord=['a','b','c','d'];
  assert.strictEqual(J.joNextGuesser(ord,'a',ord),'b');
  assert.strictEqual(J.joNextGuesser(ord,'d',ord),'a');
  assert.strictEqual(J.joNextGuesser(ord,'a',['a','c','d']),'c');
  assert.strictEqual(J.joNextGuesser(ord,'b',['a','d']),'d');
  assert.strictEqual(J.joNextGuesser(ord,'b',['a','b','d']),'d');
  assert.strictEqual(J.joNextGuesser(ord,'d',['b']),'b');
  assert.strictEqual(J.joNextGuesser(ord,'b',['b']),'b');
  assert.strictEqual(J.joNextGuesser(ord,'b',[]),null);
  assert.strictEqual(J.joNextGuesser(ord,'zz',['a','b']),'a');   // unknown current -> first present
  assert.strictEqual(J.joNextGuesser([],'a',['a']),null);
  assert.strictEqual(J.joNextGuesser(ord,'b',['a','b','e']),'a'); // late joiner 'e' not in order ignored
  assert.deepEqual(J.joEligible(ord,'b',['a','b','d','e']),['a','d']);
  // advance patch
  const fd={settings:{totalRounds:7},deck:J.joBuildDeck(7),guesserOrder:ord,guesserId:'a',round:3};
  let p=J.joAdvancePatch(fd,3,3,ord); assert.strictEqual(p.phase,'clue'); assert.strictEqual(p.guesserId,'b'); assert.deepEqual(p.clueEligible,['a','c','d']); assert.strictEqual(p.round,4); assert.deepEqual(p.hints,{});
  p=J.joAdvancePatch(fd,7,7,ord); assert.strictEqual(p.phase,'ended');
  p=J.joAdvancePatch(fd,8,8,ord); assert.strictEqual(p.phase,'ended');
  p=J.joAdvancePatch(fd,3,3,['a']); assert.strictEqual(p.phase,'ended');   // nobody to hint
  p=J.joAdvancePatch(fd,3,3,['a','c']); assert.strictEqual(p.guesserId,'c'); assert.deepEqual(p.clueEligible,['a']);
  p=J.joAdvancePatch({...fd,settings:{totalRounds:13},deck:J.joBuildDeck(13)},7,7,ord); assert.strictEqual(p.phase,'clue');
  assert.strictEqual(J.joTotal({totalRounds:7}),7); assert.strictEqual(J.joTotal({totalRounds:99}),13); assert.strictEqual(J.joTotal(undefined),13);
  // rating
  const R=s=>J.joRating(s,13);
  assert.deepEqual([13,12,11,10,9,8,7,6,5,4,0].map(R),['完美！','太神啦','太強了','很優秀','很優秀','不錯喔','不錯喔','普通','普通','再接再厲','再接再厲']);
  const R7=s=>J.joRating(s,7);
  assert.strictEqual(R7(7),'完美！'); assert.strictEqual(R7(6),'太強了'); assert.strictEqual(R7(0),'再接再厲'); assert.notStrictEqual(R7(6),'完美！');
  console.log('7-scale',[0,1,2,3,4,5,6,7].map(R7).join('|'));
  console.log('words',J.JO_WORDS.length,'ok');
}
console.log('ALL PASS');
