import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, fixture, tick } from './setup.js';

const plain = (x) => JSON.parse(JSON.stringify(x));
const ts = (h, m, s) => Math.round(new Date(2026, 7, 29, h, m, s).getTime() / 1000);
const SERVER = ts(17, 16, 18);

// Lücke aus dem Spiel (30.08.2026): letzter Bericht ist ein Spähbericht, der
// wegen des Budgets nicht geladen wird -> der alte "volle" Stand blieb stehen,
// die gelandete B-Attacke wurde vergessen, das Dorf bekam wieder B.
describe('Spähbericht als letzter Bericht, ohne Bericht-Abruf', () => {
  const fullBase = { time: ts(6, 0, 0), raw: [1000, 1000, 1000] };
  const buildings = { main: 1, place: 1, wood: 2, stone: 1, iron: 1, farm: 2, storage: 1, hide: 1 };

  test('Farm-Zeile liefert die vom Spiel hochgerechneten Rohstoffe', async () => {
    const env = createEnv({ premium: false });
    await tick();
    env.internals.RULES.maxReportFetches = 0;
    const data = await env.internals.getData(0, false, false, true, 0);
    assert.deepEqual(plain(data.farms.farms['593|423'].res_estimate), [90, 58, 77]);
    assert.equal(data.farms.farms['589|423'].res_estimate, null);
  });

  test('Zahlen der Zeile werden als Vorrat übernommen, gelandete B-Attacke wird vergessen dürfen', async () => {
    const history = {
      '593|423': {
        buildings, base: fullBase, lastReport: ts(6, 0, 0),
        sent: [{ arrival: ts(16, 0, 0), capacity: 800, expected: 800 }],
      },
    };
    const env = createEnv({ premium: false, history });
    await tick();
    env.internals.RULES.maxReportFetches = 0;
    const data = await env.internals.getData(0, false, false, true, 0);
    assert.equal(data.farms.farms['593|423'].scout, undefined, 'Bericht nicht geladen');
    const plan = env.internals.createPlanning({}, data);
    const h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'))['593|423'];
    assert.deepEqual(plain(h.base.raw), [90, 58, 77]);
    assert.equal(h.base.time, SERVER);
    assert.equal(h.sent.length, 0);
    const row = plan.farms['592|424'].find((r) => r.target.coord == '593|423');
    if (row) assert.ok(row.expected < 200, 'kein volles Dorf mehr: ' + row.expected);
  });

  test('Ohne Zahlen in der Zeile: gelandete Angriffe werden trotzdem vom Vorrat abgezogen', async () => {
    const rows = fixture('farm_row_scouted.html').replace(/<span class="nowrap">.*?<\/span><\/span>/gs, '');
    const history = {
      '593|423': {
        buildings, base: fullBase, lastReport: ts(6, 0, 0),
        sent: [{ arrival: ts(16, 0, 0), capacity: 800, expected: 800 }],
      },
    };
    const env = createEnv({ premium: false, rows, history });
    await tick();
    env.internals.RULES.maxReportFetches = 0;
    const data = await env.internals.getData(0, false, false, true, 0);
    assert.equal(data.farms.farms['593|423'].res_estimate, null);
    env.internals.createPlanning({}, data);
    const h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'))['593|423'];
    assert.equal(h.base.time, ts(16, 0, 0), 'Basis = Zeitpunkt der gelandeten Attacke');
    const total = h.base.raw.reduce((a, b) => a + b, 0);
    assert.ok(total < 3000 - 800 + 1, 'B-Kapazität abgezogen: ' + total);
  });

  test('Wird der Spähbericht später geladen, gilt der erspähte Stand', async () => {
    const env = createEnv({ premium: false, history: { '593|423': { buildings, base: fullBase, lastReport: ts(6, 0, 0) } } });
    await tick();
    env.internals.RULES.maxReportFetches = 0;
    let data = await env.internals.getData(0, false, false, true, 0);
    env.internals.createPlanning({}, data);
    env.internals.RULES.maxReportFetches = 5;
    data = await env.internals.getData(0, false, false, true, 0);
    env.internals.createPlanning({}, data);
    const h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'))['593|423'];
    assert.deepEqual(plain(h.base.raw), [35, 11, 30]);
    assert.equal(h.base.time, ts(16, 29, 51));
  });
});
