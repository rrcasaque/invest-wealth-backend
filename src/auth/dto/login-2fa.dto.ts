import { IsString, Length } from 'class-validator';

export class Login2faDto {
  @IsString()
  ticket!: string;

  @IsString()
  @Length(6, 6, { message: 'O código deve ter 6 dígitos.' })
  code!: string;
}
