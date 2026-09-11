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
  PaymentStatus,
} from '@prisma/client';

export class UpdatePaymentDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(PaymentCategory) category?: PaymentCategory;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsEnum(PaymentPriority) priority?: PaymentPriority;
  @IsOptional() @IsEnum(PaymentRecurrence) recurrence?: PaymentRecurrence;
  @IsOptional() @IsDateString() paidAt?: string | null;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() receipt?: string;
}
