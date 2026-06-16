import * as vscode from 'vscode'
import { createDecorator } from './vscode/decorator'
import { SidePanelProvider } from './vscode/sidePanel'
import { HighlightEngine } from './highlightEngine/index'
import { DictionaryManager } from './dictionary/manager'
import { BatchProcessor } from './batch/batchProcessor'

let engine: HighlightEngine | null = null
let dictManager: DictionaryManager | null = null
let decoratorInstance: ReturnType<typeof createDecorator> | null = null
let sidePanelProvider: SidePanelProvider | null = null
let batchProcessor: BatchProcessor | null = null

export async function activate(context: vscode.ExtensionContext) {
  dictManager = new DictionaryManager(context)
  engine = new HighlightEngine(dictManager)

  // Register side panel provider (decorator events deferred until dicts loaded)
  sidePanelProvider = new SidePanelProvider(context.extensionUri, dictManager)

  // Register commands first (always available, don't need dicts)
  context.subscriptions.push(
    vscode.commands.registerCommand('adhdgofly.enable', () => {
      vscode.workspace.getConfiguration('adhdgofly').update('enabled', true, vscode.ConfigurationTarget.Global)
    }),
    vscode.commands.registerCommand('adhdgofly.disable', () => {
      vscode.workspace.getConfiguration('adhdgofly').update('enabled', false, vscode.ConfigurationTarget.Global)
    }),
    vscode.commands.registerCommand('adhdgofly.annotateSelection', () => {
      decoratorInstance?.annotateSelection()
    }),
    vscode.commands.registerCommand('adhdgofly.exportDict', async () => {
      if (!dictManager) return
      const langs = dictManager.getLoadedLanguages()
      if (langs.length === 0) { vscode.window.showWarningMessage('adhdgofly-ide-ext: 无可用词典'); return }
      const lang = await vscode.window.showQuickPick(langs, { placeHolder: '选择要导出的语言' })
      if (!lang) return
      const json = dictManager.exportDict(lang, lang.toUpperCase())
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`dict_${lang}_${new Date().toISOString().slice(0, 10)}.json`),
        filters: { 'JSON Dictionary': ['json'] },
      })
      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'))
        vscode.window.showInformationMessage(`adhdgofly-ide-ext: 词典已导出 → ${uri.fsPath}`)
      }
    }),
  )

  // Create BatchProcessor (needs engine, dictManager, sidePanel)
  batchProcessor = new BatchProcessor(engine, dictManager, sidePanelProvider!)
  sidePanelProvider.setBatchProcessor(batchProcessor)

  // Register batch processing commands
  context.subscriptions.push(
    vscode.commands.registerCommand('adhdgofly.processFile', async (uri: vscode.Uri) => {
      try {
        await batchProcessor!.processSingleFile(uri)
      } catch (err) {
        vscode.window.showErrorMessage('adhdgofly-ide-ext: 处理文件失败 -- ' + (err as Error).message)
      }
    }),
    vscode.commands.registerCommand('adhdgofly.processFolder', async (uri: vscode.Uri) => {
      try {
        await batchProcessor!.processFolder(uri)
      } catch (err) {
        vscode.window.showErrorMessage('adhdgofly-ide-ext: 处理文件夹失败 -- ' + (err as Error).message)
      }
    }),
    vscode.commands.registerCommand('adhdgofly.processProject', async () => {
      try {
        const folders = vscode.workspace.workspaceFolders
        if (!folders) { vscode.window.showWarningMessage('未打开任何项目'); return }
        await batchProcessor!.processFolder(folders[0].uri)
      } catch (err) {
        vscode.window.showErrorMessage('adhdgofly-ide-ext: 处理项目失败 -- ' + (err as Error).message)
      }
    }),
  )

  // Load dicts first, THEN create decorator so event handlers never see an empty dict
  await dictManager.loadBuiltins()
  sidePanelProvider?.sendDictList()

  // Now dictionaries are loaded — create decorator with event subscriptions
  decoratorInstance = createDecorator(context, engine, () => sidePanelProvider ?? undefined)

  // Register side panel
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidePanelProvider.viewId, sidePanelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  )

  // Force-apply on all visible editors
  for (const editor of vscode.window.visibleTextEditors) {
    decoratorInstance?.forceApply(editor)
  }
}

export function deactivate() {
  decoratorInstance?.dispose()
}
