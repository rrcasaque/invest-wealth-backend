import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // O '0.0.0.0' obriga o container a abrir as portas para o mundo externo
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();