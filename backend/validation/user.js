import { z } from 'zod';

export const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
export const password = z.string().min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes')
  .regex(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).+$/, 'Password must include uppercase, lowercase, and a number');
const profile = {
  ownerName: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  avatar: z.string().url().max(255).optional(),
};
export const userCreate = z.object({ ...profile, email, password });
export const userUpdate = z.object(profile).strict()
  .refine(value => Object.keys(value).length > 0, 'No fields to update');
export const login = z.object({ email, password: z.string().min(1).max(1000) });
