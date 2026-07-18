import { Controller, Get } from '@nestjs/common';

// These endpoints are probed unauthenticated by the deploy gate and load
// balancer — they must stay public when the deny-by-default authorization
// guard (WS-15, ADR-002) lands.

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
  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'hr-api',
      version: process.env.BUILD_VERSION ?? 'dev',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };
  }

  @Get('ready')
  ready(): ReadyResponse {
    return { status: 'ready' };
  }
}
