# CLAUDE.md

Hinweise für Claude Code in diesem Repository.

## Kontext

- Interne CMDB, Eigenentwicklung als Ersatz für eine bestehende GAPTEQ-Anwendung
- Datenbasis: bestehende SQL-Server-Datenbank, die GAPTEQ weiterhin parallel nutzt
- Tech-Stack ist noch nicht festgelegt; neue Entscheidungen unter `docs/` festhalten

## Regeln

- Bestehende Tabellen, Views und Prozeduren nicht ändern oder löschen, ohne ausdrückliche Freigabe.
  GAPTEQ muss parallel funktionsfähig bleiben. Eigene Objekte bevorzugt in einem separaten Schema anlegen.
- Keine Produktivdaten, Connection-Strings, Passwörter oder Tokens committen.
  Konfiguration über Umgebungsvariablen bzw. lokale, ignorierte Dateien.
- Datenbankänderungen nur als versionierte Migrationsskripte.
- Sprache: Doku und Commit-Messages auf Deutsch, Code-Bezeichner auf Englisch.
