# CMDB

Eigenentwicklung der internen CMDB. Läuft parallel zur bestehenden GAPTEQ-Anwendung
und nutzt dieselbe SQL-Server-Datenbank.

## Ziel

- Mehr Flexibilität bei Anwendungen, Schnittstellen und Erweiterungen als mit GAPTEQ
- Schrittweise Ablösung: Modul für Modul, GAPTEQ bleibt bis zur vollständigen Migration in Betrieb

## Status

- [x] Remote-Repository (GitHub)
- [x] Datenbankschema analysieren → [docs/schema-analyse.md](docs/schema-analyse.md)
- [x] Tech-Stack festlegen: React + Vite + Node wie im KI-Portal → [docs/architektur-vorschlag.md](docs/architektur-vorschlag.md)
- [x] Hosting und Authentifizierung: Docker auf charlestown, LDAP-Anmeldung gegen das AD → [docs/server.md](docs/server.md)
- [x] Phase 0: Anmeldung, Rollen, App-Rahmen, Verwaltung mit Status von LDAP und DB, Testmodus, Docker, Testseite
- [x] Zertifikat der internen CA für `charlestown.aberle-it.loc` und `cmdb.aberle-it.loc` (gültig bis 27.10.2028)
- [x] Echte AD-Anmeldung mit Rolle admin auf `https://charlestown.aberle-it.loc:8790` bestätigt
- [ ] DNS-Alias `cmdb.aberle-it.loc` → charlestown anlegen
- [x] DB-Verbindung mit Zertifikatsprüfung: SQL Server auf kingstown nutzt ein Zertifikat der internen CA (gültig bis 27.10.2028)
- [ ] Phase 1: Schema `cmdb`, Sync aus `dbo`, CI-Liste read-only
- [ ] Ersten Pilot-Bereich auswählen

## Struktur

```
src/                 Frontend (React, Vite, Tailwind)
server/src/          Dienst (node:http): Anmeldung, Session, API, Auslieferung des Frontends
server/Dockerfile    Ein Container für Frontend und Dienst
docker-compose.yml   Compose-Projekt cmdb-dev auf charlestown
e2e/                 Playwright-Tests im Testmodus
docs/                Konzepte, Entscheidungen, Schema-Dokumentation, Betrieb
docs/schema/         Export der DB-Struktur (CSV + SQL-Module, keine Daten)
tools/               Hilfsskripte, z. B. export-schema.ps1
```

## Lokal starten

Voraussetzung: Node 24 (`.nvmrc`).

```bash
npm ci
npm run build && npm run build:server
npm run server:test          # Dienst im Testmodus auf http://localhost:8790 (liefert dist/ aus)
```

Testbenutzer: `admin` oder `user`, Passwort `test`. Für die Entwicklung am Frontend zusätzlich `npm run dev`
(Vite leitet `/api` an den Dienst auf Port 8790 weiter).

Prüfen:

```bash
npm run typecheck
npm run build
npx playwright install chromium   # einmalig
npm run test:e2e
```

Testseite wie auf GitHub Pages (ohne Dienst, nur Testdaten im Browser): `npm run build:pages && npx vite preview`.

## Docker

```bash
cp server/.env.example server/.env    # ausfüllen, Rechte 600
docker compose up -d --build          # Compose-Projekt cmdb-dev, Port 8790
```

Details zu charlestown, Zertifikaten, Update-Ablauf und zur Trennung vom KI-Portal: [docs/server.md](docs/server.md).

## Testseite (GitHub Pages)

Bei jedem Push auf `main` baut `.github/workflows/pages.yml` die Testseite mit `npm run build:pages`.
Sie zeigt nur den Testmodus mit erfundenen Daten. Einmalig: Repository → Settings → Pages → Source „GitHub Actions“.

## Schema-Export

Schema-Export aktualisieren (Login über `CMDB_SQL_USER`/`CMDB_SQL_PASSWORD` oder Windows):

```powershell
.\tools\export-schema.ps1 -Server "tcp:kingstown.aberle-it.loc,1433" -Database CMDB
```

## Grundsätze

- Keine Produktivdaten und keine Zugangsdaten im Repository
- Bestehende GAPTEQ-Tabellen werden nicht ohne Abstimmung verändert
- Änderungen laufen über Branches und Reviews
- Getrennt vom KI-Portal: eigener Ordner, eigene Container, eigenes Netz, eigener Port, eigene Zugangsdaten
