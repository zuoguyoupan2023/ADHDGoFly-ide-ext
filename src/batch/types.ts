import type { DecoratedWord } from '../highlightEngine/types'

export interface BatchFileResult {
  filePath: string
  fileName: string
  wordCount: number
  words: DecoratedWord[]
  error?: string
}

export interface AggregatedStats {
  totalFiles: number
  totalWords: number
  totalProcessed: number
  totalErrors: number
  wordFrequency: Map<string, { pos: string; count: number; files: string[] }>
}

export interface BatchProgressMessage {
  type: 'batchProgress'
  completed: number
  total: number
  cancelled?: boolean
}

export interface BatchFileDoneMessage {
  type: 'batchFileDone'
  filePath: string
  words: DecoratedWord[]
  wordCount: number
}

export interface BatchResultMessage {
  type: 'batchResult'
  files: BatchFileResult[]
}

// Webview → Extension messages
export interface BatchOpenFileMessage {
  type: 'batchOpenFile'
  filePath: string
}

export interface BatchCancelMessage {
  type: 'batchCancel'
}

export interface BatchClearMessage {
  type: 'batchClear'
}

export interface BatchExportAllMessage {
  type: 'batchExportAll'
}
