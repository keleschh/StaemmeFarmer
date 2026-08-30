import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, fixture, tick } from './setup.js';

const withTroops = (lk) => fixture('overview_combined.html').replace('<td class="unit-item">10</td>', `<td class="unit-item">${lk}</td>`);

const plain = (x) => JSON.parse(JSON.stringify(x));
const ts = (h, m, s) => Math.round(new Date(2026, 7, 29, h, m, s).getTime() / 1000);
// Ankunft des laufenden Angriffs aus overview_commands.html ("heute um 17:22:56:152")
const arrival = Math.round(new Date(2026, 7, 29, 17, 22, 56, 152).getTime() / 1000);

// Wunsch des Spielers (30.08.2026): beim Hovern über die Beute-Spalte sehen,
// ob schon ein Angriff auf das Dorf unterwegs ist und was die letzten eigenen
// Beuteberichte gebracht haben.
describe('Tooltip der Beute-Spalte: laufende Angriffe + letzte Beute', () => {
  test('Eintrag kennt die laufenden Angriffe, Tooltip zeigt Ankunft und letzte Beuten', async () => {
    // 589|423: gelernte Produktion, damit es trotz laufendem Angriff geplant wird
    const env = createEnv({ premium: false, combinedHtml: withTroops(30), history: { '589|423': { prodMin: 300, prodMax: 300 } } });
    await tick();
    env.window.localStorage.setItem('FarmGodSmart_stats', JSON.stringify([
      { time: ts(12, 0, 0), coord: '589|423', expected: 100, actual: 80, capacity: 160, full: false },
      { time: ts(16, 47, 3), coord: '589|423', expected: 160, actual: 145, capacity: 160, full: true },
    ]));
    env.internals.RULES.minScorePerSpeed = 30;
    const data = await env.internals.getData(0, false, false, true, 0);
    const plan = env.internals.createPlanning({}, data);
    const entry = plan.farms['592|424'].find((r) => r.target.coord == '589|423');
    assert.ok(entry, '589|423 wird geplant');
    assert.deepEqual(plain(entry.running), [arrival], 'laufender Angriff aus der Befehlsübersicht');

    const $rows = env.$('<div>').html(env.internals.buildTable(plan)).find('.farmRow');
    const $row = $rows.filter((i, el) => env.$(el).text().includes('589|423')).first();
    const title = $row.find('td').eq(4).attr('title') || '';
    assert.ok(title.includes('17:22'), 'Ankunft des laufenden Angriffs: "' + title + '"');
    assert.ok(title.includes('145/160'), 'letzte Beute: "' + title + '"');
    assert.ok(title.includes('80/160'), 'vorletzte Beute: "' + title + '"');
    assert.ok(title.indexOf('145/160') < title.indexOf('80/160'), 'neueste zuerst');
  });

  test('ohne laufenden Angriff und ohne Auswertung bleibt der Tooltip leer', async () => {
    const env = createEnv({ premium: false, combinedHtml: withTroops(30) });
    await tick();
    env.internals.RULES.minScorePerSpeed = 30;
    const data = await env.internals.getData(0, false, false, true, 0);
    const plan = env.internals.createPlanning({}, data);
    // 594|423: kein Befehl unterwegs, keine Auswertungseinträge
    const entry = plan.farms['592|424'].find((r) => r.target.coord == '594|423');
    assert.ok(entry, '594|423 wird geplant');
    assert.deepEqual(plain(entry.running), []);

    const $rows = env.$('<div>').html(env.internals.buildTable(plan)).find('.farmRow');
    const $row = $rows.filter((i, el) => env.$(el).text().includes('594|423')).first();
    assert.equal($row.find('td').eq(4).attr('title') || '', '');
  });
});
