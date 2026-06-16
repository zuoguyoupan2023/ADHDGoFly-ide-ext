import * as vscode from 'vscode'
import * as path from 'path'
import { realpath } from 'fs/promises'
import type { DecoratedWord } from '../highlightEngine/types'
import type { EngineConfig, HighlightEngine } from '../highlightEngine/index'
import type { SidePanelProvider } from '../vscode/sidePanel'
import type { DictionaryManager } from '../dictionary/manager'
import { loadConfig } from '../vscode/config'
import type { BatchFileResult, AggregatedStats } from './types'

export class BatchProcessor {
  private results: Map<string, BatchFileResult> = new Map()
  private cancelled = false

  private supportedExts = new Set([
    '.md', '.txt', '.html', '.htm',
    '.py', '.go',
    '.js', '.ts', '.jsx', '.tsx',
  ])

  private ignoreDirs = new Set([
    // 版本控制
    '.git', '.svn', '.hg',
    // Node.js
    'node_modules', '.yarn', '.pnp', '.pnp.js',
    'bower_components', 'jspm_packages',
    // Python
    '__pycache__', '.venv', 'venv', '.mypy_cache', '.pytest_cache',
    '.ruff_cache', '.tox', 'eggs',
    // Java / JVM
    '.gradle', '.mvn',
    // Go / PHP / Ruby
    'vendor',
    // Rust
    'target',
    // Swift / iOS
    'Pods', '.build', 'Carthage', 'DerivedData',
    // JS/TS 构建输出
    'dist', '.next', '.turbo', '.output', '.cache',
    'coverage', '.nyc_output',
    // Dart / Flutter
    '.dart_tool', '.packages',
    // 编辑器 / IDE
    '.idea', '.vscode', '.vs',
    // 其他
    'elm-stuff', '.stack-work', 'cmake-build-debug',
  ])

  private readonly MAX_FILES = 500

  constructor(
    private engine: HighlightEngine,
    private dictManager: DictionaryManager,
    private sidePanel: SidePanelProvider,
  ) {}

  // ── Scanning ──────────────────────────────────────────────────────────

  scanFile(uri: vscode.Uri): boolean {
    const ext = path.extname(uri.fsPath).toLowerCase()
    return this.supportedExts.has(ext)
  }

  async scanFolder(uri: vscode.Uri): Promise<vscode.Uri[]> {
    const results: vscode.Uri[] = []
    const stack: vscode.Uri[] = [uri]
    const visited = new Set<string>()

    while (stack.length > 0) {
      const current = stack.pop()!
      // Resolve real path to detect circular symlink loops
      let realPath: string
      try {
        realPath = await realpath(current.fsPath)
      } catch {
        continue
      }
      if (visited.has(realPath)) continue
      visited.add(realPath)

      const entries = await vscode.workspace.fs.readDirectory(current)
      for (const [name, type] of entries) {
        const fullPath = path.join(current.fsPath, name)
        if ((type & vscode.FileType.Directory) !== 0) {
          if (this.ignoreDirs.has(name)) continue
          stack.push(vscode.Uri.file(fullPath))
        } else if ((type & vscode.FileType.File) !== 0) {
          if (this.supportedExts.has(path.extname(name).toLowerCase())) {
            results.push(vscode.Uri.file(fullPath))
          }
        }
      }
    }
    return results
  }

  // ── Processing ────────────────────────────────────────────────────────

  async processFile(uri: vscode.Uri, engineConfig: EngineConfig): Promise<BatchFileResult> {
    try {
      const content = (await vscode.workspace.fs.readFile(uri)).toString()
      const decorated: DecoratedWord[] = this.engine.process(content, engineConfig)
      const result: BatchFileResult = {
        filePath: uri.fsPath,
        fileName: path.basename(uri.fsPath),
        wordCount: decorated.length,
        words: decorated,
      }
      this.results.set(uri.fsPath, result)
      return result
    } catch (err) {
      const result: BatchFileResult = {
        filePath: uri.fsPath,
        fileName: path.basename(uri.fsPath),
        wordCount: 0,
        words: [],
        error: (err as Error).message,
      }
      this.results.set(uri.fsPath, result)
      return result
    }
  }

  async processFiles(
    files: vscode.Uri[],
    engineConfig: EngineConfig,
    onFileDone: (result: BatchFileResult) => void,
    token?: vscode.CancellationToken,
  ): Promise<void> {
    const CONCURRENCY = 4
    this.cancelled = false

    const run = async (file: vscode.Uri) => {
      if (this.cancelled || token?.isCancellationRequested) return
      const result = await this.processFile(file, engineConfig)
      if (this.cancelled || token?.isCancellationRequested) return
      onFileDone(result)
    }

    let i = 0
    const next = async (): Promise<void> => {
      if (i >= files.length) return
      if (this.cancelled || token?.isCancellationRequested) return
      const idx = i++
      await run(files[idx])
      await next()
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => next()))
  }

  // ── Public entry points ──────────────────────────────────────────────

  async processSingleFile(uri: vscode.Uri): Promise<void> {
    const config = loadConfig()
    this.engine.setDisabledDicts(config.disabledDicts || [])
    const engineConfig: EngineConfig = {
      languages: config.languages,
      minWordLength: config.minWordLength,
      posFilter: config.posFilter,
    }
    const result = await this.processFile(uri, engineConfig)
    this.sidePanel.sendBatchFileDone({
      filePath: result.filePath,
      words: result.words,
      wordCount: result.wordCount,
    })
  }

  async processFolder(uri: vscode.Uri): Promise<void> {
    const files = await this.scanFolder(uri)
    if (files.length === 0) {
      vscode.window.showInformationMessage('adhdgofly-ide-ext: 没有找到受支持的文件')
      return
    }

    if (files.length > this.MAX_FILES) {
      const choice = await vscode.window.showWarningMessage(
        `项目中包含 ${files.length} 个受支持文件，超过限制(${this.MAX_FILES})。`,
        { modal: true },
        '处理前 100 个', '处理前 500 个', '全部处理', '取消'
      )
      if (choice === '取消' || !choice) return
      if (choice === '处理前 100 个') files.length = 100
      else if (choice === '处理前 500 个') files.length = 500
    }

    await this.processWithProgress(files)
  }

  async processWithProgress(files: vscode.Uri[]): Promise<void> {
    const total = files.length

    const config = loadConfig()
    this.engine.setDisabledDicts(config.disabledDicts || [])
    const engineConfig: EngineConfig = {
      languages: config.languages,
      minWordLength: config.minWordLength,
      posFilter: config.posFilter,
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'adhdgofly-ide-ext: 处理文件中...',
      cancellable: true,
    }, async (_progress, token) => {
      this.sidePanel.sendBatchProgress({ completed: 0, total })

      await this.processFiles(files, engineConfig, (result) => {
        const done = this.results.size
        _progress.report({ message: `${done}/${total}` })
        this.sidePanel.sendBatchProgress({ completed: done, total })
        this.sidePanel.sendBatchFileDone({
          filePath: result.filePath,
          words: result.words,
          wordCount: result.wordCount,
        })
      }, token)

      if (token.isCancellationRequested) {
        this.sidePanel.sendBatchProgress({ completed: this.results.size, total, cancelled: true })
      } else {
        this.sidePanel.sendBatchResult([...this.results.values()])
      }
    })
  }

  // ── Cancel ───────────────────────────────────────────────────────────

  cancel(): void {
    this.cancelled = true
  }

  // ── Result management ────────────────────────────────────────────────

  clear(): void {
    this.results.clear()
    this.cancelled = false
  }

  getResults(): BatchFileResult[] {
    return [...this.results.values()]
  }

  getAggregatedStats(): AggregatedStats {
    const wordFrequency = new Map<string, { pos: string; count: number; files: string[] }>()
    let totalWords = 0
    let totalProcessed = 0
    let totalErrors = 0

    for (const result of this.results.values()) {
      if (result.error) {
        totalErrors++
        continue
      }
      totalProcessed++
      totalWords += result.wordCount

      for (const w of result.words) {
        const existing = wordFrequency.get(w.word)
        if (existing) {
          existing.count++
          if (!existing.files.includes(result.filePath)) {
            existing.files.push(result.filePath)
          }
        } else {
          wordFrequency.set(w.word, {
            pos: w.pos,
            count: 1,
            files: [result.filePath],
          })
        }
      }
    }

    return {
      totalFiles: this.results.size,
      totalWords,
      totalProcessed,
      totalErrors,
      wordFrequency,
    }
  }

  // ── Export ────────────────────────────────────────────────────────────

  async exportAllAsDict(name: string, lang: string): Promise<void> {
    const merged: Record<string, { pos: string[] }> = {}
    for (const result of this.results.values()) {
      if (result.error) continue
      for (const word of result.words) {
        if (!merged[word.word]) {
          const pos = word.pos.split(',').map(p => p.trim()).filter(Boolean)
          merged[word.word] = { pos }
        } else {
          const existing = new Set(merged[word.word].pos)
          for (const p of word.pos.split(',').map(p => p.trim())) {
            if (p) existing.add(p)
          }
          merged[word.word] = { pos: [...existing] }
        }
      }
    }
    await this.dictManager.createUserDict(name, lang, merged)
  }
}
