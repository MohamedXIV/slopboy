import ts from 'typescript';
import {ENGINE_REGISTRY} from './engine-registry.ts';
import {scanSourceDiagnostics} from './agent-templates.ts';

import {PRIVATE_SOURCE_LIMIT, PRIVATE_SOURCE_TEMPLATE} from './private-source-template.ts';
export {PRIVATE_SOURCE_TEMPLATE} from './private-source-template.ts';

export function inspectPrivateSource(input: unknown, project?: {path: string; localImports: ReadonlySet<string>; entrypoint: boolean}) {
  const rejected = (message: string) => ({ok: false as const, diagnostics: [{message}]});
  if (!input || typeof input !== 'object' || Array.isArray(input)) return rejected('Select a template and paste one source file.');
  const data = input as Record<string, unknown>;
  const {engine, version, language, source} = data;
  if (Object.keys(data).some(key => !['engine','version','language','source'].includes(key)) ||
      engine !== PRIVATE_SOURCE_TEMPLATE.id || version !== PRIVATE_SOURCE_TEMPLATE.version)
    return rejected('Choose the pinned KAPLAY source template.');
  if (language !== 'typescript' && language !== 'javascript') return rejected('Choose TypeScript or JavaScript.');
  if (typeof source !== 'string' || !source.trim() || source.includes('\0') ||
      Buffer.byteLength(source, 'utf8') > PRIVATE_SOURCE_LIMIT ||
      Buffer.from(source, 'utf8').toString('utf8') !== source)
    return rejected('Paste valid UTF-8 source between 1 and 65,536 bytes.');
  if (/^\s*</.test(source)) return rejected('Paste a game module instead of an HTML page.');
  const entrypoint = project?.path ?? (language === 'typescript' ? 'src/game.ts' : 'src/game.js');
  const file = ts.createSourceFile(entrypoint, source, ts.ScriptTarget.ES2022, true,
    language === 'typescript' ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const extra: {message: string; line?: number; column?: number}[] = [];
  if (file.referencedFiles.length || file.typeReferenceDirectives.length || file.libReferenceDirectives.length)
    extra.push({message: 'Remove triple-slash references. Only one source file is accepted.'});
  const allowedImport = (name: string) => ENGINE_REGISTRY.kaplay.allowedImports.includes(name) ||
    project?.localImports.has(name) === true;
  let defaultExport = false;
  const pending: ts.Node[] = [file];
  while (pending.length) {
    const node = pending.pop()!;
    const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier : undefined;
    const problem = (message: string) => {
      const {line, character} = file.getLineAndCharacterOfPosition(node.getStart(file));
      if (extra.length < 20) extra.push({message, line: line + 1, column: character + 1});
    };
    if (specifier && (!ts.isStringLiteral(specifier) || !allowedImport(specifier.text)))
      problem('Only kaplay and @slopboy/sdk imports are allowed. Inline local helpers.');
    if (ts.isImportTypeNode(node)) {
      const path = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
      if (!path || !ts.isStringLiteral(path) || !allowedImport(path.text))
        problem('Use types from the pinned template only.');
    }
    if (ts.isIdentifier(node) && node.text === 'require') problem('Use approved static ES module imports.');
    if (language === 'javascript' && (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isImportDeclaration(node) && node.importClause?.isTypeOnly))
      problem('Choose TypeScript or remove TypeScript-only syntax.');
    if (node.parent === file && (ts.isExportAssignment(node) && !node.isExportEquals ||
        ts.isFunctionDeclaration(node) && node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.DefaultKeyword)))
      defaultExport = true;
    ts.forEachChild(node, child => { pending.push(child); });
  }
  if (!defaultExport && project?.entrypoint !== false) extra.push({message: 'Export a default game setup function or game module.'});
  if (extra.length) return {ok: false as const, diagnostics: extra};
  try {
    const diagnostics = scanSourceDiagnostics(source, ENGINE_REGISTRY.kaplay, entrypoint)
      .filter(item => item.severity === 'error').slice(0, 20)
      .map(({code, line, column, suggestedFix}) => ({message: code === 'SYNTAX_ERROR'
        ? 'Fix the syntax at this position.' : suggestedFix?.includes('"') ? 'Remove the unsupported syntax or API at this position.' : suggestedFix ?? 'Use the pinned template syntax.', line, column}));
    if (diagnostics.length) return {ok: false as const, diagnostics};
  } catch {
    return rejected('The source is too complex to validate. Simplify the module and try again.');
  }
  return {ok: true as const, source, language, manifest: {
    schemaVersion: 1, engine: {id: engine, version, adapterProtocol: PRIVATE_SOURCE_TEMPLATE.adapterProtocol},
    deviceProfile: PRIVATE_SOURCE_TEMPLATE.deviceProfile, entrypoint, assets: [],
  }};
}
