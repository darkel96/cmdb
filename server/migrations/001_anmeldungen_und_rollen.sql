-- 001: Anmelde-Protokoll und Rollen mit Rechten je Bereich (Schema cmdb, dbo bleibt unberührt)

CREATE TABLE cmdb.LoginLog (
  Id          bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_LoginLog PRIMARY KEY,
  At          datetime2(0)  NOT NULL CONSTRAINT DF_LoginLog_At DEFAULT SYSUTCDATETIME(),
  Username    nvarchar(64)  NOT NULL,
  DisplayName nvarchar(256) NULL,
  Success     bit           NOT NULL,
  Reason      nvarchar(200) NULL,
  Address     nvarchar(64)  NULL
);
CREATE INDEX IX_LoginLog_At ON cmdb.LoginLog (At DESC);

CREATE TABLE cmdb.Role (
  Id          int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Role PRIMARY KEY,
  Name        nvarchar(100) NOT NULL CONSTRAINT UQ_Role_Name UNIQUE,
  Description nvarchar(500) NULL,
  -- Grundrolle: gilt für alle angemeldeten Personen, kann nicht gelöscht werden
  IsDefault   bit NOT NULL CONSTRAINT DF_Role_IsDefault DEFAULT 0,
  ChangedBy   nvarchar(64) NULL,
  ChangedAt   datetime2(0) NOT NULL CONSTRAINT DF_Role_ChangedAt DEFAULT SYSUTCDATETIME()
);

CREATE TABLE cmdb.RolePermission (
  RoleId    int          NOT NULL CONSTRAINT FK_RolePermission_Role REFERENCES cmdb.Role (Id) ON DELETE CASCADE,
  Area      nvarchar(50) NOT NULL,
  CanRead   bit NOT NULL CONSTRAINT DF_RolePermission_Read DEFAULT 0,
  CanCreate bit NOT NULL CONSTRAINT DF_RolePermission_Create DEFAULT 0,
  CanEdit   bit NOT NULL CONSTRAINT DF_RolePermission_Edit DEFAULT 0,
  CanDelete bit NOT NULL CONSTRAINT DF_RolePermission_Delete DEFAULT 0,
  CONSTRAINT PK_RolePermission PRIMARY KEY (RoleId, Area)
);

-- Mitglieder: Person (Anmeldename) oder AD-Gruppe (CN), jeweils klein geschrieben
CREATE TABLE cmdb.RoleMember (
  RoleId int           NOT NULL CONSTRAINT FK_RoleMember_Role REFERENCES cmdb.Role (Id) ON DELETE CASCADE,
  Kind   varchar(10)   NOT NULL CONSTRAINT CK_RoleMember_Kind CHECK (Kind IN ('user', 'group')),
  Name   nvarchar(256) NOT NULL,
  CONSTRAINT PK_RoleMember PRIMARY KEY (RoleId, Kind, Name)
);

-- Grundrolle: wie bisher dürfen alle Angemeldeten alles lesen (Rechte je Bereich legt der Dienst beim Start an)
INSERT INTO cmdb.Role (Name, Description, IsDefault, ChangedBy) VALUES (N'Alle Angemeldeten', N'Gilt für jede angemeldete Person', 1, N'migration');
