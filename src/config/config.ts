import { z } from 'zod';

export const configSchema = z.object({
  environment: z.enum(['development', 'production', 'local']),
  cronSchedule: z.string(),
  tenderland: z.object({
    autosearchId: z.number(),
    limit: z.number(),
    orderBy: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export type Config = z.infer<typeof configSchema>;

const developmentConfig: Config = {
  environment: 'development',
  cronSchedule: '*/15 8-20 * * *',
  tenderland: {
    autosearchId: 249612, // Replace with your development autosearch ID
    limit: 100,
    orderBy: 'desc',
  },
};

const productionConfig: Config = {
  environment: 'production',
  cronSchedule: '*/15 1-13 * * *',
  tenderland: {
    autosearchId: 249612, // Replace with your production autosearch ID
    limit: 100,
    orderBy: 'desc',
  },
};

const localConfig: Config = {
  environment: 'local',
  cronSchedule: '* * * * *', // Run every minute in test
  tenderland: {
    autosearchId: 249612, // Replace with your test autosearch ID
    limit: 100,
    orderBy: 'asc',
  },
};

export function getConfig(): Config {
  const env = process.env.NODE_ENV || 'development';

  const config = (() => {
    switch (env) {
      case 'production':
        return productionConfig;
      case 'local':
        return localConfig;
      default:
        return developmentConfig;
    }
  })();

  // logConfig(config);
  return config;
}
