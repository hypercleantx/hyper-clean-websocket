services/emotion.js
const logger = require('../utils/logger');

class EmotionService {
  constructor() {
    this.emotionPatterns = {
      frustrated: {
        keywords: ['frustrated', 'angry', 'upset', 'terrible', 'horrible', 'worst', 'hate', 'awful'],
        urgency: ['need now', 'asap', 'urgent', 'emergency', 'right away', 'immediately'],
        complaints: ['cancel', 'refund', 'disappointed', 'unacceptable', 'poor', 'bad'],
        weight: 0
      },
      excited: {
        keywords: ['excited', 'amazing', 'perfect', 'love', 'great', 'awesome', 'fantastic', 'excellent'],
        enthusiasm: ['yes!', 'definitely', 'absolutely', 'can\'t wait', 'wonderful'],
        weight: 0
      },
      concerned: {
        keywords: ['worried', 'concerned', 'nervous', 'unsure', 'hesitant', 'doubt', 'afraid'],
        questions: ['what if', 'are you sure', 'guarantee', 'promise', 'safe', 'reliable'],
        weight: 0
      },
      price_sensitive: {
        keywords: ['expensive', 'cost', 'price', 'budget', 'afford', 'cheap', 'discount', 'deal'],
        comparison: ['other companies', 'competitors', 'cheaper option', 'better price'],
        weight: 0
      },
      neutral: {
        keywords: [],
        weight: 0
      }
    };
  }

  detectEmotion(message, callContext = {}) {
    if (!message || typeof message !== 'string') {
      return 'neutral';
    }

    const text = message.toLowerCase();
    const emotions = JSON.parse(JSON.stringify(this.emotionPatterns)); // Deep copy
    
    let maxWeight = 0;
    let detectedEmotion = 'neutral';

    // Calculate weighted scores
    Object.keys(emotions).forEach(emotion => {
      if (emotion === 'neutral') return;
      
      Object.keys(emotions[emotion]).forEach(category => {
        if (category !== 'weight' && Array.isArray(emotions[emotion][category])) {
          emotions[emotion][category].forEach(keyword => {
            if (text.includes(keyword)) {
              const weight = category === 'keywords' ? 1 : 1.5;
              emotions[emotion].weight += weight;
            }
          });
        }
      });

      // Add context bonuses
      if (callContext.previousEmotion === emotion) {
        emotions[emotion].weight += 0.5; // Emotional continuity
      }

      if (emotions[emotion].weight > maxWeight) {
        maxWeight = emotions[emotion].weight;
        detectedEmotion = emotion;
      }
    });

    const confidence = Math.min(maxWeight / 3, 1); // Normalize to 0-1
    
    logger.info(`Emotion detected: ${detectedEmotion} (confidence: ${confidence.toFixed(2)})`);
    
    return {
      emotion: detectedEmotion,
      confidence: confidence,
      weights: emotions
    };
  }

  getResponseTone(emotion) {
    const tones = {
      frustrated: {
        pace: 'slower',
        tone: 'calm and apologetic',
        approach: 'solution-focused'
      },
      excited: {
        pace: 'matching energy',
        tone: 'enthusiastic but professional',
        approach: 'momentum-building'
      },
      concerned: {
        pace: 'patient',
        tone: 'reassuring and detailed',
        approach: 'trust-building'
      },
      price_sensitive: {
        pace: 'steady',
        tone: 'value-focused',
        approach: 'transparency-emphasizing'
      },
      neutral: {
        pace: 'natural',
        tone: 'professional and warm',
        approach: 'informative'
      }
    };

    return tones[emotion] || tones.neutral;
  }
}

module.exports = EmotionService;