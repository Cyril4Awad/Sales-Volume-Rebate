using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using DataService.Models;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;


public class CVRComputationDAL
{
    private readonly IConfiguration _config;

    private const string StockPoolSql = @"
SELECT TRF_StockItemID AS StkRecId
FROM CVR_TargetReferences
WHERE TRF_TargetID = @TargetId
  AND TRF_ScopeType IN ('SI', 'S')
  AND TRF_StockItemID IS NOT NULL

UNION

SELECT s.STK_RECID
FROM CVR_TargetReferences tr
INNER JOIN STK04_ItemType it ON it.IT_RecID = tr.TRF_ProductGroupID
INNER JOIN STK04_STKFIL s ON s.STK_ItmType = it.IT_Code
WHERE tr.TRF_TargetID = @TargetId
  AND tr.TRF_ScopeType IN ('PG', 'P')
  AND tr.TRF_ProductGroupID IS NOT NULL";

    private const string StockPoolBatchSql = @"
SELECT TRF_TargetID AS TargetId, TRF_StockItemID AS StkRecId
FROM CVR_TargetReferences
WHERE TRF_TargetID IN @TargetIds
  AND TRF_ScopeType IN ('SI', 'S')
  AND TRF_StockItemID IS NOT NULL

UNION

SELECT tr.TRF_TargetID AS TargetId, s.STK_RECID AS StkRecId
FROM CVR_TargetReferences tr
INNER JOIN STK04_ItemType it ON it.IT_RecID = tr.TRF_ProductGroupID
INNER JOIN STK04_STKFIL s ON s.STK_ItmType = it.IT_Code
WHERE tr.TRF_TargetID IN @TargetIds
  AND tr.TRF_ScopeType IN ('PG', 'P')
  AND tr.TRF_ProductGroupID IS NOT NULL";

    private const string TargetReferencesDisplaySql = @"
SELECT
    tr.TRF_ScopeType                        AS ScopeType,
    COALESCE(s.STK_REF,  it.IT_Code)        AS Code,
    COALESCE(s.STK_DESC, it.IT_DESC)        AS Description
FROM CVR_TargetReferences tr
LEFT JOIN STK04_STKFIL   s  ON s.STK_RECID = tr.TRF_StockItemID
LEFT JOIN STK04_ItemType it  ON it.IT_RecID = tr.TRF_ProductGroupID
WHERE tr.TRF_TargetID = @TargetId";

    private const string TargetReferencesDisplayBatchSql = @"
SELECT
    tr.TRF_TargetID                          AS TargetId,
    tr.TRF_ScopeType                         AS ScopeType,
    COALESCE(s.STK_REF,  it.IT_Code)         AS Code,
    COALESCE(s.STK_DESC, it.IT_DESC)         AS Description
FROM CVR_TargetReferences tr
LEFT JOIN STK04_STKFIL   s  ON s.STK_RECID = tr.TRF_StockItemID
LEFT JOIN STK04_ItemType it  ON it.IT_RecID = tr.TRF_ProductGroupID
WHERE tr.TRF_TargetID IN @TargetIds";

    private const string UnscopedBatchSalesSqlTemplate = @"
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
SET NOCOUNT ON;

CREATE TABLE #SalesLines (
    InvDate        date          NOT NULL,
    QtySal         decimal(18,3) NOT NULL,
    QtyRet         decimal(18,3) NOT NULL,
    NetSalUSD      decimal(18,3) NOT NULL,
    NetRetUSD      decimal(18,3) NOT NULL,
    NetSalLBP      decimal(18,3) NOT NULL,
    NetRetLBP      decimal(18,3) NOT NULL,
    SystemCurrency varchar(3)    NOT NULL
);

INSERT INTO #SalesLines (
    InvDate, QtySal, QtyRet, NetSalUSD, NetRetUSD, NetSalLBP, NetRetLBP, SystemCurrency)
SELECT
    CAST(h.INVH_DATE AS date)                                                        AS InvDate,
    d.INVD_QTY * CASE WHEN d.INVD_STATUS = 'S' THEN 1 ELSE 0 END                    AS QtySal,
    d.INVD_QTY * CASE WHEN d.INVD_STATUS = 'X' THEN 1 ELSE 0 END                    AS QtyRet,
    amounts.BaseAmount * CASE WHEN d.INVD_STATUS = 'S' THEN 1 ELSE 0 END            AS NetSalUSD,
    -(amounts.BaseAmount * CASE WHEN d.INVD_STATUS = 'X' THEN 1 ELSE 0 END)         AS NetRetUSD,
    CASE WHEN d.INVD_STATUS = 'S' THEN amounts.BaseAmount * h.INVH_RATE ELSE 0 END  AS NetSalLBP,
    CASE WHEN d.INVD_STATUS = 'X' THEN -(amounts.BaseAmount * h.INVH_RATE) ELSE 0 END AS NetRetLBP,
    h.INVH_CURR                                                                      AS SystemCurrency
FROM dbo.POS_SALEINVHEAD h
INNER JOIN dbo.POS_SALEINVDET d
    ON d.INVD_LOC = h.INVH_LOC
   AND d.INVD_HEADID = h.INVH_RECID
LEFT JOIN (
    SELECT
        OP_Loc,
        CASE WHEN OP_OPCurr = 'FC' AND ISNULL(OP_LCBasedOnCC, 'N') = 'Y' THEN 'Y' ELSE 'N' END AS OP_ReadFromFC
    FROM dbo.STK04_OPParam
) op ON d.INVD_LOC = op.OP_Loc
CROSS APPLY (
    SELECT
        CASE WHEN ISNULL(op.OP_ReadFromFC, 'N') = 'Y' THEN d.INVD_NETFC     ELSE d.INVD_NET     END AS invd_net,
        CASE WHEN ISNULL(op.OP_ReadFromFC, 'N') = 'Y' THEN d.INVD_VATVALFC  ELSE d.INVD_VATVAL  END AS invd_vatval,
        CASE WHEN ISNULL(op.OP_ReadFromFC, 'N') = 'Y' THEN d.INVD_DISCVALFC ELSE d.INVD_DISCVAL END AS invd_discval
) line
CROSS APPLY (
    SELECT
        (CASE WHEN h.INVH_CURR = 'LBP' THEN line.invd_net / h.INVH_RATE ELSE line.invd_net END
         + CASE WHEN h.INVH_VATTYPE = 'A'
             THEN ISNULL(CASE WHEN h.INVH_CURR = 'LBP'
                              THEN line.invd_vatval / h.INVH_VATLCRate
                              ELSE line.invd_vatval END, 0)
             ELSE 0 END
         - ISNULL(CASE WHEN h.INVH_CURR = 'LBP'
                       THEN line.invd_discval / h.INVH_RATE
                       ELSE line.invd_discval END, 0)) AS BaseAmount
) amounts
WHERE h.INVH_DOCTYP1 IN ('IN', 'CN')
  AND h.INVH_CLIENTSUP IN @ClientIds
  AND CAST(h.INVH_DATE AS date) >= @OverallFromDate AND CAST(h.INVH_DATE AS date) < @OverallToDate;

{0}

DROP TABLE #SalesLines;";

    private const string SalesAllCurrenciesSql = @"
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT
    ISNULL(SUM(NetSalUSD), 0) - ISNULL(SUM(NetRetUSD), 0) AS SalesAmountUSD,
    ISNULL(SUM(NetSalLBP), 0) - ISNULL(SUM(NetRetLBP), 0) AS SalesAmountLBP,
    ISNULL(SUM(QtySal),   0) - ISNULL(SUM(QtyRet),   0)   AS SalesQuantity,
    ISNULL(MAX(SystemCurrency), 'USD')                     AS SystemCurrency
FROM (
    SELECT
        invd_qty * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS QtySal,
        invd_qty * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END AS QtyRet,
        INVH_CURR AS SystemCurrency,

        (CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
         + CASE WHEN invh_vattype = 'A'
             THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                              THEN INVD_VATVAL / INVH_VATLCRate
                              ELSE ISNULL(invd_vatval, 0) END, 0)
             ELSE 0 END
         - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                       THEN INVD_DISCVAL / INVH_RATE
                       ELSE INVD_DISCVAL END, 0))
         * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS NetSalUSD,

        -(( CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
           + CASE WHEN invh_vattype = 'A'
               THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                                THEN ISNULL(invd_vatval,0) / INVH_VATLCRate
                                ELSE ISNULL(invd_vatval,0) END, 0)
               ELSE 0 END
           - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                         THEN INVD_DISCVAL / INVH_RATE
                         ELSE INVD_DISCVAL END, 0))
          * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END) AS NetRetUSD,

        (CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
         + CASE WHEN invh_vattype = 'A'
             THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                              THEN INVD_VATVAL / INVH_VATLCRate
                              ELSE ISNULL(invd_vatval, 0) END, 0)
             ELSE 0 END
         - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                       THEN INVD_DISCVAL / INVH_RATE
                       ELSE INVD_DISCVAL END, 0))
        * INVH_RATE
        * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS NetSalLBP,

        -(( CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
           + CASE WHEN invh_vattype = 'A'
               THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                                THEN ISNULL(invd_vatval,0) / INVH_VATLCRate
                                ELSE ISNULL(invd_vatval,0) END, 0)
               ELSE 0 END
           - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                         THEN INVD_DISCVAL / INVH_RATE
                         ELSE INVD_DISCVAL END, 0))
          * INVH_RATE
          * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END) AS NetRetLBP

    FROM (
        SELECT invd_loc, invd_headid, INVD_Stkid, invd_qty, INVD_Status,
               invd_net, invd_vatval, invd_discval
        FROM V_POS_SALEINVDET_Reporting
    ) POS_SaleInvDet
    INNER JOIN (
        SELECT INVH_Loc, invh_recid, INVH_ClientSup, INVH_DOCTYP1,
               INVH_Date, INVH_Curr, INVH_Rate,
               invh_vattype, INVH_VATLCRate, INVH_CURRFC
        FROM POS_SALEINVHEAD
    ) POS_SaleInvHead ON INVH_Loc = invd_loc AND invh_recid = invd_headid
    INNER JOIN stk04_Clients ON cl_Recid = INVH_ClientSup
    WHERE
        (INVH_DOCTYP1 = 'IN' OR INVH_DOCTYP1 = 'CN')
        AND cl_recid IN @ClientIds
        AND CAST(INVH_Date AS date) >= @FromDate AND CAST(INVH_Date AS date) < @ToDate
) agg";

    private const string PreviousYearSalesAllCurrenciesSql = @"
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT
    ISNULL(SUM(NetSalUSD), 0) - ISNULL(SUM(NetRetUSD), 0) AS SalesAmountUSD,
    ISNULL(SUM(NetSalLBP), 0) - ISNULL(SUM(NetRetLBP), 0) AS SalesAmountLBP,
    ISNULL(SUM(QtySal),   0) - ISNULL(SUM(QtyRet),   0)   AS SalesQuantity,
    ISNULL(MAX(SystemCurrency), 'USD')                     AS SystemCurrency
FROM (
    SELECT
        invd_qty * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS QtySal,
        invd_qty * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END AS QtyRet,
        INVH_CURR AS SystemCurrency,

        (CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
         + CASE WHEN invh_vattype = 'A'
             THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                              THEN INVD_VATVAL / INVH_VATLCRate
                              ELSE ISNULL(invd_vatval, 0) END, 0)
             ELSE 0 END
         - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                       THEN INVD_DISCVAL / INVH_RATE
                       ELSE INVD_DISCVAL END, 0))
         * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS NetSalUSD,

        -(( CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
           + CASE WHEN invh_vattype = 'A'
               THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                                THEN ISNULL(invd_vatval,0) / INVH_VATLCRate
                                ELSE ISNULL(invd_vatval,0) END, 0)
               ELSE 0 END
           - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                         THEN INVD_DISCVAL / INVH_RATE
                         ELSE INVD_DISCVAL END, 0))
          * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END) AS NetRetUSD,

        (CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
         + CASE WHEN invh_vattype = 'A'
             THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                              THEN INVD_VATVAL / INVH_VATLCRate
                              ELSE ISNULL(invd_vatval, 0) END, 0)
             ELSE 0 END
         - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                       THEN INVD_DISCVAL / INVH_RATE
                       ELSE INVD_DISCVAL END, 0))
        * INVH_RATE
        * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS NetSalLBP,

        -(( CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
           + CASE WHEN invh_vattype = 'A'
               THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                                THEN ISNULL(invd_vatval,0) / INVH_VATLCRate
                                ELSE ISNULL(invd_vatval,0) END, 0)
               ELSE 0 END
           - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                         THEN INVD_DISCVAL / INVH_RATE
                         ELSE INVD_DISCVAL END, 0))
          * INVH_RATE
          * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END) AS NetRetLBP

    FROM (
        SELECT invd_loc, invd_headid, INVD_Stkid, invd_qty, INVD_Status,
               invd_net, invd_vatval, invd_discval
        FROM V_POS_SALEINVDET_Reporting
    ) POS_SaleInvDet
    INNER JOIN (
        SELECT INVH_Loc, invh_recid, INVH_ClientSup, INVH_DOCTYP1,
               INVH_Date, INVH_Curr, INVH_Rate,
               invh_vattype, INVH_VATLCRate, INVH_CURRFC
        FROM POS_SALEINVHEAD
    ) POS_SaleInvHead ON INVH_Loc = invd_loc AND invh_recid = invd_headid
    INNER JOIN stk04_Clients ON cl_Recid = INVH_ClientSup
    WHERE
        (INVH_DOCTYP1 = 'IN' OR INVH_DOCTYP1 = 'CN')
        AND cl_recid IN @ClientIds
        AND CAST(INVH_Date AS date) >= @PrevFromDate AND CAST(INVH_Date AS date) < @PrevToDate
) agg";

    private const string SalesAllCurrenciesByClientSql = @"
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT
    ClientId,
    ISNULL(SUM(NetSalUSD), 0) - ISNULL(SUM(NetRetUSD), 0) AS SalesAmountUSD,
    ISNULL(SUM(NetSalLBP), 0) - ISNULL(SUM(NetRetLBP), 0) AS SalesAmountLBP,
    ISNULL(SUM(QtySal),   0) - ISNULL(SUM(QtyRet),   0)   AS SalesQuantity,
    ISNULL(MAX(SystemCurrency), 'USD')                     AS SystemCurrency
FROM (
    SELECT
        INVH_ClientSup AS ClientId,
        invd_qty * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS QtySal,
        invd_qty * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END AS QtyRet,
        INVH_CURR AS SystemCurrency,

        (CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
         + CASE WHEN invh_vattype = 'A'
             THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                              THEN INVD_VATVAL / INVH_VATLCRate
                              ELSE ISNULL(invd_vatval, 0) END, 0)
             ELSE 0 END
         - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                       THEN INVD_DISCVAL / INVH_RATE
                       ELSE INVD_DISCVAL END, 0))
         * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS NetSalUSD,

        -(( CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
           + CASE WHEN invh_vattype = 'A'
               THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                                THEN ISNULL(invd_vatval,0) / INVH_VATLCRate
                                ELSE ISNULL(invd_vatval,0) END, 0)
               ELSE 0 END
           - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                         THEN INVD_DISCVAL / INVH_RATE
                         ELSE INVD_DISCVAL END, 0))
          * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END) AS NetRetUSD,

        (CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
         + CASE WHEN invh_vattype = 'A'
             THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                              THEN INVD_VATVAL / INVH_VATLCRate
                              ELSE ISNULL(invd_vatval, 0) END, 0)
             ELSE 0 END
         - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                       THEN INVD_DISCVAL / INVH_RATE
                       ELSE INVD_DISCVAL END, 0))
        * INVH_RATE
        * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS NetSalLBP,

        -(( CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
           + CASE WHEN invh_vattype = 'A'
               THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                                THEN ISNULL(invd_vatval,0) / INVH_VATLCRate
                                ELSE ISNULL(invd_vatval,0) END, 0)
               ELSE 0 END
           - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                         THEN INVD_DISCVAL / INVH_RATE
                         ELSE INVD_DISCVAL END, 0))
          * INVH_RATE
          * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END) AS NetRetLBP

    FROM (
        SELECT invd_loc, invd_headid, INVD_Stkid, invd_qty, INVD_Status,
               invd_net, invd_vatval, invd_discval
        FROM V_POS_SALEINVDET_Reporting
    ) POS_SaleInvDet
    INNER JOIN (
        SELECT INVH_Loc, invh_recid, INVH_ClientSup, INVH_DOCTYP1,
               INVH_Date, INVH_Curr, INVH_Rate,
               invh_vattype, INVH_VATLCRate, INVH_CURRFC
        FROM POS_SALEINVHEAD
    ) POS_SaleInvHead ON INVH_Loc = invd_loc AND invh_recid = invd_headid
    INNER JOIN stk04_Clients ON cl_Recid = INVH_ClientSup
    WHERE
        (INVH_DOCTYP1 = 'IN' OR INVH_DOCTYP1 = 'CN')
        AND cl_recid IN @ClientIds
        AND CAST(INVH_Date AS date) >= @FromDate AND CAST(INVH_Date AS date) < @ToDate
) agg
GROUP BY ClientId";

    private const string PreviousYearSalesAllCurrenciesByClientSql = @"
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT
    ClientId,
    ISNULL(SUM(NetSalUSD), 0) - ISNULL(SUM(NetRetUSD), 0) AS SalesAmountUSD,
    ISNULL(SUM(NetSalLBP), 0) - ISNULL(SUM(NetRetLBP), 0) AS SalesAmountLBP,
    ISNULL(SUM(QtySal),   0) - ISNULL(SUM(QtyRet),   0)   AS SalesQuantity,
    ISNULL(MAX(SystemCurrency), 'USD')                     AS SystemCurrency
FROM (
    SELECT
        INVH_ClientSup AS ClientId,
        invd_qty * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS QtySal,
        invd_qty * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END AS QtyRet,
        INVH_CURR AS SystemCurrency,

        (CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
         + CASE WHEN invh_vattype = 'A'
             THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                              THEN INVD_VATVAL / INVH_VATLCRate
                              ELSE ISNULL(invd_vatval, 0) END, 0)
             ELSE 0 END
         - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                       THEN INVD_DISCVAL / INVH_RATE
                       ELSE INVD_DISCVAL END, 0))
         * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS NetSalUSD,

        -(( CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
           + CASE WHEN invh_vattype = 'A'
               THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                                THEN ISNULL(invd_vatval,0) / INVH_VATLCRate
                                ELSE ISNULL(invd_vatval,0) END, 0)
               ELSE 0 END
           - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                         THEN INVD_DISCVAL / INVH_RATE
                         ELSE INVD_DISCVAL END, 0))
          * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END) AS NetRetUSD,

        (CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
         + CASE WHEN invh_vattype = 'A'
             THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                              THEN INVD_VATVAL / INVH_VATLCRate
                              ELSE ISNULL(invd_vatval, 0) END, 0)
             ELSE 0 END
         - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                       THEN INVD_DISCVAL / INVH_RATE
                       ELSE INVD_DISCVAL END, 0))
        * INVH_RATE
        * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS NetSalLBP,

        -(( CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
           + CASE WHEN invh_vattype = 'A'
               THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                                THEN ISNULL(invd_vatval,0) / INVH_VATLCRate
                                ELSE ISNULL(invd_vatval,0) END, 0)
               ELSE 0 END
           - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                         THEN INVD_DISCVAL / INVH_RATE
                         ELSE INVD_DISCVAL END, 0))
          * INVH_RATE
          * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END) AS NetRetLBP

    FROM (
        SELECT invd_loc, invd_headid, INVD_Stkid, invd_qty, INVD_Status,
               invd_net, invd_vatval, invd_discval
        FROM V_POS_SALEINVDET_Reporting
    ) POS_SaleInvDet
    INNER JOIN (
        SELECT INVH_Loc, invh_recid, INVH_ClientSup, INVH_DOCTYP1,
               INVH_Date, INVH_Curr, INVH_Rate,
               invh_vattype, INVH_VATLCRate, INVH_CURRFC
        FROM POS_SALEINVHEAD
    ) POS_SaleInvHead ON INVH_Loc = invd_loc AND invh_recid = invd_headid
    INNER JOIN stk04_Clients ON cl_Recid = INVH_ClientSup
    WHERE
        (INVH_DOCTYP1 = 'IN' OR INVH_DOCTYP1 = 'CN')
        AND cl_recid IN @ClientIds
        AND CAST(INVH_Date AS date) >= @PrevFromDate AND CAST(INVH_Date AS date) < @PrevToDate
) agg
GROUP BY ClientId";

    private const string ItemBreakdownSql = @"
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT * FROM (
    SELECT
        ISNULL(STKFIL.STK_SingleRef1, STKFIL.STK_REF) AS ItemRef,
        STKFIL.stk_desc                                AS ItemDesc,

        SUM(d.INVD_QTY * CASE WHEN d.INVD_STATUS = 'S' THEN 1 ELSE 0 END)
            - SUM(d.INVD_QTY * CASE WHEN d.INVD_STATUS = 'X' THEN 1 ELSE 0 END) AS NetQty,

        SUM(amounts.BaseAmount * CASE WHEN d.INVD_STATUS = 'S' THEN 1 ELSE 0 END) AS NetSalUSD,
        SUM(CASE WHEN d.INVD_STATUS = 'X' THEN -amounts.BaseAmount ELSE 0 END) AS NetRetUSD,
        SUM(CASE WHEN d.INVD_STATUS = 'S' THEN amounts.BaseAmount * h.INVH_RATE ELSE 0 END) AS NetSalLBP,
        SUM(CASE WHEN d.INVD_STATUS = 'X' THEN -(amounts.BaseAmount * h.INVH_RATE) ELSE 0 END) AS NetRetLBP

    FROM dbo.POS_SALEINVHEAD h
    INNER JOIN dbo.POS_SALEINVDET d
        ON d.INVD_LOC = h.INVH_LOC
       AND d.INVD_HEADID = h.INVH_RECID
    LEFT JOIN (
        SELECT
            OP_Loc,
            CASE WHEN OP_OPCurr = 'FC' AND ISNULL(OP_LCBasedOnCC, 'N') = 'Y' THEN 'Y' ELSE 'N' END AS OP_ReadFromFC
        FROM dbo.STK04_OPParam
    ) op ON d.INVD_LOC = op.OP_Loc
    CROSS APPLY (
        SELECT
            CASE WHEN ISNULL(op.OP_ReadFromFC, 'N') = 'Y' THEN d.INVD_NETFC     ELSE d.INVD_NET     END AS invd_net,
            CASE WHEN ISNULL(op.OP_ReadFromFC, 'N') = 'Y' THEN d.INVD_VATVALFC  ELSE d.INVD_VATVAL  END AS invd_vatval,
            CASE WHEN ISNULL(op.OP_ReadFromFC, 'N') = 'Y' THEN d.INVD_DISCVALFC ELSE d.INVD_DISCVAL END AS invd_discval
    ) line
    CROSS APPLY (
        SELECT
            (CASE WHEN h.INVH_CURR = 'LBP' THEN line.invd_net / h.INVH_RATE ELSE line.invd_net END
             + CASE WHEN h.INVH_VATTYPE = 'A'
                 THEN ISNULL(CASE WHEN h.INVH_CURR = 'LBP'
                                  THEN line.invd_vatval / h.INVH_VATLCRate
                                  ELSE line.invd_vatval END, 0)
                 ELSE 0 END
             - ISNULL(CASE WHEN h.INVH_CURR = 'LBP'
                           THEN line.invd_discval / h.INVH_RATE
                           ELSE line.invd_discval END, 0)) AS BaseAmount
    ) amounts
    INNER JOIN (
        SELECT stk_recid, STK_REF, STK_SingleRef1, stk_desc
        FROM STK04_STKFIL
    ) STKFIL ON d.INVD_Stkid = STKFIL.STK_Recid
    WHERE
        h.INVH_DOCTYP1 IN ('IN', 'CN')
        AND h.INVH_CLIENTSUP IN @ClientIds
        AND CAST(h.INVH_DATE AS date) >= @FromDate AND CAST(h.INVH_DATE AS date) < @ToDate
        AND d.INVD_STATUS IN ('S', 'X')
    GROUP BY
        ISNULL(STKFIL.STK_SingleRef1, STKFIL.STK_REF),
        STKFIL.stk_desc
) sub
ORDER BY sub.ItemDesc";

    private static readonly Lazy<string> SalesAllCurrenciesScopedSql =
        new(() => BuildScopedReportingSql(SalesAllCurrenciesSql));
    private static readonly Lazy<string> PreviousYearSalesAllCurrenciesScopedSql =
        new(() => BuildScopedReportingSql(PreviousYearSalesAllCurrenciesSql));
    private static readonly Lazy<string> SalesAllCurrenciesByClientScopedSql =
        new(() => BuildScopedReportingSql(SalesAllCurrenciesByClientSql));
    private static readonly Lazy<string> PreviousYearSalesAllCurrenciesByClientScopedSql =
        new(() => BuildScopedReportingSql(PreviousYearSalesAllCurrenciesByClientSql));
    private static readonly Lazy<string> ItemBreakdownScopedSql =
        new(() => BuildScopedItemBreakdownSql(ItemBreakdownSql));


    private const string TotalSalesAllCurrenciesSql = @"
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT
    ISNULL(SUM(NetSalUSD), 0) - ISNULL(SUM(NetRetUSD), 0) AS SalesAmountUSD,
    ISNULL(SUM(NetSalLBP), 0) - ISNULL(SUM(NetRetLBP), 0) AS SalesAmountLBP,
    ISNULL(SUM(QtySal),   0) - ISNULL(SUM(QtyRet),   0)   AS SalesQuantity,
    ISNULL(MAX(SystemCurrency), 'USD')                     AS SystemCurrency
FROM (
    SELECT
        invd_qty * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS QtySal,
        invd_qty * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END AS QtyRet,
        INVH_CURR AS SystemCurrency,

        (CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
         + CASE WHEN invh_vattype = 'A'
             THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                              THEN INVD_VATVAL / INVH_VATLCRate
                              ELSE ISNULL(invd_vatval, 0) END, 0)
             ELSE 0 END
         - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                       THEN INVD_DISCVAL / INVH_RATE
                       ELSE INVD_DISCVAL END, 0))
         * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS NetSalUSD,

        -(( CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
           + CASE WHEN invh_vattype = 'A'
               THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                                THEN ISNULL(invd_vatval,0) / INVH_VATLCRate
                                ELSE ISNULL(invd_vatval,0) END, 0)
               ELSE 0 END
           - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                         THEN INVD_DISCVAL / INVH_RATE
                         ELSE INVD_DISCVAL END, 0))
          * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END) AS NetRetUSD,

        (CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
         + CASE WHEN invh_vattype = 'A'
             THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                              THEN INVD_VATVAL / INVH_VATLCRate
                              ELSE ISNULL(invd_vatval, 0) END, 0)
             ELSE 0 END
         - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                       THEN INVD_DISCVAL / INVH_RATE
                       ELSE INVD_DISCVAL END, 0))
        * INVH_RATE
        * CASE WHEN INVD_Status = 'S' THEN 1 ELSE 0 END AS NetSalLBP,

        -(( CASE WHEN INVH_CURR = 'LBP' THEN invd_net / INVH_RATE ELSE invd_net END
           + CASE WHEN invh_vattype = 'A'
               THEN ISNULL(CASE WHEN INVH_CURR = 'LBP'
                                THEN ISNULL(invd_vatval,0) / INVH_VATLCRate
                                ELSE ISNULL(invd_vatval,0) END, 0)
               ELSE 0 END
           - ISNULL(CASE WHEN INVH_CURR = 'LBP'
                         THEN INVD_DISCVAL / INVH_RATE
                         ELSE INVD_DISCVAL END, 0))
          * INVH_RATE
          * CASE WHEN INVD_Status = 'X' THEN 1 ELSE 0 END) AS NetRetLBP

    FROM (
        SELECT invd_loc, invd_headid, INVD_Stkid, invd_qty, INVD_Status,
               invd_net, invd_vatval, invd_discval
        FROM V_POS_SALEINVDET_Reporting
    ) POS_SaleInvDet
    INNER JOIN (
        SELECT INVH_Loc, invh_recid, INVH_ClientSup, INVH_DOCTYP1,
               INVH_Date, INVH_Curr, INVH_Rate,
               invh_vattype, INVH_VATLCRate, INVH_CURRFC
        FROM POS_SALEINVHEAD
    ) POS_SaleInvHead ON INVH_Loc = invd_loc AND invh_recid = invd_headid
    INNER JOIN stk04_Clients ON cl_Recid = INVH_ClientSup
    WHERE
        (INVH_DOCTYP1 = 'IN' OR INVH_DOCTYP1 = 'CN')
        AND cl_recid IN @ClientIds
        AND CAST(INVH_Date AS date) BETWEEN @FromDate AND @ToDate
) agg";

    public CVRComputationDAL(IConfiguration config) => _config = config;

    public async Task ValidateLbpConversionConfigAsync()
    {
        using var cvrCon = CvrCon();
        var appRate = await cvrCon.QueryFirstOrDefaultAsync<int>(
            "SELECT ISNULL(App_Rate, 0) FROM Com_Application WHERE App_Code = 'CVR'");

        var opColumn = appRate switch
        {
            1 => "DR_op1LC",
            2 => "DR_op2LC",
            _ => "DR_op3LC"
        };

        using var stockCon = StockCon();
        var nonStarCount = await stockCon.QueryFirstOrDefaultAsync<int>($@"
            SELECT COUNT(*) FROM Com_DailyRate
            WHERE DR_CurCode = 'USD' AND {opColumn} <> '*'");

        if (nonStarCount > 0)
            throw new InvalidOperationException(
                $"CVRComputationDAL: LBP conversion operator ({opColumn}) is not '*' for " +
                $"{nonStarCount} rows in Com_DailyRate. " +
                "The inline math optimization (amount * INVH_RATE) is no longer valid. " +
                "Restore convert5FC calls or update the optimization.");
    }

    public async Task<string> GetAppCompAsync()
    {
        using var cvrCon = CvrCon();
        return await GetAppCompFromConnectionAsync(cvrCon);
    }

    private static async Task<string> GetAppCompFromConnectionAsync(SqlConnection cvrCon) =>
        (await cvrCon.QueryFirstOrDefaultAsync<string>(
            "SELECT TOP 1 Ac_Comp FROM Com_Appcomp WHERE Ac_Code = 'CVR' ORDER BY Ac_Comp"))
        ?? "01";

    public async Task<TargetSalesMetadata> LoadTargetSalesMetadataAsync(int targetId, string? comp = null)
    {
        using var cvrCon1 = CvrCon();
        using var cvrCon2 = CvrCon();
        using var cvrCon3 = CvrCon();

        var stockIdsTask = cvrCon1.QueryAsync<decimal>(StockPoolSql, new { TargetId = targetId });
        var refsTask = cvrCon2.QueryAsync<CVR_TargetSalesReferenceDto>(
            TargetReferencesDisplaySql, new { TargetId = targetId });
        var compTask = comp != null
            ? Task.FromResult(comp)
            : GetAppCompFromConnectionAsync(cvrCon3);

        await Task.WhenAll(stockIdsTask, refsTask, compTask);

        return new TargetSalesMetadata
        {
            StockIds = stockIdsTask.Result.Distinct().ToList(),
            References = refsTask.Result.ToList(),
            Comp = compTask.Result,
        };
    }

    private async Task<CVR_Target?> LoadTargetAsync(int targetId)
    {
        using var cvrCon = CvrCon();
        return await cvrCon.QueryFirstOrDefaultAsync<CVR_Target>(
            "SELECT * FROM CVR_Targets WHERE TAR_TargetID = @TargetId",
            new { TargetId = targetId });
    }

    private static void ValidateTargetDates(
        CVR_Target target, DateTime? fromDateOverride, DateTime? toDateOverride)
    {
        if (!fromDateOverride.HasValue && !target.TAR_FromDate.HasValue)
            throw new InvalidOperationException("Target is missing FromDate or ToDate.");
        if (!toDateOverride.HasValue && !target.TAR_ToDate.HasValue)
            throw new InvalidOperationException("Target is missing FromDate or ToDate.");
    }

    private SqlConnection CvrCon() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    private SqlConnection StockCon() =>
    new SqlConnection(_config.GetConnectionString("Constr"));

    private static string BuildScopedReportingSql(string sql)
    {
        foreach (var nl in new[] { "\r\n", "\n" })
        {
            var needle = $") POS_SaleInvDet{nl}    INNER JOIN (";
            if (!sql.Contains(needle, StringComparison.Ordinal))
                continue;
            var replacement =
                $") POS_SaleInvDet{nl}    INNER JOIN #StockFilter sf ON POS_SaleInvDet.INVD_Stkid = sf.StkId{nl}    INNER JOIN (";
            return sql.Replace(needle, replacement);
        }

        return sql;
    }

    private static string BuildScopedItemBreakdownSql(string sql)
    {
        foreach (var nl in new[] { "\r\n", "\n" })
        {
            var needle = $") STKFIL ON d.INVD_Stkid = STKFIL.STK_Recid{nl}    WHERE";
            if (!sql.Contains(needle, StringComparison.Ordinal))
                continue;
            var replacement =
                $") STKFIL ON d.INVD_Stkid = STKFIL.STK_Recid{nl}    INNER JOIN #StockFilter sf ON d.INVD_Stkid = sf.StkId{nl}    WHERE";
            return sql.Replace(needle, replacement);
        }

        return sql;
    }

    private static async Task PopulateStockFilterTempAsync(SqlConnection stockCon, IReadOnlyList<long> stockIds)
    {
        await stockCon.ExecuteAsync(@"
IF OBJECT_ID('tempdb..#StockFilter') IS NOT NULL DROP TABLE #StockFilter;
CREATE TABLE #StockFilter (StkId bigint NOT NULL PRIMARY KEY);");

        if (stockIds.Count == 0)
            return;

        await stockCon.ExecuteAsync(
            "INSERT INTO #StockFilter (StkId) VALUES (@StkId)",
            stockIds.Select(id => new { StkId = id }));
    }

    private static async Task PrepareStockConnectionAsync(
        SqlConnection stockCon, bool filterByStock, IReadOnlyList<long> stockIds)
    {
        if (stockCon.State != System.Data.ConnectionState.Open)
            await stockCon.OpenAsync();
        if (filterByStock)
            await PopulateStockFilterTempAsync(stockCon, stockIds);
    }

    public async Task<CVR_TargetSalesDto?> GetTargetSalesAsync(
        List<int> clientIds, int targetId, DateTime? fromDateOverride = null, DateTime? toDateOverride = null)
    {
        if (clientIds == null || clientIds.Count == 0) return null;

        var target = await LoadTargetAsync(targetId);
        if (target == null) return null;

        ValidateTargetDates(target, fromDateOverride, toDateOverride);
        var metadata = await LoadTargetSalesMetadataAsync(targetId);
        return await GetTargetSalesAsync(clientIds, target, metadata, fromDateOverride, toDateOverride);
    }

    public async Task<CVR_TargetSalesDto?> GetTargetSalesAsync(
        List<int> clientIds,
        CVR_Target target,
        TargetSalesMetadata metadata,
        DateTime? fromDateOverride = null,
        DateTime? toDateOverride = null)
    {
        if (clientIds == null || clientIds.Count == 0) return null;

        ValidateTargetDates(target, fromDateOverride, toDateOverride);

        var targetId = (int)target.TAR_TargetID;
        var filterByStock = metadata.FilterByStock;
        var stockFilterIds = metadata.StockIds.Select(x => (long)x).Distinct().ToList();
        var safeClientIds = clientIds.Select(x => (long)x).ToList();

        var fromDate = (fromDateOverride ?? target.TAR_FromDate)!.Value.Date;
        var toDate = (toDateOverride ?? target.TAR_ToDate)!.Value.Date;
        var prevFromDate = fromDate.AddYears(-1);
        var prevToDate = toDate.AddYears(-1);

        var baseParams = new
        {
            ClientIds = safeClientIds,
            FromDate = fromDate,
            ToDate = toDate,
            Comp = metadata.Comp,
        };

        var prevParams = new
        {
            ClientIds = safeClientIds,
            PrevFromDate = prevFromDate,
            PrevToDate = prevToDate,
            Comp = metadata.Comp,
        };

        using var stockCon1 = StockCon();
        using var stockCon2 = StockCon();

        await PrepareStockConnectionAsync(stockCon1, filterByStock, stockFilterIds);
        await PrepareStockConnectionAsync(stockCon2, filterByStock, stockFilterIds);

        var salesSql = filterByStock ? SalesAllCurrenciesScopedSql.Value : SalesAllCurrenciesSql;
        var prevSalesSql = filterByStock
            ? PreviousYearSalesAllCurrenciesScopedSql.Value
            : PreviousYearSalesAllCurrenciesSql;

        var rowTask = stockCon1.QueryFirstAsync<AllCurrenciesSalesRow>(salesSql, baseParams);
        var prevRowTask = stockCon2.QueryFirstAsync<AllCurrenciesSalesRow>(prevSalesSql, prevParams);

        await Task.WhenAll(rowTask, prevRowTask);

        var row = rowTask.Result;
        var prevRow = prevRowTask.Result;

        decimal growthPercentageUSD = 0;
        if (prevRow.SalesAmountUSD != 0)
            growthPercentageUSD = ((row.SalesAmountUSD - prevRow.SalesAmountUSD) / prevRow.SalesAmountUSD) * 100;

        return new CVR_TargetSalesDto
        {
            ClientId = clientIds[0],
            TargetId = targetId,
            FromDate = fromDate,
            ToDate = toDate,
            SalesAmounts = new Dictionary<string, decimal> { ["USD"] = row.SalesAmountUSD, ["LBP"] = row.SalesAmountLBP },
            SalesAmount = row.SalesAmountUSD,
            SalesAmountBase = row.SalesAmountUSD,
            SalesQuantity = row.SalesQuantity,
            SystemCurrency = row.SystemCurrency,
            SalesAmountCurrency = null,
            ReferenceScope = metadata.ReferenceScope,
            References = metadata.References,
            ResolvedStockItemCount = metadata.StockIds.Count,
            FetchedAt = DateTime.UtcNow,
            PreviousYearSalesAmounts = new Dictionary<string, decimal> { ["USD"] = prevRow.SalesAmountUSD, ["LBP"] = prevRow.SalesAmountLBP },
            PreviousYearSalesQuantity = prevRow.SalesQuantity,
            GrowthPercentageUSD = growthPercentageUSD,
            PreviousYearFromDate = prevFromDate,
            PreviousYearToDate = prevToDate,
        };
    }

    public async Task<Dictionary<int, CVR_TargetSalesDto>> GetTargetSalesByClientBatchAsync(
        List<int> clientIds, int targetId, DateTime? fromDateOverride = null, DateTime? toDateOverride = null)
    {
        if (clientIds == null || clientIds.Count == 0)
            return new Dictionary<int, CVR_TargetSalesDto>();

        var target = await LoadTargetAsync(targetId);
        if (target == null) return new Dictionary<int, CVR_TargetSalesDto>();

        ValidateTargetDates(target, fromDateOverride, toDateOverride);
        var metadata = await LoadTargetSalesMetadataAsync(targetId);
        return await GetTargetSalesByClientBatchAsync(clientIds, target, metadata, fromDateOverride, toDateOverride);
    }

    public async Task<Dictionary<int, CVR_TargetSalesDto>> GetTargetSalesByClientBatchAsync(
        List<int> clientIds,
        CVR_Target target,
        TargetSalesMetadata metadata,
        DateTime? fromDateOverride = null,
        DateTime? toDateOverride = null)
    {
        if (clientIds == null || clientIds.Count == 0)
            return new Dictionary<int, CVR_TargetSalesDto>();

        ValidateTargetDates(target, fromDateOverride, toDateOverride);

        var targetId = (int)target.TAR_TargetID;
        var filterByStock = metadata.FilterByStock;
        var stockFilterIds = metadata.StockIds.Select(x => (long)x).Distinct().ToList();
        var safeClientIds = clientIds.Select(x => (long)x).ToList();

        var fromDate = (fromDateOverride ?? target.TAR_FromDate)!.Value.Date;
        var toDate = (toDateOverride ?? target.TAR_ToDate)!.Value.Date;
        var prevFromDate = fromDate.AddYears(-1);
        var prevToDate = toDate.AddYears(-1);

        var baseParams = new
        {
            ClientIds = safeClientIds,
            FromDate = fromDate,
            ToDate = toDate,
            Comp = metadata.Comp,
        };

        var prevParams = new
        {
            ClientIds = safeClientIds,
            PrevFromDate = prevFromDate,
            PrevToDate = prevToDate,
            Comp = metadata.Comp,
        };

        using var stockCon1 = StockCon();
        using var stockCon2 = StockCon();

        await PrepareStockConnectionAsync(stockCon1, filterByStock, stockFilterIds);
        await PrepareStockConnectionAsync(stockCon2, filterByStock, stockFilterIds);

        var salesSql = filterByStock ? SalesAllCurrenciesByClientScopedSql.Value : SalesAllCurrenciesByClientSql;
        var prevSalesSql = filterByStock
            ? PreviousYearSalesAllCurrenciesByClientScopedSql.Value
            : PreviousYearSalesAllCurrenciesByClientSql;

        var currentRowsTask = stockCon1.QueryAsync<AllCurrenciesSalesByClientRow>(salesSql, baseParams);
        var prevRowsTask = stockCon2.QueryAsync<AllCurrenciesSalesByClientRow>(prevSalesSql, prevParams);

        await Task.WhenAll(currentRowsTask, prevRowsTask);

        var currentByClient = currentRowsTask.Result.ToDictionary(r => (int)r.ClientId);
        var prevByClient = prevRowsTask.Result.ToDictionary(r => (int)r.ClientId);

        var activeClientIds = currentByClient.Keys
            .Union(prevByClient.Keys)
            .Where(id => clientIds.Contains(id))
            .ToList();

        var result = new Dictionary<int, CVR_TargetSalesDto>();
        foreach (var clientId in activeClientIds)
        {
            currentByClient.TryGetValue(clientId, out var row);
            prevByClient.TryGetValue(clientId, out var prevRow);
            row ??= new AllCurrenciesSalesByClientRow { ClientId = clientId };
            prevRow ??= new AllCurrenciesSalesByClientRow { ClientId = clientId };

            decimal growthPercentageUSD = 0;
            if (prevRow.SalesAmountUSD != 0)
                growthPercentageUSD = ((row.SalesAmountUSD - prevRow.SalesAmountUSD) / prevRow.SalesAmountUSD) * 100;

            result[clientId] = new CVR_TargetSalesDto
            {
                ClientId = clientId,
                TargetId = targetId,
                FromDate = fromDate,
                ToDate = toDate,
                SalesAmounts = new Dictionary<string, decimal>
                {
                    ["USD"] = row.SalesAmountUSD,
                    ["LBP"] = row.SalesAmountLBP,
                },
                SalesAmount = row.SalesAmountUSD,
                SalesAmountBase = row.SalesAmountUSD,
                SalesQuantity = row.SalesQuantity,
                SystemCurrency = row.SystemCurrency ?? "USD",
                SalesAmountCurrency = null,
                ReferenceScope = metadata.ReferenceScope,
                References = metadata.References,
                ResolvedStockItemCount = metadata.StockIds.Count,
                FetchedAt = DateTime.UtcNow,
                PreviousYearSalesAmounts = new Dictionary<string, decimal>
                {
                    ["USD"] = prevRow.SalesAmountUSD,
                    ["LBP"] = prevRow.SalesAmountLBP,
                },
                PreviousYearSalesQuantity = prevRow.SalesQuantity,
                GrowthPercentageUSD = growthPercentageUSD,
                PreviousYearFromDate = prevFromDate,
                PreviousYearToDate = prevToDate,
            };
        }

        return result;
    }

    public async Task<Dictionary<int, CVR_TargetSalesDto>> GetTargetSalesBatchAsync(
        List<int> clientIds, List<int> targetIds)
    {
        if (clientIds == null || clientIds.Count == 0 || targetIds == null || targetIds.Count == 0)
            return new Dictionary<int, CVR_TargetSalesDto>();

        var distinctTargetIds = targetIds.Distinct().ToList();

        using var cvrCon1 = CvrCon();
        var targets = (await cvrCon1.QueryAsync<CVR_Target>(@"
            SELECT
                TAR_TargetID, TAR_PlanID, TAR_TargetName,
                TAR_FromDate, TAR_ToDate, TAR_RebateValue,
                TAR_RebateValueType, TAR_Currency, TAR_SettlementTypeID,
                TAR_ComputationTypeID, TAR_TargetType,
                ISNULL(TAR_Override, 0) AS TAR_Override,
                TAR_CDStamp, TAR_CUStamp, TAR_MDStamp, TAR_MUStamp
            FROM CVR_Targets WHERE TAR_TargetID IN @TargetIds",
            new { TargetIds = distinctTargetIds })).ToList();

        if (targets.Count == 0)
            return new Dictionary<int, CVR_TargetSalesDto>();

        foreach (var t in targets)
            if (!t.TAR_FromDate.HasValue || !t.TAR_ToDate.HasValue)
                throw new InvalidOperationException("Target is missing FromDate or ToDate.");

        using var cvrCon2 = CvrCon();
        using var cvrCon3 = CvrCon();
        using var cvrCon4 = CvrCon();

        var compTask = GetAppCompFromConnectionAsync(cvrCon2);
        var stockPoolTask = cvrCon3.QueryAsync<StockPoolBatchRow>(
                                StockPoolBatchSql, new { TargetIds = distinctTargetIds });
        var refsTask = cvrCon4.QueryAsync<TargetReferenceBatchRow>(
                                TargetReferencesDisplayBatchSql, new { TargetIds = distinctTargetIds });

        await Task.WhenAll(compTask, stockPoolTask, refsTask);

        var comp = compTask.Result;
        var stockPoolRows = stockPoolTask.Result.ToList();
        var referenceRows = refsTask.Result.ToList();

        var stockIdsByTarget = stockPoolRows
            .GroupBy(r => (int)r.TargetId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.StkRecId).Distinct().ToList());

        var referencesByTarget = referenceRows
            .GroupBy(r => (int)r.TargetId)
            .ToDictionary(g => g.Key, g => g.Select(x => new CVR_TargetSalesReferenceDto
            {
                ScopeType = x.ScopeType ?? string.Empty,
                Code = x.Code ?? string.Empty,
                Description = x.Description ?? string.Empty,
            }).ToList());

        var unscopedTargets = new List<CVR_Target>();
        var scopedTargetIds = new List<int>();

        foreach (var target in targets)
        {
            var tid = (int)target.TAR_TargetID;
            if (stockIdsByTarget.TryGetValue(tid, out var ids) && ids.Count > 0)
                scopedTargetIds.Add(tid);
            else
                unscopedTargets.Add(target);
        }

        var unscopedTask = unscopedTargets.Count > 0
            ? GetUnscopedTargetSalesBatchAsync(
                clientIds, unscopedTargets, referencesByTarget, stockIdsByTarget, comp)
            : Task.FromResult(new List<CVR_TargetSalesDto>());

        var scopedTask = scopedTargetIds.Count > 0
            ? GetScopedTargetSalesBatchAsync(clientIds, scopedTargetIds)
            : Task.FromResult(Array.Empty<CVR_TargetSalesDto>());

        await Task.WhenAll(unscopedTask, scopedTask);

        var results = new Dictionary<int, CVR_TargetSalesDto>();
        foreach (var dto in unscopedTask.Result) results[dto.TargetId] = dto;
        foreach (var dto in scopedTask.Result) results[dto.TargetId] = dto;

        return results;
    }

    private async Task<CVR_TargetSalesDto[]> GetScopedTargetSalesBatchAsync(
        List<int> clientIds, List<int> scopedTargetIds)
    {
        using var semaphore = new SemaphoreSlim(4);
        var tasks = scopedTargetIds.Select(async targetId =>
        {
            await semaphore.WaitAsync();
            try { return await GetTargetSalesAsync(clientIds, targetId); }
            finally { semaphore.Release(); }
        });

        var results = await Task.WhenAll(tasks);
        return results.Where(d => d != null).Select(d => d!).ToArray();
    }

    private async Task<List<CVR_TargetSalesDto>> GetUnscopedTargetSalesBatchAsync(
        List<int> clientIds,
        List<CVR_Target> targets,
        Dictionary<int, List<CVR_TargetSalesReferenceDto>> referencesByTarget,
        Dictionary<int, List<decimal>> stockIdsByTarget,
        string comp)
    {
        var dateRanges = targets.Select(t =>
        {
            var fromDate = t.TAR_FromDate!.Value.Date;
            var toDate = t.TAR_ToDate!.Value.Date;
            return new TargetDateRange
            {
                TargetId = (int)t.TAR_TargetID,
                FromDate = fromDate,
                ToDate = toDate,
                PrevFromDate = fromDate.AddYears(-1),
                PrevToDate = toDate.AddYears(-1),
            };
        }).ToList();

        var overallFromDate = dateRanges.Min(r => r.PrevFromDate);
        var overallToDate = dateRanges.Max(r => r.ToDate);
        var aggregateSql = BuildUnscopedBatchAggregateSelect(dateRanges);
        var sql = string.Format(CultureInfo.InvariantCulture, UnscopedBatchSalesSqlTemplate, aggregateSql);
        var safeClientIds = clientIds.Select(x => (long)x).ToList();

        using var stockCon = StockCon();
        var rowDict = await QueryUnscopedBatchAggregateRowAsync(stockCon, sql, new
        {
            ClientIds = safeClientIds,
            OverallFromDate = overallFromDate,
            OverallToDate = overallToDate,
            Comp = comp,
        });

        var rows = dateRanges.Select(range =>
        {
            var id = range.TargetId;
            return new UnscopedBatchSalesRow
            {
                TargetId = id,
                SalesAmountUSD = ReadAggregateDecimal(rowDict, $"T{id}_SalesAmountUSD"),
                SalesAmountLBP = ReadAggregateDecimal(rowDict, $"T{id}_SalesAmountLBP"),
                SalesQuantity = ReadAggregateDecimal(rowDict, $"T{id}_SalesQuantity"),
                PrevSalesAmountUSD = ReadAggregateDecimal(rowDict, $"T{id}_PrevSalesAmountUSD"),
                PrevSalesAmountLBP = ReadAggregateDecimal(rowDict, $"T{id}_PrevSalesAmountLBP"),
                PrevSalesQuantity = ReadAggregateDecimal(rowDict, $"T{id}_PrevSalesQuantity"),
                SystemCurrency = TryGetRowValue(rowDict, "SystemCurrency", out var curVal)
                    ? curVal?.ToString() ?? "USD" : "USD",
            };
        }).ToList();

        var rowByTargetId = rows.ToDictionary(r => r.TargetId);

        return targets.Select(target =>
        {
            var targetId = (int)target.TAR_TargetID;
            rowByTargetId.TryGetValue(targetId, out var row);
            row ??= new UnscopedBatchSalesRow { TargetId = targetId };

            var prevFromDate = target.TAR_FromDate!.Value.Date.AddYears(-1);
            var prevToDate = target.TAR_ToDate!.Value.Date.AddYears(-1);

            decimal growthPercentageUSD = 0;
            if (row.PrevSalesAmountUSD != 0)
                growthPercentageUSD = ((row.SalesAmountUSD - row.PrevSalesAmountUSD) / row.PrevSalesAmountUSD) * 100;

            referencesByTarget.TryGetValue(targetId, out var references);
            stockIdsByTarget.TryGetValue(targetId, out var stockIds);

            return new CVR_TargetSalesDto
            {
                ClientId = clientIds[0],
                TargetId = targetId,
                FromDate = target.TAR_FromDate,
                ToDate = target.TAR_ToDate,
                SalesAmounts = new Dictionary<string, decimal> { ["USD"] = row.SalesAmountUSD, ["LBP"] = row.SalesAmountLBP },
                SalesAmount = row.SalesAmountUSD,
                SalesAmountBase = row.SalesAmountUSD,
                SalesQuantity = row.SalesQuantity,
                SystemCurrency = row.SystemCurrency,
                SalesAmountCurrency = null,
                ReferenceScope = "all",
                References = references ?? new List<CVR_TargetSalesReferenceDto>(),
                ResolvedStockItemCount = stockIds?.Count ?? 0,
                FetchedAt = DateTime.UtcNow,
                PreviousYearSalesAmounts = new Dictionary<string, decimal> { ["USD"] = row.PrevSalesAmountUSD, ["LBP"] = row.PrevSalesAmountLBP },
                PreviousYearSalesQuantity = row.PrevSalesQuantity,
                GrowthPercentageUSD = growthPercentageUSD,
                PreviousYearFromDate = prevFromDate,
                PreviousYearToDate = prevToDate,
            };
        }).ToList();
    }

    private static string BuildUnscopedBatchAggregateSelect(IReadOnlyList<TargetDateRange> ranges)
    {
        var parts = new List<string>();
        foreach (var r in ranges)
        {
            var id = r.TargetId;
            var from = r.FromDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var to = r.ToDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var pFrom = r.PrevFromDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var pTo = r.PrevToDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{from}' AND InvDate < '{to}'
        THEN NetSalUSD - NetRetUSD ELSE 0 END), 0) AS T{id}_SalesAmountUSD");
            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{from}' AND InvDate < '{to}'
        THEN NetSalLBP - NetRetLBP ELSE 0 END), 0) AS T{id}_SalesAmountLBP");
            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{from}' AND InvDate < '{to}'
        THEN QtySal - QtyRet ELSE 0 END), 0) AS T{id}_SalesQuantity");
            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{pFrom}' AND InvDate < '{pTo}'
        THEN NetSalUSD - NetRetUSD ELSE 0 END), 0) AS T{id}_PrevSalesAmountUSD");
            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{pFrom}' AND InvDate < '{pTo}'
        THEN NetSalLBP - NetRetLBP ELSE 0 END), 0) AS T{id}_PrevSalesAmountLBP");
            parts.Add($@"ISNULL(SUM(CASE WHEN InvDate >= '{pFrom}' AND InvDate < '{pTo}'
        THEN QtySal - QtyRet ELSE 0 END), 0) AS T{id}_PrevSalesQuantity");
        }

        parts.Add("ISNULL(MAX(SystemCurrency), 'USD') AS SystemCurrency");
        return "SELECT\n    " + string.Join(",\n    ", parts) + "\nFROM #SalesLines;";
    }

    private static async Task<IDictionary<string, object>> QueryUnscopedBatchAggregateRowAsync(
        SqlConnection stockCon, string sql, object param)
    {
        using var grid = await stockCon.QueryMultipleAsync(sql, param);

        while (!grid.IsConsumed)
        {
            var batchRows = (await grid.ReadAsync<object>()).ToList();
            if (batchRows.Count == 0) continue;
            return ToRowDictionary(batchRows[0]);
        }

        return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
    }

    private static IDictionary<string, object> ToRowDictionary(object? row)
    {
        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        if (row == null) return result;

        if (row is IDictionary<string, object> dict)
        {
            foreach (var kvp in dict) result[kvp.Key] = kvp.Value ?? 0;
            return result;
        }

        if (row is System.Collections.IDictionary legacy)
        {
            foreach (System.Collections.DictionaryEntry entry in legacy)
                if (entry.Key is string key) result[key] = entry.Value ?? 0;
            return result;
        }

        return result;
    }

    private static decimal ReadAggregateDecimal(IDictionary<string, object> row, string key)
    {
        if (!TryGetRowValue(row, key, out var value)) return 0m;

        return value switch
        {
            decimal dec => dec,
            double dbl => Convert.ToDecimal(dbl, CultureInfo.InvariantCulture),
            float flt => Convert.ToDecimal(flt, CultureInfo.InvariantCulture),
            int i => i,
            long l => l,
            _ => Convert.ToDecimal(value, CultureInfo.InvariantCulture),
        };
    }

    private static bool TryGetRowValue(IDictionary<string, object> row, string key, out object? value)
    {
        if (row.TryGetValue(key, out value) && value is not null and not DBNull)
            return true;

        var match = row.Keys.FirstOrDefault(k =>
            string.Equals(k, key, StringComparison.OrdinalIgnoreCase));
        if (match != null && row.TryGetValue(match, out value) && value is not null and not DBNull)
            return true;

        value = null;
        return false;
    }

    public async Task<CVR_TargetItemsResponseDto?> GetTargetItemsAsync(List<int> clientIds, int targetId)
    {
        if (clientIds == null || clientIds.Count == 0) return null;

        using var cvrCon1 = CvrCon();
        var target = await cvrCon1.QueryFirstOrDefaultAsync<CVR_Target>(
            "SELECT * FROM CVR_Targets WHERE TAR_TargetID = @TargetId",
            new { TargetId = targetId });

        if (target == null) return null;
        if (!target.TAR_FromDate.HasValue || !target.TAR_ToDate.HasValue)
            throw new InvalidOperationException("Target is missing FromDate or ToDate.");

        using var cvrCon2 = CvrCon();
        using var cvrCon3 = CvrCon();

        var compTask = GetAppCompFromConnectionAsync(cvrCon2);
        var stockIdsTask = cvrCon3.QueryAsync<decimal>(StockPoolSql, new { TargetId = targetId });

        await Task.WhenAll(compTask, stockIdsTask);

        var comp = compTask.Result;
        var stockIds = stockIdsTask.Result.Distinct().ToList();

        var filterByStock = stockIds.Count > 0;
        var referenceScope = filterByStock ? "scoped" : "all";
        var stockFilterIds = stockIds.Select(x => (long)x).Distinct().ToList();
        var safeClientIds = clientIds.Select(x => (long)x).ToList();

        var baseParams = new
        {
            ClientIds = safeClientIds,
            FromDate = target.TAR_FromDate.Value.Date,
            ToDate = target.TAR_ToDate.Value.Date,
            Comp = comp,
        };

        using var stockCon = StockCon();
        await PrepareStockConnectionAsync(stockCon, filterByStock, stockFilterIds);
        var itemsSql = filterByStock ? ItemBreakdownScopedSql.Value : ItemBreakdownSql;
        var rows = (await stockCon.QueryAsync<TargetItemRow>(itemsSql, baseParams)).ToList();

        return new CVR_TargetItemsResponseDto
        {
            ClientId = clientIds[0],
            TargetId = targetId,
            ReferenceScope = referenceScope,
            Currencies = new List<string> { "LBP", "USD" },
            Items = rows
                
                .Select(r => new CVR_TargetItemDto
                {
                    ItemRef = r.ItemRef ?? string.Empty,
                    ItemDesc = r.ItemDesc ?? string.Empty,
                    NetQty = r.NetQty,
                    NetSal = r.NetSalUSD,
                    NetRet = r.NetRetUSD,
                    NetSalUSD = r.NetSalUSD,
                    NetRetUSD = r.NetRetUSD,
                    NetSalLBP = r.NetSalLBP,
                    NetRetLBP = r.NetRetLBP,
                    Currency = "USD",
                }).ToList(),
        };
    }

    // -------------------------------------------------------------------------
    // Plan-editor simulation: sales for draft target date ranges
    // -------------------------------------------------------------------------
    public async Task<Dictionary<string, CVR_TargetSalesDto>> GetTargetSalesPreviewBatchAsync(
        List<int> clientIds, List<CVR_SalesBatchPreviewTarget> targets)
    {
        var result = new Dictionary<string, CVR_TargetSalesDto>(StringComparer.Ordinal);
        if (clientIds == null || clientIds.Count == 0 || targets == null || targets.Count == 0)
            return result;

        using var semaphore = new SemaphoreSlim(4);
        var tasks = targets.Select(async entry =>
        {
            await semaphore.WaitAsync();
            try
            {
                var key = !string.IsNullOrWhiteSpace(entry.LocalKey)
                    ? entry.LocalKey.Trim()
                    : entry.TargetId?.ToString() ?? string.Empty;
                if (string.IsNullOrEmpty(key)) return (Key: key, Dto: (CVR_TargetSalesDto?)null);

                CVR_TargetSalesDto? dto;
                if (entry.TargetId.HasValue && entry.TargetId.Value > 0)
                {
                    dto = await GetTargetSalesAsync(
                        clientIds,
                        entry.TargetId.Value,
                        entry.FromDate,
                        entry.ToDate);
                }
                else
                {
                    dto = await GetUnscopedPreviewSalesAsync(clientIds, entry.FromDate, entry.ToDate);
                }

                return (Key: key, Dto: dto);
            }
            finally
            {
                semaphore.Release();
            }
        });

        foreach (var item in await Task.WhenAll(tasks))
        {
            if (!string.IsNullOrEmpty(item.Key) && item.Dto != null)
                result[item.Key] = item.Dto;
        }

        return result;
    }

    private async Task<CVR_TargetSalesDto> GetUnscopedPreviewSalesAsync(
        List<int> clientIds, DateTime fromDate, DateTime toDate)
    {
        using var cvrCon = CvrCon();
        var comp = await GetAppCompFromConnectionAsync(cvrCon);

        var safeClientIds = clientIds.Select(x => (long)x).ToList();
        var from = fromDate.Date;
        var to = toDate.Date;
        var prevFromDate = from.AddYears(-1);
        var prevToDate = to.AddYears(-1);

        var baseParams = new
        {
            ClientIds = safeClientIds,
            FromDate = from,
            ToDate = to,
            Comp = comp,
        };

        var prevParams = new
        {
            ClientIds = safeClientIds,
            PrevFromDate = prevFromDate,
            PrevToDate = prevToDate,
            Comp = comp,
        };

        using var stockCon1 = StockCon();
        using var stockCon2 = StockCon();

        var rowTask = stockCon1.QueryFirstAsync<AllCurrenciesSalesRow>(SalesAllCurrenciesSql, baseParams);
        var prevRowTask = stockCon2.QueryFirstAsync<AllCurrenciesSalesRow>(PreviousYearSalesAllCurrenciesSql, prevParams);

        await Task.WhenAll(rowTask, prevRowTask);

        var row = rowTask.Result;
        var prevRow = prevRowTask.Result;

        decimal growthPercentageUSD = 0;
        if (prevRow.SalesAmountUSD != 0)
            growthPercentageUSD = ((row.SalesAmountUSD - prevRow.SalesAmountUSD) / prevRow.SalesAmountUSD) * 100;

        return new CVR_TargetSalesDto
        {
            ClientId = clientIds[0],
            TargetId = 0,
            FromDate = from,
            ToDate = to,
            SalesAmounts = new Dictionary<string, decimal> { ["USD"] = row.SalesAmountUSD, ["LBP"] = row.SalesAmountLBP },
            SalesAmount = row.SalesAmountUSD,
            SalesAmountBase = row.SalesAmountUSD,
            SalesQuantity = row.SalesQuantity,
            SystemCurrency = row.SystemCurrency,
            SalesAmountCurrency = null,
            ReferenceScope = "all",
            References = new List<CVR_TargetSalesReferenceDto>(),
            ResolvedStockItemCount = 0,
            FetchedAt = DateTime.UtcNow,
            PreviousYearSalesAmounts = new Dictionary<string, decimal> { ["USD"] = prevRow.SalesAmountUSD, ["LBP"] = prevRow.SalesAmountLBP },
            PreviousYearSalesQuantity = prevRow.SalesQuantity,
            GrowthPercentageUSD = growthPercentageUSD,
            PreviousYearFromDate = prevFromDate,
            PreviousYearToDate = prevToDate,
        };
    }

    // -------------------------------------------------------------------------
    // SESSION 8 FIX: accepts List<int> clientIds instead of single int clientId
    // -------------------------------------------------------------------------
    public async Task<CVR_TotalSalesDto> GetTotalClientSalesAsync(
        List<int> clientIds, DateTime fromDate, DateTime toDate)
    {
        using var cvrCon = CvrCon();
        var comp = await GetAppCompFromConnectionAsync(cvrCon);

        var safeClientIds = clientIds.Select(x => (long)x).ToList();

        var baseParams = new
        {
            ClientIds = safeClientIds,
            FromDate = fromDate.Date,
            ToDate = toDate.Date,
            Comp = comp,
        };

        using var stockCon = StockCon();
        var row = await stockCon.QueryFirstAsync<AllCurrenciesSalesRow>(
            TotalSalesAllCurrenciesSql, baseParams);

        return new CVR_TotalSalesDto
        {
            ClientId = clientIds[0],
            FromDate = fromDate,
            ToDate = toDate,
            SalesAmountUSD = row.SalesAmountUSD,
            SalesAmountLBP = row.SalesAmountLBP,
            SalesQuantity = row.SalesQuantity,
            SystemCurrency = row.SystemCurrency,
        };
    }

    private sealed class AllCurrenciesSalesRow
    {
        public decimal SalesAmountUSD { get; set; }
        public decimal SalesAmountLBP { get; set; }
        public decimal SalesQuantity { get; set; }
        public string SystemCurrency { get; set; } = "USD";
    }

    private sealed class AllCurrenciesSalesByClientRow
    {
        public long ClientId { get; set; }
        public decimal SalesAmountUSD { get; set; }
        public decimal SalesAmountLBP { get; set; }
        public decimal SalesQuantity { get; set; }
        public string? SystemCurrency { get; set; }
    }

    private sealed class TargetItemRow
    {
        public string? ItemRef { get; set; }
        public string? ItemDesc { get; set; }
        public decimal NetQty { get; set; }
        public decimal NetSalUSD { get; set; }
        public decimal NetRetUSD { get; set; }
        public decimal NetSalLBP { get; set; }
        public decimal NetRetLBP { get; set; }
        public string? Currency { get; set; }
    }

    private sealed class StockPoolBatchRow
    {
        public decimal TargetId { get; set; }
        public decimal StkRecId { get; set; }
    }

    private sealed class TargetReferenceBatchRow
    {
        public decimal TargetId { get; set; }
        public string? ScopeType { get; set; }
        public string? Code { get; set; }
        public string? Description { get; set; }
    }

    private sealed class TargetDateRange
    {
        public int TargetId { get; set; }
        public DateTime FromDate { get; set; }
        public DateTime ToDate { get; set; }
        public DateTime PrevFromDate { get; set; }
        public DateTime PrevToDate { get; set; }
    }

    private sealed class UnscopedBatchSalesRow
    {
        public int TargetId { get; set; }
        public decimal SalesAmountUSD { get; set; }
        public decimal SalesAmountLBP { get; set; }
        public decimal SalesQuantity { get; set; }
        public decimal PrevSalesAmountUSD { get; set; }
        public decimal PrevSalesAmountLBP { get; set; }
        public decimal PrevSalesQuantity { get; set; }
        public string SystemCurrency { get; set; } = "USD";
    }
}