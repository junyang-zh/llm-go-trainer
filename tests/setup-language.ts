import { beforeEach, vi } from 'vitest';

// Existing UI assertions use Chinese. Production defaults to the user's system language;
// tests explicitly choose a deterministic system locale instead of inheriting the host OS.
beforeEach(() => {
  if (typeof navigator !== 'undefined') {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-CN');
  }
});
