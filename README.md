# CMDB

Eigenentwicklung der internen CMDB. Läuft parallel zur bestehenden GAPTEQ-Anwendung
und nutzt dieselbe SQL-Server-Datenbank.

## Ziel

- Mehr Flexibilität bei Anwendungen, Schnittstellen und Erweiterungen als mit GAPTEQ
- Schrittweise Ablösung: Modul für Modul, GAPTEQ bleibt bis zur vollständigen Migration in Betrieb

## Status

Projektstart. Noch offen:

- [ ] Remote-Repository (Azure DevOps / GitHub / GitLab)
- [ ] Tech-Stack festlegen
- [ ] Hosting und Authentifizierung (Entra ID) klären
- [ ] Datenbankschema (DDL) analysieren
- [ ] Ersten Pilot-Bereich auswählen

## Struktur

```
docs/     Konzepte, Entscheidungen, Schema-Dokumentation
```

## Grundsätze

- Keine Produktivdaten und keine Zugangsdaten im Repository
- Bestehende GAPTEQ-Tabellen werden nicht ohne Abstimmung verändert
- Änderungen laufen über Branches und Reviews
