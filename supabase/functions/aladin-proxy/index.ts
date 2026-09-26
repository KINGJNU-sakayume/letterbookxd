// Supabase Edge Function (Deno runtime)
// Proxies requests to the Aladin TTB API to avoid browser CORS restrictions.
//
// Invocation URL:
//   https://walvasjnydandxpzivzd.supabase.co/functions/v1/aladin-proxy/{path}?{params}
//
// Examples:
//   .../aladin-proxy/ItemSearch.aspx?ttbkey=...&Query=...
//   .../aladin-proxy/ItemLookUp.aspx?ttbkey=...&ItemId=...
//
// Deploy with:
//   supabase functions deploy aladin-proxy --no-verify-jwt

const ALADIN_BASE = 'https://www.aladin.co.kr/ttb/api';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Extract the Aladin API path from the URL.
  // pathname will be like /aladin-proxy/ItemLookUp.aspx
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/aladin-proxy\/(.*)/);
  const aladinPath = pathMatch?.[1] ?? '';

  if (!aladinPath) {
    return new Response(JSON.stringify({ error: 'Missing Aladin API path' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('ALADIN_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ALADIN_API_KEY is not configured' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // The browser never receives the Aladin key. Ignore any client-supplied ttbkey
  // and inject the Edge Function secret server-side.
  const params = new URLSearchParams(url.searchParams);
  params.set('ttbkey', apiKey);
  const targetUrl = `${ALADIN_BASE}/${aladinPath}?${params.toString()}`;

  let aladinRes: Response;
  try {
    aladinRes = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (letterbookxd proxy)' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to reach Aladin API', detail: String(err) }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const body = await aladinRes.text();
  return new Response(body, {
    status: aladinRes.ok ? 200 : aladinRes.status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': aladinRes.headers.get('Content-Type') ?? 'application/json',
    },
  });
});
