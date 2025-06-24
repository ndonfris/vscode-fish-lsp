import * as vscode from 'vscode';
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
import { FishWorkspace, FishWorkspaceCollection, Folders, WorkspaceUtils } from './workspace';
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
import { onDidChangeActiveTextEditor, onDidChangeWorkspaceFolders, onDidOpenTextDocument } from './handlers';

export let fishPath: string = 'fish'; // Default fish path
export let client: LanguageClient;

// Use the centralized workspace collection
export const workspaceCollection = new FishWorkspaceCollection();
export const notifiedWorkspaces = new Set<string>(); // Track notified workspaces to avoid duplicates

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

    const defaultItems = await Folders.fromEnv(env);
    winlog.info(`Default indexed paths: ${defaultItems.join(', ')}`);
    const _defaultSpaces = Folders.allPaths(defaultItems);
    // vscode.workspace.updateWorkspaceFolders(
    //   0,
    //   1,
    //   ...Folders.getVscodeFolders()
    // );

    const openDocument = vscode.window.activeTextEditor?.document;
    const initialWorkspace = TextDocumentUtils.getInitialFishWorkspaceFolder(workspaceCollection, openDocument);

    const allWorkspaces = Folders.allFishWorkspaces(defaultItems);
    winlog.info(`All indexed workspaces: ${allWorkspaces.map(ws => ws.path).join(', ')}`);

    workspaceCollection.add(...allWorkspaces);

    // const doc = vscode.window.activeTextEditor?.document;
    // if (doc && TextDocumentUtils.isFishDocument(doc)) {
    //   // If there's an active document, send the didOpen notification immediately
    //   // await sendDidOpenNotification(doc);
    //   const newWorkspace = vscode.workspace.getWorkspaceFolder(doc.uri);
    //   if (newWorkspace) {
    //     vscode.workspace.updateWorkspaceFolders(0, 1, newWorkspace);
    //   }
    // }

    const initializationOptions = {
      fishPath,
      rootUri: openDocument?.uri.toString(),
      rootPath: workspaceCollection.get(openDocument?.uri || '')?.path,
      WorkspaceFolders: vscode.workspace.workspaceFolders?.map(folder => ({
        name: folder.name,
        uri: folder.uri.toString(),
      })) || [],
      // workspaceFolders: vscode.workspace.workspaceFolders?.map(folder => ({
      //   name: folder.name,
      //   uri: folder.uri.toString(),
      // })) || [],
      // workspacesFolders: allWorkspaces.map((ws, index) => ({index, ...ws.toServerWorkspace()})),
      // capabilities: {
      //   workspace: {
      //     workspaceFolders: {
      //       supported: true,
      //       changeNotifications: true,
      //     },
      //   },
      // },
      fish_lsp_all_indexed_paths: Folders.allFishWorkspaces(defaultItems).map(ws => ws.path),
    };

    console.log('Fish LSP Initialization Options:', JSON.stringify(initializationOptions, null, 2));

    // if (initialWorkspace) {
    //   console.log('Initial workspace:', {
    //     name: initialWorkspace.name,
    //     path: initialWorkspace.path,
    //     uri: initialWorkspace.uri.toString(),
    //   });
    // }
    console.log('All Workspace Folders:', vscode.workspace.workspaceFolders);

    // Client options
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'fish' }],
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher('**/*.fish'),
      },
      outputChannel: vscode.window.createOutputChannel('fish-lsp'),
      traceOutputChannel: vscode.window.createOutputChannel('fish-lsp Trace'),
      // workspaceFolder: vscode.workspace.workspaceFolders?.at(0),
      workspaceFolder: vscode.workspace.workspaceFolders?.[0],
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
    // const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(sendDidOpenNotification);
    //
    // const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((e) => {
    //   if (TextDocumentUtils.isFishDocument(e.document)) {
    //     sendDidOpenNotification(e.document);
    //   }
    // });
    //
    // const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
    //   if (editor?.document && TextDocumentUtils.isFishDocument(editor.document)) {
    //     sendDidOpenNotification(editor.document);
    //   }
    // });

    // const onDidChangeWorkspaceFolders = vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
    //   // Process added folders
    //   for (const folder of event.added) {
    //     const workspace = workspaceCollection.add(folder);
    //     if (workspace) {
    //       notifiedWorkspaces.add(workspace.path);
    //     }
    //   }
    //
    //   // Process removed folders
    //   for (const folder of event.removed) {
    //     const workspace = workspaceCollection.get(folder);
    //     if (workspace) {
    //       workspaceCollection.remove(workspace);
    //       notifiedWorkspaces.delete(workspace.path);
    //     }
    //   }
    //
    //   // Send notification to server using the new utilities
    //   const changeEvent = WorkspaceFolderUtils.toChangeEvent(event);
    //   client.sendNotification('workspace/didChangeWorkspaceFolders', {
    //     event: changeEvent
    //   });
    //
    //   winlog.info(`Workspace folders updated: +${event.added.length} -${event.removed.length}`);
    //
    //   // Update VSCode workspace folders if enabled
    //   if (config.enableWorkspaceFolders) {
    //     const currentFolders = vscode.workspace.workspaceFolders || [];
    //     vscode.workspace.updateWorkspaceFolders(
    //       0,
    //       Math.max(currentFolders.length - 1, 1),
    //       ...allWorkspaces.filter(ws => workspaceCollection.getAll().some(w => ws.equals(w))),
    //     );
    //   }
    // });

    // Listen for workspace folder changes
    // const onDidChangeWorkspaceFolders = vscode.workspace.onDidChangeWorkspaceFolders(
    //   (event: vscode.WorkspaceFoldersChangeEvent) => {
    //     // Send notification to language server
    //     client.sendNotification('workspace/didChangeWorkspaceFolders', {
    //       event: {
    //         added: event.added.map(folder => ({
    //           uri: folder.uri.toString(),
    //           name: folder.name
    //         })),
    //         removed: event.removed.map(folder => ({
    //           uri: folder.uri.toString(), 
    //           name: folder.name
    //         }))
    //       }
    //     });
    //   }
    // );

    // Start the language client 
    await client.start();
    const serverCapabilities = client.initializeResult?.capabilities;

    console.log('Workspace symbol capabilities:', {
      workspaceSymbolProvider: serverCapabilities?.workspaceSymbolProvider,
      resolveProvider: serverCapabilities?.workspaceSymbolProvider?.toString() || 'false',
    });
    // console.log('Server workspace capabilities:', client.initializeResult?.capabilities.workspace?.workspaceFolders);

    // Register commands and event handlers
    context.subscriptions.push(
      client,
      onDidOpenTextDocument,
      onDidChangeActiveTextEditor,
      onDidChangeWorkspaceFolders,
      // onDidOpenTextDocument,
      // onDidChangeTextDocument,
      // onDidChangeActiveTextEditor,
      // onDidChangeWorkspaceFolders,
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
