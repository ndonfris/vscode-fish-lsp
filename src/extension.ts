import * as path from 'path';
import * as fs from 'fs';
import { workspace, ExtensionContext, window, commands, Uri, WorkspaceFolder } from 'vscode';
import {
  DidChangeWorkspaceFoldersNotification,
  DidOpenTextDocumentNotification,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions
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

function showMessage(_window: typeof window, loggingVerbosity: string) {
  return {
    info: (t: string) => {
      console.log(t);
      if (loggingVerbosity === 'off') return;
      _window.showInformationMessage(t);
    },
    error: (t: string) => {
      console.log(t);
      if (loggingVerbosity === 'off') return;
      _window.showErrorMessage(t);
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
    })
  );

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
  });

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
