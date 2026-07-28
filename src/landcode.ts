/* Painted land: what a brush does to a tile, and how a whole map travels.
 *
 * A land shares as a short string rather than through a server — run-length
 * encoded tile codes in base64url — so a map you drew can be pasted to a friend
 * who has never heard of this repository.
 *
 * Writes G.grid, G.MAP_SIZE and the town centre, so like mapgen.ts it is a file
 * that could not exist before the state module.
 */
import { G, Tile } from './state';

export const TCODE   = { grass:0, dirt:1, forest:2, stone:3, water:4 };
export const TCODE_R = ['grass','dirt','forest','stone','water'];

export function applyBrushTo(t: Tile | null, brush: string): void {
  if(!t || t.building) return;
  t.wilds = false; t.ford = false;
  t.maxResource = 0; t.resourceAmount = 0; t.regrowAt = 0; t.workers = 0;
  if(brush==='wilds'){
    t.type = 'grass'; t.wilds = true;
    t.maxResource = 3+Math.floor(Math.random()*3); t.resourceAmount = t.maxResource;
  } else if(brush==='forest'){
    t.type = 'forest';
    t.maxResource = 4+Math.floor(Math.random()*4); t.resourceAmount = t.maxResource; t.baseMax = t.maxResource;
  } else if(brush==='stone'){
    t.type = 'stone';
    t.maxResource = 5+Math.floor(Math.random()*5); t.resourceAmount = t.maxResource;
  } else if(brush==='water'){
    t.type = 'water';
    t.maxResource = 4+Math.floor(Math.random()*4); t.resourceAmount = t.maxResource;
  } else {
    t.type = brush;   // grass | dirt
  }
}
export function encodeLand(): string {
  const runs = [];
  let prev = -1, run = 0;
  const flush = ()=>{ while(run>0){ const n = Math.min(run,255); runs.push(prev, n); run -= n; } };
  for(let y=0;y<G.MAP_SIZE;y++) for(let x=0;x<G.MAP_SIZE;x++){
    const t = G.grid[y][x];
    const c = t.wilds ? 5 : (TCODE[t.type] !== undefined ? TCODE[t.type] : 0);
    if(c===prev) run++; else { flush(); prev = c; run = 1; }
  }
  flush();
  const bytes = [G.MAP_SIZE, G.TC_X, G.TC_Y].concat(runs);
  let bin = '';
  for(const b of bytes) bin += String.fromCharCode(b & 255);
  return 'OAK1' + btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeLand(code: string): boolean {
  try{
    const raw = String(code||'').trim();
    if(!raw.startsWith('OAK1')) return false;
    const b64 = raw.slice(4).replace(/-/g,'+').replace(/_/g,'/');
    const bin = atob(b64);
    const bytes = []; for(let i=0;i<bin.length;i++) bytes.push(bin.charCodeAt(i));
    const size = bytes[0], tx = bytes[1], ty = bytes[2];
    if(!size || size<12 || size>80) return false;
    G.MAP_SIZE = size; G.TC_X = tx; G.TC_Y = ty; G.TC_CX = tx+0.5; G.TC_CY = ty+0.5;
    G.grid = []; G.forestTiles=[]; G.stoneTiles=[]; G.waterTiles=[]; G.wildsTiles=[];
    for(let y=0;y<G.MAP_SIZE;y++){
      const row = [];
      for(let x=0;x<G.MAP_SIZE;x++) row.push({ gx:x, gy:y, type:'grass', resourceAmount:0, maxResource:0, workers:0, regrowAt:0, building:null, wilds:false });
      G.grid.push(row);
    }
    let i = 3, idx = 0;
    while(i+1 < bytes.length && idx < G.MAP_SIZE*G.MAP_SIZE){
      const code2 = bytes[i], n = bytes[i+1]; i += 2;
      for(let k=0;k<n && idx<G.MAP_SIZE*G.MAP_SIZE;k++,idx++){
        const t = G.grid[(idx/G.MAP_SIZE)|0][idx%G.MAP_SIZE];
        applyBrushTo(t, code2===5 ? 'wilds' : (TCODE_R[code2]||'grass'));
      }
    }
    return true;
  }catch(e){ return false; }
}