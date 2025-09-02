services/twilio.js
const twilio = require('twilio');
const logger = require('../utils/logger');

class TwilioService {
  constructor(accountSid, authToken) {
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials are required');
    }
    
    this.client = twilio(accountSid, authToken);
  }

  async sendSMS(to, message) {
    try {
      const result = await this.client.messages.create({
        body: message,
        from: process.env.BUSINESS_PHONE,
        to: to
      });

      logger.info(`SMS sent successfully: ${result.sid}`);
      return result;
      
    } catch (error) {
      logger.error('SMS sending error:', error);
      throw error;
    }
  }

  async makeCall(to, twimlUrl) {
    try {
      const call = await this.client.calls.create({
        url: twimlUrl,
        to: to,
        from: process.env.BUSINESS_PHONE
      });

      logger.info(`Call initiated: ${call.sid}`);
      return call;
      
    } catch (error) {
      logger.error('Call initiation error:', error);
      throw error;
    }
  }

  async getCallLogs(limit = 50) {
    try {
      const calls = await this.client.calls.list({ limit });
      return calls;
    } catch (error) {
      logger.error('Error fetching call logs:', error);
      throw error;
    }
  }

  async getMessageLogs(limit = 50) {
    try {
      const messages = await this.client.messages.list({ limit });
      return messages;
    } catch (error) {
      logger.error('Error fetching message logs:', error);
      throw error;
    }
  }
}

module.exports = TwilioService;