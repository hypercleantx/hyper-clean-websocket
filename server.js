server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Security Configuration
const CONFIG = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  BUSINESS_PHONE: process.env.BUSINESS_PHONE || '+18327848994',
  ENVIRONMENT: process.env.NODE_ENV || 'production'
};

// Validate required environment variables
const requiredEnvVars = ['OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import Services
const OpenAIService = require('./services/openai');
const TwilioService = require('./services/twilio');
const EmotionService = require('./services/emotion');
const logger = require('./utils/logger');

// Initialize Services
const openaiService = new OpenAIService(CONFIG.OPENAI_API_KEY);
const twilioService = new TwilioService(CONFIG.TWILIO_ACCOUNT_SID, CONFIG.TWILIO_AUTH_TOKEN);
const emotionService = new EmotionService();

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: CONFIG.ENVIRONMENT
  });
});

// Twilio Voice Webhook
app.post('/voice', async (req, res) => {
  try {
    const { From, To, CallSid, Digits } = req.body;
    
    logger.info(`Incoming call from ${From} to ${To}, CallSid: ${CallSid}`);
    
    let twimlResponse;
    
    if (!Digits) {
      // Main menu
      twimlResponse = `

  
    Hello! Thank you for calling Hyper Clean TX, Houston's premier cleaning service.
    Press 1 for new cleaning service quotes.
    Press 2 to speak with customer support.
    Press 3 to schedule or modify an appointment.
    Press 0 to speak with a representative.
  
  We didn't receive your selection. Please call back and make a selection from our menu. Thank you for choosing Hyper Clean TX!
`;
    } else {
      // Handle menu selection
      twimlResponse = await handleMenuSelection(Digits, From, CallSid);
    }
    
    res.type('text/xml');
    res.send(twimlResponse);
    
  } catch (error) {
    logger.error('Voice webhook error:', error);
    
    const fallbackTwiML = `

  We're experiencing technical difficulties. Please call back in a few minutes or visit our website. Thank you for choosing Hyper Clean TX.
`;
    
    res.type('text/xml');
    res.send(fallbackTwiML);
  }
});

// Voice Input Handler
app.post('/voice-input', async (req, res) => {
  try {
    const { Digits, From, CallSid } = req.body;
    const twimlResponse = await handleMenuSelection(Digits, From, CallSid);
    
    res.type('text/xml');
    res.send(twimlResponse);
    
  } catch (error) {
    logger.error('Voice input error:', error);
    
    const errorTwiML = `

  Sorry, we encountered an error processing your request. Please try again or call back later.
`;
    
    res.type('text/xml');
    res.send(errorTwiML);
  }
});

// SMS Webhook
app.post('/sms', async (req, res) => {
  try {
    const { From, Body, MessageSid } = req.body;
    
    logger.info(`SMS from ${From}: ${Body}`);
    
    // Detect emotion in SMS
    const emotion = emotionService.detectEmotion(Body);
    
    // Generate AI response
    const aiResponse = await openaiService.generateResponse(Body, emotion, 'sms');
    
    // Send SMS response
    await twilioService.sendSMS(From, aiResponse);
    
    res.status(200).send('OK');
    
  } catch (error) {
    logger.error('SMS webhook error:', error);
    res.status(500).send('Error processing SMS');
  }
});

// Menu Selection Handler
async function handleMenuSelection(digits, from, callSid) {
  try {
    switch (digits) {
      case '1':
        // New cleaning service
        return `

  Thank you for your interest in our cleaning services! 
  Our flat-rate pricing starts at $139 for studios, $179 for 1-2 bedrooms, and $189 for 3 bedrooms.
  We serve River Oaks, Memorial, Bellaire, and surrounding Houston areas.
  Please stay on the line to speak with a representative who can provide a personalized quote.
  ${CONFIG.BUSINESS_PHONE}
  Our representatives are currently busy. Please call back or visit our website to schedule online. Thank you!
`;

      case '2':
        // Customer support
        const emotion = emotionService.detectEmotion('customer support request');
        const supportResponse = await openaiService.generateResponse(
          'Customer selected customer support', 
          emotion, 
          'voice'
        );
        
        return `

  ${supportResponse}
  Connecting you to our customer support team now.
  ${CONFIG.BUSINESS_PHONE}
  Our support team is currently busy. Please leave a message after the tone.
  
`;

      case '3':
        // Scheduling
        return `

  For appointment scheduling and modifications, please stay on the line to speak with our scheduling coordinator.
  We offer flexible scheduling Monday through Saturday, with same-day service available in most Houston areas.
  ${CONFIG.BUSINESS_PHONE}
  Our scheduling team is currently busy. Please call back or visit our website to schedule online.
`;

      case '0':
        // Representative
        return `

  Connecting you to a Hyper Clean TX representative now.
  ${CONFIG.BUSINESS_PHONE}
  All representatives are currently busy. Please call back or leave a message after the tone.
  
`;

      default:
        return `

  Invalid selection. Please call back and press 1 for new service, 2 for support, 3 for scheduling, or 0 for a representative.
`;
    }
  } catch (error) {
    logger.error('Menu selection error:', error);
    throw error;
  }
}

// Recording Handler
app.post('/handle-recording', async (req, res) => {
  try {
    const { RecordingUrl, From, TranscriptionText } = req.body;
    
    logger.info(`Recording received from ${From}: ${RecordingUrl}`);
    
    if (TranscriptionText) {
      // Process transcription with AI
      const emotion = emotionService.detectEmotion(TranscriptionText);
      const response = await openaiService.generateResponse(TranscriptionText, emotion, 'voice');
      
      // Could send follow-up SMS or email here
      logger.info(`AI Analysis: ${response}`);
    }
    
    const twiML = `

  Thank you for your message. A member of our team will get back to you within 24 hours. Have a great day!
`;
    
    res.type('text/xml');
    res.send(twiML);
    
  } catch (error) {
    logger.error('Recording handler error:', error);
    res.status(500).send('Error processing recording');
  }
});

// API Endpoints
app.get('/api/status', (req, res) => {
  res.json({
    status: 'operational',
    services: {
      openai: !!CONFIG.OPENAI_API_KEY,
      twilio: !!CONFIG.TWILIO_ACCOUNT_SID,
    },
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Hyper Clean TX Server running on port ${PORT}`);
  console.log(`✅ Environment: ${CONFIG.ENVIRONMENT}`);
  console.log(`🔒 Security: API keys loaded from environment variables`);
  
  // Validate services on startup
  if (!CONFIG.OPENAI_API_KEY) console.warn('⚠️  OpenAI API key not configured');
  if (!CONFIG.TWILIO_ACCOUNT_SID) console.warn('⚠️  Twilio credentials not configured');
});

module.exports = app;