-- CreateEnum
CREATE TYPE "WalletAssetType" AS ENUM ('FII', 'ACAO', 'RENDA_FIXA', 'CRIPTO', 'ALUGUEL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentCategory" AS ENUM ('CONTA', 'IMPOSTO', 'INVESTIMENTO', 'CARTAO', 'FINANCIAMENTO', 'OUTROS');

-- CreateEnum
CREATE TYPE "PaymentRecurrence" AS ENUM ('ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PaymentPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('DARK', 'LIGHT');

-- CreateTable
CREATE TABLE "WalletAsset" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "WalletAssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT,
    "cnpj" TEXT,
    "notes" TEXT,
    "institution" TEXT,
    "quantity" DECIMAL(15,8),
    "purchasePrice" DECIMAL(15,2),
    "currentPrice" DECIMAL(15,2),
    "currentValue" DECIMAL(15,2),
    "acquiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fixedIncomeInstitution" TEXT,
    "fixedIncomeAmount" DECIMAL(15,2),
    "fixedIncomeRate" DECIMAL(8,4),
    "maturity" TIMESTAMP(3),
    "propertyValue" DECIMAL(15,2),
    "rentValue" DECIMAL(15,2),
    "agencyFee" DECIMAL(8,4),

    CONSTRAINT "WalletAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividend_historical" (
    "id" UUID NOT NULL,
    "walletAssetId" INTEGER NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "referenceMonth" INTEGER NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "yieldByMonth" DECIMAL(8,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dividend_historical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "category" "PaymentCategory" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "PaymentPriority" NOT NULL DEFAULT 'MEDIUM',
    "recurrence" "PaymentRecurrence" NOT NULL DEFAULT 'ONCE',
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "receipt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "theme" "Theme" NOT NULL DEFAULT 'DARK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletAsset_userId_type_idx" ON "WalletAsset"("userId", "type");

-- CreateIndex
CREATE INDEX "WalletAsset_userId_ticker_idx" ON "WalletAsset"("userId", "ticker");

-- CreateIndex
CREATE INDEX "dividend_historical_walletAssetId_idx" ON "dividend_historical"("walletAssetId");

-- CreateIndex
CREATE INDEX "dividend_historical_referenceYear_referenceMonth_idx" ON "dividend_historical"("referenceYear", "referenceMonth");

-- CreateIndex
CREATE UNIQUE INDEX "dividend_historical_walletAssetId_referenceYear_referenceMo_key" ON "dividend_historical"("walletAssetId", "referenceYear", "referenceMonth");

-- CreateIndex
CREATE INDEX "PaymentReminder_userId_status_idx" ON "PaymentReminder"("userId", "status");

-- CreateIndex
CREATE INDEX "PaymentReminder_userId_dueDate_idx" ON "PaymentReminder"("userId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- CreateIndex
CREATE INDEX "UserPreferences_userId_idx" ON "UserPreferences"("userId");

-- AddForeignKey
ALTER TABLE "WalletAsset" ADD CONSTRAINT "WalletAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_historical" ADD CONSTRAINT "dividend_historical_walletAssetId_fkey" FOREIGN KEY ("walletAssetId") REFERENCES "WalletAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
