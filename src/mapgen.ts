/* Making the ground.
 *
 * Terrain generation, the noise field it is shaped by, and the lookup lists the
 * simulation walks every tick. Reads and WRITES the map cluster on `G` — which
 * is the point of the state module: this file could not have existed while the
 * map lived in main.ts as module-level `let`s, because an imported binding
 * cannot be assigned to.
 *
 * Depends on nothing but geometry, the land definitions and the state object.
 */
import { clamp, lerp, hash2 } from './math';
import { LANDS } from './defs';
import { G, Tile } from './state';

export function tileAt(gx: number, gy: number): Tile | null {
  gx = Math.round(gx); gy = Math.round(gy);
  if(gx<0||gy<0||gx>=G.MAP_SIZE||gy>=G.MAP_SIZE) return null;
  return G.grid[gy] ? G.grid[gy][gx] || null : null;
}
/** Smooth value noise in [0,1). */
function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  const a = hash2(xi+seed, yi),   b = hash2(xi+1+seed, yi);
  const c = hash2(xi+seed, yi+1), d = hash2(xi+1+seed, yi+1);
  return lerp(lerp(a,b,u), lerp(c,d,u), v);
}
function fbm2(x: number, y: number, seed: number): number {
  return noise2(x, y, seed)*0.62
       + noise2(x*2.3+11, y*2.3+7, seed+31)*0.28
       + noise2(x*4.7+3,  y*4.7+19, seed+97)*0.10;
}
export function genMap(landId: string): void {
  for(let y=0;y<G.MAP_SIZE;y++){
    const row = [];
    for(let x=0;x<G.MAP_SIZE;x++){
      row.push({ gx:x, gy:y, type:'grass', resourceAmount:0, maxResource:0, workers:0, regrowAt:0, building:null, wilds:false });
    }
    G.grid.push(row);
  }
  function inTCZone(x,y){ return x>=G.TC_X-3 && x<=G.TC_X+4 && y>=G.TC_Y-3 && y<=G.TC_Y+4; }

  const land = LANDS[landId] || LANDS.valley;

  // --- waterways: one or more winding bands, shaped by the chosen land ---
  for(let r=0; r<land.river.count; r++){
    let rx = (land.river.count===1) ? (-4 + Math.random()*3)
                                    : (G.MAP_SIZE*(r+0.5)/land.river.count) + (Math.random()-0.5)*4;
    for(let gy=-2; gy<G.MAP_SIZE+2; gy++){
      rx += (Math.random()-0.5)*land.river.wind;
      rx = clamp(rx, -3, G.MAP_SIZE+2);
      const cx = Math.round(rx + gy*0.18);
      const width = land.river.width + (hash2(gy*0.3, 1+r)>0.7 ? 1:0);
      for(let dx=-width; dx<=width; dx++){
        const x = cx+dx, y = gy;
        if(x<0||x>=G.MAP_SIZE||y<0||y>=G.MAP_SIZE) continue;
        if(inTCZone(x,y)) continue;
        const t = G.grid[y][x];
        t.type='water'; t.maxResource = 4+Math.floor(Math.random()*4); t.resourceAmount = t.maxResource;
      }
    }
  }
  // Coastal: flood the far edge into open sea rather than another stream.
  if(landId === 'coastal'){
    for(let y=0;y<G.MAP_SIZE;y++) for(let x=0;x<Math.max(3, (G.MAP_SIZE*0.16)|0); x++){
      if(inTCZone(x,y)) continue;
      const t = G.grid[y][x];
      t.type='water'; t.maxResource = 5+Math.floor(Math.random()*4); t.resourceAmount = t.maxResource;
    }
  }
  // fords: shallow rows where settlers can wade (slowly) without a bridge
  for(let i=1; i<=land.fords; i++){
    const fy = Math.floor(G.MAP_SIZE*i/(land.fords+1));
    if(!G.grid[fy]) continue;
    for(const t of G.grid[fy]) if(t.type==='water') t.ford = true;
  }

  // --- lakes: still water the rivers didn't cut, sunk into the low ground ---
  for(let l=0; l<(land.lakes||0); l++){
    const lx = 3 + Math.floor(Math.random()*(G.MAP_SIZE-6));
    const ly = 3 + Math.floor(Math.random()*(G.MAP_SIZE-6));
    const rad = 2 + Math.random()*2.2;
    for(let y=Math.floor(ly-rad-1); y<=ly+rad+1; y++) for(let x=Math.floor(lx-rad-1); x<=lx+rad+1; x++){
      if(x<0||x>=G.MAP_SIZE||y<0||y>=G.MAP_SIZE) continue;
      if(inTCZone(x,y)) continue;
      // A wobbling edge, so a lake isn't a circle stamped on the ground.
      const d = Math.hypot(x-lx, y-ly) - (fbm2(x*0.6, y*0.6, l*17+5)-0.5)*1.8;
      if(d > rad) continue;
      const t = G.grid[y][x];
      if(t.type!=='grass') continue;
      t.type='water'; t.maxResource = 4+Math.floor(Math.random()*4); t.resourceAmount = t.maxResource;
    }
  }

  /* --- ground cover ---
     Coherent regions from a noise field rather than random walks, which left
     stringy blobs scattered evenly across the map. Each cover type gets its own
     field and its own scale — stone in tight outcrops, timber in broad stands,
     wilds in loose meadows — and the threshold is chosen by QUANTILE, so a land
     gets exactly the coverage its definition asks for whatever the noise does.
     That is what keeps "highlands are stone-rich, timber-poor" true by
     construction instead of by luck. */
  const free = [];
  for(let y=0;y<G.MAP_SIZE;y++) for(let x=0;x<G.MAP_SIZE;x++){
    const t = G.grid[y][x];
    if(t.type==='grass' && !inTCZone(x,y)) free.push(t);
  }
  const seedBase = Math.floor(Math.random()*10000);
  function laySpread(count, perUnit, scale, seed, apply){
    const want = Math.min(free.length, Math.round(free.length * count * perUnit));
    if(want <= 0) return;
    const scored = free.filter(t=>t.type==='grass' && !t.wilds)
      .map(t=>({ t, v: fbm2(t.gx*scale, t.gy*scale, seed) }))
      .sort((a,b)=>b.v-a.v);
    for(let i=0;i<want && i<scored.length;i++) apply(scored[i].t);
  }
  // Per-unit coverage matched to what the old cluster walks actually produced,
  // so no land's balance shifts under players who already know them.
  laySpread(land.stone, 0.0055, 0.42, seedBase+11, (t)=>{
    t.type='stone'; t.maxResource = 5+Math.floor(Math.random()*5); t.resourceAmount=t.maxResource;
  });
  laySpread(land.forest, 0.0110, 0.24, seedBase+53, (t)=>{
    t.type='forest'; t.maxResource = 4+Math.floor(Math.random()*4); t.resourceAmount=t.maxResource; t.baseMax=t.maxResource;
  });
  laySpread(land.wilds, 0.0050, 0.33, seedBase+91, (t)=>{
    t.wilds = true; t.maxResource = 3+Math.floor(Math.random()*3); t.resourceAmount=t.maxResource;
  });

  // --- banks: bare mud where the grass meets water, so a shore looks like one ---
  for(let y=0;y<G.MAP_SIZE;y++) for(let x=0;x<G.MAP_SIZE;x++){
    const t = G.grid[y][x];
    if(t.type!=='grass' || t.wilds || inTCZone(x,y)) continue;
    let wet = false;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const n = G.grid[y+dy] && G.grid[y+dy][x+dx];
      if(n && n.type==='water'){ wet = true; break; }
    }
    if(wet && hash2(x*3.7, y*2.9) < 0.28) t.type = 'dirt';
  }

  // clear TC footprint explicitly
  for(let y=G.TC_Y;y<G.TC_Y+2;y++) for(let x=G.TC_X;x<G.TC_X+2;x++){ G.grid[y][x].type='dirt'; G.grid[y][x].wilds=false; }

  for(let y=0;y<G.MAP_SIZE;y++) for(let x=0;x<G.MAP_SIZE;x++){
    const t = G.grid[y][x];
    if(t.type==='forest') G.forestTiles.push(t);
    else if(t.type==='stone') G.stoneTiles.push(t);
    else if(t.type==='water') G.waterTiles.push(t);
    if(t.wilds) G.wildsTiles.push(t);
  }
}
export function reindexTiles(): void {
  G.forestTiles=[]; G.stoneTiles=[]; G.waterTiles=[]; G.wildsTiles=[];
  for(let y=0;y<G.MAP_SIZE;y++) for(let x=0;x<G.MAP_SIZE;x++){
    const t = G.grid[y][x];
    if(t.type==='forest') G.forestTiles.push(t);
    else if(t.type==='stone') G.stoneTiles.push(t);
    else if(t.type==='water') G.waterTiles.push(t);
    if(t.wilds) G.wildsTiles.push(t);
  }
}