/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest"],
  },
  testMatch: ["**/?(*.)+(test).ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
};
