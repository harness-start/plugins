import * as ts from "typescript";

export interface SourceLiteral {
  line: number;
  value: string;
}

export function parseTypeScript(source: string, fileName = "source.ts"): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

export function declaredFunctionNames(source: string, fileName = "source.ts"): Set<string> {
  const names = new Set<string>();
  const file = parseTypeScript(source, fileName);

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text);
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return names;
}

export function identifierNames(source: string, fileName = "source.ts"): Set<string> {
  const names = new Set<string>();
  const file = parseTypeScript(source, fileName);

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  }

  visit(file);
  return names;
}

export function sourceLiterals(source: string, fileName = "source.ts"): SourceLiteral[] {
  const literals: SourceLiteral[] = [];
  const file = parseTypeScript(source, fileName);

  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node)) {
      literals.push({
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
        value: node.text,
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return literals;
}

export function importSpecifiers(source: string, fileName = "source.ts"): string[] {
  const file = parseTypeScript(source, fileName);
  return file.statements.flatMap((statement) => (
    ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : []
  ));
}

export function callExpressionTexts(source: string, fileName = "source.ts"): string[] {
  const calls: string[] = [];
  const file = parseTypeScript(source, fileName);

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) calls.push(node.expression.getText(file));
    ts.forEachChild(node, visit);
  }

  visit(file);
  return calls;
}

export function callExpressionSources(source: string, fileName = "source.ts"): string[] {
  const calls: string[] = [];
  const file = parseTypeScript(source, fileName);

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) calls.push(node.getText(file));
    ts.forEachChild(node, visit);
  }

  visit(file);
  return calls;
}

export function syntaxDiagnostics(source: string, fileName = "source.ts"): string[] {
  return (ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
    reportDiagnostics: true,
  }).diagnostics ?? []).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}
