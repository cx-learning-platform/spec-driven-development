import * as vscode from 'vscode';

/**
 * GitService - Handles Git repository operations
 * Extracts repository information from workspace using VS Code Git Extension API
 */
export class GitService {
    /**
     * Get the repository name from the current workspace's Git remote URL
     * @returns Repository name (e.g., "gen-ai-n8n-workflow-manager") or null if not available
     */
    static async getRepositoryName(): Promise<string | null> {
        try {
            // Get workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                console.log('[SDD:Git] INFO | No workspace folder found');
                return null;
            }

            // Get Git extension
            const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
            if (!gitExtension) {
                console.log('[SDD:Git] INFO | Git extension not found');
                return null;
            }

            // Get Git API
            const git = gitExtension.getAPI(1);
            if (!git) {
                console.log('[SDD:Git] INFO | Git API not available');
                return null;
            }

            // Find repository for the workspace folder
            const repository = git.repositories.find((repo: any) => 
                repo.rootUri.fsPath === workspaceFolder.uri.fsPath
            );

            if (!repository) {
                console.log('[SDD:Git] INFO | No Git repository found in workspace');
                return null;
            }

            // Get remote configuration
            const remotes = repository.state.remotes;
            if (!remotes || remotes.length === 0) {
                console.log('[SDD:Git] INFO | No Git remotes configured');
                return null;
            }

            // Find 'origin' remote (most common)
            const origin = remotes.find((remote: any) => remote.name === 'origin');
            const gitUrl = origin?.fetchUrl || origin?.pushUrl || remotes[0]?.fetchUrl || remotes[0]?.pushUrl;

            if (!gitUrl) {
                console.log('[SDD:Git] INFO | No Git remote URL found');
                return null;
            }

            console.log('[SDD:Git] INFO | Git remote URL:', gitUrl);

            // Extract repository name from URL
            // Handles various Git URL formats:
            // - https://github.com/owner/repo-name.git
            // - git@github.com:owner/repo-name.git
            // - https://github.com/owner/repo-name
            const match = gitUrl.match(/\/([^\/]+?)(\.git)?$/);
            const repoName = match ? match[1] : null;

            if (repoName) {
                console.log('[SDD:Git] INFO | Extracted repository name:', repoName);
            } else {
                console.warn('[SDD:Git] WARN | Could not extract repository name from URL:', gitUrl);
            }

            return repoName;

        } catch (error) {
            console.error('[SDD:Git] ERROR | Error getting repository name:', error);
            return null;
        }
    }

    /**
     * Get the full Git remote URL for the workspace
     * @returns Remote URL or null if not available
     */
    static async getRemoteUrl(): Promise<string | null> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return null;

            const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
            if (!gitExtension) return null;

            const git = gitExtension.getAPI(1);
            if (!git) return null;

            const repository = git.repositories.find((repo: any) => 
                repo.rootUri.fsPath === workspaceFolder.uri.fsPath
            );

            if (!repository) return null;

            const remotes = repository.state.remotes;
            const origin = remotes?.find((remote: any) => remote.name === 'origin');
            
            return origin?.fetchUrl || origin?.pushUrl || null;

        } catch (error) {
            console.error('[SDD:Git] ERROR | Error getting remote URL:', error);
            return null;
        }
    }

    /**
     * Get the workspace folder path
     * @returns Workspace folder path or null
     */
    static getWorkspaceFolderPath(): string | null {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        return workspaceFolder?.uri.fsPath || null;
    }

    /**
     * Check if the workspace has a Git repository initialized
     * @returns true if Git repository exists, false otherwise
     */
    static async hasGitRepository(): Promise<boolean> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return false;

            const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
            if (!gitExtension) return false;

            const git = gitExtension.getAPI(1);
            if (!git) return false;

            const repository = git.repositories.find((repo: any) => 
                repo.rootUri.fsPath === workspaceFolder.uri.fsPath
            );

            return !!repository;

        } catch (error) {
            console.error('[SDD:Git] ERROR | Error checking Git repository:', error);
            return false;
        }
    }
}
