import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createKonterEnv, settleKonter, fixture, tick, UNITS } from './konter-setup.js';

const plain = (x) => JSON.parse(JSON.stringify(x));

describe('Konter.js Skelett', () => {
  test('exportiert init, RULES und _internals', () => {
    const env = createKonterEnv({ noTable: true });
    assert.equal(typeof env.konter.init, 'function');
    assert.deepEqual(plain(env.konter.RULES.offUnits), ['axe', 'light', 'marcher', 'ram', 'catapult', 'knight']);
    assert.deepEqual(plain(env.konter.RULES.restUnits), ['spear', 'sword', 'archer', 'spy', 'heavy']);
    assert.equal(env.konter.RULES.cancelWindowMin, 10);
    assert.equal(env.konter.RULES.cancelMarginSec, 30);
    assert.equal(typeof env.internals, 'object');
  });
  test('falsche Seite: Fehlermeldung, keine Tabelle', async () => {
    const env = createKonterEnv({ noTable: true });
    await settleKonter(env);
    assert.equal(env.messages.error.length, 1);
    assert.match(env.messages.error[0], /Eingehende Angriffe/);
    assert.equal(env.$('.konterContent').length, 0);
  });
});
