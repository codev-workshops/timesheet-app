import { describe, it, expect, vi } from 'vitest';
import { StrictMode, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

const render = vi.hoisted(() => vi.fn());

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render })),
}));

vi.mock('./App.tsx', () => ({ default: () => null }));

describe('main', () => {
  it('mounts App in StrictMode on #root', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    await import('./main.tsx');

    expect(vi.mocked(createRoot)).toHaveBeenCalledWith(root);
    expect(render).toHaveBeenCalledTimes(1);
    const element = render.mock.calls[0][0] as ReactElement;
    expect(element.type).toBe(StrictMode);

    root.remove();
  });
});
