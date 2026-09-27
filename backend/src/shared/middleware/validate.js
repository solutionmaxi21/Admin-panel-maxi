import { ValidationError } from '../errors/index.js';

/**
 * Validation middleware factory
 * Creates middleware that validates request data against a Zod schema
 * 
 * @param {Object} schema - Zod schema with optional body, query, params keys
 * @returns {Function} Express middleware
 * 
 * @example
 * // Define schema
 * const createProductSchema = z.object({
 *   body: z.object({
 *     name: z.string().min(2),
 *     price: z.number().positive(),
 *   }),
 *   params: z.object({
 *     id: z.string(),
 *   }),
 * });
 * 
 * // Use in route
 * router.post('/products/:id', validate(createProductSchema), controller.create);
 */
export const validate = (schema) => (req, res, next) => {
  try {
    // Parse and validate request data
    const result = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    // Attach validated data to request
    req.validated = result;
    
    // Also update original properties with coerced/transformed values
    if (result.body) req.body = result.body;
    if (result.query) req.query = result.query;
    if (result.params) req.params = result.params;

    next();
  } catch (error) {
    // Re-throw to let errorHandler process it
    next(error);
  }
};

/**
 * Validate only the request body
 * Simpler version for body-only validation
 * 
 * @param {Object} schema - Zod schema for body
 * @returns {Function} Express middleware
 */
export const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Validate only query parameters
 * 
 * @param {Object} schema - Zod schema for query
 * @returns {Function} Express middleware
 */
export const validateQuery = (schema) => (req, res, next) => {
  try {
    req.query = schema.parse(req.query);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Validate only route parameters
 * 
 * @param {Object} schema - Zod schema for params
 * @returns {Function} Express middleware
 */
export const validateParams = (schema) => (req, res, next) => {
  try {
    req.params = schema.parse(req.params);
    next();
  } catch (error) {
    next(error);
  }
};

export default {
  validate,
  validateBody,
  validateQuery,
  validateParams,
};
