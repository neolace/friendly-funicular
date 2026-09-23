import type { IPublicClientApplication } from '@azure/msal-browser';
import { BrowserRouter } from 'react-router-dom';
import { ApiProvider } from './api/api-provider';
import { AuthProvider } from './auth/auth-provider';
import type { AppEnvironment } from './config/environment';
import { AppRouter } from './routes/app-router';

interface AppProps {
  msalInstance: IPublicClientApplication;
  env: AppEnvironment;
}

export function App({ msalInstance, env }: AppProps) {
  return (
    <AuthProvider instance={msalInstance} env={env}>
      <ApiProvider baseUrl={env.apiBaseUrl}>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </ApiProvider>
    </AuthProvider>
  );
}
