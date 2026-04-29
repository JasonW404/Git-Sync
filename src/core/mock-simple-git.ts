export interface MockGitResult {
  branches?: { all: string[] };
  log?: { all: Array<{ hash: string; author_name: string; author_email: string; message: string; date: string }> };
  tags?: { all: string[] };
  status?: { isClean: boolean };
  revparse?: string;
  remotes?: Array<{ name: string; refs: { fetch: string; push: string } }>;
}

export class MockSimpleGit {
  private results: MockGitResult = {};
  private _isClean: boolean = true;

  setResults(results: MockGitResult): void {
    this.results = results;
    if (results.status) {
      this._isClean = results.status.isClean;
    }
  }

  async clone(_url: string, _localPath: string, _options?: string[]): Promise<void> {}

  async fetch(_remote?: string, _branch?: string): Promise<void> {}

  async branch(_options?: string[]): Promise<{ all: string[] }> {
    return this.results.branches ?? { all: [] };
  }

  async branchLocal(): Promise<{ all: string[] }> {
    return this.results.branches ?? { all: [] };
  }

  async tags(): Promise<{ all: string[] }> {
    return this.results.tags ?? { all: [] };
  }

  async log(_options?: string[]): Promise<{ all: Array<{ hash: string; author_name: string; author_email: string; message: string; date: string }> }> {
    return this.results.log ?? { all: [] };
  }

  async checkout(_branch: string): Promise<void> {}

  async checkoutBranch(_branch: string, _fromBranch: string): Promise<void> {}

  async checkoutLocalBranch(_branch: string): Promise<void> {}

  async push(_remote?: string, _branch?: string, _options?: string[]): Promise<void> {}

  async pushTags(_remote: string): Promise<void> {}

  async tag(_options?: string[]): Promise<void> {}

  async revparse(_options: string[]): Promise<string> {
    return this.results.revparse ?? '';
  }

  async addRemote(_name: string, _url: string): Promise<void> {}

  async removeRemote(_name: string): Promise<void> {}

  async getRemotes(_verbose?: boolean): Promise<Array<{ name: string; refs: { fetch: string; push: string } }>> {
    return this.results.remotes ?? [];
  }

  async status(): Promise<{ isClean: () => boolean }> {
    return { isClean: () => this._isClean };
  }
}