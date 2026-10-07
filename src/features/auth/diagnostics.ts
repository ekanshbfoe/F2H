/**
 * Dev only connection check, run from the phone itself. Each line names one hop: the host the
 * bundle was built with, Supabase Auth, PostgREST and the Edge Function gateway. A function ping
 * with the anon key must answer 401 `service_key_required`: that body comes from inside the
 * function, so it proves the gateway routed and invoked it.
 */
export interface HopResult {
  hop: string;
  ok: boolean;
  detail: string;
  ms: number;
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

async function probe(
  hop: string,
  input: string,
  init: RequestInit,
  expect: (status: number, body: string) => boolean,
): Promise<HopResult> {
  const started = Date.now();
  try {
    const res = await fetch(input, init);
    const body = (await res.text()).slice(0, 90);
    return {
      hop,
      ok: expect(res.status, body),
      detail: `HTTP ${res.status} ${body}`,
      ms: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { hop, ok: false, detail: `fetch failed: ${message}`, ms: Date.now() - started };
  }
}

export async function runConnectionCheck(): Promise<HopResult[]> {
  let host = 'missing';
  try {
    host = new URL(url).host;
  } catch {
    /* missing or malformed */
  }
  const results: HopResult[] = [
    { hop: 'config', ok: host.endsWith('.supabase.co'), detail: host, ms: 0 },
  ];
  if (!url || !anonKey) return results;
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  };
  results.push(
    await probe('auth', `${url}/auth/v1/health`, { headers }, (s) => s === 200),
    await probe(
      'rest',
      `${url}/rest/v1/rpc/health`,
      { method: 'POST', headers, body: '{}' },
      (s, b) => s === 200 && b.includes('ok'),
    ),
    await probe(
      'function',
      `${url}/functions/v1/expire-requests`,
      { method: 'POST', headers, body: '{}' },
      (s, b) => s === 401 && b.includes('service_key_required'),
    ),
  );
  return results;
}

export function formatConnectionCheck(results: HopResult[]): string {
  return results
    .map((r) => `${r.ok ? 'OK' : 'FAIL'} ${r.hop}: ${r.detail}${r.ms ? ` (${r.ms} ms)` : ''}`)
    .join('\n');
}
