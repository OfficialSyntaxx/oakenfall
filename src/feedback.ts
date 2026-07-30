/* Reporting a bug or an idea from inside the game.
 *
 * A player should never need a GitHub account to tell us something is wrong, so
 * a report POSTs to a Netlify function that files the issue server-side with a
 * repo-scoped token. If that is unreachable — offline, or the function is down —
 * it falls back to putting the whole thing on the clipboard, and only then to
 * asking the player to copy it by hand. Three tiers, because a report that is
 * hard to send does not get sent.
 *
 * The diagnostics block is the valuable half: version, mode, day, weather,
 * population, stores, studies, device, and the last ten swallowed errors. The
 * frame loop catches exceptions on purpose, so that error ring is often the
 * only trace a fault ever leaves.
 */
import { G } from './state';
import { GAME_VERSION } from './version';
import { HOLD_TIERS } from './defs';
import { view } from './camera';
import { seasonName } from './time';
import { getWeather } from './weather';
import { popCapacity } from './buildings';
import { getTier } from './progress';
import { sfx } from './audio';

/** Where a report goes. A Netlify function holds the token; the repo URL is
 *  only ever used as a manual fallback link. */
const FEEDBACK_ENDPOINT = '/.netlify/functions/submit-feedback';
const REPO_URL = 'https://github.com/OfficialSyntaxx/oakenfall';

import { sheetContent } from './sheet';

type Deps = {
  /** Which game mode is running, for the report header. */
  gameModeId: () => string;
};
let dep: Deps = { gameModeId: () => 'settler' };
export function initFeedback(deps: Deps): void { dep = deps; }

/* A ring of the last ten faults, kept because the frame loop swallows
   exceptions by design — findTC threw on every call for fourteen versions and
   this log was the only place it showed. Nothing read it for a long while,
   which is its own lesson; the debug snapshot and the suites read it now. */
const errorLog: any[] = [];
export function logError(kind: string, msg: any): void {
  errorLog.push({ t: Date.now(), kind, msg: String(msg).slice(0, 300) });
  if (errorLog.length > 10) errorLog.shift();
}
export function recentErrors(): any[] { return errorLog; }

export function buildDiagnostics(){
  const lines = [];
  lines.push('## Oakenfall Report');
  lines.push('- Version: ' + GAME_VERSION + ' · Mode: ' + dep.gameModeId() + ' · Map: ' + G.MAP_SIZE);
  lines.push('- Day ' + G.dayCount + ' · ' + seasonName() + ' · ' + getWeather().label + ' · Tier: ' + HOLD_TIERS[getTier()].name);
  lines.push('- Pop: ' + G.villagers.length + '/' + popCapacity() + ' · Buildings: ' + G.buildings.length + ' · Coins: ' + G.coins);
  lines.push('- Stock: ' + Object.entries(G.stockpile).map(([k,v])=>k+':'+Math.round(v)).join(' '));
  lines.push('- Researched: ' + (Object.keys(G.researched).join(', ') || 'none') + (G.activeResearch ? ' (researching: '+G.activeResearch.id+')' : ''));
  lines.push('- Device: ' + (navigator.userAgent||'?').slice(0,110));
  lines.push('- Screen: ' + view.w + 'x' + view.h + ' @' + view.dpr + 'x · ' + (window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait'));
  if(errorLog.length){
    lines.push('- Recent errors:');
    for(const e of errorLog) lines.push('  · ['+e.kind+'] '+e.msg);
  } else lines.push('- Recent errors: none');
  return lines.join('\n');
}
export async function copyFeedback(kind, text){
  const head = kind==='bug' ? '### BUG REPORT' : '### FEATURE SUGGESTION';
  const body = head + '\n' + (text.trim() || '(no description given)') + '\n\n' + buildDiagnostics()
    + '\n\n_Paste this whole block to Claude to get it fixed/built._';
  try {
    await navigator.clipboard.writeText(body);
    return true;
  } catch(e){
    // Fallback: legacy textarea copy
    try {
      const ta = document.createElement('textarea');
      ta.value = body; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch(e2){ return false; }
  }
}
export function renderFeedbackSheet(kind){
  const isBug = kind==='bug';
  sheetContent.innerHTML = `
    <div class="sheet-sub">${isBug
      ? 'Describe what went wrong and what you expected. Game state and recent errors attach automatically.'
      : 'Describe your idea — what it does and why it would make the hold better.'}</div>
    <textarea id="fb-text" placeholder="${isBug ? 'What happened? What did you expect?' : 'Your idea...'}"
      style="width:100%;min-height:90px;margin-top:8px;background:#241a10;color:var(--parchment-text);
             border:1px solid var(--panel-edge);border-radius:8px;padding:10px;font:inherit;font-size:14px;
             resize:vertical;box-sizing:border-box;"></textarea>
    <div class="row" style="margin-top:8px;gap:8px;">
      <button class="action-btn primary" id="fb-copy">📮 Submit to GitHub</button>
    </div>
    <div class="sheet-sub" id="fb-status" style="margin-top:6px;"></div>
    <div class="sheet-sub" style="margin-top:4px;opacity:0.7;">v${GAME_VERSION} · Files straight to the dev's GitHub — your hold's state is attached automatically so fixes land faster.</div>
  `;
  document.getElementById('fb-copy').addEventListener('click', async ()=>{
    const textEl = document.getElementById('fb-text') as HTMLTextAreaElement;
    const text = textEl.value;
    const statusEl = document.getElementById('fb-status');
    const btn = document.getElementById('fb-copy') as HTMLButtonElement;
    const head = kind==='bug' ? '[Bug] ' : '[Suggestion] ';
    const title = (head + (text.trim().split('\n')[0] || 'from in-game report')).slice(0, 70);
    const bodyMd = (kind==='bug' ? '### BUG REPORT' : '### FEATURE SUGGESTION') + '\n'
      + (text.trim() || '(no description given)') + '\n\n' + buildDiagnostics();

    btn.disabled = true;
    statusEl.textContent = '⏳ Filing it now...';
    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, body: bodyMd })
      });
      const data = await res.json().catch(()=>({}));
      if(!res.ok || !data.ok) throw new Error(data.error || ('status ' + res.status));
      statusEl.innerHTML = '✅ Filed as <a href="' + data.url + '" target="_blank" rel="noopener">issue #' + data.number + '</a> — thank you!';
      textEl.value = '';
      sfx('coin');
    } catch(e){
      logError('feedback-submit', e && e.message || e);
      const ok = await copyFeedback(kind, text);
      statusEl.innerHTML = ok
        ? '⚠️ Couldn\'t auto-file (offline or server issue). Copied instead — paste it into the Claude chat or ' +
          '<a href="' + REPO_URL.replace(/\/$/,'') + '/issues/new" target="_blank" rel="noopener">open a GitHub issue</a> manually.'
        : '⚠️ Couldn\'t auto-file or reach the clipboard — long-press the text above to copy manually.';
    } finally {
      btn.disabled = false;
    }
  });
}

