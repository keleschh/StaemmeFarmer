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

describe('Konter Parser', () => {
  const env = createKonterEnv({ noTable: true });
  const { $, internals } = env;
  const ms = (d, h, m, s) => new Date(2026, 8, d, h, m, s).getTime();

  test('serverNow aus #serverDate/#serverTime', () => {
    assert.equal(internals.serverNow(), ms(23, 9, 42, 2));
  });
  test('parseArrival heute / morgen / am dd.mm.', () => {
    assert.equal(internals.parseArrival('heute um 09:55:39'), ms(23, 9, 55, 39));
    assert.equal(internals.parseArrival('morgen um 00:10:00'), ms(24, 0, 10, 0));
    assert.equal(internals.parseArrival('am 25.09. um 18:00:05'), ms(25, 18, 0, 5));
    assert.equal(internals.parseArrival('—'), 0);
  });
  test('parseIncomings liest die HP20-Zeile', () => {
    const $table = $('<div>' + fixture('konter/incomings_table.html') + '</div>').find('#incomings_table');
    const list = plain(internals.parseIncomings($table));
    assert.equal(list.length, 1);
    const a = list[0];
    assert.equal(a.commandId, 655074211);
    assert.equal(a.villageId, 391);
    assert.deepEqual(a.villageCoord, { x: 483, y: 516 });
    assert.equal(a.originId, 310);
    assert.equal(a.originName, "Aaronboy9449's Dorf (484|513) K54");
    assert.deepEqual(a.originCoord, { x: 484, y: 513 });
    assert.equal(a.player, 'Aaronboy9449');
    assert.equal(a.distance, 3.2);
    assert.equal(a.arrivalText, 'heute um 09:55:39');
    assert.equal(a.arrival, ms(23, 9, 55, 39));
    assert.equal(a.slowestUnit, 'catapult');
  });
  test('parseIncomings ohne Einheiten-Icon: slowestUnit null', () => {
    const html = fixture('konter/incomings_table.html').replace(/<img src="[^"]*unit\/tiny\/catapult\.webp"[^>]*>/, '');
    const $table = $('<div>' + html + '</div>').find('#incomings_table');
    assert.equal(internals.parseIncomings($table)[0].slowestUnit, null);
  });
  test('parseHomeUnits liest data-all-count', () => {
    const $page = $('<div>' + fixture('konter/place_form_prefilled.html') + '</div>');
    assert.deepEqual(plain(internals.parseHomeUnits($page)), {
      spear: 21, sword: 30, axe: 1340, spy: 79, light: 449, heavy: 0, ram: 30, catapult: 25, knight: 1, snob: 0,
    });
  });
});

describe('Konter Planung', () => {
  const env = createKonterEnv({ noTable: true });
  const { $, internals } = env;
  const home = { spear: 21, sword: 30, axe: 1340, spy: 79, light: 449, heavy: 0, ram: 30, catapult: 25, knight: 1, snob: 0 };

  test('splitUnits: Off / Rest nur mit Einheiten der Welt und > 0', () => {
    const { off, rest } = plain(internals.splitUnits(home, UNITS));
    assert.deepEqual(off, { axe: 1340, light: 449, ram: 30, catapult: 25, knight: 1 });
    assert.deepEqual(rest, { spear: 21, sword: 30, spy: 79 });
  });
  test('splitUnits: AG bleibt immer zu Hause', () => {
    const { off, rest } = plain(internals.splitUnits(Object.assign({}, home, { snob: 2 }), UNITS));
    assert.equal(off.snob, undefined);
    assert.equal(rest.snob, undefined);
  });
  test('placeUrl baut die verifizierte URL-Form', () => {
    assert.equal(
      internals.placeUrl(391, { x: 484, y: 513 }, { axe: 1340, light: 449, ram: 30 }),
      '/game.php?village=391&screen=place&x=484&y=513&from=simulator&att_axe=1340&att_light=449&att_ram=30'
    );
  });
  test('planFor: URLs, Zeiten und Landung', async () => {
    const unitInfo = await new Promise((res) => internals.ensureUnitInfo().then(res));
    const $table = $('<div>' + fixture('konter/incomings_table.html') + '</div>').find('#incomings_table');
    const attack = internals.parseIncomings($table)[0];
    const now = internals.serverNow();
    const p = internals.planFor(attack, home, unitInfo, now);
    assert.equal(p.urlOff, '/game.php?village=391&screen=place&x=484&y=513&from=simulator&att_axe=1340&att_light=449&att_ram=30&att_catapult=25&att_knight=1');
    assert.equal(p.urlRest, '/game.php?village=391&screen=place&x=484&y=513&from=simulator&att_spear=21&att_sword=30&att_spy=79');
    assert.equal(p.sendFrom, attack.arrival - 10 * 60000);
    assert.equal(p.cancelBefore, attack.arrival - 30000);
    // Entfernung aus den Koordinaten (483|516 -> 484|513), langsamste Off-Einheit = Katapult
    const dist = Math.hypot(1, 3);
    assert.equal(p.landsAt, Math.round(now + dist * unitInfo.catapult.speed * 60000));
  });
  test('planFor ohne Off: kein Konter-Link, keine Landung', () => {
    const $table = $('<div>' + fixture('konter/incomings_table.html') + '</div>').find('#incomings_table');
    const attack = internals.parseIncomings($table)[0];
    const p = internals.planFor(attack, { spear: 5, axe: 0 }, {}, internals.serverNow());
    assert.equal(p.urlOff, null);
    assert.equal(p.landsAt, null);
    assert.match(p.urlRest, /att_spear=5$/);
  });
});
