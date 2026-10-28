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
| GitHub-Zugang | Deploy-Key `/root/.ssh/cmdb_deploy` (nur `darkel96/cmdb`, mit Schreibrecht), eigene `known_hosts` `/root/.ssh/cmdb_known_hosts`, eingetragen per `core.sshCommand` nur in `/root/cmdb/.git/config` | eigene Zugangsdaten, werden nicht verwendet |

Regeln:

- Container, Netzwerke, Volumes, Ports, Dateien und Zugangsdaten des KI-Portals werden weder gestoppt noch geändert noch
  mitbenutzt. Die CMDB hängt nicht im Netz `serviceangebot_intern` und nutzt nicht den Caddy des KI-Portals.
- Alle Docker-Objekte der CMDB beginnen mit `cmdb-` bzw. `cmdb`.
- `docker compose` immer im Verzeichnis `/root/cmdb` ausführen, nie `docker compose down` in anderen Verzeichnissen
  und keine globalen Aufräumbefehle (`docker system prune`, `docker volume prune`).
- Belegte Ports vor einer Änderung prüfen: `ss -tlnp`. Andere Dienste belegen 22, 443, 8000 und 9443.

## Aufruf

- Testumgebung: `https://charlestown.aberle-it.loc:8790`
- Das Zertifikat ist vorerst **selbst signiert** (Browser-Warnung). Für den Betrieb ein Zertifikat der internen CA
  (ABERLE-IT-CA-2019) für `charlestown.aberle-it.loc` bzw. einen eigenen DNS-Namen ausstellen und als
  `server/certs/tls.crt` und `server/certs/tls.key` ablegen. Das Zertifikat des KI-Portals wird nicht mitbenutzt.

## Konfiguration

`server/.env` (Vorlage: [server/.env.example](../server/.env.example), Rechte `600`, nie einchecken):

| Wert | Bedeutung |
|---|---|
| `CMDB_TESTMODE` | `1` = Testbenutzer `admin`/`user` (Passwort `test`), kein LDAP, keine DB. Für echte Anmeldung `0`. |
| `CMDB_SESSION_SECRET` | Zufälliger Schlüssel (`openssl rand -hex 32`). Neuer Schlüssel = alle abgemeldet. |
| `CMDB_LDAP_*` | AD-Anmeldung, Standard `ldaps://rom.aberle-it.loc:636`, nur Konten unter der OU `Aberle Automation` |
| `CMDB_ADMINS` | Anmeldenamen mit Rolle admin, Standard `dario.keller` |
| `CMDB_DB_*` | SQL Server `kingstown.aberle-it.loc`, Datenbank `CMDB`, Login `svc_cmdb`; **Passwort trägt nur der Betreiber ein** |

`server/certs/` (nur lesend in den Container unter `/certs` eingebunden, nicht im Repository):

- `ca.crt`: Zertifikat der internen CA (aus `/etc/pki/ca-trust/source/anchors/ABERLE-IT-CA-2019.crt`), prüft LDAPS und SQL Server
- `tls.crt`, `tls.key`: Zertifikat des Dienstes. `tls.key` gehört UID 1000 (Benutzer `node` im Container), Rechte `600`.

## Start und Stopp

```bash
cd /root/cmdb
docker compose up -d --build     # bauen und starten
docker compose ps                # Zustand (healthy?)
docker compose logs -f           # Protokoll (Anmeldungen ohne Passwörter)
docker compose restart           # nach Änderung an server/.env
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

## Prüfen

- `curl -sk https://localhost:8790/api/health` liefert `{"status":"ok",…}`
- E2E-Tests gegen den laufenden Dienst im Testmodus (ohne Node auf dem Server, im Playwright-Container):

  ```bash
  docker run --rm --ipc=host --network host -e CI=1 -e CMDB_E2E_URL=https://localhost:8790 \
    -v /root/cmdb:/app -w /app mcr.microsoft.com/playwright:v1.64.1-noble npx playwright test
  ```

  Die Tests lösen absichtlich die Sperre nach Fehlversuchen aus. Zweimal hintereinander innerhalb von 15 Minuten
  sperrt das auch die Adresse; dann `docker compose restart`.
- Node ist auf charlestown nicht installiert. Bauen und Prüfen ohne Container:
  `docker run --rm -v /root/cmdb:/app -w /app node:24-bookworm-slim npm run typecheck`

## Später: Betrieb

- Eigenes Compose-Projekt `cmdb`: `CMDB_COMPOSE_NAME=cmdb docker compose up -d --build` (Container `cmdb`, Netz `cmdb_cmdb`),
  getrennt von `cmdb-dev`. Für beide gleichzeitig einen zweiten Port wählen (`CMDB_HOST_PORT`).
- `CMDB_TESTMODE=0`, Zertifikat der internen CA, Rolle admin über eine AD-Gruppe (`CMDB_ADMIN_GROUP`).
