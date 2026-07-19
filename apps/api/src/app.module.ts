import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { requestContextMiddleware } from './context/request-context.middleware';
import { AccessLogInterceptor } from './logging/access-log.interceptor';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ExampleModule } from './modules/example/public-api';
import { ExampleConsumerModule } from './modules/example-consumer/public-api';

@Module({
  imports: [PrismaModule, HealthModule, ExampleModule, ExampleConsumerModule],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContextMiddleware).forRoutes('*');
  }
}
