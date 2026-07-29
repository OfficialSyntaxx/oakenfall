/* The Chronicle — the hold's own account of itself.
 *
 * Births, deaths, weddings, first winters, raids weathered, guilds formed. Kept
 * to the last eighty entries and shown as a scroll the player can read back.
 *
 * Every kind of moment has several phrasings and one is picked at random, so a
 * long game reads like something written rather than a log with the nouns
 * swapped. That is the whole reason this is a module and not a one-line append:
 * six other modules report moments to it, and they were all being handed `chron`
 * as a callback because there was nowhere to import it from.
 */
import { G } from './state';
import { seasonName } from './time';

/** Newest first, capped at eighty — long enough to be a history, short enough
 *  that the save and the scroll both stay a sensible size. */
export function chronicleAdd(text: string): void {
  G.chronicle.unshift({ day: G.dayCount, season: seasonName(), text });
  if (G.chronicle.length > 80) G.chronicle.pop();
}

function pickOne(a: string[]): string { return a[Math.floor(Math.random() * a.length)]; }

// Varied phrasings so the chronicle reads written, not logged.
export function chron(type: string, a?: any, b?: any, n?: any): void {
  /* Every phrasing table is built on every call — cheap next to how rarely a
     chronicle-worthy moment happens, and it keeps `a`/`b`/`n` interpolated in
     place rather than templated afterwards. */
  const T = {
    founding:[
      'The first settlers raised the Town Center of '+G.holdName+' and made camp beneath the pines.',
      'Here '+G.holdName+' began — a handful of souls, a fire against the dark, and the whole wood watching.',
      'Smoke rose over the valley for the first time; the folk of '+G.holdName+' had come to stay.'],
    friends:[
      a+' and '+b+' became fast friends.',
      'A firm friendship took root between '+a+' and '+b+'.',
      a+' found a steadfast companion in '+b+'.'],
    rivals:[
      a+' and '+b+' fell to quarrelling over the pace of the work.',
      'No love was lost between '+a+' and '+b+'.'],
    wed:[
      a+' and '+b+' were wed beneath the pines.',
      a+' and '+b+' pledged themselves to one another before the hold.',
      'Hand in hand beneath the old oaks, '+a+' and '+b+' were married.'],
    born:[
      a+' was born to '+b+'.',
      'A child, '+a+', came into the world — born to '+b+'.',
      b+' welcomed a new child into the hold: '+a+'.'],
    ofage:[
      a+' came of age and took up the work of the hold.',
      a+' grew to adulthood and joined the labour.',
      'The hold gained a pair of hands as '+a+' came of age.'],
    passed:[
      a+' passed peacefully at '+n+' seasons, and rests now in the grove.',
      'After '+n+' seasons, '+a+' passed gently, laid to rest among the oaks.',
      a+' died full of years — '+n+' seasons — and joined the memorial grove.'],
    season:[
      a+' came to the hold.',
      'The season turned; '+a+' settled over the valley.',
      a+' arrived, and the light over the pines changed with it.'],
    deed:[
      'A deed worth remembering: '+a+'.',
      'The hold earned its name anew — '+a+'.',
      'Word spread of the hold\'s achievement: '+a+'.'],
    plague:[
      'A blight passed through the hold, and the sick beds filled for a time.',
      'Sickness came to Oakenfall; the folk nursed their own until it broke.',
      'A fever spread among the settlers before the herbs turned it back.'],
    decision:[
      'The steward faced a choice that day: '+a+'.',
      'Word still tells of how the hold answered — '+a+'.',
      a+' — and the steward\'s word settled it.'],
    guild:[
      'The masters of the hold banded together and founded the '+a+'.',
      'Enough of the craft had mastered their trade to raise the '+a+'.',
      'The '+a+' was established, and the whole hold prospered by it.'],
    district:[
      'The folk took to calling that corner of the hold '+a+'.',
      a+' had grown enough to earn a name of its own.',
      'A new quarter, '+a+', took shape among the rooftops.'],
    climate:[
      'A '+String(a).toLowerCase()+' settled over the valley.',
      'The season bent to a '+String(a).toLowerCase()+', and the hold felt it.'],
    fire:[
      'Fire took the '+a+'; only ash and a hard lesson remained.',
      'The '+a+' burned in the night, and the hold worked to stop the flames spreading.',
      'A blaze claimed the '+a+' — the folk still speak of the smoke.'],
    festival:[
      'The hold held its year-turn festival and chose '+a+'.',
      'At the new year the folk feasted and blessed the season with '+a+'.',
      a+' was chosen at the festival, and the valley rang with song.'],
  };
  chronicleAdd(pickOne(T[type] || [a||'']));
}
