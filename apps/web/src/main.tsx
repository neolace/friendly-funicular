import { PublicClientApplication } from '@azure/msal-browser';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { createMsalConfiguration } from './auth/auth-config';
import { EnvironmentError, readEnvironment } from './config/environment';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

try {
  const env = readEnvironment();
  const msalInstance = new PublicClientApplication(
    createMsalConfiguration(env),
  );
  root.render(
    <StrictMode>
      <App msalInstance={msalInstance} env={env} />
    </StrictMode>,
  );
} catch (error) {
  const problems =
    error instanceof EnvironmentError
      ? error.problems
      : ['Unknown startup error'];
  root.render(
    <main className="centered">
      <section className="card" role="alert">
        <h1>Configuration error</h1>
        <p className="muted">The application is not configured correctly.</p>
        <ul>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>
    </main>,
  );
}
