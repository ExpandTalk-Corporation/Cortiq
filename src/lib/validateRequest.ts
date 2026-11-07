import { z } from 'zod';

/**
 * Validation Error Response Format
 */
export interface ValidationErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details: Array<{
      path: (string | number)[];
      message: string;
      code: string;
    }>;
  };
}

/**
 * Success Response Format
 */
export interface ValidationSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Combined Response Type
 */
export type ValidationResponse<T> = ValidationSuccessResponse<T> | ValidationErrorResponse;

/**
 * Validates request data against a Zod schema
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validation result with typed data or formatted error
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResponse<T> {
  try {
    const validatedData = schema.parse(data);
    return {
      success: true,
      data: validatedData,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.issues.map((err) => ({
            path: err.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
            message: err.message,
            code: err.code,
          })),
        },
      };
    }

    // Handle unexpected errors
    return {
      success: false,
      error: {
        message: 'An unexpected error occurred during validation',
        code: 'VALIDATION_EXCEPTION',
        details: [{
          path: [],
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'UNKNOWN',
        }],
      },
    };
  }
}

/**
 * Safe validation that returns null on error instead of throwing
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validated data or null if validation fails
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T | null {
  try {
    return schema.parse(data);
  } catch {
    return null;
  }
}

/**
 * Validates data and throws an error with formatted message
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param context - Optional context for error message
 * @throws Error with formatted validation errors
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      throw new Error(
        `Validation error${context ? ` (${context})` : ''}: ${errorMessages}`
      );
    }
    throw error;
  }
}

/**
 * Formats Zod error into a user-friendly message
 * @param error - Zod error
 * @returns Formatted error message
 */
export function formatZodError(error: z.ZodError): string {
  const messages = error.issues.map((err) => {
    const path = err.path.length > 0 ? `${err.path.join('.')} - ` : '';
    return `${path}${err.message}`;
  });
  return messages.join(', ');
}

/**
 * Validates request body from Edge Function
 * @param body - Request body (parsed JSON)
 * @param schema - Zod schema to validate against
 * @returns Validation result
 */
export function validateEdgeFunction<T>(
  body: unknown,
  schema: z.ZodSchema<T>
): ValidationResponse<T> {
  return validateRequest(schema, body);
}

/**
 * Creates a partial schema validator for partial updates
 * @param schema - Original Zod schema
 * @returns Partial version of the schema where all fields are optional
 */
export function makePartial<T extends z.ZodObject<any>>(
  schema: T
): z.ZodObject<{
  [K in keyof T['shape']]: z.ZodOptional<T['shape'][K]>;
}> {
  const shape = schema.shape;
  const partialShape: Record<string, any> = {};

  for (const key in shape) {
    partialShape[key] = (shape[key] as z.ZodTypeAny).optional();
  }

  return z.object(partialShape) as any;
}

/**
 * Validates nested properties
 * @param schema - Zod schema
 * @param data - Data to validate
 * @param path - Property path (e.g., 'user.profile.email')
 * @returns Validation result for nested property
 */
export function validateNested<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  path: string
): ValidationResponse<T> {
  const result = validateRequest(schema, data);
  if (!result.success) {
    // Update error paths to include the parent path
    result.error.details = result.error.details.map((detail) => ({
      ...detail,
      path: [path, ...detail.path],
    }));
  }
  return result;
}

/**
 * Helper to get first validation error message
 * @param schema - Zod schema
 * @param data - Data to validate
 * @returns First error message or null if valid
 */
export function getFirstError<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): string | null {
  const result = validateRequest(schema, data);
  if (result.success) return null;
  return result.error.details[0]?.message || 'Validation failed';
}

/**
 * Validates and extracts specific fields from data
 * @param data - Data to validate and extract from
 * @param schema - Zod schema
 * @param fields - Array of field names to extract
 * @returns Object with only the specified fields
 */
export function validateAndExtract<T, K extends keyof T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  fields: K[]
): Partial<T> | null {
  const result = validateRequest(schema, data);
  if (!result.success) return null;

  const extracted: Partial<T> = {};
  fields.forEach((field) => {
    (extracted as any)[field] = (result as any).data[field];
  });

  return extracted;
}

/**
 * Merges multiple validation schemas
 * @param schemas - Array of schemas to merge
 * @returns Combined schema
 */
export function mergeSchemas(
  ...schemas: z.ZodObject<any>[]
): z.ZodObject<any> {
  let merged = schemas[0];
  for (let i = 1; i < schemas.length; i++) {
    merged = merged.merge(schemas[i]);
  }
  return merged;
}

/**
 * Creates a conditional schema based on a discriminator field
 * @param discriminator - Field name that determines which schema to use
 * @param schemas - Map of discriminator values to schemas
 * @returns Discriminated union schema
 */
export function createDiscriminatedSchema<T extends Record<string, z.ZodObject<any>>>(
  discriminator: string,
  schemas: T
): z.ZodUnion<[z.ZodObject<any>, ...z.ZodObject<any>[]] | any> {
  const entries = Object.entries(schemas);
  if (entries.length === 0) {
    throw new Error('At least one schema is required');
  }

  return z.discriminatedUnion(
    discriminator,
    entries.map(([key, schema]) =>
      schema.extend({ [discriminator]: z.literal(key) })
    ) as any
  );
}

/**
 * Validates a batch of items against a schema
 * @param schema - Schema to validate each item against
 * @param items - Array of items to validate
 * @returns Object with valid items and errors
 */
export function validateBatch<T>(
  schema: z.ZodSchema<T>,
  items: unknown[]
): {
  valid: T[];
  errors: Array<{ index: number; error: string }>;
} {
  const valid: T[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  items.forEach((item, index) => {
    const result = validateRequest(schema, item);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({
        index,
        error: result.error.details[0]?.message || 'Validation failed',
      });
    }
  });

  return { valid, errors };
}

/**
 * Sanitizes input by removing/escaping potentially dangerous content
 * @param value - Value to sanitize
 * @returns Sanitized value
 */
export function sanitizeValue(value: any): any {
  if (typeof value === 'string') {
    // Remove potential XSS vectors
    return value
      .replace(/[<>]/g, '') // Remove angle brackets
      .trim();
  }
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    const sanitized: Record<string, any> = {};
    for (const key in value) {
      sanitized[key] = sanitizeValue(value[key]);
    }
    return sanitized;
  }
  return value;
}

/**
 * Validates request and sanitizes data in one step
 * @param schema - Zod schema to validate against
 * @param data - Data to validate and sanitize
 * @returns Validation response with sanitized data
 */
export function validateAndSanitize<T extends Record<string, any>>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResponse<T> {
  const result = validateRequest(schema, data);
  if (result.success) {
    return {
      success: true,
      data: sanitizeValue(result.data) as T,
    };
  }
  return result;
}
