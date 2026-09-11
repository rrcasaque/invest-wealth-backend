import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WalletAssetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDividendDto } from './dto/create-dividend.dto';
import { CreateWalletAssetDto } from './dto/create-wallet-asset.dto';
import { ImportB3Dto, B3PositionDto } from './dto/import-b3.dto';
import { UpdateWalletAssetDto } from './dto/update-wallet-asset.dto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) { }

  async list(userId: number, type?: WalletAssetType) {
    const assets = await this.prisma.walletAsset.findMany({
      where: { userId, ...(type ? { type } : {}) },
      include: { dividendHistoricals: true },
      orderBy: { createdAt: 'desc' },
    });
    return assets.map((asset) => this.serializeAsset(asset));
  }

  async findOne(userId: number, id: number) {
    const asset = await this.prisma.walletAsset.findFirst({
      where: { id, userId },
      include: { dividendHistoricals: true },
    });
    if (!asset) throw new NotFoundException('Ativo não encontrado.');
    return this.serializeAsset(asset);
  }

  async create(userId: number, dto: CreateWalletAssetDto) {
    this.validateTypeFields(dto);
    const asset = await this.prisma.walletAsset.create({
      data: {
        userId,
        ...this.assetData(dto),
      } as Prisma.WalletAssetUncheckedCreateInput,
      include: { dividendHistoricals: true },
    });
    return this.serializeAsset(asset);
  }

  async update(userId: number, id: number, dto: UpdateWalletAssetDto) {
    await this.findOne(userId, id);
    const asset = await this.prisma.walletAsset.update({
      where: { id },
      data: this.assetData(dto),
      include: { dividendHistoricals: true },
    });
    return this.serializeAsset(asset);
  }

  async remove(userId: number, id: number) {
    await this.findOne(userId, id);
    await this.prisma.walletAsset.delete({ where: { id } });
  }

  async summary(userId: number) {
    const assets = await this.prisma.walletAsset.findMany({
      where: { userId },
    });
    const byType = Object.values(WalletAssetType).reduce(
      (result, type) => {
        result[type] = { count: 0, value: 0 };
        return result;
      },
      {} as Record<WalletAssetType, { count: number; value: number }>,
    );

    let totalInvested = 0;
    let monthlyIncome = 0;
    for (const asset of assets) {
      const value = this.assetValue(asset);
      totalInvested += value;
      byType[asset.type].count += 1;
      byType[asset.type].value += value;
      if (asset.type === WalletAssetType.ALUGUEL && asset.rentValue) {
        const rent = Number(asset.rentValue);
        const fee = Number(asset.agencyFee ?? 0);
        monthlyIncome += Math.max(0, rent - rent * (fee / 100));
      }
    }

    return { totalInvested, monthlyIncome, totalAssets: assets.length, byType };
  }

  async importB3(userId: number, dto: ImportB3Dto) {
    return this.prisma.$transaction(async (tx) => {
      let createdAssets = 0;
      let updatedAssets = 0;

      for (const position of dto.positions) {
        const existing = await tx.walletAsset.findFirst({
          where: {
            userId,
            OR: [
              { ticker: position.ticker.trim().toUpperCase() },
              { cnpj: position.cnpj.trim() },
            ],
          },
        });

        const data = this.b3AssetData(position);
        if (existing) {
          await tx.walletAsset.update({ where: { id: existing.id }, data });
          updatedAssets += 1;
        } else {
          await tx.walletAsset.create({ data: { userId, ...data } });
          createdAssets += 1;
        }
      }

      return { createdAssets, updatedAssets };
    });
  }

  async listDividends(userId: number, assetId: number, year?: number) {
    await this.findOne(userId, assetId);
    return this.prisma.dividendHistorical.findMany({
      where: {
        walletAssetId: assetId,
        ...(year ? { referenceYear: year } : {}),
      },
      orderBy: [{ referenceYear: 'desc' }, { referenceMonth: 'desc' }],
    });
  }

  async createDividend(
    userId: number,
    assetId: number,
    dto: CreateDividendDto,
  ) {
    const asset = await this.findOne(userId, assetId);
    if (!['FII', 'ACAO'].includes(String(asset.type))) {
      throw new BadRequestException(
        'Dividendos só podem ser vinculados a FIIs ou ações.',
      );
    }
    try {
      return await this.prisma.dividendHistorical.create({
        data: { walletAssetId: assetId, ...dto },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Já existe dividendo para este ativo neste mês.',
        );
      }
      throw error;
    }
  }

  async updateDividend(
    userId: number,
    assetId: number,
    id: string,
    dto: Partial<CreateDividendDto>,
  ) {
    await this.findOne(userId, assetId);
    const existing = await this.prisma.dividendHistorical.findFirst({
      where: { id, walletAssetId: assetId },
    });
    if (!existing)
      throw new NotFoundException('Histórico de dividendo não encontrado.');
    return this.prisma.dividendHistorical.update({ where: { id }, data: dto });
  }

  async removeDividend(userId: number, assetId: number, id: string) {
    await this.findOne(userId, assetId);
    const result = await this.prisma.dividendHistorical.deleteMany({
      where: { id, walletAssetId: assetId },
    });
    if (result.count === 0)
      throw new NotFoundException('Histórico de dividendo não encontrado.');
  }

  private assetData(dto: CreateWalletAssetDto | UpdateWalletAssetDto) {
    const data: Prisma.WalletAssetUpdateInput = {};
    const input = dto as Record<string, unknown>;
    const scalarFields = [
      'type',
      'name',
      'ticker',
      'cnpj',
      'notes',
      'institution',
      'quantity',
      'purchasePrice',
      'currentPrice',
      'currentValue',
      'fixedIncomeInstitution',
      'fixedIncomeAmount',
      'fixedIncomeRate',
      'propertyValue',
      'rentValue',
      'agencyFee',
    ] as const;
    for (const field of scalarFields) {
      if (input[field] !== undefined) data[field] = input[field] as never;
    }
    if (input.acquiredAt !== undefined)
      data.acquiredAt = input.acquiredAt
        ? new Date(input.acquiredAt as string)
        : null;
    if (input.maturity !== undefined)
      data.maturity = input.maturity ? new Date(input.maturity as string) : null;
    return data;
  }

  private b3AssetData(position: B3PositionDto) {
    return {
      type: WalletAssetType.FII,
      name: position.product.trim(),
      ticker: position.ticker.trim().toUpperCase(),
      cnpj: position.cnpj.trim(),
      institution: position.institution.trim(),
      quantity: position.shares,
      currentPrice: position.price,
      currentValue: position.value,
    };
  }

  private validateTypeFields(dto: CreateWalletAssetDto) {
    if (dto.type === WalletAssetType.FII || dto.type === WalletAssetType.ACAO) {
      if (!dto.ticker || dto.quantity === undefined) {
        throw new BadRequestException(
          'Ticker e quantidade são obrigatórios para ações e FIIs.',
        );
      }
    }
  }

  private assetValue(asset: {
    type: WalletAssetType;
    currentValue: unknown;
    fixedIncomeAmount: unknown;
    quantity: unknown;
    purchasePrice: unknown;
    propertyValue: unknown;
  }) {
    if (asset.type === WalletAssetType.RENDA_FIXA)
      return Number(asset.fixedIncomeAmount ?? 0);
    if (asset.type === WalletAssetType.ALUGUEL)
      return Number(asset.propertyValue ?? 0);
    if (asset.currentValue !== null && asset.currentValue !== undefined)
      return Number(asset.currentValue);
    return Number(asset.quantity ?? 0) * Number(asset.purchasePrice ?? 0);
  }

  private serializeAsset<
    T extends {
      currentValue: unknown;
      quantity: unknown;
      purchasePrice: unknown;
      fixedIncomeAmount: unknown;
      propertyValue: unknown;
      rentValue: unknown;
      agencyFee: unknown;
      [key: string]: unknown;
    },
  >(asset: T) {
    return {
      ...asset,
      quantity: asset.quantity === null ? null : Number(asset.quantity),
      purchasePrice:
        asset.purchasePrice === null ? null : Number(asset.purchasePrice),
      currentPrice:
        asset.currentPrice === null ? null : Number(asset.currentPrice),
      currentValue:
        asset.currentValue === null ? null : Number(asset.currentValue),
      fixedIncomeAmount:
        asset.fixedIncomeAmount === null
          ? null
          : Number(asset.fixedIncomeAmount),
      fixedIncomeRate:
        asset.fixedIncomeRate === null ? null : Number(asset.fixedIncomeRate),
      propertyValue:
        asset.propertyValue === null ? null : Number(asset.propertyValue),
      rentValue: asset.rentValue === null ? null : Number(asset.rentValue),
      agencyFee: asset.agencyFee === null ? null : Number(asset.agencyFee),
    };
  }
}
