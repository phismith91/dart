# DartForge — Product Concept

**Vision:** Die universelle Dart-Plattform. Von der Kneipe bis zur Weltmeisterschaft. Jedes Turnier ist einzigartig — die Software passt sich an, nicht umgekehrt.

**Claim:** *"Your tournament. Your rules. One platform."*

---

## 1. Was heute noch statisch ist (und nicht sein sollte)

Aktueller Stand: Die App hat viele Dinge hart verdrahtet, die eigentlich konfigurierbar sein müssten.

**Spielmodus:** Nur 501. Aber Darts kennt 301, 501, 701, 1001, Cricket, Shanghai, Around the Clock, Killer, und Dutzende weitere. Jeder Modus hat eigene Regeln für Scoring, Gewinnbedingung, und Checkout.

**Checkout-Regel:** Nur "SO überall, DO im Finale". In der Realität gibt es SO/DO/MO (Master Out = Double oder Triple) — und das kann pro Runde, pro Phase, oder sogar pro Match anders sein. Die PDC spielt komplett DO. Pub-Ligen spielen oft komplett SO. Mixed-Formate gibt es auch.

**Legs to Win:** Fest auf 2 (Best of 3). Die PDC spielt Best of 5, 7, 11, 13 — und das variiert pro Runde innerhalb eines Turniers. WM-Finale: Best of 13 Sets, jedes Set Best of 5 Legs.

**Sets:** Gar nicht implementiert. Profiturniere nutzen Sets (z.B. "First to 3 Sets, each Set First to 3 Legs"). Das ist eine ganze Ebene die fehlt.

**Teamformat:** Fest auf 2er-Teams. Es gibt Einzel, Doppel, Triples, und Mixed-Formate. Manche Turniere mischen Einzel- und Teamrunden.

**Turnierformat:** Nur Single Elimination. Aber es gibt Round Robin, Double Elimination, Swiss System, Gruppenphase + KO, und Hybride. Die PDC UK Open hat ein Multi-Board-System mit dynamischer Auslosung.

**Scoring:** Nur "3 Darts = 1 Aufnahme". Manche Formate spielen mit weniger Darts pro Aufnahme, oder mit Zeitlimits.

**Startpunkte:** Immer 501. Muss konfigurierbar sein.

---

## 2. Architektur: Drei unabhängige Engines

Das System besteht aus drei entkoppelten Schichten, die unabhängig voneinander funktionieren und kombiniert werden können.

### 2.1 Rules Engine — "Wie wird gespielt?"

Definiert die Spielregeln für ein einzelnes Leg/Match. Ist ein reiner State Machine ohne UI.

```
RulesConfig {
  startScore:       501 | 301 | 701 | custom
  checkoutMode:     "single" | "double" | "master"
  dartsPerTurn:     3
  legsToWin:        3          // First to X legs
  setsToWin:        null | 3   // null = kein Set-System
  legsPerSet:       null | 5   // Legs pro Set
  bullRule:         "25/50" | "50/50"  // Single/Double Bull Wert
}
```

Die Rules Engine validiert jeden Wurf, erkennt Busts, berechnet ob ein Leg/Set/Match gewonnen ist, und liefert Checkout-Vorschläge. Sie kennt kein Turnier, keine Teams, keinen Bracket — nur die Regeln eines einzelnen Spiels.

**Erweiterbar:** Neue Spielmodi (Cricket, Shanghai) werden als eigene Rule-Sets implementiert, die das gleiche Interface bedienen.

### 2.2 Tournament Engine — "Wer spielt gegen wen?"

Verwaltet die Turnierstruktur: Teilnehmer, Paarungen, Ergebnisse, Weiterkommen. Kennt keine Dart-Regeln — nur Matches mit Ergebnissen.

```
TournamentConfig {
  format:           "single_elim" | "double_elim" | "round_robin" 
                    | "groups_ko" | "swiss" | "custom"
  participants:     Player[] | Team[]
  teamSize:         1 | 2 | 3
  seeding:          "random" | "manual" | "ranked"
  thirdPlace:       true | false
  phases: [
    {
      name:         "Gruppenphase"
      format:       "round_robin"
      groups:       4
      advanceCount: 2          // Top X pro Gruppe kommen weiter
      rules:        RulesConfig
    },
    {
      name:         "KO-Phase"  
      format:       "single_elim"
      rules:        RulesConfig  // Kann andere Regeln haben!
    },
    {
      name:         "Finale"
      format:       "single_elim"
      rules:        RulesConfig  // z.B. mehr Legs, Double Out
    }
  ]
}
```

**Der Clou:** Jede Phase hat ihre eigene `RulesConfig`. Gruppenphase kann Best of 3 Legs SO sein, KO-Phase Best of 5 Legs SO, und Finale Best of 7 Legs DO. Genau wie bei echten Turnieren.

**Drag & Drop:** Die Phasen werden visuell zusammengesteckt. Jede Phase ist ein Block mit Ein- und Ausgängen. Der Output der Gruppenphase (Top 2 pro Gruppe) wird zum Input der KO-Phase. Phasen können hinzugefügt, entfernt, umgeordnet werden.

### 2.3 Presentation Engine — "Wie wird angezeigt?"

Rendert alles: Scoring-Screen, Bracket, TV-Modus, Statistiken. Ist komplett von der Logik getrennt.

```
PresentationConfig {
  theme:            "dark" | "light" | "pdc" | "custom"
  branding: {
    logo:           url | null
    name:           "FW Aidlingen" | "PDC World Championship"
    colors:         { primary, secondary, accent }
  }
  tvLayout:         "split" | "focused" | "broadcast"
  showCheckouts:    true
  showStats:        true
  sounds:           { 180: url, checkout: url, ... }
  language:         "de" | "en" | "nl" | ...
  overlayMode:      false | true  // Für OBS/Streaming
}
```

---

## 3. Tournament Builder — Drag & Drop

Das Herzstück der UX. Der Nutzer baut sein Turnier visuell zusammen.

### Konzept

Der Builder zeigt eine horizontale Timeline. Jede Phase ist ein Block, der sich konfigurieren lässt. Zwischen den Blöcken sind Verbindungslinien die zeigen, wie Teilnehmer fließen.

```
┌─────────────┐    ┌──────────────┐    ┌──────────┐
│ Gruppenphase │───▶│  KO-Runde    │───▶│  Finale  │
│ 4 Gruppen    │    │  8 → 4 → 2  │    │  Bo7 DO  │
│ Round Robin  │    │  Bo5 SO      │    │          │
│ Bo3 SO       │    │              │    │          │
└─────────────┘    └──────────────┘    └──────────┘
        │                                    │
        │          ┌──────────────┐           │
        └─────────▶│  Platz 3     │◀──────────┘
                   │  Bo5 DO      │  (Verlierer HF)
                   └──────────────┘
```

### Interaktion

**Phase hinzufügen:** "+" Button am Ende der Timeline. Wähle Format (Gruppe, KO, Swiss) und konfiguriere Details.

**Phase konfigurieren:** Klick auf einen Block öffnet ein Panel mit allen Einstellungen: Format, Regeln (Start-Score, Checkout, Legs/Sets), Anzahl Weiterkommer.

**Verbindungen:** Automatisch generiert basierend auf Reihenfolge. Für komplexe Szenarien (Trostturnier, Consolation Bracket) können Verbindungen manuell gezogen werden.

**Vorlagen:** Für 80% der Nutzer sind Vorlagen der Einstieg. Ein Klick, fertig. Aber jede Vorlage kann angepasst werden.

### Vorlagen-Bibliothek

```
🏠 Casual / Home
├── Quick Match (Einzel, 501 SO, Bo3)
├── Kneipe (4–8 Spieler, Single Elim, Bo3 SO)
└── Party (Round Robin, jeder gegen jeden)

🏢 Verein / Club  
├── Vereinsmeisterschaft (Gruppen + KO, DO)
├── Liga-Spieltag (Round Robin, Tabelle)
├── Pokalturnier (Single Elim + Platz 3)
└── Mannschafts-Liga (Teams, Hin/Rück)

🏆 Meisterschaft / Federation
├── Landesmeisterschaft (Swiss + KO, Sets)
├── Bundesliga-Format (8 Teams, Hin/Rück)
└── PDC-Style (Single Elim, Sets, DO)

🌍 Weltrang / Pro
├── World Championship (96 Spieler, Sets, DO)
├── UK Open (Multi-Board, Best of Legs)
├── Premier League (Round Robin, Bo14 Legs)
└── Custom Pro Event
```

---

## 4. Feature Deep-Dives

### 4.1 Multi-Board / Parallel Play

Große Turniere spielen auf mehreren Boards gleichzeitig. Das System muss wissen, welches Match auf welchem Board läuft, und den Zeitplan dynamisch anpassen.

```
BoardConfig {
  boards:       ["Board 1", "Board 2", "Board 3"]
  assignment:   "auto" | "manual"
  scheduler:    "fifo" | "balanced" | "priority"
}
```

Jedes Board hat ein eigenes Scoring-Device (Tablet/Handy). Alle synchronisieren über einen shared State. Der Turnierleiter sieht eine Übersicht aller laufenden Matches.

### 4.2 Live-Sync & Multi-Device

**Problem heute:** Scoring und TV laufen im gleichen Browser. Zwei Geräte können nicht synchronisieren.

**Lösung:** Shared State über einen simplen WebSocket-Server oder peer-to-peer via WebRTC.

```
Gerät 1 (Scorer/Tablet)  ──┐
                            ├──▶  Shared State  ──▶  Gerät 3 (TV/Beamer)
Gerät 2 (Scorer/Board 2)  ──┘                   ──▶  Gerät 4 (Zuschauer-Handy)
```

Für den Offline-Einsatz (Feuerwehr ohne Internet): Ein Gerät wird zum lokalen "Server" (Service Worker + BroadcastChannel). Andere Geräte verbinden sich über lokales WLAN.

### 4.3 Spieler-Datenbank

Über Turniere hinweg verfolgen: Wer hat wann den Wanderpokal gewonnen? Wie entwickelt sich der Average eines Spielers über die Saison?

```
Player {
  id, name, nickname, avatar
  club:           "FW Aidlingen" | null
  stats: {
    lifetime:     { avg, ton80s, highCheckout, ... }
    perTournament: [{ date, avg, placement, ... }]
    elo:          1200
  }
}
```

### 4.4 Broadcast / Streaming Mode

Für professionelle Turniere: Ein OBS-kompatibles Overlay, das als transparenter Browser-Layer über den Stream gelegt wird. Zeigt Scores, Checkout, Stats, ohne den Hintergrund.

```
/overlay?match=sf1&theme=pdc
→ Transparenter Background
→ Nur Score-Anzeige mit Animation
→ Echtzeit-Updates via WebSocket
```

### 4.5 Checkout Intelligence

Nicht nur "was ist der Standard-Checkout", sondern: "Was ist der optimale Checkout basierend auf dem Können des Spielers?"

Ein Anfänger mit 5% Double-Quote profitiert von anderen Checkout-Wegen als ein Profi mit 40%. Das System könnte basierend auf historischen Daten personalisierte Checkout-Vorschläge machen.

### 4.6 AI Match Insights

Nach jedem Match ein AI-generiertes Summary: "Team A dominierte die ersten 9 Darts (Ø 95.3), verlor aber den zweiten Leg nach einem Bust bei 32. Entscheidend war der Checkout von 121 (T20, S11, D20) im dritten Leg."

---

## 5. Flexibilitäts-Matrix

Was muss konfigurierbar sein, und auf welcher Ebene?

```
┌─────────────────────┬──────────┬─────────┬───────┬───────┐
│ Feature             │ Turnier  │ Phase   │ Runde │ Match │
├─────────────────────┼──────────┼─────────┼───────┼───────┤
│ Spielmodus (501/..) │          │    ●    │       │       │
│ Checkout (SO/DO/MO) │          │    ●    │   ●   │       │
│ Legs to Win         │          │    ●    │   ●   │       │
│ Sets                │          │    ●    │       │       │
│ Team-Größe          │    ●     │         │       │       │
│ Format (KO/RR/..)   │          │    ●    │       │       │
│ Board-Zuweisung     │          │         │       │   ●   │
│ Branding/Theme      │    ●     │         │       │       │
│ Sounds              │    ●     │         │       │       │
│ Sprache             │    ●     │         │       │       │
│ Seeding             │          │    ●    │       │       │
│ Startpunkte         │          │    ●    │       │       │
└─────────────────────┴──────────┴─────────┴───────┴───────┘

● = auf dieser Ebene konfigurierbar
```

Die Faustregel: Konfigurierbar auf der Ebene, auf der es sich in der Realität ändert. Checkout-Regeln können sich pro Runde ändern (Vorrunde SO, ab VF DO). Legs to Win können sich pro Runde ändern (QF: Bo5, SF: Bo7, Finale: Bo11). Aber die Team-Größe ändert sich nicht mitten im Turnier.

---

## 6. Tech-Stack Empfehlung

### Frontend (was der Nutzer sieht)

**React + TypeScript** — Das aktuelle Artifact ist bereits React. Für ein echtes Produkt: Vite + React + TypeScript + TailwindCSS. PWA-fähig für Offline-Nutzung.

**State Management:** Zustand (leichtgewichtig) oder Redux Toolkit (wenn State komplex wird). Der gesamte Turnier-State ist ein einzelner serialisierbarer Baum.

### Backend (für Multi-Device + Persistence)

**Option A — Serverless/Minimal:**
Supabase (Postgres + Realtime-Subscriptions + Auth). Kostenloser Tier für kleine Turniere. Realtime-Sync zwischen Geräten über Supabase Channels.

**Option B — Self-hosted:**
Django (passt zu deinem Stack) + Django Channels (WebSocket) + PostgreSQL. Docker-Compose auf Hetzner VPS. Volle Kontrolle, keine Vendor-Abhängigkeit.

**Option C — Peer-to-peer (Offline-First):**
CRDTs (z.B. Yjs oder Automerge) für konfliktfreie Synchronisation. Kein Server nötig. Geräte finden sich über WebRTC / lokales Netzwerk.

### Empfehlung: Start mit A, langfristig B

Supabase für den schnellen Start (Realtime, Auth, DB out of the box). Wenn das Produkt wächst, Migration auf eigenen Django-Stack. Die Rules Engine und Tournament Engine bleiben Frontend-only (TypeScript) und funktionieren auch komplett offline.

---

## 7. Monetarisierung

```
Free (Open Source Core)
├── Einzelspiel-Scoring (alle Modi)
├── Turnier bis 16 Spieler
├── Basis-Statistiken
├── Offline-Modus
└── Community-Vorlagen

Pro (€4,99/Monat oder €29,99/Jahr)
├── Unbegrenzte Turniergröße
├── Multi-Board-Unterstützung
├── Spieler-Datenbank & Elo
├── Custom Branding & Sounds
├── Export (PDF, CSV, JSON)
├── Historische Statistiken
└── Priority Support

Federation (€19,99/Monat)
├── Alles aus Pro
├── Broadcast/OBS Overlay
├── API-Zugang
├── Multi-Admin
├── White-Label Option
├── Liga-Verwaltung (Saison, Spieltage)
└── Dedicated Support
```

Der Open Source Core bleibt für immer frei. Die Pro-Features sind ein separates Modul, das auf dem Core aufbaut. Federations/Verbände zahlen für Infrastruktur und Support, nicht für Features.

---

## 8. Roadmap

### Phase 1 — Foundation (Monate 1–2)
- Rules Engine als eigenständiges TypeScript-Modul
- Alle Spielmodi: 301, 501, 701, Cricket
- Alle Checkout-Modi: SO, DO, MO
- Sets + Legs System
- 100% Test Coverage auf der Engine

### Phase 2 — Tournament Builder (Monate 3–4)
- Tournament Engine mit allen Formaten
- Drag & Drop Builder UI
- Vorlagen-Bibliothek
- Konfigurierbare Phasen mit eigenen Regeln

### Phase 3 — Polish & Sync (Monate 5–6)
- Multi-Device Sync (Supabase Realtime)
- TV/Broadcast Mode
- PWA + Offline
- Spieler-Datenbank v1

### Phase 4 — Pro & Growth (Monate 7+)
- Pro-Tier launch
- Federation-Features
- API
- Community Marketplace für Vorlagen & Themes
- AI Match Insights (experimentell)

---

## 9. Warum DartForge gewinnt

**Bestehende Tools** sind entweder Scoring-Apps (Pro-Darter, n01) ODER Turnier-Tools (Challonge) — nie beides. Und sie sind für einen Use Case optimiert: entweder Casual oder Pro.

**DartForge** ist beides, und skaliert vom Küchentisch bis zur WM. Der Trick ist die Architektur: Drei unabhängige Engines (Rules, Tournament, Presentation), die beliebig kombiniert werden. Der Casual-User klickt eine Vorlage, der Verein passt sie an, der Verband baut komplett custom.

**Open Source Core** schafft Vertrauen und Community. Die Dart-Community ist eng vernetzt — wenn BDV/DDV-Vereine das Tool nutzen, spricht sich das rum. Monetarisierung über Premium-Features, nicht über Grundfunktionen.

**Offline-First** ist der entscheidende Vorteil gegenüber Web-Only-Tools. Dart wird in Kneipen, Vereinsheimen und Turnhallen gespielt — oft ohne zuverlässiges Internet. Das Tool muss ohne Netz funktionieren und bei Verbindung synchronisieren.
