import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: number) {
    return this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  update(userId: number, dto: UpdatePreferencesDto) {
    return this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, theme: dto.theme },
      update: { theme: dto.theme },
    });
  }
}
