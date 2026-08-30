import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, fixture, tick, settle } from './setup.js';

const withTroops = (lk) => fixture('overview_combined.html').replace('<td class="unit-item">10</td>', `<td class="unit-item">${lk}</td>`);

// Wunsch des Spielers (30.08.2026): Einstellung "Truppen spätestens zurück
// nach X Stunden" - Angriffe, deren Hin- + Rückweg länger dauert, werden
// nicht geplant (leer/0 = keine Grenze, altes Verhalten).
describe('Einstellung optionMaxReturnHours', () => {
  test('mit Grenze fallen weite Ziele weg, nahe bleiben; ohne Grenze wie bisher', async () => {
    const env = createEnv({ premium: false, combinedHtml: withTroops(30) });
    await tick();
    env.internals.RULES.minScorePerSpeed = 30;
    const data = await env.internals.getData(0, true, false, true, 500);
    const all = env.internals.createPlanning({}, data).farms['592|424'];
    assert.ok(all.some((r) => 2 * r.travel > 5400), 'ohne Grenze gibt es Angriffe über 1,5 h Rückkehr');

    const env2 = createEnv({ premium: false, combinedHtml: withTroops(30) });
    await tick();
    env2.internals.RULES.minScorePerSpeed = 30;
    const data2 = await env2.internals.getData(0, true, false, true, 500);
    const rows = env2.internals.createPlanning({ optionMaxReturnHours: 1.5 }, data2).farms['592|424'] || [];
    assert.ok(rows.length > 0, 'nahe Ziele werden weiter geplant');
    rows.forEach((r) =>
      assert.ok(2 * r.travel <= 5400, `${r.target.coord}: Rückkehr nach ${2 * r.travel}s`)
    );
    assert.ok(!rows.some((r) => r.target.coord == '587|430'), 'das weite Dorf fehlt');
  });

  test('Grenze wirkt im kompletten Ablauf über die gespeicherten Einstellungen', async () => {
    const env = createEnv({
      settings: { optionGroup: 0, optionNewbarbsMaxPoints: 500, optionMaxReturnHours: 1.5 },
      combinedHtml: withTroops(30),
      history: { '589|423': { prodMin: 300, prodMax: 300 } },
    });
    await settle(env);
    const $icons = env.$('.farmGod_icon');
    assert.ok($icons.length > 0, 'es werden Angriffe geplant');
    $icons.each((i, el) => {
      const travel = parseInt(env.$(el).data('travel'));
      assert.ok(2 * travel <= 1.5 * 3600, `Rückkehr nach ${2 * travel}s trotz 1,5-h-Grenze`);
    });
  });
});
