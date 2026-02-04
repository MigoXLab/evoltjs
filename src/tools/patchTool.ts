/**
 * PatchTool - Tool for applying patches to files
 *
 * Corresponds to Python's tools/patch_tool.py
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { tools } from './toolRegister';
import { logger } from '../utils';

/**
 * Tool for applying patches to files
 */
@tools({
    writePatchFile: {
        description: 'Write patch content to file. IMPORTANT: Always read the target file first before generating a patch. Use correct line numbers based on actual file content. Never use @@ -0,0 format unless file is truly empty.',
        params: [
            { name: 'patchPath', type: 'string', description: 'Path to the patch file. Will automatically append .patch suffix if not present.' },
            { name: 'patchContent', type: 'string', description: 'Content of the patch in unified diff format. Must start with --- a/file_path and include +++ b/file_path lines.' },
        ],
        returns: { type: 'string', description: 'Success message with bytes written' },
    },
    applyPatch: {
        description: 'Apply a patch to a file. The patch should be generated using writePatchFile first. IMPORTANT: Ensure patch line numbers match the actual file content to avoid duplicate content.',
        params: [
            { name: 'patchPath', type: 'string', description: 'Path to the patch file. Will automatically append .patch suffix if not present.' },
            { name: 'patchContent', type: 'string', description: 'Optional patch content to write before applying', optional: true },
        ],
        returns: { type: 'string', description: 'Success message describing the applied patch' },
    },
})
export class PatchTool {
    /**
     * Write patch content to file
     *
     * @param patchPath - Path to the patch file
     * @param patchContent - Content of the patch in unified diff format
     * @returns Success message
     */
    async writePatchFile(patchPath: string, patchContent: string): Promise<string> {
        let warningMsg = '';

        // Ensure patch_path ends with .patch
        if (!patchPath.endsWith('.patch')) {
            patchPath = `${patchPath}.patch`;
            warningMsg = `Warning: Patch path does not end with '.patch', automatically appended '.patch' to ${patchPath}`;
        }

        // Create directory if needed
        const dirPath = path.dirname(patchPath);
        if (dirPath) {
            await fs.promises.mkdir(dirPath, { recursive: true });
        }

        // Clean up patch content
        patchContent = patchContent.trim();

        // Remove code block markers if present
        if (patchContent.startsWith('```')) {
            const newlineIndex = patchContent.indexOf('\n');
            patchContent = newlineIndex !== -1 ? patchContent.slice(newlineIndex + 1) : patchContent.slice(3);
        }
        if (patchContent.endsWith('```')) {
            patchContent = patchContent.slice(0, -3).trimEnd();
        }
        patchContent = patchContent.trim();

        // Convert git diff format to unified diff if needed
        if (patchContent && patchContent.split('\n')[0].startsWith('diff --git')) {
            patchContent = this._convertGitDiffToUnifiedDiff(patchContent);
        }

        // Validate patch format
        this._validatePatchFormat(patchContent);

        // Backup existing patch file if it exists
        if (fs.existsSync(patchPath)) {
            const baseName = path.basename(patchPath, '.patch');
            const oldPatchPath = path.join(path.dirname(patchPath), `${baseName}1.patch`);
            await fs.promises.rename(patchPath, oldPatchPath);
        }

        // Write patch file
        await fs.promises.writeFile(patchPath, patchContent, 'utf-8');

        const bytesWritten = Buffer.from(patchContent, 'utf-8').length;
        const resultMsg = `Successfully wrote patch to ${patchPath}, wrote ${bytesWritten} bytes`;
        return warningMsg ? `${resultMsg}\n${warningMsg}` : resultMsg;
    }

    /**
     * Apply a patch to a file
     *
     * @param patchPath - Path to the patch file
     * @param patchContent - Optional patch content to write before applying
     * @returns Success message
     */
    async applyPatch(patchPath: string, patchContent?: string): Promise<string> {
        let warningMsg = '';

        // Ensure patch_path ends with .patch
        if (!patchPath.endsWith('.patch')) {
            patchPath = `${patchPath}.patch`;
            warningMsg = `Warning: Patch path does not end with '.patch', automatically appended '.patch' to ${patchPath}`;
        }

        const patchFileAbs = path.resolve(patchPath);

        // Read existing patch file if no content provided
        if (patchContent === undefined) {
            if (!fs.existsSync(patchFileAbs)) {
                throw new Error(`Patch file does not exist: ${patchPath}`);
            }
            patchContent = await fs.promises.readFile(patchFileAbs, 'utf-8');
        }

        // Determine working directory
        const workDir = this._determineWorkDir(patchFileAbs, patchContent);

        // Write patch content to file if provided
        let writeMsg: string | undefined;
        if (patchContent !== undefined) {
            writeMsg = await this.writePatchFile(patchPath, patchContent);
        }

        // Apply the patch
        const applyMsg = await this._applyPatch(patchFileAbs, workDir);

        if (writeMsg) {
            return `${writeMsg}. ${applyMsg}.`;
        }
        return `Successfully applied existing patch file ${patchPath}. ${applyMsg}.\n${warningMsg}`;
    }

    /**
     * Validate patch format
     */
    private _validatePatchFormat(patchContent: string): void {
        if (!patchContent.trim()) {
            throw new Error('Patch content is empty.');
        }

        const lines = patchContent.split('\n');

        // Check for essential format elements
        const hasMinusLine = lines.slice(0, 50).some(line => line.startsWith('--- '));
        const hasPlusLine = lines.slice(0, 50).some(line => line.startsWith('+++ '));
        const hasHunkHeader = lines.slice(0, 100).some(line => /^@@ -\d+,\d+ \+\d+,\d+ @@/.test(line));

        if (!(hasMinusLine && hasPlusLine)) {
            throw new Error(
                "Patch does not appear to be in standard unified diff format. " +
                "Expected lines starting with '--- ' and '+++ '."
            );
        }

        if (!hasHunkHeader) {
            throw new Error(
                "Patch does not contain valid hunk headers (lines starting with '@@'). " +
                "Example: '@@ -1,2 +1,2 @@'"
            );
        }
    }

    /**
     * Convert git diff format to unified diff format
     */
    private _convertGitDiffToUnifiedDiff(patchContent: string): string {
        const lines = patchContent.split('\n');
        const convertedLines: string[] = [];

        const skipPrefixes = [
            'diff --git',
            'index ',
            'new file mode',
            'old file mode',
            'deleted file mode',
            'rename from',
            'rename to',
            'similarity index',
            'copy from',
            'copy to',
        ];

        for (const line of lines) {
            // Skip git-specific headers
            if (skipPrefixes.some(prefix => line.startsWith(prefix))) {
                continue;
            }

            // Convert file paths from git format
            if (line.startsWith('--- a/')) {
                const filePath = line.slice(6).split('\t')[0];
                convertedLines.push(`--- ${filePath}`);
            } else if (line.startsWith('+++ b/')) {
                const filePath = line.slice(6).split('\t')[0];
                convertedLines.push(`+++ ${filePath}`);
            } else {
                convertedLines.push(line);
            }
        }

        return convertedLines.join('\n');
    }

    /**
     * Extract target file path from patch content
     */
    private _extractTargetFile(patchContent: string): string | null {
        for (const line of patchContent.split('\n')) {
            if (line.startsWith('+++ b/')) {
                return line.slice(6).split('\t')[0];
            } else if (line.startsWith('+++ ') && !line.startsWith('+++ /dev/null')) {
                return line.slice(4).split('\t')[0];
            }
        }
        return null;
    }

    /**
     * Determine working directory for applying patch
     */
    private _determineWorkDir(patchFileAbs: string, patchContent: string): string {
        const patchDir = path.dirname(patchFileAbs) || process.cwd();
        const defaultWorkDir = path.resolve(patchDir);

        const targetFile = this._extractTargetFile(patchContent);
        if (!targetFile || targetFile === '/dev/null') {
            return defaultWorkDir;
        }

        // Search for target file
        const searchDirs = [process.cwd(), patchDir];
        for (const searchDir of searchDirs) {
            const candidate = path.join(searchDir, targetFile);
            if (fs.existsSync(candidate)) {
                return path.dirname(candidate);
            }
        }

        return defaultWorkDir;
    }

    /**
     * Apply patch using patch command or manual fallback
     */
    private async _applyPatch(patchFileAbs: string, workDir: string): Promise<string> {
        // Try patch command first
        try {
            const result = await this._executePatchCommand(patchFileAbs, workDir);
            if (result.exitCode === 0) {
                return `Successfully applied patch using patch command${result.stdout ? ': ' + result.stdout : ''}`;
            }
        } catch (error) {
            logger.debug(`Patch command failed: ${error}`);
        }

        // Try manual application as fallback
        const manualResult = await this._applyPatchManually(patchFileAbs, workDir);
        if (manualResult) {
            return manualResult;
        }

        throw new Error(
            `Failed to apply patch ${patchFileAbs}. ` +
            `Working directory: ${workDir}. ` +
            'Both patch command and manual application failed. ' +
            'Please check: 1) patch format is correct, 2) target file exists, 3) line numbers match the file content.'
        );
    }

    /**
     * Execute patch command
     */
    private _executePatchCommand(patchFileAbs: string, workDir: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            const patchProcess = spawn('patch', ['--batch', '-p1', '-i', patchFileAbs], {
                cwd: workDir,
            });

            let stdout = '';
            let stderr = '';

            patchProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            patchProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            patchProcess.on('close', (code) => {
                resolve({
                    exitCode: code || 0,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                });
            });

            patchProcess.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Manually apply patch by parsing unified diff format
     */
    private async _applyPatchManually(patchFileAbs: string, workDir: string): Promise<string | null> {
        try {
            const patchContent = await fs.promises.readFile(patchFileAbs, 'utf-8');

            const targetFile = this._extractTargetFile(patchContent);
            if (!targetFile || targetFile === '/dev/null') {
                return null;
            }

            const targetPath = path.join(workDir, targetFile);
            const targetDir = path.dirname(targetPath);

            if (!fs.existsSync(targetDir)) {
                await fs.promises.mkdir(targetDir, { recursive: true });
            }

            // Read existing file or start with empty
            let fileLines: string[] = [];
            if (fs.existsSync(targetPath)) {
                const content = await fs.promises.readFile(targetPath, 'utf-8');
                fileLines = content.split('\n');
            }

            // Parse and apply hunks
            const resultLines = [...fileLines];
            const lines = patchContent.split('\n');
            let inHunk = false;
            let oldLineNum = 0;
            let newLineNum = 0;

            const skipPrefixes = ['diff --git', 'new file mode', 'index ', '---', '+++'];

            for (const line of lines) {
                // Hunk header
                const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
                if (hunkMatch) {
                    inHunk = true;
                    oldLineNum = parseInt(hunkMatch[1], 10) - 1;
                    newLineNum = parseInt(hunkMatch[3], 10) - 1;
                    continue;
                }

                if (skipPrefixes.some(prefix => line.startsWith(prefix))) {
                    continue;
                }

                if (!inHunk) {
                    continue;
                }

                if (line.startsWith(' ')) {
                    // Context line
                    if (oldLineNum < resultLines.length) {
                        oldLineNum++;
                    }
                    newLineNum++;
                } else if (line.startsWith('-')) {
                    // Delete line
                    if (oldLineNum < resultLines.length) {
                        resultLines.splice(oldLineNum, 1);
                    }
                } else if (line.startsWith('+')) {
                    // Add line
                    resultLines.splice(newLineNum, 0, line.slice(1));
                    newLineNum++;
                }
            }

            // Write result
            await fs.promises.writeFile(targetPath, resultLines.join('\n'), 'utf-8');

            return 'Successfully applied patch manually by parsing and applying changes';
        } catch (error) {
            logger.debug(`Manual patch application failed: ${error}`);
            return null;
        }
    }
}
