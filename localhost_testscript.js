// Test script for Sayori Proxy LLM service
// Add your constants here:

const BASE_URL = 'http://localhost:3001'; // Update this to your server URL
const API_KEY = 'your-api-key-here'; // Update this to your API key/token
const MODEL = 'your-model-here'; // Update this to your model name

// Sample input message
const SAMPLE_MESSAGE = 'hello';

// Test function to call the models endpoint
async function testModelsEndpoint() {
  try {
    console.log('Testing /v1/models endpoint...');
    
    const response = await fetch(`${BASE_URL}/v1/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Models endpoint successful!');
      console.log('Available models:', data.data?.map(m => m.id).join(', ') || 'No models found');
      return data;
    } else {
      console.error('❌ Models endpoint failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return null;
    }
  } catch (error) {
    console.error('❌ Error calling models endpoint:', error.message);
    return null;
  }
}

// Test function to call chat completions endpoint
async function testChatCompletion() {
  try {
    console.log(`\nTesting /v1/chat/completions endpoint with message: "${SAMPLE_MESSAGE}"`);
    
    const requestBody = {
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: SAMPLE_MESSAGE
        }
      ],
      temperature: 0.7,
      max_tokens: 100
    };

    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Chat completion successful!');
      console.log('Response:', JSON.stringify(data, null, 2));
      
      if (data.choices && data.choices[0]?.message?.content) {
        console.log(`\n🤖 AI Response: ${data.choices[0].message.content}`);
      }
      
      if (data.usage) {
        console.log(`\n📊 Token Usage:`, data.usage);
      }
      
      return data;
    } else {
      console.error('❌ Chat completion failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return null;
    }
  } catch (error) {
    console.error('❌ Error calling chat completion:', error.message);
    return null;
  }
}

// Test function to call public providers endpoint
async function testPublicProviders() {
  try {
    console.log('\nTesting /api/providers/public endpoint...');
    
    const response = await fetch(`${BASE_URL}/api/providers/public`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Public providers endpoint successful!');
      console.log('Available providers:', data.length);
      data.forEach(provider => {
        console.log(`  - ${provider.name}: ${provider.models.length} models`);
      });
      return data;
    } else {
      console.error('❌ Public providers endpoint failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return null;
    }
  } catch (error) {
    console.error('❌ Error calling public providers endpoint:', error.message);
    return null;
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting Sayori Proxy API Tests...\n');
  console.log('Configuration:');
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  API Key: ${API_KEY.substring(0, 8)}...`);
  console.log(`  Model: ${MODEL}`);
  console.log(`  Message: "${SAMPLE_MESSAGE}"`);
  console.log('=' .repeat(50));

  // Test 1: Get available models
  const modelsData = await testModelsEndpoint();
  
  // Test 2: Get public providers
  const providersData = await testPublicProviders();
  
  // Test 3: Test chat completion
  if (modelsData && providersData) {
    await testChatCompletion();
  } else {
    console.log('\n⚠️  Skipping chat completion test due to previous failures');
  }

  console.log('\n🏁 Tests completed!');
}

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

// Export functions for use in other modules
module.exports = {
  testModelsEndpoint,
  testChatCompletion,
  testPublicProviders,
  runTests
};