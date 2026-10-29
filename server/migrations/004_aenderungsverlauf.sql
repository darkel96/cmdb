-- 004: Änderungsverlauf je Eintrag (Systeme und Kunden): wer hat wann was geändert. Passwörter nie mit Wert.

CREATE TABLE cmdb.ChangeLog (
  Id       bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ChangeLog PRIMARY KEY,
  At       datetime2(0)  NOT NULL CONSTRAINT DF_ChangeLog_At DEFAULT SYSUTCDATETIME(),
  Username nvarchar(64)  NOT NULL,
  -- Bereich wie in der CMDB (server, oracle, …) bzw. „kunden“
  Area     nvarchar(50)  NOT NULL,
  ItemId   int           NOT NULL,
  -- angelegt, geändert, gelöscht, status, dokument
  Action   nvarchar(20)  NOT NULL,
  -- JSON: [{ "label": "…", "old": "…", "new": "…", "secret": true }]
  Changes  nvarchar(max) NULL
);
CREATE INDEX IX_ChangeLog_Item ON cmdb.ChangeLog (Area, ItemId, At DESC);
