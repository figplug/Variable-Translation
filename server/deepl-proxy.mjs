import { createServer } from 'node:http';

const PORT = Number(process.env.DEEPL_PROXY_PORT || 8787);
const ALLOWED_ENDPOINTS = new Set([
  'https://api-free.deepl.com/v2/translate',
  'https://api.deepl.com/v2/translate',
]);

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (!request.url) {
    writeJson(response, 404, { message: 'Missing request URL.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
    });
    response.end();
    return;
  }

  if (request.method !== 'POST' || request.url !== '/deepl/translate') {
    writeJson(response, 404, { message: 'Route not found.' });
    return;
  }

  try {
    let rawBody = '';
    for await (const chunk of request) {
      rawBody += chunk;
    }

    const parsed = rawBody ? JSON.parse(rawBody) : {};
    const endpoint = typeof parsed.endpoint === 'string' ? parsed.endpoint : '';
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
    const payload = parsed.payload;

    if (!ALLOWED_ENDPOINTS.has(endpoint)) {
      writeJson(response, 400, { message: 'Unsupported DeepL endpoint.' });
      return;
    }

    if (!apiKey) {
      writeJson(response, 400, { message: 'Missing DeepL API key.' });
      return;
    }

    if (!payload || typeof payload !== 'object') {
      writeJson(response, 400, { message: 'Missing DeepL payload.' });
      return;
    }

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const upstreamText = await upstream.text();
    response.writeHead(upstream.status, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    });
    response.end(upstreamText);
  } catch (error) {
    writeJson(response, 500, {
      message:
        error instanceof Error && error.message
          ? error.message
          : 'DeepL proxy failed before it could contact DeepL.',
    });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`DeepL proxy listening on http://127.0.0.1:${PORT}`);
});
