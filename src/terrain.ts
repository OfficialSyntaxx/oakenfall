/* The ground itself.
 *
 * Kenney Isometric Landscape tiles (CC0), colour-graded to Oakenfall's palette
 * at bake time, with a full procedural fallback underneath — a stamp that fails
 * to decode must still leave ground to walk on. Same contract as every sprite
 * in the game: art is an upgrade layer, never a dependency.
 *
 * Also the living surface. Wind travels across the map in gusts rather than
 * every blade twitching alone, because neighbouring tiles share a phase; and
 * the ground darkens in rain and pales under snow on its own slow clock, so
 * weather leaves the world changed for a while after it passes.
 */
import { G } from './state';
import { clamp, hash2, project } from './math';
import { WATER_DROP, EDGE_DROP } from './defs';
import { seasonIndex } from './time';
import { getWeather } from './weather';
import { riverFrozen } from './time';
import { TILE_W, TILE_H } from './math';
import { shadeColor, tileDiamond } from './isokit';
import { TERRAIN_B64 } from './assets';

type Deps = {
  ctx: any;
  /** Live view metrics and camera, for culling what is off screen. */
  viewport: () => { w: number; h: number };
  camera: { panX: number; panY: number; scale: number };
  /** A frame of a decor sprite sheet, or null if it has not decoded. */
  decorImg: (key: string, idx: number) => any;
  /** Have the decor sheets finished loading? Scenery is skipped until they have. */
  decorReady: () => boolean;
  /** The road tile stamp, when one has decoded — roads replace the ground
   *  beneath them rather than being drawn over it. */
  roadTile: () => any;
};
let dep: Deps = { ctx: null, viewport: () => ({ w: 0, h: 0 }), camera: { panX: 0, panY: 0, scale: 1 },
  decorImg: () => null, decorReady: () => false, roadTile: () => null };
export function initTerrain(deps: Deps): void { dep = deps; }

/* What grows or lies on each kind of ground, and how wide to draw it. */
const SCENERY_FOR = {
  grass:  ['wildflowers','boulders','berryBush','stump'],
  forest: ['mushrooms','fallenLog','stump','berryBush'],
  stone:  ['boulders','standingStones'],
  wilds:  ['wildflowers','mushrooms','berryBush'],
  dirt:   ['boulders'],
};
const SCENERY_W = {
  wildflowers:26, boulders:30, berryBush:28, stump:26,
  mushrooms:22, fallenLog:34, standingStones:34, cattails:28,
};

/* ── TERRAIN TILE STAMPS ── Kenney Isometric Landscape (CC0), color-graded to
   Oakenfall's palette at bake time and embedded as base64. Stamped tiles have
   built-in depth skirts, replacing the procedural diamond fill + bank faces. */
// Asset URLs (files, not inlined base64) — bundled locally, cached by the
// service worker, so offline play is unaffected. Procedural fallbacks still
// cover a failed or slow load.

const TERRAIN_IMGS = { grass:[], water:[], dirt:[], stone:[] };
let terrainReady = false;
export function loadTerrainStamps(){
  let pending = 0;
  for(const [key,data] of Object.entries(TERRAIN_B64)){
    const typ = key.split('_')[0];
    const img = new Image();
    pending++;
    img.onload = ()=>{ TERRAIN_IMGS[typ].push(img); if(--pending===0) terrainReady = true; };
    img.onerror = ()=>{ if(--pending===0) terrainReady = TERRAIN_IMGS.grass.length>0; };
    img.src = data;
  }
}
export function terrainStampFor(t, gx, gy){
  if(!terrainReady) return null;
  let pool;
  if(t.building && t.building.type==='road'){
    const r = dep.roadTile();
    if(r && r.complete && r.naturalWidth>0) return r;
  }
  if(t.type==='water') pool = TERRAIN_IMGS.water;
  else if(t.type==='dirt') pool = TERRAIN_IMGS.dirt;
  else if(t.type==='stone') pool = TERRAIN_IMGS.stone;
  else pool = TERRAIN_IMGS.grass; // grass, forest, wilds share the grass base
  if(!pool || !pool.length) return null;
  return pool[Math.floor(hash2(gx*1.37, gy*2.11)*pool.length)];
}


const TILE_COLORS = {
  grass: ['#2f4528','#33492c','#2a3f25','#304826'],
  dirt:  ['#4a3a26','#473722','#4d3d29','#453821'],
  forest:['#243c20','#2a4224','#22381e','#283e22'],
  stone: ['#3a3c34','#3d3f37','#373931','#404239'],
  water: ['#182c3e','#1c3244','#163040','#1a3446'],
};
/* ── GROUND COVER ── how wet and how snowed-under the land currently is. Eased
   rather than switched, so puddles gather while it rains and dry off slowly
   afterwards, and snow builds up over a fall instead of appearing all at once.
   Two numbers for the whole map: the per-tile look is derived from them plus the
   tile's own hash, which keeps this free of per-tile state or allocation. */
/* ── WIND ──
   One field the whole surface leans with, so a storm looks like weather rather
   than a particle effect over a still world. Strength follows the sky; the
   phase advances faster when it blows harder. */
let windPhase = 0, windGust = 0.22;
export function updateWind(dt){
  const base = getWeather().type==='storm' ? 1.0
             : getWeather().type==='rain'  ? 0.55
             : getWeather().type==='snow'  ? 0.40 : 0.22;
  const target = base * (0.75 + 0.25*Math.sin(G.worldTime*0.37));
  windGust += (target - windGust) * Math.min(1, dt*0.5);
  windPhase += dt * (0.6 + windGust*0.9);
}
/* Lean at this tile, roughly -1..1. Neighbouring tiles share a phase, so gusts
   travel across the map instead of every blade twitching on its own. */
export function windAt(gx, gy){ return Math.sin(windPhase*1.6 + (gx+gy)*0.55) * windGust; }

let groundWet = 0, groundSnow = 0;
export function updateGroundCover(dt){
  const raining = getWeather().type==='rain' || getWeather().type==='storm';
  const snowing = getWeather().type==='snow';
  const winter = seasonIndex()===3;
  const wetTarget  = raining ? 1 : 0;
  const snowTarget = snowing ? 1 : (winter ? 0.5 : 0);
  groundWet  += (wetTarget  - groundWet ) * Math.min(1, dt*0.30);  // dries slowly
  groundSnow += (snowTarget - groundSnow) * Math.min(1, dt*0.10);  // settles slower still
}
export function drawTerrain(range){
  for(let gy=range.y0; gy<=range.y1; gy++){
    for(let gx=range.x0; gx<=range.x1; gx++){
      const t = G.grid[gy] && G.grid[gy][gx];
      if(!t) continue;
      const p = project(gx,gy);
      const h2 = hash2(gx,gy);
      const variant = Math.floor(h2*4);
      let colors = TILE_COLORS[t.type] || TILE_COLORS.grass;
      const isWater = t.type==='water';
      const yTop = isWater ? p.y + WATER_DROP : p.y;
      const stamp = terrainStampFor(t, gx, gy);
      if(stamp){
        // Pre-rendered block tile: 128x80 source → 64x40 on screen; the top
        // diamond spans 64x32 anchored at yTop, skirt hangs 8px below.
        try { dep.ctx.drawImage(stamp, p.x - TILE_W/2, yTop - TILE_H/2, TILE_W, 40); } catch(e){}
      } else {
        // Procedural fallback until stamps decode (or if they fail)
        const cA = colors[variant%colors.length];
        const cB = colors[(variant+1)%colors.length];
        dep.ctx.fillStyle = shadeColor(cA, (hash2(gx*1.31, gy*2.17)-0.5)*0.10);
        tileDiamond(p.x, yTop, TILE_W, TILE_H);
        dep.ctx.fill();
        if(!isWater && h2 > 0.45){
          dep.ctx.fillStyle = shadeColor(cB, -0.04);
          dep.ctx.globalAlpha = 0.35;
          tileDiamond(p.x + (h2-0.7)*14, yTop + (hash2(gx*3,gy*1.4)-0.5)*5, TILE_W*0.55, TILE_H*0.55);
          dep.ctx.fill();
          dep.ctx.globalAlpha = 1;
        }
      }
      /* ── LIVING SURFACE ── shimmer, wet ground and settled snow, layered over
         whichever tile art was drawn above. Flat fills only: a gradient per tile
         per frame is the classic way to wreck this game's framerate. */
      if(isWater){
        if(riverFrozen()){
          // Frozen over: a pale sheen and a hint of cracking, no movement.
          dep.ctx.fillStyle = 'rgba(206,224,236,0.34)';
          tileDiamond(p.x, yTop, TILE_W*0.96, TILE_H*0.96); dep.ctx.fill();
          if(h2 > 0.7){
            dep.ctx.strokeStyle = 'rgba(255,255,255,0.22)'; dep.ctx.lineWidth = 0.8;
            dep.ctx.beginPath(); dep.ctx.moveTo(p.x-8, yTop-1); dep.ctx.lineTo(p.x+3, yTop+3); dep.ctx.stroke();
          }
        } else {
          // Open water: a highlight sliding across the tile, each on its own
          // phase so the river glitters rather than pulsing in unison.
          const ph = G.worldTime*1.3 + h2*6.283;
          const a = 0.09 + Math.sin(ph)*0.06;
          if(a > 0.03){
            dep.ctx.fillStyle = 'rgba(188,224,244,'+a.toFixed(3)+')';
            tileDiamond(p.x + Math.sin(ph)*6, yTop - 1, TILE_W*0.40, TILE_H*0.40); dep.ctx.fill();
          }
        }
      } else {
        // Rain gathers in the hollows — only some tiles hold a puddle, and they
        // spread as the downpour goes on.
        if(groundWet > 0.04 && h2 > 0.58 && (t.type==='grass' || t.type==='dirt')){
          const g = groundWet * (0.55 + h2*0.45);
          dep.ctx.fillStyle = 'rgba(38,58,70,'+(g*0.40).toFixed(3)+')';
          tileDiamond(p.x + (h2-0.7)*12, yTop + 3, TILE_W*0.42*g, TILE_H*0.42*g); dep.ctx.fill();
          dep.ctx.fillStyle = 'rgba(180,210,230,'+(g*0.10).toFixed(3)+')';   // sky caught in it
          tileDiamond(p.x + (h2-0.7)*12, yTop + 2, TILE_W*0.26*g, TILE_H*0.26*g); dep.ctx.fill();
        }
        // Tall grass leans with the wind. Only the wilds get blades — they are
        // a few percent of the map, so this is three strokes on a handful of
        // visible tiles, not a per-tile cost.
        if(t.wilds && groundSnow < 0.5){
          const w = windAt(gx, gy);
          dep.ctx.strokeStyle = 'rgba(158,186,102,0.55)';
          dep.ctx.lineWidth = 1;
          for(let i=0;i<3;i++){
            const bx = p.x + (hash2(gx*2.1+i, gy*3.3)-0.5)*22;
            const by = yTop + (hash2(gx*1.7, gy*2.9+i)-0.5)*9 + 3;
            const bh = 5 + hash2(gx+i, gy)*4;
            dep.ctx.beginPath();
            dep.ctx.moveTo(bx, by);
            dep.ctx.quadraticCurveTo(bx + w*2.4, by - bh*0.6, bx + w*5, by - bh);
            dep.ctx.stroke();
          }
        }
        // Snow lies unevenly — the tile's own hash decides how deeply it drifts.
        if(groundSnow > 0.02){
          const s = groundSnow * (0.45 + h2*0.55);
          dep.ctx.fillStyle = 'rgba(234,242,250,'+(s*0.62).toFixed(3)+')';
          tileDiamond(p.x, yTop - 1, TILE_W*0.94, TILE_H*0.94); dep.ctx.fill();
        }
      }

      // Earthen bank faces: where land meets water (or the map edge), draw the
      // tile's south-west / south-east side walls dropping to the lower level.
      if(!isWater && !stamp){
        const nS = G.grid[gy+1] && G.grid[gy+1][gx];   // screen lower-left neighbour
        const nE = G.grid[gy] && G.grid[gy][gx+1];     // screen lower-right neighbour
        const edgeS = !nS || nS.type==='water';
        const edgeE = !nE || nE.type==='water';
        const drop = (!nS || !nE) ? EDGE_DROP : WATER_DROP;
        // Grassy overhang lip catches the light along the bank crest
        if((edgeS || edgeE) && (t.type==='grass'||t.type==='forest')){
          dep.ctx.strokeStyle='rgba(126,168,86,0.55)'; dep.ctx.lineWidth=1.6;
          if(edgeS){ dep.ctx.beginPath(); dep.ctx.moveTo(p.x - TILE_W/2, p.y); dep.ctx.lineTo(p.x, p.y + TILE_H/2); dep.ctx.stroke(); }
          if(edgeE){ dep.ctx.beginPath(); dep.ctx.moveTo(p.x + TILE_W/2, p.y); dep.ctx.lineTo(p.x, p.y + TILE_H/2); dep.ctx.stroke(); }
        }
        if(edgeS){
          dep.ctx.fillStyle = '#2a2114';
          dep.ctx.beginPath();
          dep.ctx.moveTo(p.x - TILE_W/2, p.y);
          dep.ctx.lineTo(p.x, p.y + TILE_H/2);
          dep.ctx.lineTo(p.x, p.y + TILE_H/2 + drop);
          dep.ctx.lineTo(p.x - TILE_W/2, p.y + drop);
          dep.ctx.closePath(); dep.ctx.fill();
          dep.ctx.strokeStyle='rgba(0,0,0,0.3)'; dep.ctx.lineWidth=0.6;
          dep.ctx.beginPath(); dep.ctx.moveTo(p.x - TILE_W/2, p.y+drop*0.5); dep.ctx.lineTo(p.x, p.y+TILE_H/2+drop*0.5); dep.ctx.stroke();
        }
        if(edgeE){
          dep.ctx.fillStyle = '#1e180e';
          dep.ctx.beginPath();
          dep.ctx.moveTo(p.x + TILE_W/2, p.y);
          dep.ctx.lineTo(p.x, p.y + TILE_H/2);
          dep.ctx.lineTo(p.x, p.y + TILE_H/2 + drop);
          dep.ctx.lineTo(p.x + TILE_W/2, p.y + drop);
          dep.ctx.closePath(); dep.ctx.fill();
        }
      }
      if(t.type==='water'){
        // Water sits RECESSED — the tile top is drawn lower, and land neighbours
        // draw bank faces down to it (see below), selling true isometric depth.
        const wy = yTop;
        const frozen = riverFrozen();
        if(frozen){
          // winter ice sheet: pale slab, crack lines, no ripples/foam
          dep.ctx.fillStyle='rgba(196,214,224,0.55)';
          tileDiamond(p.x,wy,TILE_W,TILE_H); dep.ctx.fill();
          dep.ctx.save(); tileDiamond(p.x,wy,TILE_W,TILE_H); dep.ctx.clip();
          dep.ctx.strokeStyle='rgba(120,150,170,0.5)'; dep.ctx.lineWidth=0.8;
          if(h2>0.45){
            dep.ctx.beginPath();
            dep.ctx.moveTo(p.x-(h2*14), wy-3+(h2*4));
            dep.ctx.lineTo(p.x+(6-h2*4), wy+1);
            dep.ctx.lineTo(p.x+(h2*16), wy+5-(h2*6));
            dep.ctx.stroke();
          }
          dep.ctx.restore();
        }
        // flat depth tint (a per-tile gradient here cost ~1 gradient alloc per water tile per frame)
        if(!frozen){
        dep.ctx.fillStyle='rgba(10,20,35,0.18)';
        tileDiamond(p.x,wy,TILE_W,TILE_H); dep.ctx.fill();
        dep.ctx.save(); tileDiamond(p.x,wy,TILE_W,TILE_H); dep.ctx.clip();
        dep.ctx.strokeStyle='rgba(150,200,220,0.18)'; dep.ctx.lineWidth=1.2;
        for(let i=0;i<3;i++){
          const off=((G.worldTime*12+gx*19+gy*13+i*18)%36)-18;
          dep.ctx.beginPath(); dep.ctx.moveTo(p.x-TILE_W/2,wy+off*0.45);
          dep.ctx.quadraticCurveTo(p.x,wy+off*0.45-5,p.x+TILE_W/2,wy+off*0.45); dep.ctx.stroke();
        }
        if(h2>0.7){ dep.ctx.fillStyle='rgba(200,230,240,0.12)'; dep.ctx.beginPath(); dep.ctx.arc(p.x+(h2-0.85)*18,wy+(hash2(gx*2,gy)-0.5)*6,3,0,Math.PI*2); dep.ctx.fill(); }
        // Foam lapping against adjacent land (animated)
        const nN = G.grid[gy-1] && G.grid[gy-1][gx];
        const nW = G.grid[gy] && G.grid[gy][gx-1];
        const foamA = 0.28 + Math.sin(G.worldTime*2.4 + gx + gy)*0.12;
        dep.ctx.strokeStyle = 'rgba(210,230,238,'+foamA+')'; dep.ctx.lineWidth = 1.6;
        if(nN && nN.type!=='water'){ dep.ctx.beginPath(); dep.ctx.moveTo(p.x, wy - TILE_H/2 + 1.5); dep.ctx.lineTo(p.x + TILE_W/2 - 3, wy - 0.5); dep.ctx.stroke(); }
        if(nW && nW.type!=='water'){ dep.ctx.beginPath(); dep.ctx.moveTo(p.x, wy - TILE_H/2 + 1.5); dep.ctx.lineTo(p.x - TILE_W/2 + 3, wy - 0.5); dep.ctx.stroke(); }
        dep.ctx.restore();
        }
        // ford: stepping stones breaking the surface (year-round marker)
        if(t.ford && !t.building){
          dep.ctx.fillStyle='#6a6359';
          for(const [ox,oy,r] of [[-8,1,3.2],[0,-2,3.8],[8,2,3.0]]){
            dep.ctx.beginPath(); dep.ctx.ellipse(p.x+ox, wy+oy, r, r*0.6, 0, 0, 7); dep.ctx.fill();
          }
          dep.ctx.fillStyle='rgba(255,255,255,0.12)';
          for(const [ox,oy,r] of [[-8,0,2.2],[0,-3,2.6],[8,1,2.0]]){
            dep.ctx.beginPath(); dep.ctx.ellipse(p.x+ox, wy+oy, r, r*0.5, 0, 0, 7); dep.ctx.fill();
          }
        }
        if(h2 > 0.88){
          const wrImg = dep.decorImg('waterRocks', hash2(gx*3.3,gy*1.9)*4);
          if(wrImg){
            const ww = 26, wh = ww*(wrImg.naturalHeight/wrImg.naturalWidth);
            const bobW = Math.sin(G.worldTime*1.6+gx+gy)*1.2;
            try { dep.ctx.drawImage(wrImg, p.x - ww/2, wy - wh + 6 + bobW, ww, wh); } catch(e){}
          }
        }
      } else if(t.wilds){
        dep.ctx.fillStyle='rgba(80,110,30,0.20)'; tileDiamond(p.x,p.y,TILE_W,TILE_H); dep.ctx.fill();
        dep.ctx.strokeStyle='rgba(130,160,60,0.40)'; dep.ctx.lineWidth=1.1;
        for(let i=0;i<5;i++){
          const ox=(hash2(gx*1.3+i,gy*2.1)-0.5)*28,oy=(hash2(gx*2.7+i,gy*1.1)-0.5)*9;
          const h=4+hash2(gx+i,gy*3)*5;
          dep.ctx.beginPath(); dep.ctx.moveTo(p.x+ox,p.y+oy+3); dep.ctx.lineTo(p.x+ox+1.5,p.y+oy-h); dep.ctx.stroke();
        }
        if(h2>0.6){ dep.ctx.fillStyle='rgba(90,80,55,0.35)'; dep.ctx.beginPath(); dep.ctx.arc(p.x+(h2-0.8)*20,p.y+hash2(gx,gy*4)*4-2,1.5,0,7); dep.ctx.fill(); }
      } else if(t.type==='stone'){
        dep.ctx.strokeStyle='rgba(0,0,0,0.28)'; dep.ctx.lineWidth=0.9;
        dep.ctx.beginPath(); dep.ctx.moveTo(p.x-12,p.y-2); dep.ctx.lineTo(p.x+2,p.y+3); dep.ctx.lineTo(p.x+10,p.y-1); dep.ctx.stroke();
        dep.ctx.beginPath(); dep.ctx.moveTo(p.x+6,p.y-3); dep.ctx.lineTo(p.x+14,p.y+2); dep.ctx.stroke();
        if(h2>0.72){ dep.ctx.fillStyle='rgba(160,130,50,0.40)'; dep.ctx.fillRect(p.x-3+h2*10,p.y-1,2,2); }
      } else if(t.type==='dirt'){
        if(h2>0.55){ dep.ctx.fillStyle='rgba(0,0,0,0.18)'; dep.ctx.beginPath(); dep.ctx.arc(p.x+(h2-0.5)*20,p.y+(hash2(gx*2,gy*3)-0.5)*7,2,0,7); dep.ctx.fill(); }
      }
      /* ── SCENERY ── a scatter of standing props keyed to what the ground is:
         mushrooms and fallen logs under the trees, cattails where the grass
         meets water, standing stones on bare rock. Its own hash, so it doesn't
         land on the same tiles as the bushes below. */
      if(dep.decorReady() && !t.building){
        const sh = hash2(gx*7.7, gy*3.3);
        if(sh > 0.955){
          // Reeds only where the ground actually meets the water.
          let pool = SCENERY_FOR[t.wilds ? 'wilds' : t.type];
          if((t.type==='grass' || t.type==='dirt')){
            const n1 = G.grid[gy+1] && G.grid[gy+1][gx], n2 = G.grid[gy-1] && G.grid[gy-1][gx];
            const n3 = G.grid[gy] && G.grid[gy][gx+1], n4 = G.grid[gy] && G.grid[gy][gx-1];
            if([n1,n2,n3,n4].some(n=>n && n.type==='water')) pool = ['cattails'];
          }
          if(pool && pool.length){
            const key = pool[Math.floor(hash2(gx*2.3, gy*5.1) * pool.length) % pool.length];
            const simg = dep.decorImg(key, 0);
            if(simg){
              const sw = SCENERY_W[key] || 30;
              const shh = sw * (simg.naturalHeight/simg.naturalWidth);
              const ox = (hash2(gx*3.7, gy*1.3)-0.5)*18, oy = (hash2(gx*1.1, gy*6.9)-0.5)*8;
              try{ dep.ctx.drawImage(simg, p.x - sw/2 + ox, yTop - shh + 8 + oy, sw, shh); }catch(e){}
            }
          }
        }
      }
      if(t.type==='grass' && h2 > 0.93 && dep.decorReady()){
        const pool = hash2(gx*5,gy*7) > 0.5 ? 'bush1' : 'bush3';
        const bimg = dep.decorImg(pool, G.worldTime*3 + gx + gy);
        if(bimg){
          const bw = 34, bh = bw*(bimg.naturalHeight/bimg.naturalWidth);
          dep.ctx.drawImage(bimg, p.x - bw/2 + (hash2(gx*2,gy*9)-0.5)*16, yTop - bh + 6, bw, bh);
        }
      } else if(t.type==='grass' && h2 > 0.82){
        // Rare wildflower clusters
        for(let i=0;i<2;i++){
          const fx = p.x+(hash2(gx*4+i,gy*6)-0.5)*26, fy = yTop+(hash2(gx*6,gy*4+i)-0.5)*9;
          dep.ctx.fillStyle = i%2 ? '#c8b04a' : '#b06a8a';
          dep.ctx.beginPath(); dep.ctx.arc(fx, fy, 1.3, 0, 7); dep.ctx.fill();
        }
        dep.ctx.strokeStyle='rgba(120,160,75,0.20)'; dep.ctx.lineWidth=1;
        dep.ctx.beginPath(); dep.ctx.moveTo(p.x-4, yTop+3); dep.ctx.lineTo(p.x-3, yTop-3); dep.ctx.stroke();
      } else if(t.type==='grass'||t.type==='forest'){
        dep.ctx.strokeStyle=t.type==='forest'?'rgba(80,130,60,0.22)':'rgba(120,160,75,0.20)'; dep.ctx.lineWidth=1;
        for(let i=0;i<3;i++){
          const ox=(hash2(gx*3.1+i,gy*5.3)-0.5)*20,oy=(hash2(gx*1.9+i,gy*4.7)-0.5)*7;
          const lean=(hash2(gx+i,gy+i)-0.5)*3;
          dep.ctx.beginPath(); dep.ctx.moveTo(p.x+ox,p.y+oy+4); dep.ctx.lineTo(p.x+ox+lean,p.y+oy-4); dep.ctx.stroke();
        }
      }
      if(!stamp){
        dep.ctx.strokeStyle='rgba(0,0,0,0.15)'; dep.ctx.lineWidth=0.8/dep.camera.scale;
        tileDiamond(p.x,yTop,TILE_W,TILE_H); dep.ctx.stroke();
      }
    }
  }
}

