import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, fixture, tick, serverTimeSeconds } from './setup.js';

const plain = (x) => JSON.parse(JSON.stringify(x));

describe('createPlanning mit echten Fixtures', () => {
  test('Plan: Angriffe auf bekannte Dörfer, Probe auf neue, Beute-Spalte gefüllt', async () => {
    const env = createEnv({ premium: false });
    await tick();
    const data = await env.internals.getData(0, true, false, true, 500);
    const plan = env.internals.createPlanning({}, data);
    const rows = plan.farms['592|424'] || [];

    assert.ok(plan.counter > 0, 'es werden Angriffe geplant');
    assert.equal(rows.length, plan.counter);
    // 10 LKav zu Hause, A = 2 LKav -> höchstens 5 Angriffe
    assert.ok(plan.counter <= 5, 'nicht mehr Angriffe als Truppen: ' + plan.counter);

    const byCoord = Object.fromEntries(rows.map((r) => [r.target.coord, r]));
    const full = byCoord['589|423'];
    assert.ok(full, 'volles Dorf (589|423) wird angegriffen');
    assert.equal(full.loot.known, true);
    assert.equal(full.loot.full, true);
    // Bericht 16:47:03, Serverzeit 17:16:18 -> 29 Minuten her
    assert.equal(Math.round(full.loot.ageMinutes), 29);
    assert.equal(full.loot.isNew, false);

    const scouted = byCoord['593|423'];
    if (scouted) {
      assert.equal(scouted.loot.scouted, true);
      assert.equal(scouted.scouted, true);
    }

    rows.forEach((r) => {
      assert.ok(r.travel > 0, 'Laufzeit > 0 für ' + r.target.coord);
      assert.ok(r.arrival > serverTimeSeconds(env));
      assert.ok(['a', 'b'].includes(r.template.name));
      assert.ok([1125, 1126].includes(r.template.id));
    });
  });

  test('Ohne Spähbericht (Rohstoffzeile "?") läuft die Planung trotzdem', async () => {
    const env = createEnv({ premium: false, reports: { 1093158: '<div>leer</div>', 779302: '<div>leer</div>' } });
    await tick();
    const data = await env.internals.getData(0, false, false, true, 0);
    const plan = env.internals.createPlanning({}, data);
    assert.ok(plan.counter > 0);
  });
});

describe('Kompletter Ablauf: init() -> Tabelle -> Klick', () => {
  test('Tabelle wird gerendert, Klick sendet über den Farm-Assistent-Endpoint und merkt sich den Angriff', async () => {
    const env = createEnv({ settings: { optionGroup: 0, optionNewbarbsMaxPoints: 500 } });
    const { $, window } = env;
    // init() ran at load and waits for unit info + world config
    await tick(50);
    const $icons = $('.farmGod_icon');
    assert.ok($icons.length > 0, 'Tabelle mit Angriffen vorhanden');
    assert.ok($('.farmGodContent').text().includes('voll'), 'Beute-Spalte zeigt voll/nicht voll');
    assert.equal(window.Dialog.shown.length, 0, 'kein Einstellungsdialog nach dem ersten Start');

    const $first = $icons.first();
    const coord = $first.data('coord');
    $first.trigger('click');
    await tick();

    assert.equal(window.posted.length, 1);
    assert.equal(window.posted[0].data.source, 14127);
    assert.equal(window.posted[0].data.target, $first.data('target'));
    assert.ok(window.posted[0].url.includes('ajaxaction=farm'));
    assert.equal($('.farmGod_icon').length, $icons.length - 1, 'Zeile entfernt');

    const history = JSON.parse(window.localStorage.getItem('FarmGodSmart_history'));
    assert.ok(history[coord], 'sent-Eintrag im Gedächtnis');
    assert.equal(history[coord].sent.length, 1);
    assert.equal(history[coord].sent[0].capacity, parseInt($first.data('capacity')));
  });

  test('Enter sendet den ersten Angriff, Enter im Eingabefeld nicht', async () => {
    const env = createEnv({ settings: { optionGroup: 0, optionNewbarbsMaxPoints: 500 } });
    const { $, window } = env;
    await tick(50);
    const n = $('.farmGod_icon').length;
    assert.ok(n > 0);
    $('body').append('<input id="someInput">');
    $('#someInput').trigger($.Event('keydown', { keyCode: 13, target: $('#someInput')[0] }));
    await tick();
    assert.equal(window.posted.length, 0);
    $(window.document).trigger($.Event('keydown', { keyCode: 13 }));
    await tick();
    assert.equal(window.posted.length, 1);
  });

  test('Ohne Premium: nur Fehlermeldung', async () => {
    const env = createEnv({ premium: false });
    await tick(50);
    assert.equal(env.window.messages.error.length, 1);
    assert.equal(env.$('.farmGod_icon').length, 0);
  });
});

describe('Regel 2a: perB-1 A-Angriffe + schwächster anderer Angriff -> ein B', () => {
  const withTroops = (lk) => fixture('overview_combined.html').replace('<td class="unit-item">10</td>', `<td class="unit-item">${lk}</td>`);

  test('12 LKav: 4×A auf das volle gespähte Dorf werden mit dem schwächsten A zu einem B', async () => {
    const env = createEnv({ premium: false, combinedHtml: withTroops(12) });
    await tick();
    const data = await env.internals.getData(0, true, false, true, 500);
    const plan = env.internals.createPlanning({}, data);
    const rows = plain(plan.farms['592|424'].map((r) => `${r.target.coord}:${r.template.name}`).sort());
    // vorher: 594|423:a (65), 589|423:a (72), 4× 587|430:a (640) = 777
    // nachher: 589|423:a (72) + 587|430:b (800) = 872, ein Klick weniger
    assert.deepEqual(rows, ['587|430:b', '589|423:a']);
    assert.equal(plan.counter, 2);
    const b = plan.farms['592|424'].find((r) => r.template.name == 'b');
    assert.equal(b.template.id, 1126);
    assert.equal(b.capacity, 800);
    assert.equal(Math.round(b.expected), 800);
    // alle 12 LKav verplant, keine doppelten Kommandos übrig
    assert.equal(data.commands['587|430'].length, 1);
    assert.equal(data.commands['594|423'].length, 0);
  });

  test('Kein Zusammenlegen, wenn der Gewinn kleiner als der weggefallene Angriff wäre', async () => {
    // Spähbericht des entfernten Dorfes jünger -> Vorrat bei Ankunft nur ~700:
    // B brächte 60 mehr als 4×A, der schwächste andere Angriff bringt 65
    const rows = ['farm_row_scouted.html', 'farm_row_full_loot.html', 'farm_row_partial_loot.html'].map(fixture).join('\n') +
      fixture('farm_row_yesterday.html').replace('gestern um 22:33:33', 'heute um 11:30:00');
    const env = createEnv({ premium: false, rows, combinedHtml: withTroops(12) });
    await tick();
    const data = await env.internals.getData(0, true, false, true, 500);
    const plan = env.internals.createPlanning({}, data);
    const rowsOut = plain(plan.farms['592|424'].map((r) => `${r.target.coord}:${r.template.name}`).sort());
    assert.deepEqual(rowsOut, ['587|430:a', '587|430:a', '587|430:a', '587|430:a', '589|423:a', '594|423:a']);
    assert.equal(plan.counter, 6);
  });
});
