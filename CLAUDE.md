# CLAUDE.md

Hinweise für Claude Code in diesem Repository.

## Kontext

- Interne CMDB, Eigenentwicklung als Ersatz für eine bestehende GAPTEQ-Anwendung
- Datenbasis: bestehende SQL-Server-Datenbank, die GAPTEQ weiterhin parallel nutzt
- Stack festgelegt (wie im Projekt KI-Portal, `darkel96/ki-portal`, nur als Vorlage):
  React 19 + Vite + TypeScript + Tailwind v4 + shadcn-Stil, Dienst mit `node:http` in `server/src`, Node 24, Docker, Playwright.
  Details in `docs/architektur-vorschlag.md`, Betrieb in `docs/server.md`. Neue Entscheidungen unter `docs/` festhalten.
- Anmeldung per LDAP-Formular gegen AD `aberle-it.loc` (nur LDAPS/StartTLS, kein Service-Account), Rollen über `CMDB_ADMINS`
- Testmodus: `CMDB_TESTMODE=1` bzw. Build-Modus `pages` (Testbenutzer `admin`/`user`, Passwort `test`, erfundene Daten)
- Das Repository ist öffentlich, die Pages-Testseite auch

## Regeln

- Bestehende Tabellen, Views und Prozeduren nicht ändern oder löschen, ohne ausdrückliche Freigabe.
  GAPTEQ muss parallel funktionsfähig bleiben. Eigene Objekte bevorzugt in einem separaten Schema anlegen.
- Keine Produktivdaten, Connection-Strings, Passwörter oder Tokens committen.
  Konfiguration über Umgebungsvariablen bzw. lokale, ignorierte Dateien.
- Datenbankänderungen nur als versionierte Migrationsskripte in `server/migrations/NNN_*.sql` (nur Schema `cmdb`),
  eingetragen in `server/src/migrations.ts`. Ein eingespieltes Skript nie ändern, sondern ein neues anlegen.
- Neue Systemarten entstehen als Tabelle im Schema `cmdb` (Migration) mit `IDENTITY` ab ihrem Nummernkreis
  (z. B. KEPware ab 130000) und `schema: "cmdb", identity: true` in `src/lib/areas.ts`, nicht mehr als dbo-Tabelle
  mit vorab angelegten Leerzeilen. Kundennamen-Spalte in `server/src/customerLinks.ts` eintragen.
- Neue Endpunkte prüfen Rechte mit `allowed(req, res, bereich, aktion)` (server/src/api.ts), neue Bereiche erscheinen
  automatisch in der Rechte-Tabelle.
- Schreiben in `dbo` nur wie GAPTEQ (nächste freie, vorab angelegte Zeile füllen, mit Sperre), nur für Admins und nur
  mit ausdrücklich vergebenem `UPDATE`-Recht je Tabelle. Kein `INSERT`/`DELETE` in `dbo` ohne Freigabe.
  Freigegeben (28.10.2026): `INSERT`/`UPDATE`/`DELETE` auf `dbo.DS_Kunden` für die Kundenpflege; Umbenennen ändert den
  Namen in allen Tabellen aus `server/src/customerLinks.ts` mit, Löschen nur ohne Verweise. Neue Tabellen mit
  Kundennamen dort ergänzen.
  Freigegeben (29.10.2026): `INSERT` auf `dbo.Anhang` für Dokumente direkt am Kunden, genau wie GAPTEQ
  (Typ „Angebot“, `Vertrag_ID` = `FirmenID` = Kunden-ID). Kein `UPDATE`/`DELETE` auf `dbo.Anhang`.
  Freigegeben (30.10.2026): `INSERT`/`UPDATE` auf `dbo.Vertragsdaten` (Oracle-ESL anlegen und bearbeiten, auch durch
  Nicht-Admins mit Feldgruppen-Recht wie „Oracle-ESL › Einkauf“; Kunde nur beim Anlegen); `DELETE` mit dem Recht
  „Oracle-ESL: Löschen“, nur wenn keine PMS-Module mehr am Vertrag hängen.
  `INSERT`/`UPDATE`/`DELETE` auf `dbo.PMS_Module` (Module am Vertrag, Preise aus `dbo.PMS_Module_Stammdaten`).
  `INSERT`/`UPDATE`/`DELETE` auf `dbo.PMS_Module_Stammdaten` (PMS-Modularten unter Verwaltung › Stammdaten; Umbenennen
  ändert den Namen in `dbo.PMS_Module` mit, Löschen nur ohne Verträge).
- Sprache: Doku und Commit-Messages auf Deutsch, Code-Bezeichner auf Englisch.
- Änderungen über Branch und Pull Request gegen `main`. Vor dem PR: `npm run typecheck`, `npm run build`, `npm run test:e2e`.
- Testdaten (`src/lib/testData.ts`) und die Pages-Seite enthalten nur erfundene Werte: keine echten Hostnamen, IP-Adressen,
  Kunden, Personen und kein Firmenlogo.
- Passwörter nie im Chat, im Repository oder im Protokoll. Der Dienst loggt keine Passwörter, Cookies oder Anfrageinhalte.

## Trennung vom KI-Portal (verbindlich)

KI-Portal und CMDB laufen beide auf charlestown, sind aber strikt getrennt (Details in `docs/server.md`):

- Eigener Ordner `/root/cmdb`. Nichts in `/opt/ki-hub`, `/opt/ki-portal*` oder `/opt/serviceangebot` ändern oder ablegen.
- Eigenes Compose-Projekt `cmdb-dev` (später `cmdb`), Container und Docker-Objekte mit Präfix `cmdb`, eigenes Netz,
  eigene Volumes, eigene `.env`-Dateien, eigener Port 8790.
- Container, Netze, Volumes, Ports und Zugangsdaten des KI-Portals nie stoppen, ändern oder mitbenutzen. Keine globalen
  Docker-Aufräumbefehle (`docker system prune` usw.).
- GitHub-Zugang nur über die Zugänge der CMDB, nicht über Zugangsdaten des KI-Portals: Push per Deploy-Key
  (`/root/.ssh/cmdb_deploy`), PRs und Pages per API mit dem Token in `/root/.config/cmdb/github-token`.
  Den Token nie ausgeben, nur per `curl -H @<(printf 'Authorization: Bearer %s\n' "$(cat …)")` verwenden.
