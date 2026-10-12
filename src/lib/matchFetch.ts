export function matchFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    const sessionToken = sessionStorage.getItem('naruto_account_session_token');
    if (sessionToken) headers.set('X-Account-Session', sessionToken);
  } catch (error) {
    console.error('Could not read the active account session for a match request:', error);
  }

  return fetch(input, { ...init, headers });
}
