// @ts-nocheck  — hand-drawn canvas code; typing the critter shapes is its own step.
/* The wilds — deer, boar, rabbits, foxes, ducks, fish, birds and butterflies.
 *
 * Ambient, but not decoration: a hunter hunts what is standing here, and the
 * hold feels dead without it. Seeded on a new map and after every season turn,
 * because the population thins in winter.
 *
 * First drawing code to leave main.ts. Canvas code cannot import `ctx` and
 * expect to write to it — ES module bindings are read-only to importers — so
 * the canvas and the sprite tables are pushed in by initCritters(), exactly as
 * the iso kit takes its context. tileWalkable comes in the same way rather
 * than dragging the whole pathfinding surface across with it.
 *
 * Every critter has a hand-drawn fallback and always will: blitCritter tries
 * the sprite and returns false if it has not decoded, and the procedural
 * drawing runs instead. That is not a placeholder, it is the contract.
 */
import { G } from './state';
import { clamp, dist2, project } from './math';
import { drawShadow } from './isokit';
import { tileAt } from './mapgen';
import { seasonIndex, riverFrozen } from './time';

/** Per-species behaviour: how close a settler may come before it bolts, how
 *  fast it flees, how fast it grazes, and how far it drifts while calm. */
const CRITTER_KINDS: Record<string, { flee: number; speed: number; graze: number; wander: number }> = {
  deer:   { flee: 9,    speed: 2.4, graze: 0.7,  wander: 4.0 },
  boar:   { flee: 3.5,  speed: 1.9, graze: 0.45, wander: 2.6 },
  rabbit: { flee: 16,   speed: 3.2, graze: 1.1,  wander: 2.2 },
  fox:    { flee: 11,   speed: 2.8, graze: 0.5,  wander: 5.0 },
};

let ctx: any = null;
let SPRITES: any = {};
let SPRITE_SCALE: any = {};
let WATER_DROP = 6;
let tileWalkable: (gx: number, gy: number) => boolean = () => true;

/** Hand the module the canvas and the few tables it draws from. Called once,
 *  from main.ts, after the context and sprite tables exist. */
export function initCritters(deps: {
  ctx: any; sprites: any; spriteScale: any; waterDrop: number;
  tileWalkable: (gx: number, gy: number) => boolean;
}): void {
  ctx = deps.ctx;
  SPRITES = deps.sprites;
  SPRITE_SCALE = deps.spriteScale;
  WATER_DROP = deps.waterDrop;
  tileWalkable = deps.tileWalkable;
}

export function spawnWildlife(){
  G.critters = [];
  const wild = (typeof G.wildsTiles!=='undefined' && G.wildsTiles.length) ? G.wildsTiles : [];
  const winter = seasonIndex()===3;
  const pickWild = ()=> wild.length ? wild[(Math.random()*wild.length)|0]
                                    : { gx:G.TC_CX+(Math.random()-0.5)*12, gy:G.TC_CY+(Math.random()-0.5)*12 };
  const beast = (kind, t)=> G.critters.push({ kind, gx:t.gx, gy:t.gy, tx:t.gx, ty:t.gy,
    phase:Math.random()*6, face:1, rest:Math.random()*4, moving:false });

  // Game thins out in winter — the wilds feel emptier when the snow is down.
  const deerN = Math.max(2, Math.min(7, (wild.length/6)|0 || 3)) * (winter?0.5:1) | 0;
  for(let i=0;i<deerN;i++) beast('deer', pickWild());
  for(let i=0;i<(winter?1:2);i++) beast('boar', pickWild());
  for(let i=0;i<(winter?1:2);i++) beast('fox', pickWild());

  // Rabbits keep to open grass rather than the deep wilds.
  const grass = [];
  for(let y=2;y<G.MAP_SIZE-2;y+=3) for(let x=2;x<G.MAP_SIZE-2;x+=3){
    const t = G.grid[y] && G.grid[y][x];
    if(t && t.type==='grass' && !t.building) grass.push(t);
  }
  const rabbitN = winter ? 2 : 5;
  for(let i=0;i<rabbitN && grass.length;i++) beast('rabbit', grass[(Math.random()*grass.length)|0]);

  for(let i=0;i<4;i++){
    G.critters.push({ kind:'bird', gx:Math.random()*G.MAP_SIZE, gy:Math.random()*G.MAP_SIZE,
      dir:Math.random()*6.28, phase:Math.random()*6, spd:0.5+Math.random()*0.5 });
  }
  // Fish break the surface of open water — none once the river freezes over.
  if(typeof G.waterTiles!=='undefined' && G.waterTiles.length && !riverFrozen()){
    for(let i=0;i<4;i++){
      const t = G.waterTiles[(Math.random()*G.waterTiles.length)|0];
      G.critters.push({ kind:'fish', gx:t.gx, gy:t.gy, phase:Math.random()*6, next:Math.random()*6 });
    }
    // Ducks paddle in circles near where they settled rather than wandering the
    // map — a duck that walks onto a field is worse than no duck at all.
    for(let i=0;i<3;i++){
      const t = G.waterTiles[(Math.random()*G.waterTiles.length)|0];
      G.critters.push({ kind:'duck', gx:t.gx, gy:t.gy, homeX:t.gx, homeY:t.gy,
        phase:Math.random()*6, dir:Math.random()*6.28, face:1, moving:true });
    }
  }
  // Butterflies only in the warm seasons.
  if(seasonIndex()===0 || seasonIndex()===1){
    for(let i=0;i<6 && grass.length;i++){
      const t = grass[(Math.random()*grass.length)|0];
      G.critters.push({ kind:'flit', gx:t.gx, gy:t.gy, phase:Math.random()*6, dir:Math.random()*6.28,
        hue: Math.random()<0.5 ? '#e8d27a' : '#d9a0c8' });
    }
  }
}
export function updateWildlife(dt){
  if(!G.critters.length) return;
  for(const c of G.critters){
    if(c.kind==='duck'){
      c.phase += dt*2;
      c.dir += (Math.random()-0.5)*dt*2.2;
      const nx = c.gx + Math.cos(c.dir)*dt*0.35;
      const ny = c.gy + Math.sin(c.dir)*dt*0.35;
      const t = tileAt(Math.round(nx), Math.round(ny));
      // Stay on the water, and stay near home.
      if(t && t.type==='water' && dist2(nx, ny, c.homeX, c.homeY) < 6.25){
        c.face = nx < c.gx ? -1 : 1;
        c.gx = nx; c.gy = ny;
      } else { c.dir += 2.2; }
      continue;
    }
    const spec = CRITTER_KINDS[c.kind];
    if(spec){
      // Grazing beasts: wander, watch for folk, bolt when one comes too close.
      c.phase += dt*4;
      let fd=Infinity, fv=null;
      for(const v of G.villagers){ const d=dist2(c.gx,c.gy,v.gx,v.gy); if(d<fd){ fd=d; fv=v; } }
      const spooked = fv && fd < spec.flee;
      if(spooked){
        const a = Math.atan2(c.gy-fv.gy, c.gx-fv.gx) || 0;
        c.tx = clamp(c.gx+Math.cos(a)*4, 1, G.MAP_SIZE-2);
        c.ty = clamp(c.gy+Math.sin(a)*4, 1, G.MAP_SIZE-2);
        c.rest = 1.5;
      } else {
        c.rest -= dt;
        if(c.rest <= 0){ c.rest = 2+Math.random()*4;
          const nx = clamp(c.gx+(Math.random()-0.5)*spec.wander, 1, G.MAP_SIZE-2);
          const ny = clamp(c.gy+(Math.random()-0.5)*spec.wander, 1, G.MAP_SIZE-2);
          if(typeof tileWalkable==='function' && tileWalkable(Math.round(nx), Math.round(ny))){ c.tx=nx; c.ty=ny; }
        }
      }
      const dx=c.tx-c.gx, dy=c.ty-c.gy, d=Math.hypot(dx,dy);
      if(d>0.05){ const spd=(spooked?spec.speed:spec.graze)*dt; c.gx+=dx/d*Math.min(spd,d); c.gy+=dy/d*Math.min(spd,d); c.face=dx>=0?1:-1; c.moving=true; }
      else c.moving=false;
    } else if(c.kind==='bird'){
      c.phase += dt*8;
      c.gx += Math.cos(c.dir)*c.spd*dt; c.gy += Math.sin(c.dir)*c.spd*dt;
      if(c.gx<0) c.gx=G.MAP_SIZE; else if(c.gx>G.MAP_SIZE) c.gx=0;
      if(c.gy<0) c.gy=G.MAP_SIZE; else if(c.gy>G.MAP_SIZE) c.gy=0;
      if(Math.random()<0.006) c.dir += (Math.random()-0.5);
    } else if(c.kind==='fish'){
      // Mostly below the surface; breaks it now and then in a short arc.
      c.next -= dt;
      if(c.next <= 0){ c.next = 4+Math.random()*7; c.jump = 1; }
      if(c.jump > 0) c.jump = Math.max(0, c.jump - dt*1.6);
    } else if(c.kind==='flit'){
      c.phase += dt*7;
      c.dir += (Math.random()-0.5)*0.5;
      c.gx = clamp(c.gx + Math.cos(c.dir)*0.35*dt, 1, G.MAP_SIZE-2);
      c.gy = clamp(c.gy + Math.sin(c.dir)*0.35*dt, 1, G.MAP_SIZE-2);
    }
  }
}
/* Sprite first, hand-drawn second. The procedural critters are NOT a
   placeholder: a sprite that hasn't decoded yet, or fails to, must still leave
   something alive in the wilds. Same rule as the buildings. */
export function blitCritter(kind, c){
  const img = SPRITES[kind];
  if(!img || !img.complete || img.naturalWidth===0) return false;
  const p = project(c.gx, c.gy);
  const bob = c.moving ? Math.abs(Math.sin(c.phase))*1.2 : 0;
  const w = SPRITE_SCALE[kind] || 26;
  const h = w * (img.naturalHeight/img.naturalWidth);
  try{ drawShadow(p.x, p.y+3, w*0.22); }catch(e){}
  ctx.save();
  // The art faces left; mirror with a transform, never by negating a radius.
  if(c.face > 0){ ctx.translate(p.x*2, 0); ctx.scale(-1, 1); }
  try{ ctx.drawImage(img, p.x - w/2, p.y - h + 4 - bob, w, h); }
  catch(e){ ctx.restore(); return false; }
  ctx.restore();
  return true;
}
export function drawDeer(c){
  if(blitCritter('deer', c)) return;
  const p = project(c.gx, c.gy);
  const bob = c.moving ? Math.abs(Math.sin(c.phase))*1.2 : 0;
  const cx=p.x, cy=p.y-bob;
  try{ drawShadow(cx, p.y+3, 7); }catch(e){}
  ctx.save(); if(c.face<0){ ctx.translate(cx*2,0); ctx.scale(-1,1); }
  const ls = c.moving ? Math.sin(c.phase)*1.7 : 0;
  ctx.strokeStyle='#3a2a1a'; ctx.lineWidth=1.4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx-3,cy-2); ctx.lineTo(cx-3+ls,cy+4); ctx.moveTo(cx+3,cy-2); ctx.lineTo(cx+3-ls,cy+4); ctx.stroke();
  ctx.fillStyle='#7a5232'; ctx.beginPath(); ctx.ellipse(cx,cy-3,5.5,3.2,0,0,7); ctx.fill();          // body
  ctx.beginPath(); ctx.ellipse(cx+5,cy-6,2,2.4,0,0,7); ctx.fill();                                    // head
  ctx.fillStyle='#e8dcc4'; ctx.beginPath(); ctx.ellipse(cx-5,cy-2.5,1.6,2,0,0,7); ctx.fill();          // tail
  ctx.strokeStyle='#4a3420'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(cx+5,cy-8); ctx.lineTo(cx+3.5,cy-11); ctx.moveTo(cx+6,cy-8); ctx.lineTo(cx+7.5,cy-11); ctx.stroke(); // antlers
  ctx.restore();
}
export function drawBoar(c){
  if(blitCritter('boar', c)) return;
  const p = project(c.gx, c.gy);
  const bob = c.moving ? Math.abs(Math.sin(c.phase))*0.9 : 0;
  const cx=p.x, cy=p.y-bob;
  try{ drawShadow(cx, p.y+3, 7.5); }catch(e){}
  ctx.save(); if(c.face<0){ ctx.translate(cx*2,0); ctx.scale(-1,1); }
  const ls = c.moving ? Math.sin(c.phase)*1.3 : 0;
  ctx.strokeStyle='#241a12'; ctx.lineWidth=1.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx-3,cy-1); ctx.lineTo(cx-3+ls,cy+4); ctx.moveTo(cx+3,cy-1); ctx.lineTo(cx+3-ls,cy+4); ctx.stroke();
  ctx.fillStyle='#4a3b30';                                            // bristly dark body
  ctx.beginPath(); ctx.ellipse(cx,cy-3,6,3.4,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx+4,cy-5); ctx.lineTo(cx+9,cy-2); ctx.lineTo(cx+4,cy-1); ctx.closePath(); ctx.fill(); // snout
  ctx.strokeStyle='#2a2019'; ctx.lineWidth=1;                          // back ridge
  ctx.beginPath(); ctx.moveTo(cx-4,cy-6); ctx.lineTo(cx-1,cy-7.5); ctx.lineTo(cx+2,cy-6); ctx.stroke();
  ctx.fillStyle='#e8e2d2';                                             // tusk
  ctx.beginPath(); ctx.moveTo(cx+8,cy-2); ctx.lineTo(cx+10,cy-4); ctx.lineTo(cx+8.5,cy-1.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}
export function drawRabbit(c){
  if(blitCritter('rabbit', c)) return;
  const p = project(c.gx, c.gy);
  const hop = c.moving ? Math.abs(Math.sin(c.phase*1.6))*2.4 : 0;
  const cx=p.x, cy=p.y-hop;
  try{ drawShadow(cx, p.y+2, 4); }catch(e){}
  ctx.save(); if(c.face<0){ ctx.translate(cx*2,0); ctx.scale(-1,1); }
  ctx.fillStyle='#9c8a72';
  ctx.beginPath(); ctx.ellipse(cx,cy-2,3.2,2.2,0,0,7); ctx.fill();      // body
  ctx.beginPath(); ctx.arc(cx+2.6,cy-4,1.6,0,7); ctx.fill();            // head
  ctx.strokeStyle='#9c8a72'; ctx.lineWidth=1.1; ctx.lineCap='round';    // ears
  ctx.beginPath(); ctx.moveTo(cx+2.4,cy-5.2); ctx.lineTo(cx+1.8,cy-8.2);
  ctx.moveTo(cx+3.2,cy-5.2); ctx.lineTo(cx+3.4,cy-8.2); ctx.stroke();
  ctx.fillStyle='#efe9dc'; ctx.beginPath(); ctx.arc(cx-3.2,cy-2.2,1.2,0,7); ctx.fill(); // scut
  ctx.restore();
}
export function drawFish(c){
  if(!(c.jump > 0)) return;                       // only visible mid-arc
  const p = project(c.gx, c.gy);
  const surf = p.y + WATER_DROP;                   // leaves from the water, not the bank
  const t = 1 - c.jump;                            // 0 → 1 across the leap
  const lift = Math.sin(t*Math.PI)*7;
  const cx = p.x + (t-0.5)*7, cy = surf - lift - 2;
  ctx.save();
  ctx.fillStyle='#8fa8b8';
  ctx.beginPath(); ctx.ellipse(cx, cy, 3.2, 1.5, -0.5+t, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx-3,cy); ctx.lineTo(cx-5,cy-1.6); ctx.lineTo(cx-5,cy+1.6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(200,225,240,0.5)'; ctx.lineWidth=1;            // splash ring on the way down
  if(t < 0.18){ ctx.beginPath(); ctx.ellipse(p.x-3.5, surf, 5*(0.18-t)*6, 2*(0.18-t)*6, 0, 0, 7); ctx.stroke(); }   // takeoff
  if(t > 0.75){ ctx.beginPath(); ctx.ellipse(p.x+(t-0.5)*7, surf, 4*(t-0.75)*4, 1.6*(t-0.75)*4, 0, 0, 7); ctx.stroke(); }
  ctx.restore();
}
export function drawFox(c){
  if(blitCritter('fox', c)) return;
  const p = project(c.gx, c.gy);
  const bob = c.moving ? Math.abs(Math.sin(c.phase))*1.1 : 0;
  const cx=p.x, cy=p.y-bob;
  try{ drawShadow(cx, p.y+3, 6); }catch(e){}
  ctx.save(); if(c.face<0){ ctx.translate(cx*2,0); ctx.scale(-1,1); }
  ctx.fillStyle='#a5522a';
  ctx.beginPath(); ctx.ellipse(cx,cy-3,5,2.6,0,0,7); ctx.fill();               // body
  ctx.beginPath(); ctx.ellipse(cx+4.5,cy-5,2,1.8,0,0,7); ctx.fill();           // head
  ctx.beginPath(); ctx.ellipse(cx-5.5,cy-3.5,3.2,1.8,0.3,0,7); ctx.fill();     // brush
  ctx.fillStyle='#e8dcc4'; ctx.beginPath(); ctx.ellipse(cx-7.4,cy-4,1.1,0.9,0,0,7); ctx.fill(); // tail tip
  ctx.fillStyle='#2a1c12';
  ctx.beginPath(); ctx.moveTo(cx+3.6,cy-6.4); ctx.lineTo(cx+4.2,cy-8.2); ctx.lineTo(cx+5,cy-6.4); ctx.closePath(); ctx.fill();
  ctx.restore();
}
/* A duck sits IN the water, not on it. Three things make that read:
   the water surface is recessed by WATER_DROP, so drawing at land height left
   the bird hovering; the body below the waterline has to be clipped away; and
   a wake plus a faint reflection tell the eye the surface is liquid. */
export function drawDuck(c){
  const p = project(c.gx, c.gy);
  const surf = p.y + WATER_DROP;                       // the recessed water top
  const y = surf + Math.sin(c.phase) * 0.7;            // riding the ripples
  const w = SPRITE_SCALE.duck || 20;

  // Wake: a tight ring under the bird and a wider one trailing behind it.
  ctx.strokeStyle = 'rgba(200,228,244,0.30)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(p.x, y + 1.5, w*0.34, 2.2, 0, 0, 7); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,228,244,0.13)';
  ctx.beginPath(); ctx.ellipse(p.x - c.face*5, y + 2.2, w*0.55, 3.4, 0, 0, 7); ctx.stroke();

  const img = SPRITES.duck;
  if(img && img.complete && img.naturalWidth > 0){
    const h = w * (img.naturalHeight / img.naturalWidth);
    const sink = h * 0.34;                             // how deep it floats
    const top = y - h + sink;
    // Reflection, below the waterline: same bird, flipped and squashed.
    ctx.save();
    ctx.beginPath(); ctx.rect(p.x - w, y, w*2, h*0.6); ctx.clip();
    ctx.globalAlpha = 0.14;
    ctx.translate(0, y*2); ctx.scale(1, -0.55);
    if(c.face > 0){ ctx.translate(p.x*2, 0); ctx.scale(-1, 1); }
    try{ ctx.drawImage(img, p.x - w/2, top, w, h); }catch(e){}
    ctx.restore();
    // The bird itself, cut off at the waterline.
    ctx.save();
    ctx.beginPath(); ctx.rect(p.x - w, top - 4, w*2, (y - top) + 4); ctx.clip();
    if(c.face > 0){ ctx.translate(p.x*2, 0); ctx.scale(-1, 1); }
    try{ ctx.drawImage(img, p.x - w/2, top, w, h); }catch(e){}
    ctx.restore();
    return;
  }

  // Hand-drawn floor, half-submerged the same way.
  ctx.save();
  ctx.beginPath(); ctx.rect(p.x - 12, y - 16, 24, 16); ctx.clip();
  if(c.face > 0){ ctx.translate(p.x*2, 0); ctx.scale(-1, 1); }
  ctx.fillStyle = '#6b5a3e';
  ctx.beginPath(); ctx.ellipse(p.x, y - 1.4, 4, 2.6, 0, 0, 7); ctx.fill();     // body
  ctx.fillStyle = '#2f4a35';
  ctx.fillRect(p.x - 3.9, y - 5.6, 1.2, 3);                                    // neck
  ctx.beginPath(); ctx.ellipse(p.x - 3.4, y - 6.2, 1.5, 1.7, 0, 0, 7); ctx.fill(); // head
  ctx.restore();
}
export function drawFlit(c){
  const p = project(c.gx, c.gy);
  const cy = p.y - 12 - Math.sin(c.phase*0.6)*3;
  const w = Math.abs(Math.sin(c.phase))*2.6 + 0.6;   // wingbeat
  ctx.save();
  ctx.fillStyle = c.hue;
  ctx.beginPath(); ctx.ellipse(p.x-w*0.5, cy, w, 1.9, 0.4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(p.x+w*0.5, cy, w, 1.9, -0.4, 0, 7); ctx.fill();
  ctx.restore();
}
export function drawBird(c){
  const p = project(c.gx, c.gy);
  const cx=p.x, cy=p.y-48;                 // birds fly well above the ground
  const f = Math.sin(c.phase)*3;
  ctx.strokeStyle='rgba(28,24,20,0.65)'; ctx.lineWidth=1.4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx-5,cy+f); ctx.lineTo(cx,cy-1.5); ctx.lineTo(cx+5,cy+f); ctx.stroke();
}
