import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Formato de e-mail inválido.' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Informe a sua senha.' })
  password!: string;
}
