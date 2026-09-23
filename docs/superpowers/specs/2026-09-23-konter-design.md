# Konter.js – Ausweichen und Konter bei eingehenden Angriffen

Stand: 23.09.2026. Freigegeben vom Spieler (Chat, 23.09.2026). Verifiziert auf Welt HP20 (`dec1`).

**Änderung nach dem ersten Einsatz (23.09.2026):** Der Spieler will raus, nach dem Einschlag rein und dann
mit denselben Truppen kontern. Deshalb ersetzt "Ausweichen" (alle Truppen außer AG/Miliz, Abbrechen-Trick,
mit "zurück ca.") das frühere "Rest rausschicken"; "Konter (Off)" ist der zweite Schritt nach der Rückkehr.
`RULES.restUnits` wurde zu `RULES.neverUnits` (snob, militia). Zusätzlich zeigt die Zeile "seine Truppen
frühestens zurück" (Ankunft + Laufzeit der Einheit im Icon). Der Rest dieses Dokuments beschreibt den
ursprünglichen Entwurf.

## Ziel

Ein zweites, eigenständiges Skript neben FarmGodSmart. Wenn ein Angriff auf ein eigenes Dorf
reinkommt, soll der Spieler mit möglichst wenigen Klicks

1. seine **volle Off sofort auf das Herkunftsdorf des Angreifers** schicken (das ist zugleich
   das Ausweichen für die Off), und
2. den **Rest der Truppen** (Deff, Späher) per Abbrechen-Trick rausschicken.

War der eingehende Angriff ein Fake, bricht der Spieler den Konter im Spiel ab (nur innerhalb
von 10 Minuten nach dem Senden möglich). Keine Rückkehrzeit-Berechnung des Angreifers, keine
Einheitenerkennung – der Spieler wollte es ausdrücklich einfach.

**Nicht verhandelbar:** jeder Befehl braucht genau die Klicks, die das Spiel ohnehin verlangt
("Angreifen" + Bestätigen). Kein Timer, kein automatisches Senden, kein automatisches Abbrechen.

## Ablauf für den Spieler

1. Übersicht **Eingehende Angriffe** öffnen (`screen=overview_villages&mode=incomings&subtype=attacks`),
   Skript per Schnellleiste starten:
   `javascript: $.getScript('https://keleschh.github.io/StaemmeFarmer/Konter.js');`
2. Über der Spieltabelle erscheint eine Tabelle, eine Zeile je eingehendem Angriff:
   - eigenes Dorf, Angreifer (Spieler + Dorf), Ankunft (Uhrzeit) und "in h:mm:ss",
   - langsamste Einheit laut Spiel (Icon aus der Befehlsspalte, falls markiert),
   - Off zu Hause (Kurzform, z. B. "1340 Axt · 449 LKav · 30 Ramme · 25 Kata · 1 Pala"),
   - Link **Konter (Off)** und Link **Rest rausschicken**,
   - bei "Rest rausschicken": "senden ab HH:MM:SS · abbrechen vor HH:MM:SS",
   - bei "Konter": "landet ca. HH:MM:SS" (Entfernung × langsamste Einheit der Off).
3. Klick auf einen Link öffnet den Versammlungsplatz des angegriffenen Dorfs mit Ziel und
   Truppen vorbefüllt. Der Spieler klickt **Angreifen**, dann **Bestätigen**. Zahlen kann er
   vorher im Formular ändern (so lässt sich die Off jederzeit variieren).
4. Fake erkannt → Befehl in der Befehlsübersicht abbrechen (10-Minuten-Fenster des Spiels).

## Mechanik (verifiziert 23.09.2026 auf dec1)

- Vorbefüllung per URL:
  `game.php?village=<eigenes>&screen=place&x=<X>&y=<Y>&from=simulator&att_<unit>=<n>…`
  Das Spiel setzt daraus Ziel (`#inputx`/`#inputy`, Zielkarte) **und** Truppen (`#unit_input_<unit>`).
  Nur `target=<id>` statt `x/y` setzt zwar das Ziel, aber zusammen mit `from=simulator` ignoriert
  das Spiel es; nur `att_*` ohne `from=simulator` wird ignoriert. Deshalb genau diese Kombination.
- Eingehende Angriffe: `#incomings_table tr` mit 7 Zellen: Befehl (Icon der langsamsten Einheit
  `graphic/unit/tiny/<unit>.webp`, Link `info_command&id=`), Ziel (Link `village=<id>&screen=overview`),
  Herkunft (Link `info_village&id=<id>`, Text "Name (X|Y) K54"), Spieler, Entfernung ("3.2"),
  Ankunft ("heute um 09:55:39", auch "morgen um …" / "am 24.09. um …"), `span.timer` ("0:13:37").
  Letzte Zeile ist die Fußzeile mit "alle auswählen" (keine `td`, überspringen).
  Fixture: `test/fixtures/konter/incomings_table.html`.
- Truppen zu Hause je angegriffenem Dorf: eine Anfrage `screen=place&village=<id>`, Werte aus
  `#unit_input_<unit>[data-all-count]` (= wirklich anwesende Truppen, ohne unterwegs befindliche).
  Fixture: `test/fixtures/konter/place_form_prefilled.html`.
- Einheiten der Welt aus `game_data.units` (HP20: 10 Einheiten, ohne Bogenschützen/Miliz).
  Geschwindigkeit aus `/interface.php?func=get_unit_info` (Cache `Konter_unitInfo` in localStorage,
  gleiches Format wie FarmGodSmart).
- Serverzeit aus `#serverDate` + `#serverTime` (wie FarmGodSmart).

## Regeln (`RULES` in Konter.js)

| Konstante | Wert | Bedeutung |
|---|---|---|
| `offUnits` | axe, light, marcher, ram, catapult, knight | Konter = alles davon, was zu Hause ist (nur Einheiten, die es auf der Welt gibt) |
| `restUnits` | spear, sword, archer, spy, heavy | "Rest rausschicken" = alles davon, was zu Hause ist |
| nie | snob, militia | bleiben immer zu Hause |
| `cancelWindowMin` | 10 | Spielregel: Befehl nur 10 min nach dem Senden abbrechbar |
| `cancelMarginSec` | 30 | "abbrechen vor" = Ankunft − 30 s (Anzeige) |

"Rest rausschicken": senden ab = Ankunft − `cancelWindowMin`; abbrechen vor = Ankunft − `cancelMarginSec`.
Der Link ist immer klickbar; ist es noch zu früh, steht "noch nicht senden (ab HH:MM:SS)" daneben.

Mehrere Angriffe auf dasselbe Dorf: jede Zeile bekommt ihre Links; "Off zu Hause" ist je Dorf
gleich. Nach dem Senden eines Konters zeigt ein erneuter Skriptstart 0 Off an – korrekt.

## Technik

- Datei `Konter.js` im Repo-Root (GitHub Pages), eigenständig (kein Import aus FarmGodSmart;
  die drei Helfer Serverzeit, Zeittext-Parser, Einheitendaten werden kopiert und angepasst).
- Aufbau: Kommentarblock (Verhalten) → `RULES` → Parser (`parseIncomings`, `parseHomeUnits`,
  `parseArrival`) → Planung (`planFor(row, home)` liefert `{off, rest, sendFrom, cancelBefore, landsAt, urlOff, urlRest}`)
  → Anzeige (Tabelle über `#incomings_table`) → `init()`. `window.Konter._internals` für Tests.
- Fehler: keine eingehenden Angriffe → Hinweiszeile. Sperr-/Login-Seite (HTTP 200 mit
  "Blockierte Anfrage") → Meldung, wie in FarmGodSmart. Falsche Seite → Hinweis, welche Seite zu öffnen ist.
- Anfragen: 1 × get_unit_info (gecacht), 1 × Versammlungsplatz je angegriffenem Dorf. Kein Retry-Sturm.
- Tests: `test/konter.test.js` mit jsdom (bestehender Harness-Stil): Parser gegen die Fixtures,
  Planung (Off/Rest-Aufteilung, URL-Aufbau, Zeiten), "morgen um"/"am dd.mm." synthetisch.
- Später (nicht Teil dieses Schritts): Vorlagen-Dialog, um Off/Rest anders zusammenzustellen.
  Bis dahin ändert der Spieler die Zahlen direkt im Formular.
