import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(3, { message: 'Informe o seu nome completo.' })
  @MaxLength(120, { message: 'O nome deve ter no máximo 120 caracteres.' })
  fullName!: string;

  @IsEmail({}, { message: 'Formato de e-mail inválido.' })
  workEmail!: string;

  @IsString()
  @MinLength(12, { message: 'A senha deve ter pelo menos 12 caracteres.' })
  password!: string;
}
