const Joi = require('joi');

const clientSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  department: Joi.string().trim().max(255).optional().allow(''),
  email: Joi.string().trim().email().max(255).optional().allow('')
});

const categorySchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  color: Joi.string().trim().pattern(/^#[0-9A-Fa-f]{6}$/).optional().allow('')
});

const updateCategorySchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  color: Joi.string().trim().pattern(/^#[0-9A-Fa-f]{6}$/).optional().allow('')
}).min(1); // At least one field must be provided

const workEntrySchema = Joi.object({
  clientId: Joi.number().integer().positive().required(),
  categoryId: Joi.number().integer().positive().optional().allow(null),
  hours: Joi.number().positive().max(24).precision(2).required(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  date: Joi.date().iso().required()
});

const updateWorkEntrySchema = Joi.object({
  clientId: Joi.number().integer().positive().optional(),
  categoryId: Joi.number().integer().positive().optional().allow(null),
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

module.exports = {
  clientSchema,
  workEntrySchema,
  updateWorkEntrySchema,
  updateClientSchema,
  categorySchema,
  updateCategorySchema,
  emailSchema
};
