// Konter.js – Ausweichen und Konter bei eingehenden Angriffen (Die Stämme)
//
// Start: Übersicht "Eingehende Angriffe" öffnen und in der Schnellleiste
//   javascript: $.getScript('https://keleschh.github.io/StaemmeFarmer/Konter.js');
//
// Das Skript zeigt über der Spieltabelle je eingehendem Angriff eine Zeile mit
//   - dem Angreifer (Spieler + Herkunftsdorf), Ankunftszeit und Restzeit,
//   - der langsamsten Einheit laut Spiel (wenn der Angriff markiert ist),
//   - den Off-Truppen, die im angegriffenen Dorf zu Hause sind,
//   - Link "Konter (Off)": öffnet den Versammlungsplatz des angegriffenen Dorfs mit dem
//     Herkunftsdorf des Angreifers als Ziel und der vollen Off eingetragen
//     (Axt, LKav, Berittene Bogenschützen, Rammen, Katapulte, Paladin – was es auf der Welt gibt),
//   - Link "Rest rausschicken": dasselbe mit dem Rest (Speer, Schwert, Bogen, Späher, SKav)
//     für den Abbrechen-Trick, dazu "senden ab" (Ankunft − 10 min, sonst ist der Befehl
//     beim Einschlag nicht mehr abbrechbar) und "abbrechen vor" (Ankunft − 30 s).
// Adelsgeschlechter und Miliz bleiben immer zu Hause. Die Zahlen lassen sich im
// Formular vor dem Klick auf "Angreifen" ändern.
//
// Das Skript sendet nichts: "Angreifen" und "Bestätigen" bleiben deine Klicks, ebenso das
// Abbrechen in der Befehlsübersicht (das Spiel erlaubt es nur 10 Minuten nach dem Senden).
// Anfragen ans Spiel: einmal die Einheitendaten (gecacht in localStorage "Konter_unitInfo")
// und je angegriffenem Dorf einmal der Versammlungsplatz (Truppen zu Hause).

if (typeof ScriptAPI !== 'undefined') ScriptAPI.register('Konter', true, 'keleschh', '');

window.Konter = (function () {
  const RULES = {
    // Konter: alles davon, was zu Hause ist (nur Einheiten, die es auf der Welt gibt)
    offUnits: ['axe', 'light', 'marcher', 'ram', 'catapult', 'knight'],
    // "Rest rausschicken": alles davon, was zu Hause ist
    restUnits: ['spear', 'sword', 'archer', 'spy', 'heavy'],
    // Spielregel: ein Befehl ist nur 10 Minuten nach dem Senden abbrechbar
    cancelWindowMin: 10,
    // "abbrechen vor" = Ankunft minus diese Sicherheit
    cancelMarginSec: 30,
  };

  const messages = {
    wrongScreen: 'Konter: bitte die Übersicht "Eingehende Angriffe" öffnen (Übersichten → Eingehend → Angriffe) und das Skript dort starten.',
    noAttacks: 'Konter: zurzeit keine eingehenden Angriffe.',
    blocked: 'Konter: das Spiel hat die Anfrage blockiert ("zu viele Anfragen"). Ein paar Minuten warten und neu starten.',
    failed: 'Konter: Truppen konnten nicht geladen werden. Seite neu laden und nochmal starten.',
  };

  // ---- Zeit ----
  const serverDateParts = function () {
    return $('#serverDate').text().trim().split(/[\/.\-]/).map(Number); // [dd, mm, yyyy]
  };

  const serverNow = function () {
    const d = serverDateParts();
    const t = $('#serverTime').text().trim().split(':').map(Number);
    return new Date(d[2], d[1] - 1, d[0], t[0], t[1], t[2] || 0).getTime();
  };

  // "heute um 09:55:39" / "morgen um …" / "am 25.09. um …" -> ms, 0 wenn keine Uhrzeit
  const parseArrival = function (text) {
    const clock = String(text).match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (!clock) return 0;
    const d = serverDateParts();
    const lower = String(text).toLowerCase();
    const dayMonth = String(text).match(/(\d{1,2})\.(\d{1,2})\./);
    let date = new Date(d[2], d[1] - 1, d[0], +clock[1], +clock[2], +clock[3]);
    if (/morgen|tomorrow/.test(lower)) {
      date.setDate(date.getDate() + 1);
    } else if (dayMonth && !/heute|today/.test(lower)) {
      date = new Date(d[2], +dayMonth[2] - 1, +dayMonth[1], +clock[1], +clock[2], +clock[3]);
    }
    return date.getTime();
  };

  // ---- Übersicht "Eingehende Angriffe" ----
  const coordOf = function (text) {
    const m = String(text).match(/(\d{1,3})\|(\d{1,3})/);
    return m ? { x: +m[1], y: +m[2] } : null;
  };

  const parseIncomings = function ($table) {
    const list = [];
    $table.find('tr').each((i, tr) => {
      const $td = $(tr).children('td');
      if ($td.length < 7) return; // Kopf- und Fußzeile
      const $target = $td.eq(1).find('a').first();
      const $origin = $td.eq(2).find('a').first();
      const idIn = (href, key) => {
        const m = String(href || '').match(new RegExp(key + '=(\\d+)'));
        return m ? +m[1] : 0;
      };
      const icon = String($td.eq(0).find('img[src*="/unit/tiny/"]').attr('src') || '').match(/tiny\/(\w+)\./);
      const cmd = String($td.eq(0).find('input[name^="command_ids"]').attr('name') || '').match(/\d+/);
      list.push({
        commandId: cmd ? +cmd[0] : 0,
        villageId: idIn($target.attr('href'), 'village'),
        villageName: $target.text().trim(),
        villageCoord: coordOf($target.text()),
        originId: idIn($origin.attr('href'), 'id'),
        originName: $origin.text().trim(),
        originCoord: coordOf($origin.text()),
        player: $td.eq(3).text().trim(),
        distance: parseFloat($td.eq(4).text()) || 0,
        arrivalText: $td.eq(5).text().trim(),
        arrival: parseArrival($td.eq(5).text()),
        slowestUnit: icon ? icon[1] : null,
      });
    });
    return list;
  };

  // ---- Versammlungsplatz: Truppen zu Hause ----
  const parseHomeUnits = function ($page) {
    const home = {};
    $page.find('input[id^="unit_input_"]').each((i, el) => {
      home[el.id.replace('unit_input_', '')] = parseInt($(el).attr('data-all-count')) || 0;
    });
    return home;
  };

  const init = function () {
    if (!$('#incomings_table').length) {
      UI.ErrorMessage(messages.wrongScreen);
      return;
    }
  };

  return { init, RULES, _internals: { messages, serverNow, parseArrival, parseIncomings, parseHomeUnits } };
})();

window.Konter.init();
