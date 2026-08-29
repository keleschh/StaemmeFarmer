// jsdom harness for FarmGodSmart.js
// Builds a fake Farm Assistant page (real HTML fixtures from de259), stubs the
// game globals and answers every HTTP call of the script from fixtures.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jquerySrc = readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8');
const scriptSrc = readFileSync(path.join(here, '..', 'FarmGodSmart.js'), 'utf8');

export const fixture = (name) => readFileSync(path.join(here, 'fixtures', name), 'utf8');

// the script works with $(html).find(...) -> top level elements must be wrapped
const wrap = (html) => `<div>${html}</div>`;

export const VILLAGE_ID = 14127;
export const SERVER_DATE = '29/08/2026';
export const SERVER_TIME = '17:16:18';

/**
 * Creates a fresh window with the script loaded.
 * opts.rows: farm assistant rows (html), default: the four fixture rows
 * opts.reports: map reportId -> report html
 * opts.serverTime / serverDate: strings shown in the page
 * opts.history: initial localStorage history object
 * opts.settings: options object (null -> first start dialog would show)
 * opts.premium: false -> init() shows the error message and does nothing
 * opts.combinedHtml: override for the village overview (e.g. other troop counts)
 */
export function createEnv(opts = {}) {
  const serverDate = opts.serverDate || SERVER_DATE;
  const serverTime = opts.serverTime || SERVER_TIME;
  const rows = opts.rows !== undefined
    ? opts.rows
    : ['farm_row_scouted.html', 'farm_row_full_loot.html', 'farm_row_partial_loot.html', 'farm_row_yesterday.html']
      .map(fixture).join('\n');
  const reports = Object.assign({
    1093158: fixture('report_scout.html'),
    1099410: fixture('report_attack_full.html'),
    1096067: fixture('report_attack_partial.html'),
    779302: fixture('report_scout.html'),
  }, opts.reports || {});

  const farmPage = `
    <div id="am_widget_Farm" data-widget="Farm" class="am_widget vis spaced">
      <h4>Letzte Plünderungen</h4>
      <div class="body">
        ${fixture('farm_nav_and_filters.html')}
        <table id="plunder_list" class="vis" width="100%"><tbody>
          <tr><th></th><th></th><th></th><th>Dorf</th><th>Zeit</th><th colspan="3">Rohstoffe</th><th>Wall</th><th>Entfernung</th><th>A</th><th>B</th><th>C</th><th></th></tr>
          ${rows}
        </tbody></table>
        ${fixture('farm_nav_and_filters.html').replace('plunder_list_filters', 'plunder_list_filters_dup')}
      </div>
    </div>
    ${fixture('farm_templates_form.html')}`;

  const pageHtml = `<!DOCTYPE html><html><head></head><body>
    <p class="server_info">Serverzeit: <span id="serverTime">${serverTime}</span> <span id="serverDate">${serverDate}</span></p>
    <div id="content_value">${farmPage}</div>
  </body></html>`;

  const dom = new JSDOM(pageHtml, {
    url: `https://de259.die-staemme.de/game.php?village=${VILLAGE_ID}&screen=am_farm`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.localStorage.clear();
  if (opts.history) w.localStorage.setItem('FarmGodSmart_history', JSON.stringify(opts.history));
  if (opts.settings !== undefined && opts.settings !== null)
    w.localStorage.setItem('farmGod_options', JSON.stringify(opts.settings));

  // the script logs its parsed villages; keep test output clean
  w.console = Object.assign({}, console, { log() {} });

  // ---- game globals ----
  w.game_data = {
    market: 'de',
    locale: 'de_DE',
    screen: 'am_farm',
    player: { id: 10080975, name: 'MuMiiTRixX' },
    village: { id: VILLAGE_ID, name: '[001]', x: 592, y: 424, coord: '592|424' },
    units: ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob', 'militia'],
    features: { Premium: { active: opts.premium !== false }, FarmAssistent: { active: opts.premium !== false } },
    link_base_pure: `/game.php?village=${VILLAGE_ID}&screen=`,
  };
  w.lang = {
    aea2b0aa9ae1534226518faaefffdaad: 'heute um %s',
    '57d28d1b211fddbb7a499ead5bf23079': 'morgen um %s',
    '0cb274c906d622fa8ce524bcfbb7552d': 'am %1 um %2',
  };
  w.ScriptAPI = { register() {} };
  w.Timing = { getElapsedTimeSinceLoad: () => 100000 };
  w.messages = { success: [], error: [] };
  w.UI = {
    SuccessMessage: (m) => w.messages.success.push(m),
    ErrorMessage: (m) => w.messages.error.push(m),
    InitProgressBars() {},
    updateProgressBar() {},
    Throbber: [{ outerHTML: '<img class="throbber">' }],
  };
  w.Dialog = { shown: [], show: (id, html) => w.Dialog.shown.push(html), close() {} };
  w.Accountmanager = {
    farm: { last_click: 0 },
    send_units_link: `/game.php?village=${VILLAGE_ID}&screen=am_farm&mode=farm&ajaxaction=farm&json=1&h=HASH`,
  };
  w.posted = [];
  w.TribalWars = {
    buildURL: (method, screen, params) => {
      let url = `/game.php?village=${VILLAGE_ID}&screen=${screen}`;
      for (let k in params || {}) url += `&${k}=${params[k]}`;
      return url;
    },
    post: (url, params, data, onSuccess) => {
      w.posted.push({ url, data });
      onSuccess({ success: 'ok' });
    },
  };

  // ---- jQuery + HTTP mock ----
  w.eval(jquerySrc);
  const $ = w.jQuery;
  w.requests = [];
  const route = (url) => {
    w.requests.push(url);
    if (url.includes('get_unit_info')) return $.parseXML(fixture('get_unit_info.xml'));
    if (url.includes('get_config')) return $.parseXML(fixture('get_config.xml'));
    if (url.includes('village.txt')) return opts.villageTxt !== undefined ? opts.villageTxt : fixture('village.txt');
    if (url.includes('mode=combined')) return wrap(opts.combinedHtml || fixture('overview_combined.html'));
    if (url.includes('mode=commands')) return wrap(fixture('overview_commands.html'));
    if (url.includes('screen=report&mode=attack')) return wrap(opts.reportList || fixture('report_list_attack.html'));
    if (url.includes('screen=am_farm')) return wrap(farmPage);
    let m = url.match(/screen=report&mode=all&view=(\d+)/);
    if (m && reports[m[1]]) return wrap(reports[m[1]]);
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
  $.post = (url) => answer(url);

  // ---- load the script ----
  w.eval(scriptSrc);
  return { window: w, $, document: w.document, lib: w.FarmGod.Library, main: w.FarmGod.Main, internals: w.FarmGod.Main._internals };
}

export const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// waits until init() has rendered the table (or failed), max 3 s
export async function settle(env) {
  for (let i = 0; i < 150; i++) {
    await tick(20);
    if (env.$('.farmGodContent table').length || env.window.messages.error.length) return;
  }
  throw new Error('FarmGod table did not appear');
}

// unix seconds of the page's server time (29/08/2026 17:16:18 local)
export function serverTimeSeconds(env) {
  return Math.round(env.lib.getCurrentServerTime() / 1000);
}
