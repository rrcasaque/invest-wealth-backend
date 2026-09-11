import { IsEnum } from 'class-validator';
import { Theme } from '@prisma/client';

export class UpdatePreferencesDto {
  @IsEnum(Theme)
  theme!: Theme;
}
