# M-Radl 🚴

Eine Web-App für Radfahrer in München, um sicherer unterwegs zu sein.

## Über das Projekt

M-Radl ist eine umfassende Web-Anwendung, die Radfahrern in München hilft, sich sicherer durch die Stadt zu bewegen. Die App bietet wichtige Informationen zu Radwegen, Reparaturstationen, Sicherheitstipps, aktuellem Wetter und Notfallkontakten.

## Features

### 🗺️ Interaktive Karte
- Anzeige von Radwegen in München
- Standorte von Reparaturstationen
- Fahrradparkplätze
- GPS-Standortermittlung

### 🦺 Sicherheitstipps
- Wichtige Verhaltensregeln für Radfahrer
- Verkehrsvorschriften in München
- Ausrüstungsempfehlungen
- Tipps für verschiedene Wetterbedingungen

### 🔧 Service & Reparatur
- Selbstbedienungs-Reparaturstationen
- MVG Rad Standorte
- Fahrradgeschäfte in München

### 🌤️ Wetter
- Aktuelle Wetterdaten für München
- Fahrbedingungen für Radfahrer
- Wetterbasierte Empfehlungen

### 🚨 Notfall & Kontakte
- Notrufnummern (Polizei, Feuerwehr)
- ADFC München Kontakt
- Fundbüro für gestohlene Fahrräder
- Verhaltensregeln bei Unfällen

## Technologie

Die Anwendung verwendet:
- **HTML5** - Strukturierung
- **CSS3** - Modernes, responsives Design
- **JavaScript (ES6+)** - Interaktive Funktionen
- **Leaflet.js** - Interaktive Kartenansicht mit OpenStreetMap
- **Open-Meteo API** - Kostenlose Wetterdaten ohne API-Schlüssel

## Installation & Verwendung

### Lokale Nutzung

1. Repository klonen:
```bash
git clone https://github.com/thienthu149/m-radl.git
cd m-radl
```

2. Öffne `index.html` in einem modernen Webbrowser:
```bash
# Mit Python 3:
python3 -m http.server 8000

# Mit Node.js:
npx http-server

# Oder direkt im Browser öffnen:
open index.html  # macOS
xdg-open index.html  # Linux
start index.html  # Windows
```

3. Besuche `http://localhost:8000` im Browser

### Online-Deployment

Die App kann auf beliebigen statischen Hosting-Services bereitgestellt werden:
- GitHub Pages
- Netlify
- Vercel
- AWS S3
- Firebase Hosting

## Datenschutz

Die Anwendung:
- Speichert keine persönlichen Daten
- Verwendet GPS nur mit Nutzererlaubnis
- Lädt Wetterdaten von öffentlichen APIs
- Nutzt OpenStreetMap für Kartenmaterial

## Browser-Unterstützung

- ✅ Chrome/Edge (neueste Versionen)
- ✅ Firefox (neueste Versionen)
- ✅ Safari (neueste Versionen)
- ✅ Mobile Browser (iOS Safari, Chrome Mobile)

## Responsive Design

Die App ist vollständig responsiv und optimiert für:
- 📱 Smartphones
- 📱 Tablets
- 💻 Desktop-Computer

## Mitwirken

Verbesserungsvorschläge und Beiträge sind willkommen! Erstelle ein Issue oder Pull Request.

## Lizenz

Dieses Projekt wurde für HackaTUM erstellt und steht unter der MIT-Lizenz.

## Kontakt & Ressourcen

### Nützliche Links
- [ADFC München](https://adfc-muenchen.de/)
- [MVG Rad](https://www.mvg.de/services/mobile-services/mvg-rad.html)
- [Stadt München Radverkehr](https://www.muenchen.de/verkehr/rad)

### Entwickelt für HackaTUM 2024

Erstellt mit ❤️ für sichereres Radfahren in München.
