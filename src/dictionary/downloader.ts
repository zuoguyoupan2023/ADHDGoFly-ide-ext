/**
 * Dictionary community downloader — fetches dicts from dictionary.adhdgofly.online.
 *
 * Default: RealCommunityDictAPI (connects to the live community server).
 * For local development/testing, switch to MockCommunityDictAPI.
 */

// ── Types — shared between mock and real API ────────────────────────────────

export interface CommunityDictMeta {
  id: string
  name: string
  lang: string
  wordCount: number
  author: string
  version: string
  description: string
}

export interface CommunityDictAPI {
  fetchDictList(): Promise<CommunityDictMeta[]>
  downloadDict(id: string): Promise<Record<string, { pos: string[] }>>
  uploadDict(name: string, lang: string, words: Record<string, { pos: string[] }>): Promise<{ id: string }>
}

// ── Configuration ──────────────────────────────────────────────────────────

const API_BASE = 'https://dictionary.adhdgofly.online'
const API_TOKEN = 'adhdgofly_b8432ac40cd7c50d3eabe454d01a1572'  // ← 如需更换 Token 改这里

// ── Real API implementation ─────────────────────────────────────────────────

class RealCommunityDictAPI implements CommunityDictAPI {
  private baseUrl: string
  private token: string

  constructor(baseUrl = API_BASE, token = API_TOKEN) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.token = token
  }

  async fetchDictList(): Promise<CommunityDictMeta[]> {
    const res = await fetch(`${this.baseUrl}/api/dicts`)
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data: any = await res.json()
    return (data.dicts || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      lang: d.lang,
      wordCount: d.wordCount,
      author: d.author || 'community',
      version: d.version || '1.0.0',
      description: d.description || '',
    }))
  }

  async downloadDict(id: string): Promise<Record<string, { pos: string[] }>> {
    const res = await fetch(`${this.baseUrl}/api/dicts/${encodeURIComponent(id)}`)
    if (!res.ok) throw new Error(`Download failed: ${res.status}`)
    const data: any = await res.json()
    return data.words || data
  }

  async uploadDict(name: string, lang: string, words: Record<string, { pos: string[] }>): Promise<{ id: string }> {
    const res = await fetch(`${this.baseUrl}/api/dicts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({ name, lang, source: 'adhdgofly-ide-ext', words }),
    })
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: { message: res.statusText } }))
      throw new Error(`Upload failed: ${err.error?.message || res.status}`)
    }
    return res.json() as Promise<{ id: string }>
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _api: CommunityDictAPI | null = null

/** Get the current API instance (defaults to real API). */
export function getCommunityDictAPI(): CommunityDictAPI {
  if (!_api) _api = new RealCommunityDictAPI()
  return _api
}

/** Override the API instance (for testing / switching to mock). */
export function setCommunityDictAPI(api: CommunityDictAPI): void {
  _api = api
}
