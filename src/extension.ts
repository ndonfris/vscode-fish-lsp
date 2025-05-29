import * as path from 'path';
import * as fs from 'fs';
import { workspace, ExtensionContext, window, commands, Uri, WorkspaceFolder, Definition } from 'vscode';
import * as vscode from 'vscode';
import {
  DidChangeWorkspaceFoldersNotification,
  DidOpenTextDocumentNotification,
  ImplementationRequest,
  LanguageClient,
  LanguageClientOptions,
  Location,
  ServerOptions,
  TextDocument,
  TextDocumentItem
} from 'vscode-languageclient/node';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { getCommandFilePath, getServerPath } from './server';
import { FishClientWorkspace } from './workspace';

const execFileAsync = promisify(execFile);

export let fishPath: string = 'fish'; // Default fish path
let client: LanguageClient;

const workspaceShortHand = (folder: WorkspaceFolder): {
  uri: string;
  name: string;
} => {
  return {
    uri: folder.uri.toString(),
    name: folder.name
  };
};

type MessageOpts = {
  override: boolean;
  modal: boolean;
};
function showMessage(_window: typeof window, loggingVerbosity: string) {
  const defaultOpts: MessageOpts = {
    override: false,
    modal: false
  };
  return {
    info: (t: string, opts: Partial<MessageOpts> = defaultOpts) => {
      console.log(t);
      if (!opts.override && loggingVerbosity === 'off') return;
      if (opts.modal) {
        _window.showInformationMessage(t, { modal: true });
      } else {
        _window.showInformationMessage(t);
      }
    },
    error: (t: string, opts: Partial<MessageOpts> = defaultOpts) => {
      console.log(t);
      if (!opts.override && loggingVerbosity === 'off') return;
      if (opts.modal) {
        _window.showErrorMessage(t, { modal: true });
      } else {
        _window.showErrorMessage(t);
      }
    }
  };
}

export async function activate(context: ExtensionContext) {
  // Check if user wants to use global executable
  const config = workspace.getConfiguration('fish-lsp');
  // Determine which fish-lsp executable to use
  const serverPath = await getServerPath(context, config);
  // Determine the path to the fish executable
  fishPath = await getCommandFilePath('fish') || `fish`;

  const loggingVerbosity = config.get('trace.server', 'off');
  const msg = showMessage(window, loggingVerbosity);

  const defaultWorkspaces = config.get('workspaces', []);
  const defaultFolders = await Promise.all(defaultWorkspaces.map(async (val, idx) => {
    const path = await execFileAsync(fishPath, ['-c', `echo ${val}`]);
    if (path.stdout) {
      const escapedPath = path.stdout.trim();
      if (!fs.existsSync(escapedPath)) {
        msg.info(`Workspace folder does not exist: ${escapedPath}`);
        return undefined;
      }
      const workspaceFolder: WorkspaceFolder = {
        uri: Uri.file(escapedPath),
        name: val,
        index: idx,
      };
      return workspaceFolder;
    }
    return undefined;
  }).filter(ws => ws !== undefined) as Promise<WorkspaceFolder>[]);

  const allFolders = defaultFolders.map(folder => FishClientWorkspace.fromFolder(folder));

  let currentFolder = allFolders.find(ws => ws.contains(process.cwd())) || allFolders.find(ws => ws.contains(Uri.file(process.cwd()).fsPath));
  if (!currentFolder) {
    try {
      currentFolder = FishClientWorkspace.createFromPath(Uri.parse(process.cwd()).fsPath);
      if (currentFolder) {
        allFolders.unshift(currentFolder);
      }
    } catch (error) {
      msg.error(`Failed to create workspace from current directory: ${error}`);
    }
  }

  workspace.updateWorkspaceFolders(0, 0, ...allFolders.map(w => w.toWorkspaceFolder()));

  // Server options - do not specify transport as fish-lsp handles stdio by default
  const serverOptions: ServerOptions = {
    run: {
      command: serverPath,
      args: ['start']
    },
    debug: {
      command: serverPath,
      args: ['start']
    }
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      // { scheme: 'file', language: 'fish', pattern: '**/*.fish' },
      { scheme: 'file', language: 'fish' }
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.fish'),
    },
    outputChannel: window.createOutputChannel('fish-lsp'),
    traceOutputChannel: window.createOutputChannel('fish-lsp Trace'),
    workspaceFolder: allFolders?.[0]?.toWorkspaceFolder(),
    // Enable workspace folder capabilities
    initializationOptions: {
      // Add any initialization options here
      fishPath,
      workspacesFolders: allFolders,
      fish_lsp_all_indexed_paths: allFolders.map(folder => folder.uri.fsPath),
    },
  };

  // Create the language client
  client = new LanguageClient(
    'fish-lsp',
    'fish-lsp',
    serverOptions,
    clientOptions,
  );

  // Handle workspace folder changes
  context.subscriptions.push(
    workspace.onDidChangeWorkspaceFolders(async (event) => {
      if (client && client.isRunning()) {
        // Notify the server about workspace folder changes
        try {
          await client.sendNotification('workspace/didChangeWorkspaceFolders', {
            // fix if event.{added,removed} is contained inside an existing workspace folder
            event: {
              added: event.added.map(workspaceShortHand),
              removed: event.removed.map(workspaceShortHand),
            }
          });
        } catch (error) {
          msg.error(`Failed to notify server of workspace folder changes: ${error}`);
        }
      } else {
        // await client?.stop();
        await client?.start();
      }
      msg.info(`Workspace folders updated: ${event.added.map(folder => folder.name).join(', ')}`);
      msg.info(`Workspace folders updated: ${event.removed.map(folder => folder.name).join(', ')}`);
    })
  );

  // TERMINAL INTEGRATION
  // https://github.com/microsoft/vscode-extension-samples/blob/main/shell-integration-sample/src/extension.ts

  context.subscriptions.push(
    workspace.onDidOpenTextDocument(async (doc) => {
      if (doc.languageId === 'fish') {
        msg.info(`File opened: ${doc.uri.fsPath}`);
        const wsFolder = allFolders.find(folder => folder.contains(doc.uri));
        if (wsFolder && client?.isRunning()) {
          await client.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
            event: {
              added: [workspaceShortHand(wsFolder.toWorkspaceFolder())],
              removed: []
            },
          });
        } else {
          // If no workspace folder, we could prompt to add the file's directory as a workspace folder
          const fileUri = doc.uri;
          const existingFolder = allFolders.find(folder => folder.contains(fileUri));
          if (!existingFolder) {
            const newWorkspace = FishClientWorkspace.createFromPath(fileUri.fsPath);
            if (newWorkspace) {
              workspace.updateWorkspaceFolders(
                workspace.workspaceFolders?.length || 0,
                0,
                { uri: newWorkspace.uri, name: newWorkspace.name }
              );
              msg.info(`Added ${newWorkspace.name} to workspace`);
            }
          } else {
            // window.showInformationMessage(`File is already in workspace: ${existingFolder.name}`);
            await client?.sendNotification(DidOpenTextDocumentNotification.type, {
              textDocument: {
                uri: fileUri.toString(),
                languageId: 'fish',
                version: doc.version,
                text: doc.getText()
              }
            });
          }
        }
      }
    })
  );

  // Register commands
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
      } catch (error: any) {
        const outputChannel = window.createOutputChannel('fish-lsp `eval` result');
        outputChannel.clear();
        outputChannel.appendLine(`> ${textToEval.replace(/\n/g, '\n> ')}`);
        outputChannel.appendLine('---');
        outputChannel.appendLine('ERROR:');
        outputChannel.append(error.stderr || error.message || String(error));
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
      } catch (error: any) {
        const outputChannel = window.createOutputChannel('fish-lsp `eval` result');
        outputChannel.clear();
        outputChannel.appendLine(`Evaluating file: ${activeEditor.document.fileName}`);
        outputChannel.appendLine('---');
        outputChannel.appendLine('ERROR:');
        outputChannel.append(error.stderr || error.message || String(error));
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
      } catch (error: any) {
        const outputChannel = window.createOutputChannel('fish-lsp info --check-health');
        outputChannel.clear();
        outputChannel.appendLine('ERROR: `fish-lsp info --check-health`');
        outputChannel.appendLine('---');
        outputChannel.append(error.stderr || error.message || String(error));
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

        // const outputChannel = window.createOutputChannel(`Man Page: ${command}`);
        // outputChannel.clear();
        // outputChannel.appendLine(`Manual page for: ${command}`);
        // outputChannel.appendLine('='.repeat(50));
        // outputChannel.append(stdout);
        // outputChannel.show();
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

          // const outputChannel = window.createOutputChannel(`Fish Help: ${ command; } `);
          // outputChannel.clear();
          // outputChannel.appendLine(`Fish help for: ${ command; } `);
          // outputChannel.appendLine('='.repeat(50));
          // outputChannel.append(fishHelp);
          // outputChannel.show();
        } catch (fishError) {
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

    commands.registerCommand('fish-lsp.impl', async () => {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        window.showWarningMessage('No active editor');
        return;
      }

      const position = activeEditor.selection.active;
      const uri = activeEditor.document.uri.path;;


      return await vscode.commands.executeCommand('vscode.executeImplementationProvider',
        Uri.parse(uri),
        position,
      );

      // try {
      //   const result = await client.sendRequest(ImplementationRequest.type, {
      //     textDocument: { uri: uri.toString() },
      //     position: { line: position.line, character: position.character }
      //   });
      //
      //   if (!result || (result && Array.isArray(result) && result?.length === 0)) {
      //     msg.info('No implementations found');
      //     return;
      //   }
      //
      //   if (Array.isArray(result)) {
      //     const newDoc = result?.at(0);
      //     if (Location.is(newDoc)) {
      //       const docUri = newDoc.uri;
      //       const doc = await workspace.openTextDocument(docUri);
      //       await window.showTextDocument(doc);
      //     }
      //   }
      //   // Open the first implementation found
      // } catch (error) {
      //   msg.error(`Failed to execute go to implementation: ${error}`);
      // }
    }),
    // Go to implementation command
    // commands.registerCommand('fish-lsp.goToImplementation', async () => {
    //   const activeEditor = window.activeTextEditor;
    //   if (!activeEditor) {
    //     window.showWarningMessage('No active editor');
    //     return;
    //   }
    //   try {
    //     // await commands.executeCommand('vscode.executeImplementationProvider', uri, position);
    //     const result: { uri: string, [o: string]: any; }[] = await commands.executeCommand(
    //       'vscode.executeImplementationProvider',
    //       activeEditor.document.uri,
    //       activeEditor.selection.active
    //     );
    //     if (!result || result.length === 0) {
    //       msg.info('No implementations found');
    //       return;
    //     }
    //     const doc = await workspace.openTextDocument(Uri.parse(result[0].uri), {
    //       encoding: 'utf8',
    //     });
    //     if (!doc) {
    //       msg.error('No document found for implementation');
    //       return;
    //     }
    //     await client.sendRequest('textDocument/implementation', async () => {
    //       await commands.executeCommand('vscode.open', doc);
    //       await workspace.openTextDocument(doc.uri);
    //     });
    //   } catch (error) {
    //     msg.error(`Failed to execute go to implementation: ${error}`);
    //   }
    //   return undefined;
    // });
    // })
  );


  try {
    msg.info('Starting language client...');
    await client.start();
    msg.info('Language client started successfully');
  } catch (err) {
    msg.error(`Failed to start Fish Language Server: ${err}`);
    throw err;
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
