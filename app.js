require('dotenv').config();
const express = require('express');
const { auth, requiresAuth } = require('express-openid-connect');

function createApp() {
  const app = express();

  app.use(
    auth({
      authRequired: false,
      auth0Logout: false,
      baseURL: process.env.BASE_URL,
      clientID: process.env.AUTH_CLIENT_ID,
      clientSecret: process.env.AUTH_CLIENT_SECRET,
      issuerBaseURL: `https://login.microsoftonline.com/${process.env.AUTH_TENANT_ID}/v2.0`,
      secret: process.env.SESSION_SECRET,
      authorizationParams: {
        response_type: 'code',
        scope: 'openid profile email',
      },
    }),
  );

  app.get('/', (req, res) => {
    res.send(
      req.oidc.isAuthenticated()
        ? `Signed in as ${req.oidc.user.name}`
        : 'Signed out <a href="/login">Sign in</a>',
    );
  });

  app.get('/profile', requiresAuth(), (req, res) => {
    res.json(req.oidc.user);
  });

  return app;
}

module.exports = createApp;
