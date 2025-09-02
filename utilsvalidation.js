utils/validation.js
const { body, param, query } = require('express-validator');

const phoneRegex = /^\+1[0-9]{10}$/;

const validationRules = {
  phone: body('phone')
    .matches(phoneRegex)
    .withMessage('Phone number must be in format +1XXXXXXXXXX'),
    
  message: body('message')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters')
    .trim()
    .escape(),
    
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email address required'),
    
  name: body('name')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .trim()
    .escape(),
    
  serviceType: body('serviceType')
    .isIn(['studio', '1-2br', '3br', '4+br'])
    .withMessage('Invalid service type'),
    
  callSid: param('callSid')
    .isLength({ min: 34, max: 34 })
    .withMessage('Invalid Twilio Call SID format')
};

const sanitizeInput = (input) => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .replace(/[<>]/g, '') // Remove potential HTML
    .replace(/javascript:/gi, '') // Remove JS injection
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim()
    .substring(0, 1000); // Limit length
};

module.exports = {
  validationRules,
  sanitizeInput
};