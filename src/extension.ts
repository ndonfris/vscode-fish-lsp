// import * as vscode from 'vscode';
// import { Uri } from 'vscode';
// import { DidChangeTextDocumentNotification, DidChangeTextDocumentParams, DidChangeWorkspaceFoldersNotification, DidChangeWorkspaceFoldersParams, DidOpenTextDocumentNotification, DidOpenTextDocumentParams, LanguageClient, LanguageClientOptions, RevealOutputChannelOn, TextDocumentItem, Trace, TransportKind, WorkspaceFolder } from 'vscode-languageclient/node';
// import { getCommandFilePath, getServerPath } from './server';
// import { FishClientWorkspace } from './workspace';
// import { setFishLspCommands } from './commands';
// import { getFishEnvironment, showMessage, workspaceShortHand } from './utils';
//
// export let fishPath: string = 'fish'; // Default fish path
// export const notifiedWorkspaces = new Set<string>(); // Track notified workspaces to avoid duplicates
// export let client: LanguageClient;

// src/extension.ts
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import {
  DidChangeTextDocumentNotification,
  DidChangeTextDocumentParams,
  DidChangeWorkspaceFoldersNotification,
  DidChangeWorkspaceFoldersParams,
  DidOpenTextDocumentNotification,
  DidOpenTextDocumentParams,
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  TextDocumentItem,
  Trace,
  TransportKind,
  WorkspaceFolder
} from 'vscode-languageclient/node';
import { getCommandFilePath, getServerPath } from './server';
import { FishWorkspace, FishWorkspaceCollection, WorkspaceUtils } from './workspace';
import { setFishLspCommands } from './commands';
import {
  getFishEnvironment,
  winlog,
  config,
  PathUtils,
  TextDocumentUtils,
  WorkspaceFolderUtils,
  getFishValue
} from './utils';

export let fishPath: string = 'fish'; // Default fish path
export let client: LanguageClient;

// Use the centralized workspace collection
const workspaceCollection = new FishWorkspaceCollection();
const notifiedWorkspaces = new Set<string>(); // Track notified workspaces to avoid duplicates

function sendWorkspaceChangeNotification(workspaceUri: vscode.Uri): void {
  winlog.info(`Sending workspace change notification for: ${workspaceUri.fsPath}`);
  if (!client || notifiedWorkspaces.has(workspaceUri.fsPath)) {
    winlog.info(`Workspace already notified: ${workspaceUri.fsPath}`);
    return;
  }

  const workspaceFolder: WorkspaceFolder = {
    uri: workspaceUri.toString(),
    name: PathUtils.basename(workspaceUri.fsPath),
  };

  const params: DidChangeWorkspaceFoldersParams = {
    event: {
      added: [workspaceFolder],
      removed: [],
    },
  };

  winlog.info(`Notifying server of workspace folder: ${workspaceFolder.name} at ${workspaceFolder.uri}`);
  client.sendNotification(DidChangeWorkspaceFoldersNotification.type, params);
  notifiedWorkspaces.add(workspaceUri.fsPath);
}

async function sendDidOpenNotification(document: vscode.TextDocument): Promise<void> {
  // Don't send open notifications when the client is not initialized or the document is not a fish file
  if (!client || !TextDocumentUtils.isFishDocument(document)) return;

  vscode.commands.executeCommand('fish-lsp.update.currentWorkspace');

  // Check if this document is in a new fish workspace using the new utilities
  const workspaceRootPath = WorkspaceUtils.findWorkspaceRoot(document.uri.fsPath);
  if (workspaceRootPath) {
    const workspaceUri = vscode.Uri.file(workspaceRootPath);
    sendWorkspaceChangeNotification(workspaceUri);
  }

  vscode.commands.executeCommand('fish-lsp.updateWorkspace', document.uri.fsPath);

  // Send the didOpen notification 
  const textDocumentItem: TextDocumentItem = {
    uri: document.uri.toString(),
    languageId: document.languageId,
    version: document.version,
    text: document.getText(),
  };

  console.log('did update current workspace');
  winlog.info(`Sending didOpen notification for document: ${document.uri.fsPath}`);

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

  // Add workspace to collection and notify server
  const workspace = workspaceCollection.get(document.uri);
  if (workspace) {
    workspaceCollection.getAll()
    // client.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
    //   event: {
    //     added: [workspace.toServerWorkspace()],
    //     removed: [],
    //   },
    // });

    // Add to VSCode workspace if enabled
    const foundWorkspace = vscode.workspace.getWorkspaceFolder(document.uri);
    // if (config.enableWorkspaceFolders && !foundWorkspace) {
    //   // workspaceCollection.add(workspace);
    //   // vscode.workspace.workspaceFolders?.map(ws => FishWorkspace.create(ws.uri)).forEach(ws => {
    //   //   if (ws && ws.path !== workspace.path) {
    //   //     notifiedWorkspaces.add(ws.path);
    //   //     workspaceCollection.add(ws);
    //   //   }
    //   // });
    if (config.enableWorkspaceFolders) {
      // const existingWorkspaces = vscode.workspace.workspaceFolders || [];
      vscode.workspace.updateWorkspaceFolders(
        0,
        vscode.workspace.workspaceFolders?.length || 1,
        workspace.withIndex(0).toVSCodeWorkspaceFolder()
      );
      winlog.info(`Added workspace folder: ${workspace.name} at ${workspace.path}`);
      console.log(`Added workspace folder: ${workspace.name} at ${workspace.path}`);
      console.log(`Current Folders: ${JSON.stringify(vscode.workspace.workspaceFolders?.map(ws => ws.name), null, 2)}`);
      if (!client?.needsStart()) await client.restart();
      console.log(`restarting...`);
      console.log(`Workspace folders after update: ${JSON.stringify(vscode.workspace.workspaceFolders?.map(ws => ws.name), null, 2)}`);

    }
    // }
  }
}

export async function activate(context: vscode.ExtensionContext) {
  try {
    // Determine which fish-lsp executable to use
    const serverPath = await getServerPath(context);

    // Determine the path to the fish executable
    fishPath = await getCommandFilePath('fish') || 'fish';

    // Validate executables
    if (!PathUtils.isExecutable(fishPath)) {
      winlog.warn(`Fish executable may not be accessible: ${fishPath}`);
    }
    if (!PathUtils.isExecutable(serverPath)) {
      winlog.error(`Fish-lsp server executable not found or not executable: ${serverPath}`);
      throw new Error(`Invalid fish-lsp server path: ${serverPath}`);
    }

    // Get the env variables from the fish executable
    const env = await getFishEnvironment(fishPath);

    // Server options
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

    const defaultItems = env['fish_lsp_all_indexed_paths']?.trim().split(' ') || ['__fish_config_dir', '__fish_data_dir'];
    winlog.info(`Default indexed paths: ${defaultItems.join(', ')}`);
    const defaultSpaces = await Promise.all(defaultItems.map(async item => {
      const path = await getFishValue(item);
      if (path && PathUtils.isDirectory(path)) {
        return path;
      }
      winlog.warn(`Default indexed path '${item}' is not a valid directory: ${path}`);
      return '';
    }));

    const openDocument = vscode.window.activeTextEditor?.document;
    const initialWorkspace = TextDocumentUtils.getInitialFishWorkspaceFolder(workspaceCollection, openDocument);

    const allWorkspaces = [
      initialWorkspace,
      ...WorkspaceFolderUtils.getVSCodeWorkspaceFolders(),
      ...(config.enableWorkspaceFolders ? [] : defaultSpaces.map(space => FishWorkspace.create(space))),
    ].reduce((acc: FishWorkspace[], workspace) => {
      if (!workspace) return acc;
      const curr = FishWorkspace.fromWorkspaceFolder(workspace);
      if (!acc.some(ws => ws.equals(curr))) {
        acc.push(curr);
      }
      return acc;
    }, []);

    const allIndexedWorkspaces = Array.from(allWorkspaces).map((ws, i) => ws.withIndex(i));
    if (openDocument) {
      const documentWorkspace = FishWorkspace.create(openDocument);
      if (documentWorkspace && !allIndexedWorkspaces.some(ws => ws.equals(documentWorkspace)) && config.enableWorkspaceFolders) {
        allIndexedWorkspaces.unshift(documentWorkspace);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(openDocument.uri);
        vscode.workspace.updateWorkspaceFolders(
          0,
          null,
          workspaceFolder ? workspaceFolder : documentWorkspace?.withIndex(0).toVSCodeWorkspaceFolder()
        );
      }
    }
    // const allWorkspaceFolders = vscode.workspace.workspaceFolders || [];
    // vscode.workspace.updateWorkspaceFolders(0, Math.min(allWorkspaceFolders?.length - 1, 0))
    // allIndexedWorkspaces.forEach(folder => {
    //   const workspace = workspaceCollection.get(folder);
    //   if () {
    //     winlog.info(`Workspace already exists: ${folder.name} at ${folder.path}`);
    //   }
    // })

    // workspaceCollection.addInitial();
    // workspaceCollection.add(initialWorkspace);
    workspaceCollection.add(...allWorkspaces);

    // if (defaultSpaces.length !== 0) {
    //   allWorkspaces.forEach(folder => {
    //     const workspace = FishWorkspace.create(folder.uri);
    //     if (workspace) {
    //       defaultSpaces.push(workspace.path);
    //       workspaceCollection.add(workspace);
    //       notifiedWorkspaces.add(workspace.path);
    //     }
    //   });
    // }

    const initializationOptions = {
      fishPath,
      rootUri: openDocument?.uri.toString(),
      rootPath: initialWorkspace?.path.toString(),
      // workspacesFolders: allIndexedWorkspaces.map((ws, index) => ({index, ...ws.toServerWorkspace()})),
      capabilities: {
        workspace: {
          workspaceFolders: true,
          changeNotifications: true,
        },
      },
      fish_lsp_all_indexed_paths: allIndexedWorkspaces.map(ws => ws.path),
      // fish_lsp_all_indexed_paths: [
      //   ...defaultSpaces,
      //   ...workspaceCollection.getAll().map(folder => folder.uri.fsPath),
      // ],
    };

    console.log('Fish LSP Initialization Options:', JSON.stringify(initializationOptions, null, 2));
    if (initialWorkspace) {
      console.log('Initial workspace:', {
        name: initialWorkspace.name,
        path: initialWorkspace.path,
        uri: initialWorkspace.uri.toString(),
      });
    }
    console.log('All Workspace Folders:', vscode.workspace.workspaceFolders);

    // Client options
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'fish' }],
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher('**/*.fish'),
      },
      outputChannel: vscode.window.createOutputChannel('fish-lsp'),
      traceOutputChannel: vscode.window.createOutputChannel('fish-lsp Trace'),
      workspaceFolder: vscode.workspace.workspaceFolders?.at(0),
      progressOnInitialization: true,
      revealOutputChannelOn: RevealOutputChannelOn.Info,
      markdown: {
        isTrusted: true, // Enable trusted markdown rendering
      },
      initializationFailedHandler: () => false,
      initializationOptions,
    };

    // Create the language client
    client = new LanguageClient(
      'fish-lsp',
      'fish-lsp',
      serverOptions,
      clientOptions,
    );

    client.setTrace(Trace.fromString(config.trace));

    // Event handlers using the new utilities
    const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(sendDidOpenNotification);

    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((e) => {
      if (TextDocumentUtils.isFishDocument(e.document)) {
        sendDidOpenNotification(e.document);
      }
    });

    const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document && TextDocumentUtils.isFishDocument(editor.document)) {
        sendDidOpenNotification(editor.document);
      }
    });

    const onDidChangeWorkspaceFolders = vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
      // Process added folders
      for (const folder of event.added) {
        const workspace = workspaceCollection.add(folder);
        if (workspace) {
          notifiedWorkspaces.add(workspace.path);
        }
      }

      // Process removed folders
      for (const folder of event.removed) {
        const workspace = workspaceCollection.get(folder);
        if (workspace) {
          workspaceCollection.remove(workspace);
          notifiedWorkspaces.delete(workspace.path);
        }
      }

      // Send notification to server using the new utilities
      const changeEvent = WorkspaceFolderUtils.toChangeEvent(event);
      client.sendNotification('workspace/didChangeWorkspaceFolders', {
        event: changeEvent
      });

      winlog.info(`Workspace folders updated: +${event.added.length} -${event.removed.length}`);

      // Update VSCode workspace folders if enabled
      if (config.enableWorkspaceFolders) {
        const currentFolders = vscode.workspace.workspaceFolders || [];
        vscode.workspace.updateWorkspaceFolders(
          0,
          Math.max(currentFolders.length - 1, 1),
          ...allIndexedWorkspaces.filter(ws => workspaceCollection.getAll().some(w => ws.equals(w))),
        );
      }
    });

    // Start the language client 
    await client.start();

    console.log('Server workspace capabilities:', client.initializeResult?.capabilities.workspace?.workspaceFolders);

    // Register commands and event handlers
    context.subscriptions.push(
      client,
      onDidOpenTextDocument,
      onDidChangeTextDocument,
      onDidChangeActiveTextEditor,
      onDidChangeWorkspaceFolders,
    );

    setFishLspCommands(context, client, serverPath);

    winlog.info('Fish LSP extension activated successfully', { override: true });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    winlog.error(`Failed to activate Fish LSP extension: ${message}`, { override: true });
    throw error;
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
