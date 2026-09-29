# SHADOW ARENA

Ein schnelles 2D-Arena-Fighting-Game mit Silhouetten-Kämpfern, prozeduralen Animationen und atmosphärischen Arenen. Es läuft komplett offline im Browser: kein Server, kein npm, keine CDNs, keine externen Bilder oder Sounds.

---

## Starten

1. Den Ordner `shadow-arena/` öffnen.
2. `index.html` doppelklicken (oder per Drag & Drop in Chrome, Edge, Firefox oder Safari ziehen).
3. Fertig. Der Startbildschirm erscheint sofort.

> Der Sound startet mit dem ersten Tastendruck oder Mausklick. Browser erlauben Audio erst nach einer Benutzerinteraktion.

Alle Skripte sind klassische `<script>`-Dateien ohne ES-Module, weil Chrome Module über `file://` blockiert. Dadurch funktioniert das Spiel per Doppelklick ohne lokalen Webserver.

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
| **SPACE** | Spezialangriff (bei 100 % Energie) |
| **ESC** | Pause / Trainingsoptionen |
| **R** | Position zurücksetzen (Training) |
| **Enter / J** | Menü bestätigen · **ESC / K** zurück · Maus funktioniert ebenfalls |

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
- **Crescent Storm** (wird nach 2 Siegen freigeschaltet): aufsteigender Wirbel aus Kicks. Stark gegen Sprünge.

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
- **Freischaltungen**: Ein Sieg in einer Arena schaltet die nächste frei (Sunset Temple → Moonlit Bamboo → Neon Rain → Ember Ruins). Nach 2 Siegen wird Crescent Storm freigeschaltet.
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

---

## Projektstruktur

```
shadow-arena/
├── index.html          Einstieg, lädt alle Skripte in fester Reihenfolge
├── style.css           Letterboxing 16:9, Vollbild-Canvas
├── game.js             Game: fester 60-Hz-Takt, Szenen, Runden/Match, Hitstop, Zeitlupe, Render-Reihenfolge
├── src/
│   ├── core.js         Namespace SA, Konstanten, Mathe/Easing, Glow-Sprite-Cache
│   ├── storage.js      localStorage-Fortschritt & Einstellungen
│   ├── input.js        InputManager (keydown sofort gepuffert) + Controller (Buffer/Hold)
│   ├── audio.js        Web-Audio-Synthese: SFX, Ambience, generative Musik
│   ├── particles.js    Partikel-Pool + Effekt-Presets (Treffer, Block, Parry, KO, Staub …)
│   ├── camera.js       dynamische Kamera: Zoom, Shake (Trauma), Punch, Fokus
│   ├── physics.js      Schwerkraft, Boden, Wände, Wall-Bounce, Pushboxen, Kamerawand
│   ├── animation.js    Skelett, Posen, Keyframe-Sampling, prozedurales Laufen, Ground Snap
│   ├── combat.js       Framedaten aller Angriffe + Treffer-, Block- und Parry-Auflösung
│   ├── fighter.js      Fighter-Zustandsautomat, Bewegung, Specials, Hurtboxes
│   ├── player.js       Charaktere: Looks (Accessoires, Farben) & Werte
│   ├── enemy.js        EnemyAI: Wahrnehmung, Zustände, Pläne, Schwierigkeitsgrade
│   ├── renderer.js     Silhouetten-Renderer, Rim Light, Stoff-Physik, Trails, Nachbilder
│   ├── arena.js        prozedurale Arenen, Parallax, Wetter, Lichter
│   └── ui.js           HUD, Ansagen, Combo-Anzeige, Menüs (Tastatur + Maus), Debug-Overlay
├── assets/             (leer: alle Assets werden zur Laufzeit erzeugt)
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
NODE_PATH=$(npm root -g) node tests/flow.js        # Echtzeit-Durchlauf aller Menüs nur per Tastatur
NODE_PATH=$(npm root -g) node tests/aimatch.js     # komplette KI-gegen-KI-Matches in allen Arenen/Schwierigkeiten
NODE_PATH=$(npm root -g) node tests/aibalance.js 8 # Siegquoten Hard/Normal/Easy gegeneinander
NODE_PATH=$(npm root -g) node tests/smoke.js out/  # lädt index.html, klickt durch Menüs, Screenshots
NODE_PATH=$(npm root -g) node tests/screens.js out/  # Screenshots: Special, K.O., Ergebnis, Menüs
NODE_PATH=$(npm root -g) node tests/posesheet.js out/poses  # Kontaktbogen aller Animationen
NODE_PATH=$(npm root -g) node tests/perf.js        # Renderzeit pro Arena
```

---

## Erweiterungsmöglichkeiten

- **Neuer Angriff**: Einen Eintrag in `SA.MOVES` (`src/combat.js`) mit Framedaten, `hit`-Gelenk und Keyframes anlegen. Die Eingabe kommt in `Fighter.tryAttacks` oder als `chain` in einen bestehenden Angriff.
- **Neue Combo-Namen**: `SA.COMBO_NAMES` erweitern.
- **Neuer Charakter**: In `SA.CHARACTERS` (`src/player.js`) Look, Accessoires, Werte und KI-Persönlichkeit anlegen.
- **Neue Arena**: In `src/arena.js` ein `DEFS.<id>` mit `skyStatic`, `layers`, `ground`, `fg`, Wetter und Rim-Farben ergänzen und die ID in `SA.ARENA_ORDER` aufnehmen.
- **Weiterer Special Move**: `SA.SPECIALS` erweitern und in `Fighter.updateSpecial` bzw. `specialHit` einbauen.
- Ideen für später: Würfe gegen Dauerblocken, Waffen-Stances, Story- oder Turniermodus, lokales 2-Spieler-Versus (der Controller ist dafür schon abstrahiert), Gamepad-Support über die Gamepad API, Replays (die deterministische Simulation eignet sich dafür).
