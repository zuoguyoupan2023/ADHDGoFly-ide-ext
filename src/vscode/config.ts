import * as vscode from 'vscode'
import type { SupportedLang } from '../highlightEngine/types'
import type { EngineConfig } from '../highlightEngine/index'

export interface AiProvider {
  name: string
  apiUrl: string
  apiKey: string
  model: string
  isPrimary: boolean
}

export interface ExtensionConfig extends EngineConfig {
  enabled: boolean
  highlightInComments: boolean
  decorationStyle: 'color' | 'highlight'
  locale: string
  disabledDicts: string[]
  // AI POS judging config
  aiEnabled: boolean
  aiProviders: AiProvider[]
}

export function loadConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('adhdgofly')
  const result = {
    enabled: cfg.get<boolean>('enabled', true),
    languages: cfg.get<SupportedLang[]>('languages', ['en', 'zh']),
    minWordLength: cfg.get<number>('minWordLength', 2),
    highlightInComments: cfg.get<boolean>('highlightInComments', true),
    decorationStyle: cfg.get<'color' | 'highlight'>('decorationStyle', 'color'),
    locale: cfg.get<string>('locale', 'auto'),
    posFilter: cfg.get<string[]>('posFilter', ['n', 'v', 'a', 'other']),
    disabledDicts: cfg.get<string[]>('disabledDicts', []),
    aiEnabled: cfg.get<boolean>('aiEnabled', true),
    aiProviders: parseProviders(cfg.get<string>('aiProviders', '')),
  }
  return result
}

function parseProviders(raw: string): AiProvider[] {
  if (!raw) {
    return getDefaultProviders()
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return getDefaultProviders()
    }
    return parsed
  } catch {
    return getDefaultProviders()
  }
}

function getDefaultProviders(): AiProvider[] {
  return [
    { name: 'OpenAI', apiUrl: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-4o-mini', isPrimary: true },
    { name: 'Anthropic Claude', apiUrl: 'https://api.anthropic.com/v1/chat/completions', apiKey: '', model: 'claude-sonnet-4-20250514', isPrimary: false },
    { name: 'DeepSeek', apiUrl: 'https://api.deepseek.com/v1/chat/completions', apiKey: '', model: 'deepseek-chat', isPrimary: false },
  ]
}
