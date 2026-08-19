import { IsEmail } from 'class-validator';

export class PasswordRecoverDto {
  @IsEmail({}, { message: 'Formato de e-mail inválido.' })
  email!: string;
}
