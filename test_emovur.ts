import fs from 'fs';

async function testUrl(url: string, headers: any) {
  console.log('Testing URL:', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messaging_product: 'whatsapp', to: '918660099382', type: 'text', text: { body: 'test with header' } })
    });
    console.log('Status:', res.status);
    console.log('Text:', await res.text());
    console.log('---');
  } catch(e) {
    console.error('Error:', e.message);
  }
}

async function test() {
  const envFile = fs.readFileSync('.env', 'utf-8');
  const env: Record<string, string> = {};
  for (let line of envFile.split('\n')) {
    line = line.replace('\r', '').trim();
    if (line.startsWith('#') || !line.includes('=')) continue;
    const parts = line.split('=');
    const key = parts[0];
    const val = parts.slice(1).join('=').trim();
    env[key] = val;
  }

  const phoneId = env.META_PHONE_NUMBER_ID;

  // With header
  console.log('==== WITH HEADER ====');
  await testUrl(`https://metagraph.backendprod.com/v20.0/${phoneId}/messages`, {
    'Authorization': `Bearer ${env.META_API_TOKEN}`,
    'Content-Type': 'application/json',
    'collector-id': env.EMOVUR_CONNECTOR_ID,
    'connector-id': env.EMOVUR_CONNECTOR_ID
  });

  // Without header
  console.log('==== WITHOUT HEADER ====');
  await testUrl(`https://metagraph.backendprod.com/v20.0/${phoneId}/messages`, {
    'Authorization': `Bearer ${env.META_API_TOKEN}`,
    'Content-Type': 'application/json'
  });
}
test();
