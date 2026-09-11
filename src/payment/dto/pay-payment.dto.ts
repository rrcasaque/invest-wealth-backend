import { IsOptional, IsString } from 'class-validator';

export class PayPaymentDto {
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  receipt?: string;
}
