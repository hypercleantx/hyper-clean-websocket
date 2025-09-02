services/openai.js
const OpenAI = require('openai');
const logger = require('../utils/logger');

class OpenAIService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    
    this.client = new OpenAI({
      apiKey: apiKey
    });
  }

  async generateResponse(message, emotion, context = 'voice') {
    try {
      const systemPrompt = this.getSystemPrompt(emotion, context);
      
      const completion = await this.client.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: message
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      });

      const response = completion.choices[0].message.content;
      logger.info(`AI Response generated for emotion: ${emotion}`);
      
      return response;
      
    } catch (error) {
      logger.error('OpenAI API error:', error);
      return this.getFallbackResponse(emotion);
    }
  }

  getSystemPrompt(emotion, context) {
    const basePrompt = `You are a professional customer service representative for Hyper Clean TX, a premium cleaning service in Houston. 
    
    Business details:
    - Flat-rate pricing: Studio $139, 1-2BR $179, 3BR $189, 4+BR $229-289
    - Serve wealthy Houston areas: River Oaks, Memorial, Bellaire
    - Professional, reliable, eco-friendly cleaning
    - Bilingual service (English/Spanish)
    
    Customer emotion detected: ${emotion}
    Communication context: ${context}`;

    const emotionGuidance = {
      frustrated: "Be extra empathetic, apologetic, and solution-focused. Offer immediate remedies and escalate if needed.",
      excited: "Match their enthusiasm while remaining professional. Focus on benefits and next steps.",
      concerned: "Be reassuring, patient, and thorough. Address concerns with specific details and guarantees.",
      price_sensitive: "Emphasize value, quality, and flat-rate transparency. Mention no hidden fees.",
      neutral: "Be warm, professional, and informative."
    };

    return `${basePrompt}\n\n${emotionGuidance[emotion] || emotionGuidance.neutral}\n\nKeep responses concise and natural for ${context} communication.`;
  }

  getFallbackResponse(emotion) {
    const fallbacks = {
      frustrated: "I sincerely apologize for any inconvenience. Let me connect you with our manager to resolve this immediately.",
      excited: "Thank you for your enthusiasm! We're excited to serve you with our premium cleaning service.",
      concerned: "I understand your concerns. Our fully insured and bonded team ensures complete peace of mind.",
      price_sensitive: "Our flat-rate pricing means no surprises - just quality cleaning at transparent prices.",
      neutral: "Thank you for contacting Hyper Clean TX. How can we help you today?"
    };

    return fallbacks[emotion] || fallbacks.neutral;
  }

  async generateVoice(text, emotion) {
    try {
      const voiceOptions = {
        frustrated: 'alloy',
        excited: 'nova', 
        concerned: 'shimmer',
        price_sensitive: 'echo',
        neutral: 'alice'
      };

      const response = await this.client.audio.speech.create({
        model: "tts-1",
        voice: voiceOptions[emotion] || 'alice',
        input: text,
        speed: emotion === 'frustrated' ? 0.9 : 1.0
      });

      return response.body;
      
    } catch (error) {
      logger.error('Voice generation error:', error);
      throw error;
    }
  }
}

module.exports = OpenAIService;