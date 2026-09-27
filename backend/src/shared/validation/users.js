import { z } from 'zod';
import { paginationSchema, idParamSchema, emailSchema, phoneSchema } from './common.js';

/**
 * User validation schemas
 */

// Get users (Admin)
export const getUsersSchema = z.object({
  query: z.object({
    includeDeleted: z.coerce.boolean().optional(),
    onlyDeleted: z.coerce.boolean().optional(),
    role: z.enum(['customer', 'admin', 'staff']).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    search: z.string().max(100).optional(),
    sortBy: z.enum(['createdAt', 'name', 'email', 'lastLogin']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    ...paginationSchema.shape,
  }),
});

// Create user (Admin)
export const createUserSchema = z.object({
  body: z.object({
    firstName: z.string().min(2).max(50),
    lastName: z.string().min(2).max(50),
    email: emailSchema,
    password: z.string().min(8).max(128),
    role: z.enum(['customer', 'admin', 'staff']).default('customer'),
    status: z.enum(['active', 'inactive']).default('active'),
    phone: phoneSchema.optional(),
  }),
});

// Get user by ID (accepts both numeric ID and "user-XXX" format)
// Optimized: Preprocesses to normalize ID format, then validates as number
export const getUserSchema = z.object({
  params: z.object({
    id: z.preprocess(
      (val) => {
        if (typeof val === 'string') {
          // Extract numeric part from "user-XXX" format
          const match = val.match(/^user-(\d+)$/);
          if (match) return parseInt(match[1], 10);
          // Otherwise parse directly
          const num = parseInt(val, 10);
          if (!isNaN(num)) return num;
        }
        return val;
      },
      z.number().int().positive({ message: 'Invalid user ID' })
    )
  }),
});

// Update user profile (Self)
export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
    phone: phoneSchema.optional(),
    avatar: z.string().url().optional(),
    preferences: z.object({
      newsletter: z.boolean().optional(),
      notifications: z.object({
        email: z.boolean().optional(),
        sms: z.boolean().optional(),
        push: z.boolean().optional(),
      }).optional(),
      language: z.enum(['en', 'fr', 'ar']).optional(),
      currency: z.enum(['DZD', 'EUR', 'USD']).optional(),
    }).optional(),
  }),
});

// Update user (Admin) - accepts both numeric ID and "user-XXX" format
// Optimized: Preprocesses to normalize ID format
export const updateUserSchema = z.object({
  params: z.object({
    id: z.preprocess(
      (val) => {
        if (typeof val === 'string') {
          const match = val.match(/^user-(\d+)$/);
          if (match) return parseInt(match[1], 10);
          const num = parseInt(val, 10);
          if (!isNaN(num)) return num;
        }
        return val;
      },
      z.number().int().positive({ message: 'Invalid user ID' })
    )
  }),
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    role: z.enum(['customer', 'admin', 'staff']).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    avatar: z.string().url().optional(),
  }),
});

// Change password
export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must not exceed 72 characters')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }).refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  }),
});

// Add address
export const addAddressSchema = z.object({
  body: z.object({
    label: z.string().min(1).max(50).default('Home'),
    fullName: z.string().min(2).max(100),
    phone: phoneSchema,
    address: z.string().min(5).max(200),
    city: z.string().min(2).max(100),
    wilaya: z.string().min(2).max(100),
    postalCode: z.string().max(10).optional(),
    isDefault: z.boolean().default(false),
    instructions: z.string().max(500).optional(),
  }),
});

// Update address
export const updateAddressSchema = z.object({
  params: z.object({
    addressId: z.coerce.number().int().positive(),
  }),
  body: z.object({
    label: z.string().min(1).max(50).optional(),
    fullName: z.string().min(2).max(100).optional(),
    phone: phoneSchema.optional(),
    address: z.string().min(5).max(200).optional(),
    city: z.string().min(2).max(100).optional(),
    wilaya: z.string().min(2).max(100).optional(),
    postalCode: z.string().max(10).optional(),
    isDefault: z.boolean().optional(),
    instructions: z.string().max(500).optional(),
  }),
});

// Delete address
export const deleteAddressSchema = z.object({
  params: z.object({
    addressId: z.coerce.number().int().positive(),
  }),
});

// Delete user (Admin) - accepts both numeric ID and "user-XXX" format
// Optimized: Preprocesses to normalize ID format
export const deleteUserSchema = z.object({
  params: z.object({
    id: z.preprocess(
      (val) => {
        if (typeof val === 'string') {
          const match = val.match(/^user-(\d+)$/);
          if (match) return parseInt(match[1], 10);
          const num = parseInt(val, 10);
          if (!isNaN(num)) return num;
        }
        return val;
      },
      z.number().int().positive({ message: 'Invalid user ID' })
    )
  }),
});

// Forgot password
export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

// Reset password
export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: z.string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must not exceed 72 characters')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export default {
  getUsersSchema,
  getUserSchema,
  updateProfileSchema,
  updateUserSchema,
  deleteUserSchema,
  changePasswordSchema,
  addAddressSchema,
  updateAddressSchema,
  deleteAddressSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
