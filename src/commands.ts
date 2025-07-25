import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { client, fishPath, serverPath } from './extension';
import { winlog, execFileAsync, getOrCreateFishLspTerminal, PathUtils } from './utils';
import { commands, Uri, window, workspace } from 'vscode';
import { extensionFishLspPath, getCommandFilePath } from './server';

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

    commands.registerCommand('fish-lsp.addBundledServerToPATH', async () => {
      const commandLocation = await getCommandFilePath('fish-lsp');
      const bundledServerPath = extensionFishLspPath(context);
      const bundledToAddPath = path.dirname(bundledServerPath);
      const alreadyPrompted = context.globalState.get('hasPromptedForBundledServerPath', false);
      if (bundledServerPath === serverPath && commandLocation === bundledServerPath) {
        window.showInformationMessage(
          'The bundled fish-lsp server is already in your PATH. No action needed.'
        );
        return;
      }
      const selection = await window.showInformationMessage(
        'Would you like to add the bundled fish-lsp server to your PATH?',
        'Yes',
        'No',
        'Don\'t ask again'
      );
      if (selection === 'Yes' || alreadyPrompted) {
        const addPathCommand = `fish_add_path -g -p "${bundledToAddPath}"`;
        await vscode.env.clipboard.writeText(addPathCommand);
        const terminal = getOrCreateFishLspTerminal();
        terminal.sendText('');
        terminal.sendText(addPathCommand);
        terminal.show(true);
      } else if (selection === 'Don\'t ask again') {
        context.globalState.update('hasPromptedForBundledServerPath', true);
      } else if (selection === 'No') {
        // Do nothing
      } else if (selection === undefined) {
        const addPathCommand = `fish_add_path -g -p "${bundledToAddPath}"`;
        await vscode.env.clipboard.writeText(addPathCommand);
        const terminal = getOrCreateFishLspTerminal();
        terminal.sendText(addPathCommand);
        terminal.show();
      } else {
        // do nothing
      }

    }),

    commands.registerCommand('fish-lsp.aliasBundledServer', async () => {
      const bundledServerPath = extensionFishLspPath(context);
      const addPathCommand = `alias fish-lsp="${bundledServerPath}"`;

      const configPath = PathUtils.paths.user.config();
      const oldDoc = vscode.window.activeTextEditor?.document;
      let terminal: vscode.Terminal;
      let newDoc: vscode.TextDocument;
      let originalContent: string;
      let configContent: string;
      let editor: vscode.TextEditor;
      let line: vscode.TextLine;
      let selection: vscode.Selection;
      let startRange: vscode.Position;
      let endRange: vscode.Position;
      let range: vscode.Range;
      let newEdit: vscode.WorkspaceEdit;
      let undoEdit: vscode.WorkspaceEdit;
      const functionCommand = `function fish-lsp; "${bundledServerPath}" $argv; end; funcsave fish-lsp`;

      const quickPickSelection = await window.showQuickPick([
        {
          label: 'Yes',
          description: 'Create alias and send alias to terminal (focuses terminal), copies alias to clipboard',
          detail: addPathCommand
        },
        {
          label: 'Yes, but don\'t focus terminal',
          description: 'Create alias without focusing terminal, copies alias to clipboard',
        },
        {
          label: 'Copy command only',
          description: 'Copy the alias command to clipboard without running',
          detail: `echo "${addPathCommand}" | fish_clipboard_copy`
        },
        {
          label: 'Export to ~/.config/fish/config.fish',
          description: 'Add alias to your fish config file permanently',
          detail: `echo "${addPathCommand}" >> ~/.config/fish/config.fish`
        },
        {
          label: 'Create function instead',
          description: 'Create a fish function instead of an alias',
          detail: `function fish-lsp; "${bundledServerPath}" $argv; end`
        },
        {
          label: 'No',
          description: 'Skip aliasing the bundled server',
          detail: 'No alias will be created'
        }
      ], {
        placeHolder: 'Would you like to alias the bundled fish-lsp server to the command `fish-lsp`?',
        ignoreFocusOut: true
      });

      switch (quickPickSelection?.label) {
        case 'Yes':
          await vscode.env.clipboard.writeText(addPathCommand);
          terminal = getOrCreateFishLspTerminal();
          terminal.sendText(addPathCommand);
          terminal.show();
          break;

        case 'Yes, but don\'t focus terminal':
          await vscode.env.clipboard.writeText(addPathCommand);
          terminal = getOrCreateFishLspTerminal();
          terminal.sendText(addPathCommand);
          break;

        case 'Copy command only':
          await vscode.env.clipboard.writeText(addPathCommand);
          window.showInformationMessage('Alias command copied to clipboard.');
          break;

        case 'Export to ~/.config/fish/config.fish':
          try {
            if (!configPath || !PathUtils.exists(configPath)) {
              window.showErrorMessage('Fish config file not found. Please ensure ~/.config/fish/config.fish exists.');
              return;
            }
            originalContent = await fs.promises.readFile(configPath, 'utf8');
            configContent = `\n# Added by fish-lsp VSCode extension\n${addPathCommand}\n`;
            newDoc = await workspace.openTextDocument(configPath);
            editor = await window.showTextDocument(newDoc);
            line = editor.document.lineAt(editor.document.lineCount - 1);
            endRange = line.range.end;
            startRange = line.range.start;
            range = new vscode.Range(startRange, endRange);
            selection = new vscode.Selection(range.end, newDoc!.lineAt(newDoc!.lineCount - 1)?.range.end);
            newEdit = new vscode.WorkspaceEdit();
            newEdit.insert(newDoc.uri, range.end, configContent);
            workspace.applyEdit(newEdit);

            await window.showInformationMessage('Alias added to fish config file.',
              'peek',
              'show',
              'cancel',
              'undo',
              'accept',
            ).then(async (choice) => {
              switch (choice) {
                case 'peek':
                  if (editor) {
                    editor.revealRange(range);
                    editor.selection = selection;
                  }
                  break;
                case 'show':
                  newDoc = await workspace.openTextDocument(configPath);
                  await window.showTextDocument(newDoc, { preserveFocus: false, selection });
                  return;
                case 'cancel':
                  await fs.promises.writeFile(configPath, originalContent);
                  window.showInformationMessage('Alias not added to fish config file.');
                  newDoc = await workspace.openTextDocument(configPath);
                  newEdit = new vscode.WorkspaceEdit();
                  newEdit.replace(newDoc.uri, selection, '');
                  workspace.applyEdit(newEdit);
                  return;
                case 'undo':
                  undoEdit = new vscode.WorkspaceEdit();
                  undoEdit.replace(newDoc!.uri, selection, '');
                  workspace.applyEdit(undoEdit);
                  await workspace.openTextDocument(oldDoc!);
                  return;
                case 'accept':
                  window.showInformationMessage('Alias added to fish config file.');
                  await workspace.openTextDocument(oldDoc);
                  break;
                default:
                  await workspace.openTextDocument(oldDoc);
                  break;

              }
            });
          } catch (error) {
            window.showErrorMessage(`Failed to write to config file: ${error}`);
            await workspace.openTextDocument(oldDoc);
          }
          break;

        case 'Create function instead':
          await vscode.env.clipboard.writeText(functionCommand);
          terminal = getOrCreateFishLspTerminal();
          terminal.sendText(functionCommand);
          terminal.show();
          break;

        case 'No':
          break;

        default:
          window.showInformationMessage('Bundled fish-lsp server aliasing skipped.');
          break;
      }
    }),

    commands.registerCommand('fish-lsp.server.info', async () => {
      await commands.executeCommand('fish-lsp.showInfo');
    }),

    commands.registerCommand('fish-lsp.open.config.fish', async () => {
      const configPath = PathUtils.paths.user.config();
      if (!configPath || !PathUtils.exists(configPath)) {
        window.showErrorMessage('Fish config file not found. Please ensure ~/.config/fish/config.fish exists.');
        return;
      }
      const doc = await workspace.openTextDocument(Uri.file(configPath));
      await window.showTextDocument(doc, { preserveFocus: false });
    }),

  );

  winlog.info('Fish LSP commands registered');
}
