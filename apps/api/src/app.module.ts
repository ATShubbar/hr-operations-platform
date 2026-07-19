import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { requestContextMiddleware } from './context/request-context.middleware';
import { PermissionsGuard } from './auth/permissions.guard';
import { AccessLogInterceptor } from './logging/access-log.interceptor';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/public-api';
import { ExampleModule } from './modules/example/public-api';
import { ExampleConsumerModule } from './modules/example-consumer/public-api';
import { ScopeCheckModule } from './modules/scope-check/public-api';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    ExampleModule,
    ExampleConsumerModule,
    ScopeCheckModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContextMiddleware).forRoutes('*');
  }
}
