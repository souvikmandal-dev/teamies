/** Explicitly isolated test configuration; never defaults to the application's .env.local. */
export function testBackend() {
  const url = process.env.TEAMIES_TEST_SUPABASE_URL;
  const key = process.env.TEAMIES_TEST_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set TEAMIES_TEST_SUPABASE_URL and TEAMIES_TEST_SUPABASE_ANON_KEY for a disposable test backend.');
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host) && process.env.TEAMIES_ALLOW_REMOTE_TESTS !== 'true') {
    throw new Error('Remote mutation tests require TEAMIES_ALLOW_REMOTE_TESTS=true and a disposable project.');
  }
  return { url, key };
}
