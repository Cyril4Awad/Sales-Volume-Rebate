
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ============================================================
-- 1. CVR_Types
-- ============================================================
CREATE TABLE [dbo].[CVR_Types](
    [VRT_TypeID]    [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [VRT_TypeName]  [nvarchar](100)  NOT NULL,
    [VRT_Behavior]  [nvarchar](1)    NULL,
    [VRT_Remarks]   [nvarchar](500)  NULL,
    [VRT_Active]    [bit]            NOT NULL,
    [VRT_CDStamp]   [datetime]       NOT NULL,
    [VRT_CUStamp]   [nvarchar](4)    NULL,
    [VRT_MDStamp]   [datetime]       NULL,
    [VRT_MUStamp]   [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_Types] PRIMARY KEY CLUSTERED ([VRT_TypeID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE CVR_Types
ADD CONSTRAINT UQ_Types_Name UNIQUE (VRT_TypeName);
ALTER TABLE [dbo].[CVR_Types] ADD DEFAULT ((1))       FOR [VRT_Active];
ALTER TABLE [dbo].[CVR_Types] ADD DEFAULT (getdate()) FOR [VRT_CDStamp];
ALTER TABLE CVR_Types ADD CONSTRAINT UQ_Types_Name UNIQUE (VRT_TypeName);
GO

-- ============================================================
-- 2. CVR_ComputationType
-- ============================================================
CREATE TABLE [dbo].[CVR_ComputationType](
    [FRT_ComputationTypeID]   [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [FRT_ComputationTypeName] [nvarchar](100)  NOT NULL,
    [FRT_PeriodLength]        [numeric](18, 0) NULL,
    [FRT_IsCustom]            [bit]            NOT NULL,
    [FRT_Remarks]             [nvarchar](500)  NULL,
    [FRT_Active]              [bit]            NOT NULL,
    [FRT_CDStamp]             [datetime]       NOT NULL,
    [FRT_CUStamp]             [nvarchar](4)    NULL,
    [FRT_MDStamp]             [datetime]       NULL,
    [FRT_MUStamp]             [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_ComputationType] PRIMARY KEY CLUSTERED ([FRT_ComputationTypeID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE CVR_ComputationType
ADD CONSTRAINT UQ_ComputationType_Name UNIQUE (FRT_ComputationTypeName);
ALTER TABLE CVR_ComputationType ADD CONSTRAINT UQ_ComputationType_Name UNIQUE (FRT_ComputationTypeName);
ALTER TABLE [dbo].[CVR_ComputationType] ADD DEFAULT ((0))       FOR [FRT_IsCustom];
ALTER TABLE [dbo].[CVR_ComputationType] ADD DEFAULT ((1))       FOR [FRT_Active];
ALTER TABLE [dbo].[CVR_ComputationType] ADD DEFAULT (getdate()) FOR [FRT_CDStamp];
GO

-- ============================================================
-- 3. CVR_SettlementTypes
-- ============================================================
CREATE TABLE [dbo].[CVR_SettlementTypes](
    [STT_SettlementTypeID]   [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [STT_SettlementTypeName] [nvarchar](100)  NOT NULL,
    [STT_PeriodLength]       [numeric](18, 0) NULL,
    [STT_IsCustom]           [bit]            NOT NULL,
    [STT_Remarks]            [nvarchar](500)  NULL,
    [STT_Active]             [bit]            NOT NULL,
    [STT_CDStamp]            [datetime]       NOT NULL,
    [STT_CUStamp]            [nvarchar](4)    NULL,
    [STT_MDStamp]            [datetime]       NULL,
    [STT_MUStamp]            [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_SettlementTypes] PRIMARY KEY CLUSTERED ([STT_SettlementTypeID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE CVR_SettlementTypes
ADD CONSTRAINT UQ_SettlementType_Name UNIQUE (STT_SettlementTypeName);
ALTER TABLE CVR_SettlementTypes ADD CONSTRAINT UQ_SettlementType_Name UNIQUE (STT_SettlementTypeName);
ALTER TABLE [dbo].[CVR_SettlementTypes] ADD DEFAULT ((0))       FOR [STT_IsCustom];
ALTER TABLE [dbo].[CVR_SettlementTypes] ADD DEFAULT ((1))       FOR [STT_Active];
ALTER TABLE [dbo].[CVR_SettlementTypes] ADD DEFAULT (getdate()) FOR [STT_CDStamp];
GO

-- ============================================================
-- 4. CVR_Contracts
-- ============================================================
CREATE TABLE [dbo].[CVR_Contracts](
	[CTR_ContractID] [numeric](18, 0) IDENTITY(1,1) NOT NULL,
	[CTR_ClientID] [numeric](18, 0) NOT NULL,
	[CTR_ContractReference] [nvarchar](50) NOT NULL,
	[CTR_ContractName] [nvarchar](100) NULL,
	[CTR_ContractCurrency] [varchar](3) NULL,
	[CTR_StartDate] [date] NULL,
	[CTR_EndDate] [date] NULL,
	[CTR_Terms] [nvarchar](max) NULL,
	[CTR_Document] [varbinary](max) NULL,
	[CTR_DocumentName] [nvarchar](500) NULL,
	[CTR_Remarks] [nvarchar](500) NULL,
	[CTR_Active] [bit] NOT NULL,
	[CTR_CDStamp] [datetime] NOT NULL,
	[CTR_CUStamp] [nvarchar](4) NULL,
	[CTR_MDStamp] [datetime] NULL,
	[CTR_MUStamp] [nvarchar](4) NULL,
 CONSTRAINT [PK_CVR_Contracts] PRIMARY KEY CLUSTERED 
(
	[CTR_ContractID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [UQ_CVR_Contracts_Ref] UNIQUE NONCLUSTERED 
(
	[CTR_ContractReference] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_Contracts] ADD  DEFAULT ((1)) FOR [CTR_Active]
GO
ALTER TABLE [dbo].[CVR_Contracts] ADD  DEFAULT (getdate()) FOR [CTR_CDStamp]
GO
ALTER TABLE [dbo].[CVR_Contracts]  WITH CHECK ADD  CONSTRAINT [FK_CVR_Contracts_Clients] FOREIGN KEY([CTR_ClientID])
REFERENCES [dbo].[Stk04_Clients] ([CL_RecID])
GO
ALTER TABLE [dbo].[CVR_Contracts] CHECK CONSTRAINT [FK_CVR_Contracts_Clients]
GO

-- ============================================================
-- 5. CVR_ContractClients
-- ============================================================
CREATE TABLE [dbo].[CVR_ContractClients](
    [CTC_ContractClientID] [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [CTC_ContractID]       [numeric](18, 0) NOT NULL,
    [CTC_ClientID]         [numeric](18, 0) NOT NULL,
    [CTC_CDStamp]          [datetime]       NOT NULL,
    [CTC_CUStamp]          [nvarchar](4)    NULL,
    [CTC_MDStamp]          [datetime]       NULL,
    [CTC_MUStamp]          [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_ContractClients] PRIMARY KEY CLUSTERED ([CTC_ContractClientID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_ContractClients] ADD DEFAULT (getdate()) FOR [CTC_CDStamp];
GO
ALTER TABLE [dbo].[CVR_ContractClients] WITH CHECK
    ADD CONSTRAINT [FK_CVR_ContractClients_Clients] FOREIGN KEY([CTC_ClientID])
    REFERENCES [dbo].[Stk04_Clients] ([CL_RecID]);
ALTER TABLE [dbo].[CVR_ContractClients] CHECK CONSTRAINT [FK_CVR_ContractClients_Clients];
GO
ALTER TABLE [dbo].[CVR_ContractClients] WITH CHECK
    ADD CONSTRAINT [FK_CVR_ContractClients_Contract] FOREIGN KEY([CTC_ContractID])
    REFERENCES [dbo].[CVR_Contracts] ([CTR_ContractID]);
ALTER TABLE [dbo].[CVR_ContractClients] CHECK CONSTRAINT [FK_CVR_ContractClients_Contract];
GO

-- ============================================================
-- 6. CVR_Plans
-- ============================================================
CREATE TABLE [dbo].[CVR_Plans](
    [PLN_PlanID]       [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [PLN_ContractID]   [numeric](18, 0) NOT NULL,
    [PLN_TypeID]       [numeric](18, 0) NOT NULL,
    [PLN_PlanName]     [nvarchar](100)  NOT NULL,
    [PLN_Remarks]      [nvarchar](500)  NULL,
    [PLN_Active]       [bit]            NOT NULL,
    [PLN_CDStamp]      [datetime]       NOT NULL,
    [PLN_CUStamp]      [nvarchar](4)    NULL,
    [PLN_MDStamp]      [datetime]       NULL,
    [PLN_MUStamp]      [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_Plans] PRIMARY KEY CLUSTERED ([PLN_PlanID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_Plans] ADD DEFAULT ((1))       FOR [PLN_Active];
ALTER TABLE [dbo].[CVR_Plans] ADD DEFAULT (getdate()) FOR [PLN_CDStamp];
GO
ALTER TABLE [dbo].[CVR_Plans] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Plans_Contracts] FOREIGN KEY([PLN_ContractID])
    REFERENCES [dbo].[CVR_Contracts] ([CTR_ContractID]);
ALTER TABLE [dbo].[CVR_Plans] CHECK CONSTRAINT [FK_CVR_Plans_Contracts];
GO
ALTER TABLE [dbo].[CVR_Plans] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Plans_Types] FOREIGN KEY([PLN_TypeID])
    REFERENCES [dbo].[CVR_Types] ([VRT_TypeID]);
ALTER TABLE [dbo].[CVR_Plans] CHECK CONSTRAINT [FK_CVR_Plans_Types];
GO

-- ============================================================
-- 7. CVR_Fees
-- ============================================================
CREATE TABLE [dbo].[CVR_Fees](
    [FEE_FeeID]         [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [FEE_PlanID]        [numeric](18, 0) NOT NULL,
    [FEE_Name]          [nvarchar](100)  NOT NULL,
    [FEE_Currency]      [varchar](3)     NULL,
    [FEE_Amount]        [numeric](18, 3) NULL,
    [FEE_SettlementType][numeric](18, 0) NULL,
    [FEE_CDStamp]       [datetime]       NOT NULL,
    [FEE_CUStamp]       [nvarchar](4)    NULL,
    [FEE_MDStamp]       [datetime]       NULL,
    [FEE_MUStamp]       [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_Fees] PRIMARY KEY CLUSTERED ([FEE_FeeID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_Fees] ADD DEFAULT (getdate()) FOR [FEE_CDStamp];
GO
ALTER TABLE [dbo].[CVR_Fees] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Fees_Plans] FOREIGN KEY([FEE_PlanID])
    REFERENCES [dbo].[CVR_Plans] ([PLN_PlanID]);
ALTER TABLE [dbo].[CVR_Fees] CHECK CONSTRAINT [FK_CVR_Fees_Plans];
GO
ALTER TABLE [dbo].[CVR_Fees] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Fees_SettlementTypes] FOREIGN KEY([FEE_SettlementType])
    REFERENCES [dbo].[CVR_SettlementTypes] ([STT_SettlementTypeID]);
ALTER TABLE [dbo].[CVR_Fees] CHECK CONSTRAINT [FK_CVR_Fees_SettlementTypes];
GO

-- ============================================================
-- 8. CVR_Targets
-- ============================================================
CREATE TABLE [dbo].[CVR_Targets](
    [TAR_TargetID]          [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [TAR_PlanID]            [numeric](18, 0) NOT NULL,
    [TAR_TargetName]        [nvarchar](100)  NULL,
    [TAR_FromDate]          [date]           NULL,
    [TAR_ToDate]            [date]           NULL,
    [TAR_RebateValueType]   [varchar](1)     NULL,
    [TAR_RebateValue]       [numeric](18, 3) NULL,
    [TAR_Currency]          [varchar](3)     NULL,
    [TAR_SettlementTypeID]  [numeric](18, 0) NULL,
    [TAR_ComputationTypeID] [numeric](18, 0) NULL,
    [TAR_TargetType]        [varchar](1)     NULL,
    [TAR_Override]          [bit]            NOT NULL,
    [TAR_CDStamp]           [datetime]       NOT NULL,
    [TAR_CUStamp]           [nvarchar](4)    NULL,
    [TAR_MDStamp]           [datetime]       NULL,
    [TAR_MUStamp]           [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_Targets] PRIMARY KEY CLUSTERED ([TAR_TargetID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_Targets] ADD CONSTRAINT [DF_CVR_Targets_RebateValueType] DEFAULT ('F') FOR [TAR_RebateValueType];
ALTER TABLE [dbo].[CVR_Targets] ADD DEFAULT (getdate()) FOR [TAR_CDStamp];
ALTER TABLE [dbo].[CVR_Targets] ADD DEFAULT ((0))       FOR [TAR_Override];
GO
ALTER TABLE [dbo].[CVR_Targets] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Targets_ComCurrency] FOREIGN KEY([TAR_Currency])
    REFERENCES [dbo].[Com_Currency] ([Cur_Code]);
ALTER TABLE [dbo].[CVR_Targets] CHECK CONSTRAINT [FK_CVR_Targets_ComCurrency];
GO
ALTER TABLE [dbo].[CVR_Targets] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Targets_ComputationTypes] FOREIGN KEY([TAR_ComputationTypeID])
    REFERENCES [dbo].[CVR_ComputationType] ([FRT_ComputationTypeID]);
ALTER TABLE [dbo].[CVR_Targets] CHECK CONSTRAINT [FK_CVR_Targets_ComputationTypes];
GO
ALTER TABLE [dbo].[CVR_Targets] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Targets_Plans] FOREIGN KEY([TAR_PlanID])
    REFERENCES [dbo].[CVR_Plans] ([PLN_PlanID]);
ALTER TABLE [dbo].[CVR_Targets] CHECK CONSTRAINT [FK_CVR_Targets_Plans];
GO
ALTER TABLE [dbo].[CVR_Targets] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Targets_SettlementTypes] FOREIGN KEY([TAR_SettlementTypeID])
    REFERENCES [dbo].[CVR_SettlementTypes] ([STT_SettlementTypeID]);
ALTER TABLE [dbo].[CVR_Targets] CHECK CONSTRAINT [FK_CVR_Targets_SettlementTypes];
GO

-- ============================================================
-- 9. CVR_TargetConditions
-- ============================================================
CREATE TABLE [dbo].[CVR_TargetConditions](
    [TCD_TargetConditionID]  [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [TCD_TargetID]           [numeric](18, 0) NOT NULL,
    [TCD_ConditionType]      [nvarchar](1)    NULL,
    [TCD_Operator]           [nvarchar](2)    NULL,
    [TCD_Value]              [numeric](18, 3) NULL,
    [TCD_LogicalGroup]       [numeric](18, 0) NULL,
    [TCD_LogicalOperator]    [nvarchar](3)    NULL,
    [TCD_SalesAmountCurrency][varchar](3)     NULL,
    [TCD_RebateType]         [varchar](1)     NULL,
    [TCD_RebateCurrency]     [varchar](3)     NULL,
    [TCD_RebateAmount]       [numeric](18, 3) NULL,
    [TCD_CDStamp]            [datetime]       NOT NULL,
    [TCD_CUStamp]            [nvarchar](4)    NULL,
    [TCD_MDStamp]            [datetime]       NULL,
    [TCD_MUStamp]            [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_TargetConditions] PRIMARY KEY CLUSTERED ([TCD_TargetConditionID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_TargetConditions] ADD DEFAULT (getdate()) FOR [TCD_CDStamp];
GO
ALTER TABLE CVR_TargetConditions WITH CHECK
    ADD CONSTRAINT FK_CVR_TargetConditions_Targets
    FOREIGN KEY (TCD_TargetID) REFERENCES CVR_Targets (TAR_TargetID);
GO

-- ============================================================
-- 10. CVR_TargetReferences
-- ============================================================
CREATE TABLE [dbo].[CVR_TargetReferences](
    [TRF_TargetScopeReferenceID] [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [TRF_TargetID]               [numeric](18, 0) NOT NULL,
    [TRF_ScopeType]              [nvarchar](1)    NULL,
    [TRF_StockItemID]            [numeric](18, 0) NULL,
    [TRF_ProductGroupID]         [numeric](18, 0) NULL,
    [TRF_CDStamp]                [datetime]       NOT NULL,
    [TRF_CUStamp]                [nvarchar](4)    NULL,
    [TRF_MDStamp]                [datetime]       NULL,
    [TRF_MUStamp]                [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_TargetReferences] PRIMARY KEY CLUSTERED ([TRF_TargetScopeReferenceID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_TargetReferences] ADD DEFAULT (getdate()) FOR [TRF_CDStamp];
GO
ALTER TABLE CVR_TargetReferences WITH CHECK
    ADD CONSTRAINT FK_CVR_TargetReferences_Targets
    FOREIGN KEY (TRF_TargetID) REFERENCES CVR_Targets (TAR_TargetID);
GO

-- ============================================================
-- 11. CVR_SettlementPayments
-- ============================================================
CREATE TABLE [dbo].[CVR_SettlementPayments](
	[STP_SettlementPaymentID] [numeric](18, 0) IDENTITY(1,1) NOT NULL,
	[STP_ContractID] [numeric](18, 0) NOT NULL,
	[STP_ResultType] [varchar](1) NOT NULL,
	[STP_TargetID] [numeric](18, 0) NULL,
	[STP_FeeID] [numeric](18, 0) NULL,
	[STP_AmountProcessed] [numeric](18, 3) NOT NULL,
	[STP_AmountLeft] [numeric](18, 3) NOT NULL,
	[STP_TotalAmountAtProcess] [numeric](18, 3) NOT NULL,
	[STP_TotalSalesAtProcess] [numeric](18, 3) NULL,
	[STP_Currency] [varchar](3) NOT NULL,
	[STP_ProcessDate] [datetime] NOT NULL,
	[STP_PeriodStart] [datetime] NULL,
	[STP_PeriodEnd] [datetime] NULL,
	[STP_CDStamp] [datetime] NOT NULL,
	[STP_CUStamp] [nvarchar](4) NULL,
	[STP_MDStamp] [datetime] NULL,
	[STP_MUStamp] [nvarchar](4) NULL,
 CONSTRAINT [PK_CVR_SettlementPayments] PRIMARY KEY CLUSTERED 
(
	[STP_SettlementPaymentID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] ADD  DEFAULT (getdate()) FOR [STP_ProcessDate]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] ADD  DEFAULT (getdate()) FOR [STP_CDStamp]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments]  WITH CHECK ADD  CONSTRAINT [FK_CVR_SettlementPayments_Contracts] FOREIGN KEY([STP_ContractID])
REFERENCES [dbo].[CVR_Contracts] ([CTR_ContractID])
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] CHECK CONSTRAINT [FK_CVR_SettlementPayments_Contracts]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments]  WITH CHECK ADD  CONSTRAINT [FK_CVR_SettlementPayments_Fees] FOREIGN KEY([STP_FeeID])
REFERENCES [dbo].[CVR_Fees] ([FEE_FeeID])
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] CHECK CONSTRAINT [FK_CVR_SettlementPayments_Fees]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments]  WITH CHECK ADD  CONSTRAINT [FK_CVR_SettlementPayments_Targets] FOREIGN KEY([STP_TargetID])
REFERENCES [dbo].[CVR_Targets] ([TAR_TargetID])
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] CHECK CONSTRAINT [FK_CVR_SettlementPayments_Targets]
GO
ALTER TABLE [dbo].[CVR_SettlementPayments]  WITH CHECK ADD  CONSTRAINT [CHK_CVR_SettlementPayments_TargetOrFee] CHECK  (([STP_ResultType]='T' AND [STP_TargetID] IS NOT NULL AND [STP_FeeID] IS NULL OR [STP_ResultType]='F' AND [STP_FeeID] IS NOT NULL AND [STP_TargetID] IS NULL))
GO
ALTER TABLE [dbo].[CVR_SettlementPayments] CHECK CONSTRAINT [CHK_CVR_SettlementPayments_TargetOrFee]
GO

-- ============================================================
-- 12. CVR_Computations
-- ============================================================
CREATE TABLE [dbo].[CVR_Computations](
    [CMP_ComputationID]           [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [CMP_ContractID]              [numeric](18, 0) NOT NULL,
    [CMP_TargetID]                [numeric](18, 0) NULL,
    [CMP_FeeID]                   [numeric](18, 0) NULL,
    [CMP_DateFrom]                [date]           NULL,
    [CMP_DateTo]                  [date]           NULL,
    [CMP_SalesAmount]             [numeric](18, 3) NULL,
    [CMP_SalesQty]                [numeric](18, 3) NULL,
    [CMP_PreviousYearSalesAmount] [numeric](18, 3) NULL,
    [CMP_Growth]                  [numeric](18, 2) NULL,
    [CMP_RebateAmount]            [numeric](18, 3) NOT NULL,
    [CMP_Currency]                [varchar](3)     NOT NULL,
    [CMP_CDStamp]                 [datetime]       NOT NULL,
    [CMP_CUStamp]                 [nvarchar](4)    NULL,
    [CMP_MDStamp]                 [datetime]       NULL,
    [CMP_MUStamp]                 [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_Computations] PRIMARY KEY CLUSTERED ([CMP_ComputationID] ASC),
    CONSTRAINT [CHK_CVR_Computations_TargetOrFee]
        CHECK (
            ([CMP_TargetID] IS NOT NULL AND [CMP_FeeID] IS NULL)
            OR
            ([CMP_FeeID] IS NOT NULL AND [CMP_TargetID] IS NULL)
        )
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_Computations] ADD DEFAULT (getdate()) FOR [CMP_CDStamp];
GO
ALTER TABLE [dbo].[CVR_Computations] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Computations_Contracts] FOREIGN KEY([CMP_ContractID])
    REFERENCES [dbo].[CVR_Contracts] ([CTR_ContractID]);
ALTER TABLE [dbo].[CVR_Computations] CHECK CONSTRAINT [FK_CVR_Computations_Contracts];
GO
ALTER TABLE [dbo].[CVR_Computations] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Computations_Targets] FOREIGN KEY([CMP_TargetID])
    REFERENCES [dbo].[CVR_Targets] ([TAR_TargetID]);
ALTER TABLE [dbo].[CVR_Computations] CHECK CONSTRAINT [FK_CVR_Computations_Targets];
GO
ALTER TABLE [dbo].[CVR_Computations] WITH CHECK
    ADD CONSTRAINT [FK_CVR_Computations_Fees] FOREIGN KEY([CMP_FeeID])
    REFERENCES [dbo].[CVR_Fees] ([FEE_FeeID]);
ALTER TABLE [dbo].[CVR_Computations] CHECK CONSTRAINT [FK_CVR_Computations_Fees];
GO

CREATE UNIQUE INDEX [UX_CVR_Computations_Target]
    ON [dbo].[CVR_Computations]([CMP_TargetID])
    WHERE [CMP_TargetID] IS NOT NULL;
GO
CREATE UNIQUE INDEX [UX_CVR_Computations_Fee]
    ON [dbo].[CVR_Computations]([CMP_FeeID])
    WHERE [CMP_FeeID] IS NOT NULL;
GO

-- ============================================================
-- 13. CVR_SalesSnapshot
-- ============================================================
CREATE TABLE [dbo].[CVR_SalesSnapshot](
    [SSN_SalesSnapshotID]         [numeric](18, 0) IDENTITY(1,1) NOT NULL,
    [SSN_ComputationID]           [numeric](18, 0) NOT NULL,
    [SSN_ClientID]                [numeric](18, 0) NOT NULL,
    [SSN_SalesAmount]             [numeric](18, 3) NULL,
    [SSN_SalesQty]                [numeric](18, 3) NULL,
    [SSN_PreviousYearSalesAmount] [numeric](18, 3) NULL,
    [SSN_Growth]                  [numeric](18, 2) NULL,
    [SSN_Currency]                [varchar](3)     NULL,
    [SSN_CDStamp]                 [datetime]       NOT NULL,
    [SSN_CUStamp]                 [nvarchar](4)    NULL,
    [SSN_MDStamp]                 [datetime]       NULL,
    [SSN_MUStamp]                 [nvarchar](4)    NULL,
    CONSTRAINT [PK_CVR_SalesSnapshot] PRIMARY KEY CLUSTERED ([SSN_SalesSnapshotID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[CVR_SalesSnapshot] ADD DEFAULT (getdate()) FOR [SSN_CDStamp];
GO
ALTER TABLE [dbo].[CVR_SalesSnapshot] WITH CHECK
    ADD CONSTRAINT [FK_CVR_SalesSnapshot_Computations] FOREIGN KEY([SSN_ComputationID])
    REFERENCES [dbo].[CVR_Computations] ([CMP_ComputationID]);
ALTER TABLE [dbo].[CVR_SalesSnapshot] CHECK CONSTRAINT [FK_CVR_SalesSnapshot_Computations];
GO
ALTER TABLE [dbo].[CVR_SalesSnapshot] WITH CHECK
    ADD CONSTRAINT [FK_CVR_SalesSnapshot_Clients] FOREIGN KEY([SSN_ClientID])
    REFERENCES [dbo].[Stk04_Clients] ([CL_RecID]);
ALTER TABLE [dbo].[CVR_SalesSnapshot] CHECK CONSTRAINT [FK_CVR_SalesSnapshot_Clients];
GO