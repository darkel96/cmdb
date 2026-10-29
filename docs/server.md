# Betrieb auf charlestown

Stand: 28.10.2026

charlestown ist der interne Linux-Server mit Docker und Portainer (Oracle Linux 9). Er dient als Entwicklungs- und
Testumgebung mit echtem LDAP und echter Datenbank und wird später auch der Produktivserver. Auf ihm läuft bereits das
KI-Portal. **Beide Anwendungen sind strikt getrennt.**

## Trennung vom KI-Portal (verbindlich)

| | CMDB | KI-Portal (nicht anfassen) |
|---|---|---|
| Verzeichnis | `/root/cmdb` (Git-Klon von `darkel96/cmdb`) | `/opt/ki-hub`, `/opt/ki-portal*`, `/opt/serviceangebot` |
| Compose-Projekt | `cmdb-dev` (später `cmdb`) | `ki-hub`, `serviceangebot` |
| Container | `cmdb-dev` (später `cmdb`) | `ki-hub`, `serviceangebot`, `serviceangebot-proxy`, `ki-portal-designer` |
| Image | `cmdb-dev:latest` | eigene |
| Netzwerk | `cmdb-dev_cmdb` | `serviceangebot_intern` |
| Volumes | keine (Phase 0 speichert nichts) | eigene |
| Port | **8790** (HTTPS) | 443 (Caddy), intern 8787 |
| Konfiguration | `/root/cmdb/server/.env`, `/root/cmdb/server/certs/` | eigene `.env`-Dateien und Zertifikate |
| GitHub-Zugang | Push: Deploy-Key `/root/.ssh/cmdb_deploy` (nur `darkel96/cmdb`, mit Schreibrecht), eigene `known_hosts` `/root/.ssh/cmdb_known_hosts`, eingetragen per `core.sshCommand` nur in `/root/cmdb/.git/config`. PRs und Pages über die API: Fine-grained Token nur für `darkel96/cmdb` in `/root/.config/cmdb/github-token` (Rechte 600) | eigene Zugangsdaten, werden nicht verwendet |

Regeln:

- Container, Netzwerke, Volumes, Ports, Dateien und Zugangsdaten des KI-Portals werden weder gestoppt noch geändert noch
  mitbenutzt. Die CMDB hängt nicht im Netz `serviceangebot_intern` und nutzt nicht den Caddy des KI-Portals.
- Alle Docker-Objekte der CMDB beginnen mit `cmdb-` bzw. `cmdb`.
- `docker compose` immer im Verzeichnis `/root/cmdb` ausführen, nie `docker compose down` in anderen Verzeichnissen
  und keine globalen Aufräumbefehle (`docker system prune`, `docker volume prune`).
- Belegte Ports vor einer Änderung prüfen: `ss -tlnp`. Andere Dienste belegen 22, 443, 8000 und 9443.

## Aufruf

- Adresse heute: **`https://charlestown.aberle-it.loc:8790`**
- Später: **`https://cmdb.aberle-it.loc:8790`**, sobald der DNS-Alias (CNAME) `cmdb` → `charlestown.aberle-it.loc` angelegt ist
  (wie `ki-hub.aberle-it.loc` beim KI-Portal). Das Zertifikat enthält beide Namen bereits.
- Eigener Port statt 443: Port 443 gehört dem Caddy des KI-Portals. Die CMDB hängt sich wegen der Trennung nicht dort ein.

## Zertifikat (interne CA)

Gleiches Verfahren wie beim KI-Portal, aber mit eigenem Schlüssel und eigener Anfrage (das Zertifikat des KI-Portals
wird nicht mitbenutzt):

1. Schlüssel und Anfrage auf charlestown erzeugen (der Schlüssel verlässt den Server nie):

   ```bash
   cd /root/cmdb/server/certs
   openssl req -new -newkey rsa:2048 -nodes -keyout cmdb.key -out cmdb.csr \
     -subj "/CN=charlestown.aberle-it.loc" -addext "subjectAltName=DNS:charlestown.aberle-it.loc,DNS:cmdb.aberle-it.loc"
   chown 1000:1000 cmdb.key && chmod 600 cmdb.key
   ```

2. Auf einem Windows-PC in der Domäne einreichen (Vorlage „WebServer“):

   ```powershell
   scp root@charlestown.aberle-it.loc:/root/cmdb/server/certs/cmdb.csr .
   certreq -submit -config "LOWELL.aberle-it.loc\ABERLE-IT-CA-2019" -attrib "CertificateTemplate:WebServer" cmdb.csr cmdb.crt
   scp cmdb.crt root@charlestown.aberle-it.loc:/root/cmdb/server/certs/
   ```

3. Auf charlestown einsetzen und den Container neu erstellen:

   ```bash
   cd /root/cmdb/server/certs
   openssl x509 -in cmdb.crt -noout -subject -issuer -enddate -ext subjectAltName
   \cp -f cmdb.crt tls.crt && \cp -fp cmdb.key tls.key
   cd /root/cmdb && docker compose up -d --force-recreate
   ```

Aktuelles Zertifikat: ausgestellt am 28.10.2026, gültig bis **27.10.2028**. Vor Ablauf mit denselben Schritten erneuern.

## Konfiguration

`server/.env` (Vorlage: [server/.env.example](../server/.env.example), Rechte `600`, nie einchecken):

| Wert | Bedeutung |
|---|---|
| `CMDB_TESTMODE` | `1` = Testbenutzer `admin`/`user` (Passwort `test`), kein LDAP, keine DB. Für echte Anmeldung `0`. |
| `CMDB_SESSION_SECRET` | Zufälliger Schlüssel (`openssl rand -hex 32`). Neuer Schlüssel = alle abgemeldet. |
| `CMDB_LDAP_*` | AD-Anmeldung, Standard `ldaps://rom.aberle-it.loc:636`, nur Konten unter der OU `Aberle Automation` |
| `CMDB_ADMINS` | Anmeldenamen mit Rolle admin, Standard `dario.keller` |
| `CMDB_DB_*` | SQL Server `kingstown.aberle-it.loc`, Datenbank `CMDB`, Login `svc_cmdb`; **Passwort trägt nur der Betreiber ein** |

**Eigenes Schema `cmdb`** (Anmelde-Protokoll, Rollen): einmalig vom DB-Betrieb anzulegen, danach legt der Dienst seine
Tabellen dort selbst an (versionierte Skripte `server/migrations/NNN_*.sql`, eingespielt beim Start, vermerkt in
`cmdb.SchemaVersion`). `svc_cmdb` kann damit nur im Schema `cmdb` Tabellen anlegen, nicht in `dbo`.

```sql
USE CMDB;
GO
CREATE SCHEMA cmdb AUTHORIZATION svc_cmdb;   -- muss allein in einem Block stehen
GO
GRANT CREATE TABLE TO svc_cmdb;
GO
```

**Rollen und Rechte:** Verwaltung › Rollen. Jede Rolle hat je Bereich (Kunden und alle Bereiche der Seitenleiste) die
Rechte Lesen, Anlegen, Bearbeiten, Löschen; Mitglieder sind Personen (Anmeldename) oder AD-Gruppen (CN). Die Grundrolle
„Alle Angemeldeten“ gilt für jede Person und darf anfangs alles lesen. Admins aus `CMDB_ADMINS`/`CMDB_ADMIN_GROUP`
dürfen immer alles und als Einzige die Verwaltung öffnen. Der Dienst prüft die Rechte bei jeder Anfrage; Änderungen an
Rollen gelten nach spätestens 30 Sekunden, neue AD-Gruppen einer Person nach der nächsten Anmeldung.
**Anmelde-Protokoll:** Verwaltung › Anmeldungen, jede Anmeldung mit Zeit, Person, Ergebnis, Grund und Adresse, 365 Tage
aufbewahrt, ohne Passwörter.

Rechte von `svc_cmdb`: nur lesen, nie schreiben auf `dbo`. Je Bereich ein Leserecht:

| Bereich | Tabelle | Recht seit |
|---|---|---|
| Startseite (Kundenübersicht) | `dbo.DS_Kunden` | 28.10.2026 |
| Hardware › Server | `dbo.Server_manuell` | 28.10.2026 |
| Hardware › Switche | `dbo.Switche_manuell` | 28.10.2026 |
| Hardware › MDE | `dbo.MDE_manuell` | 28.10.2026 |
| Anlage Vertrag › Switch, MDE (nur Admins) | `UPDATE` auf `dbo.Switche_manuell`, `dbo.MDE_manuell` | 28.10.2026 |
| Hardware › Storage, Client | `dbo.Storage_manuell`, `dbo.Client_manuell` | 28.10.2026 |
| Anlage Vertrag › Storage, Client (nur Admins) | `UPDATE` auf `dbo.Storage_manuell`, `dbo.Client_manuell`, Leserecht auf `dbo.DD_RAID`, `dbo.DD_Client_Monitor` | 28.10.2026 |
| Software › Oracle | `dbo.Oracle_manuell`, **nur Spalten ohne `RMAN_Copy_Job_PW`** | 28.10.2026 (Passwortspalte geprüft: Lesen verweigert, Fehler 230) |
| OS-Systeme › Windows | `dbo.Windowssysteme_manuell` | 28.10.2026 |
| Kundenansicht › Dokumente | `dbo.Anhang` | 28.10.2026 |
| Software › VMware, Veeam, TSPLUS, PRTG; Lizenzen › Oracle-ESL | `dbo.VMware_manuell`, `dbo.VEEAM_manuell`, `dbo.TSPLUS_manuell`, `dbo.PRTG_manuell`, `dbo.Vertragsdaten` | 28.10.2026 |
| Kunden anlegen, bearbeiten, löschen (nur Admins) | `INSERT`, `UPDATE`, `DELETE` auf `dbo.DS_Kunden`; Lesen und Ändern nur der Namensspalte in 28 verknüpften Tabellen | 28.10.2026 |
| Lizenzen › Windows-Lizenzen; Anlage VMware, VEEAM, TSPLUS, PRTG, Windows-Lizenzen (nur Admins) | `SELECT` auf `dbo.Lizenzen_manuell`, `UPDATE` auf `dbo.VMware_manuell`, `dbo.VEEAM_manuell`, `dbo.TSPLUS_manuell`, `dbo.PRTG_manuell`, `dbo.Lizenzen_manuell` | 28.10.2026 |
| Anlage Oracle (ohne Passwortspalte), Anlage Windows-System | `UPDATE` auf die Oracle-Spalten ohne `RMAN_Copy_Job_PW`, `UPDATE` auf `dbo.Windowssysteme_manuell`, Leserecht auf `dbo.DD_DB_Typ`, `dbo.DD_Zeichensatz`, `dbo.DD_FW_Server_OS` | 28.10.2026 |
| Stammdaten (Auswahllisten pflegen) | `INSERT`, `UPDATE`, `DELETE` auf `dbo.DD_DB_Typ`, `DD_Hersteller`, `DD_Lieferant`, `DD_RAID`, `DD_Servertyp`, `DD_Vertragstyp`, `DD_Zeichensatz`, `DD_FW_Server_OS` | offen |
| Anlage Vertrag › Server (nur Admins) | `UPDATE` auf `dbo.Server_manuell`, Leserecht auf `dbo.DD_Lieferant`, `dbo.DD_Hersteller`, `dbo.DD_Servertyp`, `dbo.DD_Vertragstyp`, `dbo.DD_Ja_Nein` | 28.10.2026 (erste Anlage: Server 10064) |

```sql
USE CMDB;
GRANT SELECT ON dbo.DS_Kunden TO svc_cmdb;
GRANT SELECT ON dbo.Server_manuell TO svc_cmdb;
GRANT SELECT ON dbo.Switche_manuell TO svc_cmdb;
-- Anlage Vertrag › Server: nächste freie Zeile füllen, Auswahllisten lesen
GRANT UPDATE ON dbo.Server_manuell TO svc_cmdb;
GRANT SELECT ON dbo.DD_Lieferant TO svc_cmdb;
GRANT SELECT ON dbo.DD_Hersteller TO svc_cmdb;
GRANT SELECT ON dbo.DD_Servertyp TO svc_cmdb;
GRANT SELECT ON dbo.DD_Vertragstyp TO svc_cmdb;
GRANT SELECT ON dbo.DD_Ja_Nein TO svc_cmdb;
-- Hardware › MDE lesen; Anlage Switch und MDE
GRANT SELECT ON dbo.MDE_manuell TO svc_cmdb;
GRANT UPDATE ON dbo.Switche_manuell TO svc_cmdb;
GRANT UPDATE ON dbo.MDE_manuell TO svc_cmdb;
-- Hardware › Storage und Client lesen und anlegen
GRANT SELECT, UPDATE ON dbo.Storage_manuell TO svc_cmdb;
GRANT SELECT, UPDATE ON dbo.Client_manuell TO svc_cmdb;
GRANT SELECT ON dbo.DD_RAID TO svc_cmdb;
GRANT SELECT ON dbo.DD_Client_Monitor TO svc_cmdb;
-- Oracle nur lesend und ohne die Passwortspalte RMAN_Copy_Job_PW (Spaltenrecht)
GRANT SELECT ON dbo.Oracle_manuell (ID, Typ, Firma, DB_Typ, DB_Version, LinuxOS_WinOS, Zeichensatz, SGA, PGA,
  RMAN_Copy_Job, RMAN_Copy_Job_Pfad, RMAN_Copy_Job_Username, DNS_Server, IP_Adresse, Gateway,
  Software_Pflegevertrag, Software_pflegevertragsende, IT_Servicevertrag, IT_Servicevertragsende,
  Besonderheiten, Hostname) TO svc_cmdb;
GRANT SELECT ON dbo.Windowssysteme_manuell TO svc_cmdb;
-- Kundenansicht: Dokumente (Anhänge) lesen und herunterladen
GRANT SELECT ON dbo.Anhang TO svc_cmdb;
-- Software › VMware, TSPLUS, PRTG und Lizenzen › Oracle-ESL lesen
GRANT SELECT ON dbo.VMware_manuell TO svc_cmdb;
GRANT SELECT ON dbo.VEEAM_manuell TO svc_cmdb;
GRANT SELECT ON dbo.TSPLUS_manuell TO svc_cmdb;
GRANT SELECT ON dbo.PRTG_manuell TO svc_cmdb;
GRANT SELECT ON dbo.Vertragsdaten TO svc_cmdb;
-- Lizenzen › Windows-Lizenzen lesen; Anlage VMware, VEEAM, TSPLUS, PRTG, Windows-Lizenzen
GRANT SELECT ON dbo.Lizenzen_manuell TO svc_cmdb;
GRANT UPDATE ON dbo.VMware_manuell TO svc_cmdb;
GRANT UPDATE ON dbo.VEEAM_manuell TO svc_cmdb;
GRANT UPDATE ON dbo.TSPLUS_manuell TO svc_cmdb;
GRANT UPDATE ON dbo.PRTG_manuell TO svc_cmdb;
GRANT UPDATE ON dbo.Lizenzen_manuell TO svc_cmdb;
-- Anlage Oracle: nur die Formularspalten, nie RMAN_Copy_Job_PW
GRANT UPDATE (Typ, Firma, DB_Typ, DB_Version, LinuxOS_WinOS, Zeichensatz, SGA, PGA, RMAN_Copy_Job, RMAN_Copy_Job_Pfad,
  RMAN_Copy_Job_Username, DNS_Server, IP_Adresse, Gateway, Software_Pflegevertrag, Software_pflegevertragsende,
  IT_Servicevertrag, IT_Servicevertragsende, Besonderheiten) ON dbo.Oracle_manuell TO svc_cmdb;
-- Anlage Windows-System
GRANT UPDATE ON dbo.Windowssysteme_manuell TO svc_cmdb;
GRANT SELECT ON dbo.DD_DB_Typ TO svc_cmdb;
GRANT SELECT ON dbo.DD_Zeichensatz TO svc_cmdb;
GRANT SELECT ON dbo.DD_FW_Server_OS TO svc_cmdb;
-- Stammdaten: Auswahllisten pflegen (Recht „Stammdaten“ in den Rollen)
GRANT INSERT, UPDATE, DELETE ON dbo.DD_DB_Typ TO svc_cmdb;
GRANT INSERT, UPDATE, DELETE ON dbo.DD_Hersteller TO svc_cmdb;
GRANT INSERT, UPDATE, DELETE ON dbo.DD_Lieferant TO svc_cmdb;
GRANT INSERT, UPDATE, DELETE ON dbo.DD_RAID TO svc_cmdb;
GRANT INSERT, UPDATE, DELETE ON dbo.DD_Servertyp TO svc_cmdb;
GRANT INSERT, UPDATE, DELETE ON dbo.DD_Vertragstyp TO svc_cmdb;
GRANT INSERT, UPDATE, DELETE ON dbo.DD_Zeichensatz TO svc_cmdb;
GRANT INSERT, UPDATE, DELETE ON dbo.DD_FW_Server_OS TO svc_cmdb;
-- Dokumente direkt am Kunden hochladen (Recht „Kunden: Bearbeiten“), wie GAPTEQ mit Typ „Angebot“; nur INSERT
GRANT INSERT ON dbo.Anhang TO svc_cmdb;
-- Kunden anlegen, bearbeiten, löschen (nur Admins in der CMDB)
GRANT INSERT, UPDATE, DELETE ON dbo.DS_Kunden TO svc_cmdb;
-- Umbenennen in allen verknüpften Tabellen und Prüfung vor dem Löschen: nur die Namensspalte
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Server_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Switche_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.MDE_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Storage_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Client_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Oracle_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Windowssysteme_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.VMware_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.TSPLUS_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.PRTG_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.VEEAM_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Lizenzen_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.IT_Service_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Servicevertrag_manuell TO svc_cmdb;
GRANT SELECT (Kunde), UPDATE (Kunde) ON dbo.Vertragsdaten TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Vertraege TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Anhang TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Anhang_Ticket TO svc_cmdb;
GRANT SELECT (Firmenname), UPDATE (Firmenname) ON dbo.Firmenkontakte TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.FW_IT TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.FW_SPS TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Linuxsysteme TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Oracle_DB TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Server TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Ergebnis_Server_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.Ergebnis_Switche_manuell TO svc_cmdb;
GRANT SELECT (Firma), UPDATE (Firma) ON dbo.NeueZielTabelle TO svc_cmdb;
GRANT SELECT (Kunde), UPDATE (Kunde) ON dbo.Zeiterfassung TO svc_cmdb;
```

**Einträge bearbeiten:** Detailansicht › Bearbeiten (Recht „Bearbeiten“ des Bereichs). Gespeichert werden nur geänderte
Felder des Formulars; ID, Typ und feste Werte bleiben. Die CMDB vergleicht beim Speichern mit dem Stand beim Öffnen: Hat
jemand den Eintrag inzwischen geändert (auch in GAPTEQ), speichert sie nicht und nennt die betroffenen Felder. Alte Werte,
die nicht mehr in einer Auswahlliste stehen, dürfen unverändert bleiben. Rechte: das `UPDATE`-Recht wie bei der Anlage.

**Kunden pflegen:** Anlegen fügt eine Zeile in `DS_Kunden` ein (die ID vergibt der SQL Server), gleiche Namen sind nicht
erlaubt. Beim Umbenennen ändert die CMDB den Namen in einer Transaktion auch in allen Tabellen aus
`server/src/customerLinks.ts` (Systeme, Dokumente, Kontakte, Verträge, Tickets, Zeiterfassung …); schlägt ein Teil fehl,
bleibt nichts geändert. Der Kundenname darf deshalb höchstens 100 Zeichen haben (`Anhang_Ticket.Firma`). Löschen geht
nur, wenn in diesen Tabellen nichts mehr auf den Kunden verweist. Alles steht im Protokoll.

**Kundenansicht:** Beim Öffnen eines Kunden zeigt die CMDB Kundeninformation, Dokumente (`dbo.Anhang`, zugeordnet über
`FirmenID` oder den Firmennamen) und je Bereich alle Systeme, deren `Firma` dem Kundennamen entspricht. Ein Bereich ohne
Leserecht verhindert die übrigen nicht, er wird unten als „Nicht angezeigt“ genannt.

**Schreiben (Anlage Vertrag):** Wie GAPTEQ füllt die CMDB die nächste freie, vorab angelegte Zeile des ID-Bereichs
(Server 10000–11000, Switche 20000–21000 …), kein `INSERT`. Die Zeile wird beim Auswählen gesperrt (`UPDLOCK`,
`READPAST`) und nur geschrieben, solange sie noch leer ist; sonst nimmt die CMDB die nächste. Jede Anlage steht im
Protokoll (`docker compose logs`): `Angelegt: Server <ID> von <Anmeldename>`. Löschen oder Ändern gibt es in der CMDB
noch nicht, das geht weiterhin in GAPTEQ.

Auswahllisten und Altdaten (Stand 28.10.2026): `DD_Servertyp` schreibt „Multi/Single Site Cluster“, 46 ältere Server
haben noch „Side“; ein Lieferant ist als „Hochwart“ statt „Hochwarth“ erfasst. Die CMDB ändert Altdaten nicht.

Das ändert nur Rechte, keine Tabellen; GAPTEQ ist nicht betroffen. Weitere Leserechte kommen mit den Bereichen in Phase 1.
Vorab angelegte Leerzeilen (ohne Typ und Firma, EOL ist teils vorbelegt) blendet die CMDB aus, wie GAPTEQ.
Neue Bereiche werden in `src/lib/areas.ts` beschrieben (Tabelle, Spalten, Breiten); Übersicht, Öffnen, API und
Testdaten entstehen daraus.

Der SQL Server auf kingstown (Instanz `KINGSTOWN`) nutzt seit 28.10.2026 ein Zertifikat der internen CA für
`kingstown.aberle-it.loc` (Vorlage WebServer, gültig bis 27.10.2028, „Verschlüsselung erzwingen“ unverändert aus).
Die CMDB prüft es über `CMDB_DB_CA=/certs/ca.crt`; `CMDB_DB_TRUST_CERT` bleibt `0`. Vor Ablauf auf kingstown neu
anfordern (`certreq` mit `MachineKeySet = TRUE`), dem Dienstkonto `NT Service\MSSQL$KINGSTOWN` Leserecht auf den
privaten Schlüssel geben, im Konfigurations-Manager zuweisen und den SQL-Dienst neu starten.

`server/certs/` (nur lesend in den Container unter `/certs` eingebunden, nicht im Repository):

- `ca.crt`: Zertifikat der internen CA (aus `/etc/pki/ca-trust/source/anchors/ABERLE-IT-CA-2019.crt`), prüft LDAPS und SQL Server
- `tls.crt`, `tls.key`: Zertifikat des Dienstes, das gerade verwendet wird. `tls.key` gehört UID 1000 (Benutzer `node` im Container), Rechte `600`.
- `cmdb.csr`, `cmdb.key`, `cmdb.crt`: Anfrage und Zertifikat der internen CA für `charlestown.aberle-it.loc` und `cmdb.aberle-it.loc` (siehe oben)

## Start und Stopp

```bash
cd /root/cmdb
docker compose up -d --build     # bauen und starten
docker compose ps                # Zustand (healthy?)
docker compose logs -f           # Protokoll (Anmeldungen ohne Passwörter)
docker compose up -d --force-recreate   # nach Änderung an server/.env (restart liest sie nicht neu)
docker compose down              # stoppen und entfernen (nur CMDB)
```

## Update

```bash
cd /root/cmdb
git fetch origin
git switch main && git pull --ff-only   # bzw. den gewünschten Branch
docker compose up -d --build
docker compose ps
```

Push vom Server geht über den Deploy-Key (in `.git/config` hinterlegt), z. B. `git push -u origin <branch>`.

Pull Requests legt Claude Code über die GitHub-API mit dem Token aus `/root/.config/cmdb/github-token` an
(Fine-grained Token „cmdb charlestown“, nur `darkel96/cmdb`: Pull requests, Pages, Administration, Actions lesen).
Der Token wird nie angezeigt oder geloggt. Erneuern auf https://github.com/settings/personal-access-tokens und mit
`read -rsp` neu in die Datei schreiben.

## Prüfen

- `curl -s --cacert server/certs/ca.crt https://charlestown.aberle-it.loc:8790/api/health` liefert `{"status":"ok",…}`
- E2E-Tests gegen den laufenden Dienst im Testmodus (ohne Node auf dem Server, im Playwright-Container):

  ```bash
  docker run --rm --ipc=host --network host -e CI=1 -e CMDB_E2E_URL=https://localhost:8790 \
    -v /root/cmdb:/app -w /app mcr.microsoft.com/playwright:v1.64.1-noble npx playwright test
  ```

  Die Tests lösen absichtlich die Sperre nach Fehlversuchen aus. Zweimal hintereinander innerhalb von 15 Minuten
  sperrt das auch die Adresse; dann `docker compose restart` (setzt die Sperren zurück).
- Node ist auf charlestown nicht installiert. Bauen und Prüfen ohne Container:
  `docker run --rm -v /root/cmdb:/app -w /app node:24-bookworm-slim npm run typecheck`

## Später: Betrieb

- Eigenes Compose-Projekt `cmdb`: `CMDB_COMPOSE_NAME=cmdb docker compose up -d --build` (Container `cmdb`, Netz `cmdb_cmdb`),
  getrennt von `cmdb-dev`. Für beide gleichzeitig einen zweiten Port wählen (`CMDB_HOST_PORT`).
- `CMDB_TESTMODE=0`, Zertifikat der internen CA, Rolle admin über eine AD-Gruppe (`CMDB_ADMIN_GROUP`).
