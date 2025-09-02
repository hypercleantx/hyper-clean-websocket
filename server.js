import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import crypto from 'crypto';

const fastify = Fastify({ logger: true });
await fastify.register(websocket);

// Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const PORT = process.env.PORT || 3000;

// Business configuration for Hyper Clean TX
const BUSINESS_CONFIG = {
  name: "Hyper Clean TX",
  services: "Residential and commercial cleaning services",
  location: "Houston, Texas",
  pricing: {
    studio: 139,
    "1-2br": 179,
    "3br": 189,
    "4+br": "229-289"
  },
  phone: "(832) 784-8994",
  areas: ["River Oaks", "Memorial", "Bellaire", "Downtown Houston"]
};

// WebSocket route for ConversationRelay
fastify.register(async function (fastify) {
  fastify.get('/conversation', { websocket: true }, (connection, request) => {
    console.log('ConversationRelay WebSocket connected');

    connection.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Received message:', data.type);
        
        switch (data.type) {
          case 'setup':
            await handleSetup(connection, data);
            break;
          case 'prompt':
            await handlePrompt(connection, data);
            break;
          case 'interrupt':
            await handleInterrupt(connection, data);
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error processing message:', error);
        await sendErrorResponse(connection);
      }
    });

    connection.on('close', () => {
      console.log('ConversationRelay WebSocket disconnected');
    });
  });
});

async function handleSetup(connection, data) {
  console.log('Setup received:', data);
  const setupResponse = {
    type: 'setup',
    token: generateResponseToken()
  };
  connection.send(JSON.stringify(setupResponse));
  console.log('Setup response sent');
}

async function handlePrompt(connection, data) {
  const customerMessage = data.voicePrompt || '';
  console.log('Customer said:', customerMessage);
  
  const aiResponse = await generateAIResponse(customerMessage);
  
  const response = {
    type: 'text',
    token: generateResponseToken(),
    text: aiResponse
  };
  
  connection.send(JSON.stringify(response));
  console.log('AI Response sent:', aiResponse);
}

async function handleInterrupt(connection, data) {
  console.log('Customer interrupted');
  const response = {
    type: 'clear',
    token: generateResponseToken()
  };
  connection.send(JSON.stringify(response));
}

async function generateAIResponse(customerMessage) {
  try {
    if (!OPENAI_API_KEY) {
      return "Thank you for calling Hyper Clean TX! I'd love to help you with your cleaning needs. What size home do you have?";
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a professional customer service representative for ${BUSINESS_CONFIG.name}. 
            Provide helpful, conversational responses about cleaning services. Keep responses under 50 words 
            for natural conversation flow. Be friendly and professional.
            
            Pricing: Studio $${BUSINESS_CONFIG.pricing.studio}, 1-2BR $${BUSINESS_CONFIG.pricing["1-2br"]}, 3BR $${BUSINESS_CONFIG.pricing["3br"]}, 4+BR $${BUSINESS_CONFIG.pricing["4+br"]}
            Phone: ${BUSINESS_CONFIG.phone}
            Location: ${BUSINESS_CONFIG.location}`
          },
          {
            role: 'user',
            content: customerMessage
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    });
    
    const data = await response.json();
    return data.choices[0].message.content;
    
  } catch (error) {
    console.error('OpenAI API error:', error);
    return "I'd be happy to help with your cleaning needs! What size home do you have? Our rates start at $139 for studios.";
  }
}

async function sendErrorResponse(connection) {
  const errorResponse = {
    type: 'text',
    token: generateResponseToken(),
    text: "I apologize for the technical difficulty. Let me help you with your cleaning needs. What can I assist you with today?"
  };
  connection.send(JSON.stringify(errorResponse));
}

function generateResponseToken() {
  return `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Health check endpoint
fastify.get('/', async (request, reply) => {
  return { 
    status: 'healthy', 
    service: 'Hyper Clean TX ConversationRelay Server',
    timestamp: new Date().toISOString()
  };
});

// Start the server
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 Hyper Clean TX ConversationRelay server running on port ${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}