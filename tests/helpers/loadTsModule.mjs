import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Load an app module that uses bundler-style extensionless relative imports.
// The module is transpiled in memory; its relative imports are pointed at the
// matching .ts files, which Node then loads with type stripping.
export async function loadTsModule(fileUrl) {
  const source = readFileSync(fileUrl, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => {
    const resolved = specifier.startsWith('.')
      ? new URL(specifier.endsWith('.ts') ? specifier : specifier + '.ts', fileUrl).href
      : import.meta.resolve(specifier);
    return 'from ' + JSON.stringify(resolved);
  });
  return import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
}
