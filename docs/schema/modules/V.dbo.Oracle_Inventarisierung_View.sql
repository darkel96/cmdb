CREATE VIEW dbo.Oracle_Inventarisierung_View AS
SELECT 
    o.ID AS ValueKey,
    'ID: ' + CAST(o.ID AS VARCHAR) + 
    ', Firma: ' + o.Firma + 
    ', DB_Typ: ' + o.DB_Typ AS DisplayValue,
    o.Firma
FROM CMDB.dbo.Oracle_manuell o
WHERE NOT EXISTS (
    SELECT 1
    FROM CMDB.dbo.Vertragsdaten v
    WHERE v.[Oracle System] = 
        'ID: ' + CAST(o.ID AS VARCHAR) + 
        ', Firma: ' + o.Firma + 
        ', DB_Typ: ' + o.DB_Typ
);
