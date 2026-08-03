# Deployment — Stand: Turnier-Modus (nicht die Ziel-Architektur)

Diese Notiz hält fest, wie `dart-turnier.jsx` aktuell für ein echtes
Live-Turnier deployt wird — und warum das **nur ein Workaround für den
Turniertag ist, keine Entscheidung für die kommerzielle Architektur.**

## Aktueller Modus: Ein Gerät, offline, eine HTML-Datei

Build:
```bash
cd _preview
npm install
npm run build   # → _preview/dist/index.html (~430KB, alles inline)
```

`dist/index.html` läuft per Doppelklick (`file://`) in jedem Browser,
ohne Internet, ohne Node/npm auf dem Zielgerät, ohne Admin-Rechte.

**Warum diese Form:**
- Ein normaler `vite build` scheitert unter `file://`: Chrome/Edge
  blockieren das Nachladen von `type="module"`-Scripts per CORS
  (file://-Seiten haben Origin `"null"`), auch bei relativen Pfaden.
- Fix: `vite-plugin-singlefile` inlined JS+CSS direkt in die HTML —
  kein Nachladen mehr nötig. Siehe `_preview/vite.config.js`.
- Läuft komplett client-seitig, kein Server, kein Backend, keine
  Cloud-Abhängigkeit. Kein Single Point of Failure am Venue (kein
  Internet, kein VPS, kein fremder Server nötig).

## Warum NICHT auf einem Server/VPS für den Turniertag

- Venue-WLAN/Internet ist ein unkontrollierbares Risiko.
- Setup: ein fremder/geliehener Laptop (evtl. keine Admin-Rechte) —
  „einfach öffnen" muss reichen, kein Deploy-Prozess vor Ort.

## Bekannte Grenze: TV-Sync nur same-device

`localStorage` + `storage`-Event ist der einzige Sync-Mechanismus
zwischen Scoring-Fenster und TV-Übersicht. Das funktioniert **nur
innerhalb desselben Browsers auf demselben Gerät** (zweiter Tab,
per HDMI auf Beamer/zweiten Monitor erweitert) — nicht zwischen zwei
getrennten physischen Geräten. Kein Backend, keine Cross-Device-Sync
aktuell gebaut.

## Für die Kommerzialisierung: nicht der Zielzustand

Der Single-Device-Offline-Modus ist ein bewusster Kompromiss fürs
nächste Turnier, nicht das Produktversprechen. Für ein vermarktbares
Produkt (mehrere Boards, Scorer auf eigenem Handy, TV auf separatem
Gerät/Chromecast, Liga-übergreifende Auswertung) braucht es echte
Cross-Device-Sync — das ist bereits in `CLAUDE.md` unter „Phase 3:
React UI, multi-device sync (WebSocket/Supabase)" vorgesehen, aber
noch nicht gebaut. `dart-turnier.jsx` ist aktuell ein eigenständiger
Prototyp, der die getestete Engine (`src/`) dupliziert statt sie zu
nutzen — auch das müsste bei einer echten Produktarchitektur
zusammengeführt werden.

**Kurz:** Das hier ist "läuft sicher fürs nächste Turnier", nicht
"so soll das Produkt für immer funktionieren".
