/**
 * SidePanelProvider — registers the WebviewView for the adhdgofly-ide-ext sidebar.
 *
 * Communication protocol (postMessage):
 *   Extension → Webview:  { type: ExtToWebview, ...payload }
 *   Webview → Extension:  { type: WebviewToExt, ...payload }
 */
import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import type { DecoratedWord } from '../highlightEngine/types'
import type { DictionaryManager } from '../dictionary/manager'
import { loadConfig } from './config'
import { judgePos } from './aiJudge'
import { getCommunityDictAPI } from '../dictionary/downloader'
import type { BatchProcessor } from '../batch/batchProcessor'
import type { BatchFileResult } from '../batch/types'

// ── Message type definitions ──────────────────────────────────────────────

type PosStats = Record<string, number>

interface AnnotationResult {
  type: 'annotationResult'
  words: DecoratedWord[]
  stats: PosStats
  fileName: string
}

// ─────────────────────────────────────────────────────────────────────────

export class SidePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'adhdgofly.panel'

  private view?: vscode.WebviewView

  /** Store the most recent annotation result for "export current doc" */
  private lastAnnotatedWords: DecoratedWord[] = []
  private lastAnnotatedFileName: string = ''

  /** BatchProcessor reference — set by extension.ts after creation */
  private batchProcessor?: BatchProcessor

  /** Callback for posFilter changes — wired to decorator.setPosFilter() by extension.ts */
  onPosFilter: ((filter: string[]) => void) | null = null

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly dictManager: DictionaryManager,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'webview')],
    }

    webviewView.webview.html = this.getHtml(webviewView.webview)

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      await this.handleMessage(msg, webviewView)
    })
  }

  /** Send updated dict list + user dict list to the webview */
  sendDictList(): void {
    this.post({ type: 'dictList', dicts: this.dictManager.getDictList() })
    this.post({ type: 'userDictList', dicts: this.dictManager.getUserDictList() })
  }

  /** Send user-created dict list */
  sendUserDictList(): void {
    this.post({ type: 'userDictList', dicts: this.dictManager.getUserDictList() })
  }

  /**
   * Inject posFilter into the markdown preview by inserting a hidden HTML comment
   * at the start of the active markdown document. The comment is kept permanently
   * (invisible to the user) so the highlighter can read it on every re-render.
   *
   * This is necessary because the preview WebView's CSP (nonce-based script-src,
   * connect-src 'none') blocks all other communication channels.
   */
  async injectPosFilter(filter: string[]): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor || editor.document.languageId !== 'markdown') return

    const doc = editor.document
    const comment = `<!-- adhdgofly-posfilter:${JSON.stringify(filter)} -->`

    // Check if comment already exists at line 0
    const firstLine = doc.lineAt(0)
    const re = /^<!-- adhdgofly-posfilter:/

    if (re.test(firstLine.text)) {
      // Replace existing comment value
      await editor.edit(b =>
        b.replace(firstLine.rangeIncludingLineBreak, comment + '\n')
      )
    } else {
      // Insert new comment at start
      await editor.edit(b =>
        b.insert(new vscode.Position(0, 0), comment + '\n')
      )
    }
  }

  /** Set the BatchProcessor reference for message routing */
  setBatchProcessor(bp: BatchProcessor): void {
    this.batchProcessor = bp
  }

  // ── Called by decorator after each render ─────────────────────────────

  sendAnnotationResult(words: DecoratedWord[], fileName: string): void {
    // Always store the latest result — even if panel isn't visible yet
    this.lastAnnotatedWords = words
    this.lastAnnotatedFileName = fileName
    if (!this.view) return
    const stats: PosStats = {}
    for (const w of words) {
      const key = w.colorClass.replace('pos-', '')
      stats[key] = (stats[key] ?? 0) + 1
    }
    this.post<AnnotationResult>({ type: 'annotationResult', words, stats, fileName })
  }

  // ── Batch processing messages (Extension → Webview) ──────────────────

  sendBatchProgress(msg: { completed: number; total: number; cancelled?: boolean }): void {
    this.post({ type: 'batchProgress', ...msg })
  }

  sendBatchFileDone(msg: { filePath: string; words: DecoratedWord[]; wordCount: number }): void {
    this.post({ type: 'batchFileDone', ...msg })
  }

  sendBatchResult(files: BatchFileResult[]): void {
    this.post({ type: 'batchResult', files })
  }

  // ── postMessage helper ─────────────────────────────────────────────────

  private post<T>(msg: T): void {
    this.view?.webview.postMessage(msg)
  }

  // ── Message handler ────────────────────────────────────────────────────

  private async handleMessage(msg: any, webviewView: vscode.WebviewView): Promise<void> {
    switch (msg.type) {

      case 'ready': {
        // Webview just loaded — send current config, dict list, and latest annotation results
        this.post({ type: 'config', config: loadConfig() })
        this.post({ type: 'dictList', dicts: this.dictManager.getDictList() })
        this.post({ type: 'userDictList', dicts: this.dictManager.getUserDictList() })
        // Re-send the most recent annotation result (may have been lost if panel wasn't visible)
        if (this.lastAnnotatedWords.length > 0) {
          const stats: PosStats = {}
          for (const w of this.lastAnnotatedWords) {
            const key = w.colorClass.replace('pos-', '')
            stats[key] = (stats[key] ?? 0) + 1
          }
          this.post({ type: 'annotationResult', words: this.lastAnnotatedWords, stats, fileName: this.lastAnnotatedFileName })
        }
        break
      }

      case 'getDictEntries': {
        const { lang, dictId, search = '', page = 1, pageSize = 50 } = msg
        const result = dictId
          ? this.dictManager.getDictEntriesById(dictId, search, page, pageSize)
          : this.dictManager.getDictEntries(lang, search, page, pageSize)
        this.post({ type: 'dictEntries', dictId, lang, ...result })
        break
      }

      case 'addOrEditWord': {
        const { lang, word, pos } = msg
        await this.dictManager.addOrEditWord(lang, word, pos)
        this.post({ type: 'toast', message: `已保存：${word} [${pos.join(',')}]`, level: 'info' })
        // Refresh the entries view
        const result = this.dictManager.getDictEntries(lang, msg.search ?? '', msg.page ?? 1, msg.pageSize ?? 50)
        this.post({ type: 'dictEntries', lang, ...result })
        this.post({ type: 'dictList', dicts: this.dictManager.getDictList() })
        break
      }

      case 'deleteWord': {
        const { lang, word } = msg
        await this.dictManager.deleteWord(lang, word)
        this.post({ type: 'toast', message: `已删除：${word}`, level: 'info' })
        const result = this.dictManager.getDictEntries(lang, msg.search ?? '', msg.page ?? 1, msg.pageSize ?? 50)
        this.post({ type: 'dictEntries', lang, ...result })
        this.post({ type: 'dictList', dicts: this.dictManager.getDictList() })
        break
      }

      case 'exportDict': {
        const { lang, name } = msg
        const json = this.dictManager.exportDict(lang, name)
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(`dict_${lang}_${new Date().toISOString().slice(0,10)}.json`),
          filters: { 'JSON Dictionary': ['json'] },
        })
        if (uri) {
          await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'))
          vscode.window.showInformationMessage(`adhdgofly-ide-ext: 词典已导出到 ${uri.fsPath}`)
        }
        break
      }

      case 'exportCurrentDoc': {
        if (!this.lastAnnotatedWords.length) {
          vscode.window.showWarningMessage('adhdgofly-ide-ext: 当前文档无标注词汇')
          break
        }
        // Deduplicate words and build export format
        const wordMap = new Map<string, string[]>()
        for (const w of this.lastAnnotatedWords) {
          if (!wordMap.has(w.word)) {
            wordMap.set(w.word, w.pos.split(',').map(p => p.trim()).filter(Boolean))
          }
        }
        const words: Record<string, { pos: string[] }> = {}
        for (const [word, pos] of wordMap) {
          words[word] = { pos }
        }
        const name = this.lastAnnotatedFileName.replace(/\.[^.]+$/, '')
        const payload = {
          version: '1.0',
          lastUpdated: new Date().toISOString().slice(0, 10),
          language: 'mixed',
          source: 'adhdgofly-ide-ext',
          name: `current-doc-${name}`,
          wordCount: Object.keys(words).length,
          words,
        }
        const exportUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(`${name}_vocab_${new Date().toISOString().slice(0,10)}.json`),
          filters: { 'JSON Dictionary': ['json'] },
        })
        if (exportUri) {
          await vscode.workspace.fs.writeFile(exportUri, Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'))
          vscode.window.showInformationMessage(`adhdgofly-ide-ext: 当前文档词汇已导出到 ${exportUri.fsPath}`)
        }
        break
      }

      case 'importDictFile': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'JSON Dictionary': ['json'] },
        })
        if (!uris?.[0]) break
        try {
          const { lang, wordCount } = await this.dictManager.importDictFile(uris[0].fsPath)
          this.post({ type: 'toast', message: `导入成功：${wordCount} 词 (${lang.toUpperCase()})`, level: 'info' })
          this.post({ type: 'dictList', dicts: this.dictManager.getDictList() })
        } catch (err: any) {
          this.post({ type: 'toast', message: `导入失败：${err.message}`, level: 'error' })
        }
        break
      }

      case 'toggleDict': {
        const { id: dictId, enabled } = msg
        const cfg = loadConfig()
        let disabledDicts = [...(cfg.disabledDicts || [])]

        if (enabled) {
          // Remove from disabled list (re-enable)
          disabledDicts = disabledDicts.filter(d => d !== dictId)
        } else {
          // Add to disabled list
          if (!disabledDicts.includes(dictId)) disabledDicts.push(dictId)
        }
        await vscode.workspace.getConfiguration('adhdgofly').update('disabledDicts', disabledDicts, vscode.ConfigurationTarget.Global)
        this.post({ type: 'config', config: loadConfig() })
        break
      }

      case 'posFilterChange': {
        console.log('[ADHDGoFly] sidePanel posFilterChange:', JSON.stringify(msg.filter))
        await vscode.workspace.getConfiguration('adhdgofly').update('posFilter', msg.filter, vscode.ConfigurationTarget.Global)
        this.post({ type: 'config', config: loadConfig() })
        // Instant editor toggle — no reprocessing
        console.log('[ADHDGoFly] calling onPosFilter:', !!this.onPosFilter)
        this.onPosFilter?.(msg.filter)
        // Communicate filter to markdown preview via a hidden HTML comment
        // (preview WebView CSP blocks all other communication channels)
        this.injectPosFilter(msg.filter)
        break
      }

      case 'updateConfig': {
        const { key, value } = msg
        await vscode.workspace.getConfiguration('adhdgofly').update(key, value, vscode.ConfigurationTarget.Global)
        this.post({ type: 'config', config: loadConfig() })
        break
      }

      case 'aiJudge': {
        const { word } = msg
        try {
          const cfg = loadConfig()
          const result = await judgePos(word, cfg.aiProviders)
          this.post({ type: 'aiJudgeResult', word: result.word, pos: result.pos, providerName: result.providerName })
        } catch (err: any) {
          this.post({ type: 'aiJudgeResult', word, pos: [] })
          this.post({ type: 'toast', message: `AI 判定失败：${err.message}`, level: 'error' })
        }
        break
      }

      // ── Community dict ──────────────────────────────────────────────────

      case 'getCommunityDicts': {
        try {
          const api = getCommunityDictAPI()
          const dicts = await api.fetchDictList()
          // Attach installed status
          const installed = this.dictManager.getInstalledCommunityDictIds()
          const result = dicts.map(d => ({ ...d, installed: installed.includes(d.id) }))
          this.post({ type: 'communityDictList', dicts: result })
        } catch (err: any) {
          this.post({ type: 'toast', message: `获取社区词典失败：${err.message}`, level: 'error' })
        }
        break
      }

      case 'installCommunityDict': {
        const { id } = msg
        try {
          const api = getCommunityDictAPI()
          const dicts = await api.fetchDictList()
          const meta = dicts.find(d => d.id === id)
          if (!meta) throw new Error(`词典 ${id} 不存在`)
          const words = await api.downloadDict(id)
          const wordCount = Object.keys(words).length
          await this.dictManager.loadCommunityDict(
            { id: meta.id, name: meta.name, lang: meta.lang, wordCount, version: meta.version },
            words,
          )
          this.post({ type: 'toast', message: `已安装：${meta.name}（${wordCount} 词）`, level: 'info' })
          this.post({ type: 'dictList', dicts: this.dictManager.getDictList() })
        } catch (err: any) {
          this.post({ type: 'toast', message: `安装失败：${err.message}`, level: 'error' })
        }
        break
      }

      case 'uninstallCommunityDict': {
        const { id: uninstallId } = msg
        try {
          await this.dictManager.removeCommunityDict(uninstallId)
          this.post({ type: 'toast', message: `已卸载词典`, level: 'info' })
          this.post({ type: 'dictList', dicts: this.dictManager.getDictList() })
        } catch (err: any) {
          this.post({ type: 'toast', message: `卸载失败：${err.message}`, level: 'error' })
        }
        break
      }

      case 'uploadCommunityDict': {
        const { name, lang } = msg
        try {
          // Export current merged dict for the selected language
          const json = this.dictManager.exportDict(lang, name)
          const parsed = JSON.parse(json) as { words: Record<string, { pos: string[] }> }
          const api = getCommunityDictAPI()
          await api.uploadDict(name, lang, parsed.words)
          this.post({ type: 'toast', message: `已提交「${name}」到社区，等待审核`, level: 'info' })
        } catch (err: any) {
          this.post({ type: 'toast', message: `上传失败：${err.message}`, level: 'error' })
        }
        break
      }

      // ── User-created dict ────────────────────────────────────────────────

      case 'saveUserDict': {
        const { name: udName, lang: udLang, words } = msg
        if (!udName || !udLang || !words || Object.keys(words).length === 0) {
          this.post({ type: 'toast', message: '保存失败：名称、语言和词汇不能为空', level: 'error' })
          break
        }
        try {
          const id = await this.dictManager.createUserDict(udName, udLang, words)
          this.post({ type: 'toast', message: `已保存自建词典「${udName}」（${Object.keys(words).length} 词）`, level: 'info' })
          this.post({ type: 'userDictList', dicts: this.dictManager.getUserDictList() })
          this.post({ type: 'dictList', dicts: this.dictManager.getDictList() })
        } catch (err: any) {
          this.post({ type: 'toast', message: `保存失败：${err.message}`, level: 'error' })
        }
        break
      }

      case 'removeUserDict': {
        const { id: removeId } = msg
        try {
          await this.dictManager.removeUserDict(removeId)
          this.post({ type: 'toast', message: `已删除自建词典`, level: 'info' })
          this.post({ type: 'userDictList', dicts: this.dictManager.getUserDictList() })
          this.post({ type: 'dictList', dicts: this.dictManager.getDictList() })
        } catch (err: any) {
          this.post({ type: 'toast', message: `删除失败：${err.message}`, level: 'error' })
        }
        break
      }

      case 'getUserDictList': {
        this.post({ type: 'userDictList', dicts: this.dictManager.getUserDictList() })
        break
      }

      // ── Batch processing ────────────────────────────────────────────────

      case 'batchProcessFileItem': {
        if (!this.batchProcessor) break
        const { filePath: singlePath } = msg
        try {
          await this.batchProcessor.processSingleFile(vscode.Uri.file(singlePath))
          // Sync annotation tab with this file's results
          const results = this.batchProcessor.getResults()
          const fileResult = results.find(r => r.filePath === singlePath)
          if (fileResult && fileResult.words.length > 0) {
            this.sendAnnotationResult(fileResult.words, fileResult.fileName)
          }
          this.post({ type: 'toast', message: `已处理: ${singlePath.split(/[/\\]/).pop()}`, level: 'info' })
        } catch (err) {
          this.post({ type: 'toast', message: `处理失败: ${(err as Error).message}`, level: 'error' })
        }
        break
      }

      case 'batchProcessFolderItem': {
        if (!this.batchProcessor) break
        const { filePath: folderPath } = msg
        try {
          await this.batchProcessor.processFolder(vscode.Uri.file(folderPath))
        } catch (err) {
          vscode.window.showErrorMessage('adhdgofly-ide-ext: 处理文件夹失败 -- ' + (err as Error).message)
        }
        break
      }

      case 'getProjectFiles': {
        if (!this.batchProcessor) break
        try {
          const folders = vscode.workspace.workspaceFolders
          if (!folders) {
            this.post({ type: 'projectFileList', files: [] })
            break
          }
          const files = await this.batchProcessor.scanFolder(folders[0].uri)
          const fileList = files.map(f => f.fsPath)
          this.post({ type: 'projectFileList', files: fileList, workspacePath: folders[0].uri.fsPath })
        } catch (err) {
          this.post({ type: 'projectFileList', files: [] })
        }
        break
      }

      case 'processSelectedFiles': {
        if (!this.batchProcessor) break
        try {
          const selectedPaths = new Set(msg.files || [])
          const folders = vscode.workspace.workspaceFolders
          if (!folders) {
            vscode.window.showWarningMessage('未打开任何项目')
            break
          }
          const allFiles = await this.batchProcessor.scanFolder(folders[0].uri)
          const toProcess = allFiles.filter(f => selectedPaths.has(f.fsPath))
          if (toProcess.length === 0) {
            vscode.window.showWarningMessage('未选择文件')
            break
          }
          this.batchProcessor.clear()
          await this.batchProcessor.processWithProgress(toProcess)
        } catch (err) {
          vscode.window.showErrorMessage('adhdgofly-ide-ext: 处理选中文件失败 -- ' + (err as Error).message)
        }
        break
      }

      case 'batchOpenFile': {
        const { filePath } = msg
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath))
        break
      }

      case 'batchCancel': {
        this.batchProcessor?.cancel()
        break
      }

      case 'batchClear': {
        this.batchProcessor?.clear()
        this.post({ type: 'batchResult', files: [] })
        break
      }

      case 'batchExportAll': {
        if (!this.batchProcessor) break
        const results = this.batchProcessor.getResults()
        if (results.length === 0) {
          vscode.window.showWarningMessage('adhdgofly-ide-ext: 暂无批量处理结果')
          break
        }
        const name = await vscode.window.showInputBox({ prompt: '请输入词典名称', placeHolder: 'My Batch Dict' })
        if (!name) break
        const lang = await vscode.window.showQuickPick(['en', 'zh', 'mixed'], { placeHolder: '选择语言' })
        if (!lang) break
        try {
          await this.batchProcessor.exportAllAsDict(name, lang)
          this.post({ type: 'toast', message: `已导出批量结果为词典「${name}」`, level: 'info' })
          this.post({ type: 'dictList', dicts: this.dictManager.getDictList() })
          this.post({ type: 'userDictList', dicts: this.dictManager.getUserDictList() })
        } catch (err: any) {
          this.post({ type: 'toast', message: `导出失败：${err.message}`, level: 'error' })
        }
        break
      }

      case 'processProject': {
        if (!this.batchProcessor) break
        try {
          const folders = vscode.workspace.workspaceFolders
          if (!folders) {
            vscode.window.showWarningMessage('未打开任何项目')
            break
          }
          await this.batchProcessor.processFolder(folders[0].uri)
        } catch (err) {
          vscode.window.showErrorMessage('adhdgofly-ide-ext: 处理项目失败 -- ' + (err as Error).message)
        }
        break
      }
    }
  }

  // ── HTML ──────────────────────────────────────────────────────────────

  private getHtml(webview: vscode.Webview): string {
    const webviewDir = vscode.Uri.joinPath(this.extensionUri, 'webview')
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'panel.css'))
    const jsUri    = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'panel.js'))
    const i18nUri  = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'i18n.js'))
    const iconsUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'icons.js'))

    // Inline the HTML template (panel.html references these URIs at runtime)
    const htmlPath = path.join(this.extensionUri.fsPath, 'webview', 'panel.html')
    let html = fs.readFileSync(htmlPath, 'utf-8')
    html = html
      .replace(/{{CSP_SOURCE}}/g, webview.cspSource)
      .replace(/{{CSS_URI}}/g, cssUri.toString())
      .replace(/{{JS_URI}}/g,  jsUri.toString())
      .replace(/{{I18N_URI}}/g,  i18nUri.toString())
      .replace(/{{ICONS_URI}}/g, iconsUri.toString())
    return html
  }
}
