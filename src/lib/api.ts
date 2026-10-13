function configRequestHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  try {
    const sessionToken = sessionStorage.getItem('naruto_account_session_token');
    if (sessionToken) headers.set('X-Account-Session', sessionToken);
  } catch (error) {
    console.error('Could not read the active account session for a configuration request:', error);
  }
  try {
    const profile = localStorage.getItem('naruto_user_profile');
    if (profile) {
      const username = (JSON.parse(profile) as { username?: unknown }).username;
      if (typeof username === 'string' && username.trim()) {
        headers.set('X-Account-Username', username.trim().toLowerCase());
      }
    }
  } catch (error) {
    console.error('Could not read the active account profile for a configuration request:', error);
  }
  return headers;
}

export function configFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, headers: configRequestHeaders(init) });
}

export async function saveGlobalConfig(
  url: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await configFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null) as {
    success?: boolean;
    error?: string;
  } | null;
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || 'Não foi possível salvar a configuração global no servidor.');
  }
}

export async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      return null;
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
