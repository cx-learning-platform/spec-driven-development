import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Configuration manager that handles both environment variables and VS Code settings
 */
export class ConfigurationManager {
    private static instance: ConfigurationManager;
    private envVars: { [key: string]: string } = {};
    private loaded = false;

    private constructor() {
        this.loadEnvironmentVariables();
    }

    public static getInstance(): ConfigurationManager {
        if (!ConfigurationManager.instance) {
            ConfigurationManager.instance = new ConfigurationManager();
        }
        return ConfigurationManager.instance;
    }

    /**
     * Load environment variables from .env file if it exists
     */
    private loadEnvironmentVariables(): void {
        if (this.loaded) return;

        try {
            // Look for .env file in extension root
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                console.warn('No workspace folder found for environment variables');
                return;
            }

            const envPath = path.join(workspaceFolders[0].uri.fsPath, '.env');
            
            if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf8');
                this.parseEnvironmentFile(envContent);
                console.log('✅ Environment variables loaded from .env file');
            } else {
                console.log('ℹ️ No .env file found, using defaults and VS Code settings');
            }
        } catch (error) {
            console.warn('⚠️ Failed to load environment variables:', error);
        }

        this.loaded = true;
    }

    /**
     * Parse .env file content
     */
    private parseEnvironmentFile(content: string): void {
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Skip comments and empty lines
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }

            // Parse KEY=VALUE pairs
            const equalIndex = trimmedLine.indexOf('=');
            if (equalIndex > 0) {
                const key = trimmedLine.substring(0, equalIndex).trim();
                const value = trimmedLine.substring(equalIndex + 1).trim()
                    .replace(/^["']/, '') // Remove leading quotes
                    .replace(/["']$/, ''); // Remove trailing quotes
                
                this.envVars[key] = value;
            }
        }
    }

    /**
     * Get configuration value with fallback priority:
     * 1. Environment variable
     * 2. VS Code setting
     * 3. Default value
     */
    public get<T>(key: string, vscodeSettingPath?: string, defaultValue?: T): T {
        // Try environment variable first
        const envKey = key.toUpperCase().replace(/[.-]/g, '_');
        if (this.envVars[envKey] !== undefined) {
            return this.parseValue(this.envVars[envKey]) as T;
        }

        // Try process.env
        if (process.env[envKey] !== undefined) {
            return this.parseValue(process.env[envKey]!) as T;
        }

        // Try VS Code setting
        if (vscodeSettingPath) {
            const vscodeConfig = vscode.workspace.getConfiguration('vibeAssistant');
            const vscodeValue = vscodeConfig.get(vscodeSettingPath) as T;
            if (vscodeValue !== undefined) {
                return vscodeValue;
            }
        }

        // Return default value
        return defaultValue as T;
    }

    /**
     * Parse string values to appropriate types
     */
    private parseValue(value: string): any {
        // Boolean values
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;

        // Numeric values
        if (!isNaN(Number(value)) && value.trim() !== '') {
            return Number(value);
        }

        // Array values (comma-separated)
        if (value.includes(',')) {
            return value.split(',').map(v => v.trim());
        }

        // String values
        return value;
    }

    /**
     * Get API endpoint configurations
     */
    public getApiEndpoints() {
        return {
            github: {
                baseUrl: this.get('GITHUB_API_BASE_URL', undefined, 'https://api.github.com'),
                repoOwner: this.get('GITHUB_REPO_OWNER', undefined, 'Relanto-LKM-POC'),
                repoName: this.get('GITHUB_REPO_NAME', undefined, 'gen-ai-vibe-code-plugin'),
                issuesEndpoint: this.get('GITHUB_ISSUES_ENDPOINT', undefined, 
                    'https://api.github.com/repos/Relanto-LKM-POC/gen-ai-vibe-code-plugin/issues')
            },
            feedback: {
                github: this.get('FEEDBACK_GITHUB_ENDPOINT', undefined,
                    'https://api.github.com/repos/Relanto-LKM-POC/gen-ai-vibe-code-plugin/issues'),
                internal: this.get('FEEDBACK_INTERNAL_ENDPOINT', undefined,
                    'https://api.internal-tracker.example.com/feedback'),
                analytics: this.get('FEEDBACK_ANALYTICS_ENDPOINT', undefined,
                    'https://analytics.vibe-tech.com/feedback')
            },
            salesforce: {
                authUrl: this.get('SALESFORCE_AUTH_URL', undefined,
                    'https://test.salesforce.com/services/oauth2/token'),
                baseUrl: this.get('SALESFORCE_BASE_URL', undefined,
                    'https://ciscolearningservices--secqa.sandbox.my.salesforce-setup.com')
            }
        };
    }

    /**
     * Get documentation URLs
     */
    public getDocumentationUrls() {
        return {
            readme: this.get('GITHUB_REPO_README_URL', undefined,
                'https://github.com/vibe-tech/vibe-code-assistant#readme'),
            tokenSettings: this.get('GITHUB_TOKEN_SETTINGS_URL', undefined,
                'https://github.com/settings/tokens')
        };
    }

    /**
     * Get AWS configuration
     */
    public getAwsConfig() {
        return {
            profile: this.get('AWS_PROFILE', 'awsProfile', ''),
            region: this.get('AWS_REGION', 'awsRegion', ''),
            salesforceSecretName: this.get('SALESFORCE_SECRET_NAME', 'salesforceSecretName', ''),
            salesforceSecretKeywords: this.get('SALESFORCE_SECRET_KEYWORDS', 'salesforceSecretKeywords', 
                ['salesforce', 'sf', 'crm', 'sales', 'force'])
        };
    }

    /**
     * Get service configuration
     */
    public getServiceConfig() {
        return {
            enableAutoDocumentParsing: this.get('ENABLE_AUTO_DOCUMENT_PARSING', 'enableAutoDocumentParsing', false),
            showEstimationNotifications: this.get('SHOW_ESTIMATION_NOTIFICATIONS', 'showEstimationNotifications', true),
            enableFeedbackAnalytics: this.get('ENABLE_FEEDBACK_ANALYTICS', undefined, true),
            feedbackTimeoutMs: this.get('FEEDBACK_TIMEOUT_MS', undefined, 30000),
            debugMode: this.get('DEBUG_MODE', undefined, false),
            logLevel: this.get('LOG_LEVEL', undefined, 'info')
        };
    }

    /**
     * Get GitHub token (always from VS Code secure storage)
     */
    public getGitHubToken(): string {
        const config = vscode.workspace.getConfiguration('vibeAssistant');
        return config.get('githubToken', '');
    }

    /**
     * Set GitHub token (always to VS Code secure storage)
     */
    public async setGitHubToken(token: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('vibeAssistant');
        await config.update('githubToken', token, vscode.ConfigurationTarget.Global);
    }

    /**
     * Refresh configuration (reload environment variables)
     */
    public refresh(): void {
        this.loaded = false;
        this.envVars = {};
        this.loadEnvironmentVariables();
    }

    /**
     * Get all loaded environment variables (for debugging)
     */
    public getLoadedEnvVars(): { [key: string]: string } {
        return { ...this.envVars };
    }
}

// Export singleton instance
export const config = ConfigurationManager.getInstance();