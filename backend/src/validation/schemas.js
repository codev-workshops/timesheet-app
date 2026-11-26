const Joi = require('joi');

const workEntryDate = Joi.string().custom((value, helpers) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const utcDate = new Date(`${value}T00:00:00Z`);
    if (Number.isFinite(utcDate.getTime()) && utcDate.toISOString().slice(0, 10) === value) {
      return value;
    }
  }
  return helpers.error('any.invalid');
}).messages({ 'any.invalid': '{{#label}} must be a valid calendar date (YYYY-MM-DD)' });

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
  date: workEntryDate.required()
});

const updateWorkEntrySchema = Joi.object({
  clientId: Joi.number().integer().positive().optional(),
  hours: Joi.number().positive().max(24).precision(2).optional(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  date: workEntryDate.optional()
}).min(1); // At least one field must be provided

const updateClientSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  department: Joi.string().trim().max(255).optional().allow(''),
  email: Joi.string().trim().email().max(255).optional().allow('')
}).min(1); // At least one field must be provided

const PROJECT_STATUSES = ['active', 'completed', 'on-hold'];

const projectSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  clientId: Joi.number().integer().positive().required(),
  startDate: Joi.date().iso().required(),
  status: Joi.string().valid(...PROJECT_STATUSES).default('active')
});

const updateProjectSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  clientId: Joi.number().integer().positive().optional(),
  startDate: Joi.date().iso().optional(),
  status: Joi.string().valid(...PROJECT_STATUSES).optional()
}).min(1); // At least one field must be provided

const emailSchema = Joi.object({
  email: Joi.string().email().required()
});

module.exports = {
  clientSchema,
  workEntrySchema,
  updateWorkEntrySchema,
  updateClientSchema,
  projectSchema,
  updateProjectSchema,
  PROJECT_STATUSES,
  emailSchema
};
