/* The minimap.
 *
 * Drawn in the SAME isometric projection as the world, which is the whole point
 * of it. It used to lay the grid out as a square while the game shows a
 * diamond, so nothing on it lined up with what you were looking at — which is
 * what made it feel decorative. Matching the projection means north here is
 * north there, and the visible region is a plain rectangle rather than a
 * skewed quad.
 *
 * The pointer handlers live here rather than with the rest of the input,
 * because tapping the map has to INVERT whatever projection the last draw
 * used, and only this module knows it.
 */
import { G } from './state';
import { camera, view, panCameraTo, screenToWorldPixel } from './camera';
import { project, TILE_W, TILE_H } from './math';
import { MM_COLORS } from './defs';
import { isNight } from './time';


/* =========================================================================
   MINIMAP
========================================================================= */
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement | null;
const mmCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
// minimap tile size is computed dynamically in drawMinimap() based on G.MAP_SIZE

// Projection the minimap last drew with, so pointer input can invert it.
let mmLayout = { S:128, scale:1, offY:0 };
export function drawMinimap(){
  if(!mmCtx || !G.grid.length) return;
  const S = 128;                       // backing resolution; CSS scales it to fit
  minimapCanvas.width = S; minimapCanvas.height = S;
  minimapCanvas.style.width = '100%'; minimapCanvas.style.height = '100%';

  // Draw in the SAME isometric projection as the world. The old minimap laid the
  // G.grid out as a square while the game shows a diamond, so nothing on it lined
  // up with what you were looking at — which is what made it feel pointless.
  // Matching the projection means north here is north there, and the visible
  // region becomes a plain rectangle instead of a skewed quad.
  const scale = S / (G.MAP_SIZE * TILE_W);
  const offY  = (S - G.MAP_SIZE * TILE_H * scale) / 2;
  const mmX = (wx)=> wx*scale + S/2;
  const mmY = (wy)=> wy*scale + offY;
  const tw = TILE_W*scale, th = TILE_H*scale;
  mmLayout = { S, scale, offY };       // shared with the pan handler

  mmCtx.clearRect(0,0,S,S);
  mmCtx.fillStyle = '#0a0d12';         // the deep beyond the island
  mmCtx.fillRect(0,0,S,S);

  // Terrain, batched one path per colour — ~6 fills instead of 1300.
  const byColour = new Map();
  for(let y=0;y<G.MAP_SIZE;y++) for(let x=0;x<G.MAP_SIZE;x++){
    const t = G.grid[y] && G.grid[y][x];
    if(!t) continue;
    const col = t.wilds ? '#3a4e22' : (MM_COLORS[t.type]||'#2a3a22');
    let path = byColour.get(col);
    if(!path){ path = new Path2D(); byColour.set(col, path); }
    const p = project(x,y), cx = mmX(p.x), cy = mmY(p.y);
    path.moveTo(cx, cy-th/2); path.lineTo(cx+tw/2, cy);
    path.lineTo(cx, cy+th/2); path.lineTo(cx-tw/2, cy); path.closePath();
  }
  for(const [col,path] of byColour){ mmCtx.fillStyle = col; mmCtx.fill(path); }

  // Roads, then structures on top.
  mmCtx.fillStyle = '#5a4e36';
  for(const b of G.buildings){
    if(b.type!=='road') continue;
    const p = project(b.gx,b.gy);
    mmCtx.fillRect(mmX(p.x)-tw/4, mmY(p.y)-th/4, Math.max(1.5,tw/2), Math.max(1.5,th/2));
  }
  for(const b of G.buildings){
    if(b.type==='road') continue;
    const p = project(b.gx,b.gy);
    const lit = b._fire>0;
    mmCtx.fillStyle = lit ? '#ff7a2a' : (b.type==='townCenter' ? '#e7a23d' : '#c8a870');
    const r = b.type==='townCenter' ? 3.4 : 2.2;
    mmCtx.beginPath(); mmCtx.arc(mmX(p.x), mmY(p.y), lit ? r+1 : r, 0, 7); mmCtx.fill();
  }

  // Your folk, and anything threatening them.
  for(const v of G.villagers){
    const p = project(v.gx,v.gy);
    mmCtx.fillStyle = v.sick ? '#d04030' : '#8ade68';
    mmCtx.beginPath(); mmCtx.arc(mmX(p.x), mmY(p.y), 1.5, 0, 7); mmCtx.fill();
  }
  for(const r of G.raiders){
    const p = project(r.gx,r.gy);
    mmCtx.fillStyle = '#ff4433';
    mmCtx.beginPath(); mmCtx.arc(mmX(p.x), mmY(p.y), 2.4, 0, 7); mmCtx.fill();
    mmCtx.strokeStyle = 'rgba(255,68,51,0.5)'; mmCtx.lineWidth = 1;
    mmCtx.beginPath(); mmCtx.arc(mmX(p.x), mmY(p.y), 4.5 + Math.sin(G.worldTime*6)*1.5, 0, 7); mmCtx.stroke();
  }

  if(isNight()){ mmCtx.fillStyle='rgba(10,16,40,0.35)'; mmCtx.fillRect(0,0,S,S); }

  // What you can currently see. Sharing the world's projection makes this an
  // axis-aligned rectangle; it is only drawn when zoomed in far enough to mark a
  // genuine subsection, since zoomed out it would just outline everything.
  const tl = screenToWorldPixel(0,0), br = screenToWorldPixel(view.w,view.h);
  const vx = mmX(tl.x), vy = mmY(tl.y), vw = (br.x-tl.x)*scale, vh = (br.y-tl.y)*scale;
  if(vw*vh < S*S*0.62){
    mmCtx.save();
    mmCtx.beginPath(); mmCtx.rect(0,0,S,S); mmCtx.clip();
    mmCtx.fillStyle='rgba(231,162,61,0.10)'; mmCtx.fillRect(vx,vy,vw,vh);
    mmCtx.strokeStyle='rgba(231,162,61,0.9)'; mmCtx.lineWidth=1.5; mmCtx.strokeRect(vx,vy,vw,vh);
    mmCtx.restore();
  }
}
// Tap the minimap to look there — or hold and drag to sweep the camera across
// the hold, which is far quicker than repeatedly dragging the world itself.
// Inverts whatever projection drawMinimap last used.
if(minimapCanvas){
  const lookAt = (clientX, clientY)=>{
    const rect = minimapCanvas.getBoundingClientRect();
    const { S, scale, offY } = mmLayout;
    const mx = (clientX-rect.left)/rect.width  * S;
    const my = (clientY-rect.top )/rect.height * S;
    panCameraTo((mx - S/2)/scale, (my - offY)/scale);
  };
  let dragging = false;
  minimapCanvas.addEventListener('pointerdown', (e)=>{
    dragging = true;
    try{ minimapCanvas.setPointerCapture(e.pointerId); }catch(err){}
    lookAt(e.clientX, e.clientY);
    e.preventDefault(); e.stopPropagation();
  });
  minimapCanvas.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    lookAt(e.clientX, e.clientY);
    e.preventDefault(); e.stopPropagation();
  });
  const end = (e)=>{ dragging = false; try{ minimapCanvas.releasePointerCapture(e.pointerId); }catch(err){} };
  minimapCanvas.addEventListener('pointerup', end);
  minimapCanvas.addEventListener('pointercancel', end);
}

