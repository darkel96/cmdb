<#
.SYNOPSIS
    Exportiert die Struktur (keine Daten) der CMDB-Datenbank nach docs/schema.

.DESCRIPTION
    Liest ausschliesslich Systemkataloge (sys.*). Benötigt nur VIEW DEFINITION.
    Zugangsdaten kommen aus den Benutzer-Umgebungsvariablen CMDB_SQL_USER und
    CMDB_SQL_PASSWORD; ohne diese wird Windows-Authentifizierung verwendet.

.EXAMPLE
    .\tools\export-schema.ps1 -Server "tcp:kingstown.aberle-it.loc,1433" -Database CMDB
#>
param(
    [string]$Server = $env:CMDB_SQL_SERVER,
    [string]$Database = $(if ($env:CMDB_SQL_DATABASE) { $env:CMDB_SQL_DATABASE } else { 'CMDB' }),
    [string]$OutDir = (Join-Path $PSScriptRoot '..\docs\schema')
)

$ErrorActionPreference = 'Stop'
if (-not $Server) { throw 'Server fehlt: -Server angeben oder CMDB_SQL_SERVER setzen.' }

function Get-UserEnv([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not $value) { $value = [Environment]::GetEnvironmentVariable($Name, 'User') }
    return $value
}

$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder['Data Source'] = $Server
$builder['Initial Catalog'] = $Database
$builder['Application Name'] = 'cmdb-export-schema'
$builder['Connect Timeout'] = 15
$sqlUser = Get-UserEnv 'CMDB_SQL_USER'
if ($sqlUser) {
    $builder['User ID'] = $sqlUser
    $builder['Password'] = Get-UserEnv 'CMDB_SQL_PASSWORD'
} else {
    $builder['Integrated Security'] = $true
}

$connection = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
$connection.Open()

function Invoke-Query([string]$Sql) {
    $command = $connection.CreateCommand()
    $command.CommandText = $Sql
    $command.CommandTimeout = 120
    $table = New-Object System.Data.DataTable
    (New-Object System.Data.SqlClient.SqlDataAdapter $command).Fill($table) | Out-Null
    return , $table
}

$queries = [ordered]@{
    'objects' = @"
SELECT s.name AS schema_name, o.name AS object_name, o.type_desc, o.create_date, o.modify_date,
       (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id = o.object_id AND p.index_id IN (0, 1)) AS row_count
FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.is_ms_shipped = 0 AND o.type IN ('U','V','P','FN','IF','TF','TR','SN','SO')
ORDER BY o.type_desc, s.name, o.name
"@
    'columns' = @"
SELECT s.name AS schema_name, o.name AS table_name, o.type_desc AS object_type, c.column_id, c.name AS column_name,
       TYPE_NAME(c.user_type_id) AS data_type, c.max_length, c.precision, c.scale,
       c.is_nullable, c.is_identity, c.is_computed, dc.definition AS default_value, cc.definition AS computed_definition
FROM sys.columns c
JOIN sys.objects o ON o.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
LEFT JOIN sys.computed_columns cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id
WHERE o.is_ms_shipped = 0 AND o.type IN ('U','V')
ORDER BY s.name, o.name, c.column_id
"@
    'foreign_keys' = @"
SELECT fk.name AS fk_name, sp.name AS parent_schema, tp.name AS parent_table, cp.name AS parent_column,
       sr.name AS referenced_schema, tr.name AS referenced_table, cr.name AS referenced_column,
       fk.delete_referential_action_desc AS on_delete, fk.update_referential_action_desc AS on_update, fk.is_disabled
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.tables tp ON tp.object_id = fkc.parent_object_id
JOIN sys.schemas sp ON sp.schema_id = tp.schema_id
JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
JOIN sys.tables tr ON tr.object_id = fkc.referenced_object_id
JOIN sys.schemas sr ON sr.schema_id = tr.schema_id
JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id
ORDER BY sp.name, tp.name, fk.name, fkc.constraint_column_id
"@
    'indexes' = @"
SELECT s.name AS schema_name, t.name AS table_name, i.name AS index_name, i.type_desc,
       i.is_primary_key, i.is_unique, i.is_unique_constraint, i.has_filter, i.filter_definition,
       STUFF((SELECT ', ' + c.name + CASE WHEN ic.is_descending_key = 1 THEN ' DESC' ELSE '' END
              FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
              ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, '') AS key_columns,
       STUFF((SELECT ', ' + c.name
              FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
              FOR XML PATH('')), 1, 2, '') AS included_columns
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE i.type > 0 AND t.is_ms_shipped = 0
ORDER BY s.name, t.name, i.index_id
"@
    'check_constraints' = @"
SELECT s.name AS schema_name, t.name AS table_name, cc.name AS constraint_name, cc.definition, cc.is_disabled
FROM sys.check_constraints cc
JOIN sys.tables t ON t.object_id = cc.parent_object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
ORDER BY s.name, t.name, cc.name
"@
    'extended_properties' = @"
SELECT s.name AS schema_name, o.name AS object_name, c.name AS column_name, ep.name AS property_name,
       CAST(ep.value AS nvarchar(4000)) AS value
FROM sys.extended_properties ep
JOIN sys.objects o ON o.object_id = ep.major_id
JOIN sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id AND ep.minor_id > 0
WHERE ep.class = 1 AND o.is_ms_shipped = 0
ORDER BY s.name, o.name, c.column_id
"@
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
foreach ($name in $queries.Keys) {
    $table = Invoke-Query $queries[$name]
    $table | Export-Csv -Path (Join-Path $OutDir "$name.csv") -NoTypeInformation -Encoding UTF8 -Delimiter ';'
    Write-Output ("{0,-20} {1,6} Zeilen" -f $name, $table.Rows.Count)
}

# Code von Views, Prozeduren, Funktionen und Triggern als einzelne .sql-Dateien
$modulesDir = Join-Path $OutDir 'modules'
if (Test-Path $modulesDir) { Remove-Item -Recurse -Force $modulesDir }
New-Item -ItemType Directory -Force $modulesDir | Out-Null
$modules = Invoke-Query @"
SELECT s.name AS schema_name, o.name AS object_name, o.type, m.definition
FROM sys.sql_modules m
JOIN sys.objects o ON o.object_id = m.object_id
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.is_ms_shipped = 0
"@
foreach ($row in $modules.Rows) {
    $fileName = ('{0}.{1}.{2}.sql' -f $row.type.Trim(), $row.schema_name, $row.object_name) -replace '[\\/:*?"<>|]', '_'
    $definition = if ($row.definition -is [DBNull]) { '-- Definition nicht lesbar (verschlüsselt oder keine Berechtigung)' } else { $row.definition }
    Set-Content -Path (Join-Path $modulesDir $fileName) -Value $definition -Encoding UTF8
}
Write-Output ("{0,-20} {1,6} Dateien" -f 'modules', $modules.Rows.Count)

$connection.Close()
