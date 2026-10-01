# SHADOW ARENA · Curse of the Mummy

Ein schneller 2D-**Platform-Fighter** im Stil einer **ägyptischen Dark-Fantasy-Unterwelt**: Du spielst den **Moon Guardian**, einen mystischen Mondkrieger in weißen Bandagen mit Kapuze, kurzem Umhang, Gold- und Mondsilber-Details, leuchtenden Augen und zwei **Crescent Pistols**. Gekämpft wird auf dem Boden und auf schwebenden Steinplattformen, mit Flips, Rolls, Dashes, Schüssen im Salto und Sturzangriffen, gegen Grabwächter, Wüstenbanditen und Anubis-Akolythen bis zu den **Göttern** selbst: Anubis, Sobek, Sekhmet, Horus, Set, Ra und Osiris.

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

### Auf dem Handy spielen

Genau wie auf dem Tablet (Variante A oder B unten), Handy quer halten. Das Spiel erkennt Handys automatisch:
- **Vollbild ohne schwarze Ränder:** bei breiten Handy-Displays (19,5:9, 20:9 …) wird die Spielfläche breiter statt mit Balken gefüllt.
- **Gleiche Steuerung wie auf dem Tablet** (Joystick-Gesten, ATTACK / KICK / SHOOT / SPECIAL), alle Touch-Elemente 25 % größer für Daumen; *TOUCH BUTTON SIZE* in den Settings wirkt zusätzlich.
- **HUD größer** (Porträts, Namen, Leisten, Timer), Pause-Knopf immer am rechten Rand.

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
| **W** (oder ↑) | Springen · aus dem Lauf / Dash: **Front Flip** · mit Rückwärts: **Backflip** |
| **S** (oder ↓) | Ducken · in der Luft: **Fast Fall** · auf einer Plattform: **durchfallen** |
| **J** | Leichter Angriff |
| **K** | Schwerer Angriff (mit Richtung: ↑ Aufwärts, ↓ Feger, → Vorstoß) |
| **L** | Kick |
| **U** | Blocken (kurz vor dem Treffer antippen = **Parry**) · **S + U** tiefer Block |
| **I** | Dash (mit →) · Backstep (ohne Richtung) · **Handspring / Flikflak** (mit ←) · **Combat Roll** (mit ↓) · in der Luft: **Air Dash** |
| **O** | Schießen / Werfen — jederzeit, auch im Lauf, Dash, Roll-Ende, Flip und Fall (↓ + O in der Luft zielt nach unten). Nachladen passiert automatisch (**P** lädt optional sofort nach) |
| **SPACE** | Spezialangriff (bei 100 % Energie) |
| **ESC** | Pause / Trainingsoptionen · **R** Position zurücksetzen (Training) |
| **T** | Im Shop: Gegenstand im Training ausprobieren (TRY) |

### Touch-Steuerung (Tablet)

Die Touch-Steuerung erscheint automatisch, sobald der Bildschirm berührt wird (*Settings → TOUCH CONTROLS*: AUTO / ON / OFF, *TOUCH BUTTON SIZE*: Small / Medium / Large). Links ein **fester Joystick**, rechts nur noch **vier Buttons** — Block, Dash, Heavy, Reload und Sprung stecken im Joystick und in den Gesten.

| Element | Funktion |
|---|---|
| **ATTACK** (groß, rechts unten) | Leichter Angriff, kontextabhängig (Stand, Lauf, Dash, Roll-Ende, Luft, Flip). **Doppeltipp** (≤ 260 ms) = **Heavy**, bricht den Light sofort in den passenden Heavy ab |
| **KICK** | Kick / Running Kick / Flying Kick / Feger (mit ↓) |
| **SHOOT** | Schießen ohne Stillstand: im Lauf, im Dash, im Salto (**Salto-Schuss**), im Fall (Stick ↓ = nach unten zielen) |
| **SPECIAL** | Spezialangriff, der Ring zeigt die Energie |
| **❚❚** oben rechts | Pause |

**Joystick-Gesten** (lösen schon beim Erreichen der Zone aus, nicht erst beim Loslassen; „vorwärts“ = zum Gegner, wird bei Seitenwechsel neu berechnet):

| Geste | Boden | Luft |
|---|---|---|
| ← / → halten | Gehen → Laufen → Sprinten (nach Auslenkung) | Luftsteuerung |
| ↑ | akrobatischer Sprung mit Drehung | — |
| ↗ / ↖ (zum Gegner / weg) | **Front Flip** / **Backflip** · 2× ↗ = **Flip Leap** | — |
| ↘ / ↙ | **Roll** in diese Richtung (kleinere Hurtbox) | Fast Fall |
| ↓ | Ducken · auf Plattform **durchfallen** | **Fast Fall** (↓ + ATTACK = Sturzangriff) |
| kurzer Schnipp → / ← | **Dash** zum Gegner / **Backstep** | **Air Dash** |
| 2× Schnipp | **Long Dash** / **Flikflak** (Handspring) | Air Dash |

In den ersten Sekunden eines Kampfes (und im Training) zeigen kleine Hinweise am Joystick, was jede Richtung macht.

Jeder Finger wird über seine `pointerId` verfolgt und per `setPointerCapture` festgehalten: Der Stick gehört genau dem Finger, der ihn berührt hat, auch wenn dieser aus dem Stickbereich rutscht. `pointerup`, `pointercancel`, `lostpointercapture`, App-Wechsel oder Fokusverlust setzen alles zurück, nichts bleibt hängen.

### Bewegung & Akrobatik

| Eingabe | Move |
|---|---|
| Laufen/Sprinten + ↓ | **Slide** (tief, unter hohen Angriffen und Projektilen durch) · im Slide: J/L = Slide-Angriff, K = Uppercut, ↑ = Sprung |
| Laufen / Dash + ↑ | **Front Flip** (Salto nach vorn, ab dem 8. Frame Angriff möglich = rotierender Slash) |
| ← + ↑ oder Backstep + ↑ | **Backflip** (defensiv, ab der zweiten Hälfte Wurf / Angriff möglich) |
| ← + Dash | **Handspring / Flikflak** (Hände auf den Boden, schnell zurück, kurz unverwundbar; direkt danach K = Konter) |
| ↓ + Dash | **Combat Roll** (unter hohen Angriffen, durch den Gegner hindurch) · gegen Ende J / L / K = **Roll-Angriff** |
| Dash in der Luft | **Air Dash** (einmal pro Sprung, Schwerkraft kurz aus, danach sofort Angriff möglich) |
| Luft: J · L · K · ↓ + K/L | Aerial Slash · Flying Kick · Hammer Drop (Waffe: schwerer Luftschlag) · **Dive Kick** |
| Laufen/Sprinten + J · Dash + J / K | Running Attack · Dash-Angriff / Dash-Heavy |
| Backstep + K | Backstep-Konter (+20 % Schaden) |
| ↑ / ↓ / → + K | Aufwärts-Heavy (Launcher) · Feger (low) · Vorstoß |

**Wie sich Bewegung und Kampf verbinden:** Leichte Angriffe lassen sich in jeden anderen Angriff, in Dash und in einen Sprung canceln. Heavies nur nach einem Treffer. Ein Treffer lässt sich sofort in Dash, Roll oder Backstep canceln. Launcher (Uppercut, Spin Kick, Slide Kick) heben den Gegner an, danach geht es per Jump-Cancel in die Luft weiter. Jeder weitere Lufttreffer hebt weniger hoch und lässt schneller fallen (Juggle-Widerstand, keine Infinites). Ein Sprungangriff, der trifft, geht nach der Landung ohne Sperre weiter. Ein verfehlter kostet eine kurze Landung, aus der man nach 3 Frames trotzdem ausweichen kann.

**Eingabepuffer:** Jeder Tastendruck wird 150 ms gespeichert, zusammen mit der Richtung, die in diesem Moment gehalten wurde. Ein Angriff, der kurz vor dem Ende der laufenden Animation gedrückt wird, kommt im nächsten gültigen Cancel-Fenster, und zwar mit der Richtung des Drucks. Ein interner Mobilitätswert verhindert Ausweich-Spam: Wer viele Ausweichbewegungen hintereinander macht, rollt etwas kürzer und erholt sich langsamer, eine sichtbare Stamina-Leiste gibt es nicht.

### Sprung, Double Jump & Luftkontrolle

- **Airtime statt Hektik:** normaler Sprung ~0,93 s, akrobatischer Sprung / Flips 1,0–1,1 s, am höchsten Punkt ein kurzer **Apex Hang** (~0,1 s mit reduzierter Schwerkraft). Flips drehen langsam an, schnell in der Mitte, weich aus (eigene Rotationskurve) und sind jederzeit durch einen Angriff unterbrechbar.
- **Double Jump:** in der Luft erneut ↑ (Touch) bzw. W. Schwächer als der erste Sprung (~0,6 s zusätzliche Luftzeit), Knie ziehen an, Mondlicht-Ring und Sandwolke unter den Füßen. Neutral = senkrecht, mit Richtung = diagonal, nach hinten = Rückwärtssalto. Er frischt den Luftangriff auf und kann die Erholung eines Luftangriffs abbrechen.
- **Luftkontrolle ~40 %:** Beschleunigung auf eine begrenzte Luftgeschwindigkeit, leichter Luftwiderstand, kein sofortiger 180°-Wechsel; Schwung aus Flips und Dashes bleibt erhalten, auch während Luftangriffen.
- **Coyote Time** (~100 ms nach dem Verlassen einer Kante zählt ein Sprung noch als Bodensprung) und **Jump Buffer** (↑ kurz vor der Landung springt beim Aufsetzen).
- **Boden:** ~95 % Zielgeschwindigkeit in ~110 ms, Abbremsen in ~120 ms, ruhigere Lauf-/Sprinttempi. Das Spektakel kommt aus Dashes, Flips, Combos und Trails, nicht aus hektischem Grundtempo.
- **Landung:** nur Pose (Knie, Squash), kein Lock; ein verfehlter Luftangriff kostet ~100 ms.
- **Zeitlupen-Momente (CombatTimeController):** schwere Lufttreffer, Sturzangriffe, Combo-Finisher, Perfect Dodge, Schuss aus Backflip/Double Jump: kurz 0,36–0,6× für 60–140 ms Echtzeit, dann weich zurück. Leichte Treffer nie. Eingaben laufen in Echtzeit weiter, die nächste Aktion kann während der Zeitlupe gepuffert werden. Hitstop ist kürzer (leicht ~17 ms, schwer 50–67 ms).
- **Kamera:** gewichteter Mittelpunkt (Spieler etwas stärker), **Deadzone** horizontal und vertikal, ruhiges Nachziehen, dezenter Look-Ahead (Lauf, Sprung nach oben, Sturz nach unten).

### Plattformen

Jede Arena hat neben dem Boden **3–4 schwebende Sandsteinplattformen** (Layouts *temple*, *bridge*, *steps*, *four*). Sie sind **one-way**: von unten durchspringen, von oben landen. Von der Kante laufen, rollen oder dashen = Fallen (nie hängenbleiben), ↓ auf der Plattform = durchfallen, Fast Fall fällt ebenfalls hindurch. Die untere Ebene erreicht man vom Boden mit Sprung oder Flip, die obere von einer unteren Plattform. Die Kamera zoomt und hebt sich weich mit, Schatten liegen auf der Fläche unter dem Kämpfer, Wurfgeschosse und Schüsse nach unten schlagen auf Plattformen ein.

### Schießen & Sturzangriffe

- **Schießen ohne State-Lock**: Ein Schuss läuft *über* der aktuellen Aktion — Laufen, Dash, Roll-Ende, Flip, Fall. Der Arm zielt im Weltraum, auch während sich der Körper dreht (**Salto-Schuss** mit Mündungsfeuer, Rückstoß und gezeichneter Pistole). In der Luft bremst ein Schuss den Fall kurz, ↓ + Schuss zielt nach unten und drückt nach oben. Eine leichte Zielhilfe gleicht Höhenunterschiede (Plattformen) aus.
- **Automatisches Nachladen**, sobald das Magazin leer ist oder nach einer kurzen Schusspause — kein Reload-Button.
- **Crescent Pistols** (Startwaffe): zwei Pistolen, abwechselnd, schnell, leicht, 8 Schuss. Die anderen Fernkampfwaffen unterscheiden sich in Feuerrate, Tempo, Streuung, Rückstoß und Munition.
- **Sturzangriff**: ↓ + Angriff in der Luft (auch noch nach einem Luftangriff). ↓ + Heavy = **Crescent Dive** senkrecht nach unten mit Hitstop, Aufschlagring, Sandfontäne und Flächentreffer. Der Sturz lenkt auf einen Gegner unter einem. Sturzangriffe schmettern Gegner in der Luft nach unten und lassen Gegner am Boden hochprallen, schwere Luftangriffe schleudern weiter.

### Combos (entstehen aus den Systemen, nichts ist gescriptet)

| Combo | Eingaben |
|---|---|
| **MUMMY RUSH** | J → J → Dash (→ + I) → K |
| **DESERT CYCLONE** | L → L (Spin Kick hebt an) → Sprung vorwärts → L |
| **TOMB BREAKER** | ↓ + L → J (Uppercut) → Sprung → K |
| **PHARAOH’S WRATH** | Dash → J → J → K (→ SPACE bei voller Energie) |
| **SCARAB FLOW** | Roll (↓ + I) → J (Roll-Angriff) → Dash → L |
| **SANDS OF DEATH** | Sprint → ↓ (Slide) → J (Slide Kick hebt an) → Sprung vorwärts → J |

**Flow-Combos** (Platform-Fighter): erkannt an der Art der Treffer innerhalb von ~1 s, mit jeder Waffe:

| Combo | Ablauf |
|---|---|
| **CRESCENT FLOW** | Annähern → Attack → Kick → ↗ Flip → Air Slash → ↓ + Heavy (Sturz) |
| **MOON GUNNER** | Backflip → Schuss → Schuss → Landen → Dash → Kick |
| **DESERT DIVE** | Plattform → Sprung → Schuss → Fast Fall → Heavy |
| **MOON DANCE** | Roll unter dem Angriff durch → Roll-Angriff → Dash → Kick → Backflip → Schuss |

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

Die Energieleiste (mondblau, bei 100 % golden) füllt sich durch Treffer, erlittenen Schaden, Blocks und Parrys. Ist sie voll, steigen goldene Hieroglyphen um den Kämpfer auf. Beim Auslösen reißen die Bandagen der Mumie zurück, ein Hieroglyphen-Kreis explodiert und ein Flüstern ertönt.

- **Crescent Moonfall** (Moon Guardian, Start): Mond-Dash (trifft und hebt an) → Front Flip (lenkbar, ATTACK schlägt früher) → Sichelschlag → Welle aus Mondlicht → Landung mit Lichtring.
- **Tomb Rush**: Vorstoß mit fünf Schlägen und Finisher.
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
- **Plattformen**: Steht der Spieler oben, wartet die KI nie darunter — sie springt hinauf (für die obere Ebene über eine untere Plattform), schießt nach oben oder wechselt die Plattform. Steht sie selbst oben und der Spieler unten, fällt sie durch, läuft über die Kante oder stürzt mit einem Dive-Angriff herab. In der Luft steuert sie, greift an und verfolgt (`JUMP_TO_PLATFORM`, `DROP_FROM_PLATFORM`, `AIR_ATTACK`, `CHASE_AIR`, `RANGED_PRESSURE`).
- **Archetyp-Combos**: Jackal *Dash → Slash → Kick → Flip → Luftangriff → Sturz*, Tomb Guard *Abstand → Speer → Schritt zurück → Anti-Air*, Anubis-Akolyth *Dash → Sprung → Air Slash → Sturzangriff*.

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

- **Moon Guardian**: weiße/cremefarbene Bandagen über dunkler Unterschicht, weiße Kapuze mit Goldkante und Mondsichel auf der Stirn, Gesicht im Schatten mit leuchtenden mondblauen Augen, kurzer Umhang (Verlet-Kette als Stoffbahn mit dunklem Futter und Goldsaum), goldene Mondsichel auf der Brust, silberner Schulterpanzer und Armschienen, lose Bandagen-Enden, kräftigere Gliedmaßen mit Licht- und Schattenkante. Waffenspuren sind Mondsicheln aus Silberlicht.
- **HUD** wie im Konzept: oben links/rechts Porträt-Medaillon, Name, Lebensleiste und direkt darunter die Energie, in der Mitte Timer und Stage. Weniger Text, mehr Platz für die Arena.
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

Lokal in `localStorage`, versioniert (aktuell Version 4). Alte Spielstände werden automatisch migriert: alte Arena-IDs werden auf die neuen ägyptischen Arenen umgeschrieben, Version 4 gibt allen die Crescent Pistols (bei leerem Fernkampf-Slot ausgerüstet) und den Special Crescent Moonfall (ersetzt den Standard-Special Tomb Rush, der im Shop wählbar bleibt). Coins, Level, Waffen, Loadout und Statistiken bleiben erhalten.

## Flüssige Bewegung: wie es technisch funktioniert

- **Simulation und Darstellung sind getrennt:** Gameplay, Physik und KI laufen in festen 60-Hz-Schritten. Gezeichnet wird mit der Bildrate des Geräts (60 / 90 / 120 / 144 Hz), und jedes Bild zeigt eine Interpolation zwischen den letzten beiden Simulationsschritten: Skelett, Bandagen, Kamera, Projektile und Partikel. Frame-Zeit-Schwankungen werden nicht mehr als Ruckeln sichtbar. Kurze Hänger werden auf maximal 3 Schritte begrenzt.
- **Root Motion:** Dash, Backstep, Roll, Slide und Air Dash haben eigene Geschwindigkeitskurven (schneller Antritt, kurzer Peak, sauberes Auslaufen), Flips und Handspring sind echte physikalische Sprünge mit passender Körperdrehung.
- **Animation:** Übergänge werden immer geblendet, nie hart gesetzt. Bei Angriffen führt der Rumpf, die Arme folgen minimal, die Waffe zuletzt. In den aktiven Frames stimmt die Pose exakt mit den Framedaten (Hitbox) überein. Dazu kommen Lean aus Geschwindigkeit und Bremsen, stabilisierter Kopf, Umdrehen über ~7 Frames statt Spiegeln in einem Bild und Gangzyklen nach zurückgelegter Strecke mit Foot-Locking (kein Schlittschuhlaufen). Angriffe aus einem Salto führen die Drehung zu Ende.
- **Hitstop** friert nur die beiden Kämpfer ein (leicht ~17–33 ms, schwer ~67 ms, Götter bis ~100 ms). Partikel, Blitze und Kamera laufen weiter.
- **Effekte:** Waffenspuren folgen der echten Klingenbahn, Nachbilder sind kurze Sand-Silhouetten (60–150 ms, höchstens 3).

## Grafik & Performance

*Settings → GRAPHICS*: AUTO, HIGH, MEDIUM, LOW (interne Auflösung, Partikel, Wetter, Vordergrund, Spiegelungen, Lichtstrahlen, Nachbilder). AUTO senkt die Qualität automatisch bei dauerhaft niedrigen FPS. Partikel und Projektile kommen aus festen Pools, die Simulation läuft mit festen 60 Hz, statische Ebenen werden vorgerendert, Bandagen sind einfache Verlet-Ketten.

---

## Debug

| Taste / Einstellung | Funktion |
|---|---|
| *Settings → DEBUG OVERLAY* | Overlay auch auf dem Tablet: FPS, Frame-Zeit (aktuell / Maximum), Interpolations-Alpha, Zustand, Geschwindigkeit, Boden/Luft und Mobilität beider Kämpfer, aktueller Move mit Phase, Frame x/Startup+Active+Recovery, offenes Cancel-Fenster und Blend-Anteil, Distanz, Hitstop, KI-Intent, Animation + Zeit, Blend-Quelle → Ziel in %, Schwerkraft-Faktor, Airtime, verbleibende Sprünge, Coyote, TimeScale / FOCUS, Eingabepuffer |
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
│   ├── touch.js        fester Joystick + Gestenerkennung, 4 Buttons, Multitouch pro pointerId
│   ├── audio.js        Web-Audio-Synthese: SFX, Ambience, Musik
│   ├── particles.js    Partikel-Pool + Effekte (Hieroglyphen, Sand, Seelen …)
│   ├── camera.js       Kamera: Zoom, Vorlauf, Sprint-Zoom, Shake, Punch
│   ├── physics.js      Movement Collider, Trennung, Wände, One-Way-Plattformen, Fast Fall
│   ├── animation.js    Skelett, Posen, Idle/Lauf/Sprint, Übergänge
│   ├── combat.js       Framedaten + Treffer/Block/Parry/Nah-Hitbox
│   ├── weapons.js      Waffenkatalog, Movesets, gemessene Reichweiten
│   ├── projectiles.js  Projektile inkl. zielsuchend, Strahlen, Blitze
│   ├── fighter.js      Zustandsautomat, Bewegung, Mobility-Moves, Specials
│   ├── player.js       der Moon Guardian + Trainingspuppe
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
NODE_PATH=$(npm root -g) node tests/movement.js    # Lauf/Sprint, Dash, Backstep, Roll, Front Flip, Slide, Buffer
NODE_PATH=$(npm root -g) node tests/touch.js       # echter Multitouch: Joystick-Gesten, 4 Buttons, Doppeltipp-Heavy, Abnahmetest 53
NODE_PATH=$(npm root -g) node tests/platforms.js   # One-Way-Plattformen, Durchfallen, Fast Fall, Kanten, Kamera, Abnahmetest 54
NODE_PATH=$(npm root -g) node tests/flowcombat.js  # Abnahmetest 55, Schießen ohne State-Lock, Auto-Reload, Dive, Crescent Moonfall, Flow-Combos
NODE_PATH=$(npm root -g) node tests/aiplatform.js  # KI auf Plattformen + Abnahmetest 56 (30 s KI gegen KI)
NODE_PATH=$(npm root -g) node tests/phone.js       # Handy (844×390, 19,5:9): Vollbild, skalierte Steuerung, Multitouch
NODE_PATH=$(npm root -g) node tests/choreo.js      # Abnahmetest 74 + Airtime, Apex Hang, Double Jump, Coyote Time, Jump Buffer
NODE_PATH=$(npm root -g) node tests/ai.js          # Intents, Spacing, Reaktionszeiten, Combos, Ecke
NODE_PATH=$(npm root -g) node tests/bosses.js      # jede Götter-Fähigkeit trifft und hat einen Konter, Intro, Phasen
NODE_PATH=$(npm root -g) node tests/smooth.js     # Abnahmetests A–G: keine Posen-/Positionssprünge, Übergänge ohne Idle, Interpolation, Frame-Zeiten
NODE_PATH=$(npm root -g) node tests/combos.js     # die sechs Bewegungs-Combos mit echten Eingaben
NODE_PATH=$(npm root -g) node tests/acrosheet.js out.png  # Bildfolge aller Akrobatik-Moves
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
