import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BACKEND_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  JWT_SECRET: z.string().refine((value) => Buffer.byteLength(value, 'utf8') >= 32, {
    message: 'JWT_SECRET must contain at least 32 bytes',
  }),
  JWT_ISSUER: z.string().min(1).default('sarh-orders-api'),
  JWT_AUDIENCE: z.string().min(1).default('sarh-orders-web'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

