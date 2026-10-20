import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser = require('cookie-parser');
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // The API is reachable only through a loopback-bound Next.js proxy in this setup.
  // Trusting loopback makes req.ips reflect the original X-Forwarded-For chain.
  app.set('trust proxy', 'loopback');
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(config.getOrThrow<number>('BACKEND_PORT'), '127.0.0.1');
}

void bootstrap();

