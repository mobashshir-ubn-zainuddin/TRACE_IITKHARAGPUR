/** Jest config for Module 3 analytical tests.
 *  These are integration tests: they run against the real db/trace.db so that
 *  reconciliation and ground-truth assertions are checked on actual data. */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testTimeout: 120000,
  transform: {
    "^.+\.tsx?$": ["ts-jest", { tsconfig: { module: "commonjs", esModuleInterop: true, jsx: "react-jsx" } }],
  },
};
