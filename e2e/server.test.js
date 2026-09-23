const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

function waitForServer(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      fetch(url)
        .then(resolve)
        .catch((err) => {
          if (Date.now() - start > timeoutMs) return reject(err);
          setTimeout(poll, 100);
        });
    })();
  });
}

test('server responds on / end-to-end', async () => {
  const port = 4100;
  const child = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      BASE_URL: `http://localhost:${port}`,
      AUTH_TENANT_ID: 'common',
      AUTH_CLIENT_ID: 'test-client',
      AUTH_CLIENT_SECRET: 'test-secret',
      SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    },
  });

  try {
    const res = await waitForServer(`http://localhost:${port}/`, 5000);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Sign in/);
  } finally {
    child.kill();
  }
});
