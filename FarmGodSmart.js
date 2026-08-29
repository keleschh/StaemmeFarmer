// FarmGodSmart v2 - modifizierte Version von FarmGod (Original: Warre, Kopie: higamy)
//
// Was anders ist als im Original:
//  - Jedes Farmdorf bekommt eine Schätzung, wie viele Rohstoffe bis zur Ankunft dort liegen:
//      * letzte Beute NICHT voll  -> Dorf war leer; seitdem produziert es. Die Produktion wird
//        automatisch aus den Dorfpunkten geschätzt (map/village.txt, Weltgeschwindigkeit aus
//        get_config), alternativ ein fester Wert.
//      * letzte Beute voll        -> mindestens noch eine volle A-Beute plus Produktion seitdem
//      * keine Beute-Info         -> wie "voll" behandelt
//  - Die erwartete Beute wird auf die Tragekapazität der Vorlage gedeckelt und durch die Laufzeit
//    (hin und zurück) geteilt. Diese "Beute pro Stunde Laufzeit" bestimmt die Reihenfolge, nicht
//    mehr nur die Entfernung. Ein nahes halbleeres Dorf schlägt so ein weit entferntes volles.
//  - Mindest-Beute pro Stunde Laufzeit. Dörfer darunter werden ignoriert...
//  - ...außer per Fallback: Erreicht kein Dorf das Minimum, wird trotzdem das beste angegriffen.
//  - Laufende oder gerade geplante Angriffe auf ein Dorf gelten als "leert das Dorf bei Ankunft";
//    danach zählt nur noch die Produktion. Damit erübrigt sich ein Mindestabstand.
//  - Passt die gewünschte Vorlage nicht (z. B. zu wenig Einheiten für B), wird die andere genommen.
//  - Im Dialog bleiben nur drei Einstellungen (Gruppe, Entfernung, Dörfer ohne Bericht bis X Punkte).
//    Der Dialog kommt nur beim ersten Start; danach wird sofort geplant, die Einstellungen sind
//    über einen Link in der Tabelle erreichbar. Alles andere sind feste Regeln (RULES weiter unten).
//  - Vorlage B wird genommen, wenn das Dorf voraussichtlich genug für B hat. Ein Dorf, das noch nie
//    leer war (erster Treffer voll), gilt als gut gefüllt -> B. Ein Dorf, das nur seit dem letzten
//    Leerfarmen wieder etwas angesammelt hat, bekommt A. Dörfer ohne Bericht bekommen immer erst A.
//  - Das Skript merkt sich pro Dorf, wann es leer war und ob unsere Beutezüge voll waren, und leitet
//    daraus Ober-/Untergrenzen für die echte Produktion ab (lernt also ohne Späher mit).
//  - Spähberichte werden ausgewertet (1 Request pro neuem Bericht): Rohstoffe und Gebäude liefern
//    exakte Produktion, Versteck und Speicher. Ab dann rechnet das Skript für dieses Dorf pro
//    Rohstoffart, was tatsächlich plünderbar ist. Ohne Spähbericht bleibt die Punkteschätzung.
//    Wächst das Dorf nach dem Spähen (Punkte steigen), wächst die Produktion im Modell mit; eigene
//    Beutezüge korrigieren sie zusätzlich. Ein neuer Spähbericht setzt alles wieder exakt.
//  - Tabelle zeigt pro Farm, wann die Truppen wieder zu Hause sind.
//  - Tabelle zeigt erwartete Beute, Score und die letzte Beute (voll / nicht voll, wie lange her).
//  - Barbaren-/Bonusdörfer ohne Bericht können mit eingeplant werden (Dorfliste der Welt,
//    Punktelimit als Sicherung gegen ehemalige Spielerdörfer mit Resttruppen). Im Original nur
//    auf dem NL-Markt freigeschaltet.
//  - Deutsche Übersetzung.
// Das Senden selbst ist unverändert: jede Farm braucht weiterhin einen Klick bzw. Enter.
//
// Hungarian translation provided by =Krumpli=

ScriptAPI.register('FarmGod', true, 'Warre', 'nl.tribalwars@coma.innogames.de');

window.FarmGod = {};
window.FarmGod.Library = (function () {
  /**** TribalWarsLibrary.js ****/
  if (typeof window.twLib === 'undefined') {
    window.twLib = {
      queues: null,
      init: function () {
        if (this.queues === null) {
          this.queues = this.queueLib.createQueues(5);
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
              $[item.action](...item.arguments)
                .done(function () {
                  item.promise.resolve.apply(null, arguments);
                  self.start();
                })
                .fail(function () {
                  item.attempts += 1;
                  if (
                    item.attempts <
                    twLib.queueLib.maxAttempts
                  ) {
                    self.enqueue(item, true);
                  } else {
                    item.promise.reject.apply(
                      null,
                      arguments
                    );
                  }

                  self.start();
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
          let leastBusyQueue = twLib.queues
            .map((q) => q.length)
            .reduce((next, curr) => (curr < next ? curr : next), 0);
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
        .split('/')
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
        goTo: 'Ga naar',
      },
      messages: {
        villageChanged: 'Succesvol van dorp veranderd!',
        villageError:
          'Alle farms voor het huidige dorp zijn reeds verstuurd!',
        sendError: 'Error: farm niet verstuurd!',
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
        goTo: 'Go to',
      },
      messages: {
        villageChanged: 'Falu sikeresen megvÃ¡ltoztatva!',
        villageError: 'Minden farm kiment a jelenlegi falubÃ³l!',
        sendError: 'Hiba: Farm nemvolt elkÃ¼ldve!',
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
        goTo: 'Go to',
      },
      messages: {
        villageChanged: 'Successfully changed village!',
        villageError:
          'All farms for the current village have been sent!',
        sendError: 'Error: farm not send!',
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
        goTo: 'Gehe zu',
      },
      messages: {
        villageChanged: 'Dorf erfolgreich gewechselt!',
        villageError:
          'Alle Farmen für das aktuelle Dorf wurden bereits geschickt!',
        sendError: 'Fehler: Farm nicht geschickt!',
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
    // Wie viele neue Spähberichte pro Durchlauf höchstens geladen werden.
    maxReportFetches: 10,
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

  const rememberSent = function (coord, arrival, capacity) {
    if (!coord) return;
    let history = loadHistory();
    if (!history[coord]) history[coord] = {};
    let list = sentListOf(history[coord]);
    list.push({ arrival: arrival, capacity: capacity });
    history[coord].sent = list.slice(-20);
    saveHistory(history);
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
    if (h.prodMin) prod = Math.max(prod, h.prodMin);
    if (h.prodMax) prod = Math.min(prod, h.prodMax);
    return prod;
  };

  // Produktion, Versteck und Speicher je Rohstoffart: exakt aus gespähten
  // Gebäuden, sonst grob aus den Punkten (gleichmäßig verteilt, kein Versteck)
  const buildModel = function (farm, h, worldSpeed) {
    let b = h.buildings;
    if (b && RES.some((k) => typeof b[k] !== 'undefined')) {
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
      if (h.prodMin) corrected = Math.max(corrected, h.prodMin);
      if (h.prodMax) corrected = Math.min(corrected, h.prodMax);
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

  /**** Spähberichte ****/
  // reads resources and building levels from a report page
  const parseScoutReport = function ($html) {
    let result = { res: null, buildings: null };

    let $res = $html.find('#attack_spy_resources');
    if ($res.length) {
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
        let nums = ($res.text().match(/\d[\d.]*/g) || []).map((x) =>
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

    return result;
  };

  // loads reports that may contain scout info and are not known yet
  const fetchNewScoutReports = function (farms) {
    let history = loadHistory();
    let todo = [];
    for (let coord in farms) {
      let f = farms[coord];
      if (!f.report_id) continue;
      let h = history[coord] || {};
      if (h.scoutReportId == f.report_id) continue;
      if ((h.noScout || []).indexOf(f.report_id) >= 0) continue;
      if (f.has_res_info || !f.has_loot_info) todo.push(coord);
    }
    todo = todo.slice(0, RULES.maxReportFetches);
    if (!todo.length) return Promise.resolve(farms);

    return Promise.all(
      todo.map((coord) =>
        twLib
          .get(game_data.link_base_pure + 'report&mode=all&view=' + farms[coord].report_id)
          .then(
            (html) => {
              let parsed = parseScoutReport($(html));
              farms[coord].scout = {
                reportId: farms[coord].report_id,
                res: parsed.res,
                buildings: parsed.buildings,
              };
            },
            () => {}
          )
      )
    ).then(() => farms);
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
        let sentList = sentListOf(h);
        let landed = sentList
          .filter((x) => x.arrival <= T + 900)
          .sort((a, b) => a.arrival - b.arrival);
        let future = sentList.filter((x) => x.arrival > T + 900);
        let own =
          landed.length && Math.abs(landed[landed.length - 1].arrival - T) < 900
            ? landed.pop()
            : null;
        let capSent = own ? own.capacity : 0;

        let cur = baseOf(h, T, m);
        landed.forEach((x) => {
          if (x.arrival <= cur.time) return;
          let rawAt = forecastRaw(m, cur.raw, (x.arrival - cur.time) / 3600);
          cur = { time: x.arrival, raw: takeFrom(m, rawAt, x.capacity) };
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
              else if (!others) h.prodMax = Math.min(h.prodMax || Infinity, rate);
              if (h.prodMin && h.prodMax && h.prodMin > h.prodMax) {
                if (farm.max_loot) h.prodMax = h.prodMin;
                else h.prodMin = h.prodMax;
              }
            }
          }
          if (farm.max_loot) {
            h.base = { time: T, raw: takeFrom(m, rawAtT, capSent || capacityA) };
          } else {
            h.base = { time: T, raw: rawAtT.map((v, i) => Math.min(v, m.hidden[i])) };
            h.emptiedAt = T;
          }
          h.lastFull = !!farm.max_loot;
          h.lastCap = capSent || h.lastCap || 0;
        } else if (scout && scout.res) {
          h.base = { time: T, raw: rawAtT };
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
            : farm.has_loot_info
              ? takeFrom(m, scout.res.slice(), h.lastCap || capacityA)
              : scout.res.slice(),
        };
      }
      if (scout && scout.res) h.scoutRawId = scout.reportId;
      if (scout && scout.reportId) h.scoutReportId = scout.reportId;
      history[coord] = h;
    }

    for (let coord in history) {
      // sent attacks that never produced a report (cancelled) expire after 2 days
      let sentList = sentListOf(history[coord]).filter(
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
    let defaults = { optionGroup: 0, optionDistance: 10, optionNewbarbsMaxPoints: 500 };
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
            optionDistance: parseFloat($('.optionDistance').val()) || 10,
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
    ).then((data) => {
      let plan = createPlanning({ distance: options.optionDistance }, data);
      $('.farmGodContent').remove();
      $('#am_widget_Farm').first().before(buildTable(plan));

      bindEventHandlers();
      UI.InitProgressBars();
      UI.updateProgressBar($('#FarmGodProgessbar'), 0, plan.counter);
      $('#FarmGodProgessbar').data('current', 0).data('max', plan.counter);
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
      .off('keydown')
      .on('keydown', (event) => {
        if ((event.keyCode || event.which) == 13) {
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
      optionDistance: 10,
      optionNewbarbsMaxPoints: 500,
    };

    return $.when(buildGroupSelect(options.optionGroup)).then(
      (groupSelect) => {
        return `<style>#popup_box_FarmGod{text-align:center;width:550px;}</style>
                <h3>${t.options.title}</h3><br><div class="optionsContent">
                ${warningHtml()}
                <div style="width:90%;margin:auto;background: url(\'graphic/index/main_bg.jpg\') 100% 0% #E3D5B3;border: 1px solid #7D510F;border-collapse: separate !important;border-spacing: 0px !important;"><table class="vis" style="width:100%;text-align:left;font-size:11px;">
                  <tr><td>${t.options.group}</td><td>${groupSelect}</td></tr>
                  <tr><td>${t.options.distance
          }</td><td><input type="text" size="5" class="optionDistance" value="${options.optionDistance
          }"></td></tr>
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

    let html = `<div class="vis farmGodContent">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 6px;">
                  <b>FarmGod</b><span>${summary}</span><a href="#" class="farmGodSettings">${t.table.settings}</a>
                </div>
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
            }${val.fallback ? ` <span style="color:#a00;">(${t.table.fallbackTag})</span>` : ''}</td>
                    <td style="text-align:center;">${lootLabel(val.loot)}</td>
                    <td style="text-align:center;">${formatTime(val.returnTime)}</td>
                    <td style="text-align:center;"><a href="#" data-origin="${val.origin.id
            }" data-target="${val.target.id}" data-template="${val.template.id
            }" data-coord="${val.target.coord}" data-arrival="${val.arrival
            }" data-capacity="${val.capacity
            }" class="farmGod_icon farm_icon farm_icon_${val.template.name
            }" style="margin:auto;"></a></td>
                  </tr>`;
        });
      }
    }

    html += `</table></div>`;

    return html;
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
    // (player id 0) up to the points limit as farm candidates.
    let loadVillageList = () => {
      if (!autoProduction && !newbarbs) return data;
      return twLib.get('/map/village.txt').then(
        (allVillages) => {
          (String(allVillages).match(/[^\r\n]+/g) || []).forEach((line) => {
            let [id, name, x, y, player_id, points] = line.split(',');
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

    let commandsProcessor = ($html) => {
      $html
        .find('#commands_table')
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
            return data.commands[coord].push(
              Math.round(
                lib.timestampFromString(
                  $el.find('td').eq(2).text().trim()
                ) / 1000
              )
            );
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
        return fetchNewScoutReports(data.farms.farms).then(() => data);
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
    const modelOf = (farm) => buildModel(farm, historyOf(farm), worldSpeed);
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
          // stock only estimated (no scout report): assume the earlier attack
          // empties the village; stock known exactly: subtract its capacity
          cur = { time: e.ts, raw: takeFrom(m, rawAtE, m.exact ? e.cap : Infinity) };
        });
      return lootableOf(m, forecastRaw(m, cur.raw, (t - cur.time) / 3600));
    };

    // Picks the template for a farm: B if the village probably holds enough
    // to fill B, else A; falls back to the other one if the preferred does
    // not fit into the troops at home.
    const chooseTemplate = (origin, resources, farm) => {
      let tB = data.farms.templates.b;
      let name =
        tB &&
        tB.capacity > capacityA &&
        !farm.is_new && // never attacked: probe with A first
        resources >= tB.capacity * RULES.bFillRatio
          ? 'b'
          : 'a';
      let template = data.farms.templates[name];
      let unitsLeft = template
        ? lib.subtractArrays(origin.units, template.units)
        : false;

      if (!unitsLeft && RULES.templateFallback) {
        let otherName = name == 'a' ? 'b' : 'a';
        let other = data.farms.templates[otherName];
        let otherLeft = other
          ? lib.subtractArrays(origin.units, other.units)
          : false;
        if (otherLeft) {
          name = otherName;
          template = other;
          unitsLeft = otherLeft;
        }
      }

      return unitsLeft ? { name, template, unitsLeft } : false;
    };

    for (let prop in data.villages) {
      let origin = data.villages[prop];
      let plannedForOrigin = 0;
      let candidates = Object.keys(data.farms.farms)
        .map((coord) => ({ coord, dis: lib.getDistance(prop, coord) }))
        .filter((c) => c.dis < options.distance);

      // Greedy: repeatedly pick the target with the best loot per hour of
      // travel until no troops / no sensible target is left.
      while (true) {
        let scored = [];

        candidates.forEach((c) => {
          let farm = data.farms.farms[c.coord];
          farm.coord = c.coord;
          if (!data.commands.hasOwnProperty(c.coord))
            data.commands[c.coord] = [];

          const resourcesAt = (arrival) => lootableAt(farm, arrival);
          const arrivalWith = (speed) =>
            Math.round(
              serverTime + c.dis * speed * 60 + Math.round(plan.counter / 5)
            );

          // estimate with template A's travel time, choose the template, then
          // recompute with the chosen template's speed
          let refTemplate = data.farms.templates.a || data.farms.templates.b;
          if (!refTemplate) return;
          let choice = chooseTemplate(
            origin,
            resourcesAt(arrivalWith(refTemplate.speed)),
            farm
          );
          if (!choice) return;

          let arrival = arrivalWith(choice.template.speed);
          let capacity = choice.template.capacity || 0;
          let expected = Math.min(resourcesAt(arrival), capacity);

          let roundTripHours = (2 * c.dis * choice.template.speed) / 60;
          let score = roundTripHours > 0 ? expected / roundTripHours : expected;

          scored.push({
            coord: c.coord,
            dis: c.dis,
            farm,
            templateName: choice.name,
            template: choice.template,
            unitsLeft: choice.unitsLeft,
            arrival,
            capacity,
            expected,
            score,
          });
        });

        if (scored.length == 0) break;

        scored.sort((a, b) => b.score - a.score || a.dis - b.dis);

        // list is sorted by score, so the first entry that passes the
        // minimum is also the best one
        let pick = scored.find(
          (s) => s.expected > 0 && s.score >= minScore
        );
        let isFallback = false;

        if (!pick) {
          if (RULES.fallbackMode == 'none') break;
          if (RULES.fallbackMode == 'best' && plannedForOrigin > 0) break;
          pick = scored.find(
            (s) =>
              s.expected > 0 &&
              s.expected >= s.capacity * RULES.fallbackMinFill
          );
          if (!pick) break;
          isFallback = true;
        }

        plan.counter++;
        plannedForOrigin++;
        if (!plan.farms.hasOwnProperty(prop)) plan.farms[prop] = [];

        plan.farms[prop].push({
          origin: { coord: prop, name: origin.name, id: origin.id },
          target: { coord: pick.coord, id: pick.farm.id },
          fields: pick.dis,
          template: { name: pick.templateName, id: pick.template.id },
          expected: pick.expected,
          capacity: pick.capacity,
          score: pick.score,
          fallback: isFallback,
          returnTime: pick.arrival + Math.round(pick.dis * pick.template.speed * 60),
          arrival: pick.arrival,
          points: pick.farm.points || 0,
          production: productionOf(pick.farm),
          scouted: modelOf(pick.farm).exact,
          loot: {
            known: hasLootInfo(pick.farm),
            scouted: modelOf(pick.farm).exact,
            scoutAgeHours: historyOf(pick.farm).scoutTime
              ? Math.max(0, (serverTime - historyOf(pick.farm).scoutTime) / 3600)
              : null,
            isNew: !!pick.farm.is_new,
            full: !!pick.farm.max_loot,
            ageMinutes:
              pick.farm.report_time > 0
                ? Math.max(0, (serverTime - pick.farm.report_time) / 60)
                : null,
          },
        });

        origin.units = pick.unitsLeft;
        data.commands[pick.coord].push({ ts: pick.arrival, cap: pick.capacity });
      }
    }

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
            parseInt($this.data('arrival')) || 0,
            parseInt($this.data('capacity')) || 0
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
  };
})(window.FarmGod.Library, window.FarmGod.Translation);

(() => {
  window.FarmGod.Main.init();
})();
