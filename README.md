# CMDB

Eigenentwicklung der internen CMDB. Läuft parallel zur bestehenden GAPTEQ-Anwendung
und nutzt dieselbe SQL-Server-Datenbank.

## Ziel

- Mehr Flexibilität bei Anwendungen, Schnittstellen und Erweiterungen als mit GAPTEQ
- Schrittweise Ablösung: Modul für Modul, GAPTEQ bleibt bis zur vollständigen Migration in Betrieb

## Status

Projektstart. Noch offen:

- [x] Remote-Repository (GitHub)
- [x] Datenbankschema analysieren → [docs/schema-analyse.md](docs/schema-analyse.md)
- [ ] Tech-Stack festlegen → Vorschlag in [docs/architektur-vorschlag.md](docs/architektur-vorschlag.md)
- [ ] Hosting und Authentifizierung klären
- [ ] Ersten Pilot-Bereich auswählen

## Struktur

```
docs/          Konzepte, Entscheidungen, Schema-Dokumentation
docs/schema/   Export der DB-Struktur (CSV + SQL-Module, keine Daten)
tools/         Hilfsskripte, z. B. export-schema.ps1
```

Schema-Export aktualisieren (Login über `CMDB_SQL_USER`/`CMDB_SQL_PASSWORD` oder Windows):

```powershell
.\tools\export-schema.ps1 -Server "tcp:kingstown.aberle-it.loc,1433" -Database CMDB
```

## Grundsätze

- Keine Produktivdaten und keine Zugangsdaten im Repository
- Bestehende GAPTEQ-Tabellen werden nicht ohne Abstimmung verändert
- Änderungen laufen über Branches und Reviews
