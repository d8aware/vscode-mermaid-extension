export function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
    let timeout: ReturnType<typeof setTimeout>;
    return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
      clearTimeout(timeout);
      // Arrow function keeps the caller's `this`. (This previously referenced an
      // undeclared `context`, which only type-checked because @types/mocha
      // declares a global `context`; at runtime it threw a ReferenceError.)
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
