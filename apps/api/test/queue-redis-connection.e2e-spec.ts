import { afterEach, describe, expect, it } from 'vitest';
import { redisConnection } from '../src/modules/queue/public-api';

// GCP-04: on UAT the BullMQ worker was refused with "NOAUTH Authentication
// required" while the API's session store connected fine — the queue
// connection kept only host + port from REDIS_URL and dropped the password.
// Local Redis has no password, so nothing caught it before a real deploy.
describe('BullMQ Redis connection from REDIS_URL', () => {
  const original = process.env.REDIS_URL;
  afterEach(() => {
    process.env.REDIS_URL = original;
  });

  it('carries the password (and an empty username stays absent)', () => {
    process.env.REDIS_URL = 'redis://:s3cr%2Fet@10.0.0.2:6379';
    const c = redisConnection();
    expect(c).toMatchObject({ host: '10.0.0.2', port: 6379, password: 's3cr/et' });
    expect(c.username).toBeUndefined();
  });

  it('carries a username and database index when present', () => {
    process.env.REDIS_URL = 'redis://worker:pw@redis.internal:6390/2';
    expect(redisConnection()).toMatchObject({
      host: 'redis.internal',
      port: 6390,
      username: 'worker',
      password: 'pw',
      db: 2,
    });
  });

  it('keeps the unauthenticated local form working', () => {
    process.env.REDIS_URL = 'redis://localhost:6380';
    const c = redisConnection();
    expect(c).toMatchObject({ host: 'localhost', port: 6380, maxRetriesPerRequest: null });
    expect(c.password).toBeUndefined();
  });
});
