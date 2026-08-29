# Fixtures – echtes HTML aus Die Stämme (de259, 29.08.2026)

Per Chrome aus dem laufenden Spiel kopiert. Bildpfade sind `.webp` (nicht `.png`),
`#serverDate` war `29/08/2026`, `game_data.units` = spear…knight, snob, militia (13).
Das Sicherheits-Token `h=` ist durch `HASH` ersetzt.

| Datei | Quelle | Wichtig |
|---|---|---|
| `farm_row_scouted.html` | `tr#village_13621` im Farm-Assistent | blauer Punkt = **"Erspäht"** (letzter Bericht ist ein Spähbericht), kein `max_loot`-Icon, Rohstoffspalte mit `.icon.header.wood` + `span.res` = **vom Spiel hochgerechnete** Rohstoffe seit dem Spähbericht |
| `farm_row_full_loot.html` | `tr#village_12806` | grün, `max_loot/1.webp`, Rohstoffspalte nur `?` |
| `farm_row_partial_loot.html` | `tr#village_13727` | grün, `max_loot/0.webp` |
| `farm_row_yesterday.html` | `tr#village_12142` | Zeit "gestern um 22:33:33", `span.warn` bei vollem Speicher |
| `farm_nav_and_filters.html` | `#plunder_list_nav`, `#plunder_list_filters` | eine Seite: nur `<strong class="paged-nav-item">` |
| `farm_templates_form.html` | `form[action*="action=edit_all"]` | 2 hidden inputs pro Vorlage (`[id]`, `[new]`), 11 Einheiten-Inputs (ohne snob/militia) |
| `overview_combined.html` | `#combined_table` (mode=combined) | 11 `td.unit-item` (ohne snob/militia), `.quickedit-vn[data-id]`, `.quickedit-label[data-text]` |
| `overview_commands.html` | `#commands_table` (mode=commands, 3 Zeilen) | Ankunft `td:eq(2)` = "heute um 17:22:56:<span>152</span>" (Millisekunden) |
| `report_scout.html` | Spähbericht view=1093158 | `#attack_spy_resources` hat **zwei** Rohstoffzeilen: "Erspähte Rohstoffe" (Stand beim Spähen) und "Mögliche Rohstoffe" (`tr.no-preview`, Hochrechnung); `#attack_spy_building_data` JSON mit Level als String; `#attack_info_def` hat Anzahl **und** Verluste als `.unit-item` |
| `report_attack_full.html` | Angriffsbericht view=1099410 (10 LKav, 800/800) | `#attack_results` "Beute: 280 258 262 800/800"; `#attack_spy_resources` existiert auch ohne Späher, aber ohne Zahlen |
| `report_attack_partial.html` | Angriffsbericht view=1096067 (2 LKav, 145/160) | s. o. |
| `village.txt` | Auszug aus `/map/village.txt` | `id,name,x,y,player_id,points,rank`, Namen URL-kodiert |

Noch ohne Fixture: Angriffsbericht **mit** Spähern (Frage "Rohstoffe vor oder nach Plünderung"),
gelbe/rote Zeilen, Zeile mit "am 27.08. um …", mehrseitiger Farm-Assistent.
