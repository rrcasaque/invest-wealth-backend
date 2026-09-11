import {
  IsArray,
  IsDateString,
  IsNumber,
  IsString,
  IsOptional,
  ValidateNested,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class B3PositionDto {
  @IsString()
  @MaxLength(20)
  ticker!: string;

  @IsString()
  @MaxLength(160)
  product!: string;

  @IsString()
  @MaxLength(32)
  cnpj!: string;

  @IsString()
  @MaxLength(120)
  institution!: string;

  @IsNumber()
  @Min(0)
  shares!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsNumber()
  @Min(0)
  value!: number;
}

export class ImportB3Dto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsDateString()
  importedAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => B3PositionDto)
  positions!: B3PositionDto[];
}
