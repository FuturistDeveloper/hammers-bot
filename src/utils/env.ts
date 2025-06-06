import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().transform(Number),
  BOT_LINK: z.string().optional(),
  BOT_TOKEN: z.string(),
  MONGO_URI: z.string(),
  CLAUDE_API_KEY: z.string(),
  OPENAI_API_KEY: z.string(),
  TENDERLAND_API_KEY: z.string(),
  GEMINI_API_KEY: z.string(),
});

export type Env = z.infer<typeof envSchema>;

function maskSensitiveValue(value: string): string {
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function validateEnv(): Env {
  const missingVars: string[] = [];
  
  // Check required environment variables
  const requiredVars = [
    'PORT',
    'BOT_TOKEN',
    'MONGO_URI',
    'CLAUDE_API_KEY',
    'OPENAI_API_KEY',
    'TENDERLAND_API_KEY',
    'GEMINI_API_KEY'
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\nPlease add these variables to your .env file');
    process.exit(1);
  }

  try {
    const env = envSchema.parse(process.env);
    
    // Log success message with masked values
    console.log('\n✅ Environment variables validated successfully:');
    console.log('   Environment configuration:');
    Object.entries(env).forEach(([key, value]) => {
      const maskedValue = key.includes('API_KEY') || key.includes('TOKEN') || key.includes('URI')
        ? maskSensitiveValue(String(value))
        : value;
      console.log(`   - ${key}: ${maskedValue}`);
    });
    console.log('\n');

    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach(err => {
        console.error(`   - ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error('❌ Unexpected error during environment validation:', error);
    }
    process.exit(1);
  }
} 