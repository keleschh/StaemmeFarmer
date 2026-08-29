# FarmGodSmart – Projektkontext für Claude Code

## Was das ist
Ein Browser-Skript für das Spiel *Die Stämme* (Tribal Wars, deutscher Markt), abgeleitet von
FarmGod (Original: Warre, Kopie: https://higamy.github.io/TW/Scripts/Approved/FarmGodCopy.js).
Es plant Farm-Angriffe über den Farm-Assistenten des Spiels (Premium-Feature). Der Spieler
öffnet den Farm-Assistenten, startet das Skript per Schnellleiste
(`javascript: $.getScript('https://keleschh.github.io/StaemmeFarmer/FarmGodSmart.js');`),
bekommt eine Tabelle mit geplanten Angriffen und schickt jeden einzeln per Enter/Klick.

**Nicht verhandelbar:** Jeder Angriff braucht weiterhin genau eine Nutzeraktion. Keine
Automatisierung des Sendens, keine Timer, keine Hintergrundschleifen. (Skriptregeln des Spiels.)

## Dateien
- `FarmGodSmart.js` – **die einzige Quelle.** Wird von GitHub Pages ausgeliefert und per Schnellleiste geladen.
  Keine Tampermonkey-Variante (nicht benötigt).
- `test/` – jsdom-Harness (Node ≥ 22, `node:test`): `cd test && npm install && npm test`.
  `setup.js` baut eine Farm-Assistent-Seite aus echten Fixtures, stubbt die Spiel-Globals
  (`game_data`, `TribalWars`, `Accountmanager`, `UI`, `Dialog`, `window.lang`) und beantwortet
  alle HTTP-Aufrufe des Skripts aus `test/fixtures/`. `parsers.test.js` prüft die Parser,
  `planning.test.js` Planung und den kompletten Ablauf (init → Tabelle → Klick → `sent`-Eintrag).
  `FarmGodSmart.js` exportiert dafür `window.FarmGod.Main._internals` (nur für Tests).
- `test/fixtures/README.md` – Herkunft und Besonderheiten jedes Fixtures (echtes HTML aus de259, 29.08.2026).

## Aufbau von FarmGodSmart.js
1. Kommentarblock oben: beschreibt das aktuelle Verhalten. Bei Änderungen mitpflegen.
2. `window.FarmGod.Library`: HTTP-Queue (`twLib`: 2 Bahnen, 250 ms Pause je Anfrage, Retry erst nach
   2 s/5 s – das Spiel sperrt bei zu vielen Anfragen, siehe "Blockierte Anfrage"), Einheitendaten (`/interface.php?func=get_unit_info`,
   gecacht in localStorage `FarmGodSmart_unitInfo`), Weltconfig (`get_config` → `FarmGodSmart_worldConfig`),
   Punkte→Produktion-Tabelle `PRODUCTION_BY_POINTS` (aus einer Simulation des zufälligen Barb-Wachstums),
   `parseReportTime` (Berichtszeit aus einer Farm-Assistent-Zeile).
3. `window.FarmGod.Translation`: Texte (de_DE ist die Hauptsprache; nl/hu/int stammen vom Original,
   viele Keys dort sind inzwischen ungenutzt).
4. `window.FarmGod.Main`:
   - `RULES`: alle festen Zahlen (Mindestscore, B-Schwelle, Vorrat-Annahme, Probe-Radius …).
   - Gedächtnis pro Dorf in localStorage `FarmGodSmart_history`:
     `{ base:{time,raw:[holz,lehm,eisen]}, buildings, scoutTime, scoutPoints, prodMin, prodMax,
        emptiedAt, lastReport, lastCap, sent:[{arrival,capacity,expected}], troops, noScout }`.
   - Auswertung in localStorage `FarmGodSmart_stats`: Liste `{time, coord, expected, actual, capacity, full}`
     (max. `RULES.maxStats`), `statsSummary()` → Zeile über der Tabelle.
   - `parseReportList` + `backfillScoutReports`: der Farm-Assistent zeigt je Dorf nur den letzten Bericht;
     für Dörfer ohne `buildings` wird höchstens alle `RULES.backfillHours` (24 h, Zeitstempel in
     `FarmGodSmart_backfill`) die Berichtsübersicht `screen=report&mode=attack` (bis `backfillPages`
     Seiten, Paginierung `&from=N`) nach dem letzten Bericht mit Späher-Icon durchsucht und die
     Gebäude daraus übernommen (Rest-Budget von `maxReportFetches`, 5). Reicht das Budget nicht,
     geht es nach `backfillRetryHours` (1 h) weiter – nicht sofort beim nächsten Start.
   - Rohstoffmodell: `buildModel` (Produktion/Versteck/Speicher je Rohstoff, exakt aus gespähten
     Gebäuden, sonst aus Punkten), `forecastRaw`, `lootableOf`, `takeFrom`, `baseOf`.
   - `parseScoutReport`, `parseHaul` (`#attack_results`), `fetchNewScoutReports` (max.
     `RULES.maxReportFetches` Berichte pro Lauf: Spähberichte zuerst, dann eigene Beuteberichte mit
     `sent`-Eintrag), `learnFromReports` (verarbeitet den jeweils letzten Bericht jedes Dorfes genau
     einmal; Teilbeute → `prodMin = prodMax = Beute/Stunden seit emptiedAt`).
   - `getData`: lädt Dorfübersicht (Truppen), laufende Angriffe, alle Farm-Assistent-Seiten,
     `/map/village.txt` (Punkte aller Dörfer + graue Dörfer ohne Bericht bis Punktelimit; kompakt
     `RULES.villageListHours` = 3 h in `FarmGodSmart_villages` gecacht, bei Quota-Fehler ohne Cache).
   - `createPlanning`: Durchgang 1 verteilt Vorlage A nach "Beute pro Stunde Laufzeit";
     Durchgang 2 legt mehrere A auf ein gespähtes Dorf zu B zusammen (auch bei perB−1 Angriffen,
     wenn der schwächste andere A-Angriff gestrichen werden kann und der Gewinn ≥ dessen Beute
     ist), vergrößert A→B auf vollen
     Dörfern, macht neue B-Angriffe auf entfernte volle Dörfer, schickt übrige Truppen als Probe
     auf Dörfer ohne Bericht (nächste zuerst, bis `probeMaxTravelHours`).
   - `sendFarm`: sendet über den Farm-Assistent-Endpoint, merkt sich den Angriff (`rememberSent`).
5. Am Ende: `window.FarmGod.Main.init()`.

## Offene Punkte (Priorität absteigend)

### 1. DOM-Annahmen gegen das echte Spiel verifizieren – **erledigt (29.08.2026, de259)**
Echtes HTML liegt unter `test/fixtures/`, die Tests laufen dagegen. Verifiziert:
- Farm-Assistent-Zeile: Zeitzelle "heute um 16:29:51" / "gestern um …"; Bericht-Link
  `screen=report&mode=all&view=ID`; Rohstoffspalte mit `.icon.header.wood/stone/iron` + `span.res`
  (nur bei Spähberichten, sonst `?`); Bilder sind `.webp` (`max_loot/1.webp`, `dots/green.webp`) –
  alle Selektoren matchen ohne Endung.
- Berichtsseite: `#attack_spy_resources` hat beim Spähbericht **zwei** Zeilen ("Erspähte Rohstoffe" =
  Stand beim Spähen, "Mögliche Rohstoffe" in `tr.no-preview` = Hochrechnung des Spiels bis jetzt);
  der Parser nimmt nur die erspähte Zeile. Bei Angriffen ohne Späher existiert die Tabelle auch,
  aber ohne Zahlen. `#attack_spy_building_data` = JSON mit `level` als String.
  `#attack_info_def` listet Anzahl **und** Verluste als `.unit-item`; nur die erste Zeile zählt.
- `#serverDate` = `29/08/2026`; Befehlsübersicht "heute um 17:22:56:152" (Millisekunden);
  `village.txt` = `id,name,x,y,player_id,points,rank`; `get_unit_info` = XML mit `speed`/`carry`.
- Dorfübersicht `#combined_table`: 11 `td.unit-item` (ohne snob/militia); Vorlagen-Formular
  11 Einheiten-Inputs; `game_data.units` hat 13 Einträge. Die Zuordnung per Index passt.
- Berichtsübersicht `#report_list tr`: Späher-Icon `command/spy.webp`, Ergebnis `dots/*.webp`, Titel
  "… späht Barbarendorf (600|417) K46" (letzte Koordinate = Ziel), Datum `29.08.26 17:53`, Seiten `&from=21`.
  Die `max_loot`-Tooltips dort enthalten die Beutezahlen (bisher ungenutzt).
Noch ohne Fixture: gelbe/rote Zeile, "am 27.08. um …" (nur synthetisch getestet), mehrseitiger
Farm-Assistent, Angriffsbericht **mit** Spähern (siehe 2).

### 2. Rohstoffe im Angriffsbericht mit Späher: vor oder nach der Plünderung?
`learnFromReports` nimmt an, die erspähten Rohstoffe eines Angriffsberichts seien der Stand *nach*
der Beute (wird nicht nochmal abgezogen). Der Spieler schickt bisher keine Späher mit (Vorlagen
A = 2 LKav, B = 10 LKav), daher gibt es noch keinen solchen Bericht. Sobald einer vorliegt:
Beute (`#attack_results`) + "Erspähte Rohstoffe" vergleichen, Fixture ablegen, ggf. auf "vorher"
umstellen (dann `takeFrom` anwenden).

### 3. Kalibrierung der RULES anhand echter Beute – Auswertung eingebaut, Konstanten noch offen
Die Konstanten `minScorePerSpeed` (60), `bFillRatio` (0.75), `untouchedHours` (36),
`probeMaxTravelHours` (3), `fallbackMinFill` (0.1) sind Schätzwerte.
Eingebaut (29.08.2026): `sent` merkt sich `expected`; passende Angriffsberichte werden geladen
(`parseHaul`), erwartet/tatsächlich landet in `FarmGodSmart_stats`, die Tabelle zeigt
"Auswertung: N Angriffe · Ø x % voll · Schätzung Ø ±y % · Fehler Ø z %". Teilbeute liefert die exakte
Produktion seit dem letzten Leerräumen. Die 2a-Regel (perB−1 + schwächster Angriff) ist drin.
Offen: nach ein paar Tagen Statistik anschauen (`localStorage.FarmGodSmart_stats` oder die Zeile)
und danach die Konstanten anpassen. Bei "Schätzung Ø deutlich > 0" ist `untouchedHours` zu hoch
oder die Punkte-Produktion zu optimistisch; bei niedrigem "Ø voll" bei B-Angriffen `bFillRatio` hoch.

### 4. Andere Spieler farmen dasselbe Dorf
Nicht erkennbar; das Skript überschätzt dann. Geklärt: der blaue Punkt (`dots/blue.webp`,
Tooltip "Erspäht") heißt nur "letzter Bericht ist ein Spähbericht" – kein Signal für fremde
Angriffe. Einzige Idee bleibt der Vergleich erwartete vs. tatsächliche Beute (Aufgabe 3).

### 5. Tests – **erledigt**, ausbauen bei Bedarf
40 Tests in `test/` (Parser, getData, createPlanning, kompletter Ablauf, Backfill, Auswertung,
Anfragen-Drosselung in `requests.test.js`). `setup.js` setzt `twLib.delayMs`/`retryDelaysMs` auf 0. Beim Erweitern beachten:
Seiten-HTML in ein `<div>` wrappen (`$(html).find(...)`), einzelne `<tr>` in `<table><tbody>`;
Objekte aus dem jsdom-Fenster vor `deepEqual` mit `JSON.parse(JSON.stringify(x))` kopieren
(anderer Realm); vor `getData` einmal `await tick()`, damit Einheiten-/Weltconfig gecacht sind.

### 6. Anfragen ans Spiel – **Drosselung eingebaut (29.08.2026)**
Auslöser war die Spielmeldung "Blockierte Anfrage … zu viele Anfragen". Ein Lauf macht jetzt
höchstens ~15 Anfragen (3 Übersichten, Farm-Assistent-Seiten, ggf. village.txt, bis 5 Berichte,
Backfill bis 5 Listenseiten) mit max. 2 gleichzeitig und 250 ms Abstand. Falls die Sperre trotzdem
wiederkommt: `twLib.lanes` auf 1 bzw. `delayMs` hoch, `maxReportFetches`/`backfillPages` runter.

### 7. Kleinere Punkte
- Ungenutzte Übersetzungs-Keys entfernen (distance, time, losses, maxloot, autoProduction,
  production, minLoot, fallback*, templateFallback, points, score); Hungarian-Strings sind
  doppelt kodiert (Mojibake) – entweder reparieren oder den Block entfernen.
- Mehrere Herkunftsdörfer: Zuweisung läuft pro Dorf nacheinander (erstes Dorf greift sich die
  besten Ziele). Für später: globale Zuweisung über alle Herkunftsdörfer.
- Bonusdörfer: der Produktionsbonus wird nicht modelliert (nur Punkte). Spähen korrigiert das.
- Manuelle Angriffe (nicht aus der Tabelle) haben kein `sent`-Eintrag → daraus wird keine
  Produktionsgrenze gelernt. Akzeptiert.
- Zwei Browser-Tabs überschreiben sich gegenseitig das Gedächtnis. Akzeptiert.

## Regeln bei Änderungen
- Verhalten nur in `FarmGodSmart.js` ändern, danach `node --check FarmGodSmart.js` (und `npm test`, sobald vorhanden).
- Kommentarblock oben und die `RULES`-Kommentare aktuell halten; der Spieler liest sie.
- Keine neuen Einstellungen im Dialog ohne Not – die Vorgabe des Spielers ist "so wenig Entscheidungen wie möglich".
- Alles Neue muss ohne Spähberichte funktionieren; Spähdaten sind nur ein Bonus.
