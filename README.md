# Hörspiel-Tracker

Next.js (TypeScript) mit Spotify-Login (Authorization Code Flow inkl. Token-Refresh). Tokens liegen nur in httpOnly-Cookies, das Client Secret bleibt auf dem Server. Keine Datenbank: Bibliothek und "Zuletzt gehört" werden bei jedem Start live abgerufen, Verlauf und manuelle Markierungen liegen im Browser (localStorage).

## 1. Spotify Developer App anlegen
Seit 2026 gilt im Entwicklermodus: Der App-Inhaber braucht **Spotify Premium**, pro Account ist 1 App erlaubt, max. 5 freigegebene Nutzer.
1. https://developer.spotify.com/dashboard öffnen und mit deinem Spotify-Account anmelden.
2. **Create app**: Name und Beschreibung frei wählen.
3. **Redirect URIs** eintragen (exakt, ohne Slash am Ende):
   - Deployment: `https://DEINE-APP.vercel.app/api/callback` (HTTPS ist Pflicht)
   - Lokal: `http://127.0.0.1:3000/api/callback` (**nicht** `localhost`)
4. Bei "Which API/SDKs" **Web API** anhaken und speichern.
5. In den App-Settings **Client ID** und **Client Secret** kopieren.

## 2. Lokal starten
```
npm install
cp .env.example .env.local   # Werte eintragen
npm run dev                  # dann http://127.0.0.1:3000 öffnen
```

## 3. Aufs Handy (Vercel)
1. Projekt in ein GitHub-Repo pushen und bei vercel.com importieren.
2. Unter Settings > Environment Variables `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` (die HTTPS-URI von oben) setzen.
3. Deployen, die Redirect URI im Spotify-Dashboard ergänzen, die URL im Handy-Browser öffnen und "Zum Startbildschirm hinzufügen".

## 4. Vollständigen Hörverlauf laden
Die Web API liefert nur die **letzten 50 Wiedergaben**. Für die ganze Historie: https://www.spotify.com/account/privacy > **Erweiterter Streaming-Verlauf** anfordern (dauert bis zu 30 Tage), ZIP entpacken und die Dateien `Streaming_History_Audio_*.json` in der App importieren. Die Dateien werden nur im Browser ausgewertet.

## So wird "gehört" bestimmt
Gehört = (a) in den letzten 50 Wiedergaben, (b) im importierten Verlauf mit mindestens 5 Min. Wiedergabe (`HEARD_MS` in `app/page.tsx`) oder (c) per Tipp auf die Zeile manuell markiert. Der Abgleich im Verlauf läuft über den Albumtitel.
