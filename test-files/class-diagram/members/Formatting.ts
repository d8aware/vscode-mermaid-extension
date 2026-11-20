// How types are shown: as written in the source when present, otherwise
// inferred. Function types become "Function", inline object types "object",
// long types are shortened, and generics keep their angle brackets.
export class Formatting {
  callback: (value: string) => void;
  options: { verbose: boolean; depth: number };
  lookup: Map<string, Array<Record<string, number>>>;
  veryLongUnion: "alpha" | "bravo" | "charlie" | "delta" | "echo" | "foxtrot" | "golf";
  inferred = new Map<string, number>();
  tuple: [string, number];

  parse(input: string): Record<string, unknown> {
    return {};
  }
}
