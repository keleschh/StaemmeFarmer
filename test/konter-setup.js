// jsdom harness for Konter.js: builds the "Eingehende Angriffe" overview from the
// HP20 fixtures, stubs the game globals and answers the script's HTTP calls.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jquerySrc = readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8');
const scriptSrc = readFileSync(path.join(here, '..', 'Konter.js'), 'utf8');

export const fixture = (name) => readFileSync(path.join(here, 'fixtures', name), 'utf8');
const wrap = (html) => `<div>${html}</div>`;

export const VILLAGE_ID = 391;
export const SERVER_DATE = '23/09/2026';
export const SERVER_TIME = '9:42:02';
// units of HP20 (dec1): no archer, no marcher, no militia
export const UNITS = ['spear', 'sword', 'axe', 'spy', 'light', 'heavy', 'ram', 'catapult', 'knight', 'snob'];

/**
 * opts.incomingsHtml: override for #incomings_table (default: fixture with one attack)
 * opts.noTable: true -> page without #incomings_table (wrong screen)
 * opts.placeHtml: override for the Versammlungsplatz answer
 * opts.blockedPlace: true -> the place request answers with the game's block page
 * opts.serverDate / opts.serverTime
 */
export function createKonterEnv(opts = {}) {
  const serverDate = opts.serverDate || SERVER_DATE;
  const serverTime = opts.serverTime || SERVER_TIME;
  const table = opts.noTable ? '' : (opts.incomingsHtml !== undefined ? opts.incomingsHtml : fixture('konter/incomings_table.html'));
  const pageHtml = `<!DOCTYPE html><html><head></head><body>
    <p class="server_info">Serverzeit: <span id="serverTime">${serverTime}</span> <span id="serverDate">${serverDate}</span></p>
    <div id="content_value"><form id="incomings_form" method="post">${table}</form></div>
  </body></html>`;

  const dom = new JSDOM(pageHtml, {
    url: `https://dec1.die-staemme.de/game.php?village=${VILLAGE_ID}&screen=overview_villages&mode=incomings&subtype=attacks`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.localStorage.clear();
  w.console = Object.assign({}, console, { log() {} });

  w.game_data = {
    market: 'de',
    locale: 'de_DE',
    screen: 'overview_villages',
    mode: 'incomings',
    player: { id: 1161, name: 'MuMiiTRixX' },
    village: { id: VILLAGE_ID, name: "MuMiiTRixX's Dorf", x: 483, y: 516, coord: '483|516' },
    units: UNITS.slice(),
    link_base_pure: `/game.php?village=${VILLAGE_ID}&screen=`,
  };
  w.ScriptAPI = { register() {} };
  w.messages = { success: [], error: [], info: [] };
  w.UI = {
    SuccessMessage: (m) => w.messages.success.push(m),
    ErrorMessage: (m) => w.messages.error.push(m),
    InfoMessage: (m) => w.messages.info.push(m),
  };

  w.eval(jquerySrc);
  const $ = w.jQuery;
  w.requests = [];
  const route = (url) => {
    w.requests.push(url);
    if (url.includes('get_unit_info')) return $.parseXML(fixture('get_unit_info.xml'));
    if (url.includes('screen=place')) {
      if (opts.blockedPlace) return '<html><body><h2>Blockierte Anfrage</h2><p>Du hast zu viele Anfragen gesendet.</p></body></html>';
      return wrap(opts.placeHtml || fixture('konter/place_form_prefilled.html'));
    }
    throw new Error('no mock for ' + url);
  };
  const answer = (url) => {
    const d = $.Deferred();
    try {
      const body = route(url);
      setTimeout(() => d.resolve(body), 0);
    } catch (e) {
      setTimeout(() => d.reject(e), 0);
    }
    return d.promise();
  };
  $.ajax = (o) => answer(typeof o === 'string' ? o : o.url);
  $.get = (url) => answer(url);

  w.eval(scriptSrc);
  return { window: w, $, document: w.document, konter: w.Konter, internals: w.Konter._internals, messages: w.messages };
}

export const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// waits until init() has rendered its table or reported an error, max 3 s
export async function settleKonter(env) {
  for (let i = 0; i < 150; i++) {
    await tick(20);
    if (env.$('.konterContent table').length || env.messages.error.length || env.messages.info.length) return;
  }
  throw new Error('Konter table did not appear');
}
