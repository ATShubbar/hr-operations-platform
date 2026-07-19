import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { requestContextMiddleware } from './context/request-context.middleware';
import { PermissionsGuard } from './auth/permissions.guard';
import { AccessLogInterceptor } from './logging/access-log.interceptor';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ExampleModule } from './modules/example/public-api';
import { ExampleConsumerModule } from './modules/example-consumer/public-api';

@Module({
  imports: [PrismaModule, HealthModule, ExampleModule, ExampleConsumerModule],
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
