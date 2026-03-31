export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Cache-Control', 'no-store');

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  const { endpoint, apiKey, payload } = request.body ?? {};

  if (
    endpoint !== 'https://api-free.deepl.com/v2/translate' &&
    endpoint !== 'https://api.deepl.com/v2/translate'
  ) {
    response.status(400).json({ message: 'Unsupported DeepL endpoint.' });
    return;
  }

  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    response.status(400).json({ message: 'Missing DeepL API key.' });
    return;
  }

  if (!payload || typeof payload !== 'object') {
    response.status(400).json({ message: 'Missing DeepL payload.' });
    return;
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    response
      .status(upstream.status)
      .setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')
      .send(text);
  } catch (error) {
    response.status(500).json({
      message:
        error instanceof Error && error.message
          ? error.message
          : 'DeepL proxy failed before it could contact DeepL.',
    });
  }
}
