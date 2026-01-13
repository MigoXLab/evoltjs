import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { tools } from './toolRegister';
import { ToolExecutionError } from '../types';

// Helper function to safely quote shell arguments
function quote(str: string): string {
    if (/^[a-zA-Z0-9_\-.\/]+$/.test(str)) {
        return str;
    }
    // Replace single quotes with '"'"' (close quote, literal single quote, open quote)
    // This is the standard way to escape single quotes inside single-quoted strings in bash
    return `'${str.replace(/'/g, "'\\''")}'`;
}

const gitToolConfig = {
    init: {
        description: 'Initialize a git repository.',
        params: [
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'bare',
                type: 'boolean',
                description: 'Create a bare repository',
                optional: true,
            },
            {
                name: 'initialBranch',
                type: 'string',
                description: 'Initial branch name',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Initialization result' },
    },
    status: {
        description: 'View git repository status, showing changes in working directory and staging area.',
        params: [
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Output of git status' },
    },
    add: {
        description: 'Add files to staging area.',
        params: [
            {
                name: 'files',
                type: 'string',
                description: 'File paths to add, can be single file, multiple files (space separated), "." (all files) or path patterns',
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Operation result description' },
    },
    commit: {
        description: 'Commit changes in staging area.',
        params: [
            { name: 'message', type: 'string', description: 'Commit message' },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'allowEmpty',
                type: 'boolean',
                description: 'Whether to allow empty commits, default False',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: {
            type: 'string',
            description: 'Commit result, including commit hash and change statistics',
        },
    },
    push: {
        description: 'Push local commits to remote repository.',
        params: [
            {
                name: 'remote',
                type: 'string',
                description: 'Remote repository name, defaults to origin',
                optional: true,
            },
            {
                name: 'branch',
                type: 'string',
                description: 'Branch name to push, defaults to current branch',
                optional: true,
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'force',
                type: 'boolean',
                description: 'Whether to force push, default False',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Push result description' },
    },
    pull: {
        description: 'Pull latest changes from remote repository.',
        params: [
            {
                name: 'remote',
                type: 'string',
                description: 'Remote repository name, defaults to origin',
                optional: true,
            },
            {
                name: 'branch',
                type: 'string',
                description: 'Branch name to pull, defaults to current branch',
                optional: true,
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Pull result description' },
    },
    checkout: {
        description: 'Switch branch or checkout files.',
        params: [
            {
                name: 'target',
                type: 'string',
                description: 'Target branch name or file path',
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'createBranch',
                type: 'boolean',
                description: "Whether to create new branch if target doesn't exist, default True",
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Checkout result description' },
    },
    branch: {
        description: 'List all branches or create/delete branch.',
        params: [
            {
                name: 'name',
                type: 'string',
                description: 'Branch name, lists all branches if None',
                optional: true,
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'delete',
                type: 'boolean',
                description: 'Whether to delete branch, default False',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Branch operation result' },
    },
    log: {
        description: 'View commit history.',
        params: [
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'maxCount',
                type: 'integer',
                description: 'Maximum number of commits to show',
                optional: true,
            },
            {
                name: 'oneline',
                type: 'boolean',
                description: 'Whether to show in oneline format, default False',
                optional: true,
            },
            {
                name: 'filePath',
                type: 'string',
                description: 'View commit history for specific file',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Commit history' },
    },
    diff: {
        description: 'View file differences.',
        params: [
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'staged',
                type: 'boolean',
                description: 'Whether to view staged changes, default False',
                optional: true,
            },
            {
                name: 'filePath',
                type: 'string',
                description: 'View diff for specific file',
                optional: true,
            },
            {
                name: 'commit1',
                type: 'string',
                description: 'First commit hash or branch name',
                optional: true,
            },
            {
                name: 'commit2',
                type: 'string',
                description: 'Second commit hash or branch name',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Diff content' },
    },
    remote: {
        description: 'Manage remote repositories.',
        params: [
            {
                name: 'action',
                type: 'string',
                description: 'Action type: "list", "add", "remove", "set-url", default "list"',
                optional: true,
            },
            {
                name: 'name',
                type: 'string',
                description: 'Remote repository name, usually "origin"',
                optional: true,
            },
            {
                name: 'url',
                type: 'string',
                description: 'Remote repository URL (for add or set-url)',
                optional: true,
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Operation result' },
    },
    clone: {
        description: 'Clone remote repository to local.',
        params: [
            { name: 'url', type: 'string', description: 'Remote repository URL' },
            {
                name: 'directory',
                type: 'string',
                description: 'Local directory name, defaults to repository name if None',
                optional: true,
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Clone result description' },
    },
    fetch: {
        description: 'Fetch latest changes from remote without merging.',
        params: [
            {
                name: 'remote',
                type: 'string',
                description: 'Remote repository name, defaults to origin',
                optional: true,
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Fetch result description' },
    },
    merge: {
        description: 'Merge specified branch into current branch.',
        params: [
            { name: 'branch', type: 'string', description: 'Branch name to merge' },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory, defaults to current directory if None',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Merge result description' },
    },
    show: {
        description: 'Show detailed information about git objects (commits, tags, trees, etc).',
        params: [
            {
                name: 'object',
                type: 'string',
                description: 'Object to show (commit hash, tag, branch, etc.), defaults to HEAD',
                optional: true,
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory',
                optional: true,
            },
            {
                name: 'stat',
                type: 'boolean',
                description: 'Show status info',
                optional: true,
            },
            {
                name: 'nameOnly',
                type: 'boolean',
                description: 'Show only filenames',
                optional: true,
            },
            {
                name: 'format',
                type: 'string',
                description: 'Custom format string',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Object details' },
    },
    tag: {
        description: 'Create, list or delete tags.',
        params: [
            {
                name: 'name',
                type: 'string',
                description: 'Tag name, lists all tags if None',
                optional: true,
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory',
                optional: true,
            },
            {
                name: 'message',
                type: 'string',
                description: 'Tag message',
                optional: true,
            },
            {
                name: 'delete',
                type: 'boolean',
                description: 'Delete tag',
                optional: true,
            },
            {
                name: 'listAll',
                type: 'boolean',
                description: 'List all tags',
                optional: true,
            },
            {
                name: 'annotate',
                type: 'boolean',
                description: 'Create annotated tag',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Tag operation result' },
    },
    revert: {
        description: 'Revert existing commits.',
        params: [
            {
                name: 'commit',
                type: 'string',
                description: 'Commit hash to revert',
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory',
                optional: true,
            },
            {
                name: 'noCommit',
                type: 'boolean',
                description: 'Revert changes but do not commit',
                optional: true,
            },
            {
                name: 'noEdit',
                type: 'boolean',
                description: 'Do not edit commit message, default True',
                optional: true,
            },
            {
                name: 'mainline',
                type: 'integer',
                description: 'Mainline parent number for merge commits',
                optional: true,
            },
            {
                name: 'config',
                type: 'object',
                description: 'Git config options {key: value}',
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'Revert result' },
    },
};

@tools(gitToolConfig)
export class GitTool {
    /**
     * Helper method to execute git commands.
     */
    private async _executeGitCommand(
        command: string,
        cwd?: string,
        timeout: number = 30000,
        config?: Record<string, string>
    ): Promise<string> {
        const workDir = cwd || process.cwd();
        if (!fs.existsSync(workDir)) {
            throw new ToolExecutionError(`工作目录不存在: ${workDir}`);
        }

        // Check if it's a git repository (init and clone methods do not require check)
        const gitDir = path.join(workDir, '.git');
        const isInitOrClone = command.includes('clone') || command.includes('init');

        if (!fs.existsSync(gitDir) && !isInitOrClone) {
            throw new ToolExecutionError(`当前目录不是 git 仓库: ${workDir}`);
        }

        // Build git command with config options
        let gitCmd = 'git';
        if (config) {
            for (const [key, value] of Object.entries(config)) {
                gitCmd += ` -c ${key}=${quote(value)}`;
            }
        }
        gitCmd += ` ${command}`;

        return new Promise((resolve, reject) => {
            exec(gitCmd, { cwd: workDir, timeout, encoding: 'utf-8' }, (error, stdout, stderr) => {
                const stdoutText = stdout ? stdout.trim() : '';
                const stderrText = stderr ? stderr.trim() : '';

                if (error) {
                    // Check for timeout explicitly
                    if ((error as any).signal === 'SIGTERM') {
                        reject(new ToolExecutionError(`Git 命令执行超时（超过 ${timeout / 1000} 秒）`));
                        return;
                    }

                    const errorMsg = stderrText || stdoutText || error.message;
                    reject(new ToolExecutionError(`Git 命令执行失败: ${errorMsg}`));
                    return;
                }

                resolve(stdoutText || '命令执行成功，无输出');
            });
        });
    }

    /**
     * Get current branch name.
     */
    private async _getCurrentBranch(cwd?: string, config?: Record<string, string>): Promise<string> {
        const result = await this._executeGitCommand('rev-parse --abbrev-ref HEAD', cwd, 30000, config);
        return result.trim();
    }

    async init(cwd?: string, bare: boolean = false, initialBranch?: string, config?: Record<string, string>): Promise<string> {
        let command = 'init';
        if (bare) command += ' --bare';
        if (initialBranch) command += ` --initial-branch=${initialBranch}`;

        const result = await this._executeGitCommand(command, cwd, 30000, config);
        return `Git 仓库初始化完成\n${result}`;
    }

    async status(cwd?: string, config?: Record<string, string>): Promise<string> {
        return await this._executeGitCommand('status', cwd, 30000, config);
    }

    async add(files: string, cwd?: string, config?: Record<string, string>): Promise<string> {
        // files can be "." multiple files etc.
        const result = await this._executeGitCommand(`add ${files}`, cwd, 30000, config);
        return `成功将文件添加到暂存区: ${files}\n${result}`;
    }

    async commit(message: string, cwd?: string, allowEmpty: boolean = false, config?: Record<string, string>): Promise<string> {
        const allowEmptyFlag = allowEmpty ? ' --allow-empty' : '';
        // Use quote() helper for proper shell escaping
        const result = await this._executeGitCommand(`commit -m ${quote(message)}${allowEmptyFlag}`, cwd, 30000, config);
        return `提交成功\n${result}`;
    }

    async push(
        remote: string = 'origin',
        branch?: string,
        cwd?: string,
        force: boolean = false,
        config?: Record<string, string>
    ): Promise<string> {
        const targetBranch = branch || (await this._getCurrentBranch(cwd, config));
        const forceFlag = force ? ' --force' : '';
        const result = await this._executeGitCommand(`push${forceFlag} ${remote} ${targetBranch}`, cwd, 60000, config);
        return `成功推送到 ${remote}/${targetBranch}\n${result}`;
    }

    async pull(remote: string = 'origin', branch?: string, cwd?: string, config?: Record<string, string>): Promise<string> {
        const targetBranch = branch || (await this._getCurrentBranch(cwd, config));
        const result = await this._executeGitCommand(`pull ${remote} ${targetBranch}`, cwd, 60000, config);
        return `成功从 ${remote}/${targetBranch} 拉取更改\n${result}`;
    }

    async checkout(target: string, cwd?: string, createBranch: boolean = true, config?: Record<string, string>): Promise<string> {
        const createFlag = createBranch ? ' -b' : '';
        const result = await this._executeGitCommand(`checkout${createFlag} ${target}`, cwd, 30000, config);
        return `成功切换到 ${target}\n${result}`;
    }

    async branch(name?: string, cwd?: string, deleteBranch: boolean = false, config?: Record<string, string>): Promise<string> {
        if (!name) {
            const result = await this._executeGitCommand('branch -a', cwd, 30000, config);
            return `所有分支列表:\n${result}`;
        } else if (deleteBranch) {
            const result = await this._executeGitCommand(`branch -d ${name}`, cwd, 30000, config);
            return `成功删除分支 ${name}\n${result}`;
        } else {
            const result = await this._executeGitCommand(`branch ${name}`, cwd, 30000, config);
            return `成功创建分支 ${name}\n${result}`;
        }
    }

    async log(
        cwd?: string,
        maxCount?: number,
        oneline: boolean = false,
        filePath?: string,
        config?: Record<string, string>
    ): Promise<string> {
        let command = 'log';
        if (oneline) command += ' --oneline';
        if (maxCount) command += ` -${maxCount}`;
        if (filePath) command += ` -- ${filePath}`;

        const result = await this._executeGitCommand(command, cwd, 30000, config);
        return `提交历史:\n${result}`;
    }

    async diff(
        cwd?: string,
        staged: boolean = false,
        filePath?: string,
        commit1?: string,
        commit2?: string,
        config?: Record<string, string>
    ): Promise<string> {
        let command = 'diff';
        if (staged) command += ' --staged';
        if (commit1 && commit2) {
            command += ` ${commit1} ${commit2}`;
        } else if (commit1) {
            command += ` ${commit1}`;
        }
        if (filePath) command += ` -- ${filePath}`;

        const result = await this._executeGitCommand(command, cwd, 30000, config);
        return `差异内容:\n${result}`;
    }

    async remote(action: string = 'list', name?: string, url?: string, cwd?: string, config?: Record<string, string>): Promise<string> {
        if (action === 'list') {
            const result = await this._executeGitCommand('remote -v', cwd, 30000, config);
            return `远程仓库列表:\n${result}`;
        } else if (action === 'add') {
            if (!name || !url) throw new ToolExecutionError('添加远程仓库需要提供 name 和 url 参数');
            const result = await this._executeGitCommand(`remote add ${name} ${url}`, cwd, 30000, config);
            return `成功添加远程仓库 ${name}: ${url}\n${result}`;
        } else if (action === 'remove') {
            if (!name) throw new ToolExecutionError('删除远程仓库需要提供 name 参数');
            const result = await this._executeGitCommand(`remote remove ${name}`, cwd, 30000, config);
            return `成功删除远程仓库 ${name}\n${result}`;
        } else if (action === 'set-url') {
            if (!name || !url) throw new ToolExecutionError('设置远程仓库 URL 需要提供 name 和 url 参数');
            const result = await this._executeGitCommand(`remote set-url ${name} ${url}`, cwd, 30000, config);
            return `成功设置远程仓库 ${name} 的 URL 为 {url}\n${result}`;
        } else {
            throw new ToolExecutionError(`不支持的操作类型: ${action}，支持的操作: list, add, remove, set-url`);
        }
    }

    async clone(url: string, directory?: string, cwd?: string, config?: Record<string, string>): Promise<string> {
        const workDir = cwd || process.cwd();
        let command = `clone ${url}`;
        if (directory) command += ` ${directory}`;

        // clone takes time, set timeout to 120s
        const result = await this._executeGitCommand(command, workDir, 120000, config);
        return `成功克隆仓库 ${url}\n${result}`;
    }

    async fetch(remote: string = 'origin', cwd?: string, config?: Record<string, string>): Promise<string> {
        const result = await this._executeGitCommand(`fetch ${remote}`, cwd, 60000, config);
        return `成功从 ${remote} 获取更新\n${result}`;
    }

    async merge(branch: string, cwd?: string, config?: Record<string, string>): Promise<string> {
        const noFfFlag = '';
        const result = await this._executeGitCommand(`merge${noFfFlag} ${branch}`, cwd, 30000, config);
        return `成功合并分支 ${branch}\n${result}`;
    }

    async show(
        object?: string,
        cwd?: string,
        stat: boolean = false,
        nameOnly: boolean = false,
        format?: string,
        config?: Record<string, string>
    ): Promise<string> {
        let command = 'show';
        if (object) command += ` ${object}`;
        if (stat) command += ' --stat';
        if (nameOnly) command += ' --name-only';
        if (format) command += ` --format=${format}`;

        const result = await this._executeGitCommand(command, cwd, 30000, config);
        return `显示对象信息:\n${result}`;
    }

    async tag(
        name?: string,
        cwd?: string,
        message?: string,
        deleteTag: boolean = false,
        listAll: boolean = false,
        annotate: boolean = false,
        config?: Record<string, string>
    ): Promise<string> {
        if (!name) {
            let command = 'tag';
            if (listAll) command += ' -l';
            const result = await this._executeGitCommand(command, cwd, 30000, config);
            return `标签列表:\n${result}`;
        } else if (deleteTag) {
            const result = await this._executeGitCommand(`tag -d ${name}`, cwd, 30000, config);
            return `成功删除标签 ${name}\n${result}`;
        } else {
            let command = 'tag';
            if (annotate || message) command += ' -a';
            if (message) command += ` -m ${quote(message)}`;
            command += ` ${name}`;
            const result = await this._executeGitCommand(command, cwd, 30000, config);
            return `成功创建标签 ${name}\n${result}`;
        }
    }

    async revert(
        commit: string,
        cwd?: string,
        noCommit: boolean = false,
        noEdit: boolean = true,
        mainline?: number,
        config?: Record<string, string>
    ): Promise<string> {
        let command = 'revert';
        if (noCommit) command += ' --no-commit';
        if (noEdit) command += ' --no-edit';
        if (mainline) command += ` -m ${mainline}`;
        command += ` ${commit}`;

        const result = await this._executeGitCommand(command, cwd, 30000, config);
        return `成功撤销提交 ${commit}\n${result}`;
    }
}
