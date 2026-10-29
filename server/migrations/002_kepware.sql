-- 002: KEPware-Lizenzen (OPC-Server), erster Bereich direkt im Schema cmdb.
-- Nummernkreis ab 130000 über IDENTITY: keine vorab angelegten Leerzeilen, die Datenbank vergibt die Nummer.

CREATE TABLE cmdb.KEPware (
  ID            int IDENTITY(130000,1) NOT NULL CONSTRAINT PK_KEPware PRIMARY KEY,
  Typ           nvarchar(50)  NOT NULL CONSTRAINT DF_KEPware_Typ DEFAULT N'KEPware',
  Firma         nvarchar(255) NOT NULL,
  Produkt       nvarchar(255) NULL,
  Version       nvarchar(100) NULL,
  Lizenznehmer  nvarchar(255) NULL,
  Lieferant     nvarchar(255) NULL,
  Bestellnummer nvarchar(255) NULL,
  Lieferdatum   date          NULL,
  Lizenzkey     nvarchar(255) NULL,
  -- Notfall-Key: nie in Listen, nur einzeln mit dem Recht Bearbeiten (wie das Oracle-RMAN-Passwort)
  Notfallkey    nvarchar(255) NULL,
  Hostname      nvarchar(255) NULL,
  Support_bis   date          NULL,
  EOL           nvarchar(10)  NULL CONSTRAINT DF_KEPware_EOL DEFAULT N'Nein',
  Status        nvarchar(50)  NULL,
  Besonderheiten nvarchar(255) NULL
);
CREATE INDEX IX_KEPware_Firma ON cmdb.KEPware (Firma);
