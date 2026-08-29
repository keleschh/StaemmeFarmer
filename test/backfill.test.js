import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, fixture, tick } from './setup.js';

const plain = (x) => JSON.parse(JSON.stringify(x));

describe('parseReportList (Berichtsübersicht, mode=attack)', () => {
  const env = createEnv({ premium: false });
  test('Späh-Zeilen mit Ziel, Bericht-ID, Zeit; Farmangriffe ohne Späher werden übersprungen', () => {
    const list = env.internals.parseReportList(env.$('<div>' + fixture('report_list_attack.html') + '</div>'));
    assert.deepEqual(plain(list.reports), [
      { coord: '600|417', reportId: 1124841, time: Math.round(new Date(2026, 7, 29, 17, 53).getTime() / 1000), color: 'blue' },
    ]);
    assert.equal(list.nextFrom, 21);
    assert.equal(env.internals.parseReportList(env.$('<div>' + fixture('report_list_attack.html') + '</div>'), 42).nextFrom, 63);
    assert.equal(env.internals.parseReportList(env.$('<div>' + fixture('report_list_attack.html') + '</div>'), 84).nextFrom, null);
  });
});

describe('Alte Spähberichte nachladen', () => {
  // 600|417 ist im Farm-Assistenten (grün, ohne Gebäudedaten), der Spähbericht steht nur noch in der Übersicht
  const rowFor600 = fixture('farm_row_full_loot.html')
    .replace(/12806/g, '99001').replace('(589|423)', '(600|417)').replace('view=1099410', 'view=1124928');
  const reports = { 1124841: fixture('report_scout.html'), 1124928: fixture('report_attack_full.html') };

  test('Gebäude aus dem alten Spähbericht landen im Gedächtnis, Basis nach Teilbeute auf Versteck', async () => {
    const history = {
      '600|417': { emptiedAt: 1000, base: { time: 1000, raw: [0, 0, 0] }, lastReport: 1000 },
    };
    const env = createEnv({ premium: false, rows: rowFor600, reports, history });
    await tick();
    const data = await env.internals.getData(0, false, false, true, 0);
    const reqs = env.window.requests;
    assert.equal(reqs.filter((u) => u.includes('screen=report&mode=attack')).length, 1, 'Liste geladen');
    assert.equal(reqs.filter((u) => u.includes('view=1124841')).length, 1, 'alter Spähbericht geladen');
    const h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'));
    assert.equal(h['600|417'].buildings.wood, 2);
    assert.equal(h['600|417'].buildings.hide, 1);
    assert.equal(h['600|417'].scoutReportId, 1124841);
    assert.equal(h['600|417'].scoutTime, Math.round(new Date(2026, 7, 29, 17, 53).getTime() / 1000));
    assert.deepEqual(plain(h['600|417'].base.raw), [150, 150, 150], 'leer geräumt = Versteck voll');
    assert.ok(JSON.parse(env.window.localStorage.getItem('FarmGodSmart_backfill')).time > 0);

    // Planung nutzt jetzt das exakte Modell
    const plan = env.internals.createPlanning({}, data);
    const row = plan.farms['592|424'].find((r) => r.target.coord == '600|417');
    assert.ok(row, 'Dorf geplant');
    assert.equal(row.scouted, true);
  });

  test('Höchstens einmal pro Tag, und nur wenn Dörfer ohne Gebäudedaten da sind', async () => {
    const env = createEnv({ premium: false, rows: rowFor600, reports });
    env.window.localStorage.setItem('FarmGodSmart_backfill', JSON.stringify({ time: Math.round(Date.now() / 1000) }));
    await tick();
    await env.internals.getData(0, false, false, true, 0);
    assert.equal(env.window.requests.filter((u) => u.includes('mode=attack')).length, 0);

    const env2 = createEnv({ premium: false, rows: rowFor600, reports, history: { '600|417': { buildings: { wood: 1 } } } });
    await tick();
    await env2.internals.getData(0, false, false, true, 0);
    assert.equal(env2.window.requests.filter((u) => u.includes('mode=attack')).length, 0);
  });

  test('Mehrere Listenseiten bis RULES.backfillPages, wenn nicht alles gefunden wird', async () => {
    // Standardzeilen: 589|423 und 594|423 haben keine Gebäudedaten und keinen Spähbericht in der Liste
    const env = createEnv({ premium: false });
    env.internals.RULES.backfillPages = 3;
    await tick();
    await env.internals.getData(0, false, false, true, 0);
    const lists = env.window.requests.filter((u) => u.includes('mode=attack'));
    assert.equal(lists.length, 3);
    assert.ok(lists[1].includes('from=21'));
    assert.ok(lists[2].includes('from=42'));
    assert.equal(env.window.requests.filter((u) => u.includes('view=1124841')).length, 0, '600|417 ist nicht im Farm-Assistenten, Bericht nicht geladen');
  });

  test('Suche endet früher, wenn alle gesuchten Dörfer gefunden sind', async () => {
    const env = createEnv({ premium: false, rows: rowFor600, reports });
    await tick();
    await env.internals.getData(0, false, false, true, 0);
    assert.equal(env.window.requests.filter((u) => u.includes('mode=attack')).length, 1);
  });
});
