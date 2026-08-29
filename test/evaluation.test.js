import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, fixture, tick, settle } from './setup.js';

const plain = (x) => JSON.parse(JSON.stringify(x));
const ts = (h, m, s) => Math.round(new Date(2026, 7, 29, h, m, s).getTime() / 1000);

describe('parseHaul (#attack_results)', () => {
  const env = createEnv({ premium: false });
  test('volle Beute 800/800', () => {
    const r = env.internals.parseHaul(env.$('<div>' + fixture('report_attack_full.html') + '</div>'));
    assert.deepEqual(plain(r), { loot: [280, 258, 262], carried: 800, capacity: 800 });
  });
  test('Teilbeute 145/160', () => {
    const r = env.internals.parseHaul(env.$('<div>' + fixture('report_attack_partial.html') + '</div>'));
    assert.deepEqual(plain(r), { loot: [67, 11, 67], carried: 145, capacity: 160 });
  });
  test('Spähbericht ohne Beute -> null', () => {
    assert.equal(env.internals.parseHaul(env.$('<div>' + fixture('report_scout.html') + '</div>')), null);
  });
});

describe('Auswertung erwartet vs. tatsächlich', () => {
  // 589|423: Bericht 16:47:03 (voll, 800/800); 594|423: Bericht 16:37:49 (145/160)
  const history = {
    '589|423': { sent: [{ arrival: ts(16, 46, 50), capacity: 800, expected: 600 }] },
    '594|423': {
      emptiedAt: ts(12, 37, 49),
      base: { time: ts(12, 37, 49), raw: [0, 0, 0] },
      sent: [{ arrival: ts(16, 37, 40), capacity: 160, expected: 160 }],
    },
  };

  test('Angriffsberichte mit sent-Eintrag werden geladen, Statistik gespeichert, Produktion gelernt', async () => {
    const env = createEnv({ premium: false, history });
    await tick();
    const data = await env.internals.getData(0, false, false, true, 0);
    const reqs = env.window.requests;
    assert.equal(reqs.filter((u) => u.includes('view=1099410')).length, 1, 'voller Bericht geladen');
    assert.equal(reqs.filter((u) => u.includes('view=1096067')).length, 1, 'Teilbericht geladen');
    assert.equal(data.farms.farms['589|423'].haul.carried, 800);
    assert.equal(data.farms.farms['594|423'].haul.carried, 145);

    env.internals.createPlanning({}, data);

    const stats = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_stats'));
    assert.equal(stats.length, 2);
    const byCoord = Object.fromEntries(stats.map((s) => [s.coord, s]));
    assert.deepEqual(plain(byCoord['589|423']), { time: ts(16, 47, 3), coord: '589|423', expected: 600, actual: 800, capacity: 800, full: true });
    assert.deepEqual(plain(byCoord['594|423']), { time: ts(16, 37, 49), coord: '594|423', expected: 160, actual: 145, capacity: 160, full: false });

    // Teilbeute 145 in 4 h seit dem letzten Leerräumen -> Produktion exakt 36.25/h
    const h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'));
    assert.equal(h['594|423'].prodMin, 36.25);
    assert.equal(h['594|423'].prodMax, 36.25);
    assert.equal(h['594|423'].sent.length, 0, 'ausgewerteter sent-Eintrag entfernt');

    const summary = env.internals.statsSummary();
    assert.equal(summary.n, 2);
    // Füllung: (800/800 + 145/160)/2 = 95.3 %; Abweichung: ((600-800)/800 + (160-145)/160)/2 = -7.8 %
    assert.equal(summary.fill, 95);
    assert.equal(summary.bias, -8);
    assert.equal(summary.error, 17);
  });

  test('Bereits ausgewertete Berichte werden nicht nochmal geladen', async () => {
    const env = createEnv({ premium: false, history });
    await tick();
    let data = await env.internals.getData(0, false, false, true, 0);
    env.internals.createPlanning({}, data);
    env.window.requests.length = 0;
    data = await env.internals.getData(0, false, false, true, 0);
    env.internals.createPlanning({}, data);
    assert.equal(env.window.requests.filter((u) => u.includes('screen=report')).length, 0, 'alles schon bekannt, nichts geladen');
    assert.equal(JSON.parse(env.window.localStorage.getItem('FarmGodSmart_stats')).length, 2);
  });

  test('Ohne sent-Eintrag: kein Bericht geladen (Teilbeute nur mit bekanntem emptiedAt)', async () => {
    const env = createEnv({ premium: false });
    await tick();
    await env.internals.getData(0, false, false, true, 0);
    assert.equal(env.window.requests.filter((u) => u.includes('view=1099410') || u.includes('view=1096067')).length, 0);
  });

  test('Request-Budget: höchstens maxReportFetches Berichte, Spähberichte zuerst', async () => {
    const env = createEnv({ premium: false, history });
    env.internals.RULES.maxReportFetches = 2;
    await tick();
    await env.internals.getData(0, false, false, true, 0);
    const reports = env.window.requests.filter((u) => u.includes('screen=report'));
    assert.equal(reports.length, 2);
    assert.ok(reports.some((u) => u.includes('view=1093158')), 'Spähbericht dabei');
  });

  test('Tabelle zeigt die Auswertungszeile', async () => {
    const env = createEnv({ settings: { optionGroup: 0, optionNewbarbsMaxPoints: 500 }, history });
    await settle(env);
    const text = env.$('.farmGodContent').text();
    assert.ok(text.includes('Auswertung'), text.slice(0, 200));
    assert.ok(text.includes('2 Angriffe'));
  });

  test('sendFarm merkt sich die erwartete Beute', async () => {
    const env = createEnv({ settings: { optionGroup: 0, optionNewbarbsMaxPoints: 500 } });
    await settle(env);
    const $first = env.$('.farmGod_icon').first();
    $first.trigger('click');
    await tick();
    const h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'));
    const sent = h[$first.data('coord')].sent[0];
    assert.equal(sent.expected, parseInt($first.data('expected')));
    assert.ok(sent.expected > 0);
  });
});
