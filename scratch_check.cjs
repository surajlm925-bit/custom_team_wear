const fs = require('fs');

const envStr = fs.readFileSync('.env', 'utf-8');
const env = Object.fromEntries(envStr.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('=');
  return [l.substring(0, i), l.substring(i + 1).trim()];
}));

async function checkMeta() {
  const token = env.META_API_TOKEN;
  const waba = env.META_BUSINESS_ACCOUNT_ID;
  const phoneId = env.META_PHONE_NUMBER_ID;
  
  console.log('Token starts with:', token.substring(0, 15) + '...');
  
  if (token === 'your-meta-api-token') {
    console.log('No real token provided in .env');
    return;
  }
  
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${waba}/phone_numbers`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('WABA phone numbers response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Fetch error:', e);
  }
}
checkMeta();
