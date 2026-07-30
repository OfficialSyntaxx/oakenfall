/* How every building is drawn.
 *
 * Sprite first, hand-drawn iso second — and the hand-drawn version is NOT a
 * fallback in the sense of a stopgap. A sprite that has not decoded yet, or
 * fails to, must still leave a building standing on the tile, so every type
 * here has a complete procedural form built from the iso kit. That contract is
 * why the game looks finished on a cold load.
 *
 * Condition shows: a building under 35 wears visibly and stops giving its
 * bonus, which is meant to be readable at a glance rather than only in a sheet.
 */
import { G } from './state';
import { bannerColor } from './unlocks';
import { SPRITES, SPRITE_SCALE, SPRITE_ANCHOR_Y, decorImg, blitSprite } from './sprites';
import { buildingCenter } from './buildings';
import { clamp, dist2, hash2, hashStr, project, TILE_W, TILE_H } from './math';
import { BUILD_DEFS, WATER_DROP, VILLAGER_TINTS } from './defs';
import { seasonIndex, isNight, riverFrozen, darknessFactor } from './time';
import { getWeather } from './weather';
import {
  shade, shadeColor, tileDiamond, roundRect, isoBox, isoRoof, plankLines,
  stoneCourses, glowWindow, doorArch, chimneySmoke, drawShadow, tintedFrame,
} from './isokit';

type Deps = {
  ctx: any;
  /** Wind lean, so banners and smoke move with the same gust as the grass. */
  windAt: (gx: number, gy: number) => number;
  /** The hold's current banner colour. */
  /** Roads are drawn beneath buildings that sit on them. */
  drawRoad: (gx: number, gy: number) => void;
};
let dep: Deps = {
  ctx: null, windAt: () => 0, drawRoad: () => {},
};
export function initBuildingRender(deps: Deps): void { dep = deps; }

export function drawHerd(b, cx, baseY){
  const n = Math.min(4, Math.max(0, Math.round(b.herd || 0)));
  const img = SPRITES.sheep;
  for(let i=0;i<n;i++){
    const ox = (hash2(b.gx*3.1+i, b.gy*2.7)-0.5) * 44;
    const oy = (hash2(b.gx*1.9, b.gy*4.3+i)-0.5) * 16;
    const bob = Math.sin(G.worldTime*1.2 + i*1.7) * 0.8;
    const x = cx + ox, y = baseY + oy - 6 + bob;
    try{ drawShadow(x, y+2, 5); }catch(e){}
    if(img && img.complete && img.naturalWidth>0){
      const w = SPRITE_SCALE.sheep || 26, h = w * (img.naturalHeight/img.naturalWidth);
      try{ dep.ctx.drawImage(img, x - w/2, y - h + 3, w, h); continue; }catch(e){}
    }
    // Hand-drawn floor: a sprite that fails to load must still leave a flock.
    dep.ctx.fillStyle='#e4e0d6';
    dep.ctx.beginPath(); dep.ctx.ellipse(x, y-4, 4.6, 3.2, 0, 0, 7); dep.ctx.fill();
    dep.ctx.fillStyle='#3a332b';
    dep.ctx.beginPath(); dep.ctx.ellipse(x+4.2, y-5.6, 1.7, 1.5, 0, 0, 7); dep.ctx.fill();
    dep.ctx.fillRect(x-2.6, y-1.6, 1, 2.2); dep.ctx.fillRect(x+1.6, y-1.6, 1, 2.2);
  }
}
export function drawBuilding(b){
  if(b.type==='road'){ dep.drawRoad(b.gx, b.gy); return; }
  const c = buildingCenter(b);
  const p = project(c.gx, c.gy);
  const baseY = p.y + TILE_H * (b.h > 1 ? b.h * 0.5 : 0.5);
  const shadowR = b.type==='townCenter' ? 52 : (b.w>1||b.h>1 ? 30 : 22);
  drawShadow(p.x, baseY + (b.type==='townCenter' ? 12 : 8), shadowR);
  const cx = p.x;
  if(blitSprite(b.type, cx, baseY)){
    // Living details layered over sprite buildings
    if(b.type==='tavern' || b.type==='bakery' || b.type==='house' || b.type==='manor') chimneySmoke(cx + 10, baseY - (SPRITE_SCALE[b.type]||80)*0.72);
    if(b.type==='pasture') drawHerd(b, cx, baseY);
    if(b.procFlash){ dep.ctx.fillStyle=`rgba(255,220,140,${b.procFlash*0.4})`; dep.ctx.beginPath(); dep.ctx.arc(cx, baseY-18, 16, 0, 7); dep.ctx.fill(); }
    return;
  }

  /* ── CANVAS ART (primary visuals until base64 sprites are added) ── */
  if(b.type==='townCenter'){
    // stone plinth
    dep.ctx.fillStyle='#33291b';
    tileDiamond(cx, baseY+4, TILE_W*1.95, TILE_H*1.95); dep.ctx.fill();
    dep.ctx.strokeStyle='rgba(0,0,0,0.3)'; dep.ctx.lineWidth=1;
    tileDiamond(cx, baseY+2, TILE_W*1.8, TILE_H*1.8); dep.ctx.stroke();
    // great hall body
    const topY = isoBox(cx, baseY-2, 46, 46, 44, '#5a4930');
    stoneCourses(cx, baseY-2, -46, 44, -1);
    plankLines(cx, baseY-2, 46, 44, 1);
    // roof
    const peak = isoRoof(cx, topY, 46, 46, 34, '#3a2417');
    // windows both faces
    glowWindow(cx-30, baseY-34, 8, 10, 0);
    glowWindow(cx-15, baseY-40, 8, 10, 1.4);
    glowWindow(cx+12, baseY-38, 7, 9, 2.6);
    // grand door
    doorArch(cx-4, baseY-1, 14, 20);
    dep.ctx.strokeStyle='#0c0803'; dep.ctx.lineWidth=1;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-4, baseY-1); dep.ctx.lineTo(cx-4, baseY-15); dep.ctx.stroke();
    // banner pole + waving pennant
    dep.ctx.strokeStyle='#1a1108'; dep.ctx.lineWidth=2.6;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx, peak-2); dep.ctx.lineTo(cx, peak-26); dep.ctx.stroke();
    const wave=Math.sin(G.worldTime*2)*3;
    dep.ctx.fillStyle=bannerColor();
    dep.ctx.beginPath();
    dep.ctx.moveTo(cx, peak-26); dep.ctx.lineTo(cx+19+wave, peak-21); dep.ctx.lineTo(cx+16+wave*0.5, peak-17); dep.ctx.lineTo(cx, peak-15);
    dep.ctx.closePath(); dep.ctx.fill();
    dep.ctx.fillStyle='rgba(0,0,0,0.2)';
    dep.ctx.beginPath(); dep.ctx.moveTo(cx, peak-20); dep.ctx.lineTo(cx+16+wave*0.5, peak-17); dep.ctx.lineTo(cx, peak-15); dep.ctx.closePath(); dep.ctx.fill();
    drawTorch(cx-50, baseY-20);
    drawTorch(cx+50, baseY-20);
  }
  else if(b.type==='house'){
    const topY = isoBox(cx, baseY, 20, 20, 18, '#6a5638');
    plankLines(cx, baseY, -20, 18, -1);
    plankLines(cx, baseY, 20, 18, 1);
    isoRoof(cx, topY, 20, 20, 15, '#4a3220');
    glowWindow(cx-13, baseY-13, 6, 7, b.gx);
    doorArch(cx+8, baseY, 8, 12);
    // chimney + smoke
    dep.ctx.fillStyle='#4e463c'; dep.ctx.fillRect(cx+8, topY-20, 5, 12);
    chimneySmoke(cx+10, topY-20);
  }
  else if(b.type==='forestCamp'){
    // lean-to: half-height box + single slope
    const topY = isoBox(cx-4, baseY, 18, 14, 12, '#54422a');
    dep.ctx.fillStyle='#3a2c1a';
    dep.ctx.beginPath();
    dep.ctx.moveTo(cx-24, topY-8); dep.ctx.lineTo(cx+12, topY-16); dep.ctx.lineTo(cx+16, topY+2); dep.ctx.lineTo(cx-20, topY+8);
    dep.ctx.closePath(); dep.ctx.fill();
    // log pile — stacked circles with ring detail
    for(let i=0;i<3;i++) for(let j=0;j<(3-i);j++){
      const lx = cx+16+j*8+i*4, ly = baseY-3-i*6;
      dep.ctx.fillStyle='#5e4426'; dep.ctx.beginPath(); dep.ctx.arc(lx, ly, 4, 0, 7); dep.ctx.fill();
      dep.ctx.strokeStyle='#3c2a14'; dep.ctx.lineWidth=0.8; dep.ctx.beginPath(); dep.ctx.arc(lx, ly, 2.2, 0, 7); dep.ctx.stroke();
    }
    // stump + axe
    dep.ctx.fillStyle='#4c3820'; dep.ctx.fillRect(cx-26, baseY-8, 8, 8);
    dep.ctx.strokeStyle='#888078'; dep.ctx.lineWidth=2;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-22, baseY-8); dep.ctx.lineTo(cx-17, baseY-18); dep.ctx.stroke();
    dep.ctx.fillStyle='#9a938a';
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-19, baseY-19); dep.ctx.lineTo(cx-13, baseY-17); dep.ctx.lineTo(cx-16, baseY-13); dep.ctx.closePath(); dep.ctx.fill();
  }
  else if(b.type==='miningPost'){
    // rock mound
    dep.ctx.fillStyle='#4a4840';
    dep.ctx.beginPath();
    dep.ctx.moveTo(cx-24, baseY+2); dep.ctx.lineTo(cx-14, baseY-22); dep.ctx.lineTo(cx+4, baseY-28); dep.ctx.lineTo(cx+22, baseY-12); dep.ctx.lineTo(cx+24, baseY+2);
    dep.ctx.closePath(); dep.ctx.fill();
    dep.ctx.fillStyle='#5e5c54';
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-14, baseY-22); dep.ctx.lineTo(cx+4, baseY-28); dep.ctx.lineTo(cx+2, baseY-14); dep.ctx.lineTo(cx-8, baseY-10); dep.ctx.closePath(); dep.ctx.fill();
    // tunnel mouth with timber frame
    dep.ctx.fillStyle='#0c0a06';
    dep.ctx.beginPath(); dep.ctx.ellipse(cx, baseY-8, 10, 12, 0, Math.PI, 0); dep.ctx.fill();
    dep.ctx.fillRect(cx-10, baseY-8, 20, 9);
    dep.ctx.strokeStyle='#4c3820'; dep.ctx.lineWidth=3;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-11, baseY+1); dep.ctx.lineTo(cx-11, baseY-14); dep.ctx.lineTo(cx+11, baseY-14); dep.ctx.lineTo(cx+11, baseY+1); dep.ctx.stroke();
    // ore cart
    dep.ctx.fillStyle='#3a3630'; dep.ctx.fillRect(cx+14, baseY-7, 12, 7);
    dep.ctx.fillStyle='#7a6a3a'; dep.ctx.fillRect(cx+15, baseY-9, 10, 3);
    dep.ctx.fillStyle='#1c1a16';
    dep.ctx.beginPath(); dep.ctx.arc(cx+17, baseY+1, 2.4, 0, 7); dep.ctx.fill();
    dep.ctx.beginPath(); dep.ctx.arc(cx+23, baseY+1, 2.4, 0, 7); dep.ctx.fill();
    drawTorch(cx-18, baseY-16);
  }
  else if(b.type==='fishingHut'){
    // stilts
    dep.ctx.strokeStyle='#3c2e1c'; dep.ctx.lineWidth=2.5;
    for(const sx of [-12,-2,8]){ dep.ctx.beginPath(); dep.ctx.moveTo(cx+sx, baseY+2); dep.ctx.lineTo(cx+sx+2, baseY-10); dep.ctx.stroke(); }
    const topY = isoBox(cx, baseY-10, 16, 16, 13, '#5c4a30');
    plankLines(cx, baseY-10, -16, 13, -1);
    isoRoof(cx, topY, 16, 16, 11, '#42301e');
    // drying net
    dep.ctx.strokeStyle='rgba(180,190,180,0.5)'; dep.ctx.lineWidth=0.7;
    for(let i=0;i<4;i++){ dep.ctx.beginPath(); dep.ctx.moveTo(cx+18, baseY-24+i*3); dep.ctx.lineTo(cx+30, baseY-18+i*3); dep.ctx.stroke(); }
    for(let i=0;i<4;i++){ dep.ctx.beginPath(); dep.ctx.moveTo(cx+18+i*4, baseY-24+i*1); dep.ctx.lineTo(cx+18+i*4, baseY-12); dep.ctx.stroke(); }
    // hanging fish
    dep.ctx.fillStyle='#7a9aab';
    dep.ctx.beginPath(); dep.ctx.ellipse(cx+24, baseY-14, 3.5, 1.6, 0.9, 0, 7); dep.ctx.fill();
    glowWindow(cx-10, baseY-20, 5, 6, b.gy);
  }
  else if(b.type==='huntingCabin'){
    const topY = isoBox(cx, baseY, 19, 17, 15, '#4e3c26');
    // log ends — round dots along the corner
    dep.ctx.fillStyle='#68522f';
    for(let i=0;i<4;i++){ dep.ctx.beginPath(); dep.ctx.arc(cx, baseY-2-i*4, 2, 0, 7); dep.ctx.fill(); }
    plankLines(cx, baseY, -19, 15, -1);
    plankLines(cx, baseY, 17, 15, 1);
    isoRoof(cx, topY, 19, 17, 12, '#38281a');
    // antler rack above door
    doorArch(cx-8, baseY, 8, 11);
    dep.ctx.strokeStyle='#d8cdb8'; dep.ctx.lineWidth=1.4;
    dep.ctx.beginPath();
    dep.ctx.moveTo(cx-11, baseY-14); dep.ctx.lineTo(cx-8, baseY-18); dep.ctx.lineTo(cx-6, baseY-15);
    dep.ctx.moveTo(cx-8, baseY-18); dep.ctx.lineTo(cx-8, baseY-14);
    dep.ctx.moveTo(cx-5, baseY-14); dep.ctx.lineTo(cx-8, baseY-18);
    dep.ctx.stroke();
    // pelt drying frame
    dep.ctx.strokeStyle='#3c2e1c'; dep.ctx.lineWidth=1.6;
    dep.ctx.strokeRect(cx+14, baseY-18, 12, 14);
    dep.ctx.fillStyle='#8a6a42';
    dep.ctx.beginPath();
    dep.ctx.moveTo(cx+16, baseY-16); dep.ctx.lineTo(cx+24, baseY-16); dep.ctx.lineTo(cx+23, baseY-6); dep.ctx.lineTo(cx+17, baseY-6);
    dep.ctx.closePath(); dep.ctx.fill();
  }
  else if(b.type==='farm' && decorImg('farmland',0)){
    const fl = decorImg('farmland',0);
    const fw = TILE_W, fh = fw*(fl.naturalHeight/fl.naturalWidth);
    dep.ctx.drawImage(fl, p.x - fw/2, p.y - TILE_H/2, fw, fh);
    const si = seasonIndex();
    const cropKey = si===3 ? null : (si===0 ? 'cornYoung' : 'corn');
    if(cropKey){
      const c1 = decorImg(cropKey, 0);
      if(c1){
        const cw = 30, chh = cw*(c1.naturalHeight/c1.naturalWidth);
        dep.ctx.drawImage(c1, p.x - cw - 2, p.y - chh + 4, cw, chh);
        dep.ctx.drawImage(c1, p.x + 2, p.y - chh + 8, cw, chh);
      }
    }
    const fenceImg = decorImg('fence',0);
    if(fenceImg){
      const fw2 = 34, fh2 = fw2*(fenceImg.naturalHeight/fenceImg.naturalWidth);
      try {
        dep.ctx.drawImage(fenceImg, p.x - TILE_W/2 + 2, p.y - fh2 - 2, fw2, fh2);
        dep.ctx.drawImage(fenceImg, p.x + TILE_W/2 - fw2 - 2, p.y - fh2 + 6, fw2, fh2);
      } catch(e){}
    }
    const hayImg = decorImg('hayStack',0) || decorImg('hay',0);
    if(hayImg && hash2(b.gx,b.gy) > 0.5){
      const hw = 20, hh2 = hw*(hayImg.naturalHeight/hayImg.naturalWidth);
      dep.ctx.drawImage(hayImg, p.x + 12, p.y - hh2 + 2, hw, hh2);
    }
  }
  else if(b.type==='farm'){
    // tilled soil bed
    dep.ctx.fillStyle='#3c2c1a';
    tileDiamond(cx, p.y, TILE_W*0.95, TILE_H*0.95); dep.ctx.fill();
    // furrow rows following iso direction
    dep.ctx.strokeStyle='rgba(0,0,0,0.35)'; dep.ctx.lineWidth=1.4;
    for(let i=-2;i<=2;i++){
      dep.ctx.beginPath();
      dep.ctx.moveTo(cx-22+i*6, p.y+ (i*3) - 6);
      dep.ctx.lineTo(cx+10+i*6, p.y+ (i*3) + 10 - 6);
      dep.ctx.stroke();
    }
    // wheat shoots — grow with season (fuller in summer/autumn)
    const growth = seasonIndex()===3 ? 0.3 : (seasonIndex()===0 ? 0.6 : 1);
    dep.ctx.strokeStyle='#b89a3a'; dep.ctx.lineWidth=1.1;
    for(let i=0;i<10;i++){
      const ox=(hash2(b.gx*3+i, b.gy*5)-0.5)*38, oy=(hash2(b.gx*7, b.gy*2+i)-0.5)*14;
      const hgt = (4 + hash2(b.gx+i,b.gy)*5) * growth;
      dep.ctx.beginPath(); dep.ctx.moveTo(cx+ox, p.y+oy+3); dep.ctx.lineTo(cx+ox+1, p.y+oy+3-hgt); dep.ctx.stroke();
      if(growth>0.7){ dep.ctx.fillStyle='#d0b050'; dep.ctx.fillRect(cx+ox, p.y+oy+2-hgt, 2.4, 3); }
    }
    // corner fence posts
    dep.ctx.strokeStyle='#3c2e1c'; dep.ctx.lineWidth=1.8;
    for(const [fx,fy] of [[-26,0],[26,0],[0,-12],[0,12]]){
      dep.ctx.beginPath(); dep.ctx.moveTo(cx+fx, p.y+fy+2); dep.ctx.lineTo(cx+fx, p.y+fy-7); dep.ctx.stroke();
    }
  }
  else if(b.type==='granary'){
    // round tower: stacked ellipses illusion via vertical cylinder
    dep.ctx.fillStyle='#5c5648';
    dep.ctx.beginPath();
    dep.ctx.ellipse(cx, baseY-2, 16, 8, 0, 0, Math.PI); dep.ctx.fill();
    dep.ctx.fillRect(cx-16, baseY-26, 32, 24);
    dep.ctx.beginPath(); dep.ctx.ellipse(cx, baseY-2, 16, 8, 0, Math.PI, 0, true); dep.ctx.fill();
    // cylinder shading
    const grd = dep.ctx.createLinearGradient(cx-16, 0, cx+16, 0);
    grd.addColorStop(0,'rgba(255,240,210,0.10)'); grd.addColorStop(0.5,'rgba(0,0,0,0)'); grd.addColorStop(1,'rgba(0,0,0,0.30)');
    dep.ctx.fillStyle=grd; dep.ctx.fillRect(cx-16, baseY-26, 32, 24);
    stoneCourses(cx-16, baseY-2, 32, 24, 1);
    // conical thatch roof
    dep.ctx.fillStyle='#7a622e';
    dep.ctx.beginPath();
    dep.ctx.moveTo(cx-19, baseY-25); dep.ctx.lineTo(cx, baseY-44); dep.ctx.lineTo(cx+19, baseY-25);
    dep.ctx.closePath(); dep.ctx.fill();
    dep.ctx.fillStyle='rgba(0,0,0,0.25)';
    dep.ctx.beginPath(); dep.ctx.moveTo(cx, baseY-44); dep.ctx.lineTo(cx+19, baseY-25); dep.ctx.lineTo(cx+8, baseY-25); dep.ctx.closePath(); dep.ctx.fill();
    dep.ctx.strokeStyle='rgba(0,0,0,0.22)'; dep.ctx.lineWidth=0.8;
    for(let i=1;i<4;i++){ const y=baseY-25-(19*i/4); const w=19*(1-i/4); dep.ctx.beginPath(); dep.ctx.moveTo(cx-w,y+ (19-19*(1-i/4))*0 ); dep.ctx.lineTo(cx+w, y); dep.ctx.stroke(); }
    const sackImg = decorImg('sack',0);
    if(sackImg){
      const sw2 = 16, sh2 = sw2*(sackImg.naturalHeight/sackImg.naturalWidth);
      try { dep.ctx.drawImage(sackImg, cx+14, baseY-sh2+2, sw2, sh2); } catch(e){}
    }
    // loading door + pulley
    dep.ctx.fillStyle='#241a10'; dep.ctx.fillRect(cx-5, baseY-18, 10, 12);
    dep.ctx.strokeStyle='#241a10'; dep.ctx.lineWidth=1.5;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx, baseY-44); dep.ctx.lineTo(cx+9, baseY-50); dep.ctx.stroke();
    dep.ctx.beginPath(); dep.ctx.arc(cx+9, baseY-49, 2, 0, 7); dep.ctx.stroke();
  }
  else if(b.type==='tradingPost'){
    // counter base
    const topY = isoBox(cx, baseY, 22, 18, 10, '#5a4326');
    // corner posts + striped awning
    dep.ctx.strokeStyle='#3c2e1c'; dep.ctx.lineWidth=2.2;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-22, topY-11); dep.ctx.lineTo(cx-22, topY-30); dep.ctx.stroke();
    dep.ctx.beginPath(); dep.ctx.moveTo(cx+18, topY-9); dep.ctx.lineTo(cx+18, topY-28); dep.ctx.stroke();
    // awning canopy with stripes
    dep.ctx.fillStyle='#8a3428';
    dep.ctx.beginPath();
    dep.ctx.moveTo(cx-27, topY-28); dep.ctx.lineTo(cx+23, topY-26); dep.ctx.lineTo(cx+18, topY-16); dep.ctx.lineTo(cx-22, topY-18);
    dep.ctx.closePath(); dep.ctx.fill();
    dep.ctx.fillStyle='#d8cdb8';
    for(let i=0;i<3;i++){
      dep.ctx.beginPath();
      dep.ctx.moveTo(cx-27+ (i*2+1)*50/6, topY-28+ (i*2+1)*2/6);
      dep.ctx.lineTo(cx-22+ (i*2+1)*40/6, topY-18+ (i*2+1)*2/6);
      dep.ctx.lineTo(cx-22+ (i*2+2)*40/6, topY-18+ (i*2+2)*2/6);
      dep.ctx.lineTo(cx-27+ (i*2+2)*50/6, topY-28+ (i*2+2)*2/6);
      dep.ctx.closePath(); dep.ctx.fill();
    }
    const crateImg = decorImg('sacksCrate',0);
    if(crateImg){
      const cw2 = 24, ch2 = cw2*(crateImg.naturalHeight/crateImg.naturalWidth);
      try { dep.ctx.drawImage(crateImg, cx-30, baseY-ch2+2, cw2, ch2); } catch(e){}
    }
    // goods on counter: crate, sack, scales
    dep.ctx.fillStyle='#6a5232'; dep.ctx.fillRect(cx-14, topY-9, 9, 8);
    dep.ctx.strokeStyle='rgba(0,0,0,0.4)'; dep.ctx.lineWidth=0.7; dep.ctx.strokeRect(cx-14, topY-9, 9, 8);
    dep.ctx.fillStyle='#a89468';
    dep.ctx.beginPath(); dep.ctx.arc(cx+2, topY-5, 4.5, Math.PI, 0); dep.ctx.fill();
    dep.ctx.fillStyle='#8a7a4e'; dep.ctx.fillRect(cx+1, topY-9, 2, 3);
    // hanging lantern glow
    const lg = 0.5+Math.sin(G.worldTime*3)*0.12;
    dep.ctx.fillStyle=`rgba(255,200,110,${lg})`;
    dep.ctx.beginPath(); dep.ctx.arc(cx+13, topY-20, 3, 0, 7); dep.ctx.fill();
  }
  else if(b.type==='watchtower'){
    // tall narrow shaft with taper
    dep.ctx.fillStyle='#565044';
    dep.ctx.beginPath();
    dep.ctx.moveTo(cx-11, baseY); dep.ctx.lineTo(cx-8, baseY-42); dep.ctx.lineTo(cx+8, baseY-42); dep.ctx.lineTo(cx+11, baseY);
    dep.ctx.closePath(); dep.ctx.fill();
    dep.ctx.fillStyle='rgba(0,0,0,0.28)';
    dep.ctx.beginPath(); dep.ctx.moveTo(cx, baseY); dep.ctx.lineTo(cx, baseY-42); dep.ctx.lineTo(cx+8, baseY-42); dep.ctx.lineTo(cx+11, baseY); dep.ctx.closePath(); dep.ctx.fill();
    stoneCourses(cx-10, baseY, 20, 42, 1);
    // arrow slits
    dep.ctx.fillStyle='#0c0a06';
    dep.ctx.fillRect(cx-1.5, baseY-20, 3, 8);
    dep.ctx.fillRect(cx-1.5, baseY-34, 3, 8);
    // crenellated platform
    dep.ctx.fillStyle='#4a463c';
    dep.ctx.fillRect(cx-14, baseY-50, 28, 8);
    for(let i=0;i<4;i++) dep.ctx.fillRect(cx-14+i*8, baseY-55, 5, 5);
    // beacon torch — big flicker glow at top
    const flick = Math.max(0.5, 0.75+Math.sin(G.worldTime*8+1)*0.25);
    const g2 = dep.ctx.createRadialGradient(cx, baseY-58, 0, cx, baseY-58, 16*flick);
    g2.addColorStop(0,'rgba(255,196,110,0.85)'); g2.addColorStop(1,'rgba(255,140,40,0)');
    dep.ctx.fillStyle=g2;
    dep.ctx.beginPath(); dep.ctx.arc(cx, baseY-58, 16*flick, 0, 7); dep.ctx.fill();
    dep.ctx.fillStyle='#f0a23d';
    dep.ctx.beginPath(); dep.ctx.ellipse(cx, baseY-57, 3, Math.max(0.6, 5*flick), 0, 0, 7); dep.ctx.fill();
  }
  else if(b.type==='tavern'){
    // ground floor
    const topY = isoBox(cx, baseY, 24, 22, 16, '#5a462c');
    plankLines(cx, baseY, -24, 16, -1);
    // overhanging upper floor (jettied)
    const topY2 = isoBox(cx, topY+2, 27, 25, 14, '#6a5436');
    plankLines(cx, topY+2, 27, 14, 1);
    // timber frame X-brace on upper floor
    dep.ctx.strokeStyle='#2c2012'; dep.ctx.lineWidth=1.6;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-24, topY-4); dep.ctx.lineTo(cx-6, topY-16); dep.ctx.moveTo(cx-24, topY-16); dep.ctx.lineTo(cx-6, topY-4); dep.ctx.stroke();
    isoRoof(cx, topY2, 27, 25, 16, '#3a2818');
    // glowing windows both floors
    glowWindow(cx-18, baseY-11, 6, 7, 0.5);
    glowWindow(cx+10, baseY-12, 6, 7, 1.9);
    glowWindow(cx-14, topY-12, 6, 7, 3.1);
    doorArch(cx+2, baseY, 9, 13);
    // hanging sign + tankard glyph
    dep.ctx.strokeStyle='#1a1108'; dep.ctx.lineWidth=2;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-29, topY-8); dep.ctx.lineTo(cx-29, topY+6); dep.ctx.stroke();
    dep.ctx.fillStyle='#8a5a2c'; dep.ctx.fillRect(cx-36, topY+2, 13, 10);
    dep.ctx.strokeStyle='rgba(0,0,0,0.4)'; dep.ctx.strokeRect(cx-36, topY+2, 13, 10);
    dep.ctx.fillStyle='#d8cdb8'; dep.ctx.fillRect(cx-33, topY+4, 5, 6);
    dep.ctx.fillRect(cx-27.5, topY+5.5, 2, 3);
    // barrel by the door
    dep.ctx.fillStyle='#5e4426';
    dep.ctx.beginPath(); dep.ctx.ellipse(cx+16, baseY-4, 4.5, 6, 0, 0, 7); dep.ctx.fill();
    dep.ctx.strokeStyle='#2c2012'; dep.ctx.lineWidth=0.8;
    dep.ctx.beginPath(); dep.ctx.ellipse(cx+16, baseY-4, 4.5, 6, 0, 0, 7); dep.ctx.stroke();
    dep.ctx.beginPath(); dep.ctx.moveTo(cx+11.5, baseY-6); dep.ctx.lineTo(cx+20.5, baseY-6); dep.ctx.stroke();
    // chimney smoke
    dep.ctx.fillStyle='#4e463c'; dep.ctx.fillRect(cx+12, topY2-26, 5, 12);
    chimneySmoke(cx+14, topY2-26);
    drawTorch(cx+27, baseY-14);
  }
  else if(b.type==='sawmill'){
    const topY = isoBox(cx, baseY, 22, 18, 14, '#5c4628');
    plankLines(cx, baseY, -22, 14, -1);
    isoRoof(cx, topY, 22, 18, 12, '#3c2a18');
    // big circular saw blade
    const spin = G.worldTime*3;
    dep.ctx.save(); dep.ctx.translate(cx+16, baseY-8);
    dep.ctx.fillStyle='#8a8478';
    dep.ctx.beginPath(); dep.ctx.arc(0,0,7,0,7); dep.ctx.fill();
    dep.ctx.strokeStyle='#4a463c'; dep.ctx.lineWidth=1.4;
    for(let i=0;i<8;i++){ const a=spin+i*Math.PI/4; dep.ctx.beginPath(); dep.ctx.moveTo(Math.cos(a)*5,Math.sin(a)*5); dep.ctx.lineTo(Math.cos(a)*8.5,Math.sin(a)*8.5); dep.ctx.stroke(); }
    dep.ctx.restore();
    // plank stack (sprite with drawn fallback)
    const psImg = decorImg('plankStack',0);
    if(psImg){
      const pw = 26, ph2 = pw*(psImg.naturalHeight/psImg.naturalWidth);
      try { dep.ctx.drawImage(psImg, cx-34, baseY-ph2+2, pw, ph2); } catch(e){}
    } else {
      dep.ctx.fillStyle='#a8895a';
      for(let i=0;i<3;i++) dep.ctx.fillRect(cx-28, baseY-4-i*3.2, 16, 2.6);
      dep.ctx.strokeStyle='rgba(0,0,0,0.3)'; dep.ctx.lineWidth=0.6;
      for(let i=0;i<3;i++) dep.ctx.strokeRect(cx-28, baseY-4-i*3.2, 16, 2.6);
    }
    if(b.procFlash){ dep.ctx.fillStyle=`rgba(255,220,140,${b.procFlash*0.5})`; dep.ctx.beginPath(); dep.ctx.arc(cx+16, baseY-8, 12, 0, 7); dep.ctx.fill(); }
  }
  else if(b.type==='windmill'){
    // stone tower
    dep.ctx.fillStyle='#5c5648';
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-12, baseY); dep.ctx.lineTo(cx-8, baseY-34); dep.ctx.lineTo(cx+8, baseY-34); dep.ctx.lineTo(cx+12, baseY); dep.ctx.closePath(); dep.ctx.fill();
    dep.ctx.fillStyle='rgba(0,0,0,0.28)';
    dep.ctx.beginPath(); dep.ctx.moveTo(cx, baseY); dep.ctx.lineTo(cx, baseY-34); dep.ctx.lineTo(cx+8, baseY-34); dep.ctx.lineTo(cx+12, baseY); dep.ctx.closePath(); dep.ctx.fill();
    stoneCourses(cx-10, baseY, 20, 34, 1);
    // cap
    dep.ctx.fillStyle='#3a2818';
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-11, baseY-33); dep.ctx.lineTo(cx, baseY-44); dep.ctx.lineTo(cx+11, baseY-33); dep.ctx.closePath(); dep.ctx.fill();
    doorArch(cx, baseY, 8, 11);
    // rotating sails
    const rot = G.worldTime*0.9;
    dep.ctx.save(); dep.ctx.translate(cx, baseY-40);
    for(let i=0;i<4;i++){
      const a = rot + i*Math.PI/2;
      dep.ctx.save(); dep.ctx.rotate(a);
      dep.ctx.fillStyle='#c8bda4';
      dep.ctx.fillRect(-1.5, -26, 3, 24);
      dep.ctx.fillStyle='rgba(60,46,28,0.85)';
      dep.ctx.fillRect(1.5, -26, 5, 20);
      dep.ctx.strokeStyle='rgba(0,0,0,0.35)'; dep.ctx.lineWidth=0.6;
      dep.ctx.strokeRect(1.5, -26, 5, 20);
      dep.ctx.restore();
    }
    dep.ctx.fillStyle='#241a10'; dep.ctx.beginPath(); dep.ctx.arc(0,0,3,0,7); dep.ctx.fill();
    dep.ctx.restore();
    if(b.procFlash){ dep.ctx.fillStyle=`rgba(255,240,180,${b.procFlash*0.4})`; dep.ctx.beginPath(); dep.ctx.arc(cx, baseY-40, 26, 0, 7); dep.ctx.fill(); }
  }
  else if(b.type==='bakery'){
    const topY = isoBox(cx, baseY, 20, 18, 16, '#6a5232');
    plankLines(cx, baseY, 20, 16, 1);
    isoRoof(cx, topY, 20, 18, 13, '#42301c');
    glowWindow(cx-13, baseY-12, 6, 7, 2.2);
    doorArch(cx+7, baseY, 8, 12);
    // stone oven chimney with hearty smoke
    dep.ctx.fillStyle='#565044'; dep.ctx.fillRect(cx-16, topY-16, 7, 14);
    stoneCourses(cx-16, topY-2, 7, 14, 1);
    chimneySmoke(cx-12, topY-16);
    // bread sign
    dep.ctx.strokeStyle='#1a1108'; dep.ctx.lineWidth=1.8;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx+22, baseY-18); dep.ctx.lineTo(cx+22, baseY-8); dep.ctx.stroke();
    dep.ctx.fillStyle='#8a5a2c'; dep.ctx.fillRect(cx+17, baseY-10, 11, 8);
    dep.ctx.fillStyle='#d8a850';
    dep.ctx.beginPath(); dep.ctx.ellipse(cx+22.5, baseY-6, 3.5, 2, 0, 0, 7); dep.ctx.fill();
    if(b.procFlash){ dep.ctx.fillStyle=`rgba(255,200,120,${b.procFlash*0.5})`; dep.ctx.beginPath(); dep.ctx.arc(cx-12, topY-10, 12, 0, 7); dep.ctx.fill(); }
  }
  else if(b.type==='guardPost'){
    // raised timber platform
    dep.ctx.strokeStyle='#3c2e1c'; dep.ctx.lineWidth=3;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-10, baseY); dep.ctx.lineTo(cx-8, baseY-20); dep.ctx.stroke();
    dep.ctx.beginPath(); dep.ctx.moveTo(cx+10, baseY); dep.ctx.lineTo(cx+8, baseY-20); dep.ctx.stroke();
    const topY = isoBox(cx, baseY-20, 15, 13, 10, '#5a462c');
    plankLines(cx, baseY-20, 15, 10, 1);
    isoRoof(cx, topY, 15, 13, 9, '#38281a');
    // ladder
    dep.ctx.strokeStyle='#4c3820'; dep.ctx.lineWidth=1.4;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-4, baseY); dep.ctx.lineTo(cx-2, baseY-18); dep.ctx.moveTo(cx+2, baseY); dep.ctx.lineTo(cx+4, baseY-18); dep.ctx.stroke();
    for(let i=1;i<5;i++){ const y=baseY-i*3.6; dep.ctx.beginPath(); dep.ctx.moveTo(cx-3.4+i*0.35, y); dep.ctx.lineTo(cx+3.4-i*0.1, y); dep.ctx.stroke(); }
    // shield emblem + banner
    dep.ctx.fillStyle='#8a3428';
    dep.ctx.beginPath(); dep.ctx.moveTo(cx, baseY-24); dep.ctx.lineTo(cx+5, baseY-28); dep.ctx.lineTo(cx+5, baseY-34); dep.ctx.lineTo(cx-5, baseY-34); dep.ctx.lineTo(cx-5, baseY-28); dep.ctx.closePath(); dep.ctx.fill();
    dep.ctx.strokeStyle='#d8cdb8'; dep.ctx.lineWidth=1;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-3, baseY-31); dep.ctx.lineTo(cx+3, baseY-31); dep.ctx.moveTo(cx, baseY-33.5); dep.ctx.lineTo(cx, baseY-26); dep.ctx.stroke();
    drawTorch(cx+16, baseY-24);
  }
  else if(b.type==='bridge'){
    // plank span across the recessed water surface. Deck sits at bank level;
    // posts drop to the water below (WATER_DROP).
    const wy = baseY + WATER_DROP;
    // support posts
    dep.ctx.strokeStyle='#3a2c1a'; dep.ctx.lineWidth=3;
    dep.ctx.beginPath();
    dep.ctx.moveTo(cx-14, baseY-2); dep.ctx.lineTo(cx-14, wy+3);
    dep.ctx.moveTo(cx+14, baseY-2); dep.ctx.lineTo(cx+14, wy+3);
    dep.ctx.stroke();
    // deck: iso diamond of planks at bank level
    dep.ctx.fillStyle='#5a4429';
    tileDiamond(cx, baseY-3, TILE_W*0.98, TILE_H*0.98); dep.ctx.fill();
    dep.ctx.fillStyle='rgba(0,0,0,0.14)';
    tileDiamond(cx, baseY-3, TILE_W*0.7, TILE_H*0.7); dep.ctx.fill();
    // plank seams along the crossing direction
    dep.ctx.strokeStyle='rgba(30,20,10,0.55)'; dep.ctx.lineWidth=1;
    for(let i=-2;i<=2;i++){
      dep.ctx.beginPath();
      dep.ctx.moveTo(cx - TILE_W*0.42 + i*3, baseY-3 + i*TILE_H*0.16);
      dep.ctx.lineTo(cx + TILE_W*0.42 + i*3, baseY-3 + i*TILE_H*0.16 - TILE_H*0.0);
      dep.ctx.stroke();
    }
    // rail posts + rope rail on both edges
    dep.ctx.strokeStyle='#46351e'; dep.ctx.lineWidth=2;
    for(const side of [-1,1]){
      const rx1=cx - TILE_W*0.36, rx2=cx + TILE_W*0.36;
      const ry = baseY-3 + side*TILE_H*0.34;
      dep.ctx.beginPath(); dep.ctx.moveTo(rx1, ry); dep.ctx.lineTo(rx1, ry-8); dep.ctx.stroke();
      dep.ctx.beginPath(); dep.ctx.moveTo(rx2, ry); dep.ctx.lineTo(rx2, ry-8); dep.ctx.stroke();
      dep.ctx.strokeStyle='rgba(90,70,40,0.9)'; dep.ctx.lineWidth=1.2;
      dep.ctx.beginPath(); dep.ctx.moveTo(rx1, ry-7); dep.ctx.quadraticCurveTo(cx, ry-4, rx2, ry-7); dep.ctx.stroke();
      dep.ctx.strokeStyle='#46351e'; dep.ctx.lineWidth=2;
    }
  }
  else if(b.type==='well'){
    // stone-ringed well with a little timber roof and bucket
    dep.ctx.fillStyle='#2a2418'; tileDiamond(cx, baseY+3, TILE_W*0.7, TILE_H*0.7); dep.ctx.fill();
    // stone ring
    dep.ctx.fillStyle='#6b6455';
    dep.ctx.beginPath(); dep.ctx.ellipse(cx, baseY-3, 13, 7, 0, 0, 7); dep.ctx.fill();
    dep.ctx.fillStyle='#141210';
    dep.ctx.beginPath(); dep.ctx.ellipse(cx, baseY-4, 8.5, 4.5, 0, 0, 7); dep.ctx.fill();
    dep.ctx.strokeStyle='rgba(0,0,0,0.35)'; dep.ctx.lineWidth=1;
    dep.ctx.beginPath(); dep.ctx.ellipse(cx, baseY-3, 13, 7, 0, 0, 7); dep.ctx.stroke();
    // two posts + roof
    dep.ctx.strokeStyle='#4a3a24'; dep.ctx.lineWidth=2.4;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-10, baseY-6); dep.ctx.lineTo(cx-10, baseY-24); dep.ctx.moveTo(cx+10, baseY-6); dep.ctx.lineTo(cx+10, baseY-24); dep.ctx.stroke();
    dep.ctx.fillStyle='#4a2f1c';
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-14, baseY-22); dep.ctx.lineTo(cx, baseY-31); dep.ctx.lineTo(cx+14, baseY-22); dep.ctx.closePath(); dep.ctx.fill();
    // bucket rope + bucket
    dep.ctx.strokeStyle='#2c2214'; dep.ctx.lineWidth=1; dep.ctx.beginPath(); dep.ctx.moveTo(cx, baseY-22); dep.ctx.lineTo(cx, baseY-11); dep.ctx.stroke();
    dep.ctx.fillStyle='#5a4025'; dep.ctx.fillRect(cx-3, baseY-12, 6, 5);
  }
  else if(b.type==='lampPost'){
    // small stone footing
    dep.ctx.fillStyle='#2a2418'; tileDiamond(cx, baseY+2, TILE_W*0.34, TILE_H*0.34); dep.ctx.fill();
    dep.ctx.fillStyle='#6b6455';
    dep.ctx.beginPath(); dep.ctx.ellipse(cx, baseY-1, 5.5, 3, 0, 0, 7); dep.ctx.fill();
    // timber post
    dep.ctx.strokeStyle='#3a2c1a'; dep.ctx.lineWidth=3;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx, baseY-2); dep.ctx.lineTo(cx, baseY-30); dep.ctx.stroke();
    // cross-arm the lantern hangs from
    dep.ctx.lineWidth=2.2;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx, baseY-28); dep.ctx.lineTo(cx+7, baseY-30); dep.ctx.stroke();
    const lx = cx+7, ly = baseY-22;
    // hanging chain
    dep.ctx.strokeStyle='#241505'; dep.ctx.lineWidth=1;
    dep.ctx.beginPath(); dep.ctx.moveTo(lx, baseY-30); dep.ctx.lineTo(lx, ly-6); dep.ctx.stroke();
    // iron lantern housing
    dep.ctx.fillStyle='#1c1710';
    dep.ctx.beginPath(); dep.ctx.moveTo(lx-4, ly-6); dep.ctx.lineTo(lx+4, ly-6); dep.ctx.lineTo(lx+5, ly+4); dep.ctx.lineTo(lx-5, ly+4); dep.ctx.closePath(); dep.ctx.fill();
    // roof cap
    dep.ctx.fillStyle='#2a2018';
    dep.ctx.beginPath(); dep.ctx.moveTo(lx-5, ly-6); dep.ctx.lineTo(lx, ly-11); dep.ctx.lineTo(lx+5, ly-6); dep.ctx.closePath(); dep.ctx.fill();
    // flame glow — brighter after dark, gently flickering
    const dk = darknessFactor();
    const flick = 0.65 + Math.sin(G.worldTime*8 + cx)*0.2;
    const glow = 0.25 + dk*0.55;
    dep.ctx.fillStyle='#f2c86a';
    dep.ctx.beginPath(); dep.ctx.ellipse(lx, ly-1, 2.4, Math.max(1, 3.4*flick), 0, 0, 7); dep.ctx.fill();
    const g = dep.ctx.createRadialGradient(lx, ly-1, 0, lx, ly-1, 16*flick);
    g.addColorStop(0, 'rgba(255,196,110,'+(glow*flick).toFixed(3)+')');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    dep.ctx.fillStyle=g; dep.ctx.beginPath(); dep.ctx.arc(lx, ly-1, 16*flick, 0, 7); dep.ctx.fill();
  }
  else if(b.type==='forester'){
    // a tended nursery of saplings in rows
    dep.ctx.fillStyle='#2f2a18'; tileDiamond(cx, baseY+2, TILE_W*0.8, TILE_H*0.8); dep.ctx.fill();
    dep.ctx.strokeStyle='#241c12'; dep.ctx.lineWidth=1.2; tileDiamond(cx, baseY+2, TILE_W*0.8, TILE_H*0.8); dep.ctx.stroke();
    for(let i=0;i<7;i++){
      const a=i*2.39996, r=3+Math.sqrt(i)*5;
      const sx=cx+Math.cos(a)*r, sy=baseY+2+Math.sin(a)*r*0.5;
      dep.ctx.strokeStyle='#5a4025'; dep.ctx.lineWidth=1.4; dep.ctx.beginPath(); dep.ctx.moveTo(sx, sy); dep.ctx.lineTo(sx, sy-7); dep.ctx.stroke();
      dep.ctx.fillStyle=(i%2)?'#4a5d33':'#6d854c'; dep.ctx.beginPath(); dep.ctx.moveTo(sx, sy-13); dep.ctx.lineTo(sx-4, sy-6); dep.ctx.lineTo(sx+4, sy-6); dep.ctx.closePath(); dep.ctx.fill();
    }
  }
  else if(b.type==='pasture'){
    // fenced grazing field with a few animals
    dep.ctx.fillStyle = seasonIndex()===3 ? '#6a7360' : '#4a5d33';
    tileDiamond(cx, baseY+2, TILE_W*0.82, TILE_H*0.82); dep.ctx.fill();
    dep.ctx.strokeStyle='#2a2014'; dep.ctx.lineWidth=1.4;
    tileDiamond(cx, baseY+2, TILE_W*0.82, TILE_H*0.82); dep.ctx.stroke();
    // fence posts around the rim
    dep.ctx.strokeStyle='#5a4025'; dep.ctx.lineWidth=1.8;
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2 + Math.PI/4;
      const px=cx+Math.cos(a)*TILE_W*0.38, py=baseY+2+Math.sin(a)*TILE_H*0.38;
      dep.ctx.beginPath(); dep.ctx.moveTo(px, py); dep.ctx.lineTo(px, py-6); dep.ctx.stroke();
    }
    // animals — small woolly dots, count reflects the herd
    const herd = Math.max(1, Math.min(6, b.herd||2));
    for(let i=0;i<herd;i++){
      const a = i*2.39996, r = 3+Math.sqrt(i)*4.2;
      const ax = cx + Math.cos(a)*r, ay = baseY + Math.sin(a)*r*0.5;
      dep.ctx.fillStyle='#e8e2d2'; dep.ctx.beginPath(); dep.ctx.ellipse(ax, ay-3, 3.4, 2.6, 0, 0, 7); dep.ctx.fill();
      dep.ctx.fillStyle='#3a3026'; dep.ctx.fillRect(ax-1, ay-2, 2, 2); // head
    }
  }
  else if(b.type==='palisade'){
    // row of sharpened stakes across the tile
    const stakes = 5;
    for(let i=0;i<stakes;i++){
      const fx = cx - 18 + i*9 + (hash2(b.gx+i, b.gy)*3-1.5);
      const fy = baseY - 2 + (i%2)*2.5;
      const hgt = 17 + hash2(b.gx*2+i, b.gy*3)*5;
      dep.ctx.fillStyle = i%2 ? '#54422a' : '#5e4a30';
      dep.ctx.beginPath();
      dep.ctx.moveTo(fx-2.6, fy); dep.ctx.lineTo(fx-2.2, fy-hgt+4); dep.ctx.lineTo(fx, fy-hgt); dep.ctx.lineTo(fx+2.2, fy-hgt+4); dep.ctx.lineTo(fx+2.6, fy);
      dep.ctx.closePath(); dep.ctx.fill();
      dep.ctx.strokeStyle='rgba(0,0,0,0.3)'; dep.ctx.lineWidth=0.6;
      dep.ctx.beginPath(); dep.ctx.moveTo(fx, fy); dep.ctx.lineTo(fx, fy-hgt+2); dep.ctx.stroke();
    }
    // horizontal binding beam
    dep.ctx.strokeStyle='#3c2e1c'; dep.ctx.lineWidth=2.2;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx-20, baseY-9); dep.ctx.lineTo(cx+20, baseY-7); dep.ctx.stroke();
  }
  else if(b.type==='manor'){
    // grand two-storey timber-framed hall
    const topY = isoBox(cx, baseY, 25, 22, 15, '#6a5a3c');
    stoneCourses(cx, baseY, -25, 15, -1);
    const topY2 = isoBox(cx, topY+2, 27, 24, 14, '#7a664a');
    // timber X-framing on the upper storey
    dep.ctx.strokeStyle='#2c2012'; dep.ctx.lineWidth=1.5;
    dep.ctx.beginPath();
    dep.ctx.moveTo(cx-24, topY-4); dep.ctx.lineTo(cx-8, topY-15); dep.ctx.moveTo(cx-24, topY-15); dep.ctx.lineTo(cx-8, topY-4);
    dep.ctx.moveTo(cx+6, topY-5); dep.ctx.lineTo(cx+20, topY-14); dep.ctx.moveTo(cx+6, topY-14); dep.ctx.lineTo(cx+20, topY-5);
    dep.ctx.stroke();
    isoRoof(cx, topY2, 27, 24, 18, '#3c2c1c');
    // windows on both storeys — a wealthy glow
    glowWindow(cx-18, baseY-11, 6, 7, 0.7);
    glowWindow(cx+11, baseY-12, 6, 7, 1.6);
    glowWindow(cx-15, topY-12, 6, 7, 2.8);
    glowWindow(cx+8, topY-13, 6, 7, 3.9);
    doorArch(cx-2, baseY, 10, 14);
    // twin chimneys with smoke
    dep.ctx.fillStyle='#565044';
    dep.ctx.fillRect(cx-14, topY2-26, 5, 12);
    dep.ctx.fillRect(cx+11, topY2-24, 5, 10);
    chimneySmoke(cx-12, topY2-26);
    chimneySmoke(cx+13, topY2-24);
  }
}

export function drawTorch(x,y){
  const fireImg = decorImg('fire', G.worldTime*9 + x*0.13);
  if(fireImg){
    dep.ctx.strokeStyle='#241505'; dep.ctx.lineWidth=2;
    dep.ctx.beginPath(); dep.ctx.moveTo(x, y+10); dep.ctx.lineTo(x, y-2); dep.ctx.stroke();
    const w = 15, hgt = w*(fireImg.naturalHeight/fireImg.naturalWidth);
    dep.ctx.drawImage(fireImg, x-w/2, y-hgt-1, w, hgt);
    const flick = 0.55+Math.sin(G.worldTime*8+x)*0.15;
    const g = dep.ctx.createRadialGradient(x, y-6, 0, x, y-6, 15);
    g.addColorStop(0, 'rgba(255,180,80,'+(0.35*flick)+')');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    dep.ctx.fillStyle=g; dep.ctx.beginPath(); dep.ctx.arc(x, y-6, 15, 0, Math.PI*2); dep.ctx.fill();
    return;
  }
  dep.ctx.fillStyle='#2a1d12'; dep.ctx.fillRect(x-2,y-6,4,16);
  const flick = Math.max(0.4, 0.7+Math.sin(G.worldTime*9 + x)*0.3);
  const grd = dep.ctx.createRadialGradient(x,y-10,0,x,y-10,14*flick);
  grd.addColorStop(0,'rgba(255,196,110,0.9)');
  grd.addColorStop(1,'rgba(255,140,40,0)');
  dep.ctx.fillStyle=grd;
  dep.ctx.beginPath(); dep.ctx.arc(x,y-10,14*flick,0,7); dep.ctx.fill();
  dep.ctx.fillStyle='#f0a23d';
  dep.ctx.beginPath(); dep.ctx.ellipse(x,y-9,3,Math.max(0.5,5*flick),0,0,7); dep.ctx.fill();
}


// Per-settler variety on the shared sprite frames: a small palette of clothing
// tints keyed to each villager's id, so a crowd no longer looks like one person
// copied a dozen times. Tint = multiply a hue over the frame, then re-apply the
// frame's own alpha mask so transparency and shading survive. Cached per
// (frame,tint) — never allocated per draw.

