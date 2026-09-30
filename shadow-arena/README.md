# SHADOW ARENA · Curse of the Mummy

Ein schnelles 2D-Arena-Fighting-Game im Stil einer **ägyptischen Dark-Fantasy-Unterwelt**: Du spielst eine erwachte Mumie mit flatternden Bandagen, leuchtenden Augen und Goldschmuck und kämpfst dich durch Grabwächter, Wüstenbanditen und Anubis-Akolythen bis zu den **Göttern** selbst: Anubis, Sobek, Sekhmet, Horus, Set, Ra und Osiris.

Das Spiel läuft komplett offline im Browser, am PC mit Tastatur und auf dem **Android-Tablet mit Touch-Steuerung**. Kein Server, kein npm, keine CDNs, keine externen Bilder oder Sounds: Grafik, Animationen, Musik und Soundeffekte entstehen zur Laufzeit.

Enthalten sind ein endloser **ARENA-Modus** mit über 100 Stages, zehn Gegner-Archetypen, Elite-Gegner, sieben Götter-Bosse mit je drei Phasen und Intro, **Level & XP**, **Coins** und ein **Shop** mit Nahkampfwaffen, Wurfwaffen, Relikten (Fernkampf), Specials und Kosmetik.

---

## Starten

1. Den Ordner `shadow-arena/` öffnen.
2. `index.html` doppelklicken (oder per Drag & Drop in Chrome, Edge, Firefox oder Safari ziehen).
3. Fertig. Der Startbildschirm erscheint sofort.

> Der Sound startet mit dem ersten Tastendruck oder Antippen. Browser erlauben Audio erst nach einer Benutzerinteraktion.

Alle Skripte sind klassische `<script>`-Dateien ohne ES-Module, weil Chrome Module über `file://` blockiert. Dadurch funktioniert das Spiel per Doppelklick ohne lokalen Webserver.

### Auf dem Android-Tablet spielen

**Variante A: Datei direkt öffnen (am einfachsten)**
1. Den Ordner `shadow-arena/` auf das Tablet kopieren (USB, Cloud-Ordner o. ä.).
2. `index.html` in Chrome öffnen, z. B. über die Dateien-App oder `file:///sdcard/Download/shadow-arena/index.html` in der Adresszeile.
3. Tablet quer halten und oben rechts im Hauptmenü **FULLSCREEN** antippen.

**Variante B: als App installieren (PWA, voll offline)**
1. Den Ordner auf einen Webspace legen (GitHub Pages, Netlify, eigener Server) oder im WLAN bereitstellen, z. B. am PC mit `python3 -m http.server 8000` im Ordner `shadow-arena/`.
2. Die Adresse im Chrome des Tablets öffnen und **„App installieren“ / „Zum Startbildschirm hinzufügen“** wählen.
3. Der Service Worker (`service-worker.js`) speichert alle Dateien. Danach startet das Spiel auch ohne Internet im Vollbild und im Querformat.

> Über `file://` ist der Service Worker nicht aktiv (Browser-Regel). Das Spiel läuft dort trotzdem vollständig.

---

## Steuerung

| Taste | Aktion |
|---|---|
| **A / D** (oder ← →) | Gehen. **Gedrückt halten** → nach kurzer Zeit Laufen, dann Sprinten |
| **2× A / D antippen** | Quick Dash nach vorne bzw. Backstep |
| **W** (oder ↑) | Springen · mit Richtung: weiter Sprung (Leap) |
| **S** (oder ↓) | Ducken |
| **J** | Leichter Angriff |
| **K** | Schwerer Angriff (mit Richtung: ↑ Aufwärts, ↓ Feger, → Vorstoß) |
| **L** | Kick |
| **U** | Blocken (kurz vor dem Treffer antippen = **Parry**) · **S + U** tiefer Block |
| **I** | Dash (mit →) · Backstep (ohne Richtung / mit ←) · **Combat Roll** (mit ↓) |
| **O** | Werfen / Schießen (Fernkampf-Slot) · **P** Nachladen |
| **SPACE** | Spezialangriff (bei 100 % Energie) |
| **ESC** | Pause / Trainingsoptionen · **R** Position zurücksetzen (Training) |
| **T** | Im Shop: Gegenstand im Training ausprobieren (TRY) |

### Touch-Steuerung (Tablet)

Die Touch-Steuerung erscheint automatisch, sobald der Bildschirm berührt wird (*Settings → TOUCH CONTROLS*: AUTO / ON / OFF, *TOUCH BUTTON SIZE*: Small / Medium / Large).

| Element | Funktion |
|---|---|
| **Fester Joystick** links unten | Die Basis bleibt immer an derselben Stelle, nur der Knopf bewegt sich. Auslenkung 0–12 % = Totzone, bis 50 % = Gehen, bis 85 % = Laufen, darüber = Sprinten. Nach oben = Springen, nach unten = Ducken. Zweimal schnell zur Seite schnippen = Dash |
| **PUNCH** (groß) · **HEAVY** · **KICK** | Angriffe (reagieren schon auf `pointerdown`) |
| **BLOCK** | Halten = blocken, kurz vor dem Treffer antippen = Parry |
| **DASH** | Dash / Backstep / Roll (mit Stick nach unten) |
| **SPECIAL** | Spezialangriff, der Ring zeigt die Energie |
| **THROW** · **RELOAD** | Fernkampfwaffe mit Ladungs- bzw. Munitionsanzeige |
| **❚❚** oben rechts | Pause |

Jeder Finger wird über seine `pointerId` verfolgt und per `setPointerCapture` festgehalten: Der Stick gehört genau dem Finger, der ihn berührt hat, auch wenn dieser aus dem Stickbereich rutscht. `pointerup`, `pointercancel`, `lostpointercapture`, App-Wechsel oder Fokusverlust setzen alles zurück, nichts bleibt hängen.

### Bewegung & Kontext-Aktionen

| Eingabe | Aktion |
|---|---|
| Laufen/Sprinten + J | Running Attack (Flying Knee) |
| Sprinten + ↓ + Angriff | Slide |
| Dash + J / K | Dash-Angriff / Dash-Heavy |
| Backstep + K | Backstep-Konter (+20 % Schaden) |
| ↓ + Dash | Combat Roll (rollt durch den Gegner hindurch, kurze Unverwundbarkeit) |
| ↑ + Richtung | Leap (weiter, flacher Sprung) · in der Luft J / K / L: Aerial Slash, Jump Kick |
| ↑ / ↓ / → + K | Aufwärts-Heavy (Anti-Air) · Feger (low) · Vorstoß |
| ↓ + J / L | tiefer Angriff / Low Kick |

Richtungswechsel beim Laufen erzeugen eine kurze Drehung mit Fußrutscher, Landungen haben Gewicht (Knie federn, Staub), und alle Eingaben werden 150 ms gepuffert (auch Sprung und Dash), Cancel-Fenster erlauben Combos ohne Button-Mashing.

---

## Kampfsystem

Jeder Angriff hat echte **Framedaten** (60 fps): Startup, Active, Recovery, Schaden, Knockback, Hitstun, Blockstun, Hitstop, Screen Shake und Trefferhöhe (`src/combat.js` → `SA.MOVES`, Waffen-Movesets in `src/weapons.js`).

### Kollision (Phase 1)

Jeder Kämpfer hat drei getrennte Boxen:
- **Movement Collider** (Körper, skaliert mit Größe und Statur): Kämpfer können nicht ineinander laufen. Die Trennung wird nach Anlaufgeschwindigkeit gewichtet und ist zitterfrei, an der Wand übernimmt der andere den Rest. Niemand steht auf einem liegenden Gegner.
- **Hurtboxes** (Kopf / Oberkörper / Beine) folgen jeden Frame dem Skelett.
- **Attack Hitbox** an Faust, Fuß oder Klinge plus eine **Nah-Hitbox** entlang des schlagenden Arms/Beins, damit auch Schläge aus nächster Nähe treffen. Jeder Angriff trifft pro aktivem Fenster nur einmal.

Cross-ups sind nur über Sprung, Roll, Dash-Durchgänge oder Fähigkeiten möglich. Die Blickrichtung wechselt mit einer Totzone (kein Flackern, wenn beide übereinander stehen). Jede Waffe kennt ihre gemessene Reichweite (`ranges.min / opt / max`), die auch die KI benutzt.

- **Kopftreffer** +20 % Schaden, Beintreffer −8 %. **Counter Hit** +20 %.
- **Block**: 10 % Chip Damage, beide Seiten rutschen auseinander (schwere Treffer mehr), in der Ecke wird der Angreifer zurückgeschoben. Stehend: high/mid, geduckt: low/mid, Sprungangriffe (overhead) stehend blocken.
- **Parry**: Block höchstens 9 Frames vor dem Treffer antippen. Hämmern hilft nicht (24 Frames Sperre).
- **Richtungsabhängige Trefferreaktionen**: Kopf, Körper und Beine reagieren unterschiedlich, stärkere Treffer stärker.

### Energie & Spezialangriffe

Die Energieleiste (türkis, bei 100 % golden) füllt sich durch Treffer, erlittenen Schaden, Blocks und Parrys. Ist sie voll, steigen goldene Hieroglyphen um den Kämpfer auf. Beim Auslösen reißen die Bandagen der Mumie zurück, ein Hieroglyphen-Kreis explodiert und ein Flüstern ertönt.

- **Tomb Rush** (Start): Vorstoß mit fünf Schlägen und Finisher.
- **Sandstorm Spiral** (Level 4): aufsteigender Wirbel, stark gegen Sprünge.
- **Crescent of Anubis** (Level 6): Klingenwelle über den Boden.
- **Earthshaker** (Level 12): Sprung mit Aufschlag und Schockwellen in beide Richtungen.

---

## KI-System (`src/enemy.js`)

Die KI steuert ihren Kämpfer über **denselben Controller** wie der Spieler, mit echter **Reaktionszeit**: Sie sieht den Spieler so, wie er vor *n* Frames war (normal 200–400 ms, Elite 140–250 ms, Boss 100–220 ms) und liest niemals Tastendrücke.

- **Intents** mit Mindestdauer (kein Hin- und Herspringen): `PRESSURE KEEP_DISTANCE BAIT PUNISH DEFEND REPOSITION COMBO ESCAPE RANGED_PRESSURE SPECIAL_ATTACK`.
- **Spacing pro Waffe**: Speerträger halten Abstand, Assassinen kleben am Gegner, Bogenschützen bleiben weit weg.
- **Bewegung**: Dash, Backstep, Roll, Sprung, Slide, Running Attack, je nach Archetyp unterschiedlich häufig.
- **Echte Combos**, z. B. Jackal Assassin *Light → Light → Dash → Kick*, Royal Guard *Block → Konter → Heavy*, Anubis *Teleport → Slash → Slash → Heavy*.
- **Baits & Frame Traps**, Punishes, Anti-Air, Ecken-Verhalten (Roll, Sprung, Push oder Block), dynamische Schwierigkeit über die Stage.

---

## Gegner

| Archetyp | ab Stage | Stil |
|---|---|---|
| **TOMB GUARD** | 1 | Speer + Schild, defensiv, hält Abstand |
| **DESERT BANDIT** | 4 | zwei Khopesh, schnell, Wurfmesser |
| **SCARAB WARRIOR** | 5 | Panzer, langsam, schwere Treffer |
| **DESERT ARCHER** | 6 | Bogen, hält maximale Distanz |
| **ROYAL GUARD** | 7 | Blocken, Kontern, Heavy |
| **ANUBIS ACOLYTE** | 8 | ausgewogen, Tricks, Konter |
| **JACKAL ASSASSIN** | 11 | sehr mobil, Dash-Combos |
| **SERPENT PRIEST** | 11 | Giftkugeln, Abstand |
| **CURSED MUMMY** | 14 | unberechenbar |
| **TOMB EXECUTIONER** | 16 | Henkersaxt, Super Armor |

Alle 5 Stages kommt ein **Elite** mit Modifikatoren (AGGRESSIVE, FAST, ARMORED, BERSERKER, RANGED MASTER, PARRY MASTER, SHADOW STEP).

### Götter (Bosse, alle 10 Stages)

Jeder Gott hat ein eigenes Modell, eine eigene Größe, eine versteckte Götterwaffe, eine eigene Arena und **drei Phasen**. Vor dem Kampf erscheint er aus der Dunkelheit: zuerst nur leuchtende Augen, dann tritt er ins Licht, Name und Titel erscheinen, dann „FIGHT!“. Jede Fähigkeit wird angekündigt und hat einen Konter.

| Gott | Größe | Arena | Fähigkeiten (Konter) |
|---|---|---|---|
| **ANUBIS** – Guardian of the Dead | 1.15 | Tomb of Anubis | Teleport + Schlag, Shadow Dash durch den Spieler hindurch, Soul Slash (hohe + tiefe Welle: blocken / springen), zielsuchende Seelen. Phase 2/3: Grab wird dunkler, Augen glühen |
| **SOBEK** – Devourer of the Nile | 1.4 | Nile at Night | Biss-Griff (nicht blockbar → Backstep/Sprung), Sturmangriff, Schwanzfeger (springen!), Bodenschlag |
| **SEKHMET** – Lioness of War | 1.1 | Lost Pyramid | Sprungangriff, Krallen-Serie, Solar Flare; unter 40 % **BERSERK** |
| **HORUS** – Falcon of the Sky | 1.08 | Desert Temple | Sturzflug (Doppel in Phase 3), Windgeschosse hoch/tief, Teleport |
| **SET** – Lord of Chaos | 1.12 | Chaos Desert | Blitze mit Bodenmarkierung (rausgehen!), Sandsturm drückt weg, Finten |
| **RA** – The Sun Itself | 1.12 | Temple of Ra | Sonnenstrahl (hoch → ducken, tief → springen), zielsuchende Sonnenkugeln, Light Dash, Solar Explosion; Arena wird heller |
| **OSIRIS** – King of the Underworld | 1.15 | Hall of Osiris | Seelen, Seelenraub (heilt ihn, blocken!), Regeneration (unterbrechbar), **zweites Leben** |

---

## Arenen

Acht prozedurale ägyptische Arenen mit Himmel, Parallax-Ebenen, Boden, Vordergrund, Live-Licht (Fackeln, Kohlebecken flackern) und atmosphärischen Partikeln:

| Arena | Stimmung |
|---|---|
| **Desert Temple** | Sonnenuntergang über Pylonen und Obelisken, Sand weht |
| **Nile at Night** | Mondlicht auf dem Nil, Palmen, Wasser glitzert |
| **Lost Pyramid** | Pyramidenkammer, Staub in Lichtstrahlen |
| **Scarab Catacombs** | Katakomben, krabbelnde Skarabäen |
| **Tomb of Anubis** | Grabkammer, Hieroglyphen-Wände, Schakalschreine |
| **Chaos Desert** | roter Sandsturm und Blitze |
| **Temple of Ra** | riesige Sonne, Lichtstrahlen, Glut |
| **Hall of Osiris** | Totenhalle, schwebende Glyphen, Nebel |

---

## Präsentation

- **Mumie**: dunkler Körper unter hellen, zerrissenen Bandagen, 6 lose Bandagen-Enden (Verlet-Physik, reagieren auf Tempo und Special), leuchtende türkise Augen (heller bei voller Energie), Goldschmuck, asymmetrischer Schulterpanzer, Gürtel, Armschienen, Amulett.
- **Animation**: Idle mit Atmung und Gewichtsverlagerung, Lauf/Sprint mit Vorlage, Wende-Pivot, Angriffe mit Ausholen, Schlag, Impact, Nachschwung und Erholung.
- **Kamera**: folgt Dashes und Sprints mit Vorlauf, zoomt beim Sprinten leicht heraus, folgt Sprüngen, Zoom-Punch bei harten Treffern, stärkeres Beben bei Göttern.
- **Effekte**: Sand-Spuren bei Dash/Roll/Sprint, Hieroglyphen bei Special und Phasenwechsel, Telegraph-Ringe und Lichtsäulen vor Götterangriffen.
- **Sound** (synthetisiert, keine Samples): Sand-Schritte, Wind + Sand beim Dash, Bronze-Klang bei Blocks, mystische Töne, tiefe Boss-Impacts, Donner, das Flüstern der Mumie.

---

## Level, Coins & Shop

- **XP & Level** aus Arena-Siegen und FIGHT-Matches. Level erhöht keine Werte, es schaltet Shop-Gegenstände frei.
- **Shop**: WEAPONS, THROWN, RELICS, SPECIALS, COSMETICS mit BUY / EQUIP / TRY.
- **Nahkampf** (Auswahl): Ceremonial Staff, Khopesh, Dual Khopesh, Ankh Staff, Spear, Pharaoh Greatsword, War Mace, Moonlit Spear, Scythe, Solar Khopesh, Was Sceptre, Scarab Blades, Mace of Set, Khopesh of Anubis, Cursed Fists.
- **Fernkampf**: Scarab Discs, Throwing Knives, Cursed Daggers, Throwing Stick, Fire Scarab, Eye of Ra, Scepter of Set, Desert Bow, Sandburst Relic, Ankh of Radiance.
- **Kosmetik** (Bandagenfarben): Sand Wraps, Gilded Burial, Lapis Curse, Jade Spirit, Amethyst Hex, Ember Soul, Obsidian Wraps.

## Speicherstand

Lokal in `localStorage`, versioniert (aktuell Version 3). Alte Spielstände werden automatisch migriert: alte Arena-IDs werden auf die neuen ägyptischen Arenen umgeschrieben, Coins, Level, Waffen, Loadout und Statistiken bleiben erhalten.

## Grafik & Performance

*Settings → GRAPHICS*: AUTO, HIGH, MEDIUM, LOW (interne Auflösung, Partikel, Wetter, Vordergrund, Spiegelungen, Lichtstrahlen, Nachbilder). AUTO senkt die Qualität automatisch bei dauerhaft niedrigen FPS. Partikel und Projektile kommen aus festen Pools, die Simulation läuft mit festen 60 Hz, statische Ebenen werden vorgerendert, Bandagen sind einfache Verlet-Ketten.

---

## Debug

| Taste / Einstellung | Funktion |
|---|---|
| *Settings → DEBUG OVERLAY* | kompaktes Overlay auch auf dem Tablet: FPS, Zustand beider Kämpfer, Distanz, Mindestabstand, aktueller Angriff, KI-Intent |
| **F1** | ausführliches Debug-Overlay (Zustände, Animation, Buffer, Hitstop …) |
| **F2** | Hitboxen: **blau** Movement Collider, **grün** Hurtbox, **rot** Angriff (gestrichelt: Nah-Hitbox), **gelb** Projektile, **orange** Waffenreichweite, dazu Distanz / Mindestabstand / Blickrichtung |
| **F3** | KI-Intent und Plan über dem Gegner |
| **F4** | FPS |
| **F5–F8** | Entwickler: +1000 Coins, +1 Level, Stage gewinnen, Gott spawnen |

---

## Projektstruktur

```
shadow-arena/
├── index.html          Einstieg, lädt alle Skripte in fester Reihenfolge
├── game.js             60-Hz-Takt, Szenen, Runden/Arena, Boss-Intro, Boss-Stimmungen, Render-Reihenfolge
├── src/
│   ├── core.js         Namespace SA, Konstanten, Mathe, Glow-Sprites
│   ├── balance.js      alle Zahlen für Skalierung, Belohnungen, Reaktionszeiten
│   ├── storage.js      versionierter Speicherstand mit Migration
│   ├── input.js        Tastatur + Pointer Events (Capture), Controller mit Buffer
│   ├── touch.js        fester Joystick, Buttons, Multitouch pro pointerId
│   ├── audio.js        Web-Audio-Synthese: SFX, Ambience, Musik
│   ├── particles.js    Partikel-Pool + Effekte (Hieroglyphen, Sand, Seelen …)
│   ├── camera.js       Kamera: Zoom, Vorlauf, Sprint-Zoom, Shake, Punch
│   ├── physics.js      Movement Collider, Trennung, Wände
│   ├── animation.js    Skelett, Posen, Idle/Lauf/Sprint, Übergänge
│   ├── combat.js       Framedaten + Treffer/Block/Parry/Nah-Hitbox
│   ├── weapons.js      Waffenkatalog, Movesets, gemessene Reichweiten
│   ├── projectiles.js  Projektile inkl. zielsuchend, Strahlen, Blitze
│   ├── fighter.js      Zustandsautomat, Bewegung, Mobility-Moves, Specials
│   ├── player.js       die Mumie + Trainingspuppe
│   ├── enemy.js        KI: Wahrnehmung, Intents, Spacing, Combos
│   ├── enemies.js      Gegner-Archetypen + Generator
│   ├── bosses.js       Götter, Phasen, Fähigkeiten, BossAI
│   ├── renderer.js     Material-Renderer, Bandagen, Kopfformen der Götter
│   ├── arena.js        Arena-Laufzeit: Licht, Wetter, Blitze, Malhelfer
│   ├── arenas_egypt.js die acht ägyptischen Arenen
│   ├── progression.js / arenamode.js / ui.js / screens.js
└── tests/              automatisierte Tests (optional)
```

---

## Tests (optional)

Die Tests steuern das echte Spiel über Playwright in headless Chromium, Frame für Frame.

```bash
NODE_PATH=$(npm root -g) node tests/collision.js   # Collider, Trennung, Cross-ups, Nah-Hitbox, Reichweiten
NODE_PATH=$(npm root -g) node tests/movement.js    # Lauf/Sprint, Dash, Backstep, Roll, Leap, Slide, Buffer
NODE_PATH=$(npm root -g) node tests/touch.js       # echter Multitouch: fester Joystick, Zonen, Reset
NODE_PATH=$(npm root -g) node tests/ai.js          # Intents, Spacing, Reaktionszeiten, Combos, Ecke
NODE_PATH=$(npm root -g) node tests/bosses.js      # jede Götter-Fähigkeit trifft und hat einen Konter, Intro, Phasen
NODE_PATH=$(npm root -g) node tests/mechanics.js   # Framedaten, Blockhöhen, Parry, Combos, Specials
NODE_PATH=$(npm root -g) node tests/expansion.js   # Migration, Shop, Waffen, Projektile, Arena-Run, alle Götter
NODE_PATH=$(npm root -g) node tests/flow.js        # alle Menüs per Tastatur
NODE_PATH=$(npm root -g) node tests/lineup.js out.png  # alle Figuren nebeneinander
NODE_PATH=$(npm root -g) node tests/perf.js        # Renderzeit pro Arena und Grafikstufe
```

## Erweiterungsmöglichkeiten

- **Neue Waffe**: Eintrag in `src/weapons.js` (Stil, Länge, Tempo, Element, Preis, Level). Moveset und Reichweiten werden erzeugt.
- **Neuer Gott**: Eintrag in `BOSSES` (`src/bosses.js`) mit Look, Waffe, KI-Profil und Phasen, in `ORDER` aufnehmen. Neue Fähigkeiten in `MOVES` + `act` / `actUpdate` / `moveHit`.
- **Neuer Gegner**: Archetyp in `src/enemies.js` (Look, Waffen, KI-Profil mit Intents, Mobility und Combos).
- **Neue Arena**: `DEFS` in `src/arenas_egypt.js`.
