
const env = require('dotenv').config().parsed;
const fetch = require('node-fetch'); // or native fetch if node 18+
async function test() {
  const url = 'https://metagraph.backendprod.com/1404775792711749/messages';
  console.log('Testing with collector-id:', env.EMOVUR_CONNECTOR_ID);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': \Bearer \\,
        'Content-Type': 'application/json',
        'collector-id': env.EMOVUR_CONNECTOR_ID,
        'connector-id': env.EMOVUR_CONNECTOR_ID
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: '918660099382', type: 'text', text: { body: 'test' } })
    });
    console.log(res.status);
    console.log(await res.text());
  } catch(e) {
    console.error(e);
  }
}
test();

