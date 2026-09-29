import { expect, it, vi } from 'vitest';
import { CoachBudget } from '../server/coach-budget';

it('does not schedule a deadline for unlimited work but still supports an explicit limit', () => {
  vi.useFakeTimers();
  const unlimited = new CoachBudget(0);
  const limited = new CoachBudget(1000);
  try {
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(3600000);
    expect(unlimited.signal.aborted).toBe(false);
    expect(limited.signal.aborted).toBe(true);
    expect(limited.reason).toContain('超时');
  } finally {
    unlimited.close();
    limited.close();
    vi.useRealTimers();
  }
});
