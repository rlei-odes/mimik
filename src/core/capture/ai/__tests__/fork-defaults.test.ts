import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localStorage } from '@/lib/browser-api';
import { FORK_AI_DEFAULTS, FORK_AI_PLACEHOLDER_KEY, seedForkDefaults } from '../fork-defaults';

vi.mock('@/lib/browser-api', () => ({
  localStorage: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) },
}));

function stored(values: Record<string, unknown>) {
  vi.mocked(localStorage.get).mockResolvedValue(values as never);
}

function written(): Record<string, unknown> {
  return vi.mocked(localStorage.set).mock.calls[0]?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.mocked(localStorage.set).mockClear();
});

describe('the endpoint this fork ships', () => {
  it('points at the internal server, not at OpenAI', () => {
    expect(FORK_AI_DEFAULTS.aiProvider).toBe('openai');
    expect(FORK_AI_DEFAULTS.aiBaseUrl).toBe('http://192.168.129.190:8000/v1');
    expect(FORK_AI_DEFAULTS.aiModel).toBe('RedHatAI/gemma-4-26B-A4B-it-FP8-Dynamic');
  });

  it('carries only the placeholder the settings form insists on', () => {
    expect(FORK_AI_PLACEHOLDER_KEY).toBe('abc');
  });
});

describe('seeding a fresh install', () => {
  it('fills in the endpoint, the model and the placeholder key', async () => {
    stored({});
    await seedForkDefaults();

    expect(written()).toEqual({
      aiProvider: 'openai',
      aiBaseUrl: 'http://192.168.129.190:8000/v1',
      aiModel: 'RedHatAI/gemma-4-26B-A4B-it-FP8-Dynamic',
      aiApiKeys: { openai: 'abc' },
    });
  });

  it('files the key under the provider it belongs to', async () => {
    stored({});
    await seedForkDefaults();

    expect(written().aiApiKeys).toEqual({ openai: FORK_AI_PLACEHOLDER_KEY });
  });
});

describe('seeding over settings somebody already has', () => {
  it('leaves a configuration of their own completely alone', async () => {
    stored({
      aiProvider: 'anthropic',
      aiBaseUrl: 'https://my-own-proxy/v1',
      aiModel: 'my-model',
      aiApiKeys: { anthropic: 'sk-real' },
    });
    await seedForkDefaults();

    expect(localStorage.set).not.toHaveBeenCalled();
  });

  it('fills only the gaps when the settings are half configured', async () => {
    stored({ aiBaseUrl: 'https://my-own-proxy/v1', aiApiKeys: { openai: 'sk-real' } });
    await seedForkDefaults();

    expect(written()).toEqual({
      aiProvider: 'openai',
      aiModel: 'RedHatAI/gemma-4-26B-A4B-it-FP8-Dynamic',
    });
  });

  it('never replaces a real key with the placeholder', async () => {
    stored({ aiApiKeys: { openai: 'sk-real' } });
    await seedForkDefaults();

    expect(written()).not.toHaveProperty('aiApiKeys');
  });

  it('keeps the keys held for other providers when adding ours', async () => {
    stored({ aiApiKeys: { anthropic: 'sk-anthropic' } });
    await seedForkDefaults();

    expect(written().aiApiKeys).toEqual({ anthropic: 'sk-anthropic', openai: 'abc' });
  });

  it('recognises a key still stored in the older single-key setting', async () => {
    stored({ aiProvider: 'openai', aiApiKey: 'sk-legacy' });
    await seedForkDefaults();

    expect(written()).not.toHaveProperty('aiApiKeys');
  });

  it('treats an emptied setting as unset, so a cleared field is filled again', async () => {
    stored({ aiProvider: '', aiBaseUrl: '', aiModel: '' });
    await seedForkDefaults();

    expect(written().aiBaseUrl).toBe('http://192.168.129.190:8000/v1');
  });
});

describe('when storage misbehaves', () => {
  it('does not take the extension down with it', async () => {
    vi.mocked(localStorage.get).mockRejectedValue(new Error('storage gone'));

    await expect(seedForkDefaults()).resolves.toBeUndefined();
  });
});
