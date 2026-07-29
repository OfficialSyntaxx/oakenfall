/* The layers over the world: clouds, rain and snow, the night, and the vignette.
 *
 * All four are screen-space passes drawn after everything else, and all four
 * are the difference between a tile map and a place. The night is the
 * interesting one: rather than dimming the whole canvas, it fills a darkness
 * layer and then punches light out of it with destination-out, so a lit window
 * genuinely carves a pool in the dark instead of being painted brighter.
 */
import { G } from './state';
import { decorImg } from './sprites';
import { clamp, project, TILE_W, TILE_H } from './math';
import { seasonIndex, darknessFactor } from './time';
import { getWeather } from './weather';
import { buildingCenter } from './buildings';

type Deps = {
  ctx: any;
  /** The canvas itself, for backing-store sized offscreen layers. */
  canvas: any;
  viewport: () => { w: number; h: number; dpr: number };
  camera: { panX: number; panY: number; scale: number };
  /** World point to screen point, for placing light sources. */
  worldToScreen: (x: number, y: number) => { x: number; y: number };
};
let dep: Deps = {
  ctx: null, canvas: null,
  viewport: () => ({ w: 0, h: 0, dpr: 1 }),
  camera: { panX: 0, panY: 0, scale: 1 },
  worldToScreen: (x, y) => ({ x, y }),
};
export function initLighting(deps: Deps): void { dep = deps; }

/* Soft clouds drifting over the hold — pure atmosphere, parallax with pan */
let cloudState = null;
export function renderClouds(){
  if(getWeather().type==='storm') return; // storm layer owns the sky
  if(!decorImg('clouds',0)) return;
  if(!cloudState){
    cloudState = [];
    for(let i=0;i<7;i++){
      cloudState.push({ wx:(Math.random()*2-1)*G.MAP_SIZE*TILE_W/2, wy:Math.random()*G.MAP_SIZE*TILE_H,
                        v:5+Math.random()*6, sc:1.1+Math.random()*1.6, ci:i%3 });
    }
  }
  dep.ctx.save();
  dep.ctx.setTransform(dep.viewport().dpr,0,0,dep.viewport().dpr,0,0);
  const halfW = G.MAP_SIZE*TILE_W/2;
  for(const c of cloudState){
    c.wx += c.v * (1/60);
    if(c.wx > halfW + 200){ c.wx = -halfW - 200; c.wy = Math.random()*G.MAP_SIZE*TILE_H; }
    const img = decorImg('clouds', c.ci);
    if(!img) continue;
    // world → screen with a slight parallax lift (clouds pan a bit slower)
    const sx = dep.viewport().w/2 + dep.camera.panX*0.85 + c.wx*dep.camera.scale;
    const sy = dep.viewport().h/2 + dep.camera.panY*0.85 + c.wy*dep.camera.scale*0.8 - 60;
    const w = 240*c.sc*dep.camera.scale*0.8, hh = w*(img.naturalHeight/img.naturalWidth);
    if(sx < -w || sx > dep.viewport().w+w) continue;
    dep.ctx.globalAlpha = 0.30;
    try { dep.ctx.drawImage(img, sx-w/2, sy-hh/2, w, hh); } catch(e){}
    dep.ctx.globalAlpha = 1;
  }
  dep.ctx.restore();
}
let _vignetteCache=null;
export function renderVignette(){
  if(!_vignetteCache || _vignetteCache.w!==dep.canvas.width || _vignetteCache.h!==dep.canvas.height){
    const c=document.createElement('canvas'); c.width=dep.canvas.width; c.height=dep.canvas.height;
    const vc=c.getContext('2d');
    const g=vc.createRadialGradient(c.width/2,c.height/2,Math.min(c.width,c.height)*0.42, c.width/2,c.height/2,Math.max(c.width,c.height)*0.72);
    g.addColorStop(0,'rgba(0,0,0,0)');
    g.addColorStop(1,'rgba(8,10,6,0.34)');
    vc.fillStyle=g; vc.fillRect(0,0,c.width,c.height);
    // faint warm grade at centre
    const g2=vc.createRadialGradient(c.width/2,c.height*0.42,0, c.width/2,c.height*0.42,Math.max(c.width,c.height)*0.5);
    g2.addColorStop(0,'rgba(255,220,160,0.045)'); g2.addColorStop(1,'rgba(0,0,0,0)');
    vc.fillStyle=g2; vc.fillRect(0,0,c.width,c.height);
    _vignetteCache={cnv:c,w:dep.canvas.width,h:dep.canvas.height};
  }
  dep.ctx.save(); dep.ctx.setTransform(1,0,0,1,0,0);
  dep.ctx.drawImage(_vignetteCache.cnv,0,0);
  dep.ctx.restore();
}


/* ── WEATHER PARTICLES ── screen-space rain streaks / snowflakes / lightning */
let _lightningT = 0;
export function renderWeather(){
  if(getWeather().type==='clear') return;
  dep.ctx.save();
  dep.ctx.setTransform(dep.viewport().dpr,0,0,dep.viewport().dpr,0,0);
  const t = G.worldTime;
  if(getWeather().type==='rain' || getWeather().type==='storm'){
    const n = getWeather().type==='storm' ? 90 : 55;
    dep.ctx.strokeStyle='rgba(170,200,220,0.30)'; dep.ctx.lineWidth=1;
    dep.ctx.beginPath();
    for(let i=0;i<n;i++){
      const x = ((i*97.3 + t*260 + i*i*13)% (dep.viewport().w+40)) - 20;
      const y = ((i*61.7 + t*540)% (dep.viewport().h+30)) - 15;
      dep.ctx.moveTo(x, y); dep.ctx.lineTo(x-3, y+11);
    }
    dep.ctx.stroke();
    if(getWeather().type==='storm'){
      _lightningT -= 1/60;
      if(_lightningT<=0 && Math.random()<0.004){ _lightningT = 0.14; }
      if(_lightningT>0){
        dep.ctx.fillStyle='rgba(220,230,255,'+(_lightningT*1.6)+')';
        dep.ctx.fillRect(0,0,dep.viewport().w,dep.viewport().h);
      }
    }
  } else if(getWeather().type==='snow'){
    dep.ctx.fillStyle='rgba(230,240,248,0.55)';
    for(let i=0;i<60;i++){
      const x = ((i*83.1 + Math.sin(t*0.8+i)*30 + t*18)% (dep.viewport().w+20)) - 10;
      const y = ((i*47.9 + t*46)% (dep.viewport().h+20)) - 10;
      dep.ctx.beginPath(); dep.ctx.arc(x, y, 1.1+(i%3)*0.5, 0, 7); dep.ctx.fill();
    }
  }
  dep.ctx.restore();
}

/* ── DYNAMIC LIGHTING ── darkness overlay with warm light pools punched out
   at every lit structure via destination-out radial gradients. */
let lightCanvas=null, lctx=null;
const LIGHT_RADII = { manor:130, townCenter:200, tavern:22, watchtower:28, house:95, bakery:22, tradingPost:20, miningPost:100, sawmill:20, windmill:26, fishingHut:24, huntingCabin:24, forestCamp:90, lampPost:105 };
export function renderLighting(){
  const dark = darknessFactor();
  if(dark <= 0.02) return;
  if(!lightCanvas || lightCanvas.width!==dep.canvas.width || lightCanvas.height!==dep.canvas.height){
    lightCanvas = document.createElement('canvas');
    lightCanvas.width = dep.canvas.width; lightCanvas.height = dep.canvas.height;
    lctx = lightCanvas.getContext('2d');
  }
  const dpr = dep.viewport().dpr;
  lctx.setTransform(1,0,0,1,0,0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0,0,lightCanvas.width,lightCanvas.height);
  lctx.fillStyle = 'rgba(8,10,26,'+dark+')';
  lctx.fillRect(0,0,lightCanvas.width,lightCanvas.height);
  // Punch warm pools of light around lit buildings
  lctx.globalCompositeOperation = 'destination-out';
  const flick = 1 + Math.sin(G.worldTime*7)*0.04;
  for(const b of G.buildings){
    const r0 = LIGHT_RADII[b.type];
    if(!r0) continue;
    const c = buildingCenter(b);
    const p = project(c.gx, c.gy);
    const sx = (dep.viewport().w/2 + dep.camera.panX + p.x*dep.camera.scale) * dpr;
    const sy = (dep.viewport().h/2 + dep.camera.panY + p.y*dep.camera.scale) * dpr;
    const r = r0 * dep.camera.scale * dpr * flick;
    if(sx < -r || sy < -r || sx > lightCanvas.width+r || sy > lightCanvas.height+r) continue;
    const g = lctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.beginPath(); lctx.arc(sx, sy, r, 0, Math.PI*2); lctx.fill();
  }
  // Composite onto the main canvas in raw pixel space
  dep.ctx.save();
  dep.ctx.setTransform(1,0,0,1,0,0);
  dep.ctx.drawImage(lightCanvas, 0, 0);
  dep.ctx.restore();
}

/* =========================================================================
   DAY/NIGHT TINT
========================================================================= */
