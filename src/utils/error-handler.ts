import axios from 'axios';
import { z } from 'zod';

export const handleApiError = (error: unknown, functionName: string): never => {
  if (error instanceof z.ZodError) {
    throw new Error(`[${functionName}] Invalid response format: ${error.message}`);
  }
  if (axios.isAxiosError(error)) {
    throw new Error(
      `[${functionName}] API request failed: ${error.response?.data?.message || error.message}`,
    );
  }
  throw new Error(
    `[${functionName}] Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
};
