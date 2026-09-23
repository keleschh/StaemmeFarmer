import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createKonterEnv, settleKonter, fixture, tick, UNITS } from './konter-setup.js';

const plain = (x) => JSON.parse(JSON.stringify(x));

describe('Konter.js Skelett', () => {
  test('exportiert init, RULES und _internals', () => {
    const env = createKonterEnv({ noTable: true });
    assert.equal(typeof env.konter.init, 'function');
    assert.deepEqual(plain(env.konter.RULES.offUnits), ['axe', 'light', 'marcher', 'ram', 'catapult', 'knight']);
    assert.deepEqual(plain(env.konter.RULES.neverUnits), ['snob', 'militia']);
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
  test('parseIncomings überspringt Unterstützungen (kein Angriffs-Icon)', () => {
    const html = fixture('konter/incomings_table.html').replace('command/attack.webp', 'command/support.webp');
    const $table = $('<div>' + html + '</div>').find('#incomings_table');
    assert.equal(internals.parseIncomings($table).length, 0);
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

  test('splitUnits: Off nur Off-Einheiten, Ausweichen alle Truppen der Welt mit > 0', () => {
    const { off, dodge } = plain(internals.splitUnits(home, UNITS));
    assert.deepEqual(off, { axe: 1340, light: 449, ram: 30, catapult: 25, knight: 1 });
    assert.deepEqual(dodge, { spear: 21, sword: 30, axe: 1340, spy: 79, light: 449, ram: 30, catapult: 25, knight: 1 });
  });
  test('splitUnits: AG und Miliz bleiben immer zu Hause', () => {
    const { off, dodge } = plain(internals.splitUnits(Object.assign({}, home, { snob: 2, militia: 40 }), UNITS.concat('militia')));
    assert.equal(off.snob, undefined);
    assert.equal(dodge.snob, undefined);
    assert.equal(dodge.militia, undefined);
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
    assert.equal(p.urlDodge, '/game.php?village=391&screen=place&x=484&y=513&from=simulator&att_spear=21&att_sword=30&att_axe=1340&att_spy=79&att_light=449&att_ram=30&att_catapult=25&att_knight=1');
    assert.equal(p.sendFrom, attack.arrival - 10 * 60000);
    assert.equal(p.cancelBefore, attack.arrival - 30000);
    // gesendet bei "senden ab", abgebrochen bei "abbrechen vor" -> zurück nach derselben Zeit nochmal
    assert.equal(p.backAt, p.cancelBefore + (p.cancelBefore - p.sendFrom));
    // seine Kata-Truppen sind frühestens Ankunft + Laufzeit wieder daheim
    assert.equal(p.enemyHomeAt, Math.round(attack.arrival + Math.hypot(1, 3) * unitInfo.catapult.speed * 60000));
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
    assert.equal(p.enemyHomeAt, null);
    assert.match(p.urlDodge, /att_spear=5$/);
  });
});

describe('Konter Ablauf', () => {
  test('rendert je Angriff eine Zeile mit Konter- und Rest-Link', async () => {
    const env = createKonterEnv();
    await settleKonter(env);
    const { $ } = env;
    assert.equal(env.messages.error.length, 0);
    const $rows = $('.konterContent table tbody tr');
    assert.equal($rows.length, 1);
    const $off = $rows.find('a.konter-off');
    const $dodge = $rows.find('a.konter-dodge');
    assert.equal($off.attr('href'), '/game.php?village=391&screen=place&x=484&y=513&from=simulator&att_axe=1340&att_light=449&att_ram=30&att_catapult=25&att_knight=1');
    assert.equal($dodge.attr('href'), '/game.php?village=391&screen=place&x=484&y=513&from=simulator&att_spear=21&att_sword=30&att_axe=1340&att_spy=79&att_light=449&att_ram=30&att_catapult=25&att_knight=1');
    const text = $rows.text();
    assert.match(text, /Aaronboy9449/);
    assert.match(text, /09:55:39/);
    assert.match(text, /1340 Axt/);
    assert.match(text, /senden ab 09:45:39/);
    assert.match(text, /abbrechen vor 09:55:09/);
    assert.match(text, /zurück ca\. 10:04:39/);
    assert.match(text, /seine Truppen frühestens zurück \d{2}:\d{2}:\d{2}/);
    assert.match(text, /landet ca\. \d{2}:\d{2}:\d{2}/);
    // Tabelle steht vor der Spieltabelle
    assert.equal($('.konterContent').next().attr('id'), 'incomings_table');
    // ein Versammlungsplatz-Aufruf je Dorf, Einheitendaten einmal
    assert.equal(env.window.requests.filter((u) => u.includes('screen=place')).length, 1);
    assert.equal(env.window.requests.filter((u) => u.includes('get_unit_info')).length, 1);
  });
  test('Ausweichen zu früh: Hinweis "noch nicht senden"', async () => {
    const env = createKonterEnv({ serverTime: '9:30:00' });
    await settleKonter(env);
    assert.match(env.$('.konterContent').text(), /noch nicht senden/);
  });
  test('zwei Angriffe auf dasselbe Dorf: zwei Zeilen, ein Versammlungsplatz-Aufruf', async () => {
    const one = fixture('konter/incomings_table.html');
    const row = one.match(/<tr style="white-space:nowrap"[\s\S]*?<\/tr>/)[0];
    const second = row.replace(/655074211/g, '655074212').replace('09:55:39', '10:05:00').replace('id=310', 'id=311').replace(/\(484\|513\)/g, '(480|520)');
    const env = createKonterEnv({ incomingsHtml: one.replace(row, row + second) });
    await settleKonter(env);
    assert.equal(env.$('.konterContent table tbody tr').length, 2);
    assert.equal(env.window.requests.filter((u) => u.includes('screen=place')).length, 1);
    assert.match(env.$('.konterContent a.konter-off').eq(1).attr('href'), /x=480&y=520/);
  });
  test('keine Angriffe: Hinweis, keine Tabelle', async () => {
    const one = fixture('konter/incomings_table.html');
    const row = one.match(/<tr style="white-space:nowrap"[\s\S]*?<\/tr>/)[0];
    const env = createKonterEnv({ incomingsHtml: one.replace(row, '') });
    await settleKonter(env);
    assert.equal(env.messages.info.length, 1);
    assert.equal(env.$('.konterContent').length, 0);
  });
  test('Sperrseite beim Versammlungsplatz: Meldung statt Tabelle', async () => {
    const env = createKonterEnv({ blockedPlace: true });
    await settleKonter(env);
    assert.equal(env.messages.error.length, 1);
    assert.match(env.messages.error[0], /blockiert/);
    assert.equal(env.$('.konterContent').length, 0);
  });
  test('zweiter Start ersetzt die Tabelle statt sie zu verdoppeln', async () => {
    const env = createKonterEnv();
    await settleKonter(env);
    env.konter.init();
    await tick(100);
    assert.equal(env.$('.konterContent').length, 1);
  });
});
