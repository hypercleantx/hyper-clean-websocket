const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const twilio = require('twilio');
const OpenAI = require('openai');

const app = express();

// Configuration from environment variables
const config = {
     port: process.env.PORT || 3000,
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    voice: 'alloy'
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phone: process.env.BUSINESS_PHONE
  }
};

// Initialize services
const openai = new OpenAI({
  apiKey: config.openai.apiKey
});

const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: 'Too many requests, please try again later.'
});

app.use('/voice', limiter);
app.use('/sms', limiter);

// Emotion detection function
function detectCustomerEmotion(message, context = {}) {
  const emotions = {
    frustrated: {
      keywords: ['frustrated', 'annoyed', 'upset', 'angry', 'terrible', 'horrible', 'worst', 'hate', 'mad'],
      urgency: ['need now', 'asap', 'urgent', 'emergency', 'right away', 'immediately'],
      complaints: ['cancel', 'refund', 'disappointed', 'unacceptable', 'terrible service'],
      weight: 0
    },
    excited: {
      keywords: ['excited', 'amazing', 'perfect', 'love', 'great', 'awesome', 'fantastic', 'wonderful'],
      enthusiasm: ['yes!', 'definitely', 'absolutely', 'can\'t wait', 'so happy'],
      weight: 0
    },
    concerned: {
      keywords: ['worried', 'concerned', 'nervous', 'unsure', 'hesitant', 'doubt', 'confused'],
      questions: ['what if', 'are you sure', 'guarantee', 'promise', 'how do I know'],
      weight: 0
    },
    price_sensitive: {
      keywords: ['expensive', 'cost', 'price', 'budget', 'afford', 'cheap', 'discount', 'deal'],
      comparison: ['other companies', 'competitors', 'cheaper option', 'better price'],
      weight: 0
    }
  };

  const text = message.toLowerCase();
  let maxWeight = 0;
  let detectedEmotion = 'neutral';

  // Calculate weighted scores
  Object.keys(emotions).forEach(emotion => {
    Object.keys(emotions[emotion]).forEach(category => {
      if (category !== 'weight') {
        emotions[emotion][category].forEach(keyword => {
          if (text.includes(keyword)) {
            emotions[emotion].weight += (category === 'keywords') ? 1 : 1.5;
          }
        });
      }
    });

    if (emotions[emotion].weight > maxWeight) {
      maxWeight = emotions[emotion].weight;
      detectedEmotion = emotion;
    }
  });

  return {
    emotion: detectedEmotion,
    confidence: Math.min(maxWeight / 3, 1),
    weights: emotions
  };
}

// Generate OpenAI response
async function generateAIResponse(emotion, userMessage, context = {}) {
  try {
    const emotionPrompts = {
      frustrated: "You are a calm, understanding customer service representative for Hyper Clean TX, a premium cleaning service in Houston. The customer is frustrated. Respond with empathy, acknowledge their concerns, and focus on solutions. Keep responses under 100 words.",
      excited: "You are an enthusiastic customer service representative for Hyper Clean TX. The customer is excited about your services. Match their energy while being professional. Discuss your flat-rate pricing ($139-289) and Houston service areas. Keep responses under 100 words.",
      concerned: "You are a patient, reassuring customer service representative for Hyper Clean TX. The customer has concerns. Provide clear, confident answers and reassurance about your professional service. Keep responses under 100 words.",
      price_sensitive: "You are a value-focused customer service representative for Hyper Clean TX. The customer is price-conscious. Emphasize your competitive flat rates, quality service, and value proposition. Mention that contractors assume all risk, zero downtime costs. Keep responses under 100 words.",
      neutral: "You are a professional customer service representative for Hyper Clean TX, a Houston cleaning service. Provide helpful, friendly service information. Keep responses under 100 words."
    };

    const systemPrompt = emotionPrompts[emotion] || emotionPrompts.neutral;

    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API error:', error);
    return "Thank you for calling Hyper Clean TX. We're here to help with all your cleaning needs in Houston. How can we assist you today?";
  }
}

// Voice webhook handler
app.post('/voice', async (req, res) => {
  try {
    console.log('Incoming voice call:', req.body);
    
    const { From, To, CallSid, Digits } = req.body;
    
    let twimlResponse;
    
    if (!Digits) {
      // Initial call - main menu
      twimlResponse = `

  
    Hello! Thank you for calling Hyper Clean TX, Houston's premier cleaning service. 
    For new cleaning service and pricing information, press 1.
    To speak with customer support, press 2.
    To schedule an appointment, press 3.
    To hear our service areas, press 4.
  
  We didn't receive your selection. Please call back and make a selection. Thank you for choosing Hyper Clean TX!
`;
    } else {
      // Handle menu selection
      let responseMessage = "";
      
      switch (Digits) {
        case '1':
          responseMessage = "Our flat-rate cleaning starts at $139 for studios, $179 for 1-2 bedrooms, $189 for 3 bedrooms, and up to $289 for larger homes. We serve River Oaks, Memorial, Bellaire, and surrounding Houston areas. Would you like to schedule a cleaning?";
          break;
        case '2':
          responseMessage = "You've reached customer support for Hyper Clean TX. Our team is here to help with any questions about our services, scheduling, or billing. How can we assist you today?";
          break;
        case '3':
          responseMessage = "Great! Let's schedule your cleaning appointment. We have availability throughout the week in Houston. What area are you located in, and what type of home do you have?";
          break;
        case '4':
          responseMessage = "Hyper Clean TX proudly serves River Oaks, Memorial Village, Bellaire, West University, Museum District, Montrose, and surrounding Houston neighborhoods. We're expanding our service areas regularly!";
          break;
        default:
          responseMessage = "I didn't understand that selection. Please call back and press 1 for pricing, 2 for support, 3 for scheduling, or 4 for service areas.";
      }

      // Generate AI-enhanced response
      const emotion = detectCustomerEmotion(responseMessage);
      const aiResponse = await generateAIResponse(emotion.emotion, responseMessage, { digits: Digits });
      
      twimlResponse = `

  ${aiResponse}
  
    Press 1 to return to the main menu, or stay on the line to speak with our team.
  
  Thank you for calling Hyper Clean TX. Have a great day!
`;
    }

    res.set('Content-Type', 'text/xml');
    res.send(twimlResponse);
    
  } catch (error) {
    console.error('Voice webhook error:', error);
    
    const fallbackTwiml = `

  Thank you for calling Hyper Clean TX. We're experiencing technical difficulties. Please call back shortly or visit our website. Thank you!
`;
    
    res.set('Content-Type', 'text/xml');
    res.send(fallbackTwiml);
  }
});

// SMS webhook handler
app.post('/sms', async (req, res) => {
  try {
    console.log('Incoming SMS:', req.body);
    
    const { From, Body, MessageSid } = req.body;
    
    // Detect emotion from SMS
    const emotion = detectCustomerEmotion(Body);
    
    // Generate AI response
    const aiResponse = await generateAIResponse(emotion.emotion, Body, { channel: 'sms' });
    
    // Create TwiML response
    const twimlResponse = `

  ${aiResponse}
`;
    
    res.set('Content-Type', 'text/xml');
    res.send(twimlResponse);
    
  } catch (error) {
    console.error('SMS webhook error:', error);
    
    const fallbackTwiml = `

  Thanks for contacting Hyper Clean TX! We'll get back to you shortly. Call us for immediate assistance!
`;
    
    res.set('Content-Type', 'text/xml');
    res.send(fallbackTwiml);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Hyper Clean TX - Voice & SMS Automation Server',
    status: 'running',
    endpoints: {
      voice: '/voice (POST)',
      sms: '/sms (POST)',
      health: '/health (GET)'
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Start server
const server = app.listen(config.port, () => {
  console.log(`🚀 Hyper Clean TX Server running on port ${config.port}`);
  console.log(`📞 Twilio Voice webhook: /voice`);
  console.log(`📱 Twilio SMS webhook: /sms`);
  console.log(`❤️ Health check: /health`);
  
  // Validate environment variables
  if (!config.openai.apiKey) {
    console.warn('⚠️  OPENAI_API_KEY not set');
  }
  if (!config.twilio.accountSid || !config.twilio.authToken) {
    console.warn('⚠️  Twilio credentials not set');
  }
  
  console.log('✅ Server initialization complete');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;
// SMS webhook endpoint
app.post('/sms', (req, res) => {
  const { From, Body, To } = req.body;
  
  console.log(`SMS from ${From}: ${Body}`);
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thank you for contacting Hyper Clean TX! We'll respond shortly. For immediate service, please call ${process.env.BUSINESS_PHONE || '+18327848994'}.</Message>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

