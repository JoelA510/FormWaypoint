import '@testing-library/jest-dom/vitest';

const MOCK_API_URL = 'http://localhost:3000';

if (!import.meta.env.VITE_SUPABASE_URL) {
  import.meta.env.VITE_SUPABASE_URL = MOCK_API_URL;
}

if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  import.meta.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
}
