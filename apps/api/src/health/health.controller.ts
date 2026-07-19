import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/permissions.decorator';

// These endpoints are probed unauthenticated by the deploy gate and load
// balancer — hence the explicit @Public() opt-out of the deny-by-default
// guard (WS-15, ADR-002).

const startedAt = Date.now();

interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  uptimeSeconds: number;
}

interface ReadyResponse {
  status: 'ready';
}

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'hr-api',
      version: process.env.BUILD_VERSION ?? 'dev',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };
  }

  @Public()
  @Get('ready')
  ready(): ReadyResponse {
    return { status: 'ready' };
  }
}
