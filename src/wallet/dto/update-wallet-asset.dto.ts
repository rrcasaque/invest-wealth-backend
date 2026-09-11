import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { WalletAssetType } from '@prisma/client';

export class UpdateWalletAssetDto {
  @IsOptional()
  @IsEnum(WalletAssetType)
  type?: WalletAssetType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ticker?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cnpj?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  institution?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentValue?: number;

  @IsOptional()
  @IsDateString()
  acquiredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fixedIncomeInstitution?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedIncomeAmount?: number;

  @IsOptional()
  @IsNumber()
  fixedIncomeRate?: number;

  @IsOptional()
  @IsDateString()
  maturity?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  propertyValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rentValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  agencyFee?: number;
}
