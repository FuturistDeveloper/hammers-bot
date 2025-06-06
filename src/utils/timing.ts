export const measureExecutionTime = async <T>(
  fn: () => Promise<T>,
  description: string = 'Operation',
): Promise<T> => {
  const start = performance.now();
  try {
    const result = await fn();
    const end = performance.now();
    const duration = (end - start) / 1000; // Convert to seconds
    console.log(`${description} took ${duration.toFixed(2)} seconds`);
    return result;
  } catch (error) {
    const end = performance.now();
    const duration = (end - start) / 1000;
    console.error(`${description} failed after ${duration.toFixed(2)} seconds:`, error);
    return error as T;
  }
};
