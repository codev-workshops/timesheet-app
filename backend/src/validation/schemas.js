const Joi = require('joi');

const clientSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  department: Joi.string().trim().max(255).optional().allow(''),
  email: Joi.string().trim().email().max(255).optional().allow('')
});

const workEntrySchema = Joi.object({
  clientId: Joi.number().integer().positive().required(),
  hours: Joi.number().positive().max(24).precision(2).required(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  date: Joi.date().iso().required()
});

const updateWorkEntrySchema = Joi.object({
  clientId: Joi.number().integer().positive().optional(),
  hours: Joi.number().positive().max(24).precision(2).optional(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  date: Joi.date().iso().optional()
}).min(1); // At least one field must be provided

const updateClientSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  department: Joi.string().trim().max(255).optional().allow(''),
  email: Joi.string().trim().email().max(255).optional().allow('')
}).min(1); // At least one field must be provided

const emailSchema = Joi.object({
  email: Joi.string().email().required()
});

const categorizeQuerySchema = Joi.object({
  userEmail: Joi.string().trim().email().max(255).optional(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional()
    .messages({ 'string.pattern.base': '"date" must be in YYYY-MM-DD format' }),
  dryRun: Joi.boolean().default(false),
  retryFailed: Joi.boolean().default(false),
  limit: Joi.number().integer().min(1).max(100000).optional()
});

module.exports = {
  categorizeQuerySchema,
  clientSchema,
  workEntrySchema,
  updateWorkEntrySchema,
  updateClientSchema,
  emailSchema
};
