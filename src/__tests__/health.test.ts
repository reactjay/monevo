import request from 'supertest';
import { app } from '../app';

describe('GET /health', () => {
  it('returns 200 with the correct response shape', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('whatsapp-financial-agent');
    expect(res.body.database).toBeDefined();
    expect(res.body.memory).toBeDefined();
    expect(typeof res.body.uptime).toBe('number');
  });

  it('returns JSON content-type', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
  });

  it('includes the method and path in the message', async () => {
    const res = await request(app).get('/unknown-path');

    expect(res.body.message).toContain('GET');
    expect(res.body.message).toContain('/unknown-path');
  });
});
