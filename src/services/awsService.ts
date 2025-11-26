import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from '../config/config';

const execAsync = promisify(exec);

export interface AWSConnectionStatus {
    connected: boolean;
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    account?: string;
    region?: string;
    profile?: string;
    secretsManagerAccess?: boolean;
    sessionExpiry?: string;
    error?: string;
}

export interface SalesforceCredentials {
    client_id: string;
    client_secret: string;
    username: string;
    password: string;
    security_token?: string;
}

export class AWSService {
    private context: vscode.ExtensionContext;
    private currentProfile: string;
    private currentRegion: string;
    private selectedProfile: string = ''; // Stores the profile that successfully connected
    private salesforceCredentials?: SalesforceCredentials;
    private connectionStatus: AWSConnectionStatus = {
        connected: false,
        status: 'disconnected'
    };
    private connectionLog: string[] = []; // Track connection steps for debugging

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.currentProfile = this.getConfiguredProfile();
        this.currentRegion = this.getConfiguredRegion();
        // Restore selected profile from previous session
        this.selectedProfile = this.context.globalState.get<string>('specDrivenDevelopment.awsSelectedProfile', '');
    }

    /**
     * Log connection steps for debugging
     */
    private logConnectionStep(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[SDD:AWS] ${level.toUpperCase()} | [${timestamp}] ${message}`;
        this.connectionLog.push(logMessage);
        console.log(logMessage);
        
        // Don't show error messages to user here - let the command handler do it
    }

    /**
     * Get connection log for debugging
     */
    public getConnectionLog(): string[] {
        return this.connectionLog;
    }

    /**
     * Clear connection log
     */
    public clearConnectionLog(): void {
        this.connectionLog = [];
    }

    /**
     * Provide troubleshooting suggestions based on error message
     */
    private provideTroubleshootingSuggestions(errorMessage: string): void {
        this.logConnectionStep('=== Troubleshooting Suggestions ===', 'warn');
        
        if (errorMessage.includes('credentials not found') || errorMessage.includes('access_key')) {
            this.logConnectionStep('⚠ AWS credentials issue detected:', 'warn');
            this.logConnectionStep(`  • Check if AWS CLI is configured: run 'aws configure list'`, 'warn');
            this.logConnectionStep(`  • Current profile: "${this.currentProfile || 'default'}"`, 'warn');
            this.logConnectionStep(`  • Try running: 'aws configure --profile ${this.currentProfile || 'default'}'`, 'warn');
        }
        
        if (errorMessage.includes('region')) {
            this.logConnectionStep('⚠ AWS region issue detected:', 'warn');
            this.logConnectionStep(`  • Current region: "${this.currentRegion || 'not set - using AWS CLI default'}"`, 'warn');
            this.logConnectionStep(`  • Common regions: us-east-1, us-west-2, eu-west-1`, 'warn');
            this.logConnectionStep(`  • Update in .env file: SALESFORCE_SECRET_NAME=your-secret-name`, 'warn');
            this.logConnectionStep(`  • Or VS Code settings: specDrivenDevelopment.awsRegion`, 'warn');
        }
        
        if (errorMessage.includes('secret')) {
            this.logConnectionStep('⚠ Secrets Manager issue detected:', 'warn');
            this.logConnectionStep(`  • Secret name: "${this.getConfiguredSalesforceSecretName()}"`, 'warn');
            this.logConnectionStep(`  • Region: "${this.currentRegion || 'AWS CLI default'}"`, 'warn');
            this.logConnectionStep(`  • Try listing secrets: 'aws secretsmanager list-secrets --region ${this.currentRegion || 'us-east-1'}'`, 'warn');
        }
        
        if (errorMessage.includes('Access Denied') || errorMessage.includes('UnauthorizedException')) {
            this.logConnectionStep('⚠ Permission issue detected:', 'warn');
            this.logConnectionStep(`  • Current IAM user/role may lack Secrets Manager permissions`, 'warn');
            this.logConnectionStep(`  • Required permission: secretsmanager:GetSecretValue`, 'warn');
            this.logConnectionStep(`  • Required permission: secretsmanager:ListSecrets`, 'warn');
        }
    }

    private getConfiguredProfile(): string {
        const configuredProfile = vscode.workspace.getConfiguration('specDrivenDevelopment').get('awsProfile', '');
        return configuredProfile || ''; // Empty string means use default AWS CLI profile
    }

    private getConfiguredRegion(): string {
        const configuredRegion = vscode.workspace.getConfiguration('specDrivenDevelopment').get('awsRegion', '');
        return configuredRegion || ''; // Empty string means use default AWS CLI region
    }

    /**
     * Check if AWS CLI is installed
     */
    private async checkAWSCliInstalled(): Promise<boolean> {
        try {
            await execAsync('aws --version');
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if connected to AWS
     */
    public async isConnected(): Promise<boolean> {
        return this.connectionStatus.connected;
    }

    /**
     * Get connection timestamp
     */
    public async getConnectionTime(): Promise<string | undefined> {
        return this.connectionStatus.sessionExpiry;
    }

    /**
     * Get the selected AWS profile
     */
    public getSelectedProfile(): string {
        return this.selectedProfile;
    }

    private readFromEnvFile(key: string): string | undefined {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) return undefined;
            
            const envPath = path.join(workspaceRoot, '.env');
            if (!fs.existsSync(envPath)) return undefined;
            
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const lines = envContent.split('\n');
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith(`${key}=`)) {
                    const value = trimmedLine.substring(`${key}=`.length);
                    // Remove quotes if present
                    return value.replace(/^["']|["']$/g, '');
                }
            }
            
            return undefined;
        } catch (error) {
            console.warn(`[SDD:AWS] WARN | Failed to read .env file: ${(error as Error).message}`);
            return undefined;
        }
    }

    private getConfiguredSalesforceSecretName(): string {
        // Priority: .env file > VS Code settings > config.ts default
        const envValue = this.readFromEnvFile('SALESFORCE_SECRET_NAME');
        if (envValue) return envValue;
        
        const configuredSecret = vscode.workspace.getConfiguration('specDrivenDevelopment').get('salesforceSecretName', '');
        return configuredSecret || CONFIG.aws.secretsManager.defaultSecretName;
    }

    private buildAwsCommand(baseCommand: string, profile?: string, region?: string): string {
        let command = baseCommand;
        // Priority: explicit profile param > selectedProfile > currentProfile (config)
        const useProfile = profile || this.selectedProfile || this.currentProfile;
        const useRegion = region || this.currentRegion;
        
        if (useProfile && useProfile !== 'default') {
            command += ` --profile ${useProfile}`;
        }
        if (useRegion) {
            command += ` --region ${useRegion}`;
        }
        command += ' --output json';
        
        return command;
    }

    public async connectToAWS(): Promise<AWSConnectionStatus> {
        this.clearConnectionLog();
        this.logConnectionStep('=== Starting AWS Connection ===');
        
        try {
            // Show progress indicator with simplified message
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Connecting to AWS",
                cancellable: false
            }, async (progress) => {
                
                // Check if already connected
                if (this.connectionStatus.connected) {
                    const reconnect = await vscode.window.showWarningMessage(
                        'Already connected to AWS. Do you want to refresh credentials?',
                        'Yes', 'No'
                    );
                    if (reconnect !== 'Yes') {
                        this.logConnectionStep('User chose not to refresh existing connection');
                        return this.connectionStatus;
                    }
                    this.logConnectionStep('Refreshing existing AWS connection');
                }

                progress.report({ increment: 10, message: "Validating credentials..." });
                this.logConnectionStep('Step 1/5: Checking AWS CLI installation...');

                // 1. Check AWS CLI installation
                const isInstalled = await this.checkAWSCliInstalled();
                if (!isInstalled) {
                    const errorMsg = 'AWS CLI is not installed. Please install it from: https://aws.amazon.com/cli/';
                    this.logConnectionStep(errorMsg, 'error');
                    throw new Error(errorMsg);
                }
                this.logConnectionStep('✓ AWS CLI is installed');

                progress.report({ increment: 30, message: "Authenticating..." });
                this.logConnectionStep('Step 2/5: Validating AWS credentials...');

                // Log configured profile and region
                const profileMsg = this.currentProfile || 'default';
                const regionMsg = this.currentRegion || 'AWS CLI default';
                this.logConnectionStep(`Configured AWS Profile: "${profileMsg}"`);
                this.logConnectionStep(`Configured AWS Region: "${regionMsg}"`);

                // 2. Test AWS credentials with profile priority
                try {
                    this.selectedProfile = await this.testAWSCliWithProfiles();
                    this.logConnectionStep(`✓ Successfully authenticated with profile: "${this.selectedProfile}"`);
                    console.log(`[SDD:AWS] INFO | Selected AWS profile: ${this.selectedProfile}`);
                } catch (error: any) {
                    this.logConnectionStep(`❌ Authentication failed: ${error.message}`, 'error');
                    this.provideTroubleshootingSuggestions(error.message);
                    throw new Error(error.message);
                }

                progress.report({ increment: 50, message: "Fetching credentials..." });
                this.logConnectionStep('Step 3/5: Fetching AWS account information...');

                const callerIdentity = await this.getAWSCallerIdentity();
                this.logConnectionStep(`✓ Connected to AWS Account: ${callerIdentity.Account}`);
                
                // Get actual region being used if not configured
                let actualRegion = this.currentRegion;
                if (!actualRegion) {
                    try {
                        const regionCommand = this.buildAwsCommand('aws configure get region');
                        const { stdout: regionOutput } = await execAsync(regionCommand);
                        actualRegion = regionOutput.trim() || 'us-east-1'; // Default to us-east-1 if not set
                    } catch {
                        actualRegion = 'us-east-1'; // Default to us-east-1 on error
                    }
                }
                this.logConnectionStep(`✓ Active Region: ${actualRegion}`);
                
                progress.report({ increment: 50, message: "Searching for Salesforce credentials..." });
                this.logConnectionStep('Step 4/5: Searching for Salesforce credentials in Secrets Manager...');

                // Try to fetch Salesforce credentials, but don't fail if they're not found
                let salesforceCredentialsAvailable = false;
                let credentialError: string | undefined;
                try {
                    this.salesforceCredentials = await this.fetchSalesforceCredentials();
                    
                    progress.report({ increment: 80, message: "Validating credentials..." });
                    this.logConnectionStep('Step 5/5: Validating Salesforce credentials...');
                    
                    // 4. Robust validation
                    this.validateSalesforceCredentials(this.salesforceCredentials);
                    salesforceCredentialsAvailable = true;
                    this.logConnectionStep('✓ Successfully validated Salesforce credentials');
                } catch (credError) {
                    const errorMsg = (credError as Error).message;
                    this.logConnectionStep(`⚠ Salesforce credentials issue: ${errorMsg}`, 'warn');
                    console.warn(`[SDD:AWS] WARN | Salesforce credentials not available: ${errorMsg}`);
                    credentialError = errorMsg;
                    // Continue without Salesforce credentials - they can be fetched later if needed
                }

                progress.report({ increment: 90, message: "Saving connection state..." });
                this.logConnectionStep('Saving connection state...');
                
                // 5. Update connection state
                this.connectionStatus = {
                    connected: true,
                    status: 'connected',
                    account: callerIdentity.Account,
                    region: actualRegion,
                    profile: this.selectedProfile, // Use the profile that actually worked
                    secretsManagerAccess: true,
                    sessionExpiry: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
                    error: salesforceCredentialsAvailable ? undefined : `Salesforce credentials not found - ${credentialError}`
                };

                await this.context.globalState.update('specDrivenDevelopment.awsStatus', this.connectionStatus);
                await this.context.globalState.update('specDrivenDevelopment.awsConnectionTime', new Date().toISOString());
                await this.context.globalState.update('specDrivenDevelopment.awsSelectedProfile', this.selectedProfile);

                progress.report({ increment: 100, message: "Connected!" });
                this.logConnectionStep('=== AWS Connection Successful ===');

                return this.connectionStatus;
            });
        } catch (error) {
            const errorMessage = (error as Error).message;
            this.logConnectionStep(`❌ Connection failed: ${errorMessage}`, 'error');
            
            const errorStatus: AWSConnectionStatus = {
                connected: false,
                status: 'error',
                error: errorMessage
            };
            this.connectionStatus = errorStatus;
            throw error;
        }
    }

    public async refreshConnection(): Promise<AWSConnectionStatus> {
        return await this.connectToAWS();
    }

    public getConnectionStatus(): AWSConnectionStatus {
        return this.connectionStatus;
    }

    /**
     * Enhanced connection status that validates secret content for Salesforce credentials
     */
    public async checkEnhancedConnectionStatus(): Promise<{
        awsConnected: boolean;
        secretExists: boolean;
        secretValid: boolean;
        missingFields?: string[];
        availableFields?: string[];
        errorMessage?: string;
        secretName?: string;
    }> {
        try {
            // Check AWS connectivity first
            await this.testAWSCliCredentials();
            
            // Get the configured secret name
            const secretName = this.getConfiguredSalesforceSecretName();
            
            try {
                // Try to fetch the secret
                const command = this.buildAwsCommand(`aws secretsmanager get-secret-value --secret-id "${secretName}"`);
                const { stdout } = await execAsync(command);
                const result = JSON.parse(stdout);
                
                if (!result.SecretString) {
                    return {
                        awsConnected: true,
                        secretExists: true,
                        secretValid: false,
                        secretName,
                        errorMessage: `Secret '${secretName}' exists but has no string value`
                    };
                }
                
                const secretData = JSON.parse(result.SecretString);
                
                // Validate required Salesforce fields
                const requiredFields = ['client_id', 'client_secret', 'username', 'password'];
                const availableFields = Object.keys(secretData);
                const missingFields = requiredFields.filter(field => !secretData[field]);
                
                if (missingFields.length > 0) {
                    return {
                        awsConnected: true,
                        secretExists: true,
                        secretValid: false,
                        missingFields,
                        availableFields,
                        secretName,
                        errorMessage: `Secret '${secretName}' exists but missing Salesforce fields: ${missingFields.join(', ')}. Found fields: ${availableFields.join(', ')}`
                    };
                }

                // Secret is valid
                return {
                    awsConnected: true,
                    secretExists: true,
                    secretValid: true,
                    secretName,
                    availableFields
                };

            } catch (secretError: any) {
                if (secretError.message && secretError.message.includes('ResourceNotFoundException')) {
                    return {
                        awsConnected: true,
                        secretExists: false,
                        secretValid: false,
                        secretName,
                        errorMessage: `Secret '${secretName}' not found in AWS Secrets Manager`
                    };
                } else {
                    return {
                        awsConnected: true,
                        secretExists: false,
                        secretValid: false,
                        secretName,
                        errorMessage: `Failed to access secret '${secretName}': ${secretError.message}`
                    };
                }
            }

        } catch (error: any) {
            return {
                awsConnected: false,
                secretExists: false,
                secretValid: false,
                errorMessage: `AWS connection failed: ${error.message}`
            };
        }
    }

    public async getRealTimeConnectionStatus(): Promise<AWSConnectionStatus> {
        try {
            await this.testAWSCliCredentials();
            return this.connectionStatus;
        } catch (error) {
            // Check if it's an expired token error
            if (this.isExpiredTokenError(error)) {
                this.handleExpiredTokenError();
                this.connectionStatus = {
                    connected: false,
                    status: 'error',
                    error: 'AWS session token expired'
                };
            } else {
                this.connectionStatus = {
                    connected: false,
                    status: 'error',
                    error: 'AWS credentials expired or invalid'
                };
            }
            this.salesforceCredentials = undefined;
            await this.context.globalState.update('specDrivenDevelopment.awsStatus', this.connectionStatus);
            return this.connectionStatus;
        }
    }

    /**
     * Test AWS CLI credentials with profile priority: default → development → dev
     * Returns the profile name that works
     */
    private async testAWSCliWithProfiles(): Promise<string> {
        // Build profile priority list
        const profiles: string[] = [];
        
        // Add configured profile first if set
        if (this.currentProfile) {
            profiles.push(this.currentProfile);
        }
        
        // Add standard fallback profiles (avoid duplicates)
        ['default', 'development', 'dev'].forEach(p => {
            if (!profiles.includes(p)) {
                profiles.push(p);
            }
        });

        let lastError = '';
        let hasExpiredToken = false;

        for (const profile of profiles) {
            try {
                const command = profile === 'default' 
                    ? 'aws sts get-caller-identity'
                    : `aws sts get-caller-identity --profile ${profile}`;
                
                await execAsync(command);
                console.log(`[SDD:AWS] INFO | Successfully connected using profile: ${profile}`);
                
                // Warn if not using configured profile
                if (this.currentProfile && profile !== this.currentProfile) {
                    vscode.window.showWarningMessage(
                        `Configured profile "${this.currentProfile}" failed. Using fallback profile: ${profile}`
                    );
                }
                
                return profile;
            } catch (error: any) {
                lastError = error.message;
                
                // Detect expired session token errors (Cisco Duo SSO)
                if (error.message.includes('ExpiredToken') || 
                    error.message.includes('InvalidClientTokenId') ||
                    error.message.includes('token has expired')) {
                    hasExpiredToken = true;
                }
                
                continue;
            }
        }

        // If we detected an expired token, show Cisco Duo SSO specific error
        if (hasExpiredToken) {
            throw new Error(
                `AWS session token expired.\n\n` +
                `For Cisco Duo SSO users:\n` +
                `  1. Run 'duo-auth' to refresh your session\n` +
                `  2. Or re-authenticate through your SSO portal\n\n` +
                `For standard AWS users:\n` +
                `  Run 'aws configure' to update your credentials.`
            );
        }

        // None of the profiles worked
        throw new Error(
            `No AWS profiles configured.\n` +
            `Tried: ${profiles.map(p => `[${p}]`).join(', ')}\n\n` +
            `Run 'aws configure' to set up credentials or 'duo-auth' for Cisco SSO.`
        );
    }

    private async testAWSCliCredentials(): Promise<void> {
        let command = 'aws configure list';
        if (this.currentProfile) {
            command += ` --profile ${this.currentProfile}`;
        }
        const { stdout } = await execAsync(command);
        if (!stdout.includes('access_key') || !stdout.includes('secret_key')) {
            const profileMsg = this.currentProfile ? ` for profile: ${this.currentProfile}` : ' for default profile';
            throw new Error(`AWS CLI credentials not found${profileMsg}`);
        }
    }

    private async getAWSCallerIdentity(): Promise<{Account: string}> {
        const command = this.buildAwsCommand('aws sts get-caller-identity');
        const { stdout } = await execAsync(command);
        const identity = JSON.parse(stdout.trim());
        return { Account: identity.Account };
    }

    private async fetchSalesforceCredentials(): Promise<SalesforceCredentials> {
        try {
            // Add more detailed logging for debugging
            const profileMsg = this.currentProfile ? ` profile: ${this.currentProfile}` : ' default profile';
            const regionMsg = this.currentRegion ? ` region: ${this.currentRegion}` : ' default region';
            const configuredSecretName = this.getConfiguredSalesforceSecretName();
            
            this.logConnectionStep(`Searching for Salesforce secret: "${configuredSecretName}"`);
            this.logConnectionStep(`Using${profileMsg},${regionMsg}`);
            console.log(`[SDD:AWS] INFO | Looking for Salesforce secret: "${configuredSecretName}" in${profileMsg},${regionMsg}`);
            
            const listCommand = this.buildAwsCommand('aws secretsmanager list-secrets');
            const { stdout: listOutput } = await execAsync(listCommand);
            const secretsList = JSON.parse(listOutput.trim());
            
            this.logConnectionStep(`Found ${secretsList.SecretList.length} total secrets in Secrets Manager`);
            console.log(`[SDD:AWS] INFO | Found ${secretsList.SecretList.length} secrets total`);
            
            // Log available secrets for debugging
            if (secretsList.SecretList.length > 0) {
                this.logConnectionStep('Available secrets:');
                secretsList.SecretList.forEach((secret: any) => {
                    this.logConnectionStep(`  • ${secret.Name}`);
                });
            }
            
            // First, look for exact match with configured secret name
            let salesforceSecret = secretsList.SecretList.find((secret: any) => 
                secret.Name.toLowerCase() === configuredSecretName.toLowerCase()
            );
            
            if (salesforceSecret) {
                this.logConnectionStep(`✓ Found exact match: "${salesforceSecret.Name}"`);
            }
            
            // If exact match not found, try partial match with configured secret name
            if (!salesforceSecret) {
                this.logConnectionStep(`Exact match not found, trying partial match for "${configuredSecretName}"...`);
                salesforceSecret = secretsList.SecretList.find((secret: any) => 
                    secret.Name.toLowerCase().includes(configuredSecretName.toLowerCase())
                );
                
                if (salesforceSecret) {
                    this.logConnectionStep(`✓ Found partial match: "${salesforceSecret.Name}"`);
                }
            }
            
            if (!salesforceSecret) {
                const availableSecrets = secretsList.SecretList.map((s: any) => s.Name);
                const errorMsg = `No Salesforce secret found matching "${configuredSecretName}" in${regionMsg}`;
                this.logConnectionStep(errorMsg, 'error');
                this.logConnectionStep(`Available secrets (${availableSecrets.length}): ${availableSecrets.join(', ') || 'None'}`, 'error');
                
                throw new Error(
                    `${errorMsg}. ` +
                    `Available secrets: ${availableSecrets.join(', ') || 'None'}. ` +
                    `Update "specDrivenDevelopment.salesforceSecretName" or create a secret with the configured name.`
                );
            }
            
            this.logConnectionStep(`Retrieving secret value for: "${salesforceSecret.Name}"`);
            console.log(`[SDD:AWS] INFO | Using secret: ${salesforceSecret.Name}`);
            const secretName = salesforceSecret.Name;
            const command = this.buildAwsCommand(`aws secretsmanager get-secret-value --secret-id "${secretName}"`);
            const { stdout } = await execAsync(command);
            const secretResponse = JSON.parse(stdout.trim());
            
            if (!secretResponse.SecretString) {
                throw new Error('Secret does not contain string data');
            }
            
            // Clean up the secret string to handle common formatting issues
            let secretString = secretResponse.SecretString;
            
            // Fix common issues: trailing commas, Windows line endings
            secretString = secretString
                .replace(/\r\n/g, '\n')  // Convert Windows line endings
                .replace(/,(\s*[}\]])/g, '$1');  // Remove trailing commas before closing brackets/braces
            
            const credentials = JSON.parse(secretString);
            
            this.logConnectionStep(`✓ Successfully parsed Salesforce credentials`);
            this.logConnectionStep(`  • Username: ${credentials.username}`);
            this.logConnectionStep(`  • Has client_id: ${!!credentials.client_id}`);
            this.logConnectionStep(`  • Has client_secret: ${!!credentials.client_secret}`);
            this.logConnectionStep(`  • Has password: ${!!credentials.password}`);
            
            if (!credentials.client_id || !credentials.client_secret || !credentials.username || !credentials.password) {
                const missingFields: string[] = [];
                if (!credentials.client_id) missingFields.push('client_id');
                if (!credentials.client_secret) missingFields.push('client_secret');
                if (!credentials.username) missingFields.push('username');
                if (!credentials.password) missingFields.push('password');
                
                throw new Error(
                    `Salesforce secret '${secretName}' is missing required fields: ${missingFields.join(', ')}. ` +
                    `Found fields: ${Object.keys(credentials).join(', ')}`
                );
            }
            
            return {
                client_id: credentials.client_id,
                client_secret: credentials.client_secret,
                username: decodeURIComponent(credentials.username),
                password: decodeURIComponent(credentials.password),
                security_token: credentials.security_token
            };
        } catch (error) {
            // Check if it's an expired token error
            if (this.isExpiredTokenError(error)) {
                this.handleExpiredTokenError();
                throw new Error('AWS session token expired. Please refresh your credentials.');
            }
            this.logConnectionStep(`Failed to fetch Salesforce credentials: ${(error as Error).message}`, 'error');
            throw new Error(`Failed to fetch Salesforce credentials: ${(error as Error).message}`);
        }
    }

    /**
     * Validate Salesforce credentials structure and format
     */
    private validateSalesforceCredentials(credentials: SalesforceCredentials): void {
        const required = ['client_id', 'client_secret', 'username', 'password'];
        const missing = required.filter(field => !(credentials as any)[field]);
        
        if (missing.length > 0) {
            throw new Error(
                `Invalid Salesforce credentials. Missing fields: ${missing.join(', ')}`
            );
        }

        // Validate username format (should be an email)
        if (!credentials.username.includes('@')) {
            throw new Error('Salesforce username must be a valid email address');
        }

        // Validate client_id and client_secret are not empty
        if (credentials.client_id.trim().length === 0) {
            throw new Error('client_id cannot be empty');
        }

        if (credentials.client_secret.trim().length === 0) {
            throw new Error('client_secret cannot be empty');
        }
    }

    /**
     * Check if an AWS error is due to expired session token (Cisco Duo SSO)
     */
    private isExpiredTokenError(error: any): boolean {
        const errorMessage = error.message || error.toString();
        return errorMessage.includes('ExpiredToken') || 
               errorMessage.includes('InvalidClientTokenId') ||
               errorMessage.includes('token has expired') ||
               errorMessage.includes('security token included in the request is expired');
    }

    /**
     * Handle expired token errors with user-friendly notifications
     */
    private handleExpiredTokenError(): void {
        vscode.window.showErrorMessage(
            '🔐 AWS session token expired',
            'Refresh Session',
            'Dismiss'
        ).then(selection => {
            if (selection === 'Refresh Session') {
                vscode.window.showInformationMessage(
                    'For Cisco Duo SSO users:\n' +
                    '  1. Run "duo-auth" in your terminal\n' +
                    '  2. Or re-authenticate through your SSO portal\n\n' +
                    'For standard AWS users:\n' +
                    '  Run "aws configure" to update credentials',
                    'Copy duo-auth Command'
                ).then(choice => {
                    if (choice === 'Copy duo-auth Command') {
                        vscode.env.clipboard.writeText('duo-auth');
                        vscode.window.showInformationMessage('Command copied to clipboard!');
                    }
                });
            }
        });
    }

    public getSalesforceCredentials(): SalesforceCredentials | undefined {
        return this.salesforceCredentials;
    }

    public async retryFetchSalesforceCredentials(region?: string, profile?: string): Promise<{success: boolean; error?: string}> {
        try {
            const oldProfile = this.currentProfile;
            const oldRegion = this.currentRegion;
            
            if (profile) this.currentProfile = profile;
            if (region) this.currentRegion = region;
            
            this.salesforceCredentials = await this.fetchSalesforceCredentials();
            
            // Update connection status to reflect successful credentials fetch
            if (this.connectionStatus.connected) {
                this.connectionStatus.error = undefined;
                await this.context.globalState.update('specDrivenDevelopment.awsStatus', this.connectionStatus);
            }
            
            return { success: true };
        } catch (error) {
            // Restore original values if failed
            return { 
                success: false, 
                error: `Failed to fetch Salesforce credentials from ${region || this.currentRegion}: ${(error as Error).message}` 
            };
        }
    }

    public async listAvailableSecrets(region?: string, profile?: string): Promise<{secrets: string[]; region: string; profile: string}> {
        try {
            const testProfile = profile || this.currentProfile;
            const testRegion = region || this.currentRegion;
            
            const listCommand = this.buildAwsCommand('aws secretsmanager list-secrets', testProfile, testRegion);
            const { stdout: listOutput } = await execAsync(listCommand);
            const secretsList = JSON.parse(listOutput.trim());
            
            return {
                secrets: secretsList.SecretList.map((s: any) => s.Name),
                region: testRegion || 'default',
                profile: testProfile || 'default'
            };
        } catch (error) {
            return {
                secrets: [],
                region: region || this.currentRegion || 'default',
                profile: profile || this.currentProfile || 'default'
            };
        }
    }

    public async disconnect(): Promise<void> {
        this.connectionStatus = { connected: false, status: 'disconnected' };
        this.selectedProfile = ''; // Clear selected profile
        await this.context.globalState.update('specDrivenDevelopment.awsStatus', undefined);
        await this.context.globalState.update('specDrivenDevelopment.awsConnectionTime', undefined);
        await this.context.globalState.update('specDrivenDevelopment.awsSelectedProfile', undefined);
        this.salesforceCredentials = undefined;
    }

    public dispose(): void {
        this.salesforceCredentials = undefined;
    }
}
