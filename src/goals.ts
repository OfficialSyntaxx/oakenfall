/* What the hold sets out to do, and what it is remembered for.
 *
 * Two lists of one-time achievements that pay out when their condition comes
 * true. They are separate because they answer different questions: the goals are
 * a tutorial spine — build a house, net the river, get through a winter — and
 * they run out. The deeds are a record, and several of them cannot be aimed for
 * at all (a settler living to become an elder, a first wedding); they persist in
 * the save as id→day so the Journal can say when each was earned.
 *
 * Both are checked every day rather than hooked into the events that would
 * satisfy them. That is deliberate: a condition can be met by a path nobody
 * thought of, and polling a dozen predicates once a day costs nothing.
 */
import { G } from './state';
import { toast } from './hud';
import { chron } from './chronicle';
import { sfx } from './audio';
import { SEASON_LEN, CYCLE_LEN } from './time';
import { hasBuildingType } from './buildings';
import { gainResource, logCoinIn } from './economy';
import { skillTier } from './skills';

/* ── GOALS ── the spine a new hold follows. Each pays ten coins plus its own
   reward; the reward is chosen to unblock whatever the next goal needs. */
export const QUESTS: any[] = [
  {id:'q1', title:'First Timber', desc:'Gather 100 wood in total.', icon:'🪵', check:()=>G.totals.wood>=100, reward:{stone:25}},
  {id:'q2', title:'Quarry Opened', desc:'Gather 60 stone in total.', icon:'🪨', check:()=>G.totals.stone>=60, reward:{wood:30}},
  {id:'q3', title:'Founding the Hearth', desc:'Build a House.', icon:'🏚️', check:()=>hasBuildingType('house'), reward:{food:20}},
  {id:'q4', title:'Tend the Fields', desc:'Raise a Farm.', icon:'🌾', check:()=>hasBuildingType('farm'), reward:{wood:25}},
  {id:'q5', title:'Net the River', desc:'Raise a Fishing Hut.', icon:'🎣', check:()=>hasBuildingType('fishingHut'), reward:{food:20}},
  {id:'q6', title:'The Hunt Begins', desc:'Raise a Hunting Cabin.', icon:'🏹', check:()=>hasBuildingType('huntingCabin'), reward:{food:20}},
  {id:'q7', title:'A Growing Hold', desc:'Reach a population of 6.', icon:'👥', check:()=>G.villagers.length>=6, reward:{wood:40,stone:20}},
  {id:'q8', title:'The Storehouse', desc:'Build a Granary.', icon:'🏺', check:()=>hasBuildingType('granary'), reward:{stone:30}},
  {id:'q9', title:'Iron Will', desc:'Survive a wolf raid.', icon:'🐺', check:()=>G.wolfEvents>=1, reward:{wood:25}},
  {id:'q10', title:'Open Roads', desc:'Build a Trading Post.', icon:'⚖️', check:()=>hasBuildingType('tradingPost'), reward:{food:25}},
  {id:'q11', title:'Paved Way', desc:'Build 3 road segments.', icon:'🛤️', check:()=>G.buildings.filter(b=>b.type==='road').length>=3, reward:{stone:20}},
  {id:'q12', title:'Survived the Frost', desc:'Endure one full Winter season.', icon:'❄️', check:()=>G.dayCount>=SEASON_LEN/CYCLE_LEN*4+1, reward:{wood:50,food:30}},
];
export function checkQuests(){
  for(const q of QUESTS){
    if(G.questsCompleted[q.id]) continue;
    if(q.check()){
      G.questsCompleted[q.id]=true;
      G.coins += 10; logCoinIn('quests', 10);
      sfx('coin');
      for(const k in q.reward) gainResource(k, q.reward[k]);
      toast('Quest complete: '+q.title+'!');
    }
  }
}
export function questsDoneCount(){ return QUESTS.filter(q=>G.questsCompleted[q.id]).length; }

/* ── DEEDS ── one-time achievements; earned map is id→day, persists in saves */
export const DEED_DEFS: any[] = [
  {id:'firstHome',     ic:'🏠', name:'A Roof Raised',   desc:'Build your first house.',              reward:{coins:5},              check:()=>G.buildings.some(b=>b.type==='house')},
  {id:'hamlet',        ic:'🏘️', name:'Hamlet',          desc:'Grow the hold to 10 settlers.',        reward:{coins:10},             check:()=>G.villagers.length>=10},
  {id:'township',      ic:'🏰', name:'Township',        desc:'Grow the hold to 20 settlers.',        reward:{coins:20},             check:()=>G.villagers.length>=20},
  {id:'firstWinter',   ic:'❄️', name:'First Winter',    desc:'Survive your first winter.',           reward:{coins:12,food:20},     check:()=>G.journal.wintersEndured>=1},
  {id:'ironHeart',     ic:'🥶', name:'Iron Heart',      desc:'Endure three winters.',                reward:{coins:25},             check:()=>G.journal.wintersEndured>=3},
  {id:'bridgeBuilder', ic:'🌉', name:'Bridge Builder',  desc:'Span the river with a bridge.',        reward:{coins:10,planks:6},    check:()=>G.buildings.some(b=>b.type==='bridge')},
  {id:'fullGranary',   ic:'🌾', name:'Full Granary',    desc:'Stockpile 200 provisions.',            reward:{coins:15},             check:()=>(G.stockpile.food||0)>=200},
  {id:'timberBaron',   ic:'🪵', name:'Timber Baron',    desc:'Hold 300 timber at once.',             reward:{coins:15},             check:()=>(G.stockpile.wood||0)>=300},
  {id:'firstWed',      ic:'💞', name:'A Match Made',     desc:'See your first wedding.',              reward:{coins:8},              check:()=>(G.journal.weddings||0)>=1},
  {id:'newLife',       ic:'👶', name:'New Life',        desc:'Welcome a child born in the hold.',    reward:{coins:8,food:15},      check:()=>(G.journal.childrenBorn||0)>=1},
  {id:'greyHairs',     ic:'🧓', name:'Grey Hairs',      desc:'A settler lives to become an elder.',  reward:{coins:12},             check:()=>G.villagers.some(v=>v.stage==='elder')},
  {id:'remembered',    ic:'🪦', name:'Remembered',      desc:'Lay a settler to rest in the grove.',  reward:{coins:8},              check:()=>(G.journal.passed||0)>=1},
  {id:'heldGate',      ic:'🛡️', name:'Held the Gate',   desc:'Survive a raid on the hold.',          reward:{coins:15,stone:15},    check:()=>G.wolfEvents>=1},
  {id:'scholar',       ic:'🔬', name:'Scholar',         desc:'Complete a research along the oak.',   reward:{coins:12},             check:()=>Object.keys(G.researched||{}).length>=1},
  {id:'master',        ic:'★', name:'Master of the Craft',desc:'A settler masters their trade.',      reward:{coins:15},             check:()=>G.villagers.some(v=>skillTier(v,v.role).label==='Master')},
];
export function rewardText(r: any){
  if(!r) return '';
  const parts = [];
  if(r.coins) parts.push('💰'+r.coins);
  if(r.food) parts.push('🌾'+r.food);
  if(r.wood) parts.push('🪵'+r.wood);
  if(r.stone) parts.push('🪨'+r.stone);
  if(r.planks) parts.push('🪚'+r.planks);
  return parts.join(' ');
}
export function grantReward(r: any){
  if(!r) return;
  if(r.coins){ G.coins += r.coins; logCoinIn('deeds', r.coins); }
  if(r.food) gainResource('food', r.food);
  if(r.wood) gainResource('wood', r.wood);
  if(r.stone) gainResource('stone', r.stone);
  if(r.planks) gainResource('planks', r.planks);
}
export function checkDeeds(){
  for(const d of DEED_DEFS){
    if(G.deeds[d.id]) continue;
    let earned=false; try{ earned = d.check(); }catch(e){ earned=false; }
    if(earned){
      G.deeds[d.id] = G.dayCount;
      grantReward(d.reward);
      const rt = rewardText(d.reward);
      toast('🏅 Deed earned — '+d.ic+' '+d.name+(rt?' (+'+rt+')':''));
      sfx('deed');
      chron('deed', d.name);
    }
  }
}
