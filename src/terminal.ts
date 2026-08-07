import * as path from 'path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

export const TERMINAL_ANALYZE_REQUEST = 'fish-lsp/terminal/analyze';

interface TerminalAnalyzeResult {
  uri: string;
  position: {
    line: number;
    character: number;
  };
  diagnostics: Array<{
    message: string;
    severity?: number;
    code?: string | number;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  }>;
}

function terminalAnalysisEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('fish-lsp')
    .get<boolean>('terminal.enable', true);
}

function isFishTerminal(terminal: vscode.Terminal): boolean {
  const options = terminal.creationOptions;
  if ('shellPath' in options && typeof options.shellPath === 'string') {
    return path.basename(options.shellPath).toLowerCase().startsWith('fish');
  }
  return terminal.name.toLowerCase().includes('fish');
}

function terminalId(terminal: vscode.Terminal): string {
  return terminal.name;
}

function severityLabel(severity: number | undefined): string {
  switch (severity) {
    case 1: return 'error';
    case 2: return 'warning';
    case 3: return 'info';
    case 4: return 'hint';
    default: return 'diagnostic';
  }
}

/**
 * MVP terminal integration.
 *
 * VS Code shell integration reports a command line when execution starts. This
 * is later than the ideal "while typing" experience, but it gives us a native,
 * trusted transport for validating the server-side terminal analysis path
 * without PTY scraping or shell-specific IPC. A later iteration can replace
 * this source with a fish commandline hook while keeping the request/result API.
 */
export function setupTerminalAnalysis(
  context: vscode.ExtensionContext,
  client: LanguageClient,
): void {
  const output = vscode.window.createOutputChannel('fish-lsp Terminal');
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10,
  );

  status.name = 'fish-lsp terminal diagnostics';
  status.tooltip = 'Diagnostics for the most recent integrated-terminal command';

  context.subscriptions.push(output, status);

  context.subscriptions.push(vscode.window.onDidStartTerminalShellExecution(async event => {
    if (!terminalAnalysisEnabled() || !isFishTerminal(event.terminal)) return;

    const commandLine = event.execution.commandLine.value;
    if (!commandLine.trim()) return;

    const cwd = event.execution.cwd;
    if (cwd.scheme !== 'file') {
      output.appendLine(`[skip] terminal cwd is not a local file URI: ${cwd.toString()}`);
      return;
    }

    try {
      const result = await client.sendRequest<TerminalAnalyzeResult>(
        TERMINAL_ANALYZE_REQUEST,
        {
          text: commandLine,
          cursor: commandLine.length,
          cwd: cwd.fsPath,
          terminalId: terminalId(event.terminal),
        },
      );

      if (result.diagnostics.length === 0) {
        status.text = '$(check) fish-lsp terminal';
        status.tooltip = 'No fish-lsp diagnostics in the most recent terminal command';
        status.show();
        return;
      }

      const first = result.diagnostics[0];
      status.text = `$(warning) fish-lsp ${result.diagnostics.length}`;
      status.tooltip = result.diagnostics
        .map(diagnostic => `${severityLabel(diagnostic.severity)}: ${diagnostic.message}`)
        .join('\n');
      status.show();

      output.appendLine(`\n> ${commandLine}`);
      for (const diagnostic of result.diagnostics) {
        const start = diagnostic.range.start;
        const code = diagnostic.code === undefined ? '' : ` [${diagnostic.code}]`;
        output.appendLine(
          `${severityLabel(diagnostic.severity)}${code} ${start.line + 1}:${start.character + 1} ${diagnostic.message}`,
        );
      }

      void vscode.window.showWarningMessage(
        `fish-lsp: ${first.message}`,
        'Show terminal diagnostics',
      ).then(selection => {
        if (selection === 'Show terminal diagnostics') output.show(true);
      });
    } catch (error) {
      output.appendLine(`terminal analysis failed: ${String(error)}`);
    }
  }));
}
