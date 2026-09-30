# SHADOW ARENA

Ein schnelles 2D-Arena-Fighting-Game mit Silhouetten-Kämpfern, prozeduralen Animationen und atmosphärischen Arenen. Es läuft komplett offline im Browser, am PC mit Tastatur und auf dem **Android-Tablet mit Touch-Steuerung**. Kein Server, kein npm, keine CDNs, keine externen Bilder oder Sounds.

Enthalten sind ein endloser **ARENA-Modus** mit über 100 Stages, Elite-Gegnern und fünf Bossen mit je drei Phasen, **Level & XP**, **Coins** und ein **Shop** mit Nahkampfwaffen, Wurfwaffen, Schusswaffen, Specials und Kosmetik.

---

## Starten

1. Den Ordner `shadow-arena/` öffnen.
2. `index.html` doppelklicken (oder per Drag & Drop in Chrome, Edge, Firefox oder Safari ziehen).
3. Fertig. Der Startbildschirm erscheint sofort.

> Der Sound startet mit dem ersten Tastendruck oder Mausklick. Browser erlauben Audio erst nach einer Benutzerinteraktion.

Alle Skripte sind klassische `<script>`-Dateien ohne ES-Module, weil Chrome Module über `file://` blockiert. Dadurch funktioniert das Spiel per Doppelklick ohne lokalen Webserver.

### Auf dem Android-Tablet spielen

**Variante A: Datei direkt öffnen (am einfachsten)**
1. Den Ordner `shadow-arena/` auf das Tablet kopieren (USB, Cloud-Ordner o. ä.).
2. `index.html` in Chrome öffnen, z. B. über die Dateien-App oder `file:///sdcard/Download/shadow-arena/index.html` in der Adresszeile.
3. Tablet quer halten und oben rechts im Hauptmenü **FULLSCREEN** antippen.

**Variante B: als App installieren (PWA, voll offline)**
1. Den Ordner auf einen beliebigen Webspace legen (GitHub Pages, Netlify, eigener Server) oder im WLAN bereitstellen, z. B. am PC mit `python3 -m http.server 8000` im Ordner `shadow-arena/`.
2. Die Adresse im Chrome des Tablets öffnen und im Menü **„Zum Startbildschirm hinzufügen“ / „App installieren“** wählen.
3. Der Service Worker (`service-worker.js`) speichert alle Dateien. Danach startet das Spiel auch ohne Internet im Vollbild und im Querformat.

> Über `file://` ist der Service Worker nicht aktiv (Browser-Regel). Das Spiel läuft dort trotzdem vollständig.

Hält man das Tablet hochkant, erscheint ein Hinweis zum Drehen und ein laufender Kampf pausiert automatisch.

---

## Steuerung

| Taste | Aktion |
|---|---|
| **A / D** (oder ← →) | Laufen / Rückwärtslaufen |
| **W** (oder ↑) | Springen (mit Richtung: Vorwärts- / Rückwärtssprung) |
| **S** (oder ↓) | Ducken |
| **J** | Leichter Schlag |
| **K** | Schwerer Schlag |
| **L** | Kick |
| **U** | Blocken (kurz vor dem Treffer antippen = **Parry**) |
| **S + U** | Tiefer Block (nötig gegen Low-Angriffe) |
| **I** | Dash nach vorne (mit →) · Ausweichschritt zurück (ohne / mit ←) |
| **O** | Werfen / Schießen (Fernkampf-Slot) |
| **P** | Nachladen (Schusswaffen mit Magazin) |
| **SPACE** | Spezialangriff (bei 100 % Energie) |
| **ESC** | Pause / Trainingsoptionen |
| **R** | Position zurücksetzen (Training) |
| **Enter / J** | Menü bestätigen · **ESC / K** zurück · Maus funktioniert ebenfalls |
| **T** (bzw. **L**) | Im Shop: Gegenstand im Training ausprobieren (TRY) |

### Touch-Steuerung (Tablet)

Die Touch-Steuerung erscheint automatisch, sobald der Bildschirm berührt wird. Unter *Settings → TOUCH CONTROLS* lässt sie sich auf AUTO, ON oder OFF stellen, unter *TOUCH BUTTON SIZE* auf Small, Medium oder Large.

| Element | Funktion |
|---|---|
| **Analog-Stick** links unten | Laufen (Tempo je nach Auslenkung), nach oben = Springen (auch diagonal), nach unten = Ducken. Der Stick erscheint dort, wo der Daumen aufsetzt. Zweimal schnell zur Seite schnippen = Dash |
| **PUNCH** (groß) | Leichter Angriff. Mit Waffe z. B. SLASH, STRIKE, THRUST |
| **HEAVY** · **KICK** | Schwerer Angriff · Kick |
| **BLOCK** | Halten = blocken, kurz vor dem Treffer antippen = Parry. Stick nach unten + BLOCK = tiefer Block |
| **DASH / DODGE** | Mit Stick nach vorne Dash, sonst Ausweichschritt |
| **SPECIAL** | Spezialangriff. Der Ring zeigt die Energie |
| **THROW / SHOOT** | Fernkampfwaffe, mit Ladungs- bzw. Munitionsanzeige und Cooldown-Ring |
| **RELOAD** | Nur bei Schusswaffen mit Magazin |
| **❚❚** oben rechts | Pause |

Mehrere Finger gleichzeitig funktionieren: Jeder Finger wird über seine `pointerId` verfolgt. Man kann laufen und gleichzeitig angreifen oder blocken, ein Finger kann von HEAVY auf KICK weitergleiten, und wer mit dem Finger BLOCK verlässt, gibt den Block frei. `pointercancel`, App-Wechsel oder Fensterfokus-Verlust lassen alles los, sodass nichts hängen bleibt. Zoom, Scrollen, Textauswahl und Kontextmenü sind abgeschaltet. Tasten geben kurzes haptisches Feedback, Treffer ein stärkeres (abschaltbar unter *VIBRATION*).

### Kontext-Aktionen

| Eingabe | Aktion |
|---|---|
| Unten + Angriff | Tiefer Angriff (muss geduckt geblockt werden) |
| Unten + HEAVY | Launcher / Uppercut (Anti-Air, schleudert hoch) |
| Oben + HEAVY | Overhead bzw. aufsteigender schwerer Angriff |
| Angriff in der Luft | Sprungangriff (Overhead) |
| Angriff während des Dashs | Dash-Angriff |
| Fernkampf in der Luft | Wurf schräg nach unten |

### Spezielle Eingaben

| Eingabe | Angriff | Zweck |
|---|---|---|
| S + J | Crouch Punch | schneller Stoß aus der Hocke |
| S + K | Uppercut | Anti-Air, schleudert den Gegner hoch |
| S + L | Low Kick | trifft tief, schlägt stehenden Block |
| W, dann J | Air Punch | Overhead, schlägt tiefen Block |
| W, dann L / K | Flying Kick | Overhead mit großer Reichweite |
| I (→), dann J | Dash Punch | überbrückt Distanz, starker Rückstoß |
| I (→), dann L / K | Slide Kick | tief, wirft um, aber unsicher bei Block |

---

## Kampfsystem

Jeder Angriff hat echte **Framedaten** (60 fps): Startup, Active und Recovery. Dazu kommen Schaden, Knockback, Hitstun, Blockstun, Hitstop, Screen Shake und eine Trefferhöhe. Alle Werte stehen in `src/combat.js` → `SA.MOVES`.

| Angriff | Startup | Active | Recovery | Schaden | Höhe |
|---|---|---|---|---|---|
| Jab (J) | 5 | 3 | 10 | 40 | high |
| Cross (J→J) | 6 | 3 | 12 | 45 | high |
| Heavy Punch (K) | 14 | 4 | 22 | 95 | high |
| Kick (L) | 9 | 4 | 17 | 70 | mid |
| Low Kick (S+L) | 8 | 4 | 16 | 50 | **low** |
| Uppercut (S+K) | 7 | 6 | 20 | 85 | mid, Launch |
| Spin Kick (L→L) | 13 | 5 | 22 | 105 | high, Knockdown |
| Dash Punch | 6 | 5 | 18 | 80 | high |
| Slide Kick | 6 | 12 | 16 | 70 | **low**, Knockdown |
| Flying Kick | 6 | 12 | – | 80 | **overhead** |

**Hitboxen folgen dem Skelett.** Die Angriffshitbox sitzt an der schlagenden Faust bzw. am Fuß, die Hurtboxes (Kopf / Oberkörper / Beine) werden jeden Frame aus der Pose berechnet. Was man sieht, trifft auch. Deshalb gehen hohe Schläge tatsächlich über duckende Gegner hinweg, während Kicks sie treffen.

- **Kopftreffer** machen +20 % Schaden, Beintreffer −8 %.
- **Counter Hit**: Treffer in den Startup eines gegnerischen Angriffs, +20 % Schaden und mehr Hitstun.
- **Punish**: Treffer in die Recovery eines verfehlten Angriffs (wird im Spiel angezeigt).
- **Block** reduziert den Schaden auf 10 % Chip Damage, der nie tötet. Stehend blockt man high und mid, geduckt low und mid. Sprungangriffe (overhead) muss man stehend blocken.
- **Parry**: U höchstens 9 Frames (ca. 150 ms) vor dem Treffer antippen. Der Angreifer wird gestaggert, es gibt Zeitlupe, Lichtblitz, Glockenklang und +15 Energie. Wer U hämmert, parriert nie, denn nach jedem Tippen sperrt der Parry 24 Frames.
- **Ausweichschritt** (I zurück): kurze Unverwundbarkeit, danach kann man sofort kontern.
- **Knockdown → Aufstehen**: Am Boden ist man unverwundbar. Mit W oder I steht man schneller auf.
- **Juggles**: In der Luft getroffene Gegner können bis zu 3-mal weiter getroffen werden.
- **Game Feel**: Hitstop (3–12 Frames je nach Wucht), traumabasierter Screen Shake, Zoom-Punch, Impact-Flash, Zeitlupe bei Parry, KO, Spezial und harten Countern, Funken-, Staub- und Energiepartikel sowie synthetisierte Sounds.

### Energie & Spezialangriffe

Die Energieleiste unten füllt sich durch eigene Treffer, erlittenen Schaden, erfolgreiche Blocks und Parrys. Bei 100 % startet **SPACE** den Spezialangriff. Das geht auch direkt aus einem treffenden Angriff heraus, als Cancel. Danach ist die Leiste leer.

- **Shadow Rush** (Start-Special): Der Kämpfer rast nach vorne. Trifft er, folgen fünf Schläge aus wechselnden Richtungen und ein vernichtender Finisher. Geblockt oder verfehlt ist er bestrafbar.
- **Crescent Storm** (Shop, Level 4): aufsteigender Wirbel aus Kicks. Stark gegen Sprünge.
- **Shadow Slash** (Shop, Level 6, gehört auch zur Katana): eine Klingenwelle, die über den Boden rast.
- **Earthshaker** (Shop, Level 12, gehört auch zum War Hammer): Sprung mit Aufschlag und Schockwellen in beide Richtungen. Die Wellen muss man überspringen oder blocken.

---

## Combo-System

Angriffe lassen sich innerhalb eines **Cancel-Fensters** verketten. Nach einem Treffer oder Block öffnet es sofort, nach einem Fehlschlag erst spät. Ein **Input-Buffer** von 13 Frames (ca. 215 ms) speichert Eingaben, man muss also nicht framegenau drücken.

| Eingabe | Combo |
|---|---|
| J → J → K | **Twin Dragon Palm** (Jab, Cross, Doppel-Handflächenstoß mit Knockdown) |
| J → L → L | **Crescent Chain** (Jab, Kick, Spin Kick) |
| L → L | **Whirlwind** |
| S+L → J | **Rising Dragon** (Low Kick → Uppercut) |
| S+J → S+L → J | **Root Breaker** |
| S+K → W → L | **Sky Hunter** (Uppercut, hinterherspringen, Flying Kick) |

Das HUD zeigt die Trefferzahl, den Gesamtschaden und den Namen der Combo, zum Beispiel „3 HIT COMBO · 173 DAMAGE · TWIN DRAGON PALM“. Innerhalb einer Combo sinkt der Schaden leicht (−8 % pro Treffer, mindestens 55 %), damit Combos stark, aber nicht übermächtig sind.

---

## KI-System (`src/enemy.js`)

Die KI steuert ihren Kämpfer über **denselben Controller** wie der Spieler: gehaltene Richtungen und gepufferte Tastendrücke. Alle Framedaten und Recovery-Regeln gelten für sie genauso.

- **Wahrnehmung mit Reaktionszeit**: Die KI sieht den Spieler so, wie er vor *n* Frames war (Easy 24, Normal 15, Hard 10). Sie beobachtet nur Animationen und Positionen, niemals Tastendrücke, und kann deshalb nicht schummeln.
- **Zustände**: `IDLE APPROACH RETREAT ATTACK COMBO BLOCK DODGE PUNISH RECOVER`
- **Distanzlogik**: Auf große Distanz nähert sie sich an oder dasht. Auf mittlere Distanz nutzt sie Kick, Dash Punch, Slide Kick oder Sprungangriff. Nah dran spielt sie Combos, Jabs, Low Kicks, Heavy Punch, blockt oder weicht zurück.
- **Reaktionen**: Gesehene Angriffe blockt sie, bei Low-Angriffen auch geduckt. Sie weicht aus oder parriert, auf Hard gut getimt. Springt der Spieler an, kontert sie mit Uppercut als Anti-Air.
- **Punish**: Verfehlte Angriffe, gestaggerte Gegner und geblockte Specials bestraft sie.
- **Vorausschauendes Blocken**: Läuft der Spieler in Reichweite, hebt die KI manchmal schon vorher die Deckung.
- **Persönlichkeiten**: Jeder Gegner hat eigene Vorlieben:
  - **Ronin**: ausgewogen, blockstark.
  - **Kitsune**: weicht viel aus und kickt gern.
  - **Volt**: aggressiver Rushdown.
  - **Oni**: langsam, aber hart zuschlagend.
- **Schwierigkeitsgrade**:
  - **Easy**: langsame Reaktion, selten Combos, macht Fehler.
  - **Normal**: ausgewogen.
  - **Hard**: gute Blocks, volle Combos, konsequente Punishes und Ausweichbewegungen.

---

## Modi & Fortschritt

- **FIGHT**: Arena, Schwierigkeit und Special wählen. Vor Runde 1 verbeugen sich die Kämpfer. Gespielt wird Best of 3 mit 60-Sekunden-Timer. Die Rundenansage lautet „ROUND 1 … FIGHT!“, dazu kommen K.O., PERFECT und TIME.
- **TRAINING**: Der Dummy greift nicht an. Über ESC lassen sich einstellen:
  - Dummy-Verhalten: Stehen, Alles blocken, Zufällig blocken, CPU.
  - Unendliche Lebenspunkte und unendliche Energie.
  - Schadenszahlen und Hitboxen.
  - Position zurücksetzen (auch mit R).
- **ARENA**: siehe unten.
- **SHOP / LOADOUT / PROFILE**: Ausrüstung kaufen und anlegen, Level, Statistiken und Arena-Rekorde ansehen.
- **Freischaltungen**: Ein FIGHT-Sieg schaltet die nächste der ersten vier Arenen frei (Sunset Temple → Moonlit Bamboo → Neon Rain → Ember Ruins). Die übrigen Arenen schaltet man frei, indem man sie im ARENA-Modus erreicht. FIGHT-Matches bringen ebenfalls Coins und XP.
- **Statistiken** (lokal über `localStorage`): Kämpfe, Siege, Niederlagen, Siegquote, gewonnene Runden, K.O.s, Perfects, Parrys, höchste Combo, größter Combo-Schaden, gelandete Specials und Gesamtschaden. Außerdem gespeichert werden Schwierigkeit, freigeschaltete Arenen und Specials sowie alle Einstellungen. Nichts davon geht in eine Cloud.

---

## Arenen

Alle Grafiken werden prozedural mit Canvas-Formen, Verläufen und Partikeln erzeugt. Jede Arena hat Himmel, mehrere **Parallax-Ebenen** (fern, mittel, nah), einen Boden, einen unscharfen **Vordergrund**, Live-Wetter sowie eine eigene Rim-Light-Farbe für die Silhouetten, eigene Ambience und eigene Musik.

| Arena | Stimmung | Gegner |
|---|---|---|
| **Sunset Temple** | Sonnenuntergang, Pagoden, Torii, Laternen, Lichtstrahlen, fliegende Blätter | Ronin |
| **Moonlit Bamboo** | Vollmond, Sterne, wiegender Bambus, Bodennebel, Glühwürmchen | Kitsune |
| **Neon Rain** | Cyberpunk-Skyline, Neonschilder, Regen, nasse spiegelnde Straße | Volt |
| **Ember Ruins** | brennende Stadt, flackernde Feuer, Glutrisse, aufsteigende Funken | Oni |
| **Frozen Mountain** | Schneesturm, Gletscher, Eisboden, kaltes Mondlicht | Iron Titan |
| **Burning Palace** | Palast in Flammen, Rauch, Glut, rotes Licht | The Executioner |
| **Ancient Ruins** | Wüstenruinen, Staub, Säulen, Lichtstrahlen | The Hunter |
| **Cyber Arena** | Hologramme, Datenregen, Neonboden | Cyber Warlord |

Im ARENA-Modus wechseln die Arenen alle drei Stages, Bosse kämpfen in ihrer eigenen Arena.

## ARENA-Modus

Endlose Stages, jede Stage ist eine Runde gegen einen neu generierten Gegner. Wer verliert, beendet den Run. **Bereits verdiente Coins und XP bleiben immer erhalten**, sie werden nach jedem Sieg sofort gutgeschrieben.

- **Stage 1–100+**: Mit jeder Stage steigen Lebenspunkte, Schaden, Tempo, Reaktionsgeschwindigkeit, Aggressivität, Combo-Länge, Block-, Ausweich- und Parry-Rate sowie die Nutzung von Specials. Die Kurve flacht nach oben ab (`SA.BALANCE.enemyScaling`). Die KI wird besser, weil sie schneller reagiert und klüger entscheidet. Eingaben des Spielers liest sie nie.
- **Alle 5 Stages ein Elite-Gegner** mit Modifikatoren: AGGRESSIVE, FAST, ARMORED, BERSERKER, RANGED MASTER, PARRY MASTER, SHADOW STEP. Früh gibt es nie mehrere extreme Modifikatoren gleichzeitig. Später tauchen gelegentlich auch zwischendurch Elites auf.
- **Alle 10 Stages ein Boss**, **alle 30 Stages ein Great Boss** (stärker, mehr Belohnung).
- **Belohnungsformel**: `Basis × Stage^0,7 × Typ-Multiplikator × Schwierigkeit`. Elite ×1,6, Boss ×(2 + 0,09 × Stage), Great Boss zusätzlich ×1,5, Perfect +15 %.
- **Siegesserie**: ab 5 Siegen +10 %, ab 10 +20 %, ab 20 +35 %.
- **Run-HUD**: STAGE, STREAK, Coins dieses Runs und „NEXT: ELITE“ / „BOSS IN n STAGES“.
- **VICTORY**-Bildschirm mit Coins, XP, Streak-Bonus und Level-Ups → NEXT FIGHT oder END RUN.
- **ARENA RUN OVER**: erreichte Stage, Siege, besiegte Bosse, verdiente Coins und XP, beste Stage → RETRY, SHOP oder MAIN MENU.
- Die Schwierigkeit (Settings) verschiebt die effektive Stage (Easy −3, Hard +6) und ändert die Belohnung (×0,8 / ×1,3).
- Wer eine Arena im Ladder erreicht, schaltet sie auch für den FIGHT-Modus frei.

### Gegner-Archetypen

| Archetyp | Stil |
|---|---|
| **BRAWLER** | Fäuste, aggressiv, Combos auf kurze Distanz |
| **ASSASSIN** | schnell, wenig HP, Dual Blades, Ausweichen, Wurfsterne |
| **SWORDSMAN** | Katana, gutes Spacing, Konter |
| **TANK** | viel HP, Rüstung, Super Armor bei schweren Angriffen, Hammer |
| **RANGER** | hält Abstand, Kunai, Bumerang, Armbrust |
| **GUNNER** | Pistole, Revolver, Schrotflinte, muss nachladen und ist dann angreifbar |
| **MONK** | Stab, blockt und parriert viel |
| **BERSERKER** | wird unter 40 % HP schneller und aggressiver |
| **SHADOW** | teleportiert sich, Täuschungen, Schattenklingen |

Name, Farbe, Accessoires, Waffe und Verhalten werden pro Stage aus einem Seed erzeugt (`src/enemies.js`).

### Bosse

Jeder Boss hat Namen, eigenes Aussehen, eigene Waffe, eigene Fähigkeiten, eine eigene Arena und Boss-Musik. Unter 60 % und unter 25 % HP wechselt er mit kurzer Cinematic-Pause in **Phase 2 bzw. 3**: schneller, aggressiver, neue Fähigkeiten, Farbstimmung der Arena ändert sich. Alle Fähigkeiten werden vorher sichtbar angekündigt (Telegraph) und lassen sich kontern.

| Boss | Arena | Fähigkeiten |
|---|---|---|
| **THE EXECUTIONER** | Burning Palace | Henkersaxt, Super Armor, Bodenschlag, Schockwellen, Sturmangriff |
| **SHADOW RONIN** | Moonlit Bamboo | Shadow Katana und Shuriken, Teleport, Schattenschnitte, Parry-Meister |
| **IRON TITAN** | Frozen Mountain | Titan-Hammer, schwere Rüstung, Bodenschlag, Erdbeben, Schockwellen, Sturmangriff |
| **THE HUNTER** | Ancient Ruins | Dual Blades und Armbrust, Dolchfächer, Verschwinden, Teleport |
| **CYBER WARLORD** | Cyber Arena | Katana und Energiepistole, Raketensalven, Energieschild, Sturmangriff, Teleport |

---

## Level, Coins & Shop

- **XP & Level**: XP gibt es für Arena-Siege und FIGHT-Matches (auch für Niederlagen etwas). Jedes Level braucht mehr XP (`90 × Level^1,45`). Ein Level-Up bringt Coins und schaltet Shop-Gegenstände und Kosmetik frei. **Level erhöht keine Werte**: Skill bleibt wichtiger als Grinding.
- **Shop** mit den Kategorien **WEAPONS, THROWABLES, FIREARMS, SPECIALS, COSMETICS**. Jeder Eintrag zeigt Icon, Seltenheit, Preis, benötigtes Level, Schaden, Tempo, Reichweite und Spezialeffekt sowie den Status (gesperrt, kaufbar, zu teuer, besessen, ausgerüstet). Eine Live-Vorschau zeigt den Kämpfer mit der Waffe. Aktionen: **BUY**, **EQUIP** und **TRY** (sofort im Training testen).
- **Loadout**: PRIMARY (Nahkampf), RANGED (Wurf- oder Schusswaffe), SPECIAL und COSMETIC.
- **Seltenheit**: COMMON, UNCOMMON, RARE, EPIC, LEGENDARY. Seltenere Waffen sind nur moderat stärker (+0 % bis +12 % Schaden) und haben vor allem andere Eigenschaften. Keine Lootboxen, keine Zufallskäufe.

### Nahkampfwaffen

Jede Waffe hat ein eigenes Moveset mit eigener Reichweite, eigenem Tempo, eigenen Animationen, Combos, Hitboxen entlang der Klinge, schwerem Angriff, Launcher, Low, Overhead, Dash- und Luftangriff sowie eigenen Sounds und Treffer-Effekten.

| Waffe | Level | Stil |
|---|---|---|
| Fists | 1 | schnell, mobil, alle klassischen Combos |
| Wood Staff | 1 | lange Reichweite, schnelle Stöße, besserer Block |
| Katana | 3 | ausgewogen, präzise Schnitte (+ Shadow Slash) |
| Dual Blades | 5 | sehr schnell, lange Ketten, kurze Reichweite |
| Iron Bo | 7 | wie Wood Staff, stärker |
| Spear | 8 | größte Reichweite, Stiche, Konter-Spacing |
| Great Sword | 10 | langsam, hoher Schaden, schwere Angriffe mit Super Armor |
| War Hammer | 15 | sehr langsam, enormer Schaden, Schockwelle (+ Earthshaker) |
| Frost Spear | 18 | Speer, Treffer verlangsamen |
| Scythe | 20 | weite Bögen, der schwere HOOK zieht Gegner heran |
| Flame Katana | 22 | Katana, Treffer setzen in Brand |
| Electric Baton | 25 | schnell, kann kurz betäuben |
| Shadow Blades | 27 | Dual Blades mit Schattenspur |
| Thunder Hammer | 28 | Hammer mit Blitz-Betäubung |
| Shadow Katana | 30 | legendäres Katana, schnellere Schnitte |

### Fernkampf

| Waffe | Level | Eigenschaft |
|---|---|---|
| Shuriken | 1 | 3 Ladungen, laden nach, schnell, verlängert Combos |
| Throwing Knife | 3 | mehr Schaden, weniger Ladungen |
| Pistol | 5 | 6 Schuss Magazin, Nachladen nötig |
| Kunai | 8 | Bogenwurf, trifft über die Deckung und springende Gegner |
| Revolver | 10 | sehr hoher Schaden, langsam |
| Boomerang Blade | 12 | fliegt zurück und trifft zweimal |
| Crossbow | 13 | langsamer, starker Bolzen |
| Shotgun | 15 | Streuschuss, stark auf kurze Distanz |
| Explosive Kunai | 20 | explodiert mit Flächenschaden |
| Energy Pistol | 25 | keine Munition, Cooldown |

Fair balanciert: Alle Projektile sind blockbar (nur geringer Chip-Schaden), man kann ihnen ausweichen oder über sie springen, Kugeln fliegen über geduckte Gegner hinweg, ein Parry wirft Projektile zurück, und wer nachlädt, ist angreifbar. Schnelle Kugeln prüfen die Kollision über die ganze Flugstrecke eines Frames und können deshalb nicht durch Gegner „hindurchtunneln“.

---

## Speicherstand

Alles wird lokal in `localStorage` gespeichert (Schlüssel `shadowArena.save.v1`), versioniert und aufgeteilt in `{ version, player, inventory, progression, statistics, settings }`. Alte Spielstände werden automatisch migriert: Statistiken, Einstellungen und freigeschaltete Arenen bleiben erhalten, und frühere Siege werden in Start-Coins umgerechnet. Ein beschädigter Spielstand wird durch einen neuen ersetzt, statt das Spiel abstürzen zu lassen. *Settings → RESET PROGRESS* setzt alles zurück.

---

## Grafik & Performance

*Settings → GRAPHICS*: **AUTO** (Standard), **HIGH**, **MEDIUM**, **LOW**. Die Stufen ändern interne Auflösung, Partikelmenge, Wetter, Vordergrund, Spiegelungen, Lichtstrahlen, Nachbilder und Rim-Lights. AUTO wählt auf Touch-Geräten MEDIUM, sonst HIGH, und senkt die Qualität schrittweise, wenn die FPS im Kampf länger unter 48 fallen.

Weitere Maßnahmen: Die Pixeldichte wird auf 2 begrenzt. Partikel und Projektile kommen aus festen Pools (keine Garbage Collection im Kampf). Delta-Zeiten werden begrenzt, und die Simulation läuft unabhängig von der Bildrate mit festen 60 Hz. Statische Ebenen werden vorgerendert.

## Kamera

Die Kamera zoomt heraus, wenn die Kämpfer weit auseinander stehen, und heran, wenn sie nah kämpfen. Sie folgt hohen Sprüngen, gibt bei starken Treffern einen Zoom-Punch und bei einem K.O. einen kurzen Cinematic-Zoom mit Zeitlupe. Eine unsichtbare „Kamerawand“ verhindert, dass die Kämpfer aus dem Bild laufen.

---

## Debug-Tasten

| Taste | Funktion |
|---|---|
| **F1** | Debug-Overlay: FPS, Zustände, Position und Geschwindigkeit, aktuelle Animation, aktueller Angriff mit Phase und Frame, Input-Buffer, Distanz, Hitstop, Zeitskala, KI-Zustand |
| **F2** | Hitboxen (rot = Angriff, grün = Hurtbox, blau = unverwundbar bzw. Pushbox) |
| **F3** | KI-Zustand und KI-Plan über dem Gegner |
| **F4** | FPS-Anzeige |

**Entwickler-Cheats** (zum Testen des Fortschritts, im normalen Spiel nicht nötig):

| Taste | Funktion |
|---|---|
| **F5** | +1000 Coins |
| **F6** | +1 Level |
| **F7** | aktuelle Arena-Stage sofort gewinnen |
| **F8** | Boss spawnen (startet notfalls einen Arena-Run auf Stage 10) |

---

## Projektstruktur

```
shadow-arena/
├── index.html          Einstieg, lädt alle Skripte in fester Reihenfolge, Mobile-Meta, Drehen-Hinweis
├── style.css           Letterboxing 16:9, Safe Areas, touch-action: none
├── manifest.json       PWA-Manifest (Vollbild, Querformat, Icons)
├── service-worker.js   Offline-Cache (nur über http/https aktiv)
├── game.js             Game: 60-Hz-Takt, Szenen, Runden/Match/Arena, Grafikstufen, Render-Reihenfolge
├── src/
│   ├── core.js         Namespace SA, Konstanten, Mathe/Easing, Glow-Sprite-Cache
│   ├── balance.js      SA.BALANCE: alle Zahlen für Skalierung, Belohnungen, XP, Waffen, Projektile
│   ├── storage.js      versionierter Speicherstand mit Migration
│   ├── input.js        InputManager (Tastatur + Pointer Events) + Controller (Buffer/Hold)
│   ├── touch.js        Touch-Steuerung: Analog-Stick, Buttons, Multitouch pro pointerId
│   ├── audio.js        Web-Audio-Synthese: SFX, Ambience, generative Musik
│   ├── particles.js    Partikel-Pool + Effekt-Presets (Treffer, Block, Parry, KO, Staub …)
│   ├── camera.js       dynamische Kamera: Zoom, Shake (Trauma), Punch, Fokus
│   ├── physics.js      Schwerkraft, Boden, Wände, Wall-Bounce, Pushboxen, Kamerawand
│   ├── animation.js    Skelett, Posen, Keyframe-Sampling, prozedurales Laufen, Ground Snap
│   ├── combat.js       Framedaten aller Angriffe + Treffer-, Block-, Parry- und Element-Auflösung
│   ├── weapons.js      Waffenkatalog (datengetrieben) + Moveset-Generator je Waffenstil
│   ├── projectiles.js  Projektil-Pool: Würfe, Kugeln, Explosionen, Bumerang, Wellen
│   ├── fighter.js      Fighter-Zustandsautomat, Bewegung, Specials, Hurtboxes
│   ├── player.js       Charaktere: Looks (Accessoires, Farben) & Werte
│   ├── enemy.js        EnemyAI: Wahrnehmung, Zustände, Pläne, Projektil-Reaktionen, Fähigkeiten
│   ├── enemies.js      Gegner-Generator: Archetypen, Elite-Modifikatoren, Stage-Skalierung
│   ├── bosses.js       Bosse, Phasen-System, Boss-Fähigkeiten, BossAI
│   ├── progression.js  Belohnungen, XP/Level, Shop
│   ├── arenamode.js    ARENA-Run: Stages, Sieg/Niederlage, Belohnungs- und Run-Over-Screen
│   ├── renderer.js     Silhouetten-Renderer, Rim Light, Stoff-Physik, Trails, Nachbilder
│   ├── arena.js        prozedurale Arenen, Parallax, Wetter, Lichter
│   ├── arenas2.js      Frozen Mountain, Burning Palace, Ancient Ruins, Cyber Arena
│   ├── ui.js           HUD, Ansagen, Combo-Anzeige, Menüs (Tastatur, Maus, Touch), Debug-Overlay
│   └── screens.js      Shop, Loadout, Profil, Arena-Overlays
├── assets/icons/       App-Icons für die PWA (alle Spielgrafiken entstehen zur Laufzeit)
└── tests/              automatisierte Tests (optional, siehe unten)
```

### Technische Eckpunkte

- **Fester Simulationstakt** von 60 Hz mit Akkumulator über `requestAnimationFrame`. Framedaten bleiben dadurch unabhängig von der Bildrate exakt.
- **Sofortige Eingaben**: `keydown` wird direkt in eine Queue geschrieben und im nächsten Tick verarbeitet. Tasten, die während des Hitstops gedrückt werden, bleiben gepuffert.
- **Skelett-Animation**: Die Posen sind Gelenkwinkel. Angriffe nutzen Keyframes mit Easing, Ausholbewegung und Nachschwung, Fortbewegung ist prozedural. Ein „Ground Snap“ setzt immer den tiefsten Körperpunkt auf den Boden, dadurch bleiben die Füße beim Stehen, Ducken, Liegen und Aufstehen korrekt. Squash und Stretch gibt es bei Sprung und Landung, eine Dreh-Illusion beim Spin Kick. Stirnband, Pferdeschwanz und Mantel sind Verlet-Stoff und schwingen nach.
- **Rendering**: Die Canvas läuft intern in 1920×1080 und wird skaliert. Statische Ebenen werden vorgerendert, halbtransparente Ebenen werden nur dort gezeichnet, wo Inhalt ist. Mit **AUTO**-Qualität sinkt die interne Auflösung automatisch, wenn die FPS dauerhaft einbrechen. In den Einstellungen lässt sich die Qualität auch fest wählen.

---

## Tests (optional)

Das Spiel selbst braucht nichts davon. Die Tests steuern das echte Spiel über Playwright in einem headless Chromium. Die Simulation wird dabei Frame für Frame getaktet.

```bash
NODE_PATH=$(npm root -g) node tests/mechanics.js   # 30 Mechanik-Checks (Reichweiten, Blockhöhen, Parry, Combos, Specials …)
NODE_PATH=$(npm root -g) node tests/expansion.js   # 86 Checks: Migration, Shop, alle Waffen, Projektile, Reload, Parry, Generator, Belohnungen, Arena-Run, alle Bosse
NODE_PATH=$(npm root -g) node tests/touch.js out/  # echtes Multitouch (CDP): Stick + Buttons, 3 Finger, Gleiten, pointercancel, Hochformat
NODE_PATH=$(npm root -g) node tests/flow.js        # Echtzeit-Durchlauf aller Menüs nur per Tastatur (inkl. Shop-Kauf)
NODE_PATH=$(npm root -g) node tests/aimatch.js     # komplette KI-gegen-KI-Matches in allen Arenen/Schwierigkeiten
NODE_PATH=$(npm root -g) node tests/aibalance.js 8 # Siegquoten Hard/Normal/Easy gegeneinander
NODE_PATH=$(npm root -g) node tests/smoke.js out/  # lädt index.html, klickt durch Menüs, Screenshots
NODE_PATH=$(npm root -g) node tests/screens.js out/  # Screenshots: Special, K.O., Ergebnis, Menüs
NODE_PATH=$(npm root -g) node tests/posesheet.js out/poses  # Kontaktbogen aller Animationen
NODE_PATH=$(npm root -g) node tests/perf.js        # Renderzeit pro Arena und Grafikstufe + Projektil-Stresstest
```

---

## Erweiterungsmöglichkeiten

- **Neue Waffe**: In `src/weapons.js` einen Eintrag in `WEAPONS` bzw. `RANGED` anlegen (Stil, Länge, Tempo, Schaden, Element, Preis, Level). Das Moveset wird aus dem Stil erzeugt, Shop und Loadout übernehmen die Waffe automatisch.
- **Neuer Boss**: In `src/bosses.js` einen Eintrag in `BOSSES` (Look, Waffe, Phasen, Fähigkeiten) anlegen und in `ORDER` aufnehmen.
- **Balancing**: alle Zahlen zentral in `src/balance.js`.
- **Neuer Angriff**: Einen Eintrag in `SA.MOVES` (`src/combat.js`) mit Framedaten, `hit`-Gelenk und Keyframes anlegen. Die Eingabe kommt in `Fighter.tryAttacks` oder als `chain` in einen bestehenden Angriff.
- **Neue Combo-Namen**: `SA.COMBO_NAMES` erweitern.
- **Neuer Charakter**: In `SA.CHARACTERS` (`src/player.js`) Look, Accessoires, Werte und KI-Persönlichkeit anlegen.
- **Neue Arena**: In `src/arena.js` ein `DEFS.<id>` mit `skyStatic`, `layers`, `ground`, `fg`, Wetter und Rim-Farben ergänzen und die ID in `SA.ARENA_ORDER` aufnehmen.
- **Weiterer Special Move**: `SA.SPECIALS` erweitern und in `Fighter.updateSpecial` bzw. `specialHit` einbauen.
- Ideen für später: Würfe gegen Dauerblocken, Story- oder Turniermodus, lokales 2-Spieler-Versus (der Controller ist dafür schon abstrahiert), Gamepad-Support über die Gamepad API, Replays (die deterministische Simulation eignet sich dafür).
