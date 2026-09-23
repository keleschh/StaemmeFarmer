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

  const init = function () {
    if (!$('#incomings_table').length) {
      UI.ErrorMessage(messages.wrongScreen);
      return;
    }
  };

  return { init, RULES, _internals: { messages } };
})();

window.Konter.init();
