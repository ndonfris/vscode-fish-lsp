import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, RevealOutputChannelOn, ServerOptions, Trace } from 'vscode-languageclient/node';
import { getCommandFilePath, getServerPath } from './server';
import { FishWorkspaceCollection, Folders } from './workspace';
import { setupFishLspCommands } from './commands';
import { winlog, config, PathUtils, initializeFishEnvironment } from './utils';
import { setupFishLspEventHandlers } from './handlers';

/********************************************************************
 *                                                                  *
 * This is the main entry point for the Fish LSP extension          *
 *                                                                  *
 * activate/deactivate functions are called by VS Code when         *
 * the extension is activated or deactivated (on `fish` document's) *
 *                                                                  *
 ********************************************************************/

// global variables that are initialized during activation
export let fishPath: string = 'fish'; // Default fish path to `fish` executable
export let serverPath: string = ''; // Default server path to the bundled fish-lsp executable
export let client: LanguageClient; // The language client instance

// Use the centralized workspace collection
export const workspaceCollection = new FishWorkspaceCollection();
export const notifiedWorkspaces = new Set<string>(); // Track notified workspaces to avoid duplicates

export async function activate(context: vscode.ExtensionContext) {
  try {
    // Determine which fish-lsp executable to use
    serverPath = await getServerPath(context);

    // Determine the path to the fish executable
    fishPath = await getCommandFilePath('fish') || 'fish';

    console.log(`[${new Date().toLocaleDateString()}] - Activating Fish LSP extension with items`, {
      serverPath,
      fishPath,
      config,
    });

    // Validate executables
    if (!PathUtils.isExecutable(fishPath)) {
      winlog.warn(`Fish executable may not be accessible: ${fishPath}`);
    }
    if (!PathUtils.isExecutable(serverPath)) {
      winlog.error(`Fish-lsp server executable not found or not executable: ${serverPath}`);
      throw new Error(`Invalid fish-lsp server path: ${serverPath}`);
    }

    // Get the env variables from the fish executable
    await initializeFishEnvironment();

    // after initializing the env, create the workspaceFolder wrapper
    const folders = await Folders.all();

    // Server options
    const serverOptions: ServerOptions = {
      run: {
        command: serverPath,
        args: ['start'],
        // options: {
        //   shell: true, // Use shell to execute the command
        //   // env: { ...process.env },
        // },
        // transport: client.transport.kind ,
      },
      debug: {
        command: serverPath,
        args: ['start'],
      },
    };

    const openDocument = vscode.window.activeTextEditor?.document;

    const allWorkspaces = folders.fish.folders();
    winlog.info(`All indexed workspaces: ${folders.fish.paths().join(', ')}`);

    workspaceCollection.add(...allWorkspaces);

    const initializationOptions = {
      fishPath,
      rootUri: workspaceCollection.get(openDocument?.uri || '')?.uri,
      rootPath: workspaceCollection.get(openDocument?.uri || '')?.path,
      workspaceFolders: folders.vscode.serverFolders(),
    };

    winlog.log(`Fish LSP Initialization Options: ${JSON.stringify(initializationOptions, null, 2)}`);
    winlog.log(`All Workspace Folders: ${vscode.workspace.workspaceFolders}`);

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
    client.registerProposedFeatures();

    // set the trace level based on configuration
    client.setTrace(Trace.fromString(config.trace));

    // Start the language client 
    // await client.stop();
    await client.start();

    // Make sure the client is registered in the context
    context.subscriptions.push(
      client,
    );

    // Register client commands and event handlers
    setupFishLspEventHandlers(context);
    setupFishLspCommands(context);
    
    // Show the status of the extension
    winlog.info('Fish LSP extension activated successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    winlog.error(`Failed to activate Fish LSP extension: ${message}`);
    throw error;
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
