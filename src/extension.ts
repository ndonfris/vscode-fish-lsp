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

export async function activate(context: ExtensionContext) {

  // Check if user wants to use global executable
  const config = workspace.getConfiguration('fish-lsp');
  // Determine which fish-lsp executable to use
  const serverPath = await getServerPath(context, config);
  // Determine the path to the fish executable
  fishPath = await getCommandFilePath('fish') || `fish`;

  const defaultWorkspaces = config.get('workspaces', []);
  const defaultFolders = await Promise.all(defaultWorkspaces.map(async (val, idx) => {
    const path = await execFileAsync(fishPath, ['-c', `echo ${val}`]);
    if (path.stdout) {
      const escapedPath = path.stdout.trim();
      if (!fs.existsSync(escapedPath)) {
        window.showWarningMessage(`Workspace folder does not exist: ${escapedPath}`);
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
      if (!currentFolder) {
        allFolders.unshift(currentFolder);
      }
    } catch (error) {
      console.error('Failed to create workspace from current directory:', error);
      // window.showErrorMessage(`Failed to create workspace from current directory: ${error}`);
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

  // Get actual workspace folders or create a default one
  // const workspaceFolders = workspace.workspaceFolders?.filter(folder => folder.uri.path.startsWith(process.cwd())) || [];
  // const paths = workspace.workspaceFolders || [];
  // if (paths.length === 0) {
  //   // If no workspace folders are open, use the current working directory
  //   workspaceFolders.push({
  //     uri: Uri.file(process.cwd()),
  //     index: workspace.workspaceFolders?.length || 0,
  //     name: process.cwd()
  //   });
  // }

  // Use this watcher in clientOptions

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      // { scheme: 'file', language: 'fish', pattern: '**/*.fish' },
      { scheme: 'file', language: 'fish' }
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.fish'),
      // extension: {
      //   // watch: [
      //   //             // Watch for changes in the fish configuration directory
      //   //   Uri.joinPath(Uri.file(homedir()), '.config', 'fish', 'config.fish').toString(),
      //   //   Uri.joinPath(Uri.file(homedir()), '.config', 'fish', 'completions', '**/*.fish').toString(),
      //   //   Uri.joinPath(Uri.file(homedir()), '.config', 'fish', 'functions', '**/*.fish').toString(),
      //   // ], 
      //
      //
      //   // Watch for changes in the fish configuration directory
      //   // This is useful for reloading completions or configurations
      //   watch: [
      //     ...defaultFolders.map(folder => Uri.joinPath(folder.uri)) as Uri[],
      //   ],
      // },
    },
    outputChannel: window.createOutputChannel('fish-lsp'),
    traceOutputChannel: window.createOutputChannel('fish-lsp Trace'),
    workspaceFolder: allFolders?.[0]?.toWorkspaceFolder(),
    // workspaceFolder: workspace.workspaceFolders?.[0] || {
    //   uri: Uri.file(process.cwd()),
    //   name: path.basename(process.cwd()),
    //   index: 0,
    // },
    // workspaceFolder: workspace.workspaceFolders?.[0] || {
    //   uri: Uri.file(process.cwd()),
    //   name: process.cwd(),
    //   index: 0
    // },
    // workspaceFolder: workspaceFolders.length > 0 ? workspaceFolders[0] : primaryWorkspaceFolder,
    // Enable workspace folder capabilities
    initializationOptions: {
      // Add any initialization options here
      fishPath,
      workspacesFolders: allFolders,
      fish_lsp_all_indexed_paths: allFolders.map(folder => folder.uri.fsPath),
      // fish_lsp_all_index_paths: [`${process.cwd()}`, env['fish_lsp_all_indexed_paths']]
      // workspaceFolders: workspaceFolders.map(folder => ({
      //   uri: folder.uri.toString(),
      //   name: folder.name,
      // })) || [{
      //   uri: Uri.file(workspace?.rootPath || process.cwd()).toString(),
      //   name: path.basename(process.cwd())
      // }]
      // workspace: workspace.workspaceFolders ?? {
      //   uri: Uri.file(process.cwd()),
      //   name: path.basename(process.cwd()),
      //   index: 0
      // }
      // workspace: workspaceFolders?.map(folder => ({
      //   name: folder.name,
      //   index: folder.index,
      //   uri: folder.uri.toString(),
      // })) || [primaryWorkspaceFolder]
    },
  };
  // Enable workspace folder support
  // workspaceFolders: workspaceFolders || [primaryWorkspaceFolder], progressOnInitialization: true,
  // Enable workspace folder capabilities
  // workspace: {
  //   workspaceFolders: {
  //     supported: true,
  //     changeNotifications: true
  //   }
  // }

  // Create the language client
  client = new LanguageClient(
    'fish-lsp',
    'fish-lsp',
    serverOptions,
    clientOptions,
  );


  // Handle workspace folder changes
  // Handle workspace folder changes
  // context.subscriptions.push(
  //   workspace.onDidChangeWorkspaceFolders(async (event) => {
  //     if (client && client.isRunning()) {
  //       // Notify the server about workspace folder changes
  //       await client.sendNotification('workspace/didChangeWorkspaceFolders', {
  //         event: {
  //           added: event.added.map(folder => ({
  //             uri: folder.uri.toString(),
  //             name: folder.name
  //           })),
  //           removed: event.removed.map(folder => ({
  //             uri: folder.uri.toString(),
  //             name: folder.name
  //           }))
  //         }
  //       });
  //     }
  //   })
  // );;;

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
          console.error('Failed to notify server of workspace folder changes:', error);
        }
      } else {
        // await client?.stop();
        await client?.start()
      }
      window.showInformationMessage(`Workspace folders updated: ${event.added.map(folder => folder.name).join(', ')}`);
      window.showInformationMessage(`Workspace folders updated: ${event.removed.map(folder => folder.name).join(', ')}`);
      // allFolders.push(...event.added.map(folder => FishClientWorkspace.fromFolder(folder)));
      // event.removed.forEach(folder => {
      //   const index = allFolders.findIndex(ws => ws.uri.fsPath.toString() === folder.uri.fsPath.toString());
      //   if (index !== -1) {
      //     allFolders.splice(index, 1);
      //   }
      // })
      // console.log('Updated allFolders:', allFolders);
      // workspace.updateWorkspaceFolders(
      //   0, 
      //   workspace.workspaceFolders?.length || 0, 
      //   ...allFolders.map(folder => folder.toWorkspaceFolder())
      // )
      // workspace.updateWorkspaceFolders(
      //   0, 
      //   workspace.workspaceFolders?.length || 0, 
      //   ...allFolders
      // )
    })
  );

  // Handle workspace folder changes
  // context.subscriptions.push(
  //   workspace.onDidChangeWorkspaceFolders(async (_event) => {
  //     // Restart the client when workspace folders change
  //     if (client && client.state === 2) { // Running state
  //       await client.stop();
  //       await client.start();
  //       window.showInformationMessage('Fish LSP restarted due to workspace changes');
  //     }
  //   })
  // );
  // Handle document open events to potentially add workspace folders

  /**
   * TODO: fix this to only add workspace folders if the file is not already in a workspace folder
   */
  context.subscriptions.push(
    workspace.onDidOpenTextDocument(async (doc) => {
      if (doc.languageId === 'fish') {
        window.showInformationMessage(`File opened: ${doc.uri.fsPath}`);
        // const workspaceFolder = workspace?.getWorkspaceFolder(doc.uri);
        // if (workspaceFolder) {
        //   window.showErrorMessage(`File is already in workspace: ${workspaceFolder.name}`);
        // }
        // window.showTextDocument(doc, { preview: false }).then(async () => {
        //   // Open the document in a new editor
        //   const editor = window.activeTextEditor;
        //   if (editor) {
        //     // Check if the document is already in a workspace folder
        //     const workspaceFolder = workspace.getWorkspaceFolder(doc.uri);
        //     if (workspaceFolder) {
        //       window.showInformationMessage(`File is already in workspace: ${workspaceFolder.name}`);
        //       return;
        //     }
        //   }
        // });
        let wsFolder = allFolders.find(folder => folder.contains(doc.uri));
        // let wsPath = defaultFolders.find(folder => folder.uri.path.startsWith(path.dirname(path.dirname(doc.uri.path))));
        if (wsFolder && client?.isRunning()) {
          // Could send workspace change notification here
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
              window.showInformationMessage(`Added ${newWorkspace.name} to workspace`);
            }
          } else {
            window.showInformationMessage(`File is already in workspace: ${existingFolder.name}`);
            await client?.sendNotification(DidOpenTextDocumentNotification.type, {
              textDocument: {
                uri: fileUri.toString(),
                languageId: 'fish',
                version: doc.version,
                text: doc.getText()
              }
            });
          }
          // const fileUri = doc.uri;
          // const folderUri = Uri.file(path.dirname(path.dirname(fileUri.fsPath))); // TODO: 2 parents? or should it be just 1?
          // const existingFolder = workspace.getWorkspaceFolder(folderUri);
          // const wsPath = defaultFolders.find(folder => folderUri.path.startsWith(folder.uri.path));
          // if (!existingFolder && !wsPath) {
          //   const success = workspace.updateWorkspaceFolders(
          //     workspace.workspaceFolders?.length || 0,
          //     0,
          //     { uri: folderUri, name: path.dirname(folderUri.fsPath) }
          //   );
          //   if (success) {
          //     window.showInformationMessage(`Added ${folderUri.fsPath} to workspace`);
          //   } else {
          //     window.showErrorMessage('Failed to add folder to workspace');
          //   }
          // }
        }
      }
    })
  );

  // Add command to add current file's directory as workspace folder
  // commands.registerCommand('fish-lsp.addWorkspaceFolder', async () => {
  //   const activeEditor = window.activeTextEditor;
  //   if (activeEditor && activeEditor.document.languageId === 'fish') {
  //     const fileUri = activeEditor.document.uri;
  //     const folderUri = Uri.file(path.dirname(fileUri.fsPath));
  //
  //     // Check if folder is already in workspace
  //     const existingFolder = workspace.getWorkspaceFolder(folderUri);
  //     if (!existingFolder) {
  //       const success = workspace.updateWorkspaceFolders(
  //         workspace.workspaceFolders?.length || 0,
  //         0,
  //         { uri: folderUri, name: path.basename(folderUri.fsPath) }
  //       );
  //
  //       if (success) {
  //         window.showInformationMessage(`Added ${folderUri.fsPath} to workspace`);
  //       } else {
  //         window.showErrorMessage('Failed to add folder to workspace');
  //       }
  //     } else {
  //       window.showInformationMessage('Folder is already in workspace');
  //     }
  //   } else {
  //     window.showWarningMessage('No active fish file to add workspace folder for');
  //   }
  // });


  // Register commands
  context.subscriptions.push(
    commands.registerCommand('fish-lsp.restart', async () => {
      if (client) {
        await client.stop();
        await client.start();
        window.showInformationMessage('Fish LSP has been restarted');
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
        window.showErrorMessage(`Failed to get fish-lsp environment: ${error}`);
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
        window.showErrorMessage(`Failed to get fish-lsp info: ${error}`);
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
        window.showInformationMessage(
          `Fish LSP completions generated at ${completionsFile}`
        );
      } catch (error) {
        window.showErrorMessage(
          `Failed to generate fish-lsp completions: ${error}`
        );
      }
    })
  );

  try {
    console.log('Starting language client...');
    await client.start();
    console.log('Language client started successfully');
  } catch (err) {
    console.error('Failed to start language client:', err);
    window.showErrorMessage(`Failed to start Fish Language Server: ${err}`);
    throw err;
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
