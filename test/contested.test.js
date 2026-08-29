import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, tick, serverTimeSeconds } from './setup.js';

const ts = (h, m, s) => Math.round(new Date(2026, 7, 29, h, m, s).getTime() / 1000);
const plain = (x) => JSON.parse(JSON.stringify(x));

// Andere Spieler farmen dieselben Dörfer. Das Skript merkt das nur über die
// eigenen Beuteberichte - und die müssen unabhängig davon zählen, von welchem
// Gerät (oder von Hand) der Angriff geschickt wurde.
describe('Mitgefarmte Dörfer: aus jeder Teilbeute lernen', () => {
  test('Teilbeute ohne sent-Eintrag: Bericht wird geladen, effektive Produktion gelernt', async () => {
    // 594|423: Teilbeute 145/160 um 16:37:49, zuletzt leer um 12:37:49 (4 h) -> 36,25/h
    const history = {
      '594|423': { emptiedAt: ts(12, 37, 49), base: { time: ts(12, 37, 49), raw: [0, 0, 0] }, lastReport: ts(12, 37, 49) },
    };
    const env = createEnv({ premium: false, history });
    await tick();
    const data = await env.internals.getData(0, false, false, true, 0);
    const reqs = env.window.requests;
    assert.equal(reqs.filter((u) => u.includes('view=1096067')).length, 1, 'Teilbericht geladen');
    assert.equal(reqs.filter((u) => u.includes('view=1099410')).length, 0, 'voller Bericht ohne sent nicht nötig');
    env.internals.createPlanning({}, data);
    const h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'))['594|423'];
    assert.equal(Math.round(h.prodMin * 100) / 100, 36.25);
    assert.equal(h.prodMax, h.prodMin);
    assert.equal(h.emptiedAt, ts(16, 37, 49));
  });

  test('laufende Angriffe aus der Befehlsübersicht landen im Gedächtnis (einmal)', async () => {
    const env = createEnv({ premium: false });
    await tick();
    await env.internals.getData(0, false, false, true, 0);
    let h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'));
    assert.deepEqual(plain(h['589|423'].sent), [{ arrival: ts(17, 22, 56), capacity: 160 }]);
    await env.internals.getData(0, false, false, true, 0);
    h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'));
    assert.equal(h['589|423'].sent.length, 1, 'kein Duplikat');
  });

  test('gelernte Produktionsgrenzen verfallen nach learnedRateDays ohne neuen Bericht', async () => {
    const env = createEnv({ premium: false });
    await tick();
    const now = serverTimeSeconds(env);
    const days = env.internals.RULES.learnedRateDays;
    env.internals.saveHistory({
      '700|700': { prodMin: 30, prodMax: 30, lastReport: now - (days + 1) * 86400 },
      '701|701': { prodMin: 30, prodMax: 30, lastReport: now - (days - 1) * 86400 },
    });
    env.internals.learnFromReports({}, now, 160, 1);
    const h = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_history'));
    assert.equal(h['700|700'].prodMin, undefined);
    assert.equal(h['700|700'].prodMax, undefined);
    assert.equal(h['701|701'].prodMin, 30);
  });
});
