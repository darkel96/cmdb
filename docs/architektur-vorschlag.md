# Architekturvorschlag

Stand: 28.10.2026 · Status: **Stack, Anmeldung und Hosting entschieden**, Zielmodell und Migration weiter Vorschlag
Grundlage: [schema-analyse.md](schema-analyse.md) · Betrieb: [server.md](server.md)

## Leitlinien

1. **Parallelbetrieb:** GAPTEQ und die bestehenden `dbo`-Tabellen bleiben unangetastet, bis ein Modul vollständig umgezogen ist.
2. **Eigenes Schema `cmdb`** in derselben Datenbank für das neue Zielmodell. Keine zweite Datenbank, damit Abfragen über alt und neu einfach bleiben.
3. **Beziehungen und Historie sind Pflicht:** Fremdschlüssel überall, Änderungshistorie über SQL Server Temporal Tables.
4. **Keine Geheimnisse in der CMDB:** Passwörter werden nur als Verweis auf einen Passwort-Manager-Eintrag gespeichert.
5. **Ein bekannter, schlanker Stack:** derselbe Aufbau wie beim bestehenden Projekt KI-Portal, damit Betrieb und Weiterentwicklung gleich funktionieren.
6. **Getrennt vom KI-Portal:** gleicher Server, aber eigener Ordner, eigenes Compose-Projekt, eigene Container, eigenes Netz, eigener Port und eigene Zugangsdaten (siehe [server.md](server.md)).

## Tech-Stack (entschieden)

Der frühere Vorschlag ASP.NET Core / Blazor / IIS ist verworfen. Die CMDB nutzt denselben Aufbau wie das KI-Portal:

| Schicht | Wahl | Begründung |
|---|---|---|
| Frontend | **React 19 + Vite + TypeScript**, Tailwind v4, Komponenten im shadcn-Stil (radix-ui, class-variance-authority, lucide-react), react-router | Gleicher Stack wie im KI-Portal, bekannte Bausteine für Formulare und Tabellen |
| Dienst | **Node 24**, `node:http` ohne Framework, gebaut mit Vite nach `server/dist/index.mjs` | Wenig Abhängigkeiten, ein Dienst liefert API und Frontend aus |
| Datenzugriff | **`mssql`** (tedious), immer verschlüsselt | Offizieller SQL-Server-Treiber für Node |
| Migrationen | versionierte SQL-Skripte im Repository (Schema `cmdb`), ab Phase 1 | Erfüllt die Regel „DB-Änderungen nur als Migrationsskripte“ |
| Anmeldung | **LDAP-Formular** gegen AD `aberle-it.loc`, siehe unten | Funktioniert ohne Domänenbeitritt des Linux-Servers und ohne Kerberos-Einrichtung |
| Hosting | **Docker** auf charlestown (Linux, Portainer), ein Container für Frontend und Dienst | Server und Betriebsweise wie beim KI-Portal |
| Tests | **Playwright** (E2E im Testmodus), `npm run typecheck`, GitHub Actions bei jedem PR | Jede Änderung wird geprüft, bevor sie auf den Server kommt |
| Testseite | **GitHub Pages** mit `npm run build:pages`: nur Testmodus, erfundene Daten | Öffentlich einsehbar, daher keine echten Namen, Adressen oder Kundendaten |

## Anmeldung und Rollen

- Formular mit Benutzername und Passwort. Erlaubt sind `dario.keller`, `ABERLE-IT\dario.keller` und `dario.keller@aberle-it.loc`.
- Der Dienst baut eine Verbindung per **LDAPS (636)** oder **LDAP mit StartTLS (389)** zum DC auf (Standard `rom.aberle-it.loc`).
  Klartext-LDAP ist nicht möglich. Das Zertifikat wird gegen die interne CA geprüft (`CMDB_LDAP_CA`).
- **Kein Service-Account:** Der Dienst bindet sich als `<user>@aberle-it.loc` mit dem Passwort der Person und liest danach
  nur deren eigenen Eintrag (`displayName`, `mail`, `memberOf`). Anmelden dürfen nur Konten unterhalb von
  `OU=Aberle Automation,OU=Aberle Mitarbeiter,DC=Aberle-IT,DC=loc` (wie in GAPTEQ).
- Rollen: Alle sind `user`. `admin` sind die Anmeldenamen in `CMDB_ADMINS` (Standard `dario.keller`) und, sobald gesetzt,
  die Mitglieder der AD-Gruppe `CMDB_ADMIN_GROUP`.
- Sitzung: HMAC-signiertes Cookie (Schlüssel `CMDB_SESSION_SECRET`), httpOnly, SameSite=Strict, Secure bei HTTPS,
  8 Stunden gültig. Schreibende Anfragen müssen JSON sein und vom selben Ursprung kommen.
- Schutz: Sperre nach 5 Fehlversuchen je Benutzer (20 je Adresse) für 15 Minuten. Das schützt auch die AD-Konten vor einer Sperre.
  Die echte Anmeldung ist nur über HTTPS möglich. Passwörter werden nie gespeichert oder protokolliert.
- Testmodus (`CMDB_TESTMODE=1` bzw. Build-Modus `pages`): feste Testbenutzer `admin` und `user`, kein LDAP, keine Datenbank,
  erfundene Daten, gut sichtbarer Hinweis „Testumgebung“. Im Betrieb nie aktiv.

## Hosting

- **charlestown** ist Entwicklungs- und Testserver mit echtem LDAP und echter Datenbank und wird später auch Produktivserver.
  Entwicklung/Test läuft als Compose-Projekt `cmdb-dev` auf Port 8790, der Betrieb später als eigenes Projekt `cmdb`.
  Adresse `https://cmdb.aberle-it.loc:8790` (DNS-Alias auf charlestown, Zertifikat der internen CA).
- Datenbank: SQL Server 2022 auf `kingstown.aberle-it.loc:1433`, Datenbank `CMDB`, Login `svc_cmdb` (kein `sa`).
  In Phase 0 nur Verbindungstest. Für Phase 1 braucht der Login Leserechte auf die benötigten `dbo`-Tabellen und Rechte
  auf das Schema `cmdb`, keine Schreibrechte auf `dbo`.
- Zugangsdaten stehen nur in `server/.env` auf dem Server, nie im Repository.

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
Phase 0  Fundament     Repo, CI, Login/Rollen, Docker auf charlestown, Testseite  ✅
                       (Schema cmdb und Stammdaten folgen mit Phase 1)
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
| 2 | Blazor oder React? | **Entschieden:** React + Node wie im KI-Portal |
| 3 | Hosting-Server und Service-Account | **Entschieden:** charlestown (Docker), DB-Login `svc_cmdb`, LDAP ohne Service-Account. Adresse `cmdb.aberle-it.loc:8790`. Offen: Rechte von `svc_cmdb` für Phase 1, Zertifikat der internen CA für den SQL Server (heute selbst signiert) |
| 4 | Sofortmassnahme `RMAN_Copy_Job_PW` | Passwörter in den Passwort-Manager verschieben und die Zugänge ändern |
| 5 | Was steckt hinter den 1001 Zeilen? | Bestand vs. Leerzeilen prüfen |
| 6 | Repo auf GitHub-Account `darkel96` (öffentlich) | später eventuell in eine Firmen-Organisation verschieben; bis dahin keine internen Daten ins Repo |
| 7 | Admin-Rolle über AD-Gruppe | Gruppe anlegen und in `CMDB_ADMIN_GROUP` eintragen |
