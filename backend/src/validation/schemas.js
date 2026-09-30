const Joi = require('joi');

const clientSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  department: Joi.string().trim().max(255).optional().allow(''),
  email: Joi.string().trim().email().max(255).optional().allow('')
});

// Calendar date stored verbatim as YYYY-MM-DD (no Date object coercion)
const dateStringSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      return helpers.error('any.invalid');
    }
    return value;
  }, 'calendar date validation')
  .messages({ 'any.invalid': '"date" must be a valid calendar date' });

// Hours with at most 2 decimal places; stricter input is rejected, not rounded
const hoursSchema = Joi.number().strict().positive().max(24).precision(2);

const workEntrySchema = Joi.object({
  clientId: Joi.number().integer().positive().required(),
  hours: hoursSchema.required(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  date: dateStringSchema.required()
});

const updateWorkEntrySchema = Joi.object({
  clientId: Joi.number().integer().positive().optional(),
  hours: hoursSchema.optional(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  date: dateStringSchema.optional()
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

module.exports = {
  clientSchema,
  workEntrySchema,
  updateWorkEntrySchema,
  updateClientSchema,
  emailSchema
};
