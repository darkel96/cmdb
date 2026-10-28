# Analyse des bestehenden Datenbankschemas

Stand: 28.10.2026 · Quelle: `docs/schema/` (erzeugt mit `tools/export-schema.ps1`, nur Struktur, keine Daten)

Server `KINGSTOWN\KINGSTOWN` (SQL Server 2022, 16.0.4275), Datenbank `CMDB`, alles im Schema `dbo`.

## Überblick

| Objekt | Anzahl |
|---|---|
| Tabellen | 67 |
| Views | 1 |
| Stored Procedures | 1 (Integritätsprüfung, kein Fachcode) |
| Fremdschlüssel | **0** |
| Check-Constraints | 0 |
| Primärschlüssel | 37 von 67 Tabellen |

Die Datenbank enthält deutlich mehr als eine CMDB. Fachlich lassen sich sechs Bereiche unterscheiden:

| Bereich | Tabellen (Auswahl) |
|---|---|
| **Inventar / CIs** | `Server_manuell`, `Storage_manuell`, `Switche_manuell`, `Client_manuell`, `MDE_manuell`, `Windowssysteme_manuell`, `Oracle_manuell`, `FW_IT`, `FW_SPS`, `Linuxsysteme`, `Server`, `Oracle_DB` |
| **Lizenzen / Software** | `Lizenzen_manuell`, `VEEAM_manuell`, `VMware_manuell`, `TSPLUS_manuell`, `PRTG_manuell`, `PMS_Module*` |
| **Verträge** | `Vertraege`, `Vertragsdaten`, `Vertragsarten`, `Servicevertrag_manuell`, `IT_Service_manuell`, `Anhang` |
| **Kunden / Kontakte** | `DS_Kunden`, `Firmenkontakte`, `IT_Administratoren` |
| **Tickets / Zeiterfassung / SAP** | `Anhang_Ticket`, `Ticketnummern`, `Ticketarten`, `Zeiterfassung*`, `Zeiten_*`, `SAP`, `SAP_PSP_Elemente` |
| **Projekte (TPL)** | `TPL`, `TPL_BMK*`, `TPL_Projekte`, `TPL_TGW*` |
| Auswahllisten | 13 × `DD_*` (z. B. `DD_Hersteller`, `DD_Lieferant`, `DD_Servertyp`) |
| GAPTEQ-Umfeld | `Userlog` (`GapteqUser`), `LoginName` |

Eigene GAPTEQ-Systemtabellen liegen nicht in dieser Datenbank. GAPTEQ speichert seine App-Konfiguration also woanders. Das erleichtert den Parallelbetrieb.

## Befunde

### 🔴 Kritisch: Sicherheit

1. **`Oracle_manuell.RMAN_Copy_Job_PW`:** Eine Spalte für Passwörter (Typ `varchar(255)`), vermutlich im Klartext. Zusammen mit `RMAN_Copy_Job_Username`, `IP_Adresse` und `Hostname` stehen damit komplette Zugangsdaten in einer Tabelle. Dieselbe Spalte gibt es auch in `NeueZielTabelle`.
   → **Unabhängig vom Neubau zeitnah klären:** Passwörter in einen Passwort-Manager verschieben und die Spalte leeren. Die betroffenen Zugänge sollten danach geändert werden.
2. **`Server.Lizenzschlüssel`, `Lizenzen_manuell.Lizenz`:** Lizenzschlüssel im Klartext. Das ist weniger kritisch, der Zugriff sollte aber eingeschränkt sein.
3. **Personenbezogene Daten:** Kontaktdaten (`Firmenkontakte`, `DS_Kunden`) sowie Zeiterfassung mit Personalnummern (`SAP`, `Zeiterfassung_Zusammenfassung`). Das ist relevant für DSGVO und Rechtekonzept, bei der Zeiterfassung eventuell auch für den Betriebsrat.

### 🟠 Datenmodell

4. **Es gibt keine Beziehungen in der Datenbank.** Es existiert kein einziger Fremdschlüssel. Verknüpfungen laufen über Freitext:
   - `Firma` ist in fast jeder Tabelle eine freie Textspalte. `DS_Kunden` existiert zwar als Kundentabelle, wird aber nirgends referenziert.
   - Hersteller, Lieferant, Status, Typ usw. sind Text. Die `DD_*`-Listen haben weder Primärschlüssel noch Fremdschlüssel, sie dienen nur als Dropdown-Quelle.
   - Die einzige View (`Oracle_Inventarisierung_View`) verknüpft `Vertragsdaten` mit `Oracle_manuell` über einen **zusammengesetzten Anzeigetext** (`'ID: 5, Firma: X, DB_Typ: Y'`). Ändert sich die Firma, geht die Verknüpfung verloren.
   - Abhängigkeiten zwischen CIs (Server → VM → Datenbank, Gerät → Vertrag) sind nicht abbildbar.
5. **Eine Tabelle pro CI-Typ mit vielen doppelten Spalten.** Etwa 12 `*_manuell`-Tabellen wiederholen dieselben Felder: `Typ`, `Firma`, `Bestellnummer`, `Lieferant`, `Hersteller`, `Modell`, `Servicetag`, `Support_bis`, `EOL`, `Status`, `Besonderheiten`. Für eine übergreifende Auswertung („Was läuft im nächsten Quartal aus?") braucht es heute ein UNION über alle Tabellen.
   - `NeueZielTabelle` (angelegt am 10.09.2026) ist offenbar ein Versuch, alle Typen in einer breiten Tabelle zusammenzuführen. Der Bedarf nach einem einheitlichen Modell ist also schon erkannt.
6. **Schwache Datentypen:** `EOL` als `varchar`, Anzahlen wie `Anzahl_Festplatten`, `Anzahl_Lizenzen` und `Anzahl_Sensoren` teils als `varchar`, fast alles `varchar(255)`. `Firma` in `Windowssysteme_manuell` ist `nchar(255)` und wird daher mit Leerzeichen aufgefüllt. `varchar` statt `nvarchar` kann Probleme mit Sonderzeichen verursachen.
7. **Fehlende Schlüssel:** 30 Tabellen haben keinen Primärschlüssel, darunter alle `DD_*`-Listen, `Vertragsarten`, `Abteilungen` und `TPL`. Bei den `*_manuell`-Tabellen ist `ID` kein `IDENTITY`. Die IDs werden extern vergeben, vermutlich über `id_sequence`.
8. **Auffällig: genau 1001 Zeilen** in 13 `*_manuell`-Tabellen (Server, Switche, Storage, Client, MDE, Lizenzen, Oracle, PRTG, VEEAM, VMware, TSPLUS, Windowssysteme, IT_Service). Das deutet auf vorab angelegte Leerzeilen hin, nicht auf echten Bestand. **Bitte prüfen.** Mit reinen Strukturrechten kann ich die Inhalte nicht sehen.

### 🟡 Betrieb und Nachvollziehbarkeit

9. **Keine Historie:** Es gibt keine Spalten wie `ErstelltAm`, `GeändertVon` oder `GeändertAm` und keine Temporal Tables. Wer wann was geändert hat, ist nicht nachvollziehbar. `Userlog` protokolliert nur Logins.
10. **Dateien in der Datenbank:** Anhänge liegen als `varbinary` in `Anhang`, `Anhang_Ticket` und `Admin_Anhang`. Das ist machbar, vergrössert aber Datenbank und Backups.
11. **Altlasten:** `NeueZielTabelle`, `Zeiterfassung_Sicherung` (leer), `Ergebnis_*_manuell`, leere Tabellen (`Auftraggeber_Ticket`, `TPL_BMK_Filter`, `Zeiten_Übersicht`, `Zeiterfassung_Zusammenfassung`).
12. **Leerzeichen und Sonderzeichen in Spaltennamen:** z. B. `SAP Projektnummer`, `Zeit in Stunden`, `PMS-Modul`, `Priorität`. Das ist im Code umständlich, für den Bestand aber unkritisch.

## Fazit

Die Daten sind da und brauchbar, aber das Modell ist eine Sammlung von Excel-ähnlichen Listen ohne Beziehungen. Für die eigentlichen Stärken einer CMDB (Abhängigkeiten, Auswertungen über alle CI-Typen, Historie, Vertragsbezug) fehlt die Struktur. Eine Eigenentwicklung sollte deshalb nicht nur eine neue Oberfläche auf dieselben Tabellen setzen. Sie sollte schrittweise ein **sauberes Zielmodell in einem eigenen Schema** aufbauen. Vorschlag: [architektur-vorschlag.md](architektur-vorschlag.md).
