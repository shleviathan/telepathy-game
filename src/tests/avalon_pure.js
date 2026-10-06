const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
// extract pure block verbatim from the shipped file
const a=src.indexOf('const AVALON_TEAM_SIZES'), b=src.indexOf('let avalonPickDraft');
const code=src.slice(a,b)+'\nreturn {AVALON_TEAM_SIZES,AVALON_FACTION_COUNTS,assignAvalonRoles,avalonNightInfo,isEvilRole,avalonTeamSize,avalonFailsNeeded,avalonTally,avalonNextLeader};';
const L=new Function(code)();
const assert=require('assert');
let checks=0;
for(let n=5;n<=10;n++){
  for(let mask=0;mask<8;mask++){
    const rs={percival:!!(mask&1),morgana:!!(mask&2),mordred:!!(mask&4)};
    for(let rep=0;rep<200;rep++){
      const players=Array.from({length:n},(_,i)=>({id:'p'+i}));
      const roles=L.assignAvalonRoles(players,rs);
      const vals=Object.values(roles);
      assert.strictEqual(Object.keys(roles).length,n);
      const c=L.AVALON_FACTION_COUNTS[n];
      assert.strictEqual(vals.filter(L.isEvilRole).length,c.evil);
      assert.strictEqual(vals.filter(v=>!L.isEvilRole(v)).length,c.good);
      const cnt=r=>vals.filter(v=>v===r).length;
      assert.strictEqual(cnt('merlin'),1); assert.strictEqual(cnt('assassin'),1);
      ['percival','morgana','mordred'].forEach(r=>assert(cnt(r)<=1));
      const evilSlots=c.evil, goodSlots=c.good;
      assert.strictEqual(cnt('morgana'), (rs.morgana && evilSlots>=2)?1:0);
      assert.strictEqual(cnt('mordred'), (rs.mordred && evilSlots>=2+(rs.morgana?1:0))?1:0);
      assert.strictEqual(cnt('percival'), (rs.percival && goodSlots>=2)?1:0);
      assert.strictEqual(cnt('minion')+cnt('assassin')+cnt('morgana')+cnt('mordred'),evilSlots);
      assert.strictEqual(cnt('loyal')+cnt('merlin')+cnt('percival'),goodSlots);
      // night info
      const ids=players.map(p=>p.id);
      ids.forEach(id=>{
        const info=L.avalonNightInfo(roles,id,ids), r=roles[id];
        if(L.isEvilRole(r)){ assert.deepStrictEqual(info.ids.slice().sort(), ids.filter(x=>x!==id&&L.isEvilRole(roles[x])).sort()); assert(!info.ids.includes(id)); }
        else if(r==='merlin'){ assert(info.ids.every(x=>L.isEvilRole(roles[x])&&roles[x]!=='mordred')); assert.strictEqual(info.ids.length, c.evil-cnt('mordred')); }
        else if(r==='percival'){ assert(info.ids.every(x=>['merlin','morgana'].includes(roles[x]))); assert.strictEqual(info.ids.length,1+cnt('morgana')); }
        else assert.strictEqual(info.ids.length,0);
      });
      checks++;
    }
  }
}
// spot checks: 5 players all toggles: percival+morgana present, mordred never
const r5=L.assignAvalonRoles(Array.from({length:5},(_,i)=>({id:'p'+i})),{percival:true,morgana:true,mordred:true});
assert(!Object.values(r5).includes('mordred'));
const r10=L.assignAvalonRoles(Array.from({length:10},(_,i)=>({id:'p'+i})),{percival:true,morgana:true,mordred:true});
assert(Object.values(r10).includes('mordred')&&Object.values(r10).includes('percival'));
// team sizes
const exp={5:[2,3,2,3,3],6:[2,3,4,3,4],7:[2,3,3,4,4],8:[3,4,4,5,5],9:[3,4,4,5,5],10:[3,4,4,5,5]};
for(let n=5;n<=10;n++) for(let m=1;m<=5;m++){
  assert.strictEqual(L.avalonTeamSize(n,m),exp[n][m-1]);
  assert.strictEqual(L.avalonFailsNeeded(n,m),(m===4&&n>=7)?2:1);
}
// majority
const v=(a,r)=>{const o={};for(let i=0;i<a;i++)o['a'+i]='approve';for(let i=0;i<r;i++)o['r'+i]='reject';return L.avalonTally(o);};
assert(v(3,2).approved); assert(!v(2,2).approved); assert(!v(2,3).approved); assert(!v(0,5).approved); assert(v(1,0).approved);
assert(!v(3,3).approved);
// leader rotation
assert.strictEqual(L.avalonNextLeader(['a','b','c'],'a'),'b'); assert.strictEqual(L.avalonNextLeader(['a','b','c'],'c'),'a'); assert.strictEqual(L.avalonNextLeader(['a','b','c'],'zz'),'a');
console.log('ALL PASS', checks,'assignment cases');
