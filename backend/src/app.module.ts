import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { OriginGuard } from './auth/guards/origin.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ProxyAwareThrottlerGuard } from './auth/guards/proxy-aware-throttler.guard';
import { validateEnvironment } from './config/env';
import { IdempotencyKey } from './database/entities/idempotency-key.entity';
import { OrderItem } from './database/entities/order-item.entity';
import { Order } from './database/entities/order.entity';
import { User } from './database/entities/user.entity';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.ENV_FILE ?? '../.env',
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [User, Order, OrderItem, IdempotencyKey],
        synchronize: false,
        migrationsRun: false,
        logging: config.get<string>('NODE_ENV') === 'development' ? ['error'] : false,
        extra: { max: 10 },
      }),
    }),
    AuthModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ProxyAwareThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

