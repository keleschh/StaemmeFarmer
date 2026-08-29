import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, fixture, tick } from './setup.js';

// objects from the jsdom window live in another realm -> plain copies for deepEqual
const plain = (x) => JSON.parse(JSON.stringify(x));
const row = ($, html) => $('<table><tbody>' + html + '</tbody></table>').find('tr');

describe('parseReportTime (Farm-Assistent-Zeile)', () => {
  const env = createEnv({ premium: false });
  const { $, lib } = env;
  const day = new Date(2026, 7, 29);
  const ts = (d, h, m, s) => Math.round(new Date(2026, 7, d, h, m, s).getTime() / 1000);

  test('"heute um 16:29:51"', () => {
    assert.equal(lib.parseReportTime(row($, fixture('farm_row_scouted.html'))), ts(29, 16, 29, 51));
  });
  test('"gestern um 22:33:33"', () => {
    assert.equal(lib.parseReportTime(row($, fixture('farm_row_yesterday.html'))), ts(28, 22, 33, 33));
  });
  test('"am 27.08. um 09:05:00"', () => {
    const html = fixture('farm_row_scouted.html').replace('heute um 16:29:51', 'am 27.08. um 09:05:00');
    assert.equal(lib.parseReportTime(row($, html)), ts(27, 9, 5, 0));
  });
  test('Laufzeit im Tooltip wird nicht als Berichtszeit gelesen', () => {
    const html = fixture('farm_row_scouted.html').replace('<td>heute um 16:29:51</td>', '<td></td>');
    assert.equal(lib.parseReportTime(row($, html)), 0);
  });
  test('serverDate dd/mm/yyyy wird korrekt gelesen', () => {
    assert.equal(day.getDate(), 29);
    assert.equal($('#serverDate').text(), '29/08/2026');
  });
});

describe('timestampFromString (Befehlsübersicht)', () => {
  const env = createEnv({ premium: false });
  test('"heute um 17:22:56:152" mit Millisekunden', () => {
    const t = env.lib.timestampFromString('heute um 17:22:56:152');
    assert.equal(t, new Date(2026, 7, 29, 17, 22, 56, 152).getTime());
  });
});

describe('parseScoutReport', () => {
  const env = createEnv({ premium: false });
  const { $, internals } = env;

  test('Spähbericht: erspähte (nicht hochgerechnete) Rohstoffe, Gebäude, keine Truppen', () => {
    const r = internals.parseScoutReport($('<div>' + fixture('report_scout.html') + '</div>'));
    assert.deepEqual(plain(r.res), [35, 11, 30]);
    assert.deepEqual(plain(r.buildings), { main: 1, place: 1, wood: 2, stone: 1, iron: 1, farm: 2, storage: 1, hide: 1 });
    assert.equal(r.troops, 0);
  });
  test('Spähbericht ohne JSON-Feld: Gebäude aus den Tabellen', () => {
    const html = fixture('report_scout.html').replace(/<input id="attack_spy_building_data"[^>]*>/, '');
    const r = internals.parseScoutReport($('<div>' + html + '</div>'));
    assert.deepEqual(plain(r.buildings), { main: 1, place: 1, wood: 2, stone: 1, iron: 1, farm: 2, storage: 1, hide: 1 });
  });
  test('Verteidiger: nur die Anzahl-Zeile zählt, nicht die Verluste', () => {
    const html = fixture('report_scout.html')
      .replace('data-unit-count="0" class="unit-item unit-item-spear hidden">0', 'data-unit-count="7" class="unit-item unit-item-spear">7');
    const r = internals.parseScoutReport($('<div>' + html + '</div>'));
    assert.equal(r.troops, 7);
  });
  test('Angriffsbericht ohne Späher: keine Rohstoffe, keine Gebäude', () => {
    const r = internals.parseScoutReport($('<div>' + fixture('report_attack_full.html') + '</div>'));
    assert.equal(r.res, null);
    assert.equal(r.buildings, null);
  });
});

describe('getData (alle Seiten aus Fixtures)', () => {
  test('Farm-Zeilen, Vorlagen, Truppen, Befehle, Punkte', async () => {
    const env = createEnv({ premium: false });
    await tick(); // unit info / world config are cached asynchronously
    const data = await env.internals.getData(0, true, false, true, 500);

    const farms = data.farms.farms;
    // 4 Zeilen aus dem Farm-Assistenten + 3 graue Dörfer ohne Bericht aus village.txt
    assert.deepEqual(Object.keys(farms).sort(), ['435|521', '521|417', '533|519', '587|430', '589|423', '593|423', '594|423']);
    assert.equal(farms['533|519'].is_new, true);
    assert.equal(farms['533|519'].id, 2);

    const scouted = farms['593|423'];
    assert.equal(scouted.id, 13621);
    assert.equal(scouted.color, 'blue');
    assert.equal(scouted.max_loot, false);
    assert.equal(scouted.has_res_info, true);
    assert.equal(scouted.has_loot_info, false);
    assert.equal(scouted.report_id, 1093158);
    assert.equal(scouted.report_time, Math.round(new Date(2026, 7, 29, 16, 29, 51).getTime() / 1000));

    const full = farms['589|423'];
    assert.equal(full.color, 'green');
    assert.equal(full.max_loot, true);
    assert.equal(full.has_res_info, false);
    assert.equal(full.has_loot_info, true);
    assert.equal(full.report_id, 1099410);

    const partial = farms['594|423'];
    assert.equal(partial.max_loot, false);
    assert.equal(partial.has_loot_info, true);

    // templates: all 11 inputs (spear..knight); village units: without ram/catapult/knight
    assert.deepEqual(plain(data.farms.templates.a.units), [0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0]);
    assert.deepEqual(plain(data.farms.templates.b.units), [0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0]);
    assert.equal(data.farms.templates.a.id, 1125);
    assert.equal(data.farms.templates.b.id, 1126);
    assert.equal(data.farms.templates.a.capacity, 160);
    assert.equal(data.farms.templates.b.capacity, 800);
    assert.equal(data.farms.templates.a.speed, 10); // LKav, min/Feld laut get_unit_info

    const home = data.villages['592|424'];
    assert.equal(home.id, 14127);
    assert.equal(home.name, '[001]');
    assert.deepEqual(plain(home.units), [0, 2, 0, 0, 6, 10, 0, 0]);

    assert.equal(data.commands['589|423'].length, 1);
    assert.equal(data.commands['589|423'][0], Math.round(new Date(2026, 7, 29, 17, 22, 56, 152).getTime() / 1000));

    assert.equal(data.points['593|423'], 45);
    assert.equal(data.points['592|424'], 626);
    // graue Dörfer ohne Bericht bis zum Punktelimit
    assert.equal(farms['593|423'].is_new, undefined);
    assert.equal(data.newbarbs['533|519'].points, 52);

    // the scout report of the blue row was loaded and parsed
    assert.deepEqual(plain(farms['593|423'].scout.res), [35, 11, 30]);
    assert.equal(farms['593|423'].scout.buildings.wood, 2);
    // attack reports without resource info are not fetched
    assert.equal(env.window.requests.filter((u) => u.includes('view=1099410')).length, 0);
  });

  test('village.txt nicht ladbar -> trotzdem Daten', async () => {
    const env = createEnv({ premium: false });
    env.$.get = () => { const d = env.$.Deferred(); setTimeout(() => d.reject('404'), 0); return d.promise(); };
    const data = await env.internals.getData(0, true, false, true, 500);
    assert.equal(Object.keys(data.farms.farms).length, 4);
    assert.equal(Object.keys(data.newbarbs).length, 0);
  });
});
