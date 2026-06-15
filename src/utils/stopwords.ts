/**
 * Programming language keyword blacklists.
 * Words in these sets will not be annotated even if found in the vocabulary dict.
 */
const JS_KEYWORDS = new Set([
  'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'import', 'export', 'default',
  'from', 'async', 'await', 'class', 'extends', 'implements', 'interface',
  'type', 'new', 'this', 'super', 'delete', 'typeof', 'instanceof', 'try',
  'catch', 'finally', 'throw', 'yield', 'of', 'in', 'true', 'false', 'null',
  'undefined', 'void',
])

const PY_KEYWORDS = new Set([
  'def', 'class', 'return', 'import', 'from', 'if', 'elif', 'else', 'for',
  'while', 'break', 'continue', 'try', 'except', 'finally', 'with', 'as',
  'pass', 'yield', 'lambda', 'raise', 'true', 'false', 'none', 'and', 'or',
  'not', 'in', 'is', 'global', 'nonlocal', 'assert', 'del',
])

const GO_KEYWORDS = new Set([
  'func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default',
  'break', 'continue', 'go', 'defer', 'select', 'type', 'struct', 'interface',
  'map', 'chan', 'nil', 'true', 'false', 'var', 'const', 'package', 'import',
  'make', 'new', 'len', 'cap', 'append', 'delete', 'copy', 'close', 'panic',
  'recover',
])

export function isProgrammingKeyword(word: string, langId: string): boolean {
  const lower = word.toLowerCase()
  switch (langId) {
    case 'javascript':
    case 'typescript':
    case 'javascriptreact':
    case 'typescriptreact':
      return JS_KEYWORDS.has(lower)
    case 'python':
      return PY_KEYWORDS.has(lower)
    case 'go':
      return GO_KEYWORDS.has(lower)
    default:
      return false
  }
}
