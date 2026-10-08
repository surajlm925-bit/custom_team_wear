const wabaId = '3418179021714024';
const phoneId = '1305427425990910';
const token = process.env.META_TOKEN;
const version = 'v20.0';

async function fetchMeta(path) {
  const res = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return { status: res.status, ok: res.ok, data: await res.json() };
}

async function run() {
  console.log('1. Checking WABA...');
  const wabaRes = await fetchMeta(`${wabaId}?fields=id,name,message_template_namespace`);
  console.log(`WABA Check Status: ${wabaRes.status}`, JSON.stringify(wabaRes.data));

  console.log('\n2. Checking WABA Phone Numbers...');
  const phonesRes = await fetchMeta(`${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status`);
  console.log(`Phone Numbers Check Status: ${phonesRes.status}`, JSON.stringify(phonesRes.data));

  console.log('\n3. Checking specific Phone Number ID...');
  const phoneRes = await fetchMeta(`${phoneId}?fields=id,display_phone_number,verified_name`);
  console.log(`Specific Phone Check Status: ${phoneRes.status}`, JSON.stringify(phoneRes.data));

  console.log('\n4. Checking Subscribed Apps for WABA...');
  const appsRes = await fetchMeta(`${wabaId}/subscribed_apps`);
  console.log(`Subscribed Apps Status: ${appsRes.status}`, JSON.stringify(appsRes.data));
  
  console.log('\n5. Checking Token Permissions (if possible)...');
  // Token debug endpoint
  const appRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`);
  if (appRes.ok) {
     const debugData = await appRes.json();
     if (debugData.data) {
        console.log('Token Scopes:', debugData.data.scopes || debugData.data.granular_scopes);
        console.log('Token Type:', debugData.data.type);
     }
  } else {
     console.log('Could not debug token. Status:', appRes.status);
  }
}
run().catch(console.error);
