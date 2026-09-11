import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  PaymentCategory,
  PaymentPriority,
  PaymentRecurrence,
} from '@prisma/client';

export class CreatePaymentDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsEnum(PaymentCategory)
  category!: PaymentCategory;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsEnum(PaymentPriority)
  priority?: PaymentPriority;

  @IsOptional()
  @IsEnum(PaymentRecurrence)
  recurrence?: PaymentRecurrence;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  receipt?: string;
}
