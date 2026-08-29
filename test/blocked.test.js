import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, fixture, tick } from './setup.js';

// Das Spiel liefert bei zu vielen Anfragen eine Sperrseite mit HTTP 200.
// Sie darf nicht als leerer Bericht / leere Übersicht durchgehen.
const BLOCK_PAGE = `<div id="content_value"><h2>Blockierte Anfrage</h2>
<p>Deine Anfrage wurde blockiert, da du derzeit zu viele Anfragen an unsere Server machst.</p>
<p>Stelle bitte sicher, dass keines deiner aktiven Scripte oder Tools zu viele Anfragen ausführt.</p></div>`;
const LOGIN_PAGE = `<div><form id="login_form"><input type="text" name="username"><input type="password" name="password"></form></div>`;

const answerWith = (env, body) => () => {
  const d = env.$.Deferred();
  setTimeout(() => d.resolve(body), 0);
  return d.promise();
};

describe('Sperrseite / Login-Seite', () => {
  test('Queue: Sperrseite zählt als Fehlschlag, wird wiederholt und dann abgelehnt', async () => {
    const env = createEnv({ premium: false });
    let calls = 0;
    env.$.get = () => { calls += 1; return answerWith(env, BLOCK_PAGE)(); };
    let err = null;
    await Promise.resolve(env.window.twLib.get('/x')).catch((e) => { err = e; });
    assert.equal(calls, 3);
    assert.equal(err, 'blocked');
  });

  test('Queue: Login-Seite (Passwortfeld) ebenso', async () => {
    const env = createEnv({ premium: false });
    env.$.get = answerWith(env, LOGIN_PAGE);
    let err = null;
    await Promise.resolve(env.window.twLib.get('/x')).catch((e) => { err = e; });
    assert.equal(err, 'blocked');
  });

  test('Queue: normale Seiten und village.txt gehen weiter durch', async () => {
    const env = createEnv({ premium: false });
    const html = await env.window.twLib.get('/game.php?screen=report&mode=all&view=1093158');
    assert.ok(String(html).includes('attack_spy'));
    const txt = await env.window.twLib.get('/map/village.txt');
    assert.ok(String(txt).length > 0);
  });

  test('gesperrter Spähbericht vergiftet das Gedächtnis nicht', async () => {
    // 593|423: blaue Zeile, Spähbericht 1093158 -> Sperrseite statt Bericht
    const env = createEnv({ premium: false, reports: { 1093158: BLOCK_PAGE } });
    await tick();
    const data = await env.internals.getData(0, false, false, true, 0);
    assert.equal(data.farms.farms['593|423'].scout, undefined);
    env.internals.learnFromReports(data.farms.farms, Math.round(env.lib.getCurrentServerTime() / 1000), 160, 1);
    const h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'));
    assert.equal((h['593|423'] || {}).scoutReportId, undefined);
    assert.equal((h['593|423'] || {}).noScout, undefined);
  });

  test('gesperrte Berichtsübersicht: Backfill gilt nicht als erledigt, Bericht nicht als "ohne Gebäude"', async () => {
    const rowFor600 = fixture('farm_row_full_loot.html')
      .replace(/12806/g, '99001').replace('(589|423)', '(600|417)').replace('view=1099410', 'view=1124928');
    // Liste gesperrt
    const env = createEnv({ premium: false, rows: rowFor600, reportList: BLOCK_PAGE, reports: { 1124928: fixture('report_attack_full.html') } });
    await tick();
    await env.internals.getData(0, false, false, true, 0);
    assert.equal(env.window.localStorage.getItem('FarmGodSmart_backfill'), null, 'kein Zeitstempel');
    // Liste ok, der Bericht selbst gesperrt
    const env2 = createEnv({ premium: false, rows: rowFor600, reports: { 1124928: fixture('report_attack_full.html'), 1124841: BLOCK_PAGE } });
    await tick();
    await env2.internals.getData(0, false, false, true, 0);
    const h = JSON.parse(env2.window.localStorage.getItem('FarmGodSmart_history')) || {};
    assert.equal((h['600|417'] || {}).noScout, undefined);
    assert.equal((h['600|417'] || {}).buildings, undefined);
  });

  test('init(): klare Meldung statt leerer Tabelle', async () => {
    const env = createEnv({ settings: { optionGroup: 0, optionNewbarbsMaxPoints: 500 } });
    env.$.ajax = answerWith(env, BLOCK_PAGE);
    env.main.init();
    for (let i = 0; i < 150 && !env.$('.farmGodContent').text().includes('blockiert'); i++) await tick(20);
    const text = env.$('.farmGodContent').text();
    assert.ok(text.includes('blockiert'), text);
    assert.equal(env.$('.farmGodContent table').length, 0);
  });
});
