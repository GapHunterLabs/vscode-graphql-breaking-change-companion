import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseSchema, findBreakingChanges } from './schemaDiff';
import { recordHit } from './reviewPrompt';

const execFileAsync = promisify(execFile);

let diagnostics: vscode.DiagnosticCollection;
let outputChannel: vscode.OutputChannel | undefined;

function output(): vscode.OutputChannel {
  if (!outputChannel) outputChannel = vscode.window.createOutputChannel('GraphQL Schema Breaking-Change Companion');
  return outputChannel;
}

async function readGitBaseline(workspaceRoot: string, relativePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['show', `HEAD:${relativePath}`], { cwd: workspaceRoot, maxBuffer: 10_000_000 });
    return stdout;
  } catch {
    return null; // file is new (not in HEAD yet), not a git repo, or git isn't on PATH
  }
}

async function checkBreakingChanges(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showErrorMessage('GraphQL Schema Breaking-Change Companion: open a .graphql/.gql file first.');
    return;
  }
  const document = editor.document;
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) {
    void vscode.window.showErrorMessage('GraphQL Schema Breaking-Change Companion: file is not inside an open workspace folder.');
    return;
  }

  const relativePath = vscode.workspace.asRelativePath(document.uri, false);
  const baselineText = await readGitBaseline(folder.uri.fsPath, relativePath);
  if (baselineText === null) {
    void vscode.window.showInformationMessage(
      'GraphQL Schema Breaking-Change Companion: no git HEAD version of this file found (new file, or not a git repo) -- nothing to compare against.',
    );
    diagnostics.delete(document.uri);
    return;
  }

  const currentText = document.getText();
  const before = parseSchema(baselineText);
  const after = parseSchema(currentText);
  const changes = findBreakingChanges(before, after);

  if (changes.length === 0) {
    diagnostics.delete(document.uri);
    void vscode.window.showInformationMessage('GraphQL Schema Breaking-Change Companion: no breaking changes vs. git HEAD.');
    return;
  }

  const diags = changes.map((change) => {
    // Anchored at the top of the file for every change, not a precise
    // line -- a removed field/type may no longer exist in the current
    // file's text at all, so there's nothing meaningful to point at
    // there. A real per-change anchor (e.g. the type's remaining
    // declaration when only a field was removed) is a real v0.1 gap,
    // not attempted here.
    const range = new vscode.Range(0, 0, 0, Number.MAX_SAFE_INTEGER);
    const diagnostic = new vscode.Diagnostic(range, change.message, vscode.DiagnosticSeverity.Warning);
    diagnostic.source = 'GraphQL Schema Breaking-Change Companion';
    diagnostic.code = change.kind;
    // Dedup by document + the change's own message (unique per
    // type/field/enum-value involved) rather than by line -- every
    // diagnostic here is anchored to line 0 (see comment above), so a
    // line-based key would collapse all distinct breaking changes in
    // the same file into one.
    recordHit(context, `${document.uri.toString()}:${change.kind}:${change.message}`);
    return diagnostic;
  });
  diagnostics.set(document.uri, diags);

  const channel = output();
  channel.clear();
  channel.appendLine(`${changes.length} breaking change(s) vs. git HEAD in ${relativePath}:\n`);
  for (const change of changes) channel.appendLine(`  [${change.kind}] ${change.message}`);
  channel.show(true);
}

export function activate(context: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection('graphqlBreakingChangeCompanion');
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.commands.registerCommand('graphqlBreakingChangeCompanion.check', () => void checkBreakingChanges(context)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
  );
}

export function deactivate(): void {
  diagnostics?.dispose();
  outputChannel?.dispose();
}
