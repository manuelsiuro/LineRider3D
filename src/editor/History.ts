export interface Action {
  undo(): void;
  redo(): void;
}

export class History {
  private done: Action[] = [];
  private undone: Action[] = [];
  onChange?: () => void;

  /** Records an action that has already been applied. */
  push(a: Action) {
    this.done.push(a);
    this.undone.length = 0;
    this.onChange?.();
  }

  undo() {
    const a = this.done.pop();
    if (!a) return;
    a.undo();
    this.undone.push(a);
    this.onChange?.();
  }

  redo() {
    const a = this.undone.pop();
    if (!a) return;
    a.redo();
    this.done.push(a);
    this.onChange?.();
  }

  clear() {
    this.done.length = 0;
    this.undone.length = 0;
    this.onChange?.();
  }

  get canUndo() {
    return this.done.length > 0;
  }
  get canRedo() {
    return this.undone.length > 0;
  }
}
