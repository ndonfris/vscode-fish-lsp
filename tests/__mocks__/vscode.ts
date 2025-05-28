export class Uri {
  static file(path: string): Uri {
    return new Uri('file', '', path);
  }

  static parse(value: string): Uri {
    // Simple parsing for file:// URIs
    if (value.startsWith('file://')) {
      return new Uri('file', '', value.replace('file://', ''));
    }
    return new Uri('file', '', value);
  }

  constructor(
    public scheme: string,
    public authority: string,
    public path: string
  ) {}

  get fsPath(): string {
    return this.path;
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export interface WorkspaceFolder {
  uri: Uri;
  name: string;
  index: number;
}
