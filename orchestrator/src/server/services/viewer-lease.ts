/** One visible desktop can show pages from only one private scope at a time. */
export class ViewerLease {
  private owner: string | null = null;
  private holders = 0;

  acquire(scopeKey: string): (() => void) | null {
    if (this.owner !== null && this.owner !== scopeKey) return null;
    this.owner = scopeKey;
    this.holders += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holders -= 1;
      if (this.holders === 0) this.owner = null;
    };
  }

  owns(scopeKey: string): boolean {
    return this.owner === scopeKey;
  }
}
