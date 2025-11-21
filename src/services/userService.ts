import * as vscode from 'vscode';
import * as os from 'os';

export interface UserInfo {
    email: string;
    name?: string;
    source: 'manual' | 'system' | 'git-config';
}

export class UserService {
    private cachedUserInfo?: UserInfo;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Get user email with auto-configuration fallback mechanism
     */
    public async getUserEmail(): Promise<string> {
        // Check cache first
        if (this.cachedUserInfo) {
            return this.cachedUserInfo.email;
        }

        // Step 1: Check manual configuration first (highest priority)
        // Once set in specDrivenDevelopment.userEmail, use it directly
        const manualEmail = vscode.workspace.getConfiguration('specDrivenDevelopment').get<string>('userEmail');
        if (manualEmail && this.isValidEmail(manualEmail) && this.isCiscoEmail(manualEmail)) {
            console.log('[SDD:User] INFO | Using configured email');
            this.cachedUserInfo = {
                email: manualEmail,
                source: 'manual'
            };
            return manualEmail;
        } else if (manualEmail && this.isValidEmail(manualEmail) && !this.isCiscoEmail(manualEmail)) {
            console.warn(`[SDD:User] WARN | Manual email ${manualEmail} is not a cisco address - trying Git config instead`);
        }

        // Step 2: Try Git configuration (no API calls needed)
        console.log('[SDD:User] INFO | Trying Git user configuration...');
        try {
            const gitEmail = await this.getGitUserEmail();
            if (gitEmail && this.isValidEmail(gitEmail)) {
                if (this.isCiscoEmail(gitEmail)) {
                    console.log('[SDD:User] INFO | Valid @cisco.com email found, auto-configuring...', gitEmail);
                    
                    // AUTO-SAVE to VS Code settings (prevents future Git config checks)
                    await vscode.workspace.getConfiguration('specDrivenDevelopment').update(
                        'userEmail', 
                        gitEmail, 
                        vscode.ConfigurationTarget.Global
                    );
                    
                    console.log('[SDD:User] INFO | ✅ Email auto-configured from Git settings!');
                    this.cachedUserInfo = {
                        email: gitEmail,
                        source: 'git-config'
                    };
                    
                    // Show success notification
                    vscode.window.showInformationMessage(
                        `✅ Email auto-configured from Git: ${gitEmail}`
                    );
                    
                    return gitEmail;
                } else {
                    console.warn(`[SDD:User] WARN | Found Git email "${gitEmail}" but it's not @cisco.com - ignoring`);
                }
            } else if (gitEmail) {
                console.warn(`[SDD:User] WARN | Found Git email "${gitEmail}" but it's not valid format - ignoring`);
            } else {
                console.log('[SDD:User] INFO | No Git email found in configuration');
            }
        } catch (error) {
            console.warn('[SDD:User] WARN | Failed to get Git user email:', error);
        }

        // Step 3: No Git config found or not @cisco.com, prompt for manual configuration
        // Keep prompting until user configures email (email is mandatory)
        console.log('[SDD:User] INFO | No valid Git email found, prompting for manual configuration...');
        
        // Loop until email is configured
        while (true) {
            // Show notification with button (cleaner than modal)
            const action = await vscode.window.showWarningMessage(
                '⚠️ Email configuration required. Please configure your Cisco email to continue.',
                'Configure Email Now'
            );
            
            if (action === 'Configure Email Now') {
                // Prompt for email input
                const emailInput = await vscode.window.showInputBox({
                    prompt: 'Enter your Cisco email address',
                    placeHolder: 'your.name@cisco.com',
                    ignoreFocusOut: true, // Prevent closing when clicking outside
                    validateInput: (value: string) => {
                        if (!value) {
                            return 'Email is required';
                        }
                        
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRegex.test(value)) {
                            if (!value.includes('@')) {
                                return 'Please include @ in your email address';
                            }
                            if (!value.includes('.')) {
                                return 'Please include a domain (e.g., @cisco.com)';
                            }
                            return 'Please enter a valid email format';
                        }
                        
                        if (!value.toLowerCase().endsWith('@cisco.com')) {
                            return 'Please use your @cisco.com email address';
                        }
                        
                        return null;
                    }
                });
                
                if (emailInput) {
                    // Save the email and return it
                    await vscode.workspace.getConfiguration('specDrivenDevelopment').update(
                        'userEmail',
                        emailInput,
                        vscode.ConfigurationTarget.Global
                    );
                    
                    console.log(`[SDD:User] INFO | ✅ Email configured: ${emailInput}`);
                    this.cachedUserInfo = {
                        email: emailInput,
                        source: 'manual'
                    };
                    
                    vscode.window.showInformationMessage(
                        `✅ Email configured: ${emailInput}`
                    );
                    
                    return emailInput;
                }
                // If user cancelled input, loop back to show notification again
                console.log('[SDD:User] INFO | Email input cancelled, prompting again...');
            }
        }
    }



    /**
     * Get user email from local Git configuration (no API calls needed)
     */
    private async getGitUserEmail(): Promise<string | null> {
        try {
            // Method 1: Use VS Code Git extension API
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension && gitExtension.isActive) {
                const git = gitExtension.exports;
                const api = git.getAPI(1);
                
                if (api && api.repositories && api.repositories.length > 0) {
                    const repo = api.repositories[0];
                    if (repo && repo.rootUri) {
                        try {
                            // Get Git config from the repository
                            const config = await vscode.workspace.fs.readFile(
                                vscode.Uri.joinPath(repo.rootUri, '.git', 'config')
                            );
                            const configText = Buffer.from(config).toString('utf8');
                            
                            // Parse git config for user.email
                            const emailMatch = configText.match(/^\s*email\s*=\s*(.+)$/m);
                            if (emailMatch && emailMatch[1]) {
                                const email = emailMatch[1].trim();
                                console.log('[SDD:User] INFO | Found Git config email:', email);
                                return email;
                            }
                        } catch (error) {
                            console.warn('[SDD:User] WARN | Could not read .git/config file:', error);
                        }
                    }
                }
            }

            // Method 2: Try global Git configuration
            const globalGitEmail = await this.getGlobalGitConfig();
            if (globalGitEmail) {
                return globalGitEmail;
            }

            // Method 3: Use VS Code terminal to run git config command
            const gitConfigEmail = await this.runGitConfigCommand();
            if (gitConfigEmail) {
                return gitConfigEmail;
            }

            console.log('[SDD:User] INFO | No Git user email found in configuration');
            return null;
            
        } catch (error) {
            console.error('[SDD:User] ERROR | Failed to get Git user email:', error);
            return null;
        }
    }

    /**
     * Get email from global Git configuration
     */
    private async getGlobalGitConfig(): Promise<string | null> {
        try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            
            // Try global git configuration
            const { stdout } = await execAsync('git config --global user.email', { 
                timeout: 3000 // 3 second timeout
            });
            
            const email = stdout.trim();
            if (email && this.isValidEmail(email)) {
                console.log('[SDD:User] INFO | Found global Git user.email:', email);
                return email;
            }
            
            return null;
            
        } catch (error) {
            console.warn('[SDD:User] WARN | Global git config failed (normal if git not configured):', (error as Error).message);
            return null;
        }
    }

    /**
     * Run git config command to get user email using child_process
     */
    private async runGitConfigCommand(): Promise<string | null> {
        try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            
            // Get the workspace folder to run git command in
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
            
            const { stdout } = await execAsync('git config user.email', { 
                cwd,
                timeout: 5000 // 5 second timeout
            });
            
            const email = stdout.trim();
            if (email && this.isValidEmail(email)) {
                console.log('[SDD:User] INFO | Found Git user.email via command:', email);
                return email;
            }
            
            return null;
            
        } catch (error) {
            console.warn('[SDD:User] WARN | Git config command failed (normal if no git repo):', (error as Error).message);
            return null;
        }
    }

    /**
     * Get system-based email (fallback) - now returns clear placeholder
     */
    private getSystemEmail(): string {
        // Instead of using system username which can be confusing (like "user@cisco.com"),
        // return a clear placeholder that indicates configuration is needed
        return 'user@company.com';
    }

    /**
     * Validate email format
     */
    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate that email is from @cisco.com domain
     */
    private isCiscoEmail(email: string): boolean {
        return email.toLowerCase().endsWith('@cisco.com');
    }

    /**
     * Prompt user to configure email
     */
    private async promptUserToConfigureEmail(): Promise<void> {
        const action = await vscode.window.showWarningMessage(
            'User email not configured. Using system-generated email for JIRA queries. Would you like to configure your email?',
            'Configure Email',
            'Dismiss'
        );

        if (action === 'Configure Email') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'specDrivenDevelopment.userEmail');
        }
    }

    /**
     * Get full user info
     */
    public async getUserInfo(): Promise<UserInfo> {
        const email = await this.getUserEmail();
        return this.cachedUserInfo || { email, source: 'system' };
    }

    /**
     * Extract username from email (part before @)
     */
    public async getUsernameFromEmail(): Promise<string> {
        const email = await this.getUserEmail();
        const username = email.split('@')[0];
        return username;
    }

    /**
     * Clear cached user info (useful for testing or re-authentication)
     */
    public clearCache(): void {
        this.cachedUserInfo = undefined;
    }

    /**
     * Manually set user email (for testing or override)
     */
    public setUserEmail(email: string): void {
        if (this.isValidEmail(email)) {
            this.cachedUserInfo = {
                email,
                source: 'manual'
            };
        }
    }

    public dispose(): void {
        this.cachedUserInfo = undefined;
    }
}
