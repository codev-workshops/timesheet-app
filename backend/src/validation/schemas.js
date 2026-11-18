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

const reportSummarySchema = Joi.object({
  startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).isoDate().strict().required(),
  endDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).isoDate().strict().required(),
  groupBy: Joi.string().valid('week', 'month').default('month')
}).custom((value, helpers) => {
  if ([value.startDate, value.endDate].some((date) => new Date(date).toISOString().slice(0, 10) !== date)) {
    return helpers.message({ custom: 'Dates must be valid calendar dates' });
  }
  if (value.endDate < value.startDate) return helpers.message({ custom: 'endDate must be greater than or equal to startDate' });
  return value;
});

module.exports = {
  reportSummarySchema,
  clientSchema,
  workEntrySchema,
  updateWorkEntrySchema,
  updateClientSchema,
  emailSchema
};
