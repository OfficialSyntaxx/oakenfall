/* How a settler is drawn: the animated sprite when one has decoded, the
 * hand-drawn hooded figure when it has not, and the small signs that say what
 * they are doing — a tool in hand, a mood bubble, a badge over a workplace.
 *
 * Roads live here too. They are drawn per tile beneath everything else that
 * stands on them, which makes them part of this pass rather than the buildings.
 */
import { G } from './state';
import { isSelected } from './selection';
import { SPRITES, SPRITE_SCALE, VANIM, villagerAnimFor, decorImg, roadTileStamp } from './sprites';
import { buildingCenter } from './buildings';
import { clamp, dist2, hash2, hashStr, project, TILE_W, TILE_H } from './math';
import { ROLE_DEFS, VILLAGER_TINTS } from './defs';
import { seasonIndex, isNight } from './time';
import { getWeather } from './weather';
import { shade, shadeColor, drawShadow, roundRect, tileDiamond, tintedFrame } from './isokit';

type Deps = {
  ctx: any;
  /** Is this settler the one the player has open? Drawn with a ring. */
};
let dep: Deps = { ctx: null };
export function initVillagerRender(deps: Deps): void { dep = deps; }
function villagerTint(v){
  if(v._tint !== undefined) return v._tint;
  return (v._tint = VILLAGER_TINTS[hashStr((v.id||'')+'t') % VILLAGER_TINTS.length]);
}
function villagerBuild(v){
  if(v._build !== undefined) return v._build;
  return (v._build = v.stage==='child' ? 1 : 0.9 + (hashStr((v.id||'')+'b') % 21)/100); // 0.90–1.10
}



/* Trade colours for the hand-drawn figure, the tool each carries, and the mood
   bubble for each state. These travelled with the building renderer by accident
   of where they sat in main.ts; they belong here. */
const ROLE_COLORS = {
  idle:   {body:'#6e5a3f', hood:'#3f3324'},
  lumberjack:{body:'#5c6e3f', hood:'#33401f'},
  miner:  {body:'#5a5650', hood:'#33312c'},
  farmer: {body:'#8a7332', hood:'#4a3d18'},
  fisher: {body:'#3f6a78', hood:'#234048'},
  hunter: {body:'#6e4a2e', hood:'#3a2716'},
};
const ROLE_TOOL_ICON = { lumberjack:'🪓', miner:'⛏️', farmer:'🌾', fisher:'🎣', hunter:'🏹' };
const STATE_ICON = {
  idle:'…', walkingToResource:'…', working_wood:'🪓', working_stone:'⛏️',
  walkingToDropoff:null, walkingToFarm:'…', farming:'🌾',
  seekingFood:'🍖', eating:'🍖', seekingSleep:'😴', sleeping:'💤'
};

export function drawVillager(v){
  const p = project(v.gx, v.gy);
  const moving = ['walkingToResource','walkingToDropoff','walkingToFarm','seekingFood','seekingSleep'].includes(v.state) ||
                 (v.state==='idle' && (Math.abs(v.gx-v.idleGX)>0.05 || Math.abs(v.gy-v.idleGY)>0.05));
  const bob = moving ? Math.abs(Math.sin(v.bobPhase))*1.8 : 0;
  if(v.state!=='sleeping') v.bobPhase += moving ? 0.22 : 0.05;
  const cx = p.x, cy = p.y - bob;
  const csc = (v.stage==='child' ? 0.68 : 1) * villagerBuild(v);  // children smaller; adults vary in build
  drawShadow(cx, p.y+6, 9.5*csc);

  // Track facing from horizontal motion (persists while standing still)
  if(v._lastGX===undefined) v._lastGX = v.gx;
  const dxm = v.gx - v._lastGX;
  if(Math.abs(dxm) > 0.002) v._faceLeft = dxm < 0;
  v._lastGX = v.gx;

  // Animated sprite path (Tiny Swords Pawn) — falls through to canvas art if not loaded
  if(v.state!=='spawning'){
    const anim = villagerAnimFor(v);
    if(anim && anim.length && anim[0].complete && anim[0].naturalWidth>0){
      const fi = Math.floor(G.worldTime*5 + (hashStr(v.id)%7)) % anim.length;
      const frame = anim[fi];
      const img = tintedFrame(frame, villagerTint(v));
      // Frames are trim-cropped at bake time: character fills the image.
      // Draw at a fixed CHARACTER height with feet planted on the tile.
      // Aspect from the original frame (tinted result is a canvas, no naturalWidth).
      const hgt = 30*csc, w = hgt * (frame.naturalWidth/frame.naturalHeight);
      dep.ctx.save();
      if(v._faceLeft){ dep.ctx.translate(cx,0); dep.ctx.scale(-1,1); dep.ctx.translate(-cx,0); }
      try { dep.ctx.drawImage(img, cx - w/2, cy - hgt + 7, w, hgt); } catch(e){}
      dep.ctx.restore();
      if(v.role==='fisher' && v.state==='working'){
        const spImg = decorImg('splash', G.worldTime*7 + hashStr(v.id)%5);
        if(spImg){
          const sw = 22, sh = sw*(spImg.naturalHeight/spImg.naturalWidth);
          try { dep.ctx.drawImage(spImg, cx + 8, cy - sh + 12, sw, sh); } catch(e){}
        }
      }
      if(v.sick){ dep.ctx.fillStyle='rgba(120,160,60,0.18)'; dep.ctx.beginPath(); dep.ctx.ellipse(cx, cy-14, 10, 14, 0, 0, Math.PI*2); dep.ctx.fill(); }
      drawStatusBubble(v, cx, cy - 34*csc);
      return;
    }
  }

  // Arrival materialize effect — a brief warm glow that rises and fades as a
  // new settler steps out of the Town Center door.
  if(v.state==='spawning'){
    const t = clamp(1 - (v.spawnTimer/1.1), 0, 1); // 0 -> 1 over the spawn duration
    const riseY = cy - t*14;
    const glowR = 14 + Math.sin(t*Math.PI)*10;
    const alpha = Math.sin(t*Math.PI); // fades in then out
    const grd = dep.ctx.createRadialGradient(cx, riseY, 0, cx, riseY, glowR);
    grd.addColorStop(0, `rgba(255,215,140,${0.55*alpha})`);
    grd.addColorStop(1, 'rgba(255,180,80,0)');
    dep.ctx.fillStyle = grd;
    dep.ctx.beginPath(); dep.ctx.arc(cx, riseY, glowR, 0, Math.PI*2); dep.ctx.fill();
    // rising sparkle motes
    for(let i=0;i<3;i++){
      const sp = (t + i*0.33) % 1;
      const sx = cx + Math.sin(sp*8+i*2)*6;
      const sy = cy - sp*22;
      dep.ctx.fillStyle = `rgba(255,225,170,${(1-sp)*0.8})`;
      dep.ctx.beginPath(); dep.ctx.arc(sx, sy, 1.4, 0, Math.PI*2); dep.ctx.fill();
    }
  }

  // Try AI villager sprite
  const spriteKey = 'villager_'+(v.role==='idle'?'idle':v.role);
  const img = SPRITES[spriteKey];
  const spawnAlpha = v.state==='spawning' ? clamp(1-(v.spawnTimer/1.1), 0.15, 1) : 1;
  dep.ctx.save();
  dep.ctx.globalAlpha = spawnAlpha;
  if(img && img.complete && img.naturalWidth>0){
    try {
      const w = (SPRITE_SCALE[spriteKey]||40)*csc;
      const h = w*(img.naturalHeight/img.naturalWidth);
      // Mirror if facing left
      dep.ctx.save();
      if(v.facing===-1){ dep.ctx.translate(cx*2,0); dep.ctx.scale(-1,1); }
      dep.ctx.drawImage(img, cx-w/2, cy-h+6, w, h);
      dep.ctx.restore();
    } catch(e){ delete SPRITES[spriteKey]; }
  } else {
    // Canvas fallback character
    const seed = v.__seed || (v.__seed = hashStr(v.id));
    const tintShift = ((seed%100)/100-0.5)*0.18;
    const col = ROLE_COLORS[v.role]||ROLE_COLORS.idle;
    const skin = ['#d8b893','#c9a47a','#b8855e'][seed%3];
    dep.ctx.save(); dep.ctx.translate(cx,cy); dep.ctx.scale(csc,csc);
    const legSwing = moving ? Math.sin(v.bobPhase*2)*3.2 : 0;
    dep.ctx.strokeStyle='#241a10'; dep.ctx.lineWidth=2.6; dep.ctx.lineCap='round';
    dep.ctx.beginPath(); dep.ctx.moveTo(-2.5,4); dep.ctx.lineTo(-2.5+legSwing,10); dep.ctx.stroke();
    dep.ctx.beginPath(); dep.ctx.moveTo(2.5,4); dep.ctx.lineTo(2.5-legSwing,10); dep.ctx.stroke();
    dep.ctx.fillStyle=shadeColor(col.body,tintShift);
    dep.ctx.beginPath(); dep.ctx.moveTo(-6,6); dep.ctx.quadraticCurveTo(-7,-10,0,-13); dep.ctx.quadraticCurveTo(7,-10,6,6); dep.ctx.closePath(); dep.ctx.fill();
    dep.ctx.strokeStyle='rgba(0,0,0,0.25)'; dep.ctx.lineWidth=1; dep.ctx.stroke();
    const armSwing=moving?Math.sin(v.bobPhase*2+Math.PI)*2.4:0;
    dep.ctx.strokeStyle=shadeColor(col.body,-0.15); dep.ctx.lineWidth=2.4; dep.ctx.lineCap='round';
    dep.ctx.beginPath(); dep.ctx.moveTo(-5,-5); dep.ctx.lineTo(-7+armSwing*0.4,2+Math.abs(armSwing)); dep.ctx.stroke();
    dep.ctx.beginPath(); dep.ctx.moveTo(5,-5); dep.ctx.lineTo(7-armSwing*0.4,2+Math.abs(armSwing)); dep.ctx.stroke();
    dep.ctx.fillStyle=skin; dep.ctx.beginPath(); dep.ctx.arc(0,-16,4.4,0,7); dep.ctx.fill();
    dep.ctx.fillStyle=shadeColor(col.hood,tintShift); dep.ctx.beginPath(); dep.ctx.arc(0,-18,5,Math.PI,0); dep.ctx.fill();
    const tool=ROLE_TOOL_ICON[v.role];
    if(tool&&(v.state==='working'||v.state==='walkingToResource'||v.state==='farming')){
      dep.ctx.font='10px serif'; dep.ctx.textAlign='center'; dep.ctx.textBaseline='middle';
      dep.ctx.fillText(tool,8,-8+(v.state==='working'?Math.sin(v.bobPhase*4)*3:0));
    }
    dep.ctx.restore();
  }
  dep.ctx.restore(); // pop globalAlpha

  // Selection ring
  if(isSelected(v)){
    dep.ctx.strokeStyle='rgba(231,162,61,0.9)'; dep.ctx.lineWidth=1.6;
    dep.ctx.beginPath(); dep.ctx.ellipse(cx,p.y+6,11,5,0,0,7); dep.ctx.stroke();
  }
  drawStatusBubble(v, cx, cy-30*csc);
}
// Shared floating status bubble (used by both sprite and canvas villager paths)
export function drawStatusBubble(v, bx, by){
  const bub=bubbleFor(v);
  if(!bub) return;
  let bg='rgba(40,30,18,0.88)', bd='rgba(0,0,0,0.5)';
  if(bub.tone==='warn'){ bg='rgba(70,28,20,0.9)'; bd='#a4402c'; }
  else if(bub.tone==='cool'){ bg='rgba(22,32,46,0.9)'; bd='#3a5a78'; }
  else if(bub.tone==='good'){ bg='rgba(28,42,24,0.9)'; bd='#4a7a3a'; }
  dep.ctx.fillStyle=bg; dep.ctx.strokeStyle=bd; dep.ctx.lineWidth=1.2;
  roundRect(bx-11,by-11,22,18,5); dep.ctx.fill(); dep.ctx.stroke();
  dep.ctx.beginPath(); dep.ctx.moveTo(bx-3,by+7); dep.ctx.lineTo(bx,by+12); dep.ctx.lineTo(bx+3,by+7); dep.ctx.closePath();
  dep.ctx.fillStyle=bg; dep.ctx.fill();
  dep.ctx.font='12px serif'; dep.ctx.textAlign='center'; dep.ctx.textBaseline='middle';
  dep.ctx.fillText(bub.ic,bx,by-1);
}

export function drawWorkerBadge(b){
  if(b.condition!==undefined && b.condition<35 && b.type!=='road'){
    const c0 = buildingCenter(b); const p0 = project(c0.gx, c0.gy);
    dep.ctx.font='13px serif'; dep.ctx.textAlign='center'; dep.ctx.textBaseline='middle';
    const bob0 = Math.sin(G.worldTime*3)*2;
    dep.ctx.fillText('⚠️', p0.x, p0.y - 48 + bob0);
  }
  if(!b.workers || b.workers<=0 || b.type==='townCenter' || b.type==='house' || b.type==='granary' || b.type==='road') return;
  const c = buildingCenter(b);
  const p = project(c.gx, c.gy);
  const bx = p.x + 20, by = p.y - 30;
  dep.ctx.fillStyle='rgba(30,22,14,0.88)';
  dep.ctx.strokeStyle='rgba(231,162,61,0.75)'; dep.ctx.lineWidth=1;
  roundRect(bx-11, by-8, 22, 14, 4); dep.ctx.fill(); dep.ctx.stroke();
  dep.ctx.font='10px serif'; dep.ctx.textAlign='center'; dep.ctx.textBaseline='middle';
  dep.ctx.fillText('👷'.slice(0,2), bx, by);
  dep.ctx.fillStyle='#e7d7ad'; dep.ctx.font='bold 9px sans-serif';
  dep.ctx.fillText(b.workers, bx+7, by);
}

export function drawRoad(gx,gy){
  // The terrain layer already stamps the Kenney stone path under road tiles.
  const stamp = roadTileStamp();
  if(stamp && stamp.complete && stamp.naturalWidth>0) return;
  const p = project(gx,gy);
  dep.ctx.fillStyle='#3a3226';
  tileDiamond(p.x, p.y, TILE_W*0.82, TILE_H*0.82); dep.ctx.fill();
  // cobble texture lines
  dep.ctx.strokeStyle='#2c261c'; dep.ctx.lineWidth=0.8;
  dep.ctx.beginPath();
  dep.ctx.moveTo(p.x-20,p.y); dep.ctx.lineTo(p.x+20,p.y);
  dep.ctx.moveTo(p.x,p.y-10); dep.ctx.lineTo(p.x,p.y+10);
  dep.ctx.stroke();
  // centre dashed lane
  dep.ctx.strokeStyle='rgba(90,78,55,0.45)'; dep.ctx.lineWidth=1.5;
  dep.ctx.setLineDash([4,5]);
  dep.ctx.beginPath(); dep.ctx.moveTo(p.x-17,p.y); dep.ctx.lineTo(p.x+17,p.y); dep.ctx.stroke();
  dep.ctx.setLineDash([]); // always reset
  // edge border
  dep.ctx.strokeStyle='rgba(255,255,255,0.04)'; dep.ctx.lineWidth=1;
  tileDiamond(p.x,p.y,TILE_W*0.82,TILE_H*0.82); dep.ctx.stroke();
}

/** Which mood bubble, if any, floats over a settler right now. */
function bubbleFor(v){
  if(v.state==='spawning') return null; // the arrival glow speaks for itself
  if(v.sick) return {ic:'🤧', tone:'warn'};
  if(v.state==='eating') return {ic:'🍖', tone:'good'};
  if(v.state==='sleeping') return {ic:'💤', tone:'cool'};
  if(v.state==='seekingFood') return {ic:'🍖', tone:'warn'};
  if(v.state==='seekingSleep') return {ic:'😴', tone:'cool'};
  if(v._mentored>0 && (v.state==='working'||v.state==='farming') && Math.sin(G.worldTime*1.5+v.gx*2)>0) return {ic:'📖', tone:'good'};
  if(v.state==='working') return {ic: ({wood:'🪓', stone:'⛏️', fish:'🎣', meat:'🏹'})[v.resKind] || '🪓', tone:'normal'};
  if(v.state==='farming') return {ic:'🌾', tone:'normal'};
  if(v.state==='walkingToDropoff' && v.carrying) {
    const ic = {wood:'🪵', stone:'🪨', food:(v.resKind==='fish'?'🐟':(v.resKind==='meat'?'🍖':'🌾'))}[v.carrying.type] || '🎒';
    return {ic, tone:'normal'};
  }
  if(v.state==='walkingToResource'||v.state==='walkingToFarm') return {ic:'🚶', tone:'faint'};
  if(v.hunger>70) return {ic:'🍖', tone:'warn'};
  if(v.fatigue>70) return {ic:'😴', tone:'warn'};
  if(v.role==='idle' || v.stage==='child') return {ic: v.ambientEmote || '💤', tone:'faint'};
  return null;
}
