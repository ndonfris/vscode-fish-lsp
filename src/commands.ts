import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { client, fishPath, serverPath } from './extension';
import { winlog, execFileAsync } from './utils';
import { commands, Uri, window, workspace } from 'vscode';

/**
 * Register commands to execute in the client extension, 
 * such as restarting the server, or updating the current workspace.
 */
export function setupFishLspCommands(context: vscode.ExtensionContext) {

  // Register custom client side commands for Fish LSP
  context.subscriptions.push(

    commands.registerCommand('fish-lsp.restart', async () => {
      if (client) {
        await client.stop();
        await client.start();
        winlog.info('Fish LSP has been restarted');
      }
    }),

    commands.registerCommand('fish-lsp.env', async () => {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        winlog.info('No active editor', { override: true });
        return;
      }
      const outputChannel = window.createOutputChannel('fish-lsp env --show');
      try {
        const { stdout, stderr } = await execFileAsync(serverPath, ['env', '--show', '--no-comments']);

        outputChannel.clear();

        if (stdout) {
          outputChannel.append(stdout);
        }

        if (!stdout && !stderr) {
          outputChannel.appendLine('(No output)');
        }

        outputChannel.show();
      } catch (error: unknown) {
        outputChannel.clear();
        outputChannel.appendLine('ERROR: `fish-lsp env --show`');
        outputChannel.appendLine('---');
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.append(errorMessage);
        outputChannel.show();
      }
    }),

    commands.registerCommand('fish-lsp.env.show', async () => {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        winlog.info('No active editor', { override: true });
        return;
      }
      const outputChannel = window.createOutputChannel('fish-lsp env --show');
      try {
        const { stdout, stderr } = await execFileAsync(serverPath, ['env', '--show', '--no-comments']);

        outputChannel.clear();

        if (stdout) {
          outputChannel.append(stdout);
        }

        if (!stdout && !stderr) {
          outputChannel.appendLine('(No output)');
        }

        outputChannel.show();
      } catch (error: unknown) {
        outputChannel.clear();
        outputChannel.appendLine('ERROR: `fish-lsp env --show`');
        outputChannel.appendLine('---');
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.append(errorMessage);
        outputChannel.show();
      }
    }),

    commands.registerCommand('fish-lsp.env.create', async () => {
      try {
        const { stdout } = await execFileAsync(serverPath, ['env', '--create']);
        const outputChannel = window.createOutputChannel('Fish LSP Environment');
        outputChannel.clear();
        outputChannel.append(stdout);
        outputChannel.show();
      } catch (error) {
        winlog.error(`Failed to get fish-lsp environment: ${error}`);
      }
    }),

    commands.registerCommand('fish-lsp.env.show-defaults', async () => {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        winlog.info('No active editor', { override: true });
        return;
      }

      const outputChannel = window.createOutputChannel('fish-lsp env --show-defaults');
      try {
        const { stdout, stderr } = await execFileAsync(serverPath, ['env', '--show-defaults', '--no-comments']);

        outputChannel.clear();

        if (stdout) {
          outputChannel.append(stdout);
        }

        if (!stdout && !stderr) {
          outputChannel.appendLine('(No output)');
        }

        outputChannel.show();
      } catch (error: unknown) {
        outputChannel.clear();
        outputChannel.appendLine('ERROR: `fish-lsp env --show-defaults`');
        outputChannel.appendLine('---');
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.append(errorMessage);
        outputChannel.show();
      }
    }),

    commands.registerCommand('fish-lsp.info', async () => {
      try {
        const { stdout } = await execFileAsync(serverPath, ['info']);
        const outputChannel = window.createOutputChannel('Fish LSP Info');
        outputChannel.clear();
        outputChannel.append(stdout);
        outputChannel.show();
      } catch (error) {
        winlog.error(`Failed to get fish-lsp info: ${error}`);
      }
    }),

    commands.registerCommand('fish-lsp.generateCompletions', async () => {
      try {
        const configPath = path.join(homedir(), '.config', 'fish', 'completions');
        // Ensure completions directory exists
        await fs.promises.mkdir(configPath, { recursive: true });
        const completionsFile = path.join(configPath, 'fish-lsp.fish');
        // Generate completions
        const { stdout } = await execFileAsync(serverPath, ['complete']);
        // Write completions to file
        await fs.promises.writeFile(completionsFile, stdout);
        winlog.info(
          `Fish LSP completions generated at ${completionsFile}`
        );
      } catch (error) {
        winlog.error(
          `Failed to generate fish-lsp completions: ${error}`
        );
      }
    }),

    commands.registerCommand('fish-lsp.evalSelection', async () => {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        window.showWarningMessage('No active editor');
        return;
      }

      const selection = activeEditor.selection;
      let textToEval = activeEditor.document.getText(selection);

      // If nothing is selected, use the current line
      if (!textToEval.trim()) {
        const currentLine = activeEditor.document.lineAt(activeEditor.selection.active.line);
        textToEval = currentLine.text;
      }

      if (!textToEval.trim()) {
        window.showWarningMessage('No code to evaluate');
        return;
      }

      try {
        const { stdout, stderr } = await execFileAsync(fishPath, ['-c', textToEval]);

        const outputChannel = window.createOutputChannel('fish-lsp `eval` result');
        outputChannel.clear();
        outputChannel.appendLine(`> ${textToEval.replace(/\n/g, '\n> ')}`);
        outputChannel.appendLine('---');

        if (stdout) {
          outputChannel.appendLine('STDOUT:');
          outputChannel.append(stdout);
        }

        if (stderr) {
          outputChannel.appendLine('STDERR:');
          outputChannel.append(stderr);
        }

        if (!stdout && !stderr) {
          outputChannel.appendLine('(No output)');
        }

        outputChannel.show();
      } catch (error: unknown) {
        const outputChannel = window.createOutputChannel('fish-lsp `eval` result');
        outputChannel.clear();
        outputChannel.appendLine(`> ${textToEval.replace(/\n/g, '\n> ')}`);
        outputChannel.appendLine('---');
        outputChannel.appendLine('ERROR:');
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.append(errorMessage);
        outputChannel.show();
      }
    }),

    commands.registerCommand('fish-lsp.evalFile', async () => {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        window.showWarningMessage('No active editor');
        return;
      }

      if (activeEditor.document.languageId !== 'fish') {
        window.showWarningMessage('Current file is not a fish script');
        return;
      }

      const fileContent = activeEditor.document.getText();

      if (!fileContent.trim()) {
        window.showWarningMessage('File is empty');
        return;
      }

      try {
        const { stdout, stderr } = await execFileAsync(fishPath, ['-c', fileContent]);

        const outputChannel = window.createOutputChannel('fish-lsp `eval` result');
        outputChannel.clear();
        outputChannel.appendLine(`Evaluating file: ${activeEditor.document.fileName}`);
        outputChannel.appendLine('---');

        if (stdout) {
          outputChannel.appendLine('STDOUT:');
          outputChannel.append(stdout);
        }

        if (stderr) {
          outputChannel.appendLine('STDERR:');
          outputChannel.append(stderr);
        }

        if (!stdout && !stderr) {
          outputChannel.appendLine('(No output)');
        }

        outputChannel.show();
      } catch (error: unknown) {
        const outputChannel = window.createOutputChannel('fish-lsp `eval` result');
        outputChannel.clear();
        outputChannel.appendLine(`Evaluating file: ${activeEditor.document.fileName}`);
        outputChannel.appendLine('---');
        outputChannel.appendLine('ERROR:');
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.append(errorMessage);
        outputChannel.show();
      }
    }),

    commands.registerCommand('fish-lsp.showLogFile', async () => {
      try {
        // Get the log file path
        const { stdout } = await execFileAsync(serverPath, ['info', '--log-file']);
        const logFilePath = stdout.trim();

        if (!logFilePath) {
          winlog.info('No log file path returned. Make sure fish_lsp_log_file is set.');
          return;
        }

        // Open the log file directly in VS Code
        const logUri = Uri.parse(logFilePath);
        const doc = await workspace.openTextDocument(logUri);
        await window.showTextDocument(doc);

        winlog.info(`Opened log file: ${logFilePath}. Use Ctrl+End to go to bottom.`);
      } catch (error) {
        winlog.error(`Failed to open fish-lsp log file: ${error}`);
      }
    }),

    commands.registerCommand('fish-lsp.showCheckHealth', async () => {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        winlog.info('No active editor', { override: true });
        return;
      }

      try {
        const { stdout, stderr } = await execFileAsync(serverPath, ['info', '--check-health']);

        const outputChannel = window.createOutputChannel('fish-lsp info --check-health');
        outputChannel.clear();

        if (stdout) {
          outputChannel.append(stdout);
        }

        if (!stdout && !stderr) {
          outputChannel.appendLine('(No output)');
        }

        outputChannel.show();
      } catch (error: unknown) {
        const outputChannel = window.createOutputChannel('fish-lsp info --check-health');
        outputChannel.clear();
        outputChannel.appendLine('ERROR: `fish-lsp info --check-health`');
        outputChannel.appendLine('---');
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.append(errorMessage);
        outputChannel.show();
      }
    }),

    commands.registerCommand('fish-lsp.showCommandHelp', async () => {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        winlog.info('No active editor', { override: true });
        return;
      }

      const document = activeEditor.document;
      const position = activeEditor.selection.active;

      // Get the word under cursor
      const wordRange = document.getWordRangeAtPosition(position);
      if (!wordRange) {
        winlog.info('No active editor', { override: true });
        return;
      }

      const command = document.getText(wordRange);
      if (!command.trim()) {
        winlog.info('No active editor', { override: true });
        return;
      }

      try {
        // Try to get the man page
        const { stdout, stderr } = await execFileAsync(fishPath, ['-c', `man -K ${command} | command cat`]);

        if (stdout.toString().trim() !== '' && !stderr.toString().trim()) {
          await fs.promises.writeFile(`/tmp/fish-lsp/man/${command}.1`, stdout.toString().trim());
          const doc = await workspace.openTextDocument(Uri.file(`/tmp/fish-lsp/man/${command}.1`));
          await window.showTextDocument(doc);
          winlog.info(`Fish help for '${command}' displayed`, { override: true });
        }
      } catch (_) {
        // If man page doesn't exist, try fish's help
        try {
          const { stdout: fishHelp } = await execFileAsync(fishPath, ['-c', `help ${command}`]);
          if (fishHelp.toString().trim() === '' || !fishHelp) {
            winlog.info(`No help found for '${command}'`, { override: true });
            return;
          }
          await fs.promises.writeFile(`/tmp/fish-lsp/man/${command}.1`, fishHelp);
          const doc = await workspace.openTextDocument(Uri.file(`/tmp/fish-lsp/man/${command}.1`));
          await window.showTextDocument(doc);
          winlog.info(`Fish help for '${command}' displayed`, { override: true });
        } catch (_) {
          // window.showErrorMessage(`No manual page or fish help found for '${command}'`);
          winlog.error(`No manual page or fish help found for '${command}'`, { override: true });
        }
      }
    }),

    commands.registerCommand('fish-lsp.quickfix.all', async () => {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        window.showWarningMessage('No active editor');
        return;
      }

      if (activeEditor.document.languageId !== 'fish') {
        window.showWarningMessage('Current file is not a fish script');
        return;
      }

      const filePath = activeEditor.document.uri.fsPath;

      try {
        return await commands.executeCommand('fish-lsp.fixAll', filePath);
      } catch (error) {
        winlog.error(`Failed to run fix-all: ${error}`);
      }
      return undefined;
    }),

    commands.registerCommand('fish-lsp.show.currentWorkspace', async () => {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        winlog.info('No active editor', { override: true });
        return;
      }

      return await commands.executeCommand('fish-lsp.showWorkspaceMessage');

    }),

    commands.registerCommand('fish-lsp.update.currentWorkspace', async (...args: string[]) => {
      const activeEditor = window.activeTextEditor;

      const hasSilence = args.some(arg => arg === '--quiet' || arg === '-q');
      const override = hasSilence ? false : true;

      if (!activeEditor) {
        winlog.info('No active editor', { override });
        return;
      }

      const filepath = activeEditor.document.uri.fsPath;

      winlog.info('RUNNING COMMAND: fish-lsp.updateWorkspace', { override });
      winlog.info('Updating workspace for ' + filepath, { override });

      return await commands.executeCommand('fish-lsp.updateWorkspace', filepath, ...args);
    }),

  );

  winlog.info('Fish LSP commands registered');
}
