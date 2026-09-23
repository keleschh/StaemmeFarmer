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

// Registrierung beim Spiel; darf das Skript nie stoppen (das Spiel wirft z. B. bei leerer Kontaktangabe)
try {
  if (typeof ScriptAPI !== 'undefined') ScriptAPI.register('Konter', true, 'keleschh', 'keleschh@users.noreply.github.com');
} catch (e) {
  console.log('Konter: ScriptAPI.register fehlgeschlagen', e);
}

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
      // nur Angriffe (die Übersicht kann auch Unterstützungen listen)
      if (!$td.eq(0).find('img[src*="command/attack"]').length) return;
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

  // ---- Einheitendaten (Laufzeit je Feld in Minuten) ----
  const UNIT_INFO_KEY = 'Konter_unitInfo';

  const ensureUnitInfo = function () {
    const cached = JSON.parse(localStorage.getItem(UNIT_INFO_KEY) || 'null');
    if (cached) return $.Deferred().resolve(cached).promise();
    return $.get('/interface.php?func=get_unit_info').then((xml) => {
      const info = {};
      $(xml).find('config').children().each((i, el) => {
        info[$(el).prop('nodeName')] = { speed: parseFloat($(el).find('speed').text()) };
      });
      try { localStorage.setItem(UNIT_INFO_KEY, JSON.stringify(info)); } catch (e) { /* Quota: dann ohne Cache */ }
      return info;
    });
  };

  // ---- Planung ----
  const pick = function (home, names, worldUnits) {
    const out = {};
    names.forEach((u) => {
      if (worldUnits.indexOf(u) !== -1 && home[u] > 0) out[u] = home[u];
    });
    return out;
  };

  const splitUnits = function (home, worldUnits) {
    return {
      off: pick(home, RULES.offUnits, worldUnits),
      rest: pick(home, RULES.restUnits, worldUnits),
    };
  };

  // Verifiziert (HP20, 23.09.2026): nur x/y + from=simulator + att_* füllt Ziel UND Truppen.
  const placeUrl = function (villageId, coord, units) {
    let url = '/game.php?village=' + villageId + '&screen=place&x=' + coord.x + '&y=' + coord.y + '&from=simulator';
    for (const u in units) if (units[u] > 0) url += '&att_' + u + '=' + units[u];
    return url;
  };

  const planFor = function (attack, home, unitInfo, nowMs) {
    const worldUnits = (window.game_data && game_data.units) || Object.keys(home);
    const { off, rest } = splitUnits(home, worldUnits);
    const hasOff = Object.keys(off).length > 0;
    const hasRest = Object.keys(rest).length > 0;
    const dist = attack.villageCoord && attack.originCoord
      ? Math.hypot(attack.villageCoord.x - attack.originCoord.x, attack.villageCoord.y - attack.originCoord.y)
      : attack.distance;
    let slowest = 0;
    for (const u in off) if (unitInfo && unitInfo[u] && unitInfo[u].speed > slowest) slowest = unitInfo[u].speed;
    return {
      attack,
      off,
      rest,
      urlOff: hasOff && attack.originCoord ? placeUrl(attack.villageId, attack.originCoord, off) : null,
      urlRest: hasRest && attack.originCoord ? placeUrl(attack.villageId, attack.originCoord, rest) : null,
      landsAt: hasOff && slowest ? Math.round(nowMs + dist * slowest * 60000) : null,
      sendFrom: attack.arrival - RULES.cancelWindowMin * 60000,
      cancelBefore: attack.arrival - RULES.cancelMarginSec * 1000,
    };
  };

  // ---- Anfragen ----
  const isBlocked = function (body) {
    return typeof body === 'string' &&
      (/Blockierte Anfrage|zu viele Anfragen|Blocked request|too many requests/i.test(body) ||
        /<input[^>]+type=["']?password/i.test(body));
  };

  const fetchHomeUnits = function (villageId) {
    return $.get('/game.php?village=' + villageId + '&screen=place').then((html) => {
      if (isBlocked(html)) return $.Deferred().reject('blocked').promise();
      const $page = $('<div>').append($.parseHTML(String(html), document, false));
      return parseHomeUnits($page);
    });
  };

  // ---- Anzeige ----
  const UNIT_NAMES = {
    spear: 'Speer', sword: 'Schwert', axe: 'Axt', archer: 'Bogen', spy: 'Späher', light: 'LKav',
    marcher: 'BBogen', heavy: 'SKav', ram: 'Ramme', catapult: 'Kata', knight: 'Pala', snob: 'AG', militia: 'Miliz',
  };

  const pad = (n) => (n < 10 ? '0' : '') + n;
  const fmtTime = function (ms) {
    const d = new Date(ms);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };
  const fmtLeft = function (ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 3600) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  };
  const fmtUnits = function (units) {
    const parts = [];
    for (const u in units) parts.push(units[u] + ' ' + (UNIT_NAMES[u] || u));
    return parts.length ? parts.join(' · ') : '–';
  };
  const esc = (s) => $('<div>').text(String(s)).html();

  const render = function (plans, nowMs) {
    const rows = plans.map((p) => {
      const a = p.attack;
      const unit = a.slowestUnit ? ' <span class="grey">(' + esc(UNIT_NAMES[a.slowestUnit] || a.slowestUnit) + ')</span>' : '';
      const konter = p.urlOff
        ? '<a class="btn konter-off" href="' + p.urlOff + '">Konter (Off)</a>' +
          (p.landsAt ? '<br><small>landet ca. ' + fmtTime(p.landsAt) + '</small>' : '')
        : '<small>keine Off zu Hause</small>';
      const rest = p.urlRest
        ? '<a class="btn konter-rest" href="' + p.urlRest + '">Rest rausschicken</a><br><small>' +
          fmtUnits(p.rest) + '<br>senden ab ' + fmtTime(p.sendFrom) + ' · abbrechen vor ' + fmtTime(p.cancelBefore) +
          (nowMs < p.sendFrom ? '<br><b>noch nicht senden</b> (sonst nicht mehr abbrechbar)' : '') + '</small>'
        : '<small>kein Rest zu Hause</small>';
      return '<tr>' +
        '<td>' + esc(a.villageName) + '</td>' +
        '<td>' + esc(a.player) + '<br><small>' + esc(a.originName) + '</small>' + unit + '</td>' +
        '<td>' + esc(a.arrivalText) + '<br><small>in ' + fmtLeft(a.arrival - nowMs) + '</small></td>' +
        '<td>' + fmtUnits(p.off) + '</td>' +
        '<td>' + konter + '</td>' +
        '<td>' + rest + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="konterContent vis" style="margin-bottom:10px">' +
      '<table class="vis" style="width:100%"><thead><tr>' +
      '<th>Dorf</th><th>Angreifer</th><th>Ankunft</th><th>Off zu Hause</th><th>Konter</th><th>Rest</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="small grey" style="margin:4px 0 0">Konter: volle Off sofort aufs Herkunftsdorf; war es ein Fake, in der Befehlsübersicht abbrechen (nur 10 Minuten nach dem Senden möglich). ' +
      'Rest: Abbrechen-Trick – frühestens 10 Minuten vor der Ankunft senden, vor dem Einschlag abbrechen. Zahlen lassen sich am Versammlungsplatz vor "Angreifen" ändern.</p>' +
      '</div>';
  };

  const init = function () {
    const $table = $('#incomings_table');
    if (!$table.length) {
      UI.ErrorMessage(messages.wrongScreen);
      return;
    }
    const attacks = parseIncomings($table);
    if (!attacks.length) {
      UI.InfoMessage(messages.noAttacks);
      return;
    }
    const villageIds = [];
    attacks.forEach((a) => { if (villageIds.indexOf(a.villageId) === -1) villageIds.push(a.villageId); });

    $.when(ensureUnitInfo(), ...villageIds.map(fetchHomeUnits))
      .then((unitInfo, ...homes) => {
        const nowMs = serverNow();
        const homeOf = {};
        villageIds.forEach((id, i) => { homeOf[id] = homes[i]; });
        const plans = attacks.map((a) => planFor(a, homeOf[a.villageId] || {}, unitInfo, nowMs));
        $('.konterContent').remove();
        $('#incomings_table').before(render(plans, nowMs));
      })
      .fail((err) => {
        UI.ErrorMessage(err === 'blocked' ? messages.blocked : messages.failed);
      });
  };

  return { init, RULES, _internals: { messages, serverNow, parseArrival, parseIncomings, parseHomeUnits, splitUnits, placeUrl, planFor, ensureUnitInfo, render, fetchHomeUnits, fmtTime } };
})();

window.Konter.init();
