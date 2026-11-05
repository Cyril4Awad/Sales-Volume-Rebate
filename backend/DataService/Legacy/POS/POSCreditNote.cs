using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;
using System.ComponentModel.Design;
using System.Data;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace DataService.Legacy.POS
{
    public class POSCreditNote
    {
        private string ConnectionString = "";
        private double Wrate1, Wrate2;
        private string Wop1, Wop2;
        private bool dayIsOpenedBO = false;

        public void InsertCreditNote(
            SqlCommand cmsql,
            string locationCode,
            int clientRecId,
            string clName,
            string cashReg,
            string prefix,
            double amount,
            string currency,
            DateTime transactionDate,
            string gbApp,
            string gbComp,
            string gbYear,
            string gbUser,
            string gbCurr1,
            string gbCurr2,
            string gbComputerName,
            string additionalRemark = "")
        {

            string strsql = "";
            SqlDataReader drSql = null;
            string LocVat;
            string LocvatType = "";
            string LocVatRetT;
            string LocVatWhT;
            string LocVatPrice;
            string CInvType;
            string tbCashTab = "tbCashTab_" + gbUser;
            try
            {
                // Location Back Office
                strsql = $@"SELECT 1 FROM dbo.STK04_Location WHERE Loc_Type3 = 'B' AND Loc_Code = '{locationCode}'";
                if (!RecordsExists(ref strsql, cmsql))
                {
                    throw new InvalidOperationException($"Invalid Or Non-BO Location: {locationCode}");
                }

                // Valid Cash register
                strsql = $@"SELECT 1 FROM dbo.POS_CashReg WHERE CR_Loc = '{locationCode}' AND CR_Active = 'y' AND CR_Code = '{cashReg}'";
                if (!RecordsExists(ref strsql, cmsql))
                {
                    throw new InvalidOperationException($"Invalid Or Inactive Cash Register: {cashReg}");
                }

                // Credit Note transaction type defined
                strsql = $@" SELECT 1 FROM dbo.POS_StockTransaction
                            WHERE STT_LOCATION = '{locationCode}' AND STT_DOCTYPE1 = 'CV' AND STT_ACTIVE = 'Y'";
                if (!RecordsExists(ref strsql, cmsql))
                {
                    throw new InvalidOperationException($"Credit Note Document Type (CV) Not Defined For Location: {locationCode}");
                }

                DateTime workingDay = transactionDate;
                // check if working day is open (wala mara bkoun aam beftah nhnar aatoul checking, iza ma ken fi nhar maftouh bwaefo else bkafe)
                CheckOpeningAndClosingAtBO(workingDay.ToString(), locationCode, cmsql);
                if (dayIsOpenedBO == false)
                {
                    throw new InvalidOperationException($"Day Is Closed.");
                }

                // get Copercurr from table 
                string coperCurr;
                cmsql.Parameters.Clear();
                cmsql.CommandText = @" SELECT OP_opCURR
                                        FROM dbo.V_opparam
                                        LEFT JOIN dbo.stk04_salpricetype ON Price_Code = OP_BrkEvRle
                                        WHERE OP_LOC = @LocationCode AND OP_ACTIVE = 'Y'";
                cmsql.Parameters.AddWithValue("@LocationCode", locationCode);

                var coperCurrResult = cmsql.ExecuteScalar();
                coperCurr = coperCurrResult == DBNull.Value || coperCurrResult == null ? null : (string)coperCurrResult;

                // Validate currency rates are defined for this operation currency.  
                string dailyCurrResult = GetDailyCurr(coperCurr, workingDay, gbCurr1, gbCurr2, gbApp, true, cmsql);
                if (dailyCurrResult == "NULL") return;

                Int64 invHead = 0;
                invHead = Convert.ToInt64(MaxSerialNo(cmsql, locationCode));

                string docTyp1 = "CV";
                string docPrefix = prefix;
                strsql = $@"Select top 1 STT_PREFIX 
                            from POS_StockTransaction 
                            where STT_LOCATION = '{locationCode}'
                            and Stt_Doctype1 = 'CV'
                            and Stt_Prefix = '{prefix}'
                            AND STT_ACTIVE = 'Y' ";
                if (!RecordsExists(ref strsql, cmsql))
                {
                    throw new InvalidOperationException($"Credit Note Prefix Not Defined For Location: {locationCode}");
                }

                string priceCat = "";
                strsql = $@"Select CL_PriceCat from stk04_Clients where cl_recid = {clientRecId}";
                cmsql.CommandText = strsql;

                priceCat = cmsql.ExecuteScalar().ToString();
                

                    Int64 docSerNo = 0;
                docSerNo = MaxInvNo(docTyp1, docPrefix, locationCode, cmsql);

                string rptHead1 = "";
                string rptHead2 = "";
                string rptFoot = "";
                fillRptHeaders(locationCode, docTyp1, docPrefix, cmsql, ref rptHead1, ref rptHead2, ref rptFoot);

                string remarks = "";
                string TxtOpr = "";
                string TxtRate = "";
                string LblRate = "";
                string lblRate2 = "";
                string TxtOpr2 = "";
                string txtRate2 = "";
                double invFCRate = 0;

                getReceiptValueCV(cmsql, workingDay.ToString(), amount, coperCurr, currency, gbCurr1, gbCurr2, gbApp, ref LblRate, ref TxtOpr, ref TxtRate, ref lblRate2, ref TxtOpr2, ref txtRate2, ref invFCRate);
                remarks = LblRate + " : " + TxtOpr + " " + TxtRate;

                strsql = $@"Select STT_REMARKS 
                            from POS_StockTransaction 
                            where STT_LOCATION = '{locationCode}'
                            and Stt_Doctype1 = 'CV'
                            AND STT_ACTIVE = 'Y' ";
                cmsql.CommandText = strsql;

                if (!string.IsNullOrEmpty(cmsql.ExecuteScalar().ToString()))
                {
                    remarks += Environment.NewLine + (string)cmsql.ExecuteScalar();
                }

                if (!string.IsNullOrEmpty(additionalRemark))
                {
                    remarks += Environment.NewLine + additionalRemark;
                }

                double? curRate = string.IsNullOrEmpty(TxtRate)
                    ? (double?)null
                    : Convert.ToDouble(TxtRate, CultureInfo.InvariantCulture);

                string saleTyp = null;
                //Get Location Invoice Type
                strsql = "SELECT Loc_vat,Loc_vatno,Loc_Vatrettype,loc_vatwtype,loc_type1,loc_type3,Loc_AllowRef ";
                strsql += " FROM Stk04_Location where loc_code = '" + locationCode + "'";

                cmsql.CommandText = strsql;
                drSql = cmsql.ExecuteReader();
                try
                {
                    if (drSql.HasRows)
                    {
                        drSql.Read();

                        CInvType = Convert.ToString(
                            drSql["Loc_Type1"].ToString() == "W"
                                ? "W"
                                : (drSql["loc_type3"].ToString() == "B"
                                    ? "B"
                                    : drSql["loc_type1"].ToString())
                        );

                        LocVat = drSql["Loc_vatno"].ToString();
                        LocvatType = drSql["Loc_vat"].ToString();
                        LocVatRetT = drSql["Loc_Vatrettype"].ToString();
                        LocVatWhT = drSql["loc_vatwtype"].ToString();

                        saleTyp = Convert.ToString(
                            drSql["loc_type1"].ToString() == "P"
                                ? "R"
                                : drSql["loc_type1"].ToString()
                        );
                    }
                }
                finally
                {
                    if (drSql != null)
                    {
                        if (!drSql.IsClosed)
                            drSql.Close();

                        drSql = null;
                    }
                }

                string empCode = gbUser;
                string cashSession = null;
                cashSession = GetCashSession(cashReg, locationCode, gbComputerName, cmsql);

                string cashInv = "N";

                string clAddress = "";
                string clDelAdd = "";

                string priceUsed = "";
                strsql = $@"Select sl_prefprc 
                            from V_SpLocation 
                            where SL_LOC = '{locationCode}' ";
                cmsql.CommandText = strsql;
                priceUsed = (string)cmsql.ExecuteScalar();

                double VATperused = 0;
                strsql = $@"Select comp_vatper from com_company where comp_code = '{gbComp}'";
                cmsql.CommandText = strsql;
                var vatPerScalar = cmsql.ExecuteScalar();
                VATperused = vatPerScalar == null || vatPerScalar == DBNull.Value
                    ? 0
                    : Convert.ToDouble(vatPerScalar, CultureInfo.InvariantCulture);

                double lblVatVal = 0;
                if (LocvatType == "Y" && VATperused != 0 & priceCat != "X")
                {
                    lblVatVal = (amount / (1 + (100 / VATperused)));

                }
                else
                {
                    lblVatVal = 0;
                }

                double netTot = amount;
                double totDisc = 0;
                double addDisc = 0;
                double grossTot = netTot + totDisc + addDisc;

                string vatType = priceCat != "X" ? "T" :  "N" ;
                double vatFC = 0;
                double vatLc = 0;
                double vatRateLC = 0;
                double? invhVatPer = null;

                double incentLC = 0;
                double incentCC = 0;
                double incentPer = 0;

                string cciLoc = "";
                string cciRecordID = "";

                if(priceCat != "X")
                {
                    vatFC = lblVatVal;
                    vatLc = lblVatVal;
                }
                else
                {
                    vatFC = 0;
                    vatLc = 0;
                }

                strsql = $@"SELECT sp_defaultvatratecctolc from stk04_sysparam";
                cmsql.CommandText = strsql;
                var vatRateLcScalar = cmsql.ExecuteScalar();
                vatRateLC = vatRateLcScalar == null || vatRateLcScalar == DBNull.Value
                    ? 0
                    : Convert.ToDouble(vatRateLcScalar, CultureInfo.InvariantCulture);

                strsql = @"Insert Into POS_SaleInvHead";
                strsql += " Values('" + locationCode + "'";
                strsql += "," + invHead;
                strsql += ",'" + docTyp1 + "'";
                strsql += ",'" + docPrefix + "'";
                strsql += "," + docSerNo;
                strsql += ",'" + Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "'";
                strsql += ",'" + saleTyp + "'";

                if (empCode == "NULL")
                {
                    strsql += ",Null";
                }
                else
                {
                    strsql += ",'" + empCode + "'";
                }

                strsql += ",'" + cashReg + "'," + Convert.ToDouble(cashSession);

                if (clientRecId == 0)
                {
                    strsql += ",Null,";
                }
                else
                {
                    strsql += "," + clientRecId + ",";
                }

                strsql += " N'" + clName.Replace("'", "''") + "',N'" + clAddress.Replace("'", "''");
                strsql += "',N'" + clDelAdd.Replace("'", "''");
                strsql += "',N'" + remarks.Replace("'", "''") + "'," + (priceUsed == "" ? "null" : "'" + priceUsed + "'");

                if (coperCurr == "FC")
                {
                    strsql += ",'" + gbCurr2 + "', ";

                    if (currency == gbCurr2)
                    {
                        strsql += " " + (-1 * (grossTot + totDisc + addDisc)) + "," + (-1 * totDisc) + "";
                        strsql += "," + (-1 * addDisc) + "," + (-1 * netTot) + "";
                        strsql += ",'" + vatType + "'," + (-1 * vatFC).ToString("0.###", CultureInfo.InvariantCulture);


                        if (vatRateLC != 0)
                        {
                            strsql += " , dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " + (-1 * vatLc) + ",'" +
                                      currency + "','" + gbCurr1 + "', '" + vatRateLC.ToString("0.###", CultureInfo.InvariantCulture) + "' ,'" +
                                      Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "')  ";
                        }
                        else
                        {
                            if (invFCRate != 0)
                            {
                                strsql += " , dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear +
                                          "', dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " + (-1 * vatLc) + ",'" +
                                          currency + "','" + gbCurr2 + "', '" + invFCRate.ToString("0.###", CultureInfo.InvariantCulture) + "' , '" +
                                          Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "') ,'" + gbCurr2 + "','" +
                                          gbCurr1 + "', '" + TxtRate + "' ,'" +
                                          Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "')  ";
                            }
                            else
                            {
                                strsql += "," + convert5(cmsql, (-1 * vatLc), currency, gbCurr1, Convert.ToDateTime(workingDay), gbCurr1, gbCurr2, gbApp);
                            }
                        }
                    }
                    else
                    {
                        if (invFCRate != 0)
                        {
                            strsql += " dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " +
                                      (-1 * (grossTot + totDisc + addDisc)) + ",'" + currency + "', '" + gbCurr2 + "', '" +
                                      invFCRate + "' ,'" + Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "')  ,";

                            strsql += " dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " +
                                      (-1 * totDisc) + ",'" + currency + "', '" + gbCurr2 + "', '" + invFCRate.ToString("0.###", CultureInfo.InvariantCulture) + "'  ,'" +
                                      Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "')  ,";

                            strsql += " dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " +
                                      (-1 * addDisc) + ",'" + currency + "', '" + gbCurr2 + "', '" + invFCRate.ToString("0.###", CultureInfo.InvariantCulture) + "' , '" +
                                      Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "')  ,";

                            strsql += " dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " +
                                      (-1 * netTot) + ",'" + currency + "', '" + gbCurr2 + "', '" + invFCRate.ToString("0.###", CultureInfo.InvariantCulture) + "' , '" +
                                      Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "')  ";

                            strsql += ",'" + vatType + "',";

                            strsql += " dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " +
                                      (-1 * vatFC) + ",'" + currency + "','" + gbCurr2 + "', '" + invFCRate.ToString("0.###", CultureInfo.InvariantCulture) + "' , '" +
                                      Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "')  ";

                            if (currency == gbCurr1)
                            {
                                strsql += "," + (-1 * vatLc);
                            }
                            else
                            {
                                if (vatRateLC != 0)
                                {
                                    strsql += " , dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " +
                                              (-1 * vatLc) + ",'" + currency + "','" + gbCurr1 + "', '" + vatRateLC.ToString("0.###", CultureInfo.InvariantCulture) + "' , '" +
                                              Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "')  ";
                                }
                                else
                                {
                                    strsql += " , dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear +
                                              "', dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " +
                                              (-1 * vatLc) + ",'" + currency + "','" + gbCurr2 + "', '" + invFCRate.ToString("0.###", CultureInfo.InvariantCulture) + "' , '" +
                                              Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "') ,'" + gbCurr2 + "','" +
                                              gbCurr1 + "', '" + TxtRate + "' ,'" +
                                              Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "')  ";
                                }
                            }
                        }
                        else
                        {
                            strsql += (-1 * convert5(cmsql, grossTot + totDisc + addDisc, currency, gbCurr2, Convert.ToDateTime(workingDay), gbCurr1, gbCurr2, gbApp)) + ", ";
                            strsql += (-1 * convert5(cmsql, totDisc, currency, gbCurr2, Convert.ToDateTime(workingDay), gbCurr1, gbCurr2, gbApp)) + ", ";
                            strsql += (-1 * convert5(cmsql, addDisc, currency, gbCurr2, Convert.ToDateTime(workingDay), gbCurr1, gbCurr2, gbApp)) + ", ";
                            strsql += (-1 * convert5(cmsql, netTot, currency, gbCurr2, Convert.ToDateTime(workingDay), gbCurr1, gbCurr2, gbApp)) + " ";

                            strsql += ",'" + vatType + "',";

                            strsql += (-1 * convert5(cmsql, vatFC, currency, gbCurr2, Convert.ToDateTime(workingDay), gbCurr1, gbCurr2, gbApp))
                                .ToString("0.###", CultureInfo.InvariantCulture);

                            if (currency == gbCurr1)
                            {
                                strsql += "," + (-1 * vatLc);
                            }
                            else
                            {
                                if (vatRateLC != 0)
                                {
                                    strsql += " , dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " +
                                              (-1 * vatLc) + ",'" + currency + "','" + gbCurr1 + "', '" + vatRateLC.ToString("0.###", CultureInfo.InvariantCulture) + "' , '" +
                                              Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "')  ";
                                }
                                else
                                {
                                    strsql += "," + convert5(cmsql,
                                        (-1 * vatLc),
                                        currency,
                                        gbCurr1,
                                        Convert.ToDateTime(workingDay), gbCurr1, gbCurr2, gbApp
                                    );
                                }
                            }
                        }
                    }
                }
                else
                {
                    strsql += ",'" + currency + "'," + (-1 * (grossTot + totDisc + addDisc)) + "," + (-1 * totDisc) + "";
                    strsql += "," + (-1 * addDisc) + "," + (-1 * netTot) + "";

                    strsql += ",'" + vatType + "'," + (-1 * vatFC).ToString("0.###", CultureInfo.InvariantCulture);

                    if (currency == gbCurr1)
                    {
                        strsql += "," + (-1 * vatLc);
                    }
                    else
                    {
                        if (vatRateLC != 0)
                        {
                            strsql += " , dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " +
                                      (-1 * vatLc) + ",'" + currency + "','" + gbCurr1 + "', '" + vatRateLC.ToString("0.###", CultureInfo.InvariantCulture) + "' , '" +
                                      Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "') ";
                        }
                        else
                        {
                            if (!string.IsNullOrEmpty(TxtRate) &&
                                Convert.ToDouble(TxtRate, CultureInfo.InvariantCulture) != 0)
                            {
                                strsql += " , dbo.convert5fc('" + gbApp + "','" + gbComp + "','" + gbYear + "', " +
                                          (-1 * vatLc) + ",'" + currency + "','" + gbCurr1 + "', '" + TxtRate + "' , '" +
                                          Convert.ToDateTime(workingDay).ToString("MM/dd/yyyy") + "') ";
                            }
                            else
                            {
                                strsql += "," + convert5(cmsql,
                                    (-1 * vatLc),
                                    currency,
                                    gbCurr1,
                                    Convert.ToDateTime(workingDay), gbCurr1, gbCurr2, gbApp
                                );
                            }
                        }
                    }
                }

                strsql += "," + incentLC;
                strsql += "," + incentCC;
                strsql += "," + incentPer;
                strsql += ",'" + TxtRate + "'";
                strsql += ",'N',NULL";
                strsql += ",0";
                strsql += ",'N'";
                strsql += ",'" + cashInv + "'";
                strsql += " , getdate()";
                strsql += " , '" + gbUser + "',";

                if (coperCurr == "FC")
                {
                    strsql += "'" + currency + "'," + (-1 * (grossTot + totDisc + addDisc)) + "," + (-1 * totDisc) + "";
                    strsql += "," + (-1 * addDisc) + "," + (-1 * netTot) + "";
                    strsql += "," + (-1 * vatFC).ToString("0.###", CultureInfo.InvariantCulture);
                    strsql += ",'0','" + invFCRate.ToString("0.###", CultureInfo.InvariantCulture) + "'";
                }
                else
                {
                    strsql += " NULL ";
                    strsql += ",'0','0','0','0','0','0','0'";
                }

                strsql += " ,'" + rptHead1 + "','" + rptHead2 + "','" + rptFoot + "' ";

                strsql += ", NULL ";

                strsql += " ,  " + (invhVatPer == null ? "NULL" : "" + invhVatPer + "") + " ";

                strsql += "," + (cciLoc == null || cciLoc.Trim() == ""
                    ? "NULL"
                    : "'" + cciLoc + "'") + " ";

                strsql += "," + (cciRecordID == null || cciRecordID.Trim() == ""
                    ? "NULL"
                    : "'" + cciRecordID + "'") + " ";

                double PerVal;

                if (grossTot + totDisc + addDisc == 0)
                {
                    PerVal = 0;
                }
                else
                {
                    PerVal = Convert.ToDouble(addDisc) * 100 / Convert.ToDouble(grossTot + totDisc + addDisc);

                    if (PerVal > 100)
                        PerVal = 100;
                }

                strsql += ",'" + PerVal.ToString("0.###", CultureInfo.InvariantCulture) + "' ";
                strsql += ",'V'";

                if (vatRateLC != 0)
                {
                    strsql += " , '" + vatRateLC.ToString("0.###", CultureInfo.InvariantCulture) + "'";
                }
                else
                {
                    strsql += " , '" + TxtRate + "'";
                }

                strsql += " ) ";

                cmsql.CommandText = strsql;
                cmsql.ExecuteNonQuery();

                //Insert into cash Transaction table
                CreateTmpCashTrans(tbCashTab, cmsql);
                double parsedRate = string.IsNullOrEmpty(TxtRate)
                    ? 0
                    : Convert.ToDouble(TxtRate, CultureInfo.InvariantCulture);
                double parsedRate2 = string.IsNullOrEmpty(txtRate2)
                    ? 0
                    : Convert.ToDouble(txtRate2, CultureInfo.InvariantCulture);
                InsertCashTransaction(cmsql, invHead.ToString(), locationCode, docTyp1,
                    docPrefix, docSerNo.ToString(), cashReg, workingDay, gbApp, gbComp, gbYear, gbUser,
                    gbCurr1, gbCurr2, tbCashTab, currency, amount, parsedRate, TxtOpr, parsedRate2, TxtOpr2);

                if (additionalRemark != null && additionalRemark.Trim() != "") {
                    InsertAccRemark(cmsql, invHead, locationCode, additionalRemark);
                }

                //Update Invoice Number
                UpdInvNo(Convert.ToString(docSerNo), docTyp1, docPrefix, locationCode, cmsql);

            }
            catch (Exception ex)
            {
                throw ex;
            }
            finally
            {
                if (drSql != null)
                {
                    if (!drSql.IsClosed)
                        drSql.Close();

                    drSql = null;
                }
            }
        }



        private bool RecordsExists(ref string _strsql, SqlCommand _cmSql = null)
        {
            SqlConnection cnSql = null;
            SqlCommand cmSql = null;
            try
            {
                if (_cmSql == null)
                {
                    cnSql = new SqlConnection();
                    cnSql = new SqlConnection(ConnectionString);
                    cnSql.Open();
                    cmSql = new SqlCommand(_strsql, cnSql);
                    if (cmSql.ExecuteScalar() != null)
                    {
                        return true;
                    }
                    else
                    {
                        return false;
                    }
                }
                else
                {
                    _cmSql.CommandText = _strsql;
                    if (_cmSql.ExecuteScalar() != null)
                    {
                        return true;
                    }
                    else
                    {
                        return false;
                    }
                }
            }
            catch (Exception)
            {
                throw;
            }
            finally
            {
                cmSql = null;
                if (cnSql != null)
                {
                    if (cnSql.State == ConnectionState.Open)
                        cnSql.Close();
                    cnSql = null;
                }
            }
        }

        private string GetDailyCurr(string coperCurr, DateTime workingDay, string gbCurr1, string gbCurr2, string gbApp, bool clocHO, SqlCommand cmSqlTrans = null)
        {
            if (coperCurr == "FC") return null;

            SqlConnection cnSql = null;
            SqlCommand cmSql = null;
            SqlDataReader drSql = null;
            bool ownsConnection = false;
            try
            {
                string curCode = coperCurr == gbCurr1 ? gbCurr2 : coperCurr;
                string strsql;

                if (!clocHO)
                {
                    strsql = $"SELECT * From POS_DailyCurrency Where DC_CURR = '{curCode}'";
                }
                else
                {
                    strsql =
                        "SELECT ( CASE WHEN App_Rate = 1 THEN DR_Rate1LC ELSE ( CASE WHEN App_Rate = 2 THEN DR_Rate2LC ELSE DR_Rate3LC END ) END ) DC_RateLC ," +
                        " ( CASE WHEN App_Rate = 1 THEN DR_Rate1CC ELSE ( CASE WHEN App_Rate = 2 THEN DR_Rate2CC ELSE DR_Rate3CC END ) END ) DC_RateCC ," +
                        " ( CASE WHEN App_Rate = 1 THEN DR_Op1LC ELSE ( CASE WHEN App_Rate = 2 THEN DR_Op2LC ELSE DR_Op3LC END ) END ) DC_OpLC ," +
                        " DR_RATE1LC DC_AccRate" +
                        $" FROM dbo.Com_DailyRate INNER JOIN Com_Application ON App_Code = '{gbApp}'" +
                        $" WHERE   DR_Date = '{workingDay:MM/dd/yyyy}'" +
                        $" AND DR_CurCode = '{curCode}'";
                }

                if (cmSqlTrans == null)
                {
                    cnSql = new SqlConnection(ConnectionString);
                    cnSql.Open();
                    ownsConnection = true;
                    cmSql = new SqlCommand(strsql, cnSql);
                    drSql = cmSql.ExecuteReader();
                }
                else
                {
                    cmSqlTrans.CommandText = strsql;
                    drSql = cmSqlTrans.ExecuteReader();
                }

                using (drSql)
                {
                    if (drSql.HasRows)
                    {
                        drSql.Read();
                        string rateLc = drSql["DC_RATELC"].ToString();
                        string rateCc = drSql["DC_RATECC"].ToString();
                        if (rateLc == "" || rateLc == "0")
                        {
                            return "NULL";
                        }
                        else if (rateCc == "" || rateCc == "0")
                        {
                            return "NULL";
                        }
                    }
                    else
                    {
                        return "NULL";
                    }
                }

                return null;
            }
            catch (Exception)
            {
                return "NULL";
            }
            finally
            {
                if (ownsConnection && cnSql != null && cnSql.State == ConnectionState.Open)
                {
                    cnSql.Close();
                }
            }
        }

        private bool CheckOpeningAndClosingAtBO(string _wd, string vbCLoc, SqlCommand cmSql)
        {
            try
            {
                DateTime workingDay = DateTime.Parse(_wd);
                string wdStr = workingDay.ToString("MM/dd/yyyy");

                string sql1 = $"SELECT TOP 1 CT_LOCATION  FROM dbo.POS_CASHTRANSACTION WHERE CT_LOCATION='{vbCLoc}' AND CT_RECID='O' AND CT_OPDATE='{wdStr}'";
                if (RecordsExists(ref sql1, cmSql))
                {
                    string sql2 = $"SELECT TOP 1 CT_LOCATION  FROM dbo.POS_CASHTRANSACTION WHERE CT_LOCATION='{vbCLoc}' AND CT_RECID='Z' AND CT_OPDATE='{wdStr}'";
                    if (RecordsExists(ref sql2, cmSql))
                    {
                        dayIsOpenedBO = false;
                        return dayIsOpenedBO;
                    }
                    else
                    {
                        dayIsOpenedBO = true;
                    }
                }
                else
                {
                    string sql3 = $"SELECT TOP 1 1 FROM POS_CASHTRANSACTION WHERE CT_LOCATION = '{vbCLoc}' AND CT_OPDATE='{wdStr}'";
                    if (RecordsExists(ref sql3, cmSql))
                    {
                        dayIsOpenedBO = true;
                        return dayIsOpenedBO;
                    }

                    string sql4 = $"Select top 1 1 from stk04_SETTLEMENTTYPE where ST_LOC = '{vbCLoc}' and st_code <> 'NR1' And ST_Active = 'Y'";
                    if (!RecordsExists(ref sql4, cmSql))
                    {
                        cmSql.Parameters.Clear();
                        cmSql.CommandText = $"select [Date] from F_GetMaxDate('{vbCLoc}')";
                        var maxDateResult = cmSql.ExecuteScalar();
                        string lastWDFromTrans = maxDateResult == DBNull.Value || maxDateResult == null ? "" : maxDateResult.ToString();

                        if (string.IsNullOrEmpty(lastWDFromTrans))
                        {
                            dayIsOpenedBO = true;
                            return dayIsOpenedBO;
                        }

                        DateTime lastWDFromTransDate = DateTime.Parse(lastWDFromTrans);

                        if (workingDay.Date < lastWDFromTransDate.Date)
                        {
                            dayIsOpenedBO = false;
                            return dayIsOpenedBO;
                        }
                        else
                        {
                            dayIsOpenedBO = true;
                            return dayIsOpenedBO;
                        }
                    }

                    dayIsOpenedBO = false;
                }
            }
            catch (Exception)
            {
                dayIsOpenedBO = false;
            }

            return dayIsOpenedBO;
        }

        private double MaxSerialNo(SqlCommand _sqlCommand, string LocationCode)
        {
            try
            {
                return Convert.ToDouble(GetFieldDesc(" POS_SALEINVHEAD with (TABLOCKX)", " INVH_LOC = '" + LocationCode + "'", "isnull(max(INVH_RECID),0) + 1", _sqlCommand));
            }
            catch (Exception)
            {
                throw;
            }
        }

        private string GetFieldDesc(string Table, string Criteria, string ReturnDesc, SqlCommand cmSqlTrans = null)
        {
            string strsql;
            SqlConnection cnSql = null;
            SqlCommand cmSql = null;
            SqlDataReader drSql = null;

            try
            {
                if (Criteria == "")
                    return "";

                strsql = "select " + ReturnDesc + " from " + Table + " where " + Criteria;

                if (cmSqlTrans == null)
                {
                    cnSql = new SqlConnection(ConnectionString);
                    cnSql.Open();

                    cmSql = new SqlCommand(strsql, cnSql);

                    drSql = cmSql.ExecuteReader();
                }
                else
                {
                    cmSqlTrans.CommandText = strsql;
                    drSql = cmSqlTrans.ExecuteReader();
                }

                if (drSql.Read())
                {
                    return drSql[0].ToString();
                }
                else
                {
                    return "";
                }
            }
            catch (Exception)
            {
                throw;
            }
            finally
            {
                if (drSql != null)
                {
                    if (drSql.IsClosed == false)
                        drSql.Close();

                    drSql = null;
                }

                cmSql = null;

                if (cnSql != null)
                {
                    if (cnSql.State == ConnectionState.Open)
                        cnSql.Close();

                    cnSql = null;
                }
            }
        }

        private long MaxInvNo(string DocTyp1, string DocPrefix, string LocationCode, SqlCommand cmSql = null)
        {
            try
            {
                if (cmSql == null)
                {
                    return Convert.ToInt64(
                        GetFieldDesc(
                            "POS_stocktransaction",
                            " STT_LOCATION = '" + LocationCode + "' and STT_DOCTYPE1 = '" + DocTyp1 + "' and STT_PREFIX = '" + DocPrefix + "'",
                            " isnull(nullif(STT_SERNO,0),1)"
                        )
                    );
                }
                else
                {
                    return Convert.ToInt64(
                        GetFieldDesc(
                            "POS_stocktransaction",
                            " STT_LOCATION = '" + LocationCode + "' and STT_DOCTYPE1 = '" + DocTyp1 + "' and STT_PREFIX = '" + DocPrefix + "'",
                            " isnull(nullif(STT_SERNO,0),1)",
                            cmSql
                        )
                    );
                }
            }
            catch (Exception)
            {
                throw;
            }
        }

        private string GetCashSession(string CshReg, string LocationCode, string gbComputerName, SqlCommand cmSql = null)
        {
            string strsql = "";
            SqlDataReader drSql = null;

            try
            {

                strsql = "Select CR_SessionNo from POS_CashReg where CR_compNAME = '" + gbComputerName + "'";
                strsql += " and cr_code = '" + CshReg + "' and cr_active = 'Y'  AND CR_Loc='" + LocationCode + "'";

                cmSql.CommandText = strsql;
                drSql = cmSql.ExecuteReader();

                if (drSql.HasRows)
                {
                    drSql.Read();
                    return drSql["CR_SessionNo"].ToString();
                }
                else
                {
                    return null;
                }
            }
            catch (Exception)
            {
                throw;
            }
            finally
            {
                if (drSql != null)
                {
                    if (drSql.IsClosed == false)
                        drSql.Close();

                    drSql = null;
                }
            }
        }

        private void fillRptHeaders(string LocationCode, string DocTyp1, string DocPrefix, SqlCommand cmSql, ref string rptHead1, ref string rptHead2, ref string rptFoot)
        {
            string strsql;
            SqlDataReader drsql = null;

            try
            {
                strsql = " SELECT STT_PRINTED1, STT_PRINTED2, STT_FOOTER FROM pos_stocktransaction";
                strsql += " WHERE STT_LOCATION = '" + LocationCode + "' AND STT_DOCTYPE1 ='" + DocTyp1 + "'";
                strsql += " AND STT_PREFIX = '" + DocPrefix + "' ";

                cmSql.CommandText = strsql;

                drsql = cmSql.ExecuteReader();

                if (drsql.HasRows)
                {
                    drsql.Read();

                    rptHead1 = drsql["STT_PRINTED1"].ToString();
                    rptHead2 = drsql["STT_PRINTED2"].ToString();
                    rptFoot = drsql["STT_FOOTER"].ToString();
                }
                else
                {
                    rptHead1 = "";
                    rptHead2 = "";
                    rptFoot = "";
                }
            }
            catch (Exception)
            {
                throw;
            }
            finally
            {
                if (drsql != null)
                {
                    if (drsql.IsClosed == false)
                        drsql.Close();

                    drsql = null;
                }
            }
        }

        private bool GetRates(
            SqlCommand cmSql,
            string WorkingDay,
            string gbCurr1,
            string gbCurr2,
            string gbApp,
            string WCurr,
            ref double lcRate1,
            ref double lcRate2,
            ref string lcOp1,
            ref string lcOp2,
            bool DontChangeWVariables,
            bool PreventRateZero,
             string convdate = "",
            bool useRate2 = false,
             double lcRateLC2 = 0,
             double lcRateCC2 = 0,
             string lcOpLC2 = "",
             string lcOpCC2 = "")
        {
            string strsql5;
            SqlDataReader drSql = null;

            double Rate2LC, Rate2CC;
            string Op2LC, Op2CC;

            try
            {
                //Get The Rates From DailyRate

                strsql5 = "SELECT (CASE WHEN App_Rate=1 THEN DR_Rate1LC ELSE (CASE WHEN App_Rate=2 THEN DR_Rate2LC ELSE DR_Rate3LC END ) END  ) DC_RateLC,";
                strsql5 += " (CASE WHEN App_Rate=1 THEN DR_Op1LC ELSE (CASE WHEN App_Rate=2 THEN DR_Op2LC ELSE DR_Op3LC END ) END  ) DC_OpLC,";
                strsql5 += " (CASE WHEN App_Rate=1 THEN DR_Rate1CC ELSE (CASE WHEN App_Rate=2 THEN DR_Rate2CC ELSE DR_Rate3CC END ) END  ) DC_RateCC,";
                strsql5 += " (CASE WHEN App_Rate=1 THEN DR_Op1CC ELSE (CASE WHEN App_Rate=2 THEN DR_Op2CC ELSE DR_Op3CC END ) END  ) DC_OpCC";
                strsql5 += " ,DR_Rate2LC DC_Rate2LC, DR_OP2LC DC_OP2LC, DR_Rate2CC DC_Rate2CC, DR_OP2CC DC_OP2CC FROM dbo.Com_DailyRate inner JOIN Com_Application ON App_Code='" + gbApp + "'";
                strsql5 += " WHERE DR_Date='" + Convert.ToDateTime(
                    string.IsNullOrEmpty(convdate) ? WorkingDay : convdate
                ).ToString("MM/dd/yyyy") + "' ";

                if (WCurr == gbCurr1)
                {
                    strsql5 += " and DR_CurCode= '" + gbCurr2 + "'";
                }
                else if (WCurr == gbCurr2)
                {
                    strsql5 += " and DR_CurCode= '" + gbCurr2 + "'";
                }
                else
                {
                    strsql5 += " and DR_CurCode= '" + WCurr + "'";
                }


                cmSql.CommandText = strsql5;
                drSql = cmSql.ExecuteReader();

                bool GetRatesResult;

                if (drSql.HasRows)
                {
                    drSql.Read();

                    lcRate1 = Convert.ToDouble(drSql["DC_RateLC"].ToString());
                    lcRate2 = Convert.ToDouble(drSql["DC_RateCC"].ToString());
                    lcOp1 = drSql["DC_OpLC"].ToString();
                    lcOp2 = drSql["DC_OpCC"].ToString();

                    Rate2LC = Convert.ToDouble(drSql["DC_Rate2LC"].ToString());
                    Rate2CC = Convert.ToDouble(drSql["DC_Rate2CC"].ToString());
                    Op2LC = drSql["DC_Op2LC"].ToString();
                    Op2CC = drSql["DC_Op2CC"].ToString();

                    lcRateLC2 = Rate2LC;
                    lcRateCC2 = Rate2CC;
                    lcOpLC2 = Op2LC;
                    lcOpCC2 = Op2CC;

                    GetRatesResult = true;
                }
                else
                {
                    lcRate1 = 1;
                    lcRate2 = 1;
                    lcOp1 = "*";
                    lcOp2 = "*";

                    Rate2LC = 1;
                    Rate2CC = 1;
                    Op2LC = "*";
                    Op2CC = "*";

                    GetRatesResult = false;
                }

                if (PreventRateZero == true)
                {
                    if (lcRate1 == 0 || lcRate2 == 0)
                    {
                        GetRatesResult = false;
                    }
                    else if (Rate2LC == 0 || Rate2CC == 0)
                    {
                        GetRatesResult = false;
                    }
                }
                else
                {
                    if (lcRate1 == 0)
                        lcRate1 = 1;

                    if (lcRate2 == 0)
                        lcRate2 = 1;
                }

                if (DontChangeWVariables == false)
                {
                    if (useRate2)
                    {
                        lcRate1 = Rate2LC;
                        lcRate2 = Rate2CC;
                        lcOp1 = Op2LC;
                        lcOp2 = Op2CC;

                        Wrate1 = Rate2LC;
                        Wrate2 = Rate2CC;
                        Wop1 = Op2LC;
                        Wop2 = Op2CC;
                    }
                    else
                    {
                        Wrate1 = lcRate1;
                        Wrate2 = lcRate2;
                        Wop1 = lcOp1;
                        Wop2 = lcOp2;
                    }
                }
                else
                {
                    if (useRate2)
                    {
                        lcRate1 = Rate2LC;
                        lcRate2 = Rate2CC;
                        lcOp1 = Op2LC;
                        lcOp2 = Op2CC;
                    }
                }

                return GetRatesResult;
            }
            catch (Exception)
            {
                throw;
            }
            finally
            {
                if (drSql != null)
                {
                    if (drSql.IsClosed == false)
                        drSql.Close();

                    drSql = null;
                }
            }
        }

        private bool getReceiptValueCV(SqlCommand cmSql,
            string WorkingDay,
            double Amount,
            string Copercurr,
            string Currency,
            string gbCurr1,
            string gbCurr2,
            string gbApp,
            ref string LblRate,
            ref string TxtOpr,
            ref string TxtRate,
            ref string lblRate2,
            ref string TxtOpr2,
            ref string txtRate2,
            ref double invFCRate)
        {
            bool result = true;
            bool bExists = false;
            string strsql = "";
            try
            {
                if (Amount == 0 ||
                    (Copercurr == "FC" && Currency == ""))
                {
                    return result;
                }

                strsql = "SELECT DR_CurCode [Curr] FROM dbo.Com_DailyRate WHERE DR_CurCode = '" + Currency.Replace("'", "''") + "' ";
                bExists = RecordsExists(ref strsql, cmSql);

                if (bExists == false && Currency != gbCurr1)
                {
                    invFCRate = 0;
                    result = false;

                }
                else
                {
                    string OpLC = "", OpCC = "";
                    double RateLC = 0, RateCC = 0;

                    if (GetRates(cmSql, WorkingDay, gbCurr1, gbCurr2, gbApp, Currency.Replace("'", "''"), ref RateLC, ref RateCC, ref OpLC, ref OpCC, true, true, "", true) == true)
                    {
                        if (Currency == gbCurr1 || Currency == gbCurr2)
                        {

                            LblRate = "Rate " + Currency + " / " +
                                           (Currency == gbCurr1 ? gbCurr2 : gbCurr1);

                            invFCRate = RateLC;

                            if (Currency == gbCurr1)
                            {
                                TxtOpr = OpLC == "*" ? "/ " : "* ";
                                TxtRate = RateLC.ToString("0.###", CultureInfo.InvariantCulture);
                            }
                            else
                            {
                                TxtOpr = OpLC;
                                TxtRate = RateLC.ToString("0.###", CultureInfo.InvariantCulture);
                            }

                        }
                        else
                        {
                            LblRate = "Rate " + Currency + " / " + gbCurr1;

                            TxtOpr = OpLC;
                            TxtRate = RateLC.ToString("0.###", CultureInfo.InvariantCulture);


                            lblRate2 = "Rate " + Currency + " / " + gbCurr2;

                            TxtOpr2 = OpCC;
                            txtRate2 = RateCC.ToString("0.###", CultureInfo.InvariantCulture);

                            invFCRate = RateCC;
                        }
                    }
                    else
                    {
                        invFCRate = 0;
                        result = false;
                    }
                }

                return result;
            }
            catch (Exception)
            {
                throw;
            }
        }

        private double MathRound(double val, int precision = 0)
        {
            return Math.Round(val, precision, MidpointRounding.AwayFromZero);
        }

        private double convert5(SqlCommand cmSql,
                                        double mnt,
                                        string curfrom,
                                        string curto,
                                        DateTime sdate,
                                        string gbCurr1,
                                        string gbCurr2,
                                        string gbApp,
                                        bool useRate2 = false)
        {
            if (curfrom == curto)
            {
                return mnt;
            }

            if (curfrom == gbCurr1)
            {
                if (GetRates(cmSql, Convert.ToString(sdate), gbCurr1, gbCurr2, gbApp, curto, ref Wrate1, ref Wrate2, ref Wop1, ref Wop2,
                    false, false, "", useRate2,
                    0, 0, "", "") == false)
                {
                    return 0;
                }
                else
                {
                    return MathRound(
                        Convert.ToDouble(Wop1 == "*" ? mnt / Wrate1 : mnt * Wrate1),
                        3);
                }
            }
            else if (curfrom == gbCurr2)
            {
                if (curto == gbCurr1)
                {
                    if (GetRates(cmSql, Convert.ToString(sdate), gbCurr1, gbCurr2, gbApp, curfrom, ref Wrate1, ref Wrate2, ref Wop1, ref Wop2,
                        false, false, "", useRate2,
                        0, 0, "", "") == false)
                    {
                        return 0;
                    }
                    else
                    {
                        return MathRound(
                            Convert.ToDouble(Wop1 == "*" ? mnt * Wrate1 : mnt / Wrate1),
                            3);
                    }
                }
                else
                {
                    if (GetRates(cmSql, Convert.ToString(sdate), gbCurr1, gbCurr2, gbApp, curto, ref Wrate1, ref Wrate2, ref Wop1, ref Wop2,
                         false, false, "", useRate2,
                        0, 0, "", "") == false)
                    {
                        return 0;
                    }
                    else
                    {
                        return MathRound(
                            Convert.ToDouble(Wop2 == "*" ? mnt / Wrate2 : mnt * Wrate2),
                            3);
                    }
                }
            }
            else
            {
                if (GetRates(cmSql, Convert.ToString(sdate), gbCurr1, gbCurr2, gbApp, curfrom, ref Wrate1, ref Wrate2, ref Wop1, ref Wop2,
                    false, false, "", useRate2,
                        0, 0, "", "") == false)
                {
                    return 0;
                }
                else
                {
                    if (curto == gbCurr1)
                    {
                        return MathRound(
                            Convert.ToDouble(Wop1 == "*" ? mnt * Wrate1 : mnt / Wrate1),
                            3);
                    }
                    else
                    {
                        double result = MathRound(
                            Convert.ToDouble(Wop2 == "*" ? mnt * Wrate2 : mnt / Wrate2),
                            3);

                        if (curto != gbCurr2)
                        {
                            if (GetRates(cmSql, Convert.ToString(sdate), gbCurr1, gbCurr2, gbApp, curto, ref Wrate1, ref Wrate2, ref Wop1, ref Wop2,
                                  false, false, "", useRate2, 0, 0, "", "") == false)
                            {

                                return 0;
                            }
                            else
                            {

                                result = MathRound(
                                    convert5(cmSql,
                                        convert5(cmSql,
                                            mnt,
                                            curfrom,
                                            gbCurr2,
                                            Convert.ToDateTime(DateTime.Now.ToString("dd/MM/yyyy")), gbCurr1, gbCurr2, gbApp),
                                        gbCurr2,
                                        curto,
                                        Convert.ToDateTime(DateTime.Now.ToString("dd/MM/yyyy")), gbCurr1, gbCurr2, gbApp),
                                    3);
                            }
                        }

                        return result;
                    }
                }
            }
        }

        private void UpdInvNo(string serno, string DocTyp1, string DocPrefix, string LocationCode, SqlCommand cmSql = null)
        {
            string strsql;

            try
            {
                strsql = " Update POS_StockTransaction set stt_serno = " + (Convert.ToDouble(serno) + 1);
                strsql += " Where STT_LOCATION = '" + LocationCode + "'";
                strsql += " and STT_DOCTYPE1 = '" + DocTyp1 + "'";
                strsql += " and STT_PREFIX = '" + DocPrefix + "'";


                cmSql.CommandText = strsql;
                cmSql.ExecuteNonQuery();

            }
            catch (Exception)
            {
                throw;
            }
        }

        private long MaxCashTrnNo(SqlCommand cmSql, string locationCode)
        {
            string strsql;
            long maxCashTrnNo = 0;
            try
            {
                strsql = " select Isnull(Max(CT_OPNBR),0)  from POS_CASHTRANSACTION" +
                         " WHERE CT_LOCATION ='" + locationCode + "'";


                cmSql.CommandText = strsql;
                if (cmSql.ExecuteScalar() != null)
                    maxCashTrnNo = Convert.ToInt64(cmSql.ExecuteScalar().ToString());


            }
            catch (Exception)
            {
                throw;
            }

            return maxCashTrnNo;
        }

        private string ConvTime()
        {
            int HH;
            int MM;
            string min;
            string hor;

            try
            {
                HH = DateTime.Now.Hour;
                MM = DateTime.Now.Minute;

                if (MM.ToString().Trim().Length < 2)
                {
                    min = "0" + MM.ToString().Trim();
                }
                else
                {
                    min = MM.ToString().Trim();
                }

                if (HH.ToString().Trim().Length < 2)
                {
                    hor = "0" + HH.ToString().Trim();
                }
                else
                {
                    hor = HH.ToString().Trim();
                }

                return hor + ":" + min;
            }
            catch (Exception)
            {
                throw;
            }
        }

        private void CreateTmpCashTrans(string tbCashTab, SqlCommand cmSql)
        {
            string strsql;

            try
            {

                strsql = "if exists (select * from dbo.sysobjects where id = object_id(N'[dbo].[" + tbCashTab + "]') ";
                strsql += " and OBJECTPROPERTY(id, N'IsUserTable') = 1) ";
                strsql += " drop table [dbo].[" + tbCashTab + "]";

                strsql += " CREATE TABLE " + tbCashTab + " (";
                strsql += " [CT_LOCATION] [varchar] (2)  NOT NULL ,";
                strsql += " [CT_INVHEADER] [numeric](18, 0) NOT NULL ,";
                strsql += " [CT_CREGISTER] [varchar] (2)  NOT NULL ,";
                strsql += " [CT_OPNBR] [numeric](18, 0) NOT NULL ,";
                strsql += " [CT_OPDATE] [datetime] NULL ,";
                strsql += " [CT_RECID] [varchar] (1)  NULL ,";
                strsql += " [CT_TIME] [varchar] (12)   NULL ,";
                strsql += " [CT_INVNBR] [varchar] (11)   NOT NULL ,";
                strsql += " [CT_OPSIGN] [varchar] (1)   NULL ,";
                strsql += " [CT_SETTLTYPE] [varchar] (3)   NULL ,";
                strsql += " [CT_SETTLTYPEDesc] [varchar] (30)   NULL ,";
                strsql += " [CT_CURRCODE] [varchar] (3)   NULL ,";
                strsql += " [CT_AMOUNT] [numeric](18, 3) NULL ,";
                strsql += " [CT_AmtOpCurr] [numeric](18, 3) NULL ,";
                strsql += " [CT_RVtype] [varchar] (3)   NULL ,";
                strsql += " [CT_RVNo] [numeric](18, 0) NULL ,";
                strsql += " [CT_ChkNo] [varchar] (10)   NULL ,";
                strsql += " [CT_BANK] [numeric] (18,0)   NULL ,";
                strsql += " [CT_ValueDate] [datetime] NULL ,";
                strsql += " [CT_NRID] [numeric](18, 0) NULL ,";
                strsql += " [CT_NRRef] [varchar] (10)   NULL ,";
                strsql += " [CT_DueDate] [datetime] NULL ,";
                strsql += " [CT_SignDate] [datetime] NULL ,";
                strsql += " [CT_GuarName] [nvarchar] (100) COLLATE SQL_Latin1_General_CP1256_CI_AS NULL ,";
                strsql += " [CT_AuthoStr] [nvarchar] (30)   NULL ,";
                strsql += " [CT_BonLoc] [varchar] (2) NULL ,";
                strsql += " [CT_BonAchatSer] [numeric](18, 0) NULL ,";
                strsql += " [CT_DSTAMP] [datetime] NULL ,";
                strsql += " [CT_USTAMP] [varchar] (4)   NULL, CT_CashFromSO [varchar] (1) NULL,";
                strsql += " btnDelete varchar(10) NULL , ";
                strsql += " [CT_Operator] VARCHAR(1) NULL ,";
                strsql += " [CT_RATE] NUMERIC(18,3) NULL ,";
                strsql += " CONSTRAINT [PK_" + tbCashTab + "] PRIMARY KEY CLUSTERED ([CT_OPNBR] Asc))";

                cmSql.CommandText = strsql;
                cmSql.ExecuteNonQuery();

            }
            catch (Exception)
            {
                throw;
            }
        }

        private double convertSP(string gbCurr1,
                                string gbCurr2,
                                string SP,
                                double mnt,
                                string curfrom,
                                string curto,
                                DateTime sDate,
                                bool rate2 = false,
                                double rateLC = 0,
                                string opLC = "",
                                double rateCC = 0,
                                string opCC = "",
                                SqlCommand cmSql = null)
        {
            double Value = 0;
            double lcRateLC = 0, lcRateCC = 0;
            string lcOpLC = "", lcOpCC = "";

            try
            {
                if (rateLC != 0 || rateCC != 0)
                {
                    lcRateLC = rateLC;
                    lcRateCC = rateCC;
                    lcOpLC = opLC;
                    lcOpCC = opCC;
                }

                if (curfrom == curto)
                {
                    return mnt;
                }

                if (curfrom == gbCurr1)
                {
                    if ((rateLC == 0 && rateCC == 0) &&
                        GetSPRates(cmSql, SP,
                            Convert.ToDateTime(Convert.ToDateTime(sDate).ToString("dd/MM/yyyy")),
                            curto,
                            rate2) == false)
                    {

                        return 0;
                    }
                    else
                    {
                        if (lcRateLC == 0 && lcRateCC == 0)
                        {
                            lcRateLC = Wrate1;
                            lcRateCC = Wrate2;
                        }

                        if (lcOpLC == "")
                            lcOpLC = Wop1;

                        if (lcOpCC == "")
                            lcOpCC = Wop2;

                        Value = lcOpLC == "*"
                            ? mnt / lcRateLC
                            : mnt * lcRateLC;

                        if (Value.ToString().IndexOf("E+") > 0)
                            return -0.0123456;
                        else
                            return lcOpLC == "*"
                                ? mnt / lcRateLC
                                : mnt * lcRateLC;
                    }
                }
                else if (curfrom == gbCurr2)
                {
                    if (curto == gbCurr1)
                    {
                        if ((rateLC == 0 && rateCC == 0) &&
                            GetSPRates(cmSql, SP,
                                Convert.ToDateTime(Convert.ToDateTime(sDate).ToString("dd/MM/yyyy")),
                                curfrom,
                                rate2) == false)
                        {

                            return 0;
                        }
                        else
                        {
                            if (lcRateLC == 0 && lcRateCC == 0)
                            {
                                lcRateLC = Wrate1;
                                lcRateCC = Wrate2;
                            }

                            if (lcOpLC == "")
                                lcOpLC = Wop1;

                            if (lcOpCC == "")
                                lcOpCC = Wop2;

                            Value = lcOpLC == "*"
                                ? mnt * lcRateLC
                                : mnt / lcRateLC;

                            if (Value.ToString().IndexOf("E+") > 0)
                                return -0.0123456;
                            else
                                return lcOpLC == "*"
                                    ? mnt * lcRateLC
                                    : mnt / lcRateLC;
                        }
                    }
                    else
                    {
                        if ((rateLC == 0 && rateCC == 0) &&
                            GetSPRates(cmSql, SP,
                                Convert.ToDateTime(Convert.ToDateTime(sDate).ToString("dd/MM/yyyy")),
                                curto,
                                rate2) == false)
                        {

                            return 0;
                        }
                        else
                        {
                            if (lcRateLC == 0 && lcRateCC == 0)
                            {
                                lcRateLC = Wrate1;
                                lcRateCC = Wrate2;
                            }

                            if (lcOpLC == "")
                                lcOpLC = Wop1;

                            if (lcOpCC == "")
                                lcOpCC = Wop2;

                            Value = lcOpCC == "*"
                                ? mnt / lcRateCC
                                : mnt * lcRateCC;

                            if (Value.ToString().IndexOf("E+") > 0)
                                return -0.0123456;
                            else
                                return lcOpCC == "*"
                                    ? mnt / lcRateCC
                                    : mnt * lcRateCC;
                        }
                    }
                }
                else
                {
                    if ((rateLC == 0 && rateCC == 0) &&
                        GetSPRates(cmSql, SP,
                            Convert.ToDateTime(Convert.ToDateTime(sDate).ToString("dd/MM/yyyy")),
                            curfrom,
                            rate2) == false)
                    {

                        return 0;
                    }
                    else
                    {
                        if (lcRateLC == 0 && lcRateCC == 0)
                        {
                            lcRateLC = Wrate1;
                            lcRateCC = Wrate2;
                        }

                        if (lcOpLC == "")
                            lcOpLC = Wop1;

                        if (lcOpCC == "")
                            lcOpCC = Wop2;

                        if (curto == gbCurr1)
                        {
                            Value = lcOpLC == "*"
                                ? mnt * lcRateLC
                                : mnt / lcRateLC;

                            if (Value.ToString().IndexOf("E+") > 0)
                                return -0.0123456;
                            else
                                return lcOpLC == "*"
                                    ? mnt * lcRateLC
                                    : mnt / lcRateLC;
                        }
                        else
                        {
                            Value = lcOpCC == "*"
                                ? mnt * lcRateCC
                                : mnt / lcRateCC;

                            if (Value.ToString().IndexOf("E+") > 0)
                                return -0.0123456;
                            else
                                Value = lcOpCC == "*"
                                    ? mnt * lcRateCC
                                    : mnt / lcRateCC;

                            if (curto != gbCurr2)
                            {
                                if ((rateLC == 0 && rateCC == 0) &&
                                    GetSPRates(cmSql, SP,
                                        Convert.ToDateTime(Convert.ToDateTime(sDate).ToString("dd/MM/yyyy")),
                                        curto,
                                        rate2) == false)
                                {

                                    return 0;
                                }
                                else
                                {
                                    return convertSP(gbCurr1,
                                        gbCurr2,
                                        SP,
                                        convertSP(gbCurr1,
                                        gbCurr2,
                                            SP,
                                            mnt,
                                            curfrom,
                                            gbCurr2,
                                            Convert.ToDateTime(DateTime.Now.ToString("dd/MM/yyyy"))),
                                        gbCurr2,
                                        curto,
                                        Convert.ToDateTime(DateTime.Now.ToString("dd/MM/yyyy")));
                                }
                            }

                            return Value;
                        }
                    }
                }
            }
            catch (Exception)
            {
                throw;
            }
        }

        private bool GetSPRates(SqlCommand cmSql, string SP, DateTime Wdate, string WCurr = "", bool rate2 = false)
        {
            string strsql;
            SqlDataReader drSql = null;

            try
            {
                Wrate1 = 1;
                Wrate2 = 1;
                Wop1 = "*";
                Wop2 = "*";

                //Get The Rates From DailyRate

                strsql = "SELECT ";

                if (rate2)
                {
                    strsql += " DR_Rate2LC DC_RateLC,";
                    strsql += " DR_Op2LC DC_OpLC,";
                    strsql += " DR_Rate2CC DC_RateCC,";
                    strsql += " DR_Op2CC DC_OpCC";
                }
                else
                {
                    strsql += " (CASE WHEN App_Rate=1 THEN DR_Rate1LC ELSE (CASE WHEN App_Rate=2 THEN DR_Rate2LC ELSE DR_Rate3LC END ) END  ) DC_RateLC,";
                    strsql += " (CASE WHEN App_Rate=1 THEN DR_Op1LC ELSE (CASE WHEN App_Rate=2 THEN DR_Op2LC ELSE DR_Op3LC END ) END  ) DC_OpLC,";
                    strsql += " (CASE WHEN App_Rate=1 THEN DR_Rate1CC ELSE (CASE WHEN App_Rate=2 THEN DR_Rate2CC ELSE DR_Rate3CC END ) END  ) DC_RateCC,";
                    strsql += " (CASE WHEN App_Rate=1 THEN DR_Op1CC ELSE (CASE WHEN App_Rate=2 THEN DR_Op2CC ELSE DR_Op3CC END ) END  ) DC_OpCC";
                }

                strsql += " FROM dbo.Com_DailyRate inner JOIN Com_Application ON App_Code='" + SP + "'";
                strsql += " WHERE DR_Date='" + Convert.ToDateTime(Wdate).ToString("MM/dd/yyyy") + "' ";

                if (WCurr != "")
                    strsql += " and DR_CurCode='" + WCurr + "'";

                cmSql.CommandText = strsql;
                drSql = cmSql.ExecuteReader();


                if (drSql.HasRows)
                {
                    drSql.Read();

                    Wrate1 = Convert.ToDouble(drSql["Dc_RateLC"].ToString());
                    Wrate2 = Convert.ToDouble(drSql["Dc_RateCC"].ToString());
                    Wop1 = drSql["Dc_OpLC"].ToString();
                    Wop2 = drSql["Dc_OpCC"].ToString();

                    if (Wrate1 == 0)
                        Wrate1 = 1;

                    if (Wrate2 == 0)
                        Wrate2 = 1;

                    return true;
                }
                else
                {
                    if (Wrate1 == 0)
                        Wrate1 = 1;

                    if (Wrate2 == 0)
                        Wrate2 = 1;

                    return false;
                }
            }
            catch (Exception)
            {
                throw;
            }
            finally
            {
                if (drSql != null)
                {
                    if (!drSql.IsClosed)
                        drSql.Close();

                    drSql = null;
                }
            }
        }

        private void InsertCashTransaction(SqlCommand cmSql,
                                                  string invHead,
                                                  string locationcode,
                                                  string DocTyp1,
                                                  string DocPrefix,
                                                  string Serno1,
                                                  string cashReg,
                                                  DateTime WorkingDay,
                                                  string gbApp,
                                                  string gbComp,
                                                  string gbYear,
                                                  string gbUser,
                                                  string gbCurr1,
                                                  string gbCurr2,
                                                  string tbCashTab,
                                                  string Currency,
                                                  double Amount,
                                                  double Rate,
                                                  string Opr,
                                                  double Rate2,
                                                  string Opr2)
        {
            string strsql;
            double CTOpNbr;
            string RateUsed;
            long MaxCash;
            string txttime, TxtItype;
            double AmountCC = 0;
            double InheritRateLC, InheritRateCC;
            string InheritOpLC, InheritOpCC;
            try
            {
                txttime = ConvTime();

                if (Currency == gbCurr1 || Currency == gbCurr2)
                {
                    InheritRateLC = Convert.ToDouble(Rate);

                    if (Currency == gbCurr1)
                    {
                        if (Opr == "*")
                        {
                            InheritOpLC = "/";
                        }
                        else
                        {
                            InheritOpLC = "*";
                        }
                    }
                    else
                    {
                        InheritOpLC = Opr;
                    }

                    InheritRateCC = 1;
                    InheritOpCC = "*";
                }
                else
                {
                    InheritRateLC = Convert.ToDouble(Rate);
                    InheritOpLC = Opr;
                    InheritRateCC = Convert.ToDouble(Rate2);
                    InheritOpCC = Opr2;
                }

                AmountCC = convertSP(gbCurr1,
                                        gbCurr2,
                                        gbApp,
                                        Amount,
                                        Currency,
                                        Currency,
                                        Convert.ToDateTime(WorkingDay),
                                        true,
                                        InheritRateLC,
                                        InheritOpLC,
                                        InheritRateCC,
                                        InheritOpCC
                                    );

                // fill tbCashTab
                strsql = " DECLARE @OPCC AS VARCHAR(1)";
                strsql += " SELECT @OPCC = ";
                strsql += " CASE WHEN '" + Currency + "' = '" + gbCurr1 + "' THEN CASE WHEN ( CASE WHEN App_Rate = 1 THEN DR_Op1LC";
                strsql += " ELSE ( CASE WHEN App_Rate = 2 THEN DR_Op2LC ELSE DR_Op3LC END ) END ) = '*' THEN '/' ELSE '*' End";
                strsql += " ELSE CASE WHEN App_Rate = 1 THEN DR_Op1LC";
                strsql += " ELSE ( CASE WHEN App_Rate = 2 THEN DR_Op2LC ELSE DR_Op3LC END ) End END ";
                strsql += " FROM dbo.Com_DailyRate inner JOIN Com_Application ON App_Code='" + gbApp + "'";
                strsql += " WHERE DR_Date='" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "' AND DR_CurCode='" +
                          Convert.ToString(Currency == gbCurr1 ? gbCurr2 : Currency) + "' ";

                strsql += " INSERT INTO " + tbCashTab;
                strsql += " VALUES ( '" + locationcode + "',";
                strsql += "'0',";
                strsql += " '" + cashReg + "','1',";
                strsql += " '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "','T','" + txttime + "',";
                strsql += " '',";
                strsql += " '-',";
                strsql += " '500',";
                strsql += " '" + GetFieldDesc(
                    "Stk04_SETTLEMENTTYPE",
                    "ST_Loc='" + locationcode + "' and ST_CODE='500'",
                    "ST_DESC", cmSql).Replace("'", "''") + "', ";
                strsql += " '" + Currency + "',";
                strsql += " '" + (-1 * Math.Abs(Amount)) + "',";
                strsql += " '" + (-1 * Math.Abs(AmountCC)) + "',";
                strsql += " '',0,";
                strsql += "'',Null, Null";
                strsql += " , 0,'', null, null, '','',";
                strsql += " NULL ";

                strsql += " ,'0' ";
                strsql += ",getdate(),'" + gbUser + "','N','Delete' ";
                strsql += " , ";
                strsql += " @OPCC ";
                strsql += " , 0  ) ";

                cmSql.CommandText = strsql;
                cmSql.ExecuteNonQuery();

                strsql = " Update " + tbCashTab + " SET CT_RATE = CASE WHEN CT_Operator = '*' THEN (CT_AmtOpCurr /  CT_AMOUNT ) ELSE (CT_AMOUNT / CT_AmtOpCurr  ) END ";
                cmSql.CommandText = strsql;
                cmSql.ExecuteNonQuery();

                //get max cash transaction
                MaxCash = MaxCashTrnNo(cmSql, locationcode);



                RateUsed = GetFieldDesc("Com_Application",
                                          " App_Code = '" + gbApp + "' ",
                                          " App_Rate ", cmSql
                );

                TxtItype = DocTyp1.Trim() + DocPrefix.Trim() + " " + Convert.ToString(Serno1);

                //insert into POS_CashTransaction

                strsql = " SELECT ISNULL(MAX(CT_OPNBR),0) FROM POS_CashTransaction WITH (TABLOCKX) WHERE CT_LOCATION = '" + locationcode + "' ";

                cmSql.CommandText = strsql;
                CTOpNbr = Convert.ToDouble(cmSql.ExecuteScalar());

                strsql = "INSERT INTO POS_CASHTRANSACTION SELECT '" + locationcode + "', " + invHead;
                strsql += ", '" + cashReg + "', ";
                strsql += " (CT_OPNBR + " + CTOpNbr + " ), CT_OPDATE, 'T', '";
                strsql += txttime + "', '" + TxtItype + "', CT_OPSIGN, CT_SETTLTYPE, CT_CURRCODE, ";
                strsql += " Abs(CT_Amount), Abs(CT_AmtOpCurr),";

                strsql += " NULL, NULL, ";

                strsql += " CT_ChkNo, CT_Bank, CT_ValueDate, ";
                strsql += " NULL, NULL, NULL, NULL, CT_GuarName, CT_AuthoStr, NULL, ";

                strsql += "NULL , ";

                strsql += "getdate(), '" + gbUser + "' , NULL  ";
                strsql += " FROM " + tbCashTab + " ";

                strsql += " ; INSERT INTO POS_CashTransCVRate SELECT '" + locationcode + "', " + invHead;
                strsql += ", '" + cashReg + "', ";
                strsql += " (CT_OPNBR + " + CTOpNbr + " ), ";

                strsql += " dbo.convertSPRate('" + gbApp + "', '" + gbComp + "', '" + gbYear + "', Abs(CT_Amount), CT_CURRCODE, '" + gbCurr1 + "', '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "',2) ,";
                strsql += " CASE WHEN dbo.convertSPRate('" + gbApp + "', '" + gbComp + "', '" + gbYear + "', Abs(CT_Amount), CT_CURRCODE, '" + gbCurr1 + "', '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "',2) = 0 THEN 0 ELSE ";
                strsql += " Case When CT_CURRCODE = '" + gbCurr1 + "' Then 1 Else";
                strsql += " CASE WHEN ";

                strsql += " (SELECT DR_Op" + RateUsed + "LC FROM Com_DailyRate WHERE DR_CurCode = (CASE WHEN CT_CURRCODE = '" + gbCurr1 + "' THEN '" + gbCurr2 + "' ELSE CT_CURRCODE END) AND DR_Date = '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "' ) ";

                strsql += " = '*' ";
                strsql += " 	THEN dbo.convertSPRate('" + gbApp + "', '" + gbComp + "', '" + gbYear + "', Abs(CT_Amount),CT_CURRCODE, '" + gbCurr1 + "', '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "',2) / Abs(CT_Amount)";
                strsql += " 	ELSE Abs(CT_Amount) / dbo.convertSPRate('" + gbApp + "', '" + gbComp + "', '" + gbYear + "', Abs(CT_Amount), CT_CURRCODE, '" + gbCurr1 + "', '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "',2) ";
                strsql += " END END END ,";

                strsql += " dbo.convertSPRate('" + gbApp + "', '" + gbComp + "', '" + gbYear + "', Abs(CT_Amount), CT_CURRCODE, '" + gbCurr2 + "', '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "',2) ,";

                strsql += " Case When  dbo.convertSPRate('" + gbApp + "', '" + gbComp + "','" + gbYear + "', Abs(CT_Amount),CT_CURRCODE, '" + gbCurr2 + "','" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "',2) = 0 THEN 0 ELSE ";
                strsql += " CASE WHEN CT_CURRCODE = '" + gbCurr1 + "' THEN ";
                strsql += " 	CASE WHEN ";

                strsql += " (SELECT DR_Op" + RateUsed + "LC FROM Com_DailyRate WHERE DR_CurCode = (CASE WHEN CT_CURRCODE = '" + gbCurr1 + "' THEN '" + gbCurr2 + "' ELSE CT_CURRCODE END) AND DR_Date = '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "' ) ";

                strsql += " = '*'";
                strsql += " 		THEN Abs(CT_Amount) / dbo.convertSPRate('" + gbApp + "', '" + gbComp + "','" + gbYear + "', Abs(CT_Amount),CT_CURRCODE, '" + gbCurr2 + "','" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "',2)";
                strsql += " 		ELSE dbo.convertSPRate('" + gbApp + "', '" + gbComp + "','" + gbYear + "', Abs(CT_Amount), CT_CURRCODE, '" + gbCurr2 + "', '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "',2) / Abs(CT_Amount) ";
                strsql += " 	END";
                strsql += " WHEN CT_CURRCODE = '" + gbCurr2 + "' THEN CONVERT(DECIMAL(18,3),1) ";
                strsql += " ELSE 	 ";
                strsql += " 	CASE WHEN ";

                strsql += " (SELECT DR_Op" + RateUsed + "CC FROM Com_DailyRate WHERE DR_CurCode = (CASE WHEN CT_CURRCODE = '" + gbCurr1 + "' THEN '" + gbCurr2 + "' ELSE CT_CURRCODE END) AND DR_Date = '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "' ) ";

                strsql += " = '*'";
                strsql += " 		THEN dbo.convertSPRate('" + gbApp + "', '" + gbComp + "', '" + gbYear + "', Abs(CT_Amount), CT_CURRCODE, '" + gbCurr2 + "', '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "',2) / Abs(CT_Amount)";
                strsql += " 		ELSE Abs(CT_Amount) / dbo.convertSPRate('" + gbApp + "', '" + gbComp + "', '" + gbYear + "', Abs(CT_Amount), CT_CURRCODE, '" + gbCurr2 + "', '" + Convert.ToDateTime(WorkingDay).ToString("MM/dd/yyyy") + "',2) ";
                strsql += " 	END";
                strsql += " END END ";

                strsql += " FROM " + tbCashTab;

                cmSql.CommandText = strsql;
                cmSql.ExecuteNonQuery();

            }
            catch (Exception)
            {
                throw;
            }
        }


        private void InsertAccRemark(SqlCommand cmsql, double RecID, string locationCode, string additionalRemark = "") {
         string strsql;
         try {
           if (additionalRemark.Trim() != "") {
             strsql = "  INSERT INTO dbo.POS_SALEINVHEADAccRemark";
             strsql += " VALUES  ( ";
             strsql += " '" + locationCode + "' , ";
             strsql += " " + RecID + " , ";
             strsql += " N'" + Microsoft.VisualBasic.Strings.Left(additionalRemark, 500).Trim().Replace(" '", "''") + "'  ";
             strsql += " ) ";

             cmsql.CommandText = strsql;
             cmsql.ExecuteNonQuery();
           }
         } catch (Exception ex) {
           throw;
         }
       }

       }
    }






