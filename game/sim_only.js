/* =====================================================================
   OAKENFALL — LIVING VALLEY. Phases 1-3 in one file.
   SIM (pure logic) · RENDER (PixiJS adapter) · HUD (DOM)
   Transplant note: SIM has zero rendering calls; port it wholesale and
   rewrite RENDER against the main game's sprites.
   ===================================================================== */

/* ---------- tunables (shrunk timescale for testing; scale up to ship) ---------- */
const SEASON_LEN = 180;                 // seconds per season (spec ships 7 min)
const YEAR = SEASON_LEN*4;
const ADULT_AGE = 1.5, ELDER_BEFORE = 1.4;   // in years / years-before-lifespan
const LIFESPAN_BASE = 6;                // in-game years
const POP_CAP = 18;

/* ---------- helpers ---------- */
const TILE_W=72, TILE_H=36, GRID=11;
const iso={to:(x,y)=>({x:(x-y)*TILE_W/2,y:(x+y)*TILE_H/2}),
           from:(ix,iy)=>({x:iy/TILE_H+ix/TILE_W,y:iy/TILE_H-ix/TILE_W})};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const rand=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.floor(Math.random()*a.length)];
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

/* ================================================================
   SIM
   ================================================================ */
const FIRSTNAMES=['Bram','Wren','Odo','Sana','Tomas','Sarah','Edda','Finn','Mabel','Rook','Isolde','Pip','Greta','Alder','Nell','Cormac','Tilda','Bors','June','Hale','Ivo','Petra','Osric','Lark'];
const SURNAMES=['Ashdown','Thorn','Millbrook','Oakes','Fenwick','Harrow','Bywater'];
const TRAITS={
  Lazy:'naps mid-work', Diligent:'works longer', Glutton:'eats early and often',
  Hardy:'shrugs off the cold', Chilly:'seeks the fire', Social:'drifts toward company',
  Loner:'wanders the edges', Forager:'gathers faster', EarlyRiser:'first one working',
  NightOwl:'works late', Stargazer:'stops to watch the night sky', Whistler:'whistles while walking',
};
const SEASONS=[
  {name:'Spring',ico:'🌱',warm:1.0,farm:1.0,tint:0xFFFFFF},
  {name:'Summer',ico:'☀️',warm:0.6,farm:1.3,tint:0xFFF3DC},
  {name:'Autumn',ico:'🍂',warm:1.2,farm:1.5,tint:0xFFD9B0},
  {name:'Winter',ico:'❄️',warm:2.2,farm:0.0,tint:0xBFD0E8},
];
const sim={
  time:0, speed:1,
  seasonIdx:0, seasonT:0, year:1,
  weather:'clear', weatherT:0, workMult:1,
  resources:{food:35, timber:14},
  priority:'balanced',
  villagers:[], buildings:[], memorials:[],
  zones:{},                    // 'x,y' -> 'grove'|'farm'|'homes'
  chronicle:[], usedNames:new Set(), momentFired:new Set(),
  blizzard:null,               // {phase:'warn'|'active', t, choice}
  eraStats:{born:0,died:0,built:0,weddings:0},
  hiddenAt:null,
};
function log(text,cls){
  sim.chronicle.unshift({text,cls});
  if(sim.chronicle.length>80)sim.chronicle.pop();
  ui.renderChronicle();
  if(cls!=='quiet')ui.banner(text);
}

/* ---- map ---- */
const tiles={};
for(let x=0;x<GRID;x++)for(let y=0;y<GRID;y++){
  const water=(x>=8&&y<=2)||(x===7&&y===2)||(x===8&&y===3);
  const forest=!water&&(x<=1||y<=1||x>=9||y>=9)&&!(x>=8&&y<=3);
  tiles[x+','+y]={x,y,kind:water?'water':forest?'forest':'grass',building:null};
}
const CENTER={x:5,y:5};
const tileAt=(x,y)=>tiles[x+','+y]||null;
const freeGrass=t=>t&&t.kind==='grass'&&!t.building;

/* ---- buildings ---- */
let bSeq=0;
function addBuilding(kind,x,y,state='done'){
  const b={id:'b'+(bSeq++),kind,x,y,state,progress:0,owner:null,stage:1,needAcc:0,needN:0};
  sim.buildings.push(b); tileAt(x,y).building=b;
  render.addBuilding(b); return b;
}
function findBuildSite(zoneKind){
  const near=t=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
    const n=tileAt(t.x+dx,t.y+dy); return n&&n.building&&n.building.state==='done';});
  const zoned=Object.entries(sim.zones).filter(([k,z])=>z===zoneKind).map(([k])=>tiles[k]).filter(freeGrass);
  if(zoned.length){
    zoned.sort((a,b)=>(Math.abs(a.x-CENTER.x)+Math.abs(a.y-CENTER.y))-(Math.abs(b.x-CENTER.x)+Math.abs(b.y-CENTER.y)));
    return zoned.find(near)||zoned[0];
  }
  for(let r=1;r<GRID;r++)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
    const t=tileAt(CENTER.x+dx,CENTER.y+dy);
    if(freeGrass(t)&&near(t))return t;
  }
  return null;
}

/* ---- villagers ---- */
let vSeq=1;
function makeName(surname){
  const free=FIRSTNAMES.filter(n=>!sim.usedNames.has(n));
  const first=free.length?pick(free):'Settler'+vSeq;
  sim.usedNames.add(first);
  return {first, sur: surname||pick(SURNAMES)};
}
function spawnVillager(opts={}){
  const rng=mulberry32(vSeq*7919+3);
  const nm=makeName(opts.surname);
  const keys=Object.keys(TRAITS);
  const conflict={Lazy:'Diligent',Diligent:'Lazy',Social:'Loner',Loner:'Social',Hardy:'Chilly',Chilly:'Hardy'};
  let t1,t2;
  if(opts.inherit){ t1=Math.random()<.5?pick(opts.inherit):keys[Math.floor(rng()*keys.length)]; }
  else t1=keys[Math.floor(rng()*keys.length)];
  do{ t2=(opts.inherit&&Math.random()<.5)?pick(opts.inherit):keys[Math.floor(rng()*keys.length)];
  }while(t2===t1||conflict[t1]===t2);
  const v={
    id:'v'+(vSeq++), first:nm.first, sur:nm.sur,
    name:nm.first+' '+nm.sur,
    traits:[t1,t2],
    age:opts.age??rand(1.8,3.2), lifespan:LIFESPAN_BASE*rand(0.85,1.15),
    stage:'adult',
    needs:{food:rand(65,90),rest:rand(65,90),warmth:rand(70,95)},
    jitter:{speed:0.85+rng()*0.3,decay:0.85+rng()*0.3,work:0.85+rng()*0.3},
    pos:opts.pos||{x:CENTER.x+rand(-1,1),y:CENTER.y+rand(-1,1)},
    target:null,task:'Idle',taskT:0,taskMin:0,taskData:null,
    home:null,partner:null,parents:opts.parents||null,children:[],
    relations:[],   // {id, type:'friend'|'rival', s}
    memories:[], emote:'',eatCooldown:0,thought:'taking in the valley',
    stuckT:0,lastPos:{x:0,y:0},mourn:0,
  };
  if(v.traits.includes('Hardy'))v.lifespan+=0.8;
  if(v.age<ADULT_AGE)v.stage='child';
  sim.villagers.push(v); render.addVillager(v);
  return v;
}
const byId=id=>sim.villagers.find(v=>v.id===id);
const has=(v,t)=>v.traits.includes(t);
const adults=()=>sim.villagers.filter(v=>v.stage!=='child');
function remember(v,text){v.memories.unshift(text);if(v.memories.length>4)v.memories.pop()}

/* ---- relationships ---- */
function relTo(v,o){return v.relations.find(r=>r.id===o.id)}
function bumpRel(v,o,amount){
  if(v.stage==='child'||o.stage==='child')return;
  let r=relTo(v,o);
  if(!r){
    if(v.relations.length>=5)return;
    const rivalry=(has(v,'Diligent')&&has(o,'Lazy'))||(has(v,'Lazy')&&has(o,'Diligent'));
    r={id:o.id,type:rivalry?'rival':'friend',s:0}; v.relations.push(r);
  }
  const mult=r.type==='rival'?-0.6:(has(v,'Social')?1.5:has(v,'Loner')?0.6:1);
  r.s=clamp(r.s+amount*mult,-100,100);
  if(r.type==='friend'&&r.s>40&&!sim.momentFired.has('fr'+[v.id,o.id].sort().join())){
    sim.momentFired.add('fr'+[v.id,o.id].sort().join());
    log(`<b>${v.first}</b> and <b>${o.first}</b> became fast friends.`);
    remember(v,`became friends with ${o.first}`); remember(o,`became friends with ${v.first}`);
  }
  if(r.type==='rival'&&r.s<-25&&!sim.momentFired.has('rv'+[v.id,o.id].sort().join())){
    sim.momentFired.add('rv'+[v.id,o.id].sort().join());
    log(`<b>${v.first}</b> and <b>${o.first}</b> can't stand each other's pace of work.`);
  }
}
let relAcc=0;
function relationsTick(dt){
  relAcc+=dt; if(relAcc<10)return; relAcc=0;
  const vs=sim.villagers;
  for(let i=0;i<vs.length;i++)for(let j=i+1;j<vs.length;j++){
    const a=vs[i],b=vs[j];
    if(Math.hypot(a.pos.x-b.pos.x,a.pos.y-b.pos.y)<1.3){
      bumpRel(a,b,6); bumpRel(b,a,6);
    }
  }
}
/* courtship + births, rolled per season */
function shareParent(a,b){
  if(!a.parents||!b.parents)return false;
  return a.parents.some(p=>b.parents.includes(p));
}
function seasonSocial(){
  const gov=clamp((POP_CAP-sim.villagers.length)/POP_CAP,0,1);
  /* weddings */
  for(const v of adults()){
    if(v.partner)continue;
    const cand=v.relations.filter(r=>r.type==='friend'&&r.s>60).map(r=>byId(r.id))
      .filter(o=>o&&o.stage!=='child'&&!o.partner&&!shareParent(o,v));
    if(cand.length&&Math.random()<0.6){
      const o=cand[0];
      v.partner=o.id;o.partner=v.id;
      o.sur=v.sur;o.name=o.first+' '+o.sur;
      const home=v.home||o.home;
      if(home){v.home=home;o.home=home;home.owner=v.id;}
      sim.eraStats.weddings++;
      log(`🎉 <b>${v.first}</b> and <b>${o.first}</b> were wed beneath the oak.`);
      remember(v,`married ${o.first}`);remember(o,`married ${v.first}`);
      sim.villagers.forEach(x=>x.emote='🎉');
    }
  }
  /* births */
  for(const v of adults()){
    if(!v.partner||!v.home)continue;
    const o=byId(v.partner); if(!o||o.id<v.id)continue;   // one roll per couple
    if(sim.resources.food>sim.villagers.length*5&&Math.random()<0.55*gov){
      const c=spawnVillager({age:0,surname:v.sur,parents:[v.id,o.id],
        inherit:[...v.traits,...o.traits],pos:{x:v.home.x,y:v.home.y}});
      c.home=v.home;v.children.push(c.id);o.children.push(c.id);
      sim.eraStats.born++;
      log(`👶 A child was born to the ${v.sur}s — welcome, <b>${c.first}</b>.`);
      remember(v,`welcomed ${c.first}`);remember(o,`welcomed ${c.first}`);
    }
  }
  /* migration */
  if(Math.random()<0.8*gov&&sim.resources.food>40){
    const nv=spawnVillager({pos:{x:0.3,y:9.6}});
    log(`<b>${nv.first} ${nv.sur}</b> arrived, drawn by the smoke on the horizon.`);
    remember(nv,'arrived with everything they owned');
  }
}

/* ---- aging & death ---- */
function agingTick(dt){
  const dy=dt/YEAR;
  for(const v of [...sim.villagers]){
    v.age+=dy;
    v.mourn=Math.max(0,v.mourn-dt);
    if(v.stage==='child'&&v.age>=ADULT_AGE){
      v.stage='adult';
      log(`<b>${v.first} ${v.sur}</b> came of age and joined the workers.`);
      remember(v,'came of age');
    } else if(v.stage==='adult'&&v.age>=v.lifespan-ELDER_BEFORE){
      v.stage='elder';
      log(`<b>${v.first}</b> is an elder now — slower, and wiser.`,'quiet');
    } else if(v.age>=v.lifespan){
      passVillager(v);
    }
  }
}
function passVillager(v){
  /* cleanup EVERY reference — the dangling-id trap */
  sim.villagers=sim.villagers.filter(x=>x!==v);
  render.removeVillager(v);
  sim.villagers.forEach(o=>{
    o.relations=o.relations.filter(r=>r.id!==v.id);
    if(o.partner===v.id){o.partner=null;o.mourn=SEASON_LEN;remember(o,`lost ${v.first}`);}
    if(o.parents&&o.parents.includes(v.id))o.mourn=Math.max(o.mourn,SEASON_LEN*0.5);
  });
  if(v.home&&v.home.owner===v.id){
    const heir=sim.villagers.find(o=>o.home===v.home);
    v.home.owner=heir?heir.id:null;
  }
  if(ui.inspected===v)ui.closeInspect();
  sim.eraStats.died++;
  const mem=v.memories.length?` They say ${v.first} never forgot the day they ${v.memories[v.memories.length-1]}.`:'';
  log(`🕊️ <b>${v.first} ${v.sur}</b> passed peacefully at ${Math.floor(v.age*12)} seasons old.${mem}`);
  /* memorial grove */
  const spot={x:2+sim.memorials.length%6,y:10};
  sim.memorials.push({name:v.first,x:spot.x,y:spot.y});
  render.addMemorial(spot);
}

/* ---- utility AI ---- */
const CRIT=85;
const urgency=n=>{const d=(100-n)/100;return d*d*100};
function scoreActions(v){
  const R=sim.resources, pr=sim.priority;
  const list=[];
  let eat=urgency(v.needs.food)*(has(v,'Glutton')?1.5:1);
  if(R.food<1||v.eatCooldown>0)eat=0;
  list.push({name:'Eat',score:eat});
  list.push({name:'Rest',score:urgency(v.needs.rest)*(has(v,'Lazy')?1.5:1)});
  list.push({name:'Warm',score:urgency(v.needs.warmth)*(has(v,'Chilly')?1.6:has(v,'Hardy')?0.5:1)
    +(sim.blizzard&&sim.blizzard.phase==='active'?25:0)});
  if(v.stage==='child'){
    list.push({name:'Play',score:35});
    return list.sort((a,b)=>b.score-a.score);
  }
  const wm=sim.workMult*(v.stage==='elder'?0.6:1);
  const glut=foodGlut();
  let forage=40*(has(v,'Diligent')?1.4:1)*v.jitter.work*wm*(0.3+0.7*glut);
  if(pr==='food')forage+=25; if(pr==='build')forage-=10;
  if(R.food<sim.villagers.length*4)forage+=30;
  list.push({name:'Forage',score:forage});
  const farms=sim.buildings.filter(b=>b.kind==='farm'&&b.state==='done');
  if(farms.length&&SEASONS[sim.seasonIdx].farm>0)
    list.push({name:'Farm',score:(44+(pr==='food'?20:0))*v.jitter.work*wm*(0.3+0.7*glut)});
  let chop=36*(has(v,'Diligent')?1.3:1)*v.jitter.work*wm;
  if(pr==='build')chop+=25; if(pr==='food')chop-=10;
  if(R.timber>70)chop-=20;
  list.push({name:'Chop',score:chop});
  const pending=sim.buildings.find(b=>b.state==='building');
  const homeless=adults().filter(x=>!x.home).length;
  const farmWanted=farms.length<Math.floor(sim.villagers.length/4)&&demand().farm;
  let build=0;
  if(pending)build=55;
  else if(homeless>0&&R.timber>=20)build=50;
  else if(farmWanted&&R.timber>=10)build=46;
  if(pr==='build')build+=20;
  list.push({name:'Build',score:build});
  list.push({name:'Wander',score:8+(has(v,'Social')?6:0)+(has(v,'Loner')?6:0)});
  return list.sort((a,b)=>b.score-a.score);
}
function demand(){
  return {
    house: adults().some(v=>!v.home),
    farm: sim.resources.food<sim.villagers.length*8&&SEASONS[sim.seasonIdx].farm>0,
  };
}
function walkableNear(x,y){
  /* clamp to a reachable non-water tile center-ish point */
  let bx=clamp(Math.round(x),1,GRID-2), by=clamp(Math.round(y),1,GRID-2);
  if(tileAt(bx,by)&&tileAt(bx,by).kind!=='water')return {x:bx+rand(-0.3,0.3),y:by+rand(-0.3,0.3)};
  /* search outward for the nearest walkable */
  for(let r=1;r<4;r++)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){
    const t=tileAt(clamp(bx+dx,1,GRID-2),clamp(by+dy,1,GRID-2));
    if(t&&t.kind!=='water')return {x:t.x+rand(-0.3,0.3),y:t.y+rand(-0.3,0.3)};
  }
  return {x:CENTER.x,y:CENTER.y};
}
function startTask(v,name){
  v.task=name;v.taskT=0;v.taskMin=rand(8,14);v.taskData=null;
  const fire=sim.buildings.find(b=>b.kind==='fire');
  const fallback={x:CENTER.x,y:CENTER.y};
  const slot=b=>b?({x:b.x+rand(-0.6,0.6),y:b.y+rand(-0.6,0.6)}):({x:fallback.x+rand(-0.6,0.6),y:fallback.y+rand(-0.6,0.6)});
  switch(name){
    case 'Eat':v.target=slot(fire);v.thought='is hungry and heading to the fire';v.emote='🍞';break;
    case 'Warm':v.target=slot(fire);v.thought='is warming up by the fire';v.emote='❄️';break;
    case 'Rest':
      if(has(v,'Lazy')&&Math.random()<0.5){v.target=null;v.thought='is napping right where they stood. Again.';}
      else{v.target=v.home?slot(v.home):slot(fire);v.thought=v.home?'is heading home to rest':'is dozing by the fire';}
      v.emote='💤';break;
    case 'Forage':{
      const groves=Object.entries(sim.zones).filter(([k,z])=>z==='grove').map(([k])=>tiles[k]);
      const spots=groves.length?groves:Object.values(tiles).filter(t=>t.kind==='forest');
      const s=pick(spots);v.target={x:s.x+rand(-0.35,0.35),y:s.y+rand(-0.35,0.35)};
      v.thought='is gathering acorns';v.emote='🌰';break;}
    case 'Farm':{
      const f=pick(sim.buildings.filter(b=>b.kind==='farm'&&b.state==='done'));
      v.taskData=f;v.target=slot(f);v.thought='is tending the fields';v.emote='🌾';break;}
    case 'Chop':{
      const s=pick(Object.values(tiles).filter(t=>t.kind==='forest'));
      v.target={x:s.x+rand(-0.35,0.35),y:s.y+rand(-0.35,0.35)};v.thought='is cutting timber';v.emote='🪵';break;}
    case 'Build':{
      let site=sim.buildings.find(b=>b.state==='building');
      if(!site){
        const homeless=adults().some(x=>!x.home);
        const kind=homeless&&sim.resources.timber>=20?'hut':'farm';
        const cost=kind==='hut'?20:10;
        if(sim.resources.timber<cost){startTask(v,'Wander');return}
        const t=findBuildSite(kind==='hut'?'homes':'farm');
        if(!t){startTask(v,'Wander');return}
        sim.resources.timber-=cost;
        site=addBuilding(kind,t.x,t.y,'building');
        log(`<b>${v.first}</b> broke ground on a new ${kind}.`,'quiet');
      }
      v.taskData=site;v.target={x:site.x,y:site.y};
      v.thought='is building';v.emote='🔨';break;}
    case 'Play':{
      v.target=walkableNear(v.pos.x+rand(-2,2),v.pos.y+rand(-2,2));
      v.taskMin=3;v.thought='is playing chase between the huts';v.emote='✨';break;}
    default:{
      v.target=walkableNear(v.pos.x+rand(-2.5,2.5),v.pos.y+rand(-2.5,2.5));
      const friends=v.relations.filter(r=>r.type==='friend'&&r.s>40).map(r=>byId(r.id)).filter(Boolean);
      if(friends.length&&Math.random()<0.6){
        const f=pick(friends);v.target=walkableNear(f.pos.x,f.pos.y);
        v.thought=`is spending time with ${f.first}`;v.emote='💬';
      } else if(has(v,'Social')){const o=pick(adults().filter(o=>o!==v));
        if(o){v.target=walkableNear(o.pos.x,o.pos.y);}
        v.thought='is looking for company';v.emote='💬';
      } else if(has(v,'Stargazer')&&sim.seasonT/SEASON_LEN>0.7){
        v.target=null;v.thought='stopped to watch the sky';v.emote='✨';
      } else if(has(v,'Loner')){v.target=walkableNear(pick([1,GRID-2]),rand(1,GRID-2));v.thought='wants some quiet';v.emote='';}
      else{v.thought='is stretching their legs';v.emote=has(v,'Whistler')?'♪':'';}
    }
  }
}
function decideTick(v){
  const scores=scoreActions(v);
  v.debugScores=scores.slice(0,3);
  const top=scores[0];
  const critical=Object.values(v.needs).some(n=>urgency(n)>CRIT);
  const cur=scores.find(s=>s.name===v.task);
  const curScore=cur?cur.score:0;
  if(v.task==='Idle'||v.taskT>v.taskMin||critical){
    if(top.name!==v.task&&top.score>curScore+(critical?0:20))startTask(v,top.name);
    else if(v.task==='Idle')startTask(v,top.name);
  }
}
function foodGlut(){ // diminishing returns: full stores kill the incentive to gather
  const soft=Math.max(60,sim.villagers.length*30);
  return clamp(1-(sim.resources.food-soft)/(soft*2),0.05,1);
}
function taskArrivedTick(v,dt){
  const R=sim.resources;
  const ration=sim.blizzard&&sim.blizzard.choice==='ration'?0.5:1;
  switch(v.task){
    case 'Eat':{
      const amount=Math.min(R.food,dt*8*ration);
      R.food-=amount;v.needs.food=clamp(v.needs.food+amount*3,0,100);
      if(v.needs.food>90||R.food<=0){v.eatCooldown=60;startTask(v,'Idle');}break;}
    case 'Warm':v.needs.warmth=clamp(v.needs.warmth+dt*10,0,100);
      if(v.needs.warmth>92&&!(sim.blizzard&&sim.blizzard.phase==='active'))startTask(v,'Idle');break;
    case 'Rest':v.needs.rest=clamp(v.needs.rest+dt*(v.home?7:4.5),0,100);
      if(v.needs.rest>92)startTask(v,'Idle');break;
    case 'Forage':R.food+=dt*(has(v,'Forager')?2.2:1.4)*v.jitter.work*sim.workMult*foodGlut();break;
    case 'Farm':R.food+=dt*2.6*v.jitter.work*sim.workMult*SEASONS[sim.seasonIdx].farm*foodGlut();break;
    case 'Chop':R.timber+=dt*0.9*v.jitter.work*sim.workMult;break;
    case 'Build':{
      const b=v.taskData;
      if(!b||b.state==='done'){startTask(v,'Idle');break}
      b.progress+=dt/(b.kind==='hut'?20:12);
      render.updateBuilding(b);
      if(b.progress>=1){
        b.state='done';render.updateBuilding(b);
        sim.eraStats.built++;
        if(b.kind==='hut'){
          const hm=adults().find(x=>!x.home);
          if(hm){hm.home=b;b.owner=hm.id;
            const p=hm.partner&&byId(hm.partner);if(p&&!p.home)p.home=b;
            log(`A hut was finished — <b>${hm.first}</b> moved in.`);
            remember(hm,'moved into a hut of their own');}
          else log('A hut was finished.');
        } else log('New fields were cut into the moss.');
        remember(v,`built a ${b.kind}`);
        startTask(v,'Idle');
      }break;}
    case 'Play':if(v.taskT>3)startTask(v,'Play');break;
    case 'Wander':if(v.taskT>4)startTask(v,'Idle');break;
  }
}
function needsTick(v,dt){
  const d=v.jitter.decay, s=SEASONS[sim.seasonIdx];
  const bliz=sim.blizzard&&sim.blizzard.phase==='active';
  const warmMult=s.warm*(bliz?(sim.blizzard.choice==='burn'?1:3):1);
  v.needs.food=clamp(v.needs.food-dt*0.45*d*(has(v,'Glutton')?1.3:1),0,100);
  v.needs.rest=clamp(v.needs.rest-dt*0.35*d,0,100);
  v.needs.warmth=clamp(v.needs.warmth-dt*0.22*d*warmMult*(has(v,'Hardy')?0.5:has(v,'Chilly')?1.4:1),0,100);
  v.eatCooldown=Math.max(0,v.eatCooldown-dt);
  if(v.needs.food<8&&!sim.momentFired.has(v.id+'hunger')){
    sim.momentFired.add(v.id+'hunger');
    log(`<b>${v.first}</b> went hungry — the stores ran dry.`);
  }
}
function moveTick(v,dt){
  if(!v.target){v.stuckT=0;v.progDist=null;return true}
  const dx=v.target.x-v.pos.x,dy=v.target.y-v.pos.y;
  const dist=Math.hypot(dx,dy);
  if(dist<0.22){v.target=null;v.progDist=null;return true}
  const sp=(v.stage==='elder'?0.75:v.stage==='child'?1.25:1.1)*v.jitter.speed*(v.task==='Wander'?0.7:1);
  const step=Math.min(sp*dt,dist);
  v.pos.x+=dx/dist*step;v.pos.y+=dy/dist*step;
  /* stuck = failed to get meaningfully closer than our best-so-far within a time budget */
  if(v.progDist==null||dist<v.progDist-0.25){v.progDist=dist;v.stuckT=0;}
  else{
    v.stuckT+=dt;
    const budget=(dist/Math.max(sp,0.3))+4;   // expected travel time + slack
    if(v.stuckT>budget){v.stuckT=0;v.progDist=null;v.target=null;startTask(v,'Idle');
      if(typeof console!=='undefined'&&console.warn)console.warn('watchdog freed',v.first);}
  }
  return false;
}

/* ---- seasons, weather, disaster ---- */
function seasonTick(dt){
  sim.seasonT+=dt;
  /* weather rolls */
  sim.weatherT-=dt;
  if(sim.weatherT<=0){
    const winter=sim.seasonIdx===3;
    sim.weather=winter?(Math.random()<0.6?'snow':'clear')
                      :(Math.random()<0.3?'rain':'clear');
    sim.weatherT=rand(40,90);
    sim.workMult=sim.weather==='clear'?1:sim.weather==='rain'?0.8:0.7;
    render.setWeather(sim.weather);
  }
  /* blizzard event: once, mid-winter */
  if(sim.seasonIdx===3&&!sim.blizzard&&sim.seasonT>SEASON_LEN*0.35&&sim.year>=1&&sim.time>240){
    sim.blizzard={phase:'warn',t:20,choice:null};
    ui.modal('A blizzard is coming','The wind has turned. The village has moments to prepare.',
      'Burn extra timber<br>(−15 🪵, stay warm)','Ration the food<br>(stores last, bellies grumble)',
      c=>{sim.blizzard.choice=c==='a'?'burn':'ration';
        if(c==='a')sim.resources.timber=Math.max(0,sim.resources.timber-15);
        log(sim.blizzard.choice==='burn'
          ?'The village chose to burn timber through the storm.'
          :'The village chose to ration the stores.','quiet');});
  }
  if(sim.blizzard){
    sim.blizzard.t-=dt;
    if(sim.blizzard.phase==='warn'&&sim.blizzard.t<=0){
      if(!sim.blizzard.choice)sim.blizzard.choice='ration';
      ui.closeModal();
      sim.blizzard.phase='active';sim.blizzard.t=50;
      sim.weather='snow';render.setWeather('storm');
      log('❄️ The blizzard struck Oakenfall.');
    } else if(sim.blizzard.phase==='active'&&sim.blizzard.t<=0){
      log('The blizzard passed. The village held.');
      sim.villagers.forEach(v=>remember(v,'weathered the great blizzard'));
      sim.blizzard='done';
      render.setWeather(sim.weather='clear');
    }
  }
  /* season change */
  if(sim.seasonT>=SEASON_LEN){
    sim.seasonT=0;
    /* hut growth stages: resident thriving all season → cottage */
    sim.buildings.filter(b=>b.kind==='hut'&&b.state==='done'&&b.stage===1).forEach(b=>{
      if(b.needN>0&&b.needAcc/b.needN>70){
        b.stage=2;render.updateBuilding(b);
        const o=byId(b.owner);
        log(`The ${o?o.sur+' ':''}hut grew into a cottage.`);
      }
      b.needAcc=0;b.needN=0;
    });
    sim.seasonIdx=(sim.seasonIdx+1)%4;
    if(sim.seasonIdx===0){
      sim.year++;
      const e=sim.eraStats;
      log(`<b>Year ${sim.year-1} in Oakenfall:</b> ${e.born} born, ${e.died} passed, ${e.built} raised, ${e.weddings} wed.`,'era');
      sim.eraStats={born:0,died:0,built:0,weddings:0};
    }
    if(sim.seasonIdx!==3)sim.blizzard=null;
    const s=SEASONS[sim.seasonIdx];
    log(`${s.ico} ${s.name} came to the valley.`,'quiet');
    ui.banner(`${s.ico} ${s.name}, Year ${sim.year}`);
    render.setSeason(sim.seasonIdx);
    seasonSocial();
  }
  /* accumulate resident wellbeing for growth stages (sampled) */
  if(Math.random()<dt){
    sim.buildings.filter(b=>b.kind==='hut'&&b.owner).forEach(b=>{
      const o=byId(b.owner);if(!o)return;
      b.needAcc+=(o.needs.food+o.needs.rest+o.needs.warmth)/3;b.needN++;
    });
  }
}

/* ---- master tick ---- */
let aiAcc=0;
function simTick(dt){
  sim.time+=dt;
  seasonTick(dt);
  relationsTick(dt);
  agingTick(dt);
  aiAcc+=dt;
  const decide=aiAcc>=0.25;if(decide)aiAcc=0;
  sim.villagers.forEach(v=>{
    needsTick(v,dt);
    v.taskT+=dt;
    const arrived=moveTick(v,dt);
    if(arrived&&v.task!=='Idle')taskArrivedTick(v,dt);
    if(decide)decideTick(v);
  });
}

/* ---- offline ---- */
function simulateAway(seconds){
  const s=Math.min(seconds,12*3600);
  const w=adults().length;
  const foodGain=w*0.5*s*0.35*(SEASONS[sim.seasonIdx].farm>0?1:0.6);
  const timberGain=w*0.5*s*0.14;
  sim.resources.food+=foodGain;sim.resources.timber+=timberGain;
  const lines=[`The village gathered ${Math.floor(foodGain)} 🌰 and ${Math.floor(timberGain)} 🪵.`];
  let built=0;
  while(sim.resources.timber>=20&&adults().some(v=>!v.home)&&built<2){
    const t=findBuildSite('homes');if(!t)break;
    sim.resources.timber-=20;
    const b=addBuilding('hut',t.x,t.y,'done');
    const hm=adults().find(v=>!v.home);
    if(hm){hm.home=b;b.owner=hm.id;lines.push(`A hut went up — <b>${hm.first}</b> moved in.`);}
    built++;
  }
  if(s>180){
    const vs=adults();
    if(vs.length>=2&&Math.random()<0.5){
      const a=pick(vs),b=pick(vs.filter(x=>x!==a));
      if(b){bumpRel(a,b,50);bumpRel(b,a,50);
        lines.push(`<b>${a.first}</b> and <b>${b.first}</b> grew close while you were gone.`);}
    }
  }
  lines.forEach(l=>sim.chronicle.unshift({text:l}));
  ui.renderChronicle();
  return lines;
}

