/** Resolves once `ms` have passed, or on the next turn of the task queue for none. */
export function delay(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
