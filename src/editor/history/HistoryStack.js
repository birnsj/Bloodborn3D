/**
 * Minimal undo/redo stack. Commands implement do()/undo().
 * Editor-owned; independent of React state and Three.js.
 */
export class HistoryStack {
  constructor({ limit = 100, onChange } = {}) {
    this.limit = limit;
    this.onChange = onChange || (() => {});
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  execute(command) {
    command.do();
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.onChange(this);
    return command;
  }

  undo() {
    const command = this.undoStack.pop();
    if (!command) return null;
    command.undo();
    this.redoStack.push(command);
    this.onChange(this);
    return command;
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) return null;
    command.do();
    this.undoStack.push(command);
    this.onChange(this);
    return command;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.onChange(this);
  }
}
