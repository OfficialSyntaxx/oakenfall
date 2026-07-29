/* Everything on the land that is not a building: trees, rock, fishing spots,
 * pasture animals, memorial stones and the merchant's cart.
 *
 * Trees and rock are the hottest draw path in the game — a hundred or more per
 * frame — so their variants are pre-rendered once into offscreen canvases at 2x
 * and blitted, rather than drawn stroke by stroke every frame. That one change
 * is most of the difference between smooth and not on a phone.
 */
import { G } from './state';
import { SPRITES, SPRITE_SCALE, decorImg } from './sprites';
import { clamp, hash2, project, TILE_W, TILE_H } from './math';
import { WATER_DROP } from './defs';
import { seasonIndex, riverFrozen } from './time';
import { getWeather } from './weather';
import { shade, shadeColor, drawShadow, tileDiamond } from './isokit';

type Deps = {
  ctx: any;
  /** Wind lean at a tile, so scenery sways with the same gust as the grass. */
  windAt: (gx: number, gy: number) => number;
};
let dep: Deps = {
  ctx: null, windAt: () => 0,
};
export function initScenery(deps: Deps): void { dep = deps; }

/* ── SPRITE ATLAS ── trees/rocks are the hottest draw path (100+ per frame).
   Pre-render variants once to offscreen canvases at 2x and blit — huge mobile win. */
const ATLAS = { trees:[], treesWinter:[], rocks:[] };
export function buildAtlas(){
  const mk = (w,hgt,fn)=>{
    const c=document.createElement('canvas'); c.width=w*2; c.height=hgt*2;
    const a=c.getContext('2d'); a.scale(2,2); fn(a); return c;
  };
  ATLAS.trees=[]; ATLAS.treesWinter=[]; ATLAS.rocks=[];
  for(let v=0; v<4; v++){
    for(const winter of [false,true]){
      const cnv = mk(80, 96, (a)=>{
        const cx=40, baseY=86, s=0.82+v*0.13;
        // trunk with bark shading + root flare
        a.fillStyle='#2c2010';
        a.beginPath(); a.moveTo(cx-3.4*s, baseY); a.lineTo(cx-2*s, baseY-12*s); a.lineTo(cx+2*s, baseY-12*s); a.lineTo(cx+3.4*s, baseY); a.closePath(); a.fill();
        a.fillStyle='rgba(90,66,38,0.5)';
        a.beginPath(); a.moveTo(cx-2.6*s, baseY); a.lineTo(cx-1.4*s, baseY-11*s); a.lineTo(cx-0.2*s, baseY-11*s); a.lineTo(cx-0.6*s, baseY); a.closePath(); a.fill();
        // 5 frond tiers, each a jagged multi-point silhouette (not a plain triangle)
        const nTiers = 5;
        for(let ti=0; ti<nTiers; ti++){
          const frac = ti/(nTiers-1);
          const w = (36 - frac*26) * s;
          const hh = (13 - frac*3) * s;
          const ty = baseY - 10*s - ti*11*s;
          const base = winter ? [46,66,52] : [26,44,28];
          const lit  = winter ? [66,88,72] : [42,66,40];
          const mix=(c1,c2,f)=>'rgb('+c1.map((c,i)=>Math.round(c+(c2[i]-c)*f)).join(',')+')';
          a.fillStyle = mix(base, lit, frac*0.5);
          a.beginPath();
          a.moveTo(cx, ty-hh);
          // jagged right edge
          a.lineTo(cx+w*0.28, ty-hh*0.45);
          a.lineTo(cx+w*0.20, ty-hh*0.40);
          a.lineTo(cx+w*0.5, ty);
          a.lineTo(cx+w*0.34, ty+1.5);
          a.lineTo(cx, ty+0.5);
          a.lineTo(cx-w*0.34, ty+1.5);
          a.lineTo(cx-w*0.5, ty);
          a.lineTo(cx-w*0.20, ty-hh*0.40);
          a.lineTo(cx-w*0.28, ty-hh*0.45);
          a.closePath(); a.fill();
          // left-face light wash (sun side)
          a.fillStyle='rgba(120,170,100,0.16)';
          a.beginPath(); a.moveTo(cx, ty-hh); a.lineTo(cx-w*0.5, ty); a.lineTo(cx-w*0.18, ty); a.closePath(); a.fill();
          // right-face shade
          a.fillStyle='rgba(0,0,0,0.18)';
          a.beginPath(); a.moveTo(cx, ty-hh); a.lineTo(cx+w*0.5, ty); a.lineTo(cx+w*0.18, ty); a.closePath(); a.fill();
          if(winter){
            a.fillStyle='rgba(226,238,246,0.85)';
            a.beginPath(); a.moveTo(cx, ty-hh); a.lineTo(cx+w*0.22, ty-hh*0.5); a.lineTo(cx-w*0.22, ty-hh*0.5); a.closePath(); a.fill();
          }
        }
        // rim highlight on crown
        a.strokeStyle = winter ? 'rgba(240,248,255,0.5)' : 'rgba(150,200,120,0.35)';
        a.lineWidth=1;
        a.beginPath(); a.moveTo(cx-3, baseY-10*s-4*11*s-8*s); a.lineTo(cx, baseY-10*s-4*11*s-12*s); a.lineTo(cx+3, baseY-10*s-4*11*s-8*s); a.stroke();
      });
      (winter?ATLAS.treesWinter:ATLAS.trees).push(cnv);
    }
  }
  for(let v=0; v<3; v++){
    ATLAS.rocks.push(mk(70, 60, (a)=>{
      const cx=35, cy=44, s=0.8+v*0.18;
      a.fillStyle='#4e4c44';
      a.beginPath(); a.moveTo(cx-13*s,cy+4*s); a.lineTo(cx-7*s,cy-11*s); a.lineTo(cx+3*s,cy-14*s); a.lineTo(cx+12*s,cy-3*s); a.lineTo(cx+9*s,cy+5*s); a.closePath(); a.fill();
      a.fillStyle='#6a6860';
      a.beginPath(); a.moveTo(cx-7*s,cy-11*s); a.lineTo(cx+3*s,cy-14*s); a.lineTo(cx+2*s,cy-5*s); a.lineTo(cx-4*s,cy-4*s); a.closePath(); a.fill();
      a.fillStyle='#2e2c28';
      a.beginPath(); a.moveTo(cx+3*s,cy-14*s); a.lineTo(cx+12*s,cy-3*s); a.lineTo(cx+9*s,cy+5*s); a.lineTo(cx+2*s,cy-5*s); a.closePath(); a.fill();
      if(v!==1){ a.strokeStyle='rgba(160,130,60,0.55)'; a.lineWidth=1.2; a.beginPath(); a.moveTo(cx-4*s,cy-2*s); a.lineTo(cx+3*s,cy-8*s); a.lineTo(cx+7*s,cy-4*s); a.stroke(); }
    }));
  }
}
export function drawTree(gx,gy){
  const p = project(gx,gy);
  const s = 0.78 + hash2(gx,gy)*0.44;
  const ox = (hash2(gx*1.7,gy*2.3)-0.5)*14;
  const cx = p.x+ox, baseY = p.y+5;
  const isWinter = seasonIndex()===3;
  // Shadow ellipse always drawn
  dep.ctx.fillStyle='rgba(0,0,0,0.28)';
  dep.ctx.beginPath(); dep.ctx.ellipse(cx, baseY+2, 16*s, 7*s, 0, 0, Math.PI*2); dep.ctx.fill();
  // Try AI sprite
  const img = SPRITES['tree_pine'];
  if(img && img.complete && img.naturalWidth>0){
    try {
      const w = SPRITE_SCALE.tree_pine * s;
      const h = w * (img.naturalHeight/img.naturalWidth);
      dep.ctx.drawImage(img, cx-w/2, baseY-h+6, w, h);
      if(isWinter){ dep.ctx.fillStyle='rgba(220,235,245,0.22)'; dep.ctx.beginPath(); dep.ctx.ellipse(cx,baseY-h*0.6,w*0.3,h*0.15,0,0,Math.PI*2); dep.ctx.fill(); }
      return;
    } catch(e){ delete SPRITES['tree_pine']; }
  }
  // Dense pines are the forest's soul; a rare ancient oak stands among them
  // (~1 in 8 tiles, summer only). Sway is a smooth skew transform — frame-free.
  if(!isWinter && hash2(gx*3.7, gy*5.1) > 0.875){
    const oakImg = decorImg('oak', 0);
    if(oakImg){
      const hh = 82*s, w = hh*(oakImg.naturalWidth/oakImg.naturalHeight);
      const sway = Math.sin(G.worldTime*1.1 + gx*0.8 + gy*0.5) * 0.022;
      dep.ctx.save();
      dep.ctx.translate(cx, baseY+8);
      dep.ctx.transform(1, 0, sway, 1, 0, 0);
      try { dep.ctx.drawImage(oakImg, -w/2, -hh, w, hh); } catch(e){}
      dep.ctx.restore();
      return;
    }
  }
  const pool = isWinter ? ATLAS.treesWinter : ATLAS.trees;
  if(pool.length){
    const img = pool[Math.floor(hash2(gx*2.3,gy*3.7)*pool.length)];
    const w = 80*s*0.9, hh = 96*s*0.9;
    dep.ctx.drawImage(img, cx-w/2, baseY-hh+10, w, hh);
  }
}

export function drawRock(gx,gy){
  const p = project(gx,gy);
  const ox = (hash2(gx*2.1,gy*1.3)-0.5)*14;
  const cx = p.x+ox, cy=p.y+3;
  const s = 0.75+hash2(gx,gy*3)*0.5;
  // shadow
  dep.ctx.fillStyle='rgba(0,0,0,0.28)';
  dep.ctx.beginPath(); dep.ctx.ellipse(cx, cy+6*s, 14*s, 6*s, 0, 0, Math.PI*2); dep.ctx.fill();
  // Try AI sprite
  const img = SPRITES['rock_outcrop'];
  if(img && img.complete && img.naturalWidth>0){
    try {
      const w = SPRITE_SCALE.rock_outcrop * s;
      const h = w * (img.naturalHeight/img.naturalWidth);
      dep.ctx.drawImage(img, cx-w/2, cy-h+8, w, h);
      return;
    } catch(e){ delete SPRITES['rock_outcrop']; }
  }
  // Baked rock sprites take priority; procedural atlas as fallback
  const rockImg = decorImg('rocks', hash2(gx*1.7,gy*2.9)*4);
  if(rockImg){
    const w = 46*s, hh = w*(rockImg.naturalHeight/rockImg.naturalWidth);
    dep.ctx.drawImage(rockImg, cx-w/2, cy-hh+10, w, hh);
  } else if(ATLAS.rocks.length){
    const img = ATLAS.rocks[Math.floor(hash2(gx*1.7,gy*2.9)*ATLAS.rocks.length)];
    const w = 70*s*0.85, hh = 60*s*0.85;
    dep.ctx.drawImage(img, cx-w/2, cy-hh+12, w, hh);
  }
}

/* A live fishing spot, seen from above the water rather than on it.
   The old version drew a whole fish lying on the surface, at land height —
   which is the same mistake the ducks had. What tells you fish are HERE is what
   you'd actually see from a bank: a dark shape gliding under the surface,
   bubbles rising and popping, and the rings they leave. */
export function drawFishSpot(gx, gy){
  const p = project(gx, gy);
  const ox = (hash2(gx*1.4, gy*2.6)-0.5)*12;
  const cx = p.x + ox, surf = p.y + WATER_DROP;      // water sits recessed
  const t = G.worldTime;

  // Lily pad, floating flat on the surface.
  dep.ctx.fillStyle = '#2a4e28';
  dep.ctx.beginPath(); dep.ctx.ellipse(cx-7, surf+2, 5, 2.4, -0.3, 0, 7); dep.ctx.fill();
  dep.ctx.fillStyle = 'rgba(120,160,110,0.25)';
  dep.ctx.beginPath(); dep.ctx.ellipse(cx-8, surf+1.4, 2.4, 1.1, -0.3, 0, 7); dep.ctx.fill();

  // The fish itself: a shadow under the water, never a body on top of it.
  // It circles slowly, rising close enough to the surface to catch the light.
  const a = t*0.7 + gx*1.3 + gy*0.7;
  const fx = cx + Math.cos(a)*7, fy = surf + 1.5 + Math.sin(a*1.3)*1.8;
  const depth = 0.5 + Math.sin(a*1.3)*0.5;           // 0 deep … 1 just under
  dep.ctx.save();
  dep.ctx.globalAlpha = 0.18 + depth*0.26;
  dep.ctx.fillStyle = '#0d2029';
  dep.ctx.translate(fx, fy);
  dep.ctx.rotate(Math.sin(a)*0.35);
  dep.ctx.beginPath(); dep.ctx.ellipse(0, 0, 5.5, 1.9, 0, 0, 7); dep.ctx.fill();
  dep.ctx.beginPath(); dep.ctx.moveTo(-4.5, 0); dep.ctx.lineTo(-8, -2.2); dep.ctx.lineTo(-8, 2.2); dep.ctx.closePath(); dep.ctx.fill();
  dep.ctx.restore();

  // Bubbles: rise, shrink, and leave a ring where they break the surface.
  for(let i=0;i<3;i++){
    const ph = ((t*0.45 + hash2(gx*7+i, gy*3.1)) % 1);
    const bx = cx + (hash2(gx*2+i, gy*5.3)-0.5)*11;
    const by = surf + 4.5 - ph*5.5;
    if(ph < 0.82){
      dep.ctx.globalAlpha = 0.30 * (1 - ph*0.6);
      dep.ctx.fillStyle = '#cfe6f2';
      dep.ctx.beginPath(); dep.ctx.arc(bx, by, 1.5 - ph*0.7, 0, 7); dep.ctx.fill();
    } else {
      const pop = (ph - 0.82) / 0.18;                 // the burst at the top
      dep.ctx.globalAlpha = 0.30 * (1 - pop);
      dep.ctx.strokeStyle = '#cfe6f2'; dep.ctx.lineWidth = 0.8;
      dep.ctx.beginPath(); dep.ctx.ellipse(bx, surf - 0.5, 1.5 + pop*4, 0.6 + pop*1.6, 0, 0, 7); dep.ctx.stroke();
    }
  }
  dep.ctx.globalAlpha = 1;

  // Slow rings spreading from the spot.
  dep.ctx.strokeStyle = 'rgba(180,210,220,0.24)'; dep.ctx.lineWidth = 1;
  dep.ctx.beginPath(); dep.ctx.ellipse(cx, surf, 8 + Math.sin(t*1.8+gx)*1.5, 3.2, 0, 0, 7); dep.ctx.stroke();
  dep.ctx.strokeStyle = 'rgba(180,210,220,0.12)'; dep.ctx.lineWidth = 0.8;
  dep.ctx.beginPath(); dep.ctx.ellipse(cx, surf, 14 + Math.sin(t*1.4+gy)*2, 4.8, 0, 0, 7); dep.ctx.stroke();

  // Once in a while a tail breaks the surface where the shape is shallowest.
  if(depth > 0.94){
    dep.ctx.fillStyle = 'rgba(150,180,196,0.65)';
    dep.ctx.beginPath();
    dep.ctx.moveTo(fx-4, surf); dep.ctx.lineTo(fx-7, surf-4); dep.ctx.lineTo(fx-2.5, surf-1.2);
    dep.ctx.closePath(); dep.ctx.fill();
  }
}
export function drawAnimal(gx,gy){
  const p = project(gx,gy);
  const ox = (hash2(gx*2.2,gy*1.6)-0.5)*14, oy=(hash2(gx*1.1,gy*3.3)-0.5)*5;
  const cx = p.x+ox, baseY = p.y+oy+3;
  const sway = Math.sin(G.worldTime*1.2 + gx+gy)*1.2;
  const legBob = Math.abs(Math.sin(G.worldTime*1.8+gx))*2;
  // shadow
  dep.ctx.fillStyle='rgba(0,0,0,0.22)';
  dep.ctx.beginPath(); dep.ctx.ellipse(cx+sway, baseY+5, 10, 4, 0, 0, Math.PI*2); dep.ctx.fill();
  // body
  dep.ctx.fillStyle='#7a5e3a';
  dep.ctx.beginPath(); dep.ctx.ellipse(cx+sway, baseY-3, 10, 6, 0, 0, Math.PI*2); dep.ctx.fill();
  // lighter belly
  dep.ctx.fillStyle='#9a7e58';
  dep.ctx.beginPath(); dep.ctx.ellipse(cx+sway, baseY-1.5, 6, 3.5, 0, 0, Math.PI*2); dep.ctx.fill();
  // neck + head
  dep.ctx.fillStyle='#7a5e3a';
  dep.ctx.beginPath(); dep.ctx.moveTo(cx+sway+6,baseY-5); dep.ctx.lineTo(cx+sway+10,baseY-12); dep.ctx.lineTo(cx+sway+14,baseY-9); dep.ctx.lineTo(cx+sway+10,baseY-4); dep.ctx.closePath(); dep.ctx.fill();
  dep.ctx.beginPath(); dep.ctx.ellipse(cx+sway+13, baseY-12, 4, 3.2, 0.3, 0, Math.PI*2); dep.ctx.fill();
  // eye
  dep.ctx.fillStyle='#1a1208'; dep.ctx.beginPath(); dep.ctx.arc(cx+sway+15, baseY-13, 1, 0, Math.PI*2); dep.ctx.fill();
  // antlers (male)
  if(hash2(gx,gy)>0.4){
    dep.ctx.strokeStyle='#5a4228'; dep.ctx.lineWidth=1.4;
    dep.ctx.beginPath(); dep.ctx.moveTo(cx+sway+13,baseY-15); dep.ctx.lineTo(cx+sway+11,baseY-22); dep.ctx.lineTo(cx+sway+8,baseY-19); dep.ctx.stroke();
    dep.ctx.beginPath(); dep.ctx.moveTo(cx+sway+13,baseY-15); dep.ctx.lineTo(cx+sway+17,baseY-21); dep.ctx.lineTo(cx+sway+19,baseY-18); dep.ctx.stroke();
  }
  // legs with walk cycle
  dep.ctx.strokeStyle='#5a3e22'; dep.ctx.lineWidth=2.2; dep.ctx.lineCap='round';
  dep.ctx.beginPath(); dep.ctx.moveTo(cx+sway-5,baseY); dep.ctx.lineTo(cx+sway-6,baseY+5+legBob); dep.ctx.stroke();
  dep.ctx.beginPath(); dep.ctx.moveTo(cx+sway-1,baseY); dep.ctx.lineTo(cx+sway-1,baseY+5-legBob); dep.ctx.stroke();
  dep.ctx.beginPath(); dep.ctx.moveTo(cx+sway+4,baseY); dep.ctx.lineTo(cx+sway+5,baseY+5+legBob*0.6); dep.ctx.stroke();
  dep.ctx.beginPath(); dep.ctx.moveTo(cx+sway+8,baseY); dep.ctx.lineTo(cx+sway+7,baseY+5-legBob*0.6); dep.ctx.stroke();
}

/* ── ISO ART KIT ── shared helpers giving every building consistent
   three-face prism shading, wood/stone texture, and warm window glow. */

export function drawMemorial(m){
  const p = project(m.gx, m.gy);
  const x = p.x, y = p.y;
  try{ drawShadow(x, y+2, 9); }catch(e){}
  // headstone (rounded top)
  dep.ctx.fillStyle='#8d8a80';
  dep.ctx.beginPath(); dep.ctx.moveTo(x-5,y); dep.ctx.lineTo(x-5,y-8); dep.ctx.arc(x,y-8,5,Math.PI,0); dep.ctx.lineTo(x+5,y); dep.ctx.closePath(); dep.ctx.fill();
  dep.ctx.strokeStyle='rgba(0,0,0,0.25)'; dep.ctx.lineWidth=0.8; dep.ctx.stroke();
  dep.ctx.strokeStyle='rgba(255,255,255,0.15)'; dep.ctx.beginPath(); dep.ctx.moveTo(x-2,y-9); dep.ctx.lineTo(x+2,y-9); dep.ctx.stroke();
  // a young oak taking root beside it — the grove remembers
  dep.ctx.strokeStyle='#4c331e'; dep.ctx.lineWidth=2; dep.ctx.beginPath(); dep.ctx.moveTo(x+8,y); dep.ctx.lineTo(x+8,y-7); dep.ctx.stroke();
  dep.ctx.fillStyle='#3a5a2e'; dep.ctx.beginPath(); dep.ctx.arc(x+8,y-10,4.5,0,7); dep.ctx.fill();
  dep.ctx.fillStyle='#456b38'; dep.ctx.beginPath(); dep.ctx.arc(x+6.5,y-11,2.6,0,7); dep.ctx.fill();
}
export function drawMerchantCart(gx,gy){
  const p = project(gx,gy);
  const x = p.x, y = p.y + TILE_H*0.4;
  drawShadow(x, y+4, 20);
  // wheels
  dep.ctx.strokeStyle='#2c2012'; dep.ctx.lineWidth=2.4;
  dep.ctx.beginPath(); dep.ctx.arc(x-10, y, 5.5, 0, 7); dep.ctx.stroke();
  dep.ctx.beginPath(); dep.ctx.arc(x+9, y+2, 5.5, 0, 7); dep.ctx.stroke();
  // bed
  dep.ctx.fillStyle='#54422a';
  dep.ctx.beginPath();
  dep.ctx.moveTo(x-18, y-6); dep.ctx.lineTo(x+16, y-3); dep.ctx.lineTo(x+16, y-12); dep.ctx.lineTo(x-18, y-15);
  dep.ctx.closePath(); dep.ctx.fill();
  // canopy hoop
  dep.ctx.fillStyle='#8a7658';
  dep.ctx.beginPath();
  dep.ctx.moveTo(x-16, y-14); dep.ctx.quadraticCurveTo(x-1, y-30, x+14, y-11);
  dep.ctx.lineTo(x+14, y-5); dep.ctx.lineTo(x-16, y-8); dep.ctx.closePath(); dep.ctx.fill();
  dep.ctx.strokeStyle='rgba(40,28,14,0.5)'; dep.ctx.lineWidth=1;
  dep.ctx.beginPath(); dep.ctx.moveTo(x-9, y-24); dep.ctx.lineTo(x-9, y-9); dep.ctx.moveTo(x+2, y-25); dep.ctx.lineTo(x+2, y-8); dep.ctx.stroke();
  // lantern glow at dusk/night
  dep.ctx.fillStyle='rgba(231,162,61,0.85)';
  dep.ctx.beginPath(); dep.ctx.arc(x+16, y-14, 2.2, 0, 7); dep.ctx.fill();
}

/* The pasture's flock, drawn straight from its herd count rather than
   simulated separately — the animals you see ARE the animals winter can take.
   Positions come from a hash so they don't shuffle every frame. */
