-- 003: Support-Ende je Betriebssystem (Name wie in dbo.DD_FW_Server_OS). Vorbelegt mit den Daten aus dem
-- Microsoft-Lebenszyklus; in der CMDB unter Stammdaten › Server-OS änderbar. dbo bleibt unverändert.

CREATE TABLE cmdb.OsSupport (
  Name           nvarchar(255) NOT NULL CONSTRAINT PK_OsSupport PRIMARY KEY,
  -- Ende des allgemeinen Supports (Mainstream)
  MainstreamEnde date NULL,
  -- Ende des erweiterten Supports (LTS); danach gilt das System als EOL
  ExtendedEnde   date NULL,
  ChangedBy      nvarchar(64) NULL,
  ChangedAt      datetime2(0) NOT NULL CONSTRAINT DF_OsSupport_ChangedAt DEFAULT SYSUTCDATETIME()
);

INSERT INTO cmdb.OsSupport (Name, MainstreamEnde, ExtendedEnde, ChangedBy) VALUES
  (N'Windows XP', '2009-04-14', '2014-04-08', N'Vorbelegung'),
  (N'Windows 7 Enterprise', '2015-01-13', '2020-01-14', N'Vorbelegung'),
  (N'Windows 10 Enterprise', '2025-10-14', '2025-10-14', N'Vorbelegung'),
  (N'Windows Server 2008', '2015-01-13', '2020-01-14', N'Vorbelegung'),
  (N'Windows Server 2012', '2018-10-09', '2023-10-10', N'Vorbelegung'),
  (N'Windows Server 2016', '2022-01-11', '2027-01-12', N'Vorbelegung'),
  (N'Windows Server 2019', '2024-01-09', '2029-01-09', N'Vorbelegung'),
  (N'Windows Server 2022', '2026-10-13', '2031-10-14', N'Vorbelegung'),
  (N'Windows Server 2025', '2029-11-13', '2034-11-14', N'Vorbelegung');
