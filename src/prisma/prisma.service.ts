import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';

// Carrega o .env da raiz do projeto (não do CWD onde o processo roda,
// que pode ser dist/ quando executado via nest start).
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) {
      throw new Error('DATABASE_URL não definida no ambiente.');
    }
    // O adapter PrismaPg (Prisma v7) não suporta channel_binding na URL.
    const url = rawUrl
      .replace('&channel_binding=require', '')
      .replace('channel_binding=require&', '')
      .replace('channel_binding=require', '');
    // Log para debug (mascara a senha).
    const masked = url.replace(/:[^:@]+@/, ':***@');

    console.log(`[PrismaService] Conectando a: ${masked}`);
    // Prisma v7: PrismaPg aceita config object e cria o pool internamente.
    const adapter = new PrismaPg({ connectionString: url });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma conectado.');
  }
}
