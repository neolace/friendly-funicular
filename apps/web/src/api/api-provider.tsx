import { useMemo, type ReactNode } from 'react';
import { useAuth } from '../auth/use-auth';
import { createApiClient } from './api-client';
import { ApiContext } from './use-api';

export function ApiProvider({
  baseUrl,
  children,
}: {
  baseUrl: string;
  children: ReactNode;
}) {
  const { getAccessToken } = useAuth();
  const client = useMemo(
    () => createApiClient({ baseUrl, getAccessToken }),
    [baseUrl, getAccessToken],
  );
  return <ApiContext value={client}>{children}</ApiContext>;
}
