export const runtime = 'nodejs';

const API_BASE = process.env.WA_API_BASE || 'http://localhost:4000';

// Forwards all requests to your Express server (streams JSON & multipart).
async function forward(req, { params }) {
  const path = (params.slug || []).join('/');
  const url = new URL(req.url);
  const target = `${API_BASE}/${path}${url.search}`;

  // Copy headers (omit host)
  const headers = new Headers(req.headers);
  headers.delete('host');

  const res = await fetch(target, {
    method: req.method,
    headers,
    body: req.body,       // streams fine for JSON & multipart
    duplex: 'half',       // Node fetch streaming hint
  });

  // Stream response back to the browser
  return new Response(res.body, { status: res.status, headers: res.headers });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
