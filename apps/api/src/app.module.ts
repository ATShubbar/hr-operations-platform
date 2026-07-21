import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { requestContextMiddleware } from './context/request-context.middleware';
import { PermissionsGuard } from './auth/permissions.guard';
import { AccessLogInterceptor } from './logging/access-log.interceptor';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule, SessionMiddleware } from './modules/auth/public-api';
import { AuditModule } from './modules/audit/public-api';
import { ClientsModule } from './modules/clients/public-api';
import { ExampleModule } from './modules/example/public-api';
import { ExampleConsumerModule } from './modules/example-consumer/public-api';
import { ScopeCheckModule } from './modules/scope-check/public-api';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    AuditModule,
    ClientsModule,
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
    // Order matters: context must exist before the session resolves into it.
    consumer.apply(requestContextMiddleware).forRoutes('*');
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}
