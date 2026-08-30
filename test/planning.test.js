import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, fixture, tick, settle, serverTimeSeconds } from './setup.js';

const plain = (x) => JSON.parse(JSON.stringify(x));
const ts = (h, m, s) => Math.round(new Date(2026, 7, 29, h, m, s).getTime() / 1000);

describe('createPlanning mit echten Fixtures', () => {
  test('Plan: Angriffe auf bekannte Dörfer, Probe auf neue, Beute-Spalte gefüllt', async () => {
    // 30 LKav, damit neben dem vollen gespähten Dorf (587|430 -> B) auch die kleinen dran sind
    const combinedHtml = fixture('overview_combined.html').replace('<td class="unit-item">10</td>', '<td class="unit-item">30</td>');
    const env = createEnv({ premium: false, combinedHtml });
    await tick();
    env.internals.RULES.minScorePerSpeed = 30; // kleine Fixture-Dörfer
    const data = await env.internals.getData(0, true, false, true, 500);
    const plan = env.internals.createPlanning({}, data);
    const rows = plan.farms['592|424'] || [];

    assert.ok(plan.counter > 0, 'es werden Angriffe geplant');
    assert.equal(rows.length, plan.counter);

    const byCoord = Object.fromEntries(rows.map((r) => [r.target.coord, r]));
    const full = byCoord['589|423'];
    assert.ok(full, 'volles Dorf (589|423) wird angegriffen');
    assert.equal(full.loot.known, true);
    assert.equal(full.loot.full, true);
    // Bericht 16:47:03, Serverzeit 17:16:18 -> 29 Minuten her
    assert.equal(Math.round(full.loot.ageMinutes), 29);
    assert.equal(full.loot.isNew, false);

    const scouted = byCoord['587|430'];
    assert.ok(scouted, 'gespähtes volles Dorf wird angegriffen');
    assert.equal(scouted.loot.scouted, true);
    // Spähbericht 19 h alt, aber Gebäude exakt bekannt -> ein volles B
    assert.equal(scouted.template.name, 'b');

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
    const combinedHtml = fixture('overview_combined.html').replace('<td class="unit-item">10</td>', '<td class="unit-item">30</td>');
    // 589|423 mit gelernter Produktion, damit es trotz Abschlag geplant wird ("voll (29min her)")
    const env = createEnv({ settings: { optionGroup: 0, optionNewbarbsMaxPoints: 500 }, combinedHtml, history: { '589|423': { prodMin: 300, prodMax: 300 } } });
    const { $, window } = env;
    // init() ran at load and waits for unit info + world config
    await settle(env);
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
    const mine = history[coord].sent.filter((x) => typeof x.expected === 'number');
    assert.equal(mine.length, 1, 'genau ein eigener Eintrag (laufende Angriffe haben kein expected)');
    assert.equal(mine[0].capacity, parseInt($first.data('capacity')));
  });

  test('Enter sendet den ersten Angriff, Enter im Eingabefeld nicht', async () => {
    const env = createEnv({ settings: { optionGroup: 0, optionNewbarbsMaxPoints: 500 } });
    const { $, window } = env;
    await settle(env);
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
    await settle(env);
    assert.equal(env.window.messages.error.length, 1);
    assert.equal(env.$('.farmGod_icon').length, 0);
  });
});

describe('Vorlage B nur bei bekanntem Vorrat oder gelernter Produktion', () => {
  const withTroops = (lk) => fixture('overview_combined.html').replace('<td class="unit-item">10</td>', `<td class="unit-item">${lk}</td>`);

  test('perB-1 A-Angriffe + schwächster anderer Angriff -> ein B, wenn die effektive Produktion bekannt ist', async () => {
    // 587|430: Gebäude bekannt, effektive Produktion 60/h aus einer Teilbeute gelernt, Zeile zeigt
    // 163/850/163 (beobachtet) -> Vorrat ~726: 4×A (640) + der 5. A geht nach 594|423 ->
    // Spender-Regel macht ein B (726) daraus. (Bericht nicht laden: frische Spähdaten würden
    // die gelernte Produktion ersetzen.)
    const exact = { main: 1, place: 1, wood: 2, stone: 1, iron: 1, farm: 2, storage: 1, hide: 1 };
    const env = createEnv({ premium: false, combinedHtml: withTroops(10), history: { '587|430': { prodMin: 60, prodMax: 60, buildings: exact } } });
    await tick();
    env.internals.RULES.minScorePerSpeed = 30;
    env.internals.RULES.maxReportFetches = 0;
    const data = await env.internals.getData(0, true, false, true, 500);
    const plan = env.internals.createPlanning({}, data);
    const rows = plain(plan.farms['592|424'].map((r) => `${r.target.coord}:${r.template.name}`).sort());
    assert.deepEqual(rows, ['587|430:b']);
    const b = plan.farms['592|424'][0];
    assert.ok(b.expected > 700 && b.expected <= 800, 'B mit dem gelernten Vorrat: ' + b.expected);
    assert.equal(data.commands['594|423'].length, 0, 'Spender-Angriff entfernt');
  });

  test('gespähte Gebäude reichen für ein B, ungespähte Dörfer bekommen nur A', async () => {
    const env = createEnv({ premium: false, combinedHtml: withTroops(12) });
    await tick();
    env.internals.RULES.minScorePerSpeed = 30;
    const data = await env.internals.getData(0, true, false, true, 500);
    const plan = env.internals.createPlanning({}, data);
    const on587 = plan.farms['592|424'].filter((r) => r.target.coord == '587|430');
    assert.equal(on587.length, 1);
    assert.equal(on587[0].template.name, 'b');
    plan.farms['592|424']
      .filter((r) => r.target.coord != '587|430')
      .forEach((r) => assert.equal(r.template.name, 'a', 'nur A auf ' + r.target.coord));
  });

  test('bekannter Vorrat (Zeilenzahlen, Gebäude gespäht): mehrere A werden zu B', async () => {
    const rows = fixture('farm_row_scouted.html').replace(/<span class="res">\d+<\/span>/g, '<span class="res">900</span>');
    const exact = { main: 1, place: 1, wood: 2, stone: 1, iron: 1, farm: 2, storage: 1, hide: 1 };
    const env = createEnv({ premium: false, rows, combinedHtml: withTroops(12), history: { '593|423': { buildings: exact } } });
    await tick();
    env.internals.RULES.maxReportFetches = 0;
    const data = await env.internals.getData(0, false, false, true, 0);
    const plan = env.internals.createPlanning({}, data);
    const on593 = plan.farms['592|424'].filter((r) => r.target.coord == '593|423');
    assert.ok(on593.some((r) => r.template.name == 'b'), 'ein B dabei: ' + JSON.stringify(plain(on593.map((r) => r.template.name))));
  });
});

describe('Mehrere Herkunftsdörfer: globale Zuweisung', () => {
  // zweites Dorf [002] (592|416), 8 Felder nördlich, steht in der Übersicht VOR [001]
  const twoVillages = (lk) => {
    const html = fixture('overview_combined.html').replace('<td class="unit-item">10</td>', `<td class="unit-item">${lk}</td>`);
    const start = html.indexOf('<tr class="nowrap selected  row_a">');
    const end = html.indexOf('</tr>', start) + 5;
    const row = html.slice(start, end);
    const other = row.replace(/14127/g, '14128').replace(/\[001\]/g, '[002]').replace('(592|424)', '(592|416)');
    return html.slice(0, start) + other + row + html.slice(start);
  };

  test('das nähere Dorf bekommt das einzige lohnende Ziel, nicht das erste in der Liste', async () => {
    // nur 594|423 (Teilbeute 16:37:49, 2.2 Felder von [001], 7.3 von [002]); je 2 LKav.
    // Effektive Produktion 55/h bekannt: [001] kommt nach 0,9 h auf ~48 Beute = Score ~100,
    // [002] nach 1,4 h auf ~77 = Score ~50 < 60 -> nur Fallback
    const history = { '594|423': { prodMin: 55, prodMax: 55, emptiedAt: ts(16, 37, 49), lastReport: ts(16, 37, 49), base: { time: ts(16, 37, 49), raw: [0, 0, 0], observed: true } } };
    const env = createEnv({ premium: false, rows: fixture('farm_row_partial_loot.html'), combinedHtml: twoVillages(2), history });
    await tick();
    const data = await env.internals.getData(0, false, false, true, 0);
    assert.deepEqual(Object.keys(data.villages).sort(), ['592|416', '592|424']);
    const plan = env.internals.createPlanning({}, data);
    // [001] bekommt den regulären Angriff; [002] höchstens einen Fallback-Angriff
    // (Regel 'best': ein Angriff pro Dorf ohne Ziel), der später ankommt
    const near = plan.farms['592|424'];
    assert.equal(near.length, 1);
    assert.equal(near[0].target.coord, '594|423');
    assert.equal(near[0].fallback, false);
    const far = plan.farms['592|416'] || [];
    assert.ok(far.length <= 1);
    if (far.length) {
      assert.equal(far[0].fallback, true);
      assert.ok(far[0].arrival > near[0].arrival);
    }
  });

  test('beide Dörfer werden versorgt, das nähere mit dem besseren Score', async () => {
    const env = createEnv({ premium: false, combinedHtml: twoVillages(2) });
    await tick();
    const data = await env.internals.getData(0, true, false, true, 500);
    const plan = env.internals.createPlanning({}, data);
    assert.equal(plan.counter, 2);
    assert.equal(plan.farms['592|424'].length, 1);
    assert.equal(plan.farms['592|416'].length, 1);
    assert.ok(plan.farms['592|424'][0].score >= plan.farms['592|416'][0].score);
    // jede Zeile trägt ihr eigenes Herkunftsdorf
    assert.equal(plan.farms['592|416'][0].origin.id, 14128);
    assert.equal(plan.farms['592|424'][0].origin.id, 14127);
  });

  test('Dörfer ohne Bericht: der beste Angriff geht vom näheren Dorf aus', async () => {
    // Ziele nur graue Dörfer ohne Bericht (gleiche Punkte-Schätzung für beide Herkunftsdörfer)
    const env = createEnv({ premium: false, rows: '', combinedHtml: twoVillages(2) });
    await tick();
    const data = await env.internals.getData(0, true, false, true, 500);
    const plan = env.internals.createPlanning({}, data);
    const all = Object.values(plan.farms).flat().sort((a, b) => b.score - a.score);
    assert.equal(all.length, 2);
    const best = all[0];
    const other = best.origin.coord === '592|424' ? '592|416' : '592|424';
    assert.ok(env.lib.getDistance(best.origin.coord, best.target.coord) <= env.lib.getDistance(other, best.target.coord));
    assert.notEqual(all[0].origin.coord, all[1].origin.coord);
  });
});
