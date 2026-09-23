const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
process.env.AUTH_TENANT_ID = process.env.AUTH_TENANT_ID || 'common';
process.env.AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID || 'test-client';
process.env.AUTH_CLIENT_SECRET =
  process.env.AUTH_CLIENT_SECRET || 'test-secret';
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || '0123456789abcdef0123456789abcdef';

const createApp = require('../app');

test('GET / shows a sign-in link when signed out', async () => {
  const res = await request(createApp()).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /Sign in/);
});

test('GET /profile redirects to login when signed out', async () => {
  const res = await request(createApp()).get('/profile');
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /login/);
});
