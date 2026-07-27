/* The iso drawing kit: the hand-drawn primitives every building and prop is
 * assembled from, plus the colour and shadow helpers they share.
 *
 * These are pure canvas work — they know about pixels, never about the hold.
 * The two things they can't take as arguments (the one canvas context, and the
 * clock that drives window flicker and chimney smoke) are pushed in once per
 * frame rather than reached for, which is what let them move out of main.ts.
 */
import { clamp } from './math';

let ctx: CanvasRenderingContext2D;
let now = 0;                       // world time, for anything that animates
let shadowShear = 0, shadowStretch = 1;

/** Bind the kit to the game's canvas. Call once, before anything draws. */
export function initIsoKit(context: CanvasRenderingContext2D): void {
  ctx = context;
}
/** Advance the kit's clock. Called once per frame, not once per sprite. */
export function setKitTime(worldTime: number): void {
  now = worldTime;
}
/** Sun-driven shadow lean: long and slanted at dawn/dusk, tight at noon. */
export function setSunShadow(shear: number, stretch: number): void {
  shadowShear = shear; shadowStretch = stretch;
}

/* ---------- colour ---------- */

export function shadeColor(hex: string, amt: number): string {
  const c = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((c >> 16) & 255) * (1 + amt)), 0, 255);
  const g = clamp(Math.round(((c >> 8) & 255) * (1 + amt)), 0, 255);
  const b = clamp(Math.round((c & 255) * (1 + amt)), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
export const shade = shadeColor;

/* ---------- paths ---------- */

/** The 2:1 tile diamond, centred on (cx,cy). Leaves the path open to fill or stroke. */
export function tileDiamond(cx: number, cy: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
}
export function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- solids ---------- */

/** A box standing on the iso ground. Returns the y of its top face. */
export function isoBox(cx: number, baseY: number, w: number, d: number, hgt: number, col: string): number {
  const topY = baseY - hgt;
  ctx.fillStyle = shade(col, -0.16);            // left face
  ctx.beginPath();
  ctx.moveTo(cx - w, baseY - w * 0.5);
  ctx.lineTo(cx, baseY);
  ctx.lineTo(cx, topY);
  ctx.lineTo(cx - w, topY - w * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(col, -0.34);            // right face
  ctx.beginPath();
  ctx.moveTo(cx + d, baseY - d * 0.5);
  ctx.lineTo(cx, baseY);
  ctx.lineTo(cx, topY);
  ctx.lineTo(cx + d, topY - d * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(col, 0.10);             // top
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx - w, topY - w * 0.5);
  ctx.lineTo(cx - w + d, topY - (w + d) * 0.5);
  ctx.lineTo(cx + d, topY - d * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx, baseY); ctx.lineTo(cx, topY); ctx.stroke();
  return topY;
}

/** Gabled roof over an isoBox footprint; the ridge runs along the left face. */
export function isoRoof(cx: number, topY: number, w: number, d: number, rise: number, col: string): number {
  const peakY = topY - rise;
  const eaveL = { x: cx - w * 1.12, y: topY - w * 0.56 };
  ctx.fillStyle = shade(col, -0.05);            // near slope
  ctx.beginPath();
  ctx.moveTo(eaveL.x, eaveL.y);
  ctx.lineTo(cx - w * 0.5, peakY - w * 0.25);
  ctx.lineTo(cx + d * 0.62, peakY + d * 0.02);
  ctx.lineTo(cx + d * 1.12, topY - d * 0.56 + 2);
  ctx.lineTo(cx, topY + 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(col, -0.32);            // far slope
  ctx.beginPath();
  ctx.moveTo(cx + d * 1.12, topY - d * 0.56);
  ctx.lineTo(cx + d * 0.62, peakY + d * 0.02);
  ctx.lineTo(cx - w * 0.5, peakY - w * 0.25);
  ctx.lineTo(cx - w * 0.5 + 3, peakY - w * 0.25 + 4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,235,200,0.10)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.5, peakY - w * 0.25);
  ctx.lineTo(cx + d * 0.62, peakY + d * 0.02);
  ctx.stroke();
  return peakY;
}

/** Horizontal plank seams on one wall face. side: -1 left, +1 right. */
export function plankLines(cx: number, baseY: number, w: number, hgt: number, side: number): void {
  ctx.strokeStyle = 'rgba(0,0,0,0.20)'; ctx.lineWidth = 0.7;
  const rows = Math.max(2, Math.floor(hgt / 7));
  for (let i = 1; i < rows; i++) {
    const y = baseY - (hgt * i / rows);
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + side * w, y - w * 0.5);
    ctx.stroke();
  }
}
export function stoneCourses(cx: number, baseY: number, w: number, hgt: number, side: number): void {
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.7;
  const rows = Math.max(2, Math.floor(hgt / 8));
  for (let i = 1; i < rows; i++) {
    const y = baseY - (hgt * i / rows);
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + side * w, y - w * 0.5); ctx.stroke();
    const jx = cx + side * w * (i % 2 ? 0.35 : 0.65);
    ctx.beginPath(); ctx.moveTo(jx, y); ctx.stroke();
  }
}

/* ---------- details ---------- */

/** A lit window. Breathes slowly so a hold at night doesn't read as a still. */
export function glowWindow(x: number, y: number, w2: number, h2: number, phase?: number): void {
  const g = 0.55 + Math.sin(now * 1.4 + (phase || 0)) * 0.1;
  ctx.fillStyle = `rgba(255,196,110,${g})`;
  ctx.fillRect(x, y, w2, h2);
  ctx.strokeStyle = 'rgba(20,12,4,0.8)'; ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w2, h2);
  ctx.strokeStyle = 'rgba(20,12,4,0.5)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(x + w2 / 2, y); ctx.lineTo(x + w2 / 2, y + h2); ctx.stroke();
}
export function doorArch(cx: number, baseY: number, w2: number, hgt: number, col?: string): void {
  ctx.fillStyle = col || '#160e06';
  ctx.beginPath();
  ctx.moveTo(cx - w2 / 2, baseY);
  ctx.lineTo(cx - w2 / 2, baseY - hgt + w2 / 2);
  ctx.arc(cx, baseY - hgt + w2 / 2, w2 / 2, Math.PI, 0);
  ctx.lineTo(cx + w2 / 2, baseY);
  ctx.closePath(); ctx.fill();
}
export function chimneySmoke(x: number, y: number): void {
  ctx.fillStyle = 'rgba(200,200,205,0.16)';
  for (let i = 0; i < 3; i++) {
    const t = (now * 0.5 + i * 0.33) % 1;
    ctx.beginPath();
    ctx.arc(x + Math.sin(t * 6 + i) * 4, y - t * 22, 2.5 + t * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Ground shadow, leaning and stretching with the sun. */
export function drawShadow(cx: number, cy: number, r: number): void {
  r = Math.abs(r);
  if (r < 0.5) return;
  ctx.save();
  ctx.translate(cx, cy + 2);
  // Never scale a radius by a signed direction — shear the transform instead.
  ctx.transform(1, 0, shadowShear * 0.35, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(shadowShear * r * 0.5, 0, r * shadowStretch * 0.75 + r * 0.25, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---------- sprite tinting ---------- */

const tintCache = new Map<string, HTMLCanvasElement>();

/** Multiply a sprite by a colour, re-masked to its own alpha. Cached by src+tint. */
export function tintedFrame(img: any, tint: string): any {
  if (!tint) return img;
  const ck = (img.src || img._k || '') + '|' + tint;
  const hit = tintCache.get(ck);
  if (hit) return hit;
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';   // re-mask to the sprite's alpha
    g.drawImage(img, 0, 0);
    tintCache.set(ck, c);
    return c;
  } catch (e) { return img; }
}
