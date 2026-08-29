// ==UserScript==
// @name         FarmGodSmart
// @namespace    farmgodsmart.local
// @version      2.0
// @description  FarmGod mit Beute-Schätzung: Button "FarmGodSmart" im Farm-Assistenten
// @match        https://*.die-staemme.de/game.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// Läuft im Seitenkontext (@grant none), damit $, game_data, Dialog usw. erreichbar sind.
// Es passiert nichts von allein: Auf dem Farm-Assistenten erscheint ein Button, erst der
// Klick startet die Planung. Zusätzlich kann die Schnellleiste
//   javascript: runFarmGodSmart();
// aufrufen, wenn du den Button nicht willst.

function runFarmGodSmart() {
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
  //  - ...außer per Fallback: Erreicht kein Dorf das Minimum, wird trotzdem das beste angegriffen
  //    (einstellbar: nichts / nur das beste Dorf / alle Truppen nach Score).
  //  - Passt die gewünschte Vorlage nicht (z. B. zu wenig Einheiten für B), wird die andere genommen.
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
            'Only include villages without a report up to this many points:',
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
            'Only include villages without a report up to this many points:',
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
            'Only include villages without a report up to this many points:',
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
          newbarbsMaxPoints: 'Dörfer ohne Bericht nur bis so viele Punkte:',
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

    const init = function () {
      if (
        game_data.features.Premium.active &&
        game_data.features.FarmAssistent.active
      ) {
        if (game_data.screen == 'am_farm') {
          $.when(
            lib.ensureUnitInfo().then(null, () => false),
            lib.ensureWorldConfig().then(null, () => false)
          )
            .then(buildOptions)
            .then((html) => {
            Dialog.show('FarmGod', html);

            $('.optionButton')
              .off('click')
              .on('click', () => {
                let optionGroup = parseInt($('.optionGroup').val());
                let optionDistance = parseFloat(
                  $('.optionDistance').val()
                );
                let optionTime = parseFloat($('.optionTime').val());
                let optionLosses =
                  $('.optionLosses').prop('checked');
                let optionMaxloot =
                  $('.optionMaxloot').prop('checked');
                let optionNewbarbs =
                  $('.optionNewbarbs').prop('checked') || false;
                let optionNewbarbsMaxPoints = Math.max(
                  0,
                  parseFloat($('.optionNewbarbsMaxPoints').val()) || 0
                );
                let optionAutoProduction = $('.optionAutoProduction').prop(
                  'checked'
                );
                let optionProduction = Math.max(
                  0,
                  parseFloat($('.optionProduction').val()) || 0
                );
                let optionMinLoot = Math.max(
                  0,
                  parseFloat($('.optionMinLoot').val()) || 0
                );
                let optionFallbackMode = $('.optionFallbackMode').val();
                let optionTemplateFallback = $('.optionTemplateFallback').prop(
                  'checked'
                );

                localStorage.setItem(
                  'farmGod_options',
                  JSON.stringify({
                    optionGroup: optionGroup,
                    optionDistance: optionDistance,
                    optionTime: optionTime,
                    optionLosses: optionLosses,
                    optionMaxloot: optionMaxloot,
                    optionNewbarbs: optionNewbarbs,
                    optionNewbarbsMaxPoints: optionNewbarbsMaxPoints,
                    optionAutoProduction: optionAutoProduction,
                    optionProduction: optionProduction,
                    optionMinLoot: optionMinLoot,
                    optionFallbackMode: optionFallbackMode,
                    optionTemplateFallback: optionTemplateFallback,
                  })
                );

                $('.optionsContent').html(
                  UI.Throbber[0].outerHTML + '<br><br>'
                );
                getData(
                  optionGroup,
                  optionNewbarbs,
                  optionLosses,
                  optionAutoProduction,
                  optionNewbarbsMaxPoints
                ).then((data) => {
                  Dialog.close();

                  let plan = createPlanning(
                    {
                      distance: optionDistance,
                      time: optionTime,
                      maxloot: optionMaxloot,
                      autoProduction: optionAutoProduction,
                      production: optionProduction,
                      minLoot: optionMinLoot,
                      fallbackMode: optionFallbackMode,
                      templateFallback: optionTemplateFallback,
                    },
                    data
                  );
                  $('.farmGodContent').remove();
                  $('#am_widget_Farm')
                    .first()
                    .before(buildTable(plan.farms));

                  bindEventHandlers();
                  UI.InitProgressBars();
                  UI.updateProgressBar(
                    $('#FarmGodProgessbar'),
                    0,
                    plan.counter
                  );
                  $('#FarmGodProgessbar')
                    .data('current', 0)
                    .data('max', plan.counter);
                });
              });

            document.querySelector('.optionButton').focus();
          });
        } else {
          location.href = game_data.link_base_pure + 'am_farm';
        }
      } else {
        UI.ErrorMessage(t.missingFeatures);
      }

      /*
      if (game_data.market != 'nl') {
        $.post('https://swtools.be/ScriptStats/insert.php', { script: 'FarmGod', market: game_data.market, world: game_data.world, player: game_data.player.id });
      }*/
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

      $('.switchVillage')
        .off('click')
        .on('click', function () {
          curVillage = $(this).data('id');
          UI.SuccessMessage(t.messages.villageChanged);
          $(this).closest('tr').remove();
        });
    };

    const buildOptions = function () {
      let options = JSON.parse(localStorage.getItem('farmGod_options')) || {
        optionGroup: 0,
        optionDistance: 25,
        optionTime: 10,
        optionLosses: false,
        optionMaxloot: true,
        optionNewbarbs: true,
      };
      // defaults for the new options (also when an older options object is stored)
      let defaults = {
        optionNewbarbsMaxPoints: 500,
        optionAutoProduction: true,
        optionProduction: 40,
        optionMinLoot: 60,
        optionFallbackMode: 'best',
        optionTemplateFallback: true,
      };
      for (let key in defaults) {
        if (typeof options[key] === 'undefined') options[key] = defaults[key];
      }
      const selected = (value) =>
        options.optionFallbackMode == value ? 'selected' : '';
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

      return $.when(buildGroupSelect(options.optionGroup)).then(
        (groupSelect) => {
          return `<style>#popup_box_FarmGod{text-align:center;width:550px;}</style>
                  <h3>${t.options.title}</h3><br><div class="optionsContent">
                  ${checkboxError || templateError
              ? `<div class="info_box" style="line-height: 15px;font-size:10px;text-align:left;"><p style="margin:0px 5px;">${t.options.warning}<br><img src="${t.options.filterImage}" style="width:100%;"></p></div><br>`
              : ``
            }
                  <div style="width:90%;margin:auto;background: url(\'graphic/index/main_bg.jpg\') 100% 0% #E3D5B3;border: 1px solid #7D510F;border-collapse: separate !important;border-spacing: 0px !important;"><table class="vis" style="width:100%;text-align:left;font-size:11px;">
                    <tr><td>${t.options.group}</td><td>${groupSelect}</td></tr>
                    <tr><td>${t.options.distance
            }</td><td><input type="text" size="5" class="optionDistance" value="${options.optionDistance
            }"></td></tr>
                    <tr><td>${t.options.time
            }</td><td><input type="text" size="5" class="optionTime" value="${options.optionTime
            }"></td></tr>
                    <tr><td>${t.options.losses
            }</td><td><input type="checkbox" class="optionLosses" ${options.optionLosses ? 'checked' : ''
            }></td></tr>
                    <tr><td>${t.options.maxloot
            }</td><td><input type="checkbox" class="optionMaxloot" ${options.optionMaxloot ? 'checked' : ''
            }></td></tr>
                    <tr><td>${t.options.autoProduction
            }</td><td><input type="checkbox" class="optionAutoProduction" ${options.optionAutoProduction ? 'checked' : ''
            }></td></tr>
                    <tr><td>${t.options.production
            }</td><td><input type="text" size="5" class="optionProduction" value="${options.optionProduction
            }"></td></tr>
                    <tr><td>${t.options.minLoot
            }</td><td><input type="text" size="5" class="optionMinLoot" value="${options.optionMinLoot
            }"></td></tr>
                    <tr><td>${t.options.fallbackMode
            }</td><td><select class="optionFallbackMode">
                      <option value="none" ${selected('none')}>${t.options.fallbackNone}</option>
                      <option value="best" ${selected('best')}>${t.options.fallbackBest}</option>
                      <option value="all" ${selected('all')}>${t.options.fallbackAll}</option>
                    </select></td></tr>
                    <tr><td>${t.options.templateFallback
            }</td><td><input type="checkbox" class="optionTemplateFallback" ${options.optionTemplateFallback ? 'checked' : ''
            }></td></tr>
                    <tr><td>${t.options.newbarbs
            }</td><td><input type="checkbox" class="optionNewbarbs" ${options.optionNewbarbs ? 'checked' : ''
            }></td></tr>
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
      if (loot && loot.isNew)
        return `<span style="color:#1a4d8f;">${t.table.lootNew}</span>`;
      if (!loot || !loot.known) return t.table.lootUnknown;
      let label = loot.full ? t.table.lootFull : t.table.lootPartial;
      if (loot.ageMinutes !== null) {
        let h = Math.floor(loot.ageMinutes / 60);
        let m = Math.round(loot.ageMinutes % 60);
        label += ` (${h > 0 ? h + 'h ' : ''}${m}min ${t.table.ago})`;
      }
      return loot.full
        ? `<span style="color:#0a7d00;">${label}</span>`
        : `<span style="color:#8a4b00;">${label}</span>`;
    };

    const buildTable = function (plan) {
      let html = `<div class="vis farmGodContent"><h4>FarmGod</h4><table class="vis" width="100%">
                  <tr><div id="FarmGodProgessbar" class="progress-bar live-progress-bar progress-bar-alive" style="width:98%;margin:5px auto;"><div style="background: rgb(146, 194, 0);"></div><span class="label" style="margin-top:0px;"></span></div></tr>
                  <tr><th style="text-align:center;">${t.table.origin}</th><th style="text-align:center;">${t.table.target}</th><th style="text-align:center;">${t.table.fields}</th><th style="text-align:center;">${t.table.points}</th><th style="text-align:center;">${t.table.expected}</th><th style="text-align:center;">${t.table.score}</th><th style="text-align:center;">${t.table.loot}</th><th style="text-align:center;">${t.table.farm}</th></tr>`;

      if (!$.isEmptyObject(plan)) {
        for (let prop in plan) {
          if (game_data.market == 'nl') {
            html += `<tr><td colspan="8" style="background: #e7d098;"><input type="button" class="btn switchVillage" data-id="${plan[prop][0].origin.id}" value="${t.table.goTo} ${plan[prop][0].origin.name} (${plan[prop][0].origin.coord})" style="float:right;"></td></tr>`;
          }

          plan[prop].forEach((val, i) => {
            html += `<tr class="farmRow row_${i % 2 == 0 ? 'a' : 'b'}">
                      <td style="text-align:center;"><a href="${game_data.link_base_pure
              }info_village&id=${val.origin.id}">${val.origin.name} (${val.origin.coord
              })</a></td>
                      <td style="text-align:center;"><a href="${game_data.link_base_pure
              }info_village&id=${val.target.id}">${val.target.coord
              }</a></td>
                      <td style="text-align:center;">${val.fields.toFixed(2)}</td>
                      <td style="text-align:center;">${val.points ? val.points + ' P' : '?'} · ~${Math.round(val.production)}/h</td>
                      <td style="text-align:center;">~${Math.round(val.expected)} / ${val.capacity
              }${val.fallback ? ` <span style="color:#a00;">(${t.table.fallbackTag})</span>` : ''}</td>
                      <td style="text-align:center;">${Math.round(val.score)}</td>
                      <td style="text-align:center;">${lootLabel(val.loot)}</td>
                      <td style="text-align:center;"><a href="#" data-origin="${val.origin.id
              }" data-target="${val.target.id}" data-template="${val.template.id
              }" class="farmGod_icon farm_icon farm_icon_${val.template.name
              }" style="margin:auto;"></a></td>
                    </tr>`;
          });
        }
      } else {
        html += `<tr><td colspan="8" style="text-align: center;">${t.table.noFarmsPlanned}</td></tr>`;
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
          return data;
        });
    };

    const createPlanning = function (options, data) {
      let plan = { counter: 0, farms: {} };
      let serverTime = Math.round(lib.getCurrentServerTime() / 1000);
      let maxTimeDiff = Math.round(options.time * 60);
      let plannedCount = {}; // target coord -> attacks planned in this run

      const hasLootInfo = (farm) =>
        farm.hasOwnProperty('has_loot_info') && farm.has_loot_info;
      const lastHaulFull = (farm) => hasLootInfo(farm) && farm.max_loot;
      const knownEmpty = (farm) => hasLootInfo(farm) && !farm.max_loot;

      // Resources we expect to find at arrival (before capping at capacity):
      //  - last haul not full: village was emptied at the report time, since
      //    then it produced "production" per hour
      //  - last haul full / no info: assume at least one more A-haul is still
      //    there, plus what was produced since the report
      const capacityA = data.farms.templates.a
        ? data.farms.templates.a.capacity || 0
        : 0;
      // production per hour of a farm: from its points (scaled by world speed)
      // when known and auto estimation is on, otherwise the manual value
      const worldSpeed = (lib.getWorldConfig() || {}).speed || 1;
      const productionOf = (farm) =>
        options.autoProduction && farm.points
          ? lib.estimateProduction(farm.points) * worldSpeed
          : options.production;
      const estimateResources = (farm, arrival) => {
        let hours = farm.report_time
          ? Math.max(0, (arrival - farm.report_time) / 3600)
          : 0;
        let produced = hours * productionOf(farm);
        return knownEmpty(farm) ? produced : capacityA + produced;
      };

      // Picks the template for a farm: B if the last haul was full (option),
      // else A; falls back to the other one if the preferred does not fit.
      const chooseTemplate = (origin, farm) => {
        let name = options.maxloot && lastHaulFull(farm) ? 'b' : 'a';
        let template = data.farms.templates[name];
        let unitsLeft = template
          ? lib.subtractArrays(origin.units, template.units)
          : false;

        if (!unitsLeft && options.templateFallback) {
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
            let choice = chooseTemplate(origin, farm);
            if (!choice) return;

            let arrival = Math.round(
              serverTime +
              c.dis * choice.template.speed * 60 +
              Math.round(plan.counter / 5)
            );

            // don't collide with running or already planned attacks
            if (!data.commands.hasOwnProperty(c.coord))
              data.commands[c.coord] = [];
            if (
              !farm.hasOwnProperty('color') &&
              data.commands[c.coord].length > 0
            )
              return;
            if (
              data.commands[c.coord].some(
                (ts) => Math.abs(ts - arrival) < maxTimeDiff
              )
            )
              return;

            let capacity = choice.template.capacity || 0;
            let expected = Math.min(estimateResources(farm, arrival), capacity);
            let timesPlanned = plannedCount[c.coord] || 0;
            if (timesPlanned > 0) {
              // already hit in this run: an emptied village has nothing more,
              // a full/unknown one might, but prefer spreading the troops
              expected = knownEmpty(farm)
                ? 0
                : expected * Math.pow(0.5, timesPlanned);
            }

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
            (s) => s.expected > 0 && s.score >= options.minLoot
          );
          let isFallback = false;

          if (!pick) {
            if (options.fallbackMode == 'none') break;
            if (options.fallbackMode == 'best' && plannedForOrigin > 0) break;
            pick = scored.find((s) => s.expected > 0);
            if (!pick) break;
            isFallback = true;
          }

          plan.counter++;
          plannedForOrigin++;
          plannedCount[pick.coord] = (plannedCount[pick.coord] || 0) + 1;
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
            points: pick.farm.points || 0,
            production: productionOf(pick.farm),
            loot: {
              known: hasLootInfo(pick.farm),
              isNew: !!pick.farm.is_new,
              full: !!pick.farm.max_loot,
              ageMinutes:
                pick.farm.report_time > 0
                  ? Math.max(0, (serverTime - pick.farm.report_time) / 60)
                  : null,
            },
          });

          origin.units = pick.unitsLeft;
          data.commands[pick.coord].push(pick.arrival);
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
}

window.runFarmGodSmart = runFarmGodSmart;

(function addFarmGodSmartButton() {
  if (typeof game_data === 'undefined' || game_data.screen !== 'am_farm') return;
  if (document.getElementById('farmGodSmartStart')) return;
  const $widget = jQuery('#am_widget_Farm').first();
  if (!$widget.length) return;
  const $btn = jQuery(
    '<div style="margin:6px 0;"><input type="button" class="btn" id="farmGodSmartStart" value="FarmGodSmart starten"></div>'
  );
  $btn.find('input').on('click', runFarmGodSmart);
  $widget.before($btn);
})();
