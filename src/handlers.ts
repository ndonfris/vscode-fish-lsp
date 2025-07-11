import * as vscode from 'vscode';
import { client, notifiedWorkspaces, workspaceCollection } from './extension';
import { getSilenceFishLspUpdateWorkspaceParam, PathUtils, TextDocumentUtils, winlog } from './utils';
import { FishWorkspace, WorkspaceUtils } from './workspace';
import {
  DidChangeTextDocumentNotification,
  DidChangeTextDocumentParams,
  DidChangeWorkspaceFoldersNotification,
  DidChangeWorkspaceFoldersParams,
  DidOpenTextDocumentNotification,
  DidOpenTextDocumentParams,
  TextDocumentItem,
  WorkspaceFolder,
} from 'vscode-languageclient';

/****************************************************************************************
 * Functions to send notifications to the language server, when an event occurs on the  *
 * server. Essentially, this injects extra functionality into the client implementation *
 * by performing additional actions when certain events occur (typically when dealing   *
 * with opening or changing documents).                                                 *
 *                                                                                      *
 * Exported functions are used as middleware.                                           *
 ****************************************************************************************/

// Utility function to send a workspace change notification
function sendWorkspaceChangeNotification(workspaceUri: vscode.Uri): void {
  winlog.info(`Sending workspace change notification for: ${workspaceUri.fsPath}`);
  if (!client || !client.isRunning()) {
    winlog.warn('Language client is not running, cannot send workspace change notification.');
    return;
  }
  if (notifiedWorkspaces.has(workspaceUri.fsPath)) {
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

export async function sendDidOpenNotification(document: vscode.TextDocument): Promise<void> {
  // Don't send open notifications when the client is not initialized or the document is not a fish file
  if (!client || !client.isRunning() || !TextDocumentUtils.isFishDocument(document)) return;

  // Should display the logging information, when the verbosity is set >= 'messages'
  const updateParams = getSilenceFishLspUpdateWorkspaceParam();
  vscode.commands.executeCommand('fish-lsp.update.currentWorkspace', updateParams);

  // Check if this document is in a new fish workspace using the new utilities
  const workspaceRootPath = WorkspaceUtils.findWorkspaceRoot(document.uri.fsPath);
  if (workspaceRootPath) {
    const workspaceUri = vscode.Uri.file(workspaceRootPath);
    sendWorkspaceChangeNotification(workspaceUri);
  }

  vscode.commands.executeCommand('fish-lsp.updateWorkspace', document.uri.fsPath, updateParams);

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
    workspaceCollection.getAll();
    const foundWorkspace = vscode.workspace.getWorkspaceFolder(document.uri);
    winlog.log(`Found workspace folder: ${foundWorkspace ? foundWorkspace.name : 'none'} for document: ${document.uri.fsPath}`);
  }
}

export const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(
  async (document: vscode.TextDocument) => {
    if (!client || !client.isRunning()) {
      winlog.warn('Language client is not running, stopping and restarting client.');
      return;
    }
    if (!TextDocumentUtils.isFishDocument(document)) return;

    // Find which workspace this document belongs to
    const fishWorkspace = FishWorkspace.create(document);


    // Check if this document is in a new workspace
    const workspaceRoot = WorkspaceUtils.findWorkspaceRoot(document.uri.fsPath);
    if (workspaceRoot) {
      const workspaceUri = vscode.Uri.file(workspaceRoot);

      // Only send notification if this is a new workspace
      if (!notifiedWorkspaces.has(workspaceRoot)) {
        const workspaceFolder: WorkspaceFolder = {
          uri: workspaceUri.toString(),
          name: PathUtils.basename(workspaceRoot),
        };

        client.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
          event: {
            added: [workspaceFolder],
            removed: [],
          },
        });

        notifiedWorkspaces.add(workspaceRoot);
      }
    }


    // Send didOpen with workspace context
    const params: DidOpenTextDocumentParams = {
      textDocument: {
        uri: document.uri.toString(),
        languageId: document.languageId,
        version: document.version,
        text: document.getText(),
      }
    };

    await client.sendNotification(DidOpenTextDocumentNotification.type, params);
    winlog.log(`Sent didOpen notification for ${document.uri.toString()}`);

    const changeParams: DidChangeTextDocumentParams = {
      textDocument: {
        uri: document.uri.toString(),
        version: document.version,
      },
      contentChanges: [],
    };

    await client.sendNotification(DidChangeTextDocumentNotification.type, changeParams);
    winlog.log(`Sent didChange notification for ${document.uri.toString()}`);

    await client.sendNotification('workspace/didChangeWorkspaceFolders', {
      event: {
        added: [fishWorkspace],
        removed: []
      }
    });
    winlog.log(`Sent workspace/didChangeWorkspaceFolders notification for ${document.uri.toString()}`);

    const updateParams = getSilenceFishLspUpdateWorkspaceParam();
    await vscode.commands.executeCommand('fish-lsp.updateWorkspace', document.uri.fsPath, updateParams);
    winlog.log(`Executed fish-lsp.updateWorkspace command for ${document.uri.toString()}`);
  }
);

export const onDidChangeWorkspaceFolders = vscode.workspace.onDidChangeWorkspaceFolders(
  (event: vscode.WorkspaceFoldersChangeEvent) => {
    if (!client || !client.start()) {
      winlog.warn('Language client is not running, cannot send workspace folder change notification.');
      return;
    }
    // Send notification to language server
    client.sendNotification('workspace/didChangeWorkspaceFolders', {
      event: {
        added: event.added.map(folder => ({
          uri: folder.uri.toString(),
          name: folder.name
        })),
        removed: event.removed.map(folder => ({
          uri: folder.uri.toString(),
          name: folder.name
        }))
      }
    });
  }
);

/**
 * Register the ("middleware") event handlers for the fish-lsp extension, to update
 * the server when a document is opened or when a workspace folder changes.
 *
 * NOTE: context will contain the listeners/handlers, which is an intended 
 *       side effect of this function. Call the `setupFishLspCommands` function
 *       inside the client's `activate` function to register the commands.
 *
 * @param context - The extension context provided by VS Code.
 * @return void
 */
export function setupFishLspEventHandlers(context: vscode.ExtensionContext): void {
  // Register the handlers
  context.subscriptions.push(
    onDidOpenTextDocument,
    onDidChangeWorkspaceFolders,
  );

  winlog.info('Handlers for Fish LSP initialized.');
}
