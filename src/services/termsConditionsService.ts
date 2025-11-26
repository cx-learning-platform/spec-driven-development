import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { UserService } from './userService';
import { GitService } from './gitService';
import { FeedbackService } from './feedbackService';
import { CONFIG, getSalesforceApiUrl } from '../config/config';

export interface BillOfMaterialsPayload {
    user_email: string;
    repository_name: string;
    application_name: string;
    timestamp: string;
    bill_of_materials: string[];
}

export interface UserConsentPayload {
    user_email: string;
    consent_status: 'agree' | 'disagree';
    extension_version: string;
}

export interface TCStorageState {
    lastTCAcceptanceTimestamp?: number;
    lastConsentStatus?: 'agree' | 'disagree';
    lastBillOfMaterials?: string[];
    lastRepositoryName?: string;
    lastApplicationName?: string;
    lastExtensionVersion?: string;
    lastPeriodicDisplayTimestamp?: number;
}

export class TermsConditionsService {
    private context: vscode.ExtensionContext;
    private userService: UserService;
    private feedbackService: FeedbackService;
    private periodicCollectionInterval: NodeJS.Timeout | undefined;
    private isShowingTCPopup: boolean = false;

    constructor(context: vscode.ExtensionContext, userService: UserService, feedbackService: FeedbackService) {
        this.context = context;
        this.userService = userService;
        this.feedbackService = feedbackService;
    }

    /**
     * Check if T&C popup should be shown based on trigger conditions
     */
    async shouldShowTCPopup(): Promise<boolean> {
        try {
            const lastConsentStatus = this.context.workspaceState.get<'agree' | 'disagree' | undefined>('tc.lastConsentStatus');
            const lastTimestamp = this.context.workspaceState.get<number>('tc.lastAcceptanceTimestamp', 0);
            const currentTime = Date.now();

            // First-time user - never shown before
            if (!lastConsentStatus) {
                console.log('[SDD:T&C] INFO | T&C never shown - will display');
                return true;
            }

            // User disagreed - ask again after 3 days
            if (lastConsentStatus === 'disagree') {
                const timeSinceDisagreed = currentTime - lastTimestamp;
                if (timeSinceDisagreed >= CONFIG.termsAndConditions.timing.disagreedRetryInterval) {
                    console.log('[SDD:T&C] INFO | 3 days passed since user disagreed - will ask again');
                    return true;
                }
                const daysRemaining = Math.ceil((CONFIG.termsAndConditions.timing.disagreedRetryInterval - timeSinceDisagreed) / (24 * 60 * 60 * 1000));
                console.log(`[SDD:T&C] INFO | User disagreed ${daysRemaining} day(s) ago - will not show T&C yet`);
                return false;
            }

            // User agreed - ask for re-consent after 30 days
            if (lastConsentStatus === 'agree') {
                const timeSinceAgreed = currentTime - lastTimestamp;
                if (timeSinceAgreed >= CONFIG.termsAndConditions.timing.agreedReminderInterval) {
                    console.log('[SDD:T&C] INFO | 30 days passed since user agreed - will ask for re-consent');
                    return true;
                }
                console.log('[SDD:T&C] INFO | User agreed recently - periodic collection is active');
                return false;
            }

            return false;

        } catch (error) {
            console.error('[SDD:T&C] ERROR | Failed to check if T&C should be shown:', error);
            return false;
        }
    }

    /**
     * Show Terms & Conditions popup and handle user response
     */
    async showTCPopup(): Promise<'agree' | 'disagree' | undefined> {
        const result = await vscode.window.showInformationMessage(
            'Terms & Conditions',
            {
                modal: true,
                detail: 'By using this extension, you acknowledge that certain metadata will be securely shared with the DevSecOps Hub to enable feature tracking, work management, and analytics.\n\nInformation Collected:\n\n• Repository Metadata: Repository name, branch information, and Git commit details used for automatic feature association and tracking.\n\n• Work Item Data: Feature descriptions, estimations, task details, and work types submitted through the extension to create and manage JIRA tickets in the Hub.\n\n• Bill of Materials: Automatically detected configuration files and tooling artifacts for compliance validation.\n\n• User Information: Your name and email (from Git configuration) to associate work items with the correct team member.\n\n• Consent Status: Your acceptance or revocation of these terms.\n\nAll data is transmitted securely to the Hub and handled in accordance with organizational security policies. This data is used exclusively for work tracking, compliance reporting, and improving the developer experience.\n\nDo you accept these Terms & Conditions and consent to the collection of metadata described above?'
            },
            'Agree',
            'Disagree'
        );

        if (result === 'Agree') {
            return 'agree';
        } else if (result === 'Disagree') {
            return 'disagree';
        }
        return undefined;
    }

    /**
     * Process user consent and send telemetry
     */
    async processUserConsent(consentStatus: 'agree' | 'disagree'): Promise<void> {
        try {
            console.log(`[SDD:T&C] INFO | Processing user consent: ${consentStatus}`);

            // Get user email with validation (Fix #3)
            let userEmail: string;
            try {
                userEmail = await this.getUserEmail();
            } catch (emailError) {
                vscode.window.showErrorMessage(
                    `Cannot process consent: ${(emailError as Error).message}. Please run "Configure User Email" command.`
                );
                return;
            }
            const repositoryName = await this.getRepositoryName();
            const applicationName = await this.getApplicationName(false); // Interactive mode
            const extensionVersion = this.getExtensionVersion();
            
            // Detect bill of materials only if user agrees
            let billOfMaterials: string[] = [];
            if (consentStatus === 'agree') {
                billOfMaterials = await this.detectBillOfMaterials();
                console.log('[SDD:T&C] INFO | Collected Bill of Materials:', billOfMaterials);
            } else {
                console.log('[SDD:T&C] INFO | User disagreed - Bill of Materials will be empty');
            }

            // Get current timestamp in ISO format
            const timestamp = new Date().toISOString();

            // Send to Salesforce Hub
            const billOfMaterialsArray = await this.sendUserDetailsToSalesforce(
                userEmail,
                consentStatus,
                extensionVersion,
                repositoryName,
                applicationName,
                billOfMaterials,
                timestamp
            );

            // Update internal state
            await this.updateStorageState({
                lastTCAcceptanceTimestamp: Date.now(),
                lastConsentStatus: consentStatus,
                lastBillOfMaterials: billOfMaterials,
                lastRepositoryName: repositoryName,
                lastApplicationName: applicationName,
                lastExtensionVersion: extensionVersion,
                lastPeriodicDisplayTimestamp: Date.now()
            });

            // Handle periodic collection based on consent
            if (consentStatus === 'agree') {
                // Start periodic collection (every 12 hours)
                this.startPeriodicCollection();
                
                // Show original notification
                vscode.window.showInformationMessage(
                    `Terms & Conditions accepted. Data will be collected twice daily (every 12 hours). Found ${billOfMaterials.length} configuration file(s). You'll be asked to re-consent in 30 days.`
                );
                
                // Show notification with bill of materials collected
                const bomList = billOfMaterialsArray.map(item => `${item.name} (${item.version})`).join(', ');
                vscode.window.showInformationMessage(
                    `Bill of Materials collected: ${bomList}`
                );
            } else {
                // Stop periodic collection if it was running
                this.stopPeriodicCollection();
                
                // Show original notification
                vscode.window.showInformationMessage(
                    'Terms & Conditions declined. No data will be collected. We will ask again in 3 days.'
                );
                
                // Show notification with collected items (repo and app name)
                vscode.window.showInformationMessage(
                    `No Bill of Materials collected. Collected items: ${repositoryName}, ${applicationName}`
                );
            }

        } catch (error) {
            console.error('[SDD:T&C] ERROR | Failed to process user consent:', error);
            vscode.window.showErrorMessage(
                `Failed to send data to Hub: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            throw error;
        }
    }

    /**
     * Check if copilot-wrapper is healthy by hitting the health endpoint
     * @returns true if copilot-wrapper is healthy, false otherwise
     */
    private async isCopilotWrapperHealthy(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.termsAndConditions.copilotWrapper.healthCheckTimeout);

            const response = await fetch(CONFIG.termsAndConditions.copilotWrapper.healthCheckUrl, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const text = await response.text();
                return text.toLowerCase().includes('healthy');
            }
            return false;
        } catch (error) {
            console.log('[SDD:T&C] INFO | Copilot-wrapper health check failed:', error);
            return false;
        }
    }

    /**
     * Detect bill of materials in workspace root
     * Files to check are configured in CONFIG.termsAndConditions.billOfMaterialsFiles
     */
    private async detectBillOfMaterials(): Promise<string[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const filesToCheck = CONFIG.termsAndConditions.billOfMaterialsFiles;
        const detectedFiles: string[] = [];

        for (const file of filesToCheck) {
            const filePath = path.join(rootPath, file);
            try {
                // Check if file or directory exists
                if (fs.existsSync(filePath)) {
                    detectedFiles.push(file);
                }
            } catch (error) {
                // Ignore errors for individual file checks
                console.error(`Error checking ${file}:`, error);
            }
        }

        // Check if copilot-wrapper is healthy and add it if so
        const isCopilotWrapperHealthy = await this.isCopilotWrapperHealthy();
        if (isCopilotWrapperHealthy) {
            console.log('[SDD:T&C] INFO | Copilot-wrapper is healthy - adding to bill of materials');
            detectedFiles.push('copilot-wrapper');
        } else {
            console.log('[SDD:T&C] INFO | Copilot-wrapper is not healthy - excluding from bill of materials');
        }

        return detectedFiles;
    }

    /**
     * Get version for a specific bill of materials item
     * @param item - The file/folder name (e.g., '.spec-driven-development', '.taskmaster')
     * @returns Version string or 'NA' or '-' based on the tool
     */
    private async getVersionForBillOfMaterialsItem(item: string): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return '-';
        }

        const rootPath = workspaceFolders[0].uri.fsPath;

        try {
            // 1. .spec-driven-development: get version from installed VS Code extension
            if (item === '.spec-driven-development') {
                return this.getExtensionVersion();
            }

            // 2. .taskmaster: get version from .vscode/mcp.json
            if (item === '.taskmaster') {
                const mcpJsonPath = path.join(rootPath, '.vscode', 'mcp.json');
                if (fs.existsSync(mcpJsonPath)) {
                    const mcpJsonContent = fs.readFileSync(mcpJsonPath, 'utf-8');
                    const mcpJson = JSON.parse(mcpJsonContent);
                    
                    // Extract version from args array: ['-y', 'task-master-ai@0.31.2']
                    const args = mcpJson?.servers?.["task-master-ai"]?.args;
                    if (Array.isArray(args)) {
                        // Find the arg that contains '@' and extract version
                        const versionArg = args.find((arg: string) => typeof arg === 'string' && arg.includes('@'));
                        if (versionArg) {
                            const version = versionArg.split('@')[1];
                            return version || '-';
                        }
                    }
                }
                return '-';
            }

            // 3, 4, 5. .devbox, .devcontainer, copilot-wrapper: return 'NA'
            if (item === '.devbox' || item === '.devcontainer' || item === 'copilot-wrapper') {
                return 'NA';
            }

            // Default for unknown items
            return 'NA';

        } catch (error) {
            console.error(`[SDD:T&C] ERROR | Failed to get version for ${item}:`, error);
            return '-';
        }
    }

    /**
     * Check and show T&C popup if needed
     * Should be called after AWS connection is established
     */
    async checkAndShowTermsConditions(): Promise<void> {
        try {
            // Prevent concurrent popups (Fix #6)
            if (this.isShowingTCPopup) {
                console.log('[SDD:T&C] INFO | T&C popup already showing - skipping duplicate request');
                return;
            }
            
            const shouldShow = await this.shouldShowTCPopup();
            if (shouldShow) {
                this.isShowingTCPopup = true;
                try {
                    console.log('[SDD:T&C] INFO | Showing T&C popup after AWS connection');
                    const userChoice = await this.showTCPopup();
                    
                    // Handle dialog dismissal (Fix #1)
                    if (userChoice === undefined) {
                        console.log('[SDD:T&C] INFO | User dismissed T&C dialog - will ask again on next AWS connection');
                        return;
                    }
                    
                    await this.processUserConsent(userChoice);
                } finally {
                    this.isShowingTCPopup = false;
                }
            } else {
                console.log('[SDD:T&C] INFO | T&C check passed - no popup needed');
            }
        } catch (error) {
            this.isShowingTCPopup = false;
            console.error('[SDD:T&C] ERROR | Failed to check and show T&C:', error);
        }
    }

    /**
     * Cleanup when extension deactivates
     */
    dispose(): void {
        this.stopPeriodicCollection();
    }

    /**
     * Send User Details (Consent + Bill of Materials) to Salesforce Hub
     */
    private async sendUserDetailsToSalesforce(
        userEmail: string,
        consentStatus: 'agree' | 'disagree',
        extensionVersion: string,
        repositoryName: string,
        applicationName: string,
        billOfMaterials: string[],
        timestamp: string
    ): Promise<{ name: string; version: string }[]> {
        try {
            console.log('[SDD:T&C] INFO | Sending User Details to Salesforce Hub');

            // Get Salesforce access token (reuse from FeedbackService)
            const accessToken = await (this.feedbackService as any).getAccessTokenWithRetryAndProtection();

            // Format Bill of Materials as JSON array with dynamic versions
            // Example: ".taskmaster" -> { "name": "Taskmaster", "version": "0.31.2" }
            const formatBillOfMaterialsItem = async (item: string): Promise<{ name: string; version: string }> => {
                const cleaned = item.startsWith('.') ? item.substring(1) : item;
                const formattedName = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
                const version = await this.getVersionForBillOfMaterialsItem(item);
                return { name: formattedName, version };
            };

            // For "disagree": empty array [] (will be stored as empty JSON array)
            // For "agree": JSON array like [{"name":"Spec-driven-development","version":"1.0.0"},...]
            const billOfMaterialsArray = consentStatus === 'disagree' 
                ? [] 
                : await Promise.all(billOfMaterials.map(formatBillOfMaterialsItem));
            
            const billOfMaterialsString = JSON.stringify(billOfMaterialsArray);

            // Prepare Salesforce payload
            const salesforcePayload = {
                Name: userEmail,
                Consent_Status__c: consentStatus === 'agree' ? 'Yes' : 'No',
                Repository_Name__c: repositoryName,
                Application_Name__c: applicationName,
                Timestamp__c: timestamp,
                Bill_of_Materials__c: billOfMaterialsString
            };

            console.log('[SDD:T&C] DEBUG | Salesforce Payload:', JSON.stringify(salesforcePayload, null, 2));

            const response = await fetch(getSalesforceApiUrl(CONFIG.api.endpoints.specDrivenUserDetails + '/'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(salesforcePayload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to send User Details to Hub: ${response.status} ${response.statusText}. ${errorText}`);
            }

            const result = await response.json();
            
            if (!result.success) {
                console.error('[SDD:T&C] ERROR | Hub returned errors:', result.errors);
                throw new Error(`Hub API errors: ${JSON.stringify(result.errors)}`);
            }

            console.log('[SDD:T&C] INFO | User Details sent successfully to Hub. Record ID:', result.id);
            
            return billOfMaterialsArray;

        } catch (error) {
            console.error('[SDD:T&C] ERROR | Failed to send User Details to Hub:', error);
            throw error;
        }
    }

    /**
     * Initialize periodic data collection
     * Called when extension activates
     */
    async initializePeriodicCollection(): Promise<void> {
        try {
            console.log('[SDD:T&C] INFO | Initializing periodic data collection');

            // Get current consent status
            const lastConsentStatus = this.context.workspaceState.get<'agree' | 'disagree' | undefined>('tc.lastConsentStatus');

            if (lastConsentStatus === 'agree') {
                // User has agreed - start automatic periodic collection (twice a day)
                console.log('[SDD:T&C] INFO | User has agreed to T&C - Starting periodic collection (every 12 hours)');
                this.startPeriodicCollection();
            } else if (lastConsentStatus === 'disagree') {
                // User disagreed - check if it's time to ask again (after 3 days)
                const lastDisagreedTimestamp = this.context.workspaceState.get<number>('tc.lastAcceptanceTimestamp', 0);
                const timeSinceDisagreed = Date.now() - lastDisagreedTimestamp;

                if (timeSinceDisagreed >= CONFIG.termsAndConditions.timing.disagreedRetryInterval) {
                    console.log('[SDD:T&C] INFO | 3 days passed since user disagreed - Will ask again');
                } else {
                    const daysRemaining = Math.ceil((CONFIG.termsAndConditions.timing.disagreedRetryInterval - timeSinceDisagreed) / (24 * 60 * 60 * 1000));
                    console.log(`[SDD:T&C] INFO | User disagreed recently - Will ask again in ${daysRemaining} day(s)`);
                }
            } else {
                // No consent yet - will show T&C on first use
                console.log('[SDD:T&C] INFO | No consent status found - Will show T&C on first use');
            }

        } catch (error) {
            console.error('[SDD:T&C] ERROR | Failed to initialize periodic collection:', error);
        }
    }

    /**
     * Start periodic data collection (every 12 hours)
     * Only runs if user has agreed to T&C
     */
    private startPeriodicCollection(): void {
        // Clear any existing interval
        this.stopPeriodicCollection();

        // Don't collect immediately on startup - wait for first interval
        // This prevents duplicate records when user just agreed
        
        // Set up interval for twice-daily collection (every 12 hours)
        this.periodicCollectionInterval = setInterval(() => {
            this.collectAndSendPeriodicData();
        }, CONFIG.termsAndConditions.timing.periodicCollectionInterval);

        console.log('[SDD:T&C] INFO | Periodic collection started - will run every 12 hours');
    }

    /**
     * Stop periodic data collection
     */
    private stopPeriodicCollection(): void {
        if (this.periodicCollectionInterval) {
            clearInterval(this.periodicCollectionInterval);
            this.periodicCollectionInterval = undefined;
            console.log('[SDD:T&C] INFO | Periodic collection stopped');
        }
    }

    /**
     * Collect and send data periodically (background operation)
     * Runs every 12 hours if user has agreed
     */
    private async collectAndSendPeriodicData(): Promise<void> {
        try {
            console.log('[SDD:T&C] INFO | Running periodic data collection');

            // Check if AWS is connected before attempting collection
            const isAWSConnected = await (this.feedbackService as any).awsService?.isConnected();
            if (!isAWSConnected) {
                console.log('[SDD:T&C] INFO | Skipping periodic collection - AWS not connected');
                return;
            }

            // Get user email with error handling
            let userEmail: string;
            try {
                userEmail = await this.getUserEmail();
            } catch (error) {
                console.warn('[SDD:T&C] WARN | Cannot collect data - user email not configured');
                return;
            }

            // Collect current data
            const extensionVersion = this.getExtensionVersion();
            const repositoryName = await this.getRepositoryName();
            const applicationName = await this.getApplicationName(true); // Silent mode for background (Fix #4)
            const billOfMaterials = await this.detectBillOfMaterials();
            const timestamp = new Date().toISOString();

            console.log('[SDD:T&C] INFO | Periodic collection - Found', billOfMaterials.length, 'configuration files');

            // Retry logic for network failures (Fix #5)
            const maxRetries = 3;
            let lastError: Error | undefined;
            
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    await this.sendUserDetailsToSalesforce(
                        userEmail,
                        'agree', // User has already agreed
                        extensionVersion,
                        repositoryName,
                        applicationName,
                        billOfMaterials,
                        timestamp
                    );
                    
                    // Success - update timestamp and exit
                    await this.context.workspaceState.update('tc.lastPeriodicCollectionTimestamp', Date.now());
                    console.log('[SDD:T&C] INFO | Periodic data collection completed successfully');
                    return;
                    
                } catch (error) {
                    lastError = error as Error;
                    console.warn(`[SDD:T&C] WARN | Periodic collection attempt ${attempt + 1}/${maxRetries} failed:`, error);
                    
                    // Don't retry on authentication errors
                    if (lastError.message.includes('401') || lastError.message.includes('Authentication')) {
                        console.error('[SDD:T&C] ERROR | Authentication failed - stopping retries');
                        break;
                    }
                    
                    // Wait before retry (exponential backoff: 5s, 10s, 20s)
                    if (attempt < maxRetries - 1) {
                        const delay = 5000 * Math.pow(2, attempt);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }
            
            console.error('[SDD:T&C] ERROR | Periodic collection failed after', maxRetries, 'attempts:', lastError?.message);

        } catch (error) {
            console.error('[SDD:T&C] ERROR | Failed to collect periodic data:', error);
            // Don't show error to user - this is a background operation
        }
    }

    /**
     * Get user email from existing UserService (reads from .spec-driven-development settings)
     */
    private async getUserEmail(): Promise<string> {
        try {
            // Use the existing UserService which reads from specDrivenDevelopment.userEmail config
            const email = await this.userService.getUserEmail();
            
            // Validate email is not the system-generated placeholder
            if (!email || email === 'user@example.com') {
                throw new Error('User email not configured');
            }
            
            return email;
        } catch (error) {
            console.error('[SDD:T&C] ERROR | Cannot proceed without valid user email:', error);
            throw new Error('User email is required for Terms & Conditions. Please configure your email first.');
        }
    }

    /**
     * Get repository name using existing GitService (reads from Git remote URL)
     */
    private async getRepositoryName(): Promise<string> {
        try {
            // Use existing GitService to extract repo name from Git remote URL
            const repoName = await GitService.getRepositoryName();
            if (repoName) {
                return repoName;
            }
            // Fallback to folder name if Git not available
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                return path.basename(workspaceFolders[0].uri.fsPath);
            }
            return 'unknown-repository';
        } catch (error) {
            console.error('Error getting repository name:', error);
            return 'unknown-repository';
        }
    }

    /**
     * Get application name from Hub using existing FeedbackService API
     * Uses Git_Details__c API to map repository name to application name
     * @param silent - If true, suppresses user-facing notifications (for background operations)
     */
    private async getApplicationName(silent: boolean = false): Promise<string> {
        try {
            // First get repository name
            const repoName = await this.getRepositoryName();
            
            if (repoName === 'unknown-repository') {
                return 'NA';
            }

            // Query Hub API to get application name for this repository
            const application = await this.feedbackService.getApplicationFromRepo(repoName);
            
            if (application && application.name) {
                console.log(`[SDD:T&C] INFO | Found application for repo '${repoName}': ${application.name}`);
                return application.name;
            }
            
            // Repository not found in Hub
            console.warn(`[SDD:T&C] WARN | Repository '${repoName}' does not exist in Hub`);
            
            // Only show notification during interactive flows, not background collection (Fix #4)
            if (!silent) {
                vscode.window.showWarningMessage(
                    `⚠️ Repository "${repoName}" does not exist in Hub.`
                );
            }
            
            return 'NA';
            
        } catch (error) {
            console.error('[SDD:T&C] ERROR | Error getting application name:', error);
            return 'NA';
        }
    }

    /**
     * Get extension version from package.json
     */
    private getExtensionVersion(): string {
        // Use the actual extension ID from package.json: publisher.name
        const extension = vscode.extensions.getExtension('Gen-Ai-publisher.spec-driven-development');
        return extension?.packageJSON?.version || '1.1.0';
    }

    /**
     * Get current storage state
     */
    private getStorageState(): TCStorageState {
        return {
            lastTCAcceptanceTimestamp: this.context.workspaceState.get<number>('tc.lastAcceptanceTimestamp'),
            lastConsentStatus: this.context.workspaceState.get<'agree' | 'disagree'>('tc.lastConsentStatus'),
            lastBillOfMaterials: this.context.workspaceState.get<string[]>('tc.lastBillOfMaterials'),
            lastRepositoryName: this.context.workspaceState.get<string>('tc.lastRepositoryName'),
            lastApplicationName: this.context.workspaceState.get<string>('tc.lastApplicationName'),
            lastExtensionVersion: this.context.workspaceState.get<string>('tc.lastExtensionVersion'),
            lastPeriodicDisplayTimestamp: this.context.workspaceState.get<number>('tc.lastPeriodicDisplayTimestamp')
        };
    }

    /**
     * Update storage state
     */
    private async updateStorageState(state: Partial<TCStorageState>): Promise<void> {
        const updates: Thenable<void>[] = [];
        
        if (state.lastTCAcceptanceTimestamp !== undefined) {
            updates.push(this.context.workspaceState.update('tc.lastAcceptanceTimestamp', state.lastTCAcceptanceTimestamp));
        }
        if (state.lastConsentStatus !== undefined) {
            updates.push(this.context.workspaceState.update('tc.lastConsentStatus', state.lastConsentStatus));
        }
        if (state.lastBillOfMaterials !== undefined) {
            updates.push(this.context.workspaceState.update('tc.lastBillOfMaterials', state.lastBillOfMaterials));
        }
        if (state.lastRepositoryName !== undefined) {
            updates.push(this.context.workspaceState.update('tc.lastRepositoryName', state.lastRepositoryName));
        }
        if (state.lastApplicationName !== undefined) {
            updates.push(this.context.workspaceState.update('tc.lastApplicationName', state.lastApplicationName));
        }
        if (state.lastExtensionVersion !== undefined) {
            updates.push(this.context.workspaceState.update('tc.lastExtensionVersion', state.lastExtensionVersion));
        }
        if (state.lastPeriodicDisplayTimestamp !== undefined) {
            updates.push(this.context.workspaceState.update('tc.lastPeriodicDisplayTimestamp', state.lastPeriodicDisplayTimestamp));
        }

        await Promise.all(updates);
    }

    /**
     * Reset T&C state (useful for testing)
     */
    async resetState(): Promise<void> {
        console.log('[SDD:T&C] INFO | Resetting T&C state...');
        
        // Stop periodic collection if running
        this.stopPeriodicCollection();
        
        // Clear all stored T&C data
        await this.context.workspaceState.update('tc.lastAcceptanceTimestamp', undefined);
        await this.context.workspaceState.update('tc.lastConsentStatus', undefined);
        await this.context.workspaceState.update('tc.lastBillOfMaterials', undefined);
        await this.context.workspaceState.update('tc.lastRepositoryName', undefined);
        await this.context.workspaceState.update('tc.lastApplicationName', undefined);
        await this.context.workspaceState.update('tc.lastExtensionVersion', undefined);
        await this.context.workspaceState.update('tc.lastPeriodicDisplayTimestamp', undefined);
        await this.context.workspaceState.update('tc.lastPeriodicCollectionTimestamp', undefined);
        
        console.log('[SDD:T&C] INFO | T&C state reset complete');
        vscode.window.showInformationMessage('✅ Terms & Conditions state reset successfully. You will be asked to consent again on next AWS connection.');
    }
}
