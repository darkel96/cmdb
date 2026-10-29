# Branding (nur lokal)

Dieser Ordner wird nicht eingecheckt (das Repository ist öffentlich). Der Dienst liefert die Dateien unter
`/branding/<name>` aus, eingebunden per `docker-compose.yml` (`./server/branding:/branding:ro`).

| Datei | Verwendung |
|---|---|
| `logo.png` | Logo dunkel, Anmeldeseite |
| `logo-weiss.png` | Logo weiß, blaue Kopfleiste |
| `anmeldung.jpg` | Hintergrundbild der Anmeldeseite (etwa 2000 × 1125) |
| `favicon.ico` | Symbol im Browser-Tab |

Fehlt eine Datei, zeigt die CMDB die neutrale Darstellung (Testseite, lokale Entwicklung).
