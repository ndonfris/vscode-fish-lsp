export interface WorkspaceFolder {
  uri: string;
  name: string;
}

export interface WorkspaceFoldersChangeEvent {
  added: WorkspaceFolder[];
  removed: WorkspaceFolder[];
}

export namespace WorkspaceFolder {
  export function is(value: any): value is WorkspaceFolder {
    return value && typeof value.uri === 'string' && typeof value.name === 'string';
  }
}

// Mock other exports as needed
export const LanguageClient = class { };
export const LanguageClientOptions = {};
export const ServerOptions = {};
export const DidChangeWorkspaceFoldersNotification = {
  type: { method: 'workspace/didChangeWorkspaceFolders' }
};
