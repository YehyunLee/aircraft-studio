import { getStore } from '@netlify/blobs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key } = req.query;
  if (!key || Array.isArray(key)) {
    return res.status(400).json({ error: 'Missing model key' });
  }

  try {
    // This requires running on Netlify (Functions). In local dev, store may be sandboxed.
    const store = getStore('models');
    const arrayBuffer = await store.get(key, { type: 'arrayBuffer' });
    if (!arrayBuffer) {
      return res.status(404).json({ error: 'Model not found' });
    }

    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (e) {
    console.warn('Failed to read model from Netlify Blobs', e);
    return res.status(500).json({ error: 'Failed to read model' });
  }
}
