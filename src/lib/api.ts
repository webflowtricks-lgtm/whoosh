const BASE_URL = import.meta.env.VITE_API_URL || '';

const origFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string' && input.startsWith('/api/') && BASE_URL) {
    return origFetch(`${BASE_URL}${input}`, init);
  }
  return origFetch(input, init);
};
