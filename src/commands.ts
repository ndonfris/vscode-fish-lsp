import fs from 'fs';
import { homedir } from 'os';
import path from 'path';
import { commands, ExtensionContext, Uri, window, workspace } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { fishPath } from './extension';
import { ShowMessage, execFileAsync } from './utils';

export function setFishLspCommands(context: ExtensionContext, client: LanguageClient, serverPath: string, msg: ShowMessage) {
  context.subscriptions.push(
    commands.registerCommand('fish-lsp.restart', async () => {
      if (client) {
        await client.stop();
        await client.start();
        msg.info('Fish LSP has been restarted');
      }
    }),

    commands.registerCommand('fish-lsp.env', async () => {
      try {
        const { stdout } = await execFileAsync(serverPath, ['env', '--create']);
        const outputChannel = window.createOutputChannel('Fish LSP Environment');
        outputChannel.clear();
        outputChannel.append(stdout);
        outputChannel.show();
      } catch (error) {
        msg.error(`Failed to get fish-lsp environment: ${error}`);
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
        msg.error(`Failed to get fish-lsp info: ${error}`);
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
        msg.info(
          `Fish LSP completions generated at ${completionsFile}`
        );
      } catch (error) {
        msg.error(
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
          msg.info('No log file path returned. Make sure fish_lsp_log_file is set.');
          return;
        }

        // Open the log file directly in VS Code
        const logUri = Uri.parse(logFilePath);
        const doc = await workspace.openTextDocument(logUri);
        await window.showTextDocument(doc);

        msg.info(`Opened log file: ${logFilePath}. Use Ctrl+End to go to bottom.`);
      } catch (error) {
        msg.error(`Failed to open fish-lsp log file: ${error}`);
      }
    }),

    commands.registerCommand('fish-lsp.showCheckHealth', async () => {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        msg.info('No active editor', { override: true });
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
        msg.info('No active editor', { override: true });
        return;
      }

      const document = activeEditor.document;
      const position = activeEditor.selection.active;

      // Get the word under cursor
      const wordRange = document.getWordRangeAtPosition(position);
      if (!wordRange) {
        msg.info('No active editor', { override: true });
        return;
      }

      const command = document.getText(wordRange);
      if (!command.trim()) {
        msg.info('No active editor', { override: true });
        return;
      }

      try {
        // Try to get the man page
        const { stdout, stderr } = await execFileAsync(fishPath, ['-c', `man -K ${command} | command cat`]);

        if (stdout.toString().trim() !== '' && !stderr.toString().trim()) {
          await fs.promises.writeFile(`/tmp/fish-lsp/man/${command}.1`, stdout.toString().trim());
          const doc = await workspace.openTextDocument(Uri.file(`/tmp/fish-lsp/man/${command}.1`));
          await window.showTextDocument(doc);
          msg.info(`Fish help for '${command}' displayed`, { override: true });
        }
      } catch (_) {
        // If man page doesn't exist, try fish's help
        try {
          const { stdout: fishHelp } = await execFileAsync(fishPath, ['-c', `help ${command}`]);
          if (fishHelp.toString().trim() === '' || !fishHelp) {
            msg.info(`No help found for '${command}'`, { override: true });
            return;
          }
          await fs.promises.writeFile(`/tmp/fish-lsp/man/${command}.1`, fishHelp);
          const doc = await workspace.openTextDocument(Uri.file(`/tmp/fish-lsp/man/${command}.1`));
          await window.showTextDocument(doc);
          msg.info(`Fish help for '${command}' displayed`, { override: true });
        } catch (_) {
          // window.showErrorMessage(`No manual page or fish help found for '${command}'`);
          msg.error(`No manual page or fish help found for '${command}'`, { override: true });
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
        msg.error(`Failed to run fix-all: ${error}`);
      }
      return undefined;
    }),
  );
}
