import { z } from 'zod';
import { logConfig } from '../utils/logger';

export const configSchema = z.object({
  environment: z.enum(['development', 'production', 'local']),
});

export type Config = z.infer<typeof configSchema>;

const developmentConfig: Config = {
  environment: 'development',
};

const productionConfig: Config = {
  environment: 'production',
};

const localConfig: Config = {
  environment: 'local',
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

  logConfig(config);
  return config;
}
