/**
 * AI POS (Part-of-Speech) judging module.
 *
 * Calls the user's configured primary AI provider to judge word POS.
 */

import type { AiProvider } from './config'

// ── Prompt ─────────────────────────────────────────────────────────────────

const JUDGE_PROMPT = `你是一个英语词性标注助手。请判断给定英语单词可能的所有词性（Part of Speech），只返回 JSON 格式结果。

可能的词性标签：n, v, adj, adv, prep, conj, pron, num, mw, interj, part, aux

规则：
- 一个单词可能有多个词性（如 "book" 是 n 也是 v）
- n = 名词, v = 动词, adj = 形容词, adv = 副词, prep = 介词, conj = 连词
- pron = 代词, num = 数词, mw = 量词, interj = 叹词, part = 助词, aux = 助动词
- 只返回 JSON，不要其他文字

示例：
{"pos": ["n", "v"]}
{"pos": ["n"]}
{"pos": ["adj", "adv", "n"]}`

// ── Judge with provider ────────────────────────────────────────────────────

async function judgePosByProvider(word: string, provider: AiProvider): Promise<string[]> {
  if (!provider.apiUrl) {
    throw new Error(`提供商「${provider.name}」未配置 API URL`)
  }
  if (!provider.apiKey) {
    throw new Error(`提供商「${provider.name}」未配置 API Key`)
  }

  const body = JSON.stringify({
    model: provider.model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: JUDGE_PROMPT },
      { role: 'user', content: `单词: ${word}` },
    ],
    temperature: 0.1,
    max_tokens: 100,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${provider.apiKey}`,
  }

  const response = await fetch(provider.apiUrl, {
    method: 'POST',
    headers,
    body,
  })

  if (!response.ok) {
    throw new Error(`API 请求失败 (${response.status})：${response.statusText}`)
  }

  const data: any = await response.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) {
    throw new Error('API 返回内容为空')
  }

  return parsePosResponse(text)
}

// ── Response parser ────────────────────────────────────────────────────────

function parsePosResponse(text: string): string[] {
  const jsonMatch = text.match(/\{[\s\S]*"pos"[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('无法解析 AI 返回结果')
  }

  const parsed = JSON.parse(jsonMatch[0])
  if (!Array.isArray(parsed.pos)) {
    throw new Error('API 返回格式错误：缺少 "pos" 数组')
  }

  return parsed.pos.map((p: string) => p.trim().toLowerCase())
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Judge POS of a word using the configured primary AI provider.
 */
export async function judgePos(
  word: string,
  providers: AiProvider[],
): Promise<{ word: string; pos: string[]; providerName: string }> {
  if (!word.trim()) {
    throw new Error('词汇为空')
  }

  // Find primary provider; fallback to first
  const provider = providers.find(p => p.isPrimary) || providers[0]
  if (!provider) {
    throw new Error('未配置 AI 提供商，请先在设置中添加')
  }

  const pos = await judgePosByProvider(word, provider)
  return { word, pos, providerName: provider.name }
}
