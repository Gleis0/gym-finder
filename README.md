# Gym Finder Luzern

Welches Gym in Luzern passt zu deinem Training? 24 geprüfte Adressen zwischen Pilatus und Vierwaldstättersee: Fitnesscenter, CrossFit-Boxen, Box- und Kletterhallen sowie das Hallenbad Allmend.

**Live:** https://gleis0.github.io/gym-finder/

## Funktionen

- Nachtpanorama von Luzern (Pilatus, Museggmauer, Kapellbrücke, Wasserturm) als SVG
- Satz-Finder: «Ich will … Muskeln aufbauen / boxen / schwimmen …» mit Budget, Trainingszeit und Ort – liefert die Top 3
- Hantel-Bewertung: je mehr Scheiben, desto besser passt das Gym zum Ziel
- Liste mit Live-Status «Jetzt offen», Filtern (24/7, Sauna, Pool, Kurse, Tageseintritt …) und Karte
- Luzern nach Quartier: Bahnhof, Altstadt, Reuss, Tribschen, Kriens, Littau & Emmen, Ebikon & Root
- Training mit Luzern-Blick: Dachpool, Pilatusblick, Sauna am Teich
- Matrix aller Gyms gegen 13 Trainingsarten
- Jahrespreise im Überblick
- Vergleich von bis zu drei Gyms
- Detailansicht mit Öffnungszeiten, Preisen, Route und Quellen

## Daten aktualisieren

Alle Angaben stehen in `data.js` (Stand oben in der Datei). Preise und Zeiten ändern sich – vor einem Abo-Abschluss beim Gym prüfen.

## Technik

Statische Seite ohne Build: `index.html`, `data.js`, `pano.js`, `app.js`. Karte mit Leaflet und CARTO-Kacheln, Schriften Bodoni Moda und Archivo von Google Fonts.
