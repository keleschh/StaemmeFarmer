// FarmGodSmart - modifizierte Version von FarmGod (Original: Warre, Kopie: higamy)
//
// Bedienung: Farm-Assistent öffnen, Skript starten, Enter drücken bis die Tabelle leer ist,
// wiederkommen wenn die Truppen zurück sind ("Truppen zurück ab" steht oben in der Tabelle).
// Der Dialog mit den zwei Einstellungen (Gruppe, Dörfer ohne Bericht bis X Punkte) kommt nur
// beim ersten Start; danach über den Link "Einstellungen" in der Tabelle. Eine maximale
// Entfernung gibt es nicht mehr: Dörfer ohne Bericht werden bis zur Probe-Grenze (3 Stunden
// Anmarsch) betrachtet, bekannte Dörfer so weit, wie sich ein voller B-Trupp nach der
// Mindestbeute-Regel noch lohnen kann.
//
// Was das Skript rechnet:
//  - Für jedes Dorf wird geschätzt, wie viel bis zur Ankunft plünderbar ist. Grundlage ist der
//    letzte bekannte Stand (Beutebericht: leer bzw. minus Beute, Spähbericht: exakte Rohstoffe)
//    plus die Produktion seitdem. Die Produktion kommt aus gespähten Minenstufen, sonst aus den
//    Dorfpunkten (Dorfliste der Welt), korrigiert durch eigene volle / nicht volle Beutezüge.
//  - Reihenfolge: Beute pro Stunde Laufzeit (hin und zurück). Ein nahes halbleeres Dorf schlägt
//    ein weit entferntes volles. Unter einer Mindestbeute pro Stunde wird nur per Fallback das
//    beste Dorf geschickt, damit die Truppen nie sinnlos rennen, aber auch nicht ganz stehen.
//  - Mehrere Herkunftsdörfer werden gemeinsam geplant: jedes Ziel geht an das Dorf mit der besten
//    Beute pro Stunde Laufzeit, nicht an das erste in der Übersicht.
//  - Erst werden die Truppen als kleine Vorlage A auf möglichst viele Dörfer verteilt. Nur was
//    dann noch zu Hause stünde, vergrößert die Angriffe auf die vollsten Dörfer zu Vorlage B.
//    Mehrere A auf ein gespähtes volles Dorf werden zu einem B zusammengelegt; fehlt dafür genau
//    ein A, wird der schwächste andere A-Angriff dafür gestrichen, wenn die größere Beute das
//    mehr als ausgleicht. Dörfer ohne Bericht bekommen immer erst A als Probe.
//  - Laufende und gerade geplante Angriffe werden vom Vorrat abgezogen (bei nur geschätztem Vorrat
//    gilt das Dorf danach als leer). Die Kapazität laufender Angriffe kommt aus den Einheitenspalten
//    der Befehlsübersicht – auch für Angriffe von anderen Geräten oder von Hand. Mehrere Angriffe
//    auf ein Dorf im selben Durchlauf gibt es nur, wenn der Vorrat wirklich bekannt ist: Gebäude
//    gespäht und die letzte Beobachtung (Spähbericht, Zeilen-Hochrechnung, Leerräumen durch
//    Teilbeute) höchstens 6 Stunden her. Ein nur aus Produktion hochgerechneter Vorrat bekommt
//    einen Angriff, der als "räumt leer" gilt – so landen nie 7 Angriffe auf einem Dorf, das
//    inzwischen jemand anderes geplündert hat. Vorlage B gibt es nur für Dörfer mit gespähten
//    Gebäuden (Versteck, Speicher und Minen exakt; auch wenn der Spähbericht älter ist – sonst
//    bekämen gespähte volle Dörfer außerhalb des A-Radius gar nichts) oder mit einer aus einer
//    Teilbeute gelernten effektiven Produktion; alles andere bekommt A – lieber viele kleine
//    Angriffe auf viele Dörfer als ein großer ins Blaue.
//  - Ist der letzte Bericht ein Spähbericht, zeigt die Farm-Assistent-Zeile die vom Spiel
//    hochgerechneten Rohstoffe; die nimmt das Skript direkt als Vorrat (kein Bericht-Abruf nötig).
//  - Spähberichte (1 Request pro neuem Bericht, max. 5 pro Durchlauf) liefern Rohstoffe, Gebäude
//    (Produktion, Versteck, Speicher) und Truppen. Dörfer mit Truppen werden gemieden. Wächst ein
//    Dorf nach dem Spähen (Punkte steigen), wächst die Produktion im Modell mit.
//  - Barbaren-/Bonusdörfer ohne Bericht können mit eingeplant werden (Punktelimit als Sicherung
//    gegen ehemalige Spielerdörfer mit Resttruppen). Im Original nur auf dem NL-Markt.
//  - Auswertung: zu jedem geschickten Angriff wird die erwartete Beute gemerkt. Kommt der Bericht
//    dazu (1 Request pro Bericht, gemeinsames Budget mit den Spähberichten), wird die tatsächliche
//    Beute daneben gespeichert; die Tabelle zeigt oben "Auswertung: N Angriffe · Ø x % voll ·
//    Schätzung Ø +y %". Eine Teilbeute verrät außerdem die exakte Produktion seit dem letzten
//    Leerräumen und wird so ins Modell übernommen. Bis dahin rechnet die Planung nur mit 60 % der
//    Minenproduktion, weil andere Spieler meist mitfarmen. Das gilt für jede Teilbeute, auch wenn der
//    Angriff von einem anderen Gerät oder von Hand kam: so fallen Dörfer auf, die andere Spieler
//    mitfarmen (die effektive Produktion sinkt, das Dorf rutscht nach hinten). Nach 3 Tagen ohne
//    neuen Bericht wird die gelernte Grenze vergessen und das Dorf wieder probiert.
//  - Der Farm-Assistent zeigt je Dorf nur den letzten Bericht. Für Dörfer ohne Gebäudedaten sucht
//    das Skript einmal am Tag in der Berichtsübersicht (Angriffe, bis 5 Seiten) den letzten
//    Spähbericht und übernimmt daraus die Gebäude.
//  - Gedächtnis pro Dorf im Browser (localStorage), 14 Tage nach dem letzten Bericht gelöscht.
//    Feste Regeln stehen im Block RULES weiter unten.
//  - Anfragen ans Spiel: höchstens 2 gleichzeitig, 250 ms Pause dazwischen, Fehlschläge werden
//    erst nach 2 bzw. 5 s wiederholt; die Dorfliste der Welt wird 3 h zwischengespeichert. Das
//    Spiel sperrt sonst zeitweise alle Anfragen ("Blockierte Anfrage"). Kommt die Sperrseite trotzdem,
//    wird sie als Fehler behandelt (nichts gemerkt, klare Meldung statt leerer Tabelle).
// Das Senden selbst ist unverändert: jede Farm braucht weiterhin einen Klick bzw. Enter.
//
// Hungarian translation provided by =Krumpli=

ScriptAPI.register('FarmGod', true, 'Warre', 'nl.tribalwars@coma.innogames.de');

window.FarmGod = {};
window.FarmGod.Library = (function () {
  /**** TribalWarsLibrary.js ****/
  // Das Spiel sperrt Konten, die zu viele Anfragen in kurzer Zeit machen
  // ("Blockierte Anfrage"). Darum laufen alle Anfragen des Skripts über diese
  // Queue: nur `lanes` gleichzeitig, `delayMs` Pause zwischen zwei Anfragen
  // einer Bahn, und ein Fehlschlag wird erst nach `retryDelaysMs` wiederholt
  // (sofortiges Wiederholen würde eine Sperre nur verlängern).
  if (typeof window.twLib === 'undefined' || !window.twLib.delayMs) {
    window.twLib = {
      queues: null,
      lanes: 2,
      delayMs: 250,
      retryDelaysMs: [2000, 5000],
      // Sperrseite ("Blockierte Anfrage") oder Login-Seite kommen mit HTTP 200.
      // Sie zählen als Fehlschlag, sonst würden sie als leere Berichte /
      // Übersichten verarbeitet und das Gedächtnis verfälschen.
      isBlocked: function (body) {
        if (typeof body !== 'string') return false;
        return (
          /Blockierte Anfrage|zu viele Anfragen|Blocked request|too many requests/i.test(body) ||
          /<input[^>]+type=["']?password/i.test(body)
        );
      },
      init: function () {
        if (this.queues === null) {
          this.queues = this.queueLib.createQueues(this.lanes);
        }
      },
      queueLib: {
        maxAttempts: 3,
        Item: function (action, arg, promise = null) {
          this.action = action;
          this.arguments = arg;
          this.promise = promise;
          this.attempts = 0;
        },
        Queue: function () {
          this.list = [];
          this.working = false;
          this.length = 0;

          this.doNext = function () {
            let item = this.dequeue();
            let self = this;
            let later = function (ms) {
              if (ms > 0) setTimeout(() => self.start(), ms);
              else self.start();
            };

            if (item.action == 'openWindow') {
              window
                .open(...item.arguments)
                .addEventListener(
                  'DOMContentLoaded',
                  function () {
                    self.start();
                  }
                );
            } else {
              let failed = function (args) {
                item.attempts += 1;
                if (
                  item.attempts <
                  twLib.queueLib.maxAttempts
                ) {
                  self.enqueue(item, true);
                  let waits = twLib.retryDelaysMs;
                  later(waits[Math.min(item.attempts - 1, waits.length - 1)] || 0);
                } else {
                  item.promise.reject.apply(null, args);
                  later(twLib.delayMs);
                }
              };
              $[item.action](...item.arguments)
                .done(function () {
                  if (twLib.isBlocked(arguments[0])) return failed(['blocked']);
                  item.promise.resolve.apply(null, arguments);
                  later(twLib.delayMs);
                })
                .fail(function () {
                  failed(arguments);
                });
            }
          };

          this.start = function () {
            if (this.length) {
              this.working = true;
              this.doNext();
            } else {
              this.working = false;
            }
          };

          this.dequeue = function () {
            this.length -= 1;
            return this.list.shift();
          };

          this.enqueue = function (item, front = false) {
            front ? this.list.unshift(item) : this.list.push(item);
            this.length += 1;

            if (!this.working) {
              this.start();
            }
          };
        },
        createQueues: function (amount) {
          let arr = [];

          for (let i = 0; i < amount; i++) {
            arr[i] = new twLib.queueLib.Queue();
          }

          return arr;
        },
        addItem: function (item) {
          let load = (q) => q.length + (q.working ? 1 : 0);
          let leastBusyQueue = 0;
          twLib.queues.forEach((q, i) => {
            if (load(q) < load(twLib.queues[leastBusyQueue])) leastBusyQueue = i;
          });
          twLib.queues[leastBusyQueue].enqueue(item);
        },
        orchestrator: function (type, arg) {
          let promise = $.Deferred();
          let item = new twLib.queueLib.Item(type, arg, promise);

          twLib.queueLib.addItem(item);

          return promise;
        },
      },
      ajax: function () {
        return twLib.queueLib.orchestrator('ajax', arguments);
      },
      get: function () {
        return twLib.queueLib.orchestrator('get', arguments);
      },
      post: function () {
        return twLib.queueLib.orchestrator('post', arguments);
      },
      openWindow: function () {
        let item = new twLib.queueLib.Item('openWindow', arguments);

        twLib.queueLib.addItem(item);
      },
    };

    twLib.init();
  }

  /**** Script Library ****/
  // speed (min/field) and carry capacity of every unit, from the world's unit config
  const UNIT_INFO_KEY = 'FarmGodSmart_unitInfo';
  // fallback carry capacities in case the unit config could not be loaded (yet)
  const DEFAULT_CARRY = {
    spear: 25,
    sword: 15,
    axe: 10,
    archer: 10,
    spy: 0,
    light: 80,
    marcher: 50,
    heavy: 50,
    ram: 0,
    catapult: 0,
    knight: 100,
    snob: 0,
  };

  const fetchUnitInfo = function () {
    return $.get('/interface.php?func=get_unit_info').then((xml) => {
      let info = {};

      $(xml)
        .find('config')
        .children()
        .each((i, el) => {
          info[$(el).prop('nodeName')] = {
            speed: parseFloat($(el).find('speed').text()),
            carry: parseFloat($(el).find('carry').text()),
          };
        });

      localStorage.setItem(UNIT_INFO_KEY, JSON.stringify(info));
      return info;
    });
  };

  const getUnitInfo = function () {
    return JSON.parse(localStorage.getItem(UNIT_INFO_KEY)) || false;
  };

  // resolves with the unit info, loading it once if it is not cached yet
  const ensureUnitInfo = function () {
    let info = getUnitInfo();
    return info ? $.Deferred().resolve(info).promise() : fetchUnitInfo();
  };

  const getUnitSpeeds = function () {
    let info = getUnitInfo();
    if (!info) return false;
    let speeds = {};
    for (let unit in info) speeds[unit] = info[unit].speed;
    return speeds;
  };

  const getUnitCarry = function () {
    let info = getUnitInfo();
    let carry = Object.assign({}, DEFAULT_CARRY);
    if (info) {
      for (let unit in info) {
        if (!isNaN(info[unit].carry)) carry[unit] = info[unit].carry;
      }
    }
    return carry;
  };

  ensureUnitInfo();

  // world config (world speed is needed to scale the production estimate)
  const WORLD_CONFIG_KEY = 'FarmGodSmart_worldConfig';

  const fetchWorldConfig = function () {
    return $.get('/interface.php?func=get_config').then((xml) => {
      let cfg = {
        speed: parseFloat($(xml).find('speed').first().text()) || 1,
        unit_speed: parseFloat($(xml).find('unit_speed').first().text()) || 1,
      };
      localStorage.setItem(WORLD_CONFIG_KEY, JSON.stringify(cfg));
      return cfg;
    });
  };

  const getWorldConfig = function () {
    return JSON.parse(localStorage.getItem(WORLD_CONFIG_KEY)) || false;
  };

  const ensureWorldConfig = function () {
    let cfg = getWorldConfig();
    return cfg ? $.Deferred().resolve(cfg).promise() : fetchWorldConfig();
  };

  ensureWorldConfig();

  // Expected resource production (all three mines together, world speed 1)
  // of a barbarian village with the given points. Barbarian villages grow by
  // upgrading a random building whose requirements are met; this table is the
  // average of many simulated villages grown that way. Linear in between.
  const PRODUCTION_BY_POINTS = [
    [26, 15],
    [35, 40],
    [50, 70],
    [75, 104],
    [100, 125],
    [150, 155],
    [200, 190],
    [300, 265],
    [400, 340],
    [500, 410],
    [700, 535],
    [1000, 725],
    [1400, 945],
    [2000, 1300],
    [3000, 1850],
    [4000, 2360],
    [5000, 2880],
    [6000, 3450],
    [8000, 4500],
    [10000, 5700],
    [12000, 7200],
  ];

  const estimateProduction = function (points) {
    let table = PRODUCTION_BY_POINTS;
    if (!points || points <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      let [p0, v0] = table[i - 1];
      let [p1, v1] = table[i];
      if (points <= p1) {
        return Math.round(v0 + ((v1 - v0) * (points - p0)) / (p1 - p0));
      }
    }
    return table[table.length - 1][1];
  };

  const determineNextPage = function (page, $html) {
    let villageLength =
      $html.find('#scavenge_mass_screen').length > 0
        ? $html.find('tr[id*="scavenge_village"]').length
        : $html.find('tr.row_a, tr.row_ax, tr.row_b, tr.row_bx').length;
    let navSelect = $html
      .find('.paged-nav-item')
      .first()
      .closest('td')
      .find('select')
      .first();
    // Commented out the old version of the code, updated in April 2024
    // The old version did not count the number of pages in the loot assistant properly when there were more than 15 or so due to the way the UI changes to not show all pages
    // let navLength = ($html.find('#am_widget_Farm').length > 0) ? $html.find('#plunder_list_nav').first().find('a.paged-nav-item').length : ((navSelect.length > 0) ? navSelect.find('option').length - 1 : $html.find('.paged-nav-item').not('[href*="page=-1"]').length);
    let navLength =
      $html.find('#am_widget_Farm').length > 0
        ? parseInt(
          $('#plunder_list_nav')
            .first()
            .find('a.paged-nav-item, strong.paged-nav-item')
          [
            $('#plunder_list_nav')
              .first()
              .find(
                'a.paged-nav-item, strong.paged-nav-item'
              ).length - 1
          ].textContent.replace(/\D/g, '')
        ) - 1
        : navSelect.length > 0
          ? navSelect.find('option').length - 1
          : $html.find('.paged-nav-item').not('[href*="page=-1"]').length;
    let pageSize =
      $('#mobileHeader').length > 0
        ? 10
        : parseInt($html.find('input[name="page_size"]').val());

    if (page == -1 && villageLength == 1000) {
      return Math.floor(1000 / pageSize);
    } else if (page < navLength) {
      return page + 1;
    }

    return false;
  };

  const processPage = function (url, page, wrapFn) {
    let pageText = url.match('am_farm')
      ? `&Farm_page=${page}`
      : `&page=${page}`;

    return twLib
      .ajax({
        url: url + pageText,
      })
      .then((html) => {
        return wrapFn(page, $(html));
      });
  };

  const processAllPages = function (url, processorFn) {
    let page = url.match('am_farm') || url.match('scavenge_mass') ? 0 : -1;
    let wrapFn = function (page, $html) {
      let dnp = determineNextPage(page, $html);

      if (dnp) {
        processorFn($html);
        return processPage(url, dnp, wrapFn);
      } else {
        return processorFn($html);
      }
    };

    return processPage(url, page, wrapFn);
  };

  const getDistance = function (origin, target) {
    let a = origin.toCoord(true).x - target.toCoord(true).x;
    let b = origin.toCoord(true).y - target.toCoord(true).y;

    return Math.hypot(a, b);
  };

  const subtractArrays = function (array1, array2) {
    let result = array1.map((val, i) => {
      return val - array2[i];
    });

    return result.some((v) => v < 0) ? false : result;
  };

  const getCurrentServerTime = function () {
    let [hour, min, sec, day, month, year] = $('#serverTime')
      .closest('p')
      .text()
      .match(/\d+/g);
    return new Date(year, month - 1, day, hour, min, sec).getTime();
  };

  const timestampFromString = function (timestr) {
    let d = $('#serverDate')
      .text()
      .split('/')
      .map((x) => +x);
    let todayPattern = new RegExp(
      window.lang['aea2b0aa9ae1534226518faaefffdaad'].replace(
        '%s',
        '([\\d+|:]+)'
      )
    ).exec(timestr);
    let tomorrowPattern = new RegExp(
      window.lang['57d28d1b211fddbb7a499ead5bf23079'].replace(
        '%s',
        '([\\d+|:]+)'
      )
    ).exec(timestr);
    let laterDatePattern = new RegExp(
      window.lang['0cb274c906d622fa8ce524bcfbb7552d']
        .replace('%1', '([\\d+|\\.]+)')
        .replace('%2', '([\\d+|:]+)')
    ).exec(timestr);
    let t, date;

    if (todayPattern !== null) {
      t = todayPattern[1].split(':');
      date = new Date(d[2], d[1] - 1, d[0], t[0], t[1], t[2], t[3] || 0);
    } else if (tomorrowPattern !== null) {
      t = tomorrowPattern[1].split(':');
      date = new Date(
        d[2],
        d[1] - 1,
        d[0] + 1,
        t[0],
        t[1],
        t[2],
        t[3] || 0
      );
    } else {
      d = (laterDatePattern[1] + d[2]).split('.').map((x) => +x);
      t = laterDatePattern[2].split(':');
      date = new Date(d[2], d[1] - 1, d[0], t[0], t[1], t[2], t[3] || 0);
    }

    return date.getTime();
  };

  /**
   * Parses the "last report" time of a Farm Assistant row.
   * Looks for the cell that contains a clock time (HH:MM[:SS]) and combines it
   * with "today" / "yesterday" / "dd.mm." to a unix timestamp in seconds.
   * Returns 0 if nothing could be parsed (the village is then treated as unknown).
   */
  const parseReportTime = function ($row) {
    try {
      let text = '';
      $row.find('td').each((i, td) => {
        let cellText = $(td).text().trim();
        if (
          /\d{1,2}:\d{2}(:\d{2})?/.test(cellText) &&
          !/\d{1,3}\|\d{1,3}/.test(cellText)
        ) {
          text = cellText;
          return false;
        }
      });
      if (!text) return 0;

      let clock = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      let hh = parseInt(clock[1]);
      let mm = parseInt(clock[2]);
      let ss = parseInt(clock[3] || 0);
      let d = $('#serverDate')
        .text()
        .trim()
        .split(/[\/.\-]/)
        .map((x) => +x); // [day, month, year]
      let today = new Date(d[2], d[1] - 1, d[0]);
      let date = new Date(d[2], d[1] - 1, d[0], hh, mm, ss);
      let lower = text.toLowerCase();
      let dayMonth = text.match(/(\d{1,2})\.(\d{1,2})\./);

      if (/gestern|yesterday|gisteren|tegnap/.test(lower)) {
        date.setDate(date.getDate() - 1);
      } else if (dayMonth && !/heute|today|vandaag/.test(lower)) {
        date = new Date(
          d[2],
          parseInt(dayMonth[2]) - 1,
          parseInt(dayMonth[1]),
          hh,
          mm,
          ss
        );
        // a "future" date can only mean the report is from last year
        if (date.getTime() > today.getTime() + 2 * 86400000) {
          date.setFullYear(date.getFullYear() - 1);
        }
      }

      return Math.round(date.getTime() / 1000);
    } catch (e) {
      return 0;
    }
  };

  String.prototype.toCoord = function (objectified) {
    let c = (this.match(/\d{1,3}\|\d{1,3}/g) || [false]).pop();
    return c && objectified
      ? { x: c.split('|')[0], y: c.split('|')[1] }
      : c;
  };

  String.prototype.toNumber = function () {
    return parseFloat(this);
  };

  Number.prototype.toNumber = function () {
    return parseFloat(this);
  };

  return {
    getUnitSpeeds,
    processPage,
    processAllPages,
    getDistance,
    subtractArrays,
    getCurrentServerTime,
    timestampFromString,
    parseReportTime,
    ensureUnitInfo,
    getUnitCarry,
    ensureWorldConfig,
    getWorldConfig,
    estimateProduction,
  };
})();

window.FarmGod.Translation = (function () {
  const msg = {
    nl_NL: {
      missingFeatures:
        'Script vereist een premium account en farm assistent!',
      options: {
        title: 'FarmGod Opties',
        warning:
          '<b>Waarschuwingen:</b><br>- Zorg dat A is ingesteld als je standaard microfarm en B als een grotere microfarm<br>- Zorg dat de farm filters correct zijn ingesteld voor je het script gebruikt',
        filterImage:
          'https://higamy.github.io/TW/Scripts/Assets/farmGodFilters.png',
        group: 'Uit welke groep moet er gefarmd worden:',
        distance: 'Maximaal aantal velden dat farms mogen lopen:',
        time: 'Hoe veel tijd in minuten moet er tussen farms zitten:',
        losses: 'Verstuur farm naar dorpen met gedeeltelijke verliezen:',
        maxloot: 'Verstuur een B farm als de buit vorige keer vol was:',
        newbarbs: 'Voeg nieuwe barbarendorpen toe om te farmen:',
        autoProduction:
          'Estimate the production of each village from its points automatically:',
        production:
          'Production in resources/hour if the points are unknown (or auto is off):',
        minLoot:
          'Minimum loot per hour of travel (resources) to plan an attack:',
        fallbackMode:
          'If no village reaches the minimum:',
        fallbackNone: 'send nothing',
        fallbackBest: 'attack the best village anyway',
        fallbackAll: 'send all troops, best villages first',
        templateFallback:
          'Use the other template if the preferred one does not fit:',
        newbarbsMaxPoints:
          'Include barbarian/bonus villages without a report up to this many points (0 = off):',
        button: 'Plan farms',
      },
      table: {
        noFarmsPlanned:
          'Er kunnen met de opgegeven instellingen geen farms verstuurd worden.',
        origin: 'Oorsprong',
        target: 'Doel',
        fields: 'Velden',
        farm: 'Farm',
        expected: 'Exp. loot',
        points: 'Points / prod.',
        score: 'Loot/h travel',
        loot: 'Last haul',
        lootFull: 'full',
        lootPartial: 'not full',
        lootUnknown: '-',
        ago: 'ago',
        fallbackTag: 'fallback',
        lootNew: 'new (no report yet)',
        back: 'Back at',
        scoutedTitle: 'scouted: production, hiding place and warehouse are known exactly',
        settings: 'Settings',
        attacks: 'attacks',
        totalLoot: 'expected loot',
        troopsBack: 'troops back from',
        probeTag: 'probe',
        stats: 'Evaluation: %n attacks · avg %fill % full · estimate avg %bias % · error avg %error %',
        statsTitle: 'Own attack reports whose expected loot was remembered. full = actual loot in % of the carry capacity; estimate = expected minus actual in % of capacity (plus = too optimistic); error = its absolute value.',
        goTo: 'Ga naar',
      },
      messages: {
        villageChanged: 'Succesvol van dorp veranderd!',
        villageError:
          'Alle farms voor het huidige dorp zijn reeds verstuurd!',
        sendError: 'Error: farm niet verstuurd!',
        loadError: 'Could not load the data (see console). Reload the page and try again.',
        blocked: 'The game is blocking requests right now (too many requests). Wait a few minutes, then start the script again.',
      },
    },
    hu_HU: {
      missingFeatures:
        'A scriptnek szÃ¼ksÃ©ge van PrÃ©mium fiÃ³kra Ã©s FarmkezelÅ‘re!',
      options: {
        title: 'FarmGod opciÃ³k',
        warning:
          '<b>Figyelem:</b><br>- Bizonyosodj meg rÃ³la, hogy az "A" sablon az alapÃ©rtelmezett Ã©s a "B" egy nagyobb mennyisÃ©gÅ± mikrÃ³-farm<br>- Bizonyosodj meg rÃ³la, hogy a farm-filterek megfelelÅ‘en vannak beÃ¡llÃ­tva mielÅ‘tt hasznÃ¡lod a sctiptet',
        filterImage:
          'https://higamy.github.io/TW/Scripts/Assets/farmGodFilters_HU.png',
        group: 'EbbÅ‘l a csoportbÃ³l kÃ¼ldje:',
        distance: 'MaximÃ¡lis mezÅ‘ tÃ¡volsÃ¡g:',
        time: 'Mekkora idÅ‘intervallumban kÃ¼ldje a tÃ¡madÃ¡sokat percben:',
        losses: 'KÃ¼ldjÃ¶n tÃ¡madÃ¡st olyan falvakba ahol rÃ©szleges vesztesÃ©ggel jÃ¡rhat a tÃ¡madÃ¡s:',
        maxloot:
          'A "B" sablont kÃ¼ldje abban az esetben, ha az elÅ‘zÅ‘ tÃ¡madÃ¡s maximÃ¡lis fosztogatÃ¡ssal jÃ¡rt:',
        newbarbs: 'Adj hozzÃ¡ Ãºj barbÃ¡r falukat:',
        autoProduction:
          'Estimate the production of each village from its points automatically:',
        production:
          'Production in resources/hour if the points are unknown (or auto is off):',
        minLoot:
          'Minimum loot per hour of travel (resources) to plan an attack:',
        fallbackMode:
          'If no village reaches the minimum:',
        fallbackNone: 'send nothing',
        fallbackBest: 'attack the best village anyway',
        fallbackAll: 'send all troops, best villages first',
        templateFallback:
          'Use the other template if the preferred one does not fit:',
        newbarbsMaxPoints:
          'Include barbarian/bonus villages without a report up to this many points (0 = off):',
        button: 'Farm megtervezÃ©se',
      },
      table: {
        noFarmsPlanned:
          'A jelenlegi beÃ¡llÃ­tÃ¡sokkal nem lehet Ãºj tÃ¡madÃ¡st kikÃ¼ldeni.',
        origin: 'Origin',
        target: 'CÃ©lpont',
        fields: 'TÃ¡volsÃ¡g',
        farm: 'Farm',
        expected: 'Exp. loot',
        points: 'Points / prod.',
        score: 'Loot/h travel',
        loot: 'Last haul',
        lootFull: 'full',
        lootPartial: 'not full',
        lootUnknown: '-',
        ago: 'ago',
        fallbackTag: 'fallback',
        lootNew: 'new (no report yet)',
        back: 'Back at',
        scoutedTitle: 'scouted: production, hiding place and warehouse are known exactly',
        settings: 'Settings',
        attacks: 'attacks',
        totalLoot: 'expected loot',
        troopsBack: 'troops back from',
        probeTag: 'probe',
        stats: 'Evaluation: %n attacks · avg %fill % full · estimate avg %bias % · error avg %error %',
        statsTitle: 'Own attack reports whose expected loot was remembered. full = actual loot in % of the carry capacity; estimate = expected minus actual in % of capacity (plus = too optimistic); error = its absolute value.',
        goTo: 'Go to',
      },
      messages: {
        villageChanged: 'Falu sikeresen megvÃ¡ltoztatva!',
        villageError: 'Minden farm kiment a jelenlegi falubÃ³l!',
        sendError: 'Hiba: Farm nemvolt elkÃ¼ldve!',
        loadError: 'Could not load the data (see console). Reload the page and try again.',
        blocked: 'The game is blocking requests right now (too many requests). Wait a few minutes, then start the script again.',
      },
    },
    int: {
      missingFeatures:
        'Script requires a premium account and loot assistent!',
      options: {
        title: 'FarmGod Options',
        warning:
          '<b>Warning:</b><br>- Make sure A is set as your default microfarm and B as a larger microfarm<br>- Make sure the farm filters are set correctly before using the script',
        filterImage:
          'https://higamy.github.io/TW/Scripts/Assets/farmGodFilters.png',
        group: 'Send farms from group:',
        distance: 'Maximum fields for farms:',
        time: 'How much time in minutes should there be between farms:',
        losses: 'Send farm to villages with partial losses:',
        maxloot: 'Send a B farm if the last loot was full:',
        newbarbs: 'Add new barbs te farm:',
        autoProduction:
          'Estimate the production of each village from its points automatically:',
        production:
          'Production in resources/hour if the points are unknown (or auto is off):',
        minLoot:
          'Minimum loot per hour of travel (resources) to plan an attack:',
        fallbackMode:
          'If no village reaches the minimum:',
        fallbackNone: 'send nothing',
        fallbackBest: 'attack the best village anyway',
        fallbackAll: 'send all troops, best villages first',
        templateFallback:
          'Use the other template if the preferred one does not fit:',
        newbarbsMaxPoints:
          'Include barbarian/bonus villages without a report up to this many points (0 = off):',
        button: 'Plan farms',
      },
      table: {
        noFarmsPlanned:
          'No farms can be sent with the specified settings.',
        origin: 'Origin',
        target: 'Target',
        fields: 'fields',
        farm: 'Farm',
        expected: 'Exp. loot',
        points: 'Points / prod.',
        score: 'Loot/h travel',
        loot: 'Last haul',
        lootFull: 'full',
        lootPartial: 'not full',
        lootUnknown: '-',
        ago: 'ago',
        fallbackTag: 'fallback',
        lootNew: 'new (no report yet)',
        back: 'Back at',
        scoutedTitle: 'scouted: production, hiding place and warehouse are known exactly',
        settings: 'Settings',
        attacks: 'attacks',
        totalLoot: 'expected loot',
        troopsBack: 'troops back from',
        probeTag: 'probe',
        stats: 'Evaluation: %n attacks · avg %fill % full · estimate avg %bias % · error avg %error %',
        statsTitle: 'Own attack reports whose expected loot was remembered. full = actual loot in % of the carry capacity; estimate = expected minus actual in % of capacity (plus = too optimistic); error = its absolute value.',
        goTo: 'Go to',
      },
      messages: {
        villageChanged: 'Successfully changed village!',
        villageError:
          'All farms for the current village have been sent!',
        sendError: 'Error: farm not send!',
        loadError: 'Could not load the data (see console). Reload the page and try again.',
        blocked: 'The game is blocking requests right now (too many requests). Wait a few minutes, then start the script again.',
      },
    },
    de_DE: {
      missingFeatures:
        'Das Skript benötigt einen Premium-Account und den Farm-Assistenten!',
      options: {
        title: 'FarmGod Optionen',
        warning:
          '<b>Hinweise:</b><br>- Vorlage A muss deine normale Mikrofarm sein und B eine größere Mikrofarm<br>- Die Filter im Farm-Assistenten müssen richtig gesetzt sein, bevor du das Skript benutzt',
        filterImage:
          'https://higamy.github.io/TW/Scripts/Assets/farmGodFilters.png',
        group: 'Aus welcher Gruppe soll gefarmt werden:',
        distance: 'Maximale Entfernung in Feldern:',
        time: 'Mindestabstand in Minuten zu bereits laufenden Angriffen auf dasselbe Dorf:',
        losses: 'Auch Dörfer angreifen, bei denen es zuletzt Verluste gab:',
        maxloot: 'Vorlage B schicken, wenn die letzte Beute voll war:',
        newbarbs:
          'Barbaren-/Bonusdörfer ohne Bericht mit einplanen (erster Angriff geht blind raus):',
        newbarbsMaxPoints:
          'Barbaren-/Bonusdörfer ohne Bericht mit einplanen, bis so viele Punkte (0 = aus):',
        autoProduction:
          'Produktion jedes Dorfes automatisch anhand seiner Punkte schätzen:',
        production:
          'Produktion in Rohstoffen/Std., wenn keine Punkte bekannt sind (oder automatisch aus):',
        minLoot:
          'Mindest-Beute pro Stunde Laufzeit (Rohstoffe), damit ein Angriff geplant wird:',
        fallbackMode: 'Wenn kein Dorf das Minimum erreicht:',
        fallbackNone: 'nichts schicken',
        fallbackBest: 'trotzdem das beste Dorf angreifen',
        fallbackAll: 'alle Truppen verschicken, beste Dörfer zuerst',
        templateFallback:
          'Andere Vorlage nehmen, wenn die gewünschte nicht aufgeht:',
        button: 'Farmen planen',
      },
      table: {
        noFarmsPlanned:
          'Mit den gewählten Einstellungen können keine Farmen geschickt werden.',
        origin: 'Herkunft',
        target: 'Ziel',
        fields: 'Felder',
        farm: 'Farm',
        expected: 'Erw. Beute',
        points: 'Punkte / Prod.',
        score: 'Beute/Std. Laufzeit',
        loot: 'Letzte Beute',
        lootFull: 'voll',
        lootPartial: 'nicht voll',
        lootUnknown: '-',
        ago: 'her',
        fallbackTag: 'Fallback',
        lootNew: 'neu (noch kein Bericht)',
        back: 'Zurück um',
        scoutedTitle: 'gespäht: Produktion, Versteck und Speicher sind exakt bekannt',
        settings: 'Einstellungen',
        attacks: 'Angriffe',
        totalLoot: 'erwartete Beute',
        troopsBack: 'Truppen zurück ab',
        probeTag: 'Probe',
        goTo: 'Gehe zu',
        stats: 'Auswertung: %n Angriffe · Ø %fill % voll · Schätzung Ø %bias % · Fehler Ø %error %',
        statsTitle:
          'Eigene Angriffsberichte, zu denen die erwartete Beute gemerkt wurde. "voll" = tatsächliche Beute in Prozent der Tragekapazität. "Schätzung" = erwartete minus tatsächliche Beute in Prozent der Kapazität (plus = zu optimistisch), "Fehler" = Betrag davon.',
      },
      messages: {
        villageChanged: 'Dorf erfolgreich gewechselt!',
        villageError:
          'Alle Farmen für das aktuelle Dorf wurden bereits geschickt!',
        sendError: 'Fehler: Farm nicht geschickt!',
        loadError: 'Daten konnten nicht geladen werden (Details in der Konsole). Seite neu laden und nochmal starten.',
        blocked: 'Das Spiel blockiert gerade Anfragen ("zu viele Anfragen"). Ein paar Minuten warten, dann das Skript neu starten.',
      },
    },
  };

  const get = function () {
    let lang = msg.hasOwnProperty(game_data.locale)
      ? game_data.locale
      : 'int';
    return msg[lang];
  };

  return {
    get,
  };
})();

window.FarmGod.Main = (function (Library, Translation) {
  const lib = Library;
  const t = Translation.get();
  let curVillage = null;
  let farmBusy = false;

  // Feste Regeln (früher Optionen). Hier anpassen, wenn nötig.
  const RULES = {
    // Mindest-Beute pro Stunde Laufzeit bei Speed 1; wird mit Welt- und
    // Einheitengeschwindigkeit multipliziert. 60 = eine volle 2-LKav-Beute
    // lohnt sich bis ca. 8 Felder.
    minScorePerSpeed: 60,
    // Erreicht kein Dorf das Minimum: 'best' = trotzdem das beste Dorf (eine
    // Farm pro Herkunftsdorf), 'all' = alle Truppen nach Score, 'none' = nichts.
    fallbackMode: 'best',
    // Unter diesem Anteil der Tragekapazität wird auch per Fallback nichts
    // geschickt (0.1 = 10 %, also z. B. 16 von 160).
    fallbackMinFill: 0.1,
    // Vorlage B, wenn das Dorf voraussichtlich mindestens diesen Anteil der
    // B-Kapazität hat (0.75 = 75 %). Sonst A.
    bFillRatio: 0.75,
    // Andere Vorlage nehmen, wenn die gewünschte nicht aufgeht.
    templateFallback: true,
    // Dörfer, bei denen es zuletzt Verluste gab (gelb), angreifen.
    attackWithLosses: false,
    // Produktion bei Speed 1, wenn ein Dorf keine Punkte hat.
    defaultProduction: 40,
    // Ein Dorf, das wir noch nie leer gesehen haben, hat vermutlich so viele
    // Stunden Produktion angesammelt (grobe Annahme für den Vorrat).
    untouchedHours: 36,
    // Wie viele neue Berichte (Späh- und eigene Beuteberichte) pro Durchlauf
    // höchstens geladen werden. Spähberichte zuerst. Klein halten: jeder
    // Bericht ist eine Anfrage, und das Spiel sperrt bei zu vielen.
    maxReportFetches: 5,
    // So viele ausgewertete Angriffe (erwartet vs. tatsächlich) werden behalten.
    maxStats: 300,
    // Alte Spähberichte nachladen: der Farm-Assistent zeigt nur den letzten
    // Bericht je Dorf; für Dörfer ohne Gebäudedaten wird höchstens alle
    // backfillHours Stunden die Angriffsbericht-Übersicht (so viele Seiten)
    // nach dem letzten Spähbericht durchsucht. Berichte zählen zum Budget.
    // Reichte das Budget nicht für alle gefundenen Berichte, geht es nach
    // backfillRetryHours weiter (nicht sofort beim nächsten Start).
    backfillHours: 24,
    backfillPages: 5,
    backfillRetryHours: 1,
    // Die Dorfliste der Welt (village.txt, auf großen Welten mehrere MB) wird
    // so viele Stunden im Browser zwischengespeichert.
    villageListHours: 3,
    // Andere Spieler farmen dieselben Barbarendörfer. Solange für ein Dorf
    // keine eigene Teilbeute die effektive Produktion verraten hat, wird die
    // aus den Minen hochgerechnete Produktion nur zu diesem Anteil angesetzt.
    // Beobachteter Vorrat (Spähbericht, Zeile) bleibt ungekürzt.
    contestedFactor: 0.6,
    // Der Vorrat eines Dorfes gilt nur so viele Stunden nach der letzten
    // Beobachtung (Spähbericht, Hochrechnung in der Zeile, Leerräumen durch
    // Teilbeute) als bekannt. Danach ist er nur noch hochgerechnete Produktion
    // (andere Spieler könnten geplündert haben): dann höchstens ein Angriff je
    // Dorf und Durchlauf, der als "räumt das Dorf leer" gilt. Ob dieser eine
    // Angriff A oder B ist, hängt nicht hiervon ab, sondern von den gespähten
    // Gebäuden (siehe bWorthy in createPlanning).
    trustHours: 6,
    // Aus Beuteberichten gelernte Produktionsgrenzen (prodMin/prodMax, z. B.
    // weil andere Spieler dasselbe Dorf farmen) verfallen nach so vielen Tagen
    // ohne neuen Bericht; das Dorf bekommt dann wieder eine Probe.
    learnedRateDays: 3,
    // Truppen, die nach der Planung zu Hause stünden, gehen als Probe (Vorlage A)
    // auf Dörfer ohne Bericht, nächste zuerst, bis zu so vielen Stunden Anmarsch.
    probeMaxTravelHours: 3,
  };

  // Produktion / Versteck / Speicher je Stufe (Speed 1)
  const PROD_BY_LEVEL = [5, 30, 35, 41, 47, 55, 64, 74, 86, 100, 117, 136, 158, 184, 214, 249, 289, 337, 391, 455, 530, 616, 717, 833, 969, 1127, 1311, 1525, 1774, 2063, 2400];
  const HIDE_BY_LEVEL = [0, 150, 200, 267, 356, 474, 632, 843, 1125, 1500, 2000];
  const WAREHOUSE_BY_LEVEL = [1000, 1000, 1229, 1512, 1859, 2285, 2810, 3454, 4247, 5222, 6420, 7893, 9705, 11932, 14670, 18037, 22177, 27266, 33523, 41217, 50675, 62305, 76604, 94184, 115798, 142373, 175047, 215219, 264611, 325337, 400000];
  const RES = ['wood', 'stone', 'iron'];

  // Pro-Dorf-Gedächtnis (localStorage): letzter bekannter Rohstoffstand
  // ("base": Zeitpunkt + Rohstoffe je Art), Gebäude aus Spähberichten,
  // gelernte Grenzen für die Produktion, zuletzt geschickter Angriff.
  const HISTORY_KEY = 'FarmGodSmart_history';

  const loadHistory = function () {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {};
    } catch (e) {
      return {};
    }
  };

  const saveHistory = function (history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      /* storage full or blocked: learning is optional */
    }
  };

  // Called after an attack was sent from the table: remember what will
  // arrive when, so the next report can be interpreted.
  const sentListOf = (h) =>
    Array.isArray(h.sent) ? h.sent : h.sent ? [h.sent] : [];

  const rememberSent = function (coord, arrival, capacity, expected) {
    if (!coord) return;
    let history = loadHistory();
    if (!history[coord]) history[coord] = {};
    let list = sentListOf(history[coord]);
    let entry = { arrival: arrival, capacity: capacity };
    if (typeof expected === 'number' && !isNaN(expected)) entry.expected = expected;
    list.push(entry);
    history[coord].sent = list.slice(-20);
    saveHistory(history);
  };

  /**** Auswertung: erwartete vs. tatsächliche Beute ****/
  const STATS_KEY = 'FarmGodSmart_stats';

  const loadStats = function () {
    try {
      let list = JSON.parse(localStorage.getItem(STATS_KEY));
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  };

  const recordStat = function (stat) {
    let list = loadStats();
    if (list.some((x) => x.coord == stat.coord && x.time == stat.time)) return;
    list.push(stat);
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(list.slice(-RULES.maxStats)));
    } catch (e) {
      /* optional */
    }
  };

  // n, average fill of the capacity (%), average estimate error
  // (expected - actual, in % of capacity; positive = estimate too high) and
  // the average absolute error
  const statsSummary = function () {
    let list = loadStats().filter((x) => x.capacity > 0);
    if (!list.length) return { n: 0, fill: 0, bias: 0, error: 0 };
    let fill = 0;
    let bias = 0;
    let error = 0;
    list.forEach((x) => {
      let d = (x.expected - x.actual) / x.capacity;
      fill += x.actual / x.capacity;
      bias += d;
      error += Math.abs(d);
    });
    let n = list.length;
    return {
      n: n,
      fill: Math.round((100 * fill) / n),
      bias: Math.round((100 * bias) / n),
      error: Math.round((100 * error) / n),
    };
  };

  /**** Rohstoff-Modell pro Dorf ****/
  const levelOf = (buildings, key, max) =>
    Math.min(max, Math.max(0, parseInt((buildings || {})[key]) || 0));

  // Punkte-Schätzung (gesamt), korrigiert durch gelernte Grenzen
  const estimatedTotalProduction = function (farm, h, worldSpeed) {
    let prod =
      (farm.points
        ? lib.estimateProduction(farm.points)
        : RULES.defaultProduction) * worldSpeed;
    if (typeof h.prodMin === 'number') prod = Math.max(prod, h.prodMin);
    if (typeof h.prodMax === 'number') prod = Math.min(prod, h.prodMax);
    return prod;
  };

  // Produktion, Versteck und Speicher je Rohstoffart: exakt aus gespähten
  // Gebäuden, sonst grob aus den Punkten (gleichmäßig verteilt, kein Versteck)
  const buildModel = function (farm, h, worldSpeed) {
    let b = h.buildings;
    if (b && (RES.some((k) => typeof b[k] !== 'undefined') || typeof b.main !== 'undefined')) {
      let hidden = HIDE_BY_LEVEL[levelOf(b, 'hide', 10)];
      let cap = WAREHOUSE_BY_LEVEL[Math.max(1, levelOf(b, 'storage', 30))];
      let prod = RES.map((k) => PROD_BY_LEVEL[levelOf(b, k, 30)] * worldSpeed);

      // the village may have grown since the scout report: add the growth
      // that the points gained since then suggest (evenly over the mines)
      if (farm.points && h.scoutPoints && farm.points > h.scoutPoints) {
        let growth =
          (lib.estimateProduction(farm.points) -
            lib.estimateProduction(h.scoutPoints)) *
          worldSpeed;
        if (growth > 0) prod = prod.map((p) => p + growth / 3);
      }
      // own hauls since the scout report can still correct the total
      let total = prod.reduce((a, c) => a + c, 0) || 1;
      let corrected = total;
      if (typeof h.prodMin === 'number') corrected = Math.max(corrected, h.prodMin);
      if (typeof h.prodMax === 'number') corrected = Math.min(corrected, h.prodMax);
      if (corrected !== total) prod = prod.map((p) => (p * corrected) / total);

      return {
        exact: true,
        prod: prod,
        hidden: [hidden, hidden, hidden],
        cap: [cap, cap, cap],
      };
    }
    let total = estimatedTotalProduction(farm, h, worldSpeed);
    let prod = [total / 3, total / 3, total / 3];
    return {
      exact: false,
      prod: prod,
      hidden: [0, 0, 0],
      cap: prod.map((p) => p * RULES.untouchedHours),
    };
  };

  const forecastRaw = (m, raw, hours) =>
    raw.map((v, i) => Math.min(m.cap[i], v + m.prod[i] * Math.max(0, hours)));
  const lootableOf = (m, raw) =>
    raw.reduce((sum, v, i) => sum + Math.max(0, v - m.hidden[i]), 0);
  // remove `amount` loot, proportionally from what lies above the hiding place
  const takeFrom = (m, raw, amount) => {
    let lootable = raw.map((v, i) => Math.max(0, v - m.hidden[i]));
    let total = lootable.reduce((a, b) => a + b, 0);
    if (total <= 0) return raw.slice();
    let take = Math.min(amount, total);
    return raw.map((v, i) => v - take * (lootable[i] / total));
  };
  // last known state; else "was empty at emptiedAt" (older memory format);
  // else "has been accumulating for untouchedHours"
  const baseOf = (h, t, m) => {
    if (h.base && Array.isArray(h.base.raw) && h.base.time <= t)
      return { time: h.base.time, raw: h.base.raw.slice() };
    if (h.emptiedAt && h.emptiedAt <= t)
      return { time: h.emptiedAt, raw: m.hidden.slice() };
    return { time: t - RULES.untouchedHours * 3600, raw: [0, 0, 0] };
  };

  // when was the stock last observed (not just extrapolated)?
  const lastObservedAt = (h) =>
    Math.max(h.base && h.base.observed ? h.base.time : 0, h.emptiedAt || 0);
  // stock at time t counts as known: exact buildings and a recent observation
  const stockKnownAt = (h, m, t) =>
    m.exact && lastObservedAt(h) > 0 && t - lastObservedAt(h) <= RULES.trustHours * 3600;

  /**** Spähberichte ****/
  // reads resources and building levels from a report page
  const parseScoutReport = function ($html) {
    let result = { res: null, buildings: null };

    // The report shows two resource rows: "Erspähte Rohstoffe" (what the
    // scouts saw) and "Mögliche Rohstoffe" (tr.no-preview, the game's own
    // extrapolation to now). Only the scouted values are used here.
    let $res = $html.find('#attack_spy_resources');
    if ($res.length) {
      let $rows = $res.find('tr').not('.no-preview');
      if ($rows.find('.icon.header.wood').length) $res = $rows;
      let res = {};
      RES.forEach((k) => {
        let $icon = $res.find(`.icon.header.${k}`).first();
        if (!$icon.length) return;
        let node = $icon[0].nextSibling;
        while (node && !/\d/.test(node.textContent || '')) node = node.nextSibling;
        let n = node ? parseInt((node.textContent || '').replace(/[^\d]/g, '')) : NaN;
        if (!isNaN(n)) res[k] = n;
      });
      if (Object.keys(res).length < 3) {
        // text fallback (icons missing): only the scouted row, without the
        // inline script of the "Mögliche Rohstoffe" row (contains village ids)
        let $plain = $res.clone();
        $plain.find('script, .no-preview').remove();
        let nums = ($plain.text().match(/\d[\d.]*/g) || []).map((x) =>
          parseInt(x.replace(/\./g, ''))
        );
        if (nums.length >= 3) res = { wood: nums[0], stone: nums[1], iron: nums[2] };
      }
      if (Object.keys(res).length === 3) result.res = [res.wood, res.stone, res.iron];
    }

    let buildings = {};
    let json = $html.find('#attack_spy_building_data').val();
    if (json) {
      try {
        JSON.parse(json).forEach((b) => {
          if (b.id) buildings[b.id] = parseInt(b.level) || 0;
        });
      } catch (e) {
        /* fall through to text parsing */
      }
    }
    if (Object.keys(buildings).length === 0) {
      const names = {
        holzfäller: 'wood', 'timber camp': 'wood', houthakker: 'wood',
        lehmgrube: 'stone', 'clay pit': 'stone', leemgroeve: 'stone',
        eisenmine: 'iron', 'iron mine': 'iron', ijzermijn: 'iron',
        speicher: 'storage', warehouse: 'storage', opslagplaats: 'storage',
        versteck: 'hide', 'hiding place': 'hide', schuilplaats: 'hide',
        wall: 'wall', muur: 'wall',
        hauptgebäude: 'main', headquarters: 'main', hoofdgebouw: 'main',
      };
      $html
        .find('#attack_spy_buildings_left tr, #attack_spy_buildings_right tr')
        .each((i, tr) => {
          let $tds = $(tr).find('td');
          if ($tds.length < 2) return;
          let key = null;
          let img = $tds.first().find('img').attr('src') || '';
          let m = img.match(/buildings\/(?:mid\/|big\/)?([a-z_]+?)\d*\.(?:png|webp)/);
          if (m) key = m[1];
          if (!key) key = names[$tds.first().text().trim().toLowerCase()] || null;
          let level = parseInt($tds.eq(1).text());
          if (key && !isNaN(level)) buildings[key] = level;
        });
    }
    if (Object.keys(buildings).length) result.buildings = buildings;

    // defenders shown in the report (a scout report lists the village's units)
    // (#attack_info_def lists "Anzahl" and "Verluste" rows; only the first
    // row with unit cells is the number of units present)
    let $def = $html.find('#attack_info_def');
    if ($def.length) {
      let troops = 0;
      let found = false;
      let $cells = $def.find('.unit-item');
      let $firstRow = $cells.first().closest('tr');
      if ($firstRow.length) $cells = $firstRow.find('.unit-item');
      $cells.each((i, td) => {
        let n = parseInt($(td).text().replace(/[^\d]/g, ''));
        if (!isNaN(n)) {
          found = true;
          troops += n;
        }
      });
      if (found) result.troops = troops;
    }

    return result;
  };

  // reads the haul of an own attack report: "Beute: 280 258 262  800/800"
  const parseHaul = function ($html) {
    let $r = $html.find('#attack_results');
    if (!$r.length) return null;
    let loot = [];
    RES.forEach((k) => {
      let $icon = $r.find(`.icon.header.${k}`).first();
      if (!$icon.length) return;
      let node = $icon[0].nextSibling;
      while (node && !/\d/.test(node.textContent || '')) node = node.nextSibling;
      let n = node ? parseInt((node.textContent || '').replace(/[^\d]/g, '')) : NaN;
      if (!isNaN(n)) loot.push(n);
    });
    let m = $r.text().replace(/\./g, '').match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return null;
    return {
      loot: loot.length === 3 ? loot : null,
      carried: parseInt(m[1]),
      capacity: parseInt(m[2]),
    };
  };

  // loads reports that are not known yet: scout reports (resources,
  // buildings, troops) first, then own attack reports whose expected loot
  // was remembered when they were sent (evaluation + exact production)
  const fetchNewScoutReports = function (farms) {
    let history = loadHistory();
    let scoutTodo = [];
    let haulTodo = [];
    for (let coord in farms) {
      let f = farms[coord];
      if (!f.report_id) continue;
      let h = history[coord] || {};
      let known = h.scoutReportId == f.report_id || (h.noScout || []).indexOf(f.report_id) >= 0;
      if (!known && (f.has_res_info || !f.has_loot_info)) {
        scoutTodo.push(coord);
      } else if (f.has_loot_info && f.report_time > (h.lastReport || 0)) {
        let evaluated = sentListOf(h).some(
          (x) => typeof x.expected === 'number' && Math.abs(x.arrival - f.report_time) < 900
        );
        // a partial haul tells the effective production of the village since
        // it was emptied the last time - no matter who sent the attack (other
        // device, by hand). That is how villages farmed by others are found.
        if (evaluated || (!f.max_loot && h.emptiedAt)) haulTodo.push(coord);
      }
    }
    let todo = scoutTodo.concat(haulTodo).slice(0, RULES.maxReportFetches);
    Object.defineProperty(farms, '_fetched', { value: todo.length, enumerable: false, configurable: true });
    if (!todo.length) return Promise.resolve(farms);

    return Promise.all(
      todo.map((coord) =>
        twLib
          .get(game_data.link_base_pure + 'report&mode=all&view=' + farms[coord].report_id)
          .then(
            (html) => {
              let $html = $(html);
              let parsed = parseScoutReport($html);
              farms[coord].scout = {
                reportId: farms[coord].report_id,
                res: parsed.res,
                buildings: parsed.buildings,
                troops: parsed.troops,
              };
              let haul = parseHaul($html);
              if (haul) farms[coord].haul = haul;
            },
            () => {}
          )
      )
    ).then(() => farms);
  };

  // report overview (screen=report&mode=attack): reports that contain scouts,
  // newest first, plus the "from" offset of the next page
  const parseReportList = function ($html, currentFrom) {
    currentFrom = currentFrom || 0;
    let reports = [];
    $html.find('#report_list tr').each((i, tr) => {
      let $tr = $(tr);
      if (!$tr.find('img[src*="command/spy"]').length) return;
      let dot = ($tr.find('img[src*="graphic/dots/"]').attr('src') || '').match(/dots\/([a-z_]+)/);
      let color = dot ? dot[1] : '';
      if (/red/.test(color)) return; // scouts lost, no data
      let $link = $tr.find('a[href*="view="]').first();
      let id = parseInt(($link.attr('href') || '').match(/view=(\d+)/) ? RegExp.$1 : 0) || 0;
      let coord = $link.text().toCoord();
      let d = $tr.find('td').last().text().trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s+(\d{1,2}):(\d{2})/);
      if (!id || !coord || !d) return;
      let year = parseInt(d[3]);
      if (year < 100) year += 2000;
      let time = Math.round(
        new Date(year, parseInt(d[2]) - 1, parseInt(d[1]), parseInt(d[4]), parseInt(d[5])).getTime() / 1000
      );
      reports.push({ coord: coord, reportId: id, time: time, color: color });
    });
    // next page = smallest "from" offset behind the current one
    let nextFrom = null;
    $html.find('a.paged-nav-item').each((i, a) => {
      let m = ($(a).attr('href') || '').match(/from=(\d+)/);
      if (m) {
        let from = parseInt(m[1]);
        if (from > currentFrom && (nextFrom === null || from < nextFrom)) nextFrom = from;
      }
    });
    return { reports: reports, nextFrom: nextFrom };
  };

  const BACKFILL_KEY = 'FarmGodSmart_backfill';

  // The Farm Assistant only shows the last report per village, so scout
  // reports that were followed by attacks before the script ran are never
  // seen. Once a day: look through the report overview for the newest scout
  // report of every farm without building data and read the buildings.
  const backfillScoutReports = function (farms, serverTime, budget) {
    let history = loadHistory();
    let wanted = {};
    for (let coord in farms) {
      let f = farms[coord];
      if (f.is_new) continue;
      let h = history[coord] || {};
      if (!h.buildings) wanted[coord] = true;
    }
    if (!Object.keys(wanted).length || budget <= 0) return Promise.resolve(farms);
    let last = 0;
    try {
      last = (JSON.parse(localStorage.getItem(BACKFILL_KEY)) || {}).time || 0;
    } catch (e) {
      /* ignore */
    }
    if (serverTime - last < RULES.backfillHours * 3600) return Promise.resolve(farms);

    let found = {};
    let pagesLoaded = 0;
    let loadPage = (from, pagesLeft) => {
      if (pagesLeft <= 0) return Promise.resolve();
      let url = game_data.link_base_pure + 'report&mode=attack' + (from ? '&from=' + from : '');
      return twLib.get(url).then(
        (html) => {
          pagesLoaded += 1;
          let list = parseReportList($(html), from);
          list.reports.forEach((r) => {
            if (!wanted[r.coord] || found[r.coord]) return;
            // reports already read without building data are not tried again
            if (((history[r.coord] || {}).noScout || []).indexOf(r.reportId) >= 0) return;
            found[r.coord] = r;
          });
          let allFound = Object.keys(wanted).every((c) => found[c]);
          if (list.nextFrom === null || allFound) return;
          return loadPage(list.nextFrom, pagesLeft - 1);
        },
        () => {}
      );
    };

    return loadPage(0, RULES.backfillPages).then(() => {
      // nothing loaded (blocked / offline): try again next run
      if (!pagesLoaded) return;
      try {
        localStorage.setItem(BACKFILL_KEY, JSON.stringify({ time: serverTime }));
      } catch (e) {
        /* ignore */
      }
      let all = Object.values(found);
      let todo = all.slice(0, budget);
      // budget used up before every found report could be read: continue
      // after backfillRetryHours instead of waiting the full backfillHours
      // (not right away: every run would reload the list pages otherwise)
      if (all.length > budget) {
        try {
          localStorage.setItem(
            BACKFILL_KEY,
            JSON.stringify({ time: serverTime - (RULES.backfillHours - RULES.backfillRetryHours) * 3600 })
          );
        } catch (e) {
          /* ignore */
        }
      }
      return Promise.all(
        todo.map((r) =>
          twLib.get(game_data.link_base_pure + 'report&mode=all&view=' + r.reportId).then(
            (html) => {
              let parsed = parseScoutReport($(html));
              let hist = loadHistory();
              let h = hist[r.coord] || {};
              if (!parsed.buildings) {
                h.noScout = (h.noScout || []).concat([r.reportId]).slice(-5);
                hist[r.coord] = h;
                saveHistory(hist);
                return;
              }
              h.buildings = Object.assign(h.buildings || {}, parsed.buildings);
              h.scoutReportId = r.reportId;
              h.scoutTime = r.time;
              h.scoutPoints = (farms[r.coord] || {}).points || h.scoutPoints || 0;
              if (typeof parsed.troops === 'number' && typeof h.troops !== 'number') h.troops = parsed.troops;
              // the stock was estimated with "no hiding place" so far: a village
              // that was emptied by a partial haul is at the hiding place now
              let m = buildModel(farms[r.coord] || {}, h, 1);
              if (h.base && h.emptiedAt && h.base.time === h.emptiedAt) {
                h.base.raw = h.base.raw.map((v, i) => Math.max(v, m.hidden[i]));
              }
              hist[r.coord] = h;
              saveHistory(hist);
            },
            () => {}
          )
        )
      );
    }).then(() => farms);
  };

  // Update the memory with the newest Farm Assistant reports (and scout data).
  const learnFromReports = function (farms, serverTime, capacityA, worldSpeed) {
    let history = loadHistory();
    let keepAfter = serverTime - 14 * 86400;

    for (let coord in farms) {
      let farm = farms[coord];
      farm.coord = coord;
      let h = history[coord] || {};
      let T = farm.report_time;
      let scout = farm.scout || null;

      // remember reports without any scout info, so they are not fetched again
      if (scout && !scout.res && !scout.buildings) {
        h.noScout = (h.noScout || []).concat([scout.reportId]).slice(-5);
        scout = null;
      }
      // troops seen in the village (from a scout report)
      if (scout && typeof scout.troops === 'number') h.troops = scout.troops;
      if (scout && scout.buildings) {
        h.buildings = Object.assign(h.buildings || {}, scout.buildings);
        h.scoutReportId = scout.reportId;
        h.scoutTime = T;
        h.scoutPoints = farm.points || 0;
        // fresh exact data replaces what was learned from hauls before
        delete h.prodMin;
        delete h.prodMax;
      }

      let isNewReport = T > 0 && T > (h.lastReport || 0);
      if (isNewReport) {
        let m = buildModel(farm, h, worldSpeed);

        // own attacks that landed up to this report: the last one is the
        // attack this report belongs to, earlier ones took their share before
        // (the report time is the arrival of the attack it belongs to; own =
        // the entry with the closest arrival; attacks arriving after the
        // report are still on their way and keep their entry)
        let sentList = sentListOf(h);
        let landed = sentList
          .filter((x) => x.arrival <= T + 60)
          .sort((a, b) => a.arrival - b.arrival);
        let future = sentList.filter((x) => x.arrival > T + 60);
        let own = null;
        landed.forEach((x) => {
          if (Math.abs(x.arrival - T) < 900 && (!own || Math.abs(x.arrival - T) < Math.abs(own.arrival - T)))
            own = x;
        });
        if (own) landed.splice(landed.indexOf(own), 1);
        let haul = farm.has_loot_info && farm.haul ? farm.haul : null;
        let capSent = own ? own.capacity : haul ? haul.capacity : 0;

        // evaluation: what we expected when sending vs. what came back
        if (own && haul && typeof own.expected === 'number') {
          recordStat({
            time: T,
            coord: coord,
            expected: own.expected,
            actual: haul.carried,
            capacity: own.capacity || haul.capacity,
            full: !!farm.max_loot,
          });
          if (!capSent) capSent = haul.capacity;
        }

        let cur = baseOf(h, T, m);
        landed.forEach((x) => {
          if (x.arrival <= cur.time) return;
          let rawAt = forecastRaw(m, cur.raw, (x.arrival - cur.time) / 3600);
          cur = {
            time: x.arrival,
            raw: takeFrom(m, rawAt, m.exact ? x.capacity : Infinity),
          };
        });
        let rawAtT = forecastRaw(m, cur.raw, (T - cur.time) / 3600);
        if (scout && scout.res) rawAtT = scout.res.slice();

        if (farm.has_loot_info) {
          if (h.emptiedAt && T > h.emptiedAt && capSent > 0) {
            let hours = (T - h.emptiedAt) / 3600;
            // other own attacks in between make an upper bound unreliable
            let others = landed.some((x) => x.arrival > h.emptiedAt);
            if (hours >= 0.25) {
              let rate = capSent / hours;
              if (farm.max_loot) h.prodMin = Math.max(h.prodMin || 0, rate);
              else if (!others && haul) {
                // a partial haul took everything above the hiding place:
                // the haul is exactly the production since it was emptied
                h.prodMin = haul.carried / hours;
                h.prodMax = haul.carried / hours;
              } else if (!others) h.prodMax = Math.min(h.prodMax || Infinity, rate);
              if (h.prodMin && h.prodMax && h.prodMin > h.prodMax) {
                if (farm.max_loot) h.prodMax = h.prodMin;
                else h.prodMin = h.prodMax;
              }
            }
          }
          if (farm.max_loot) {
            // resources scouted in the same report are what was left after
            // the haul; otherwise subtract the haul from the forecast
            h.base = {
              time: T,
              raw: scout && scout.res
                ? rawAtT
                : takeFrom(m, rawAtT, haul ? haul.carried : capSent || capacityA),
              observed: !!(scout && scout.res),
            };
          } else {
            h.base = { time: T, raw: rawAtT.map((v, i) => Math.min(v, m.hidden[i])), observed: true };
            h.emptiedAt = T;
          }
          h.lastFull = !!farm.max_loot;
          h.lastCap = capSent || h.lastCap || 0;
        } else if (scout && scout.res) {
          h.base = { time: T, raw: rawAtT, observed: true };
        } else if (farm.res_estimate) {
          // scout report not loaded (budget): the row shows the game's own
          // extrapolation of that report to now - use it as the stock
          h.base = { time: serverTime, raw: farm.res_estimate.slice(), observed: true };
        } else {
          // no information about the stock in this report: at least keep
          // what the attacks that landed meanwhile took (they are dropped
          // from `sent` below and must not be forgotten)
          h.base = { time: cur.time, raw: cur.raw.slice(), observed: false };
        }
        h.lastReport = T;
        h.sent = future;
      } else if (scout && scout.res && scout.reportId != h.scoutRawId) {
        // same report seen before, but its scout data was loaded just now
        let m = buildModel(farm, h, worldSpeed);
        h.base = {
          time: T,
          raw: farm.has_loot_info && !farm.max_loot
            ? scout.res.map((v, i) => Math.min(v, m.hidden[i]))
            : scout.res.slice(),
          observed: true,
        };
      }
      if (scout && scout.res) h.scoutRawId = scout.reportId;
      if (scout && scout.reportId) h.scoutReportId = scout.reportId;
      history[coord] = h;
    }

    for (let coord in history) {
      let h = history[coord];
      // a learned production limit (often: "others farm here too") is
      // forgotten after a while without a new report, so the village gets a
      // new probe once the others may have stopped
      if (
        (typeof h.prodMin === 'number' || typeof h.prodMax === 'number') &&
        (h.lastReport || 0) < serverTime - RULES.learnedRateDays * 86400
      ) {
        delete h.prodMin;
        delete h.prodMax;
      }
      // sent attacks that never produced a report (cancelled) expire after 2 days
      let sentList = sentListOf(h).filter(
        (x) => x.arrival > serverTime - 2 * 86400
      );
      history[coord].sent = sentList;
      if ((history[coord].lastReport || 0) < keepAfter && !sentList.length)
        delete history[coord];
    }

    saveHistory(history);
    return history;
  };

  const SETTINGS_KEY = 'farmGod_options';

  const loadSettings = function () {
    let options = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || null;
    if (!options) return null;
    let defaults = { optionGroup: 0, optionNewbarbsMaxPoints: 500 };
    for (let key in defaults) {
      if (typeof options[key] === 'undefined') options[key] = defaults[key];
    }
    return options;
  };

  const init = function () {
    if (
      game_data.features.Premium.active &&
      game_data.features.FarmAssistent.active
    ) {
      if (game_data.screen == 'am_farm') {
        $.when(
          lib.ensureUnitInfo().then(null, () => false),
          lib.ensureWorldConfig().then(null, () => false)
        ).then(() => {
          let options = loadSettings();
          // first start: ask once; afterwards plan right away
          if (options) runPlanning(options);
          else showOptions();
        });
      } else {
        location.href = game_data.link_base_pure + 'am_farm';
      }
    } else {
      UI.ErrorMessage(t.missingFeatures);
    }
  };

  const showOptions = function () {
    $.when(buildOptions()).then((html) => {
      Dialog.show('FarmGod', html);

      $('.optionButton')
        .off('click')
        .on('click', () => {
          let options = {
            optionGroup: parseInt($('.optionGroup').val()) || 0,
            optionNewbarbsMaxPoints: Math.max(
              0,
              parseFloat($('.optionNewbarbsMaxPoints').val()) || 0
            ),
          };
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(options));
          Dialog.close();
          runPlanning(options);
        });

      document.querySelector('.optionButton').focus();
    });
  };

  const runPlanning = function (options) {
    $('.farmGodContent').remove();
    $('#am_widget_Farm')
      .first()
      .before(
        `<div class="vis farmGodContent" style="text-align:center;padding:10px;">${UI.Throbber[0].outerHTML}</div>`
      );

    getData(
      options.optionGroup,
      options.optionNewbarbsMaxPoints > 0,
      RULES.attackWithLosses,
      true,
      options.optionNewbarbsMaxPoints
    )
      .then((data) => {
        let plan = createPlanning({}, data);
        $('.farmGodContent').remove();
        $('#am_widget_Farm').first().before(buildTable(plan));

        bindEventHandlers();
        UI.InitProgressBars();
        UI.updateProgressBar($('#FarmGodProgessbar'), 0, plan.counter);
        $('#FarmGodProgessbar').data('current', 0).data('max', plan.counter);
      })
      .catch((e) => {
        console.error('FarmGodSmart:', e);
        let msg = e === 'blocked' ? t.messages.blocked : t.messages.loadError;
        $('.farmGodContent').html(
          `<div class="vis farmGodContent" style="padding:10px;">FarmGodSmart: ${msg} <a href="#" class="farmGodSettings">${t.table.settings}</a></div>`
        );
        $('.farmGodSettings')
          .off('click')
          .on('click', (ev) => {
            ev.preventDefault();
            showOptions();
          });
      });
  };

  const bindEventHandlers = function () {
    $('.farmGod_icon')
      .off('click')
      .on('click', function () {
        if (
          game_data.market != 'nl' ||
          $(this).data('origin') == curVillage
        ) {
          sendFarm($(this));
        } else {
          UI.ErrorMessage(t.messages.villageError);
        }
      });

    $(document)
      .off('keydown.farmgod')
      .on('keydown.farmgod', (event) => {
        if ((event.keyCode || event.which) == 13) {
          if ($(event.target).is('input, select, textarea')) return;
          $('.farmGod_icon').first().trigger('click');
        }
      });

    $('.farmGodSettings')
      .off('click')
      .on('click', function (e) {
        e.preventDefault();
        showOptions();
      });

    $('.switchVillage')
      .off('click')
      .on('click', function () {
        curVillage = $(this).data('id');
        UI.SuccessMessage(t.messages.villageChanged);
        $(this).closest('tr').remove();
      });
  };

  // warning if the Farm Assistant filters / templates are not set as expected
  const warningHtml = function () {
    let checkboxSettings = [false, true, true, true, false];
    let checkboxError = $('#plunder_list_filters')
      .find('input[type="checkbox"]')
      .map((i, el) => {
        return $(el).prop('checked') != checkboxSettings[i];
      })
      .get()
      .includes(true);
    let $templateRows = $('form[action*="action=edit_all"]')
      .find('input[type="hidden"][name*="template"]')
      .closest('tr');
    let templateError =
      $templateRows.first().find('td').last().text().toNumber() >=
      $templateRows.last().find('td').last().text().toNumber();

    return checkboxError || templateError
      ? `<div class="info_box" style="line-height: 15px;font-size:10px;text-align:left;"><p style="margin:0px 5px;">${t.options.warning}<br><img src="${t.options.filterImage}" style="width:100%;"></p></div><br>`
      : ``;
  };

  const buildOptions = function () {
    let options = loadSettings() || {
      optionGroup: 0,
      optionNewbarbsMaxPoints: 500,
    };

    return $.when(buildGroupSelect(options.optionGroup)).then(
      (groupSelect) => {
        return `<style>#popup_box_FarmGod{text-align:center;width:550px;}</style>
                <h3>${t.options.title}</h3><br><div class="optionsContent">
                ${warningHtml()}
                <div style="width:90%;margin:auto;background: url(\'graphic/index/main_bg.jpg\') 100% 0% #E3D5B3;border: 1px solid #7D510F;border-collapse: separate !important;border-spacing: 0px !important;"><table class="vis" style="width:100%;text-align:left;font-size:11px;">
                  <tr><td>${t.options.group}</td><td>${groupSelect}</td></tr>
                  <tr><td>${t.options.newbarbsMaxPoints
          }</td><td><input type="text" size="5" class="optionNewbarbsMaxPoints" value="${options.optionNewbarbsMaxPoints
          }"></td></tr>
                </table></div><br><input type="button" class="btn optionButton" value="${t.options.button
          }"></div>`;
      }
    );
  };

  const buildGroupSelect = function (id) {
    return $.get(
      TribalWars.buildURL('GET', 'groups', { ajax: 'load_group_menu' })
    ).then((groups) => {
      let html = `<select class="optionGroup">`;

      groups.result.forEach((val) => {
        if (val.type == 'separator') {
          html += `<option disabled=""/>`;
        } else {
          html += `<option value="${val.group_id}" ${val.group_id == id ? 'selected' : ''
            }>${val.name}</option>`;
        }
      });

      html += `</select>`;

      return html;
    });
  };

  // label for the "last haul" column: full / not full + age of the report
  const lootLabel = function (loot) {
    let tag = '';
    if (loot && loot.scouted) {
      let age =
        loot.scoutAgeHours === null
          ? ''
          : loot.scoutAgeHours < 48
            ? ` (${Math.round(loot.scoutAgeHours)}h)`
            : ` (${Math.round(loot.scoutAgeHours / 24)}d)`;
      tag = ` <span title="${t.table.scoutedTitle}${age}">🔍${age}</span>`;
    }
    if (loot && loot.isNew)
      return `<span style="color:#1a4d8f;">${t.table.lootNew}</span>` + tag;
    if (!loot || !loot.known) return t.table.lootUnknown + tag;
    let label = loot.full ? t.table.lootFull : t.table.lootPartial;
    if (loot.ageMinutes !== null) {
      let h = Math.floor(loot.ageMinutes / 60);
      let m = Math.round(loot.ageMinutes % 60);
      label += ` (${h > 0 ? h + 'h ' : ''}${m}min ${t.table.ago})`;
    }
    return (
      (loot.full
        ? `<span style="color:#0a7d00;">${label}</span>`
        : `<span style="color:#8a4b00;">${label}</span>`) + tag
    );
  };

  const formatTime = function (ts) {
    let d = new Date(ts * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const buildTable = function (plan) {
    let farms = plan.farms;
    let totalLoot = 0;
    let firstBack = null;
    for (let prop in farms) {
      farms[prop].forEach((val) => {
        totalLoot += val.expected;
        if (firstBack === null || val.returnTime < firstBack) firstBack = val.returnTime;
      });
    }
    let summary =
      plan.counter > 0
        ? `${plan.counter} ${t.table.attacks} · ~${Math.round(totalLoot)} ${t.table.totalLoot} · ${t.table.troopsBack} ${formatTime(firstBack)}`
        : t.table.noFarmsPlanned;

    let stats = statsSummary();
    let statsLine =
      stats.n > 0
        ? `<div style="text-align:center;padding:0 6px 2px 6px;font-size:10px;color:#444;" title="${t.table.statsTitle}">${t.table.stats
            .replace('%n', stats.n)
            .replace('%fill', stats.fill)
            .replace('%bias', (stats.bias > 0 ? '+' : '') + stats.bias)
            .replace('%error', stats.error)}</div>`
        : '';

    let html = `<div class="vis farmGodContent">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 6px;">
                  <b>FarmGod</b><span>${summary}</span><a href="#" class="farmGodSettings">${t.table.settings}</a>
                </div>
                ${statsLine}
                ${warningHtml()}
                <table class="vis" width="100%">
                <tr><div id="FarmGodProgessbar" class="progress-bar live-progress-bar progress-bar-alive" style="width:98%;margin:5px auto;"><div style="background: rgb(146, 194, 0);"></div><span class="label" style="margin-top:0px;"></span></div></tr>
                <tr><th style="text-align:center;">${t.table.origin}</th><th style="text-align:center;">${t.table.target}</th><th style="text-align:center;">${t.table.fields}</th><th style="text-align:center;">${t.table.expected}</th><th style="text-align:center;">${t.table.loot}</th><th style="text-align:center;">${t.table.back}</th><th style="text-align:center;">${t.table.farm}</th></tr>`;

    if (!$.isEmptyObject(farms)) {
      for (let prop in farms) {
        if (game_data.market == 'nl') {
          html += `<tr><td colspan="7" style="background: #e7d098;"><input type="button" class="btn switchVillage" data-id="${farms[prop][0].origin.id}" value="${t.table.goTo} ${farms[prop][0].origin.name} (${farms[prop][0].origin.coord})" style="float:right;"></td></tr>`;
        }

        farms[prop].forEach((val, i) => {
          let details = `${val.points ? val.points + ' P' : '?'} · ~${Math.round(val.production)}/h · ${Math.round(val.score)} ${t.table.score}`;
          html += `<tr class="farmRow row_${i % 2 == 0 ? 'a' : 'b'}">
                    <td style="text-align:center;"><a href="${game_data.link_base_pure
            }info_village&id=${val.origin.id}">${val.origin.name} (${val.origin.coord
            })</a></td>
                    <td style="text-align:center;"><a href="${game_data.link_base_pure
            }info_village&id=${val.target.id}">${val.target.coord
            }</a></td>
                    <td style="text-align:center;">${val.fields.toFixed(1)}</td>
                    <td style="text-align:center;" title="${details}">~${Math.round(val.expected)} / ${val.capacity
            }${val.fallback ? ` <span style="color:#a00;">(${t.table.fallbackTag})</span>` : ''}${val.probe ? ` <span style="color:#1a4d8f;">(${t.table.probeTag})</span>` : ''}</td>
                    <td style="text-align:center;">${lootLabel(val.loot)}</td>
                    <td style="text-align:center;">${formatTime(val.returnTime)}</td>
                    <td style="text-align:center;"><a href="#" data-origin="${val.origin.id
            }" data-target="${val.target.id}" data-template="${val.template.id
            }" data-coord="${val.target.coord}" data-travel="${val.travel
            }" data-capacity="${val.capacity
            }" data-expected="${Math.round(val.expected)
            }" class="farmGod_icon farm_icon farm_icon_${val.template.name
            }" style="margin:auto;"></a></td>
                  </tr>`;
        });
      }
    }

    html += `</table></div>`;

    return html;
  };

  const VILLAGES_KEY = 'FarmGodSmart_villages';

  // Running attacks with known capacity (unit columns of the commands
  // overview) are remembered like own sent attacks, so their reports are
  // matched later even if the attack was sent from another device or by hand.
  const rememberRunningAttacks = function (data) {
    let history = loadHistory();
    let changed = false;
    for (let coord in data.commands) {
      if (!data.farms.farms.hasOwnProperty(coord)) continue;
      data.commands[coord].forEach((e) => {
        if (typeof e !== 'object' || !(e.cap > 0)) return;
        let list = sentListOf(history[coord] || {});
        if (list.some((x) => Math.abs(x.arrival - e.ts) < 120)) return;
        if (!history[coord]) history[coord] = {};
        history[coord].sent = list.concat([{ arrival: e.ts, capacity: e.cap }]).slice(-20);
        changed = true;
      });
    }
    if (changed) saveHistory(history);
  };

  const getData = function (
    group,
    newbarbs,
    losses,
    autoProduction,
    newbarbsMaxPoints
  ) {
    let data = {
      villages: {},
      commands: {},
      farms: { templates: {}, farms: {} },
      points: {},
      newbarbs: {},
    };

    // One request for the world's village list: points of every village
    // (production estimate) and, if wanted, all barbarian/bonus villages
    // (player id 0) up to the points limit as farm candidates. The list is
    // cached for villageListHours (only the columns the script needs, so it
    // fits into localStorage on big worlds too).
    let applyVillageList = (compact) => {
      (String(compact).match(/[^\r\n]+/g) || []).forEach((line) => {
        let [id, x, y, player_id, points] = line.split(',');
        if (!x || !y) return;
        let coord = `${x}|${y}`;
        let pts = parseInt(points) || 0;
        data.points[coord] = pts;
        if (
          newbarbs &&
          player_id == 0 &&
          (!newbarbsMaxPoints || pts <= newbarbsMaxPoints)
        ) {
          data.newbarbs[coord] = { id: parseInt(id), points: pts };
        }
      });
      return data;
    };
    let loadVillageList = () => {
      if (!autoProduction && !newbarbs) return data;
      let now = Math.round(lib.getCurrentServerTime() / 1000);
      let cached = null;
      try {
        cached = JSON.parse(localStorage.getItem(VILLAGES_KEY));
      } catch (e) {
        /* ignore */
      }
      if (cached && cached.text && now - cached.time < RULES.villageListHours * 3600) {
        return applyVillageList(cached.text);
      }
      return twLib.get('/map/village.txt').then(
        (allVillages) => {
          // id,name,x,y,player_id,points,rank -> id,x,y,player_id,points
          let compact = (String(allVillages).match(/[^\r\n]+/g) || [])
            .map((line) => {
              let [id, , x, y, player_id, points] = line.split(',');
              return x && y ? [id, x, y, player_id, points].join(',') : '';
            })
            .filter(Boolean)
            .join('\n');
          try {
            localStorage.setItem(VILLAGES_KEY, JSON.stringify({ time: now, text: compact }));
          } catch (e) {
            /* too big for localStorage: load it every run then */
          }
          return applyVillageList(compact);
        },
        () => data // could not load -> no new barbs, manual production value
      );
    };

    let villagesProcessor = ($html) => {
      let skipUnits = ['ram', 'catapult', 'knight', 'snob', 'militia'];
      const mobileCheck = $('#mobileHeader').length > 0;

      if (mobileCheck) {
        let table = jQuery($html).find('.overview-container > div');
        table.each((i, el) => {
          try {
            const villageId = jQuery(el)
              .find('.quickedit-vn')
              .data('id');
            const name = jQuery(el)
              .find('.quickedit-label')
              .attr('data-text');
            const coord = jQuery(el)
              .find('.quickedit-label')
              .text()
              .toCoord();

            const units = new Array(game_data.units.length).fill(0);
            const unitsElements = jQuery(el).find(
              '.overview-units-row > div.unit-row-item'
            );

            unitsElements.each((_, unitElement) => {
              const img = jQuery(unitElement).find('img');
              const span =
                jQuery(unitElement).find('span.unit-row-name');
              if (img.length && span.length) {
                let unitType = img
                  .attr('src')
                  .split('unit_')[1]
                  .replace('@2x.webp', '')
                  .replace('.webp', '')
                  .replace('.png', '');
                const value = parseInt(span.text()) || 0;
                const unitIndex =
                  game_data.units.indexOf(unitType);
                if (unitIndex !== -1) {
                  units[unitIndex] = value;
                }
              }
            });

            const filteredUnits = units.filter(
              (_, index) =>
                skipUnits.indexOf(game_data.units[index]) === -1
            );

            data.villages[coord] = {
              name: name,
              id: villageId,
              units: filteredUnits,
            };
          } catch (e) {
            console.error('Error processing village data:', e);
          }
        });
      } else {
        $html
          .find('#combined_table')
          .find('.row_a, .row_b')
          .filter((i, el) => {
            return $(el).find('.bonus_icon_33').length == 0;
          })
          .map((i, el) => {
            let $el = $(el);
            let $qel = $el.find('.quickedit-label').first();
            let units = [];

            units = $el
              .find('.unit-item')
              .filter((index, element) => {
                return (
                  skipUnits.indexOf(game_data.units[index]) ==
                  -1
                );
              })
              .map((index, element) => {
                return $(element).text().toNumber();
              })
              .get();

            return (data.villages[$qel.text().toCoord()] = {
              name: $qel.data('text'),
              id: parseInt(
                $el.find('.quickedit-vn').first().data('id')
              ),
              units: units,
            });
          });
      }

      console.log('villages', data.villages);
      return data;
    };

    // Running attacks: arrival time and, if the overview shows the unit
    // columns, the exact carry capacity (also for attacks sent from another
    // device or by hand; the localStorage memory is only the fallback).
    let commandsProcessor = ($html) => {
      let $table = $html.find('#commands_table');
      let unitCarry = lib.getUnitCarry();
      let unitOrder = $table
        .find('th img[src*="/unit/unit_"]')
        .map((i, img) => ($(img).attr('src').match(/unit_([a-z]+)/) || [])[1])
        .get();
      $table
        .find('.row_a, .row_ax, .row_b, .row_bx')
        .map((i, el) => {
          let $el = $(el);
          let coord = $el
            .find('.quickedit-label')
            .first()
            .text()
            .toCoord();

          if (coord) {
            if (!data.commands.hasOwnProperty(coord))
              data.commands[coord] = [];
            let ts = Math.round(
              lib.timestampFromString(
                $el.find('td').eq(2).text().trim()
              ) / 1000
            );
            let $units = $el.find('td.unit-item');
            if ($units.length && $units.length === unitOrder.length) {
              let cap = 0;
              $units.each((j, td) => {
                cap += (parseInt($(td).text()) || 0) * (unitCarry[unitOrder[j]] || 0);
              });
              return data.commands[coord].push({ ts, cap });
            }
            return data.commands[coord].push(ts);
          }
        });

      return data;
    };

    let farmProcessor = ($html) => {
      if ($.isEmptyObject(data.farms.templates)) {
        let unitSpeeds = lib.getUnitSpeeds() || {};
        let unitCarry = lib.getUnitCarry();

        $html
          .find('form[action*="action=edit_all"]')
          .find('input[type="hidden"][name*="template"]')
          .closest('tr')
          .map((i, el) => {
            let $el = $(el);

            return (data.farms.templates[
              $el
                .prev('tr')
                .find('a.farm_icon')
                .first()
                .attr('class')
                .match(/farm_icon_(.*)\s/)[1]
            ] = {
              id: $el
                .find(
                  'input[type="hidden"][name*="template"][name*="[id]"]'
                )
                .first()
                .val()
                .toNumber(),
              units: $el
                .find(
                  'input[type="text"], input[type="number"]'
                )
                .map((index, element) => {
                  return $(element).val().toNumber();
                })
                .get(),
              speed: Math.max(
                ...$el
                  .find(
                    'input[type="text"], input[type="number"]'
                  )
                  .map((index, element) => {
                    return $(element).val().toNumber() > 0
                      ? unitSpeeds[
                      $(element)
                        .attr('name')
                        .trim()
                        .split('[')[0]
                      ] || 0
                      : 0;
                  })
                  .get()
              ),
              // total carry capacity of the template
              capacity: $el
                .find('input[type="text"], input[type="number"]')
                .map((index, element) => {
                  let amount = $(element).val().toNumber();
                  let unit = $(element).attr('name').trim().split('[')[0];
                  return amount > 0 && unitCarry[unit]
                    ? amount * unitCarry[unit]
                    : 0;
                })
                .get()
                .reduce((sum, v) => sum + v, 0),
            });
          });
      }

      $html
        .find('#plunder_list')
        .find('tr[id^="village_"]')
        .map((i, el) => {
          let $el = $(el);

          return (data.farms.farms[
            $el
              .find('a[href*="screen=report&mode=all&view="]')
              .first()
              .text()
              .toCoord()
          ] = {
            id: $el.attr('id').split('_')[1].toNumber(),
            color: $el
              .find('img[src*="graphic/dots/"]')
              .attr('src')
              .match(/dots\/(green|yellow|red|blue|red_blue)/)[1],
            max_loot: $el.find('img[src*="max_loot/1"]').length > 0,
            // id of the last report (link in the row) and whether the row
            // shows resource numbers (=> the report contains scout info)
            report_id: parseInt(
              (
                ($el.find('a[href*="screen=report&mode=all&view="]').first().attr('href') || '').match(/view=(\d+)/) || []
              )[1]
            ) || 0,
            has_res_info:
              $el.find('.icon.header.wood, .icon.header.stone, .icon.header.iron').length > 0 ||
              $el.find('img[src*="/wood"], img[src*="holz"]').length > 0,
            // the game's own extrapolation "resources now, from the last scout
            // report" shown in the row (only when the last report is a scout
            // report); free of charge, no report request needed
            res_estimate: (() => {
              let vals = ['wood', 'stone', 'iron'].map((k) => {
                let $icon = $el.find(`.icon.header.${k}`).first();
                if (!$icon.length) return NaN;
                let $num = $icon.closest('.nowrap').find('.res, .warn').first();
                let txt = $num.length ? $num.text() : ($icon[0].nextSibling || {}).textContent || '';
                return parseInt(String(txt).replace(/[^\d]/g, ''));
              });
              return vals.every((v) => !isNaN(v)) ? vals : null;
            })(),
            // true if the row has a haul icon at all (attack report with loot);
            // scout-only reports have none and count as "unknown"
            has_loot_info: $el.find('img[src*="max_loot/"]').length > 0,
            // unix timestamp (seconds) of the last report, 0 if not parseable
            report_time: lib.parseReportTime($el),
          });
        });

      return data;
    };

    let filterFarms = () => {
      data.farms.farms = Object.fromEntries(
        Object.entries(data.farms.farms).filter(([key, val]) => {
          return (
            !val.hasOwnProperty('color') ||
            (val.color != 'red' &&
              val.color != 'red_blue' &&
              (val.color != 'yellow' || losses))
          );
        })
      );

      return data;
    };

    return Promise.all([
      lib.processAllPages(
        TribalWars.buildURL('GET', 'overview_villages', {
          mode: 'combined',
          group: group,
        }),
        villagesProcessor
      ),
      lib.processAllPages(
        TribalWars.buildURL('GET', 'overview_villages', {
          mode: 'commands',
          type: 'attack',
        }),
        commandsProcessor
      ),
      lib.processAllPages(
        TribalWars.buildURL('GET', 'am_farm'),
        farmProcessor
      ),
      loadVillageList(),
    ])
      .then(() => {
        // villages without any report yet: add as "new" farm candidates.
        // Must happen BEFORE filterFarms, so villages that are in the
        // Farm Assistant with losses (yellow/red) do not come back as "new".
        for (let coord in data.newbarbs) {
          if (!data.farms.farms.hasOwnProperty(coord)) {
            data.farms.farms[coord] = {
              id: data.newbarbs[coord].id,
              is_new: true,
            };
          }
        }
        return data;
      })
      .then(filterFarms)
      .then(() => {
        for (let coord in data.farms.farms) {
          if (data.points.hasOwnProperty(coord))
            data.farms.farms[coord].points = data.points[coord];
        }
        rememberRunningAttacks(data);
        return fetchNewScoutReports(data.farms.farms)
          .then((farms) =>
            backfillScoutReports(
              farms,
              Math.round(lib.getCurrentServerTime() / 1000),
              RULES.maxReportFetches - (farms._fetched || 0)
            )
          )
          .then(() => data);
      });
  };

  const createPlanning = function (options, data) {
    let plan = { counter: 0, farms: {} };
    let serverTime = Math.round(lib.getCurrentServerTime() / 1000);

    const hasLootInfo = (farm) =>
      farm.hasOwnProperty('has_loot_info') && farm.has_loot_info;

    const capacityA = data.farms.templates.a
      ? data.farms.templates.a.capacity || 0
      : 0;
    const worldConfig = lib.getWorldConfig() || {};
    const worldSpeed = worldConfig.speed || 1;
    const tempo = worldSpeed * (worldConfig.unit_speed || 1);
    const minScore = RULES.minScorePerSpeed * tempo;
    const history = learnFromReports(data.farms.farms, serverTime, capacityA, worldSpeed);
    const historyOf = (farm) => history[farm.coord] || {};
    // planning model: until a partial haul has shown the effective production
    // of a village, only contestedFactor of the extrapolated production counts
    const modelOf = (farm) => {
      let h = historyOf(farm);
      let m = buildModel(farm, h, worldSpeed);
      if (typeof h.prodMax !== 'number' && RULES.contestedFactor < 1) {
        m.prod = m.prod.map((p) => p * RULES.contestedFactor);
      }
      return m;
    };
    const productionOf = (farm) =>
      modelOf(farm).prod.reduce((a, b) => a + b, 0);

    // attacks on the way / planned: arrival + capacity they will take
    const eventsOf = (coord) =>
      (data.commands[coord] || []).map((e) => {
        if (typeof e === 'object') return e;
        let h = history[coord] || {};
        let match = sentListOf(h).find((x) => Math.abs(x.arrival - e) < 900);
        return { ts: e, cap: match ? match.capacity : capacityA };
      });

    // Loot we expect to find at time t: last known state, production since,
    // minus what earlier attacks (running or planned in this run) take.
    const lootableAt = (farm, t) => {
      let m = modelOf(farm);
      let cur = baseOf(historyOf(farm), t, m);
      eventsOf(farm.coord)
        .filter((e) => e.ts > cur.time && e.ts <= t)
        .sort((a, b) => a.ts - b.ts)
        .forEach((e) => {
          let rawAtE = forecastRaw(m, cur.raw, (e.ts - cur.time) / 3600);
          // stock known (scouted / emptied recently): subtract the capacity;
          // stock only extrapolated: assume the earlier attack empties it
          let known = stockKnownAt(historyOf(farm), m, e.ts);
          cur = { time: e.ts, raw: takeFrom(m, rawAtE, known ? e.cap : Infinity) };
        });
      return lootableOf(m, forecastRaw(m, cur.raw, (t - cur.time) / 3600));
    };

    // usable templates (at least one unit) and what fits into the troops
    const usable = (tpl) =>
      tpl && Array.isArray(tpl.units) && tpl.units.some((u) => u > 0);
    const templateA = usable(data.farms.templates.a) ? data.farms.templates.a : null;
    const templateB = usable(data.farms.templates.b) ? data.farms.templates.b : null;

    // Pass 1 always uses the small template A (spread the troops over as
    // many villages as possible); B only if A is not usable at all.
    const pickTemplate = (origin) => {
      let order = [];
      if (templateA) order.push(['a', templateA]);
      if (templateB && (!templateA || RULES.templateFallback)) order.push(['b', templateB]);
      for (let [name, template] of order) {
        let unitsLeft = lib.subtractArrays(origin.units, template.units);
        if (unitsLeft) return { name, template, unitsLeft };
      }
      return false;
    };

    // Radius derived from the rules: villages without a report only up to the
    // probe limit, known villages as far as a full B (or A) trip can still
    // reach the minimum loot per hour of travel.
    const refSpeed = (templateA || templateB || {}).speed || 10; // min per field
    const fieldsFor = (hours) => (hours * 60) / refSpeed;
    const biggestCapacity = Math.max(
      templateA ? templateA.capacity || 0 : 0,
      templateB ? templateB.capacity || 0 : 0
    );
    const maxProbeFields = fieldsFor(RULES.probeMaxTravelHours);
    const maxKnownFields = fieldsFor(
      Math.max(
        RULES.probeMaxTravelHours,
        minScore > 0 ? biggestCapacity / (2 * minScore) : 0
      )
    );

    // Every origin village with its candidate targets. The assignment is
    // global: passes 1, 2c and 2d look at all (origin, target) pairs at once,
    // so the origin with the best loot per hour of travel gets the target,
    // not the origin that happens to come first in the overview.
    const origins = Object.keys(data.villages).map((prop) => ({
      prop,
      origin: data.villages[prop],
      planned: 0,
      candidates: Object.keys(data.farms.farms)
        .map((coord) => ({ coord, dis: lib.getDistance(prop, coord) }))
        .filter((c) =>
          data.farms.farms[c.coord].is_new
            ? c.dis <= maxProbeFields
            : c.dis <= maxKnownFields
        )
        .filter((c) => !((history[c.coord] || {}).troops > 0)), // scouted troops
    }));
    origins.forEach((o) =>
      o.candidates.forEach((c) => {
        data.farms.farms[c.coord].coord = c.coord;
        if (!data.commands.hasOwnProperty(c.coord)) data.commands[c.coord] = [];
      })
    );

    const scoreOf = (entry) =>
      entry.travel > 0 ? entry.expected / ((2 * entry.travel) / 3600) : entry.expected;
    const stockBefore = (entry) => lootableAt(entry.farm, entry.arrival - 1);
    // Template B only where the estimate stands on solid ground: scouted
    // buildings (hiding place, warehouse and mines are exact, production is
    // still damped by contestedFactor) or the effective production has been
    // learned from a partial haul. A stock that is extrapolated from points
    // alone gets a probe with A - other players farm the same villages, and
    // one A per village spreads the risk and teaches the effective
    // production. Stacking several attacks on one village still requires a
    // fresh observation (trustHours, see lootableAt).
    const bWorthy = (farm, t) => {
      let h = historyOf(farm);
      return typeof h.prodMax === 'number' || modelOf(farm).exact;
    };
    const entriesOf = (o) => plan.farms[o.prop] || [];
    const plannedTargets = () => {
      let planned = {};
      origins.forEach((o) => entriesOf(o).forEach((entry) => (planned[entry.target.coord] = true)));
      return planned;
    };

    const newEntry = (o, farm, dis, templateName, template, arrival, travel, expected, flags) => {
      let event = { ts: arrival, cap: template.capacity || 0 };
      let m = modelOf(farm);
      let h = historyOf(farm);
      return Object.assign(
        {
          origin: { coord: o.prop, name: o.origin.name, id: o.origin.id },
          target: { coord: farm.coord, id: farm.id },
          farm,
          event,
          fields: dis,
          template: { name: templateName, id: template.id },
          expected,
          capacity: template.capacity || 0,
          score: travel > 0 ? expected / ((2 * travel) / 3600) : expected,
          fallback: false,
          returnTime: arrival + travel,
          arrival,
          travel,
          points: farm.points || 0,
          production: productionOf(farm),
          scouted: m.exact,
          loot: {
            known: hasLootInfo(farm),
            scouted: m.exact,
            scoutAgeHours: h.scoutTime ? Math.max(0, (serverTime - h.scoutTime) / 3600) : null,
            isNew: !!farm.is_new,
            full: !!farm.max_loot,
            ageMinutes: farm.report_time > 0 ? Math.max(0, (serverTime - farm.report_time) / 60) : null,
          },
        },
        flags || {}
      );
    };
    const addEntry = (o, entry, unitsLeft) => {
      plan.counter++;
      o.planned++;
      o.origin.units = unitsLeft;
      if (!plan.farms.hasOwnProperty(o.prop)) plan.farms[o.prop] = [];
      plan.farms[o.prop].push(entry);
      data.commands[entry.target.coord].push(entry.event);
    };

    // ---- pass 1: greedy by loot per hour of travel, template A, over all
    // (origin, target) pairs
    while (true) {
      let scored = [];
      origins.forEach((o) => {
        let choice = pickTemplate(o.origin);
        if (!choice) return;
        o.candidates.forEach((c) => {
          let farm = data.farms.farms[c.coord];
          let travel = Math.round(c.dis * choice.template.speed * 60);
          let arrival = serverTime + travel + Math.round(plan.counter / 5);
          let capacity = choice.template.capacity || 0;
          let expected = Math.min(lootableAt(farm, arrival), capacity);
          let roundTripHours = (2 * travel) / 3600;
          scored.push({
            o,
            farm,
            dis: c.dis,
            templateName: choice.name,
            template: choice.template,
            unitsLeft: choice.unitsLeft,
            arrival,
            travel,
            capacity,
            expected,
            score: roundTripHours > 0 ? expected / roundTripHours : expected,
          });
        });
      });
      if (scored.length == 0) break;
      scored.sort((a, b) => b.score - a.score || a.dis - b.dis);

      // list is sorted by score, so the first entry that passes the
      // minimum is also the best one
      let pick = scored.find((s) => s.expected > 0 && s.score >= minScore);
      let isFallback = false;
      if (!pick) {
        if (RULES.fallbackMode == 'none') break;
        // 'best': one fallback attack per origin that has nothing yet
        pick = scored.find(
          (s) =>
            s.expected > 0 &&
            s.expected >= s.capacity * RULES.fallbackMinFill &&
            (RULES.fallbackMode != 'best' || s.o.planned == 0)
        );
        if (!pick) break;
        isFallback = true;
      }
      addEntry(
        pick.o,
        newEntry(pick.o, pick.farm, pick.dis, pick.templateName, pick.template, pick.arrival, pick.travel, pick.expected, {
          fallback: isFallback,
        }),
        pick.unitsLeft
      );
    }

    // ---- pass 2: use what would stay at home
    const passTwo = templateA && templateB && templateB.capacity > templateA.capacity;
    if (passTwo) {
      const makeB = (entry, stock) => {
        entry.template = { name: 'b', id: templateB.id };
        entry.capacity = templateB.capacity;
        entry.event.cap = templateB.capacity;
        entry.expected = Math.min(stock, templateB.capacity);
        entry.score = scoreOf(entry);
      };
      let extra = templateB.units.map((u, i) => u - (templateA.units[i] || 0));
      let canGrow = extra.every((u) => u >= 0);
      let perB = Math.max(
        ...templateB.units.map((u, i) =>
          u > 0 ? (templateA.units[i] > 0 ? Math.ceil(u / templateA.units[i]) : Infinity) : 0
        )
      );

      // 2a / 2b work on the attacks of one origin (its troops, its entries)
      origins.forEach((o) => {
        if (!plan.farms[o.prop]) return;
        let origin = o.origin;
        const entries = () => plan.farms[o.prop];
        const dropEntry = (entry) => {
          let idx = entries().indexOf(entry);
          if (idx >= 0) entries().splice(idx, 1);
          let cmds = data.commands[entry.target.coord] || [];
          let ci = cmds.indexOf(entry.event);
          if (ci >= 0) cmds.splice(ci, 1);
          origin.units = origin.units.map((u, i) => u + (templateA.units[i] || 0));
          plan.counter--;
          o.planned--;
        };

        // 2a: several A attacks on one village (known big stock) -> one B
        if (perB > 1 && isFinite(perB)) {
          while (true) {
            let groups = {};
            entries().forEach((entry) => {
              if (entry.template.name != 'a' || entry.farm.is_new) return;
              (groups[entry.target.coord] = groups[entry.target.coord] || []).push(entry);
            });
            let group = Object.values(groups).find(
              (g) => g.length >= perB && bWorthy(g[0].farm, g[0].arrival)
            );
            let donor = null;
            if (!group && perB > 2) {
              // one A short of a B: take the troops from the weakest other A
              // attack if the bigger haul more than makes up for it
              let short = Object.values(groups)
                .filter((g) => g.length == perB - 1 && bWorthy(g[0].farm, g[0].arrival))
                .map((g) => ({ g, stock: stockBefore(g[0]) }))
                .filter((x) => x.stock >= templateB.capacity * RULES.bFillRatio)
                .sort((x, y) => y.stock - x.stock)[0];
              if (short) {
                let gain =
                  Math.min(short.stock, templateB.capacity) -
                  (perB - 1) * templateA.capacity;
                let weakest = entries()
                  .filter((e) => e.template.name == 'a' && short.g.indexOf(e) < 0)
                  .sort((x, y) => x.expected - y.expected || y.travel - x.travel)[0];
                if (weakest && gain >= weakest.expected) {
                  group = short.g;
                  donor = weakest;
                }
              }
            }
            if (!group) break;
            group.sort((x, y) => x.arrival - y.arrival);
            let first = group[0];
            let stock = stockBefore(first);
            if (stock < templateB.capacity * RULES.bFillRatio) break;
            if (donor) dropEntry(donor);
            group.slice(1, perB).forEach(dropEntry);
            origin.units = origin.units.map((u, i) => u + (templateA.units[i] || 0) - templateB.units[i]);
            makeB(first, stock);
          }
        }

        if (canGrow) {
          // 2b: enlarge planned A attacks on the fullest villages to B. If the
          // troops at home are not enough, the weakest other A attacks give
          // theirs - as long as the bigger haul makes up for what they lose.
          while (true) {
            let upgradeable = entries()
              .filter((entry) => entry.template.name == 'a' && !entry.farm.is_new && bWorthy(entry.farm, entry.arrival))
              .map((entry) => ({ entry, stock: stockBefore(entry) }))
              .filter((x) => x.stock >= templateB.capacity * RULES.bFillRatio)
              .sort((x, y) => y.stock - x.stock);
            if (!upgradeable.length) break;
            let best = upgradeable[0];
            let unitsLeft = lib.subtractArrays(origin.units, extra);
            let donors = [];
            if (!unitsLeft) {
              let gain = Math.min(best.stock, templateB.capacity) - best.entry.capacity;
              let pool = entries()
                .filter((e) => e.template.name == 'a' && e !== best.entry)
                .sort((x, y) => x.expected - y.expected || y.travel - x.travel);
              let units = origin.units.slice();
              let lost = 0;
              for (let e of pool) {
                donors.push(e);
                lost += e.expected;
                units = units.map((u, i) => u + (templateA.units[i] || 0));
                unitsLeft = lib.subtractArrays(units, extra);
                if (unitsLeft || lost > gain) break;
              }
              if (!unitsLeft || lost > gain) break;
              donors.forEach(dropEntry);
              unitsLeft = lib.subtractArrays(origin.units, extra);
              if (!unitsLeft) break;
            }
            origin.units = unitsLeft;
            makeB(best.entry, best.stock);
          }
        }
      });

      // 2c: remaining troops -> new B attacks on full villages that were
      // not worth an A trip (typically far away), best score over all
      // (origin, target) pairs first
      while (true) {
        let planned = plannedTargets();
        let best = null;
        origins.forEach((o) => {
          let unitsLeft = lib.subtractArrays(o.origin.units, templateB.units);
          if (!unitsLeft) return;
          o.candidates.forEach((c) => {
            let farm = data.farms.farms[c.coord];
            if (farm.is_new || planned[c.coord]) return;
            let travel = Math.round(c.dis * templateB.speed * 60);
            let arrival = serverTime + travel + Math.round(plan.counter / 5);
            if (!bWorthy(farm, arrival)) return;
            let stock = lootableAt(farm, arrival);
            if (stock < templateB.capacity * RULES.bFillRatio) return;
            let expected = Math.min(stock, templateB.capacity);
            let score = travel > 0 ? expected / ((2 * travel) / 3600) : expected;
            if (score < minScore) return;
            if (!best || score > best.score) best = { o, unitsLeft, farm, dis: c.dis, travel, arrival, expected, score };
          });
        });
        if (!best) break;
        addEntry(
          best.o,
          newEntry(best.o, best.farm, best.dis, 'b', templateB, best.arrival, best.travel, best.expected),
          best.unitsLeft
        );
      }
    }

    // ---- pass 2d: troops still at home probe villages without a report
    // (information is worth more than the trip), nearest pair first
    if (templateA) {
      let planned = plannedTargets();
      let probes = [];
      origins.forEach((o) =>
        o.candidates.forEach((c) => {
          if (!data.farms.farms[c.coord].is_new || planned[c.coord]) return;
          let travel = Math.round(c.dis * templateA.speed * 60);
          if (travel <= RULES.probeMaxTravelHours * 3600) probes.push({ o, c, travel });
        })
      );
      probes.sort((x, y) => x.travel - y.travel);
      for (let p of probes) {
        let unitsLeft = lib.subtractArrays(p.o.origin.units, templateA.units);
        if (!unitsLeft) continue;
        let farm = data.farms.farms[p.c.coord];
        if (data.commands[p.c.coord].length) continue; // already on the way / probed by another origin
        let arrival = serverTime + p.travel + Math.round(plan.counter / 5);
        let expected = Math.min(lootableAt(farm, arrival), templateA.capacity || 0);
        if (expected <= 0) continue;
        addEntry(
          p.o,
          newEntry(p.o, farm, p.c.dis, 'a', templateA, arrival, p.travel, expected, {
            probe: true,
            scouted: false,
            loot: { known: false, scouted: false, scoutAgeHours: null, isNew: true, full: false, ageMinutes: null },
          }),
          unitsLeft
        );
      }
    }

    // later attacks on the same village (also from other origins) see the
    // earlier and the enlarged ones
    origins.forEach((o) => {
      entriesOf(o).forEach((entry) => {
        entry.expected = Math.min(stockBefore(entry), entry.capacity);
        entry.score = scoreOf(entry);
      });
      if (plan.farms[o.prop])
        plan.farms[o.prop].sort((x, y) => y.score - x.score || x.fields - y.fields);
    });

    return plan;
  };

  const sendFarm = function ($this) {
    let n = Timing.getElapsedTimeSinceLoad();
    if (
      !farmBusy &&
      !(
        Accountmanager.farm.last_click &&
        n - Accountmanager.farm.last_click < 200
      )
    ) {
      farmBusy = true;
      Accountmanager.farm.last_click = n;
      let $pb = $('#FarmGodProgessbar');

      TribalWars.post(
        Accountmanager.send_units_link.replace(
          /village=(\d+)/,
          'village=' + $this.data('origin')
        ),
        null,
        {
          target: $this.data('target'),
          template_id: $this.data('template'),
          source: $this.data('origin'),
        },
        function (r) {
          UI.SuccessMessage(r.success);
          rememberSent(
            $this.data('coord'),
            Math.round(lib.getCurrentServerTime() / 1000) +
              (parseInt($this.data('travel')) || 0),
            parseInt($this.data('capacity')) || 0,
            parseInt($this.data('expected'))
          );
          $pb.data('current', $pb.data('current') + 1);
          UI.updateProgressBar(
            $pb,
            $pb.data('current'),
            $pb.data('max')
          );
          $this.closest('.farmRow').remove();
          farmBusy = false;
        },
        function (r) {
          UI.ErrorMessage(r || t.messages.sendError);
          $pb.data('current', $pb.data('current') + 1);
          UI.updateProgressBar(
            $pb,
            $pb.data('current'),
            $pb.data('max')
          );
          $this.closest('.farmRow').remove();
          farmBusy = false;
        }
      );
    }
  };

  return {
    init,
    // internal functions, only for the jsdom tests under test/
    _internals: {
      RULES,
      parseScoutReport,
      learnFromReports,
      buildModel,
      stockKnownAt,
      forecastRaw,
      lootableOf,
      takeFrom,
      baseOf,
      getData,
      createPlanning,
      loadHistory,
      saveHistory,
      rememberSent,
      parseHaul,
      parseReportList,
      backfillScoutReports,
      loadStats,
      statsSummary,
    },
  };
})(window.FarmGod.Library, window.FarmGod.Translation);

(() => {
  window.FarmGod.Main.init();
})();
