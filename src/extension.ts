import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { DidChangeTextDocumentNotification, DidChangeTextDocumentParams, DidChangeWorkspaceFoldersNotification, DidChangeWorkspaceFoldersParams, DidOpenTextDocumentNotification, DidOpenTextDocumentParams, LanguageClient, LanguageClientOptions, RevealOutputChannelOn, TextDocumentItem, Trace, TransportKind, WorkspaceFolder } from 'vscode-languageclient/node';
import { getCommandFilePath, getServerPath } from './server';
import { FishClientWorkspace } from './workspace';
import { setFishLspCommands } from './commands';
import { getFishEnvironment, showMessage, workspaceShortHand } from './utils';

export let fishPath: string = 'fish'; // Default fish path
export const notifiedWorkspaces = new Set<string>(); // Track notified workspaces to avoid duplicates
export let client: LanguageClient;

const config = vscode.workspace.getConfiguration('fish-lsp');
const workspaceFoldersEnabled: boolean = config.get('enableWorkspaceFolders', false);
/**
 * Set up the logging verbosity && message handler
 */
const loggingVerbosity: 'off' | 'messages' | 'verbose' = config.get('trace.server', 'off');
const msg = showMessage(vscode.window, loggingVerbosity);
export const defaultWorkspaces = config.get('workspaces', []);

function findFishWorkspaceRoot(uri: vscode.Uri): vscode.Uri | undefined {
  const fsPath = uri.fsPath;
  const fishDirs = ['functions', 'completions', 'conf.d'];
  const path = require('path');

  // If this IS config.fish, the workspace root is its parent directory
  if (path.basename(fsPath) === 'config.fish') {
    return vscode.Uri.parse(path.dirname(fsPath));
  }

  // Otherwise, walk up looking for fish workspace indicators
  let current = path.dirname(fsPath); // Start from parent directory
  while (current !== path.dirname(current)) {
    const hasConfigFile = require('fs').existsSync(path.join(current, 'config.fish'));
    const hasFishDirs = fishDirs.some(dir =>
      require('fs').existsSync(path.join(current, dir))
    );

    if (hasConfigFile || hasFishDirs) {
      return vscode.Uri.parse(current);
    }

    current = path.dirname(current);
  }

  return undefined;
}

function sendWorkspaceChangeNotification(workspaceUri: vscode.Uri): void {
  msg.info(`Sending workspace change notification for: ${workspaceUri.fsPath}`);
  if (!client || notifiedWorkspaces.has(workspaceUri.fsPath)) {
    msg.info(`Workspace already notified: ${workspaceUri.fsPath}`);
    return;
  }

  const workspaceFolder: WorkspaceFolder = {
    uri: workspaceUri.toString(),
    name: require('path').basename(workspaceUri.fsPath),
  };

  const params: DidChangeWorkspaceFoldersParams = {
    event: {
      added: [workspaceFolder],
      removed: [],
    },
  };

  msg.info(`Notifying server of workspace folder: ${workspaceFolder.name} at ${workspaceFolder.uri}`);
  client.sendNotification(DidChangeWorkspaceFoldersNotification.type, params);
  notifiedWorkspaces.add(workspaceUri.fsPath);
}

function sendDidOpenNotification(document: vscode.TextDocument): void {
  // don't send open notifications when the client is not initialized or the document is not a fish file
  if (!client || document.languageId !== 'fish') return;

  vscode.commands.executeCommand('fish-lsp.update.currentWorkspace');

  // Check if this document is in a new fish workspace
  const workspaceRoot = findFishWorkspaceRoot(document.uri);
  if (workspaceRoot) {
    sendWorkspaceChangeNotification(workspaceRoot);
  }

  vscode.commands.executeCommand('fish-lsp.updateWorkspace', document.uri.fsPath);

  // send the didOpen notification 
  const textDocumentItem: TextDocumentItem = {
    uri: document.uri.toString(),
    languageId: document.languageId,
    version: document.version,
    text: document.getText(),
  };

  console.log('did update current workspace');
  msg.info(`Sending didOpen notification for document: ${document.uri.fsPath}`);

  const params: DidOpenTextDocumentParams = {
    textDocument: textDocumentItem,
  };

  client.sendNotification(DidOpenTextDocumentNotification.type, params);

  // Send a didChange notification immediately after didOpen to trigger server workspace update
  const changeParams: DidChangeTextDocumentParams = {
    textDocument: {
      uri: document.uri.toString(),
      version: document.version,
    },
    contentChanges: [],
  };

  client.sendNotification(DidChangeTextDocumentNotification.type, changeParams);

  const workspace = FishClientWorkspace.createFromPath(document.uri.fsPath);
  if (workspace) {
    client.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
      event: {
        added: [workspace.toServerWorkspace()],
        removed: [],
      },
    });
  }
  if (workspaceFoldersEnabled && !vscode.workspace.getWorkspaceFolder(document.uri)) {
    vscode.workspace.updateWorkspaceFolders(
      vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
      0,
      workspace.toWorkspaceFolder(),
    );
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // Check if user wants to use global executable
  // Determine which fish-lsp executable to use
  const serverPath = await getServerPath(context, config);
  // Determine the path to the fish executable
  fishPath = await getCommandFilePath('fish') || `fish`;

  // get the env variables from the fish executable
  const env = await getFishEnvironment(fishPath);

  // Server options - do not specify transport as fish-lsp handles stdio by default
  const serverOptions = {
    run: {
      command: serverPath,
      args: ['start'],
      transport: TransportKind.ipc,
      env: {
        ...env,
      },
    },
    debug: {
      command: serverPath,
      args: ['start'],
      env: {
        ...env,
        // Add any additional environment variables needed for the server in debug mode
      },
    }
  };

  const openDocument = vscode.window.activeTextEditor?.document;

  const initializationOptions = {
    fishPath,
    // rootPath: vscode.workspace.rootPath,
    rootUri: openDocument ? Uri.parse(findFishWorkspaceRoot(openDocument.uri)!.toString()) : undefined,
    capabilities: {
      workspace: {
        workspaceFolders: true,
        changeNotifications: true,
      },
    },
    workspacesFolders: vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) || [],
  };

  const workspaceFolder = FishClientWorkspace.createFromPath(vscode.window.activeTextEditor?.document.uri.fsPath || process.cwd());

  console.log('Fish LSP Initialization Options:', initializationOptions);
  console.log('workspaceFolder:', {
    name: workspaceFolder.name,
    path: workspaceFolder.path,
    uri: workspaceFolder.uri.toString(),
  });
  console.log('All Workspace Folders:', vscode.workspace.workspaceFolders);
  // msg.info(`All workspace folders: ${allFolders.map(folder => folder.name).join(', ')}`);

  // Client options
  const clientOptions: LanguageClientOptions = {
    // documentSelector: [ { scheme: 'file', language: 'fish' } ],
    documentSelector: [{ scheme: 'file', language: 'fish' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.fish'),
    },
    outputChannel: vscode.window.createOutputChannel('fish-lsp'),
    traceOutputChannel: vscode.window.createOutputChannel('fish-lsp Trace'),
    workspaceFolder: openDocument ? FishClientWorkspace.createFromPath(openDocument?.uri.fsPath) : vscode.workspace.workspaceFolders?.at(0),
    // Enable workspace folder capabilities
    progressOnInitialization: true,
    revealOutputChannelOn: RevealOutputChannelOn.Info,
    markdown: {
      isTrusted: true, // Enable trusted markdown rendering
    },
    diagnosticCollectionName: 'fish-lsp',
    initializationFailedHandler: () => false,
    initializationOptions: {
      // fishPath,
      capabilities: {
        workspace: {
          workspaceFolders: true,
          changeNotifications: true,
        },
      },
    },
  };

  // Create the language client
  client = new LanguageClient(
    'fish-lsp',
    'fish-lsp',
    serverOptions,
    clientOptions,
  );

  client.setTrace(Trace.fromString(loggingVerbosity));

  // Send didOpen when documents are opened
  const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(sendDidOpenNotification);
  const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document) {
      sendDidOpenNotification(e.document);
    }
  });

  // Send didOpen when active editor changes to update server workspace context
  const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor?.document) {
      sendDidOpenNotification(editor.document);
    }
  });

  const onDidChangeWorkspaceFolders = vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
    // Notify the server about workspace folder changes
    event.added.forEach(folder => {
      const workspaceRoot = findFishWorkspaceRoot(folder.uri);
      if (workspaceRoot) {
        notifiedWorkspaces.add(workspaceRoot.fsPath);
      }
    });
    event.removed.forEach(folder => {
      const workspaceRoot = findFishWorkspaceRoot(folder.uri);
      if (workspaceRoot) {
        notifiedWorkspaces.delete(workspaceRoot.fsPath);
      }
    });

    client.sendNotification('workspace/didChangeWorkspaceFolders', {
      // fix if event.{added,removed} is contained inside an existing workspace folder
      event: {
        added: event.added.map(workspaceShortHand),
        removed: event.removed.map(workspaceShortHand),
      }
    });
    msg.info(`Workspace folders updated: ${event.added.map(folder => folder.name).join(', ')}`);
    msg.info(`Workspace folders updated: ${event.removed.map(folder => folder.name).join(', ')}`);

    if (workspaceFoldersEnabled) {
      vscode.workspace.updateWorkspaceFolders(
        0,
        vscode.workspace.workspaceFolders?.length || 0,
        ...Array.from(notifiedWorkspaces).map(fsPath => {
          const uri = Uri.file(fsPath);
          return {
            uri: uri,
            name: require('path').basename(fsPath),
          } as vscode.WorkspaceFolder;
        })
      );
    }
  });
  /**
   * Start the language client 
   */
  client.start();

  console.log('folders', client.initializeResult?.capabilities.workspace?.workspaceFolders);

  // Register commands
  context.subscriptions.push(
    client,
    onDidOpenTextDocument,
    onDidChangeTextDocument,
    onDidChangeActiveTextEditor,
    onDidChangeWorkspaceFolders,
  );
  setFishLspCommands(context, client, serverPath, msg);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
