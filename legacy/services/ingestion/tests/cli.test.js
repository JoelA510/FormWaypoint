const { describe, it } = require('node:test');
const { exec } = require('child_process');
const path = require('path');
const assert = require('assert');
const fs = require('fs');
const util = require('util');

const execAsync = util.promisify(exec);
const cliPath = path.join(__dirname, '../bin/cli.js');
const goldenPdf = path.join(__dirname, 'golden/pdf/simple.pdf');

describe('CLI Wrapper', () => {
    it('should parse a PDF file and output JSON', async () => {
        // Skip if golden file doesn't exist
        if (!fs.existsSync(goldenPdf)) {
            console.log('Skipping CLI test: golden file not found');
            return;
        }

        const { stdout } = await execAsync(`node ${cliPath} ${goldenPdf}`);
        const result = JSON.parse(stdout);
        assert.strictEqual(result.meta.sourceType, 'pdf');
        assert.ok(result.header);
        assert.ok(result.lines);
    });

    it('should fail for non-existent file', async () => {
        try {
            await execAsync(`node ${cliPath} non-existent.pdf`);
            assert.fail('Should have failed');
        } catch (error) {
            assert.ok(error.stderr.includes('File not found'));
        }
    });

    it('should fail for unsupported extension', async () => {
        const dummyFile = path.join(__dirname, 'dummy.txt');
        fs.writeFileSync(dummyFile, 'dummy content');

        try {
            await execAsync(`node ${cliPath} ${dummyFile}`);
            assert.fail('Should have failed');
        } catch (error) {
            assert.ok(error.stderr.includes('Unsupported file extension'));
        } finally {
            fs.unlinkSync(dummyFile);
        }
    });
});
