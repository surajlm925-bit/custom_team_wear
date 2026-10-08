import handler from './api/webhook.ts';
import { getEnv } from './src/config/env.ts';

// Mock Vercel response
function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    }
  };
  return res;
}

async function test() {
  // Test GET verification success
  console.log('Testing GET Verification Success...');
  const req1 = {
    method: 'GET',
    query: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'choose-a-long-random-string',
      'hub.challenge': '11223344'
    }
  };
  const res1 = mockRes();
  await handler(req1, res1);
  console.log('GET Success Result:', res1.statusCode, res1.body);

  // Test GET verification failure
  console.log('\nTesting GET Verification Failure...');
  const req2 = {
    method: 'GET',
    query: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': '11223344'
    }
  };
  const res2 = mockRes();
  await handler(req2, res2);
  console.log('GET Failure Result:', res2.statusCode, res2.body);

  // Test POST invalid payload
  console.log('\nTesting POST Invalid Payload...');
  const req3 = {
    method: 'POST',
    headers: {},
    body: { object: 'something_else' }
  };
  const res3 = mockRes();
  await handler(req3, res3);
  console.log('POST Invalid Result:', res3.statusCode, res3.body);
  
  console.log('\nTests Complete.');
}

test().catch(console.error);
