# Architekturvorschlag

Stand: 28.10.2026 · Status: **Vorschlag, noch nicht entschieden**
Grundlage: [schema-analyse.md](schema-analyse.md)

## Leitlinien

1. **Parallelbetrieb:** GAPTEQ und die bestehenden `dbo`-Tabellen bleiben unangetastet, bis ein Modul vollständig umgezogen ist.
2. **Eigenes Schema `cmdb`** in derselben Datenbank für das neue Zielmodell. Keine zweite Datenbank, damit Abfragen über alt und neu einfach bleiben.
3. **Beziehungen und Historie sind Pflicht:** Fremdschlüssel überall, Änderungshistorie über SQL Server Temporal Tables.
4. **Keine Geheimnisse in der CMDB:** Passwörter werden nur als Verweis auf einen Passwort-Manager-Eintrag gespeichert.
5. **Ein verbreiteter, langweiliger Stack:** Die IT muss ihn auch ohne Claude betreiben und verstehen können.

## Tech-Stack (Empfehlung)

| Schicht | Wahl | Begründung |
|---|---|---|
| Backend | **ASP.NET Core (.NET 10 LTS)**, Web API | Passt zu Windows, SQL Server und IIS. Langzeit-Support. .NET ist auf dem Entwicklerrechner schon installiert. |
| Datenzugriff | **EF Core** + versionierte Migrationen | Migrationen als Code, Review im Repo. Erfüllt die Regel „DB-Änderungen nur als Migrationsskripte". |
| Frontend | **Blazor Server** (Alternative: React) | Ein Stack und eine Sprache (C#), schnell für interne Formular- und Tabellen-Apps. React nur, wenn ein separates Frontend-Team existiert. |
| Anmeldung | **Windows-Authentifizierung (Negotiate/Kerberos)** gegen AD `aberle-it.loc`, Rollen über AD-Gruppen | Keine Passwörter, Single Sign-on im Intranet. Entra ID später möglich, falls hybrid gewünscht. |
| Hosting | **IIS** auf einem internen Windows-Server | Vorhandenes Know-how. Container optional später. |
| Datenbank-Login | Eigener Service-Account (gMSA oder AD-Dienstkonto) mit Rechten nur auf das Schema `cmdb` + Lesen auf `dbo` | Kein `sa`, keine SQL-Passwörter in Konfigurationsdateien. |
| CI | GitHub Actions: Build, Tests, Migrations-Skript als Artefakt | Jede Änderung wird geprüft, bevor sie auf den Server kommt. |

## Zielmodell (Schema `cmdb`)

```
             ┌────────────┐        ┌──────────────┐
             │  Company   │◄───────┤   Contact    │
             └─────▲──────┘        └──────────────┘
                   │ (Kunde/Standort)
┌──────────┐  ┌────┴─────────────────┐  ┌──────────────┐
│  CiType  ├─►│  ConfigurationItem   │◄─┤ Manufacturer │
└──────────┘  │  (gemeinsame Felder) │  └──────────────┘
              │  + Attributes (JSON) │◄─┐┌──────────────┐
              └──┬────────────▲──────┘  └┤   Supplier   │
                 │            │          └──────────────┘
          ┌──────┴─────┐  ┌───┴───────────┐   ┌───────────┐
          │ CiRelation │  │ ContractItem  ├──►│ Contract  │
          │ (A→B, Art) │  └───────────────┘   └───────────┘
          └────────────┘
```

**`ConfigurationItem`:** eine Tabelle für alle CI-Typen mit den heute in jeder `*_manuell`-Tabelle wiederholten Feldern:
`Id`, `CiTypeId`, `Name/Hostname`, `CompanyId`, `ManufacturerId`, `SupplierId`, `Model`, `SerialNumber/Servicetag`, `OrderNumber`, `Status`, `DeliveredOn`, `SupportUntil`, `EndOfLife (date)`, `Notes`, `LegacySource` + `LegacyId` (Rückverweis auf die alte Tabelle und ID).

**Typspezifische Felder** (RAID, SGA/PGA, LWL-Typ, Anzahl Sensoren …) kommen in eine **JSON-Spalte `Attributes`**. Ein Schema pro `CiType` legt fest, welche Felder es gibt und wie sie geprüft werden. Neue CI-Typen oder Felder brauchen dann keine Datenbankänderung. Felder, nach denen oft gefiltert wird, können später als echte Spalte oder als berechnete Spalte mit Index herausgezogen werden.

**`CiRelation`:** Abhängigkeiten wie „VM läuft auf Host", „Datenbank läuft auf Server", „Gerät wird gesichert von Veeam", „Lizenz gehört zu". Das ist die Grundlage für Impact-Analysen.

**`Contract` / `ContractItem`:** Verträge (heute `Vertraege`, `Vertragsdaten`, `Servicevertrag_manuell`, `IT_Service_manuell`) mit echter n:m-Verknüpfung zu CIs. Das ersetzt die Verknüpfung über Anzeigetexte.

**Stammdaten:** `Company`, `Manufacturer`, `Supplier`, `CiType`, `Status` als echte Tabellen mit Fremdschlüsseln. Sie ersetzen Freitext und die `DD_*`-Listen.

**Historie:** Alle Tabellen werden als **System-Versioned Temporal Tables** angelegt. Dazu kommen die Spalten `ChangedBy` und `ChangedAt`. So ist der Stand zu jedem Zeitpunkt abfragbar, ohne eigenen Audit-Code.

**Zugangsdaten:** Statt `RMAN_Copy_Job_PW` gibt es ein Feld `CredentialReference`, z. B. die ID eines Eintrags im Passwort-Manager.

**Anhänge:** Vorerst weiter in der Datenbank, aber in einer eigenen Tabelle `Attachment` mit Bezug auf CI oder Vertrag. Eine Auslagerung ins Dateisystem kann man später entscheiden.

## Migration: alt → neu

```
Phase 0  Fundament     Repo, CI, Schema cmdb, Stammdaten, Login/Rollen
Phase 1  Lesen         Sync-Job dbo → cmdb (einseitig, idempotent per MERGE)
                       Neue App zeigt alles read-only: CI-Liste, Suche, EOL-Dashboard
Phase 2  Schreiben     Modul für Modul: Pflege wechselt in die neue App,
                       GAPTEQ-Seite des Moduls wird read-only bzw. abgeschaltet,
                       Sync für dieses Modul wird abgeschaltet
Phase 3  Aufräumen     Alte Tabellen archivieren, GAPTEQ abschalten
```

- **Sync-Job (Phase 1):** Ein SQL-Skript bzw. eine Prozedur im Schema `cmdb` liest die `*_manuell`-Tabellen. Es bildet `Firma`, `Hersteller` und `Lieferant` auf die Stammdaten ab und schreibt in `ConfigurationItem`. Über `LegacySource`/`LegacyId` bleibt jeder Datensatz zuordenbar. Werte, die sich nicht zuordnen lassen (Tippfehler bei Firmennamen), landen in einer Klärungsliste. Dieser Datenbereinigungsschritt ist der eigentliche Mehrwert.
- Die alten Tabellen werden **nur gelesen**. Schreibrechte auf `dbo` bekommt die neue App nicht.

## Pilot-Vorschlag

**„Inventar & Support-Übersicht" (read-only)**
- Alle Hardware- und Software-CIs aus den `*_manuell`-Tabellen in einer gemeinsamen Liste mit Filtern nach Firma, Typ, Hersteller und Status
- Dashboard: Support bzw. EOL läuft in 30/90/180 Tagen aus
- Klärungsliste für Daten, die sich nicht zuordnen lassen

Warum dieser Pilot:
- Er zeigt schnell sichtbaren Mehrwert, den GAPTEQ heute nicht bietet: eine übergreifende Sicht.
- Er hat kein Risiko für den Bestand, weil er nur liest.
- Er baut genau das Fundament, das alle weiteren Module brauchen: Zielmodell, Stammdaten, Sync, Login, Hosting.

## Offene Entscheidungen

| # | Frage | Vorschlag |
|---|---|---|
| 1 | Gehören Zeiterfassung/SAP, Tickets und TPL in die neue CMDB? | Zunächst **nein**. Sie bleiben in GAPTEQ und kommen später eventuell als eigene Module. |
| 2 | Blazor oder React? | Blazor Server |
| 3 | Hosting-Server und Service-Account | klären mit IT-Betrieb |
| 4 | Sofortmassnahme `RMAN_Copy_Job_PW` | Passwörter in den Passwort-Manager verschieben und die Zugänge ändern |
| 5 | Was steckt hinter den 1001 Zeilen? | Bestand vs. Leerzeilen prüfen |
| 6 | Repo auf privatem GitHub-Account | später eventuell in eine Firmen-Organisation verschieben |
