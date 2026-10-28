-- Erweiterte Version mit mehr Checks
CREATE   PROCEDURE sp_CheckDatabaseIntegrity
    @DetailLevel INT = 1  -- 1 = Basic, 2 = Detailed
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @ErrorCount INT = 0;
    
    PRINT '=== Datenbank-Integritätsprüfung ===' 
    PRINT 'Datenbank: ' + DB_NAME();
    PRINT 'Zeitpunkt: ' + CONVERT(VARCHAR, GETDATE(), 120);
    PRINT 'Server: ' + @@SERVERNAME;
    PRINT REPLICATE('-', 50);
    
    -- 1. Ungültige Abhängigkeiten
    IF EXISTS (
        SELECT 1 
        FROM sys.sql_expression_dependencies 
        WHERE referenced_id IS NULL
    )
    BEGIN
        PRINT 'WARNUNG: Ungültige Objektreferenzen gefunden:';
        
        SELECT 
            OBJECT_NAME(referencing_id) AS [Objekt],
            referencing_class_desc AS [Typ],
            referenced_entity_name AS [Fehlendes Objekt]
        FROM sys.sql_expression_dependencies
        WHERE referenced_id IS NULL
        ORDER BY OBJECT_NAME(referencing_id);
        
        SET @ErrorCount = @ErrorCount + @@ROWCOUNT;
    END
    ELSE
    BEGIN
        PRINT '✓ OK: Keine ungültigen Objektreferenzen';
    END
    
    -- 2. Objekte ohne Schema (optional aber empfohlen)
    IF @DetailLevel >= 2
    BEGIN
        PRINT '';
        PRINT 'Prüfe auf Objekte ohne explizites Schema...';
        
        IF EXISTS (
            SELECT 1 FROM sys.objects 
            WHERE schema_id = SCHEMA_ID('dbo') 
            AND type IN ('U', 'V', 'P', 'FN')
            AND name NOT LIKE 'sys%'
        )
        BEGIN
            DECLARE @count INT = (
                SELECT COUNT(*) FROM sys.objects 
                WHERE schema_id = SCHEMA_ID('dbo') 
                AND type IN ('U', 'V', 'P', 'FN')
                AND name NOT LIKE 'sys%'
            );
            PRINT 'Info: ' + CAST(@count AS VARCHAR) + ' Objekte im dbo-Schema gefunden';
        END
    END
    
    -- 3. Verwaiste Stored Procedures (ohne Ausführung in letzter Zeit)
    IF @DetailLevel >= 2
    BEGIN
        PRINT '';
        PRINT 'Prüfe auf möglicherweise ungenutzte Prozeduren...';
        
        SELECT TOP 5
            p.name AS [Prozedur],
            p.create_date AS [Erstellt],
            p.modify_date AS [Letzte Änderung],
            DATEDIFF(day, p.modify_date, GETDATE()) AS [Tage seit Änderung]
        FROM sys.procedures p
        WHERE p.is_ms_shipped = 0
        ORDER BY p.modify_date;
    END
    
    -- Zusammenfassung
    PRINT '';
    PRINT REPLICATE('-', 50);
    IF @ErrorCount = 0
    BEGIN
        PRINT '✅ ERGEBNIS: Datenbank-Integrität ist in Ordnung!';
    END
    ELSE
    BEGIN
        PRINT '⚠️ ERGEBNIS: ' + CAST(@ErrorCount AS VARCHAR) + ' Problem(e) gefunden!';
        PRINT 'Empfehlung: Überprüfen Sie die aufgelisteten Objekte.';
    END
    PRINT '=== Prüfung abgeschlossen ===';
END;
