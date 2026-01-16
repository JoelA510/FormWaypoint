module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    verbose: true,
    testMatch: ['**/*.test.js'],
    // Ensure we don't test node_modules
    testPathIgnorePatterns: ['/node_modules/']
};
