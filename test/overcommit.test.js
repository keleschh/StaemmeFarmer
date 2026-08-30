import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, fixture, tick } from './setup.js';

const plain = (x) => JSON.parse(JSON.stringify(x));
const ts = (h, m, s, dayOffset = 0) => Math.round(new Date(2026, 7, 29 + dayOffset, h, m, s).getTime() / 1000);
const withTroops = (lk) => fixture('overview_combined.html').replace('<td class="unit-item">10</td>', `<td class="unit-item">${lk}</td>`);
const exact = { main: 2, place: 1, wood: 2, stone: 2, iron: 2, farm: 3, storage: 3, hide: 1 };

// Fall aus dem Spiel (30.08.2026, 596|427): 7 Angriffe auf ein Dorf, dessen
// Vorrat nur aus 13 h hochgerechneter Produktion bestand; die erste B-Attacke
// kam mit 0 zurück (andere Spieler farmen mit), und der 0-Bericht wurde dem
// falschen sent-Eintrag zugeordnet.
describe('Hochgerechneter Vorrat: höchstens ein Angriff je Dorf und Durchlauf', () => {
  test('ohne frische Beobachtung nur ein Angriff auf das Dorf, Rest verteilt sich', async () => {
    // 589|423: volle Beute 16:47:03 (Bericht schon verarbeitet), zuletzt leer vor 2 Tagen
    const history = {
      '589|423': {
        buildings: exact, lastReport: ts(16, 47, 3), lastFull: true,
        base: { time: ts(16, 47, 3), raw: [900, 900, 900] },
        emptiedAt: ts(14, 20, 0, -2),
      },
    };
    const env = createEnv({ premium: false, history, combinedHtml: withTroops(30) });
    await tick();
    env.internals.RULES.minScorePerSpeed = 30; // die kleinen Fixture-Dörfer sollen mitspielen
    const data = await env.internals.getData(0, false, false, true, 0);
    const plan = env.internals.createPlanning({}, data);
    // auf 589|423 läuft schon ein Angriff (Befehlsübersicht): der zählt als "räumt leer",
    // geplant wird höchstens noch einer, und der bekommt nur die Produktion seit der Ankunft
    const on589 = plan.farms['592|424'].filter((r) => r.target.coord == '589|423');
    assert.ok(on589.length <= 1, 'höchstens ein weiterer Angriff');
    on589.forEach((r) => assert.ok(r.expected < 160, 'nur Produktion seit dem laufenden Angriff: ' + r.expected));
    // 587|430: vor 19 h gespäht, Modell sagt ~2500 -> genau ein Angriff, als B
    const on587 = plan.farms['592|424'].filter((r) => r.target.coord == '587|430');
    assert.equal(on587.length, 1);
    assert.equal(on587[0].template.name, 'b');
    assert.ok(plan.counter >= 3, 'übrige Truppen gehen woanders hin: ' + plan.counter);
  });

  test('frisch beobachteter Vorrat (Zeile mit Spähbericht) erlaubt mehrere Angriffe', async () => {
    const rows = fixture('farm_row_scouted.html')
      .replace('<span class="res">90</span>', '<span class="res">900</span>')
      .replace('<span class="res">58</span>', '<span class="res">900</span>')
      .replace('<span class="res">77</span>', '<span class="res">900</span>');
    const env = createEnv({ premium: false, rows, combinedHtml: withTroops(30), history: { '593|423': { buildings: exact } } });
    await tick();
    env.internals.RULES.maxReportFetches = 0;
    const data = await env.internals.getData(0, false, false, true, 0);
    const plan = env.internals.createPlanning({}, data);
    const on593 = plan.farms['592|424'].filter((r) => r.target.coord == '593|423');
    const cap = on593.reduce((s, r) => s + r.capacity, 0);
    assert.ok(on593.length >= 2, 'mehrere Angriffe: ' + on593.length);
    assert.ok(cap >= 1600 && cap <= 2700, 'Kapazität passt zum Vorrat: ' + cap);
  });

  test('Beobachtung älter als trustHours zählt nicht mehr als bekannt', async () => {
    const env = createEnv({ premium: false, combinedHtml: withTroops(30) });
    await tick();
    const R = env.internals.RULES;
    // 593|423: Zeile mit 900/900/900, aber die Basis wird künstlich alt gemacht
    const rows = fixture('farm_row_scouted.html').replace(/<span class="res">\d+<\/span>/g, '<span class="res">900</span>');
    const env2 = createEnv({
      premium: false, rows, combinedHtml: withTroops(30),
      history: { '593|423': { buildings: exact, lastReport: ts(16, 29, 51), base: { time: ts(16, 29, 51) - (R.trustHours + 1) * 3600, raw: [900, 900, 900], observed: true } } },
    });
    await tick();
    env2.internals.RULES.maxReportFetches = 0;
    const data = await env2.internals.getData(0, false, false, true, 0);
    const plan = env2.internals.createPlanning({}, data);
    assert.equal(plan.farms['592|424'].filter((r) => r.target.coord == '593|423').length, 1);
  });
});

describe('Bericht dem richtigen Angriff zuordnen, 0 Beute lernen', () => {
  // 594|423: Teilbeute um 16:37:49 (Bericht 1096067) mit 0/800; drei Angriffe
  // landen kurz danach, einer später
  const zeroReport = fixture('report_attack_partial.html')
    .replace('</span>67</span>', '</span>0</span>').replace('</span>11</span>', '</span>0</span>').replace('</span>67</span>', '</span>0</span>')
    .replace('145/160', '0/800');
  const T = ts(16, 37, 49);
  const history = {
    '594|423': {
      buildings: exact, lastReport: ts(23, 31, 31, -1), lastFull: true,
      base: { time: ts(23, 31, 31, -1), raw: [300, 270, 270] },
      emptiedAt: ts(14, 20, 0, -1),
      prodMin: 79,
      sent: [
        { arrival: T, capacity: 800, expected: 800 },
        { arrival: T + 428, capacity: 160, expected: 160 },
        { arrival: T + 428, capacity: 160, expected: 160 },
        { arrival: T + 3000, capacity: 160, expected: 160 },
      ],
    },
  };

  test('own = Angriff mit der passenden Ankunft, spätere bleiben in sent', async () => {
    const env = createEnv({ premium: false, history, reports: { 1096067: zeroReport } });
    await tick();
    const data = await env.internals.getData(0, false, false, true, 0);
    assert.equal(data.farms.farms['594|423'].haul.carried, 0);
    const plan = env.internals.createPlanning({}, data);
    const h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'))['594|423'];
    assert.deepEqual(plain(h.sent.map((x) => x.arrival - T)), [428, 428, 3000], 'nur der B-Angriff wurde verbraucht');
    const stats = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_stats'));
    assert.deepEqual(plain(stats.map((s) => [s.expected, s.actual])), [[800, 0]]);
    // 0 Beute in 26 h seit dem Leerräumen -> effektive Produktion 0, Dorf wird nicht geplant
    assert.equal(h.prodMax, 0);
    assert.equal(plan.farms['592|424'].filter((r) => r.target.coord == '594|423').length, 0);
  });

  test('Produktion 0 wird als Wert behandelt, nicht als "unbekannt"', async () => {
    const env = createEnv({ premium: false });
    await tick();
    const m = env.internals.buildModel({ points: 100, coord: '1|1' }, { buildings: exact, prodMax: 0 }, 1.6);
    assert.equal(m.prod.reduce((a, b) => a + b, 0), 0);
    const m2 = env.internals.buildModel({ points: 100, coord: '1|1' }, { prodMax: 0 }, 1.6);
    assert.equal(m2.prod.reduce((a, b) => a + b, 0), 0);
  });
});

describe('Abschlag auf hochgerechnete Produktion (andere farmen mit)', () => {
  test('ohne gelernte effektive Produktion zählt nur contestedFactor der Minenproduktion', async () => {
    // 594|423: leer seit 16:37:49, Minen bekannt (2/2/2 -> 3*35/h * 1.6 = 168/h)
    const run = async (extra) => {
      // 30 LKav, sonst wandern die A-Angriffe als Spender in das B auf 587|430
      const env = createEnv({ premium: false, combinedHtml: withTroops(30), history: { '594|423': Object.assign({ buildings: exact }, extra) } });
      await tick();
      env.internals.RULES.minScorePerSpeed = 30;
      const data = await env.internals.getData(0, false, false, true, 0);
      const plan = env.internals.createPlanning({}, data);
      const row = plan.farms['592|424'].find((r) => r.target.coord == '594|423');
      return { row, R: env.internals.RULES };
    };
    const { row, R } = await run({});
    assert.ok(row, 'Dorf wird angegriffen');
    const hours = (row.arrival - ts(16, 37, 49)) / 3600;
    const full = 168 * hours;
    assert.ok(Math.abs(row.expected - full * R.contestedFactor) < 3, `erwartet ${row.expected}, voll wären ${full}`);

    // mit gelernter effektiver Produktion (prodMax) kein Abschlag mehr
    const learned = await run({ prodMin: 100, prodMax: 100 });
    assert.ok(Math.abs(learned.row.expected - 100 * hours) < 3, 'gelernte Produktion gilt exakt: ' + learned.row.expected);
  });
});
