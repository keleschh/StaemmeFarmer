import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, tick } from './setup.js';

// Das Spiel sperrt bei zu vielen Anfragen ("Blockierte Anfrage"). Die
// HTTP-Queue darf deshalb nur wenige Anfragen gleichzeitig laufen lassen
// und muss zwischen zwei Anfragen kurz warten.
describe('HTTP-Queue: Drosselung', () => {
  test('höchstens 2 Anfragen gleichzeitig, Pause zwischen zwei Anfragen', async () => {
    const env = createEnv({ premium: false });
    const twLib = env.window.twLib;
    twLib.delayMs = 40;
    let inFlight = 0;
    let maxInFlight = 0;
    const starts = [];
    const origGet = env.$.get;
    env.$.get = (url) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      starts.push(Date.now());
      return origGet(url).always(() => { inFlight -= 1; });
    };
    const t0 = Date.now();
    await Promise.all([1, 2, 3, 4, 5, 6].map(() => twLib.get('/map/village.txt')));
    const total = Date.now() - t0;
    assert.equal(starts.length, 6);
    assert.ok(maxInFlight <= 2, 'max. 2 gleichzeitig, war ' + maxInFlight);
    // 6 Anfragen auf 2 Bahnen = 3 je Bahn, dazwischen je 2 Pausen von 40 ms
    assert.ok(total >= 70, 'Pausen eingehalten, Dauer ' + total + ' ms');
  });

  test('Fehlschlag wird erst nach einer Wartezeit wiederholt, dann aufgegeben', async () => {
    const env = createEnv({ premium: false });
    const twLib = env.window.twLib;
    twLib.retryDelaysMs = [60, 60];
    const calls = [];
    env.$.get = () => {
      calls.push(Date.now());
      const d = env.$.Deferred();
      setTimeout(() => (calls.length < 2 ? d.reject('429') : d.resolve('ok')), 0);
      return d.promise();
    };
    const result = await twLib.get('/x');
    assert.equal(result, 'ok');
    assert.equal(calls.length, 2);
    assert.ok(calls[1] - calls[0] >= 50, 'Wartezeit vor dem 2. Versuch: ' + (calls[1] - calls[0]) + ' ms');

    // dauerhaft kaputt: 3 Versuche, dann reject
    calls.length = 0;
    env.$.get = () => {
      calls.push(Date.now());
      const d = env.$.Deferred();
      setTimeout(() => d.reject('429'), 0);
      return d.promise();
    };
    await assert.rejects(Promise.resolve(twLib.get('/y')));
    assert.equal(calls.length, 3);
  });
});

describe('Weniger Anfragen pro Lauf', () => {
  test('höchstens 5 Berichte pro Durchlauf', () => {
    const env = createEnv({ premium: false });
    assert.equal(env.internals.RULES.maxReportFetches, 5);
  });

  test('village.txt wird gecacht und erst nach villageListHours neu geladen', async () => {
    const env = createEnv({ premium: false });
    await tick();
    const count = () => env.window.requests.filter((u) => u.includes('village.txt')).length;
    const data1 = await env.internals.getData(0, true, false, true, 500);
    assert.equal(count(), 1);
    const cached = JSON.parse(env.window.localStorage.getItem('FarmGodSmart_villages'));
    assert.ok(cached && cached.time > 0, 'Cache geschrieben');

    // zweiter Lauf: aus dem Cache, gleiche Daten
    const data2 = await env.internals.getData(0, true, false, true, 500);
    assert.equal(count(), 1, 'nicht neu geladen');
    assert.deepEqual(JSON.parse(JSON.stringify(data2.points)), JSON.parse(JSON.stringify(data1.points)));
    assert.deepEqual(JSON.parse(JSON.stringify(data2.newbarbs)), JSON.parse(JSON.stringify(data1.newbarbs)));

    // Cache abgelaufen -> neu laden
    cached.time -= env.internals.RULES.villageListHours * 3600 + 1;
    env.window.localStorage.setItem('FarmGodSmart_villages', JSON.stringify(cached));
    await env.internals.getData(0, true, false, true, 500);
    assert.equal(count(), 2, 'nach Ablauf neu geladen');
  });

  test('Cache nicht schreibbar (Quota) -> trotzdem Daten', async () => {
    const env = createEnv({ premium: false });
    await tick();
    const origSet = env.window.localStorage.setItem.bind(env.window.localStorage);
    env.window.localStorage.setItem = (k, v) => {
      if (k === 'FarmGodSmart_villages') throw new Error('QuotaExceededError');
      return origSet(k, v);
    };
    const data = await env.internals.getData(0, true, false, true, 500);
    assert.ok(Object.keys(data.points).length > 0);
  });
});
