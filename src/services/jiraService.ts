import * as vscode from 'vscode';
import { AWSService } from './awsService';
import { UserService } from './userService';
import { EstimationData } from './estimationParser';
import { CONFIG, getSalesforceAuthUrl, getSalesforceApiUrl } from '../config/config';

// Dynamic import for node-fetch to handle ES modules in CommonJS environment
let fetch: any;

export interface JiraUpdateRequest {
    jiraId: string;
    estimationData: EstimationData;
    updateOriginalEstimate: boolean;
    addEstimationComment: boolean;
    manualHours?: number; // Add manual hours input
}

export interface JiraUpdateResult {
    success: boolean;
    jiraId: string;
    message: string;
    error?: string;
    epicId?: string;
    recordUrl?: string;
}

// Add new interfaces for Salesforce API responses
export interface SalesforceAuthResponse {
    access_token: string;
    instance_url: string;
    id: string;
    token_type: string;
    issued_at: string;
    signature: string;
}

export interface SalesforceTicketMatch {
    Id: string;
    Name: string;
    Epic__c: string;
    Jira_Link__c: string;
    Status__c?: string;
}

export interface SalesforceQueryResponse {
    totalSize: number;
    done: boolean;
    records: SalesforceTicketMatch[];
}

export class JiraService {
    private awsService: AWSService;
    private userService: UserService;
    private context: vscode.ExtensionContext;
    private cachedAuthToken?: string;
    private tokenExpiry?: Date;

    constructor(context: vscode.ExtensionContext, awsService: AWSService, userService: UserService) {
        this.context = context;
        this.awsService = awsService;
        this.userService = userService;
        this.initializeFetch();
    }

    private async initializeFetch(): Promise<void> {
        if (!fetch) {
            try {
                // Dynamic import for node-fetch to handle ES modules
                const nodeFetch = await import('node-fetch');
                fetch = nodeFetch.default;
            } catch (error) {
                console.error('Failed to import node-fetch:', error);
                throw new Error('HTTP client not available');
            }
        }
    }

    /**
     * Step 1: Authenticate with Salesforce and get access token
     */
    private async authenticateWithSalesforce(): Promise<string> {
        try {
            // Ensure fetch is initialized
            await this.initializeFetch();

            // Check if we have a cached token that's still valid
            if (this.cachedAuthToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
                return this.cachedAuthToken;
            }

            // Get Salesforce credentials from AWS Secrets Manager (no hardcoding)
            const salesforceCredentials = this.awsService.getSalesforceCredentials();
            if (!salesforceCredentials) {
                throw new Error('Salesforce credentials not available. Please connect to AWS first.');
            }

            // Use password as-is if it already contains the security token (typical length > 25 chars)
            // Otherwise, append security token if provided separately
            const fullPassword = salesforceCredentials.password.length > 25 || !salesforceCredentials.security_token
                ? salesforceCredentials.password
                : salesforceCredentials.password + salesforceCredentials.security_token;

            const authParams = new URLSearchParams({
                grant_type: 'password',
                client_id: salesforceCredentials.client_id,
                client_secret: salesforceCredentials.client_secret,
                username: salesforceCredentials.username,
                password: fullPassword
            });

            const response = await fetch(getSalesforceAuthUrl(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': 'BrowserId=Wxh7VwjWEfCrsYsz4ODIvg; CookieConsentPolicy=0:0; LSKey-c$CookieConsentPolicy=0:0'
                },
                body: authParams.toString()
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorObj;
                try {
                    errorObj = JSON.parse(errorText);
                } catch {
                    errorObj = { error: 'unknown', error_description: errorText };
                }
                
                // Provide specific error messages for common issues
                let userFriendlyMessage = '';
                if (errorObj.error === 'invalid_grant') {
                    userFriendlyMessage = 'Invalid Salesforce credentials. Please check:\n' +
                        '• Username and password are correct\n' +
                        '• Security token is appended to password (if required)\n' +
                        '• IP restrictions allow access from your location\n' +
                        '• Connected app is properly configured';
                } else {
                    userFriendlyMessage = `Salesforce error: ${errorObj.error_description || errorObj.error}`;
                }
                
                throw new Error(`Authentication failed: ${response.status} ${response.statusText}. ${userFriendlyMessage}`);
            }

            const authData = await response.json() as SalesforceAuthResponse;
            
            // Cache the token for 30 minutes (conservative based on observed 30-minute expiry)
            this.cachedAuthToken = authData.access_token;
            this.tokenExpiry = new Date(Date.now() + CONFIG.cache.tokenTTL); // 30 minutes from now

            console.log(`Salesforce authentication successful, token cached for ${CONFIG.cache.tokenTTL / (60 * 1000)} minutes`);
            return authData.access_token;

        } catch (error) {
            console.error('Salesforce authentication failed:', error);
            throw new Error(`Failed to authenticate with Salesforce: ${(error as Error).message}`);
        }
    }

    /**
     * Step 2: Match JIRA ticket to get Epic ID
     */
    private async matchEpicTicket(accessToken: string, jiraId: string): Promise<SalesforceTicketMatch> {
        try {
            const query = `SELECT+Id%2CName%2CEpic__c%2CJira_Link__c%2CStatus__c+FROM+Feedback__c+WHERE+Jira_Link__c+LIKE+%27%25${jiraId}%25%27`;
            const queryUrl = getSalesforceApiUrl(`${CONFIG.api.endpoints.query}/?q=${query}`);

            const response = await fetch(queryUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Cookie': 'CookieConsentPolicy=0:1; LSKey-c$CookieConsentPolicy=0:1'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Query failed: ${response.status} ${response.statusText}. ${errorText}`);
            }

            const queryData = await response.json() as SalesforceQueryResponse;

            if (queryData.totalSize === 0 || !queryData.records || queryData.records.length === 0) {
                throw new Error(`No matching ticket found for JIRA ID: ${jiraId}`);
            }

            return queryData.records[0];

        } catch (error) {
            console.error('Epic ticket matching failed:', error);
            throw new Error(`Failed to match Epic ticket: ${(error as Error).message}`);
        }
    }

    /**
     * Step 3: Update ticket with estimation hours
     */
    private async updateTicketEstimation(
        accessToken: string, 
        recordId: string, 
        epicId: string, 
        estimatedHours: number
    ): Promise<void> {
        try {
            const updateUrl = getSalesforceApiUrl(`${CONFIG.api.endpoints.feedback}/${recordId}`);

            const updateData = {
                Estimated_Effort_Hours__c: estimatedHours,
                Epic__c: epicId
            };

            const response = await fetch(updateUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Cookie': 'CookieConsentPolicy=0:1; LSKey-c$CookieConsentPolicy=0:1'
                },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Update failed: ${response.status} ${response.statusText}. ${errorText}`);
            }

        } catch (error) {
            console.error('Ticket update failed:', error);
            throw new Error(`Failed to update ticket: ${(error as Error).message}`);
        }
    }

    public async validateJiraIssue(jiraId: string): Promise<{isValid: boolean; error?: string; status?: string}> {
        try {
            // Basic format validation for JIRA tickets (supports any project key format including alphanumeric)
            if (!jiraId.match(CONFIG.jira.ticketIdPattern)) {
                return {
                    isValid: false,
                    error: 'Invalid format. Expected: PROJECT-XXXX (e.g., DEVSECOPS-1234, GAI-567, ABC123-999)'
                };
            }

            // Optional: Try to authenticate and check if ticket exists
            try {
                const accessToken = await this.authenticateWithSalesforce();
                const ticketMatch = await this.matchEpicTicket(accessToken, jiraId);
                
                return {
                    isValid: true,
                    status: ticketMatch.Status__c || 'Unknown'
                };
            } catch (error) {
                return {
                    isValid: false,
                    error: `Ticket not found: ${(error as Error).message}`
                };
            }

        } catch (error) {
            return {
                isValid: false,
                error: (error as Error).message
            };
        }
    }

    /**
     * Main method to update JIRA issue through the complete 3-step flow
     */
    public async updateJiraIssue(request: JiraUpdateRequest): Promise<JiraUpdateResult> {
        try {
            // Validate inputs
            if (!request.jiraId || !request.jiraId.match(CONFIG.jira.ticketIdPattern)) {
                throw new Error('Invalid JIRA ID format. Expected format: PROJECT-XXXX (e.g., DEVSECOPS-1234, GAI-567, ABC123-999)');
            }

            // Use manual hours if provided, otherwise use estimation data
            let estimatedHours: number;
            if (request.manualHours && request.manualHours > 0) {
                estimatedHours = request.manualHours;
            } else if (request.estimationData && request.estimationData.normalizedValue) {
                estimatedHours = request.estimationData.normalizedValue;
            } else {
                throw new Error('No estimation hours provided. Please enter manual hours or ensure estimation data is available.');
            }

            // Step 1: Authenticate with Salesforce using real AWS credentials
            const accessToken = await this.authenticateWithSalesforce();

            // Step 2: Match Epic ticket
            const ticketMatch = await this.matchEpicTicket(accessToken, request.jiraId);

            // Step 3: Update ticket with estimation
            await this.updateTicketEstimation(
                accessToken,
                ticketMatch.Id,
                ticketMatch.Epic__c,
                estimatedHours
            );

            return {
                success: true,
                jiraId: request.jiraId,
                message: `Successfully updated ${request.jiraId} with ${estimatedHours} hours estimation`,
                epicId: ticketMatch.Epic__c,
                recordUrl: ticketMatch.Jira_Link__c
            };

        } catch (error) {
            console.error('JIRA update failed:', error);
            return {
                success: false,
                jiraId: request.jiraId,
                message: 'Failed to update JIRA issue',
                error: (error as Error).message
            };
        }
    }

    public async getJiraConfigStatus(): Promise<{configured: boolean; connected: boolean}> {
        try {
            // Check if AWS connection is available for Salesforce credentials
            const awsStatus = await this.awsService.getRealTimeConnectionStatus();
            if (!awsStatus.connected) {
                return { configured: false, connected: false };
            }

            // Check if Salesforce credentials are available
            const salesforceCredentials = this.awsService.getSalesforceCredentials();
            if (!salesforceCredentials) {
                return { configured: false, connected: false };
            }

            // Try to authenticate to check connection
            try {
                const accessToken = await this.authenticateWithSalesforce();
                return {
                    configured: true,
                    connected: !!accessToken
                };
            } catch (error) {
                return { configured: true, connected: false };
            }

        } catch (error) {
            return { configured: false, connected: false };
        }
    }

    public dispose(): void {
        // Clear cached tokens
        this.cachedAuthToken = undefined;
        this.tokenExpiry = undefined;
    }
}