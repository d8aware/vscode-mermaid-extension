// Only Service is in the default diagram: test files (*.spec.ts, *.test.ts,
// __tests__/), declaration files (*.d.ts) and node_modules are skipped.
// expected-with-tests.mmd shows the output with the
// "classDiagram.includeTestFiles" setting turned on.
export class Service {
  run(): void {}
}
