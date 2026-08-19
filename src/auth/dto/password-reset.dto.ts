import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class PasswordResetDto {
  @IsEmail({}, { message: 'Formato de e-mail inválido.' })
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'O código deve ter 6 dígitos.' })
  code!: string;

  @IsString()
  @MinLength(12, { message: 'A senha deve ter pelo menos 12 caracteres.' })
  newPassword!: string;
}
