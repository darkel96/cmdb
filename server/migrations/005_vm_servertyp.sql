-- 005: Servertypen der virtuellen Maschinen (Spalte Funktion in dbo.Windowssysteme_manuell). GAPTEQ hat dafür keine
-- DD_*-Tabelle; bisher galten die Werte, die schon in der Spalte vorkommen. Jetzt unter Verwaltung › Stammdaten
-- pflegbar. Vorbelegt mit den vorhandenen Werten, dbo wird nur gelesen.

CREATE TABLE cmdb.VmServertyp (
  Servertyp varchar(255) NOT NULL CONSTRAINT PK_VmServertyp PRIMARY KEY
);

INSERT INTO cmdb.VmServertyp (Servertyp)
SELECT DISTINCT LTRIM(RTRIM(Funktion))
FROM dbo.Windowssysteme_manuell
WHERE NULLIF(LTRIM(RTRIM(Funktion)), '') IS NOT NULL;
