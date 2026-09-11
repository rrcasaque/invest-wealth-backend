import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CreateDividendDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  referenceYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  referenceMonth!: number;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsNumber()
  @Min(0)
  yieldByMonth!: number;
}
