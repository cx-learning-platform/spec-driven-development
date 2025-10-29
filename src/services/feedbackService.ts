import * as vscode from 'vscode';
import * as os from 'os';
import { NotificationManager } from './notificationManager';
import { JiraService } from './jiraService';
import { AWSService } from './awsService';
import { GitService } from './gitService';
import { CONFIG, getSalesforceApiUrl, getSalesforceDescribeUrl, getSalesforceQueryUrl } from '../config/config';

// Helper function for fetch with timeout
const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number = 15000): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        throw error;
    }
};

export interface FeedbackData {
    name: string; // Component name for Salesforce
    description: string;
    estimatedHours: number;
    feedbackType: 'Story' | 'Bug' | 'Defect';
    acceptanceCriteria?: string; // Only for Story type
    initiativeId: string;
    epicId: string;
    workType?: string; // Work Type field
    jiraPriority?: string; // JIRA Priority field
    sprintId?: string; // Jira Sprint Details field
}

export interface SalesforceInitiative {
    id: string;
    name: string;
}

export interface SalesforceEpic {
    id: string;
    name: string;
    teamName: string;
    initiativeId: string;
}

export interface SalesforceSprint {
    id: string;
    name: string;
}

export interface SystemInfo {
    extensionVersion: string;
    vscodeVersion: string;
    operatingSystem: string;
    nodeVersion: string;
    platform: string;
    architecture: string;
    workspace?: string;
    activeLanguages: string[];
}

export interface FeedbackSubmissionResult {
    success: boolean;
    message: string;
    ticketId?: string;
    jiraUrl?: string;
    timestamp: string;
    error?: string;
}

export class FeedbackService {
    private context: vscode.ExtensionContext;
    private notificationManager: NotificationManager;
    private jiraService: JiraService;
    private awsService: AWSService;

    // Static properties for concurrent request protection
    private static tokenRequestMutex = new Map<string, Promise<string>>();

    constructor(context: vscode.ExtensionContext, awsService: AWSService) {
        this.context = context;
        this.notificationManager = NotificationManager.getInstance(context);
        this.awsService = awsService;
        this.jiraService = new JiraService(context, awsService);
    }

    /**
     * Enhanced token retrieval with retry and concurrent request protection
     */
    private async getAccessTokenWithRetryAndProtection(): Promise<string> {
        const requestKey = 'salesforce_token_feedback';
        
        // Concurrent request protection - reuse existing promise if another request is in progress
        if (FeedbackService.tokenRequestMutex.has(requestKey)) {
            console.log('Token request already in progress for FeedbackService, waiting for existing request...');
            return await FeedbackService.tokenRequestMutex.get(requestKey)!;
        }

        const tokenPromise = this.executeTokenRequest();
        FeedbackService.tokenRequestMutex.set(requestKey, tokenPromise);

        try {
            return await tokenPromise;
        } finally {
            // Always clean up the mutex
            FeedbackService.tokenRequestMutex.delete(requestKey);
        }
    }

    /**
     * Execute token request with network retry and 401 handling
     */
    private async executeTokenRequest(): Promise<string> {
        const maxRetries = CONFIG.retry.maxRetries;
        const baseDelay = CONFIG.retry.baseDelay;
        const maxDelay = CONFIG.retry.maxDelay;
        
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Use existing JiraService authentication
                return await (this.jiraService as any).authenticateWithSalesforce();
                
            } catch (error) {
                lastError = error as Error;
                const is401Error = lastError.message.includes('401') || 
                                 lastError.message.includes('Authentication failed') ||
                                 lastError.message.includes('Unauthorized') ||
                                 lastError.message.includes('invalid_grant');
                
                const isNetworkError = lastError.message.includes('fetch') ||
                                     lastError.message.includes('network') ||
                                     lastError.message.includes('timeout') ||
                                     lastError.message.includes('ECONNRESET') ||
                                     lastError.message.includes('ENOTFOUND');

                console.log(`Token request attempt ${attempt + 1} failed (FeedbackService):`, {
                    error: lastError.message,
                    is401Error,
                    isNetworkError,
                    willRetry: attempt < maxRetries - 1
                });

                // Handle 401 errors - clear cache and retry once
                if (is401Error && attempt === 0) {
                    console.log('401 detected in FeedbackService, clearing token cache and retrying...');
                    
                    // Clear the cached token in JiraService
                    (this.jiraService as any).cachedAuthToken = undefined;
                    (this.jiraService as any).tokenExpiry = undefined;
                    
                    // Immediate retry for 401 (don't wait)
                    continue;
                }
                
                // Handle network errors with exponential backoff
                if (isNetworkError && attempt < maxRetries - 1) {
                    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
                    const jitter = Math.random() * 0.1 * delay; // 10% jitter
                    const finalDelay = delay + jitter;
                    
                    console.log(`Network error detected in FeedbackService, retrying after ${Math.round(finalDelay)}ms...`);
                    await this.sleep(finalDelay);
                    continue;
                }

                // For non-retryable errors, break immediately
                if (!isNetworkError && !is401Error) {
                    break;
                }

                // Final network retry
                if (attempt < maxRetries - 1 && isNetworkError) {
                    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
                    await this.sleep(delay);
                    continue;
                }

                break;
            }
        }

        // All retries exhausted
        const errorMessage = `Failed to obtain Salesforce token after ${maxRetries} attempts: ${lastError?.message}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    /**
     * Sleep utility for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get list of initiatives from Salesforce
     */
    public async getInitiatives(): Promise<SalesforceInitiative[]> {
        try {
            // Check AWS connection status first
            const awsStatus = await this.awsService.getRealTimeConnectionStatus();
            if (!awsStatus.connected) {
                throw new Error('AWS connection is required to load initiatives. Please connect to AWS first.');
            }

            // Check if Salesforce credentials are available
            const salesforceCredentials = this.awsService.getSalesforceCredentials();
            if (!salesforceCredentials) {
                throw new Error('Salesforce credentials not available. Please ensure AWS is connected and credentials are configured.');
            }

            const accessToken = await this.getAccessTokenWithRetryAndProtection();
            
            // Try querying the describe API to understand the Initiative__c field relationship
            const describeResponse = await fetchWithTimeout(getSalesforceDescribeUrl('feedback'), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }, 10000); // 10 second timeout

            if (!describeResponse.ok) {
                throw new Error(`Failed to describe Feedback object: ${describeResponse.status} ${describeResponse.statusText}`);
            }

            const describeData = await describeResponse.json();
            const initiativeField = describeData.fields.find((field: any) => field.name === 'Initiative__c');
            
            if (initiativeField && initiativeField.referenceTo && initiativeField.referenceTo.length > 0) {
                const referencedObject = initiativeField.referenceTo[0];
                console.log(`Initiative__c field references: ${referencedObject}`);
                
                // Now query the correct object
                const response = await fetchWithTimeout(getSalesforceQueryUrl(`SELECT+Id%2CName+FROM+${referencedObject}`), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }, 10000); // 10 second timeout

                if (!response.ok) {
                    throw new Error(`Failed to fetch initiatives: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();
                return data.records.map((record: any) => ({
                    id: record.Id,
                    name: record.Name
                }));
            } else {
                // Fallback to CX_Initiative__c based on discovered field relationship
                const response = await fetchWithTimeout(getSalesforceQueryUrl(`SELECT+Id%2CName+FROM+CX_Initiative__c`), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }, 10000); // 10 second timeout

                if (!response.ok) {
                    throw new Error(`Failed to fetch initiatives: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();
                return data.records.map((record: any) => ({
                    id: record.Id,
                    name: record.Name
                }));
            }
        } catch (error) {
            console.error('Failed to fetch initiatives:', error);
            
            // Handle different types of errors with user-friendly messages
            if (error instanceof Error) {
                if (error.message.includes('timeout')) {
                    throw new Error('Network timeout while loading initiatives. Please check your connection and try again.');
                }
                if (error.message.includes('fetch failed')) {
                    throw new Error('Unable to connect to Salesforce. Please check your network connection and try again.');
                }
                if (error.message.includes('401') || error.message.includes('403')) {
                    throw new Error('Authentication failed. Please reconnect to AWS and try again.');
                }
            }
            
            throw new Error(`Failed to fetch initiatives: ${(error as Error).message}`);
        }
    }

    /**
     * Get list of all epics from Salesforce
     */
    public async getEpics(): Promise<SalesforceEpic[]> {
        try {
            // Check AWS connection status first
            const awsStatus = await this.awsService.getRealTimeConnectionStatus();
            if (!awsStatus.connected) {
                throw new Error('AWS connection is required to load epics. Please connect to AWS first.');
            }

            // Check if Salesforce credentials are available
            const salesforceCredentials = this.awsService.getSalesforceCredentials();
            if (!salesforceCredentials) {
                throw new Error('Salesforce credentials not available. Please ensure AWS is connected and credentials are configured.');
            }

            const accessToken = await this.getAccessTokenWithRetryAndProtection();
            
            // First check if Initiative__c field exists on Epic__c object
            const describeResponse = await fetch(getSalesforceDescribeUrl('epic'), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            let hasInitiativeField = false;
            if (describeResponse.ok) {
                const describeData = await describeResponse.json();
                hasInitiativeField = describeData.fields.some((field: any) => field.name === 'Initiative__c');
                console.log(`Epic__c has Initiative__c field: ${hasInitiativeField}`);
            }

            // Build the SOQL query based on whether Initiative field exists
            let query = `SELECT+Id%2CName%2CTeam_Name__c`;
            if (hasInitiativeField) {
                query += `%2CInitiative__c`;
            }
            query += `+FROM+Epic__c+ORDER+BY+CreatedDate+DESC`;
            
            console.log(`Epic query: ${query}`);
            const response = await fetch(getSalesforceQueryUrl(query), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch epics: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data.records.map((record: any) => ({
                id: record.Id,
                name: record.Name,
                teamName: record.Team_Name__c,
                initiativeId: record.Initiative__c || null // Handle missing Initiative field
            }));
        } catch (error) {
            console.error('Failed to fetch epics:', error);
            throw new Error(`Failed to fetch epics: ${(error as Error).message}`);
        }
    }

    /**
     * Get Sprint Details from Salesforce (limited to 10 most recent)
     */
    public async getSprintDetails(): Promise<SalesforceSprint[]> {
        try {
            // Check AWS connection status first
            const awsStatus = await this.awsService.getRealTimeConnectionStatus();
            if (!awsStatus.connected) {
                throw new Error('AWS connection is required to load sprint details. Please connect to AWS first.');
            }

            // Check if Salesforce credentials are available
            const salesforceCredentials = this.awsService.getSalesforceCredentials();
            if (!salesforceCredentials) {
                throw new Error('Salesforce credentials not available. Please ensure AWS is connected and credentials are configured.');
            }

            const accessToken = await this.getAccessTokenWithRetryAndProtection();
            
            // Query Sprint_Jira_Details__c object, ordered by CreatedDate DESC, limited to 10
            const query = `SELECT+Id%2CName+FROM+Sprint_Jira_Details__c+ORDER+BY+CreatedDate+DESC+LIMIT+10`;
            
            console.log(`Sprint query: ${query}`);
            const response = await fetch(getSalesforceQueryUrl(query), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch sprint details: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data.records.map((record: any) => ({
                id: record.Id,
                name: record.Name
            }));
        } catch (error) {
            console.error('Failed to fetch sprint details:', error);
            throw new Error(`Failed to fetch sprint details: ${(error as Error).message}`);
        }
    }

    /**
     * Get sprint details filtered by team name
     * Extracts team prefix and filters sprints by matching prefix
     */
    public async getSprintsForTeam(teamName: string): Promise<Array<{ id: string; name: string; recommended?: boolean }>> {
        try {
            console.log(`Getting sprints for team: ${teamName}`);
            
            // Extract team prefix from team name
            // "GenAI - LCEA" → "GENAI"
            // "DevOps - LCEA" → "DEVOPS"
            // "DevSecOps - LCEA" → "DEVSECOPS"
            const teamPrefix = this.extractTeamPrefix(teamName);
            console.log(`Extracted team prefix: ${teamPrefix}`);

            // Get all sprints (API 12) - already sorted by CreatedDate DESC, limited to 10
            const allSprints = await this.getSprintDetails();
            
            if (!allSprints || allSprints.length === 0) {
                console.log('No sprints found');
                return [];
            }

            // Filter sprints by team prefix to find the recommended one
            const matchingSprints = allSprints.filter(sprint => {
                const sprintPrefix = this.extractSprintPrefix(sprint.name);
                return sprintPrefix === teamPrefix;
            });

            console.log(`Found ${matchingSprints.length} sprints matching team prefix "${teamPrefix}"`);

            // Get the recommended sprint (first matching sprint, which is the latest)
            const recommendedSprint = matchingSprints.length > 0 ? matchingSprints[0] : null;

            // Return all sprints (top 10 from all teams), but mark the recommended one
            return allSprints.map(sprint => ({
                id: sprint.id,
                name: sprint.name,
                recommended: recommendedSprint ? sprint.id === recommendedSprint.id : false
            }));

        } catch (error) {
            console.error('Error getting sprints for team:', error);
            // Fallback to all sprints
            try {
                const allSprints = await this.getSprintDetails();
                return allSprints.map(s => ({ id: s.id, name: s.name }));
            } catch (fallbackError) {
                console.error('Fallback sprint loading also failed:', fallbackError);
                return [];
            }
        }
    }

    /**
     * Extract team prefix from team name
     * "GenAI - LCEA" → "GENAI"
     * "DevOps - LCEA" → "DEVOPS"
     * "DevSecOps - LCEA" → "DEVSEC"
     */
    private extractTeamPrefix(teamName: string): string {
        // Split by " - " separator
        const parts = teamName.split(' - ');
        if (parts.length > 0) {
            // Take first part, convert to uppercase, remove spaces
            let prefix = parts[0].toUpperCase().replace(/\s+/g, '');
            
            // Special case: "DevSecOps" team uses "DEVSEC" sprint prefix
            if (prefix === 'DEVSECOPS') {
                return 'DEVSEC';
            }
            
            return prefix;
        }
        // Fallback: just uppercase and remove spaces
        return teamName.toUpperCase().replace(/\s+/g, '');
    }

    /**
     * Extract sprint prefix from sprint name
     * "GENAI:FY26Q1_S7: 10/22-11/04" → "GENAI"
     * "DEVSEC:FY26Q1_S6: 10/08-10/21" → "DEVSEC"
     */
    private extractSprintPrefix(sprintName: string): string {
        // Sprint format: "PREFIX:FY26Q1_S7: 10/22-11/04"
        const parts = sprintName.split(':');
        if (parts.length > 0) {
            return parts[0].toUpperCase().trim();
        }
        return '';
    }

    /**
     * Submit feedback to the appropriate endpoint
     */
    public async submitFeedback(feedbackData: FeedbackData): Promise<FeedbackSubmissionResult> {
        try {
            // Validate feedback data
            const validationResult = this.validateFeedbackData(feedbackData);
            if (!validationResult.isValid) {
                throw new Error(validationResult.error || 'Invalid feedback data');
            }

            // Submit to Salesforce
            const result = await this.submitToSalesforce(feedbackData);

            // Cache the submission for user reference
            await this.cacheSubmission(feedbackData, result);

            return result;

        } catch (error) {
            const errorResult: FeedbackSubmissionResult = {
                success: false,
                message: 'Failed to submit feature',
                error: (error as Error).message,
                timestamp: new Date().toISOString()
            };

            // Cache the error for debugging
            await this.cacheSubmission(feedbackData, errorResult);

            return errorResult;
        }
    }

    /**
     * Submit feedback to Salesforce
     */
    private async submitToSalesforce(feedbackData: FeedbackData): Promise<FeedbackSubmissionResult> {
        try {
            // Get Salesforce access token
            const accessToken = await this.getAccessTokenWithRetryAndProtection();

            // Prepare Salesforce payload
            const salesforcePayload: any = {
                Name: feedbackData.name,
                Description__c: feedbackData.description,
                Estimated_Effort_Hours__c: feedbackData.estimatedHours,
                Type__c: feedbackData.feedbackType,
                Initiative__c: feedbackData.initiativeId,
                Epic__c: feedbackData.epicId
            };

            // Add acceptance criteria if it's a Story type
            if (feedbackData.feedbackType === 'Story' && feedbackData.acceptanceCriteria) {
                salesforcePayload.Jira_Acceptance_Criteria__c = feedbackData.acceptanceCriteria;
            }

            // Add optional fields if provided
            if (feedbackData.workType) {
                salesforcePayload.Work_Type__c = feedbackData.workType;
            }

            if (feedbackData.jiraPriority) {
                salesforcePayload.Jira_Priority__c = feedbackData.jiraPriority;
            }

            if (feedbackData.sprintId) {
                salesforcePayload.Jira_Sprint_Details__c = feedbackData.sprintId;
            }

            console.log('Submitting to Salesforce:', salesforcePayload);

            const response = await fetch(getSalesforceApiUrl(CONFIG.api.endpoints.feedback + '/'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(salesforcePayload)
            });

            let result;
            try {
                result = await response.json();
            } catch (parseError) {
                const responseText = await response.text();
                console.error('Failed to parse Salesforce response:', responseText);
                throw new Error(`Invalid response from Salesforce: ${response.status} ${response.statusText}`);
            }

            console.log('Salesforce response:', { status: response.status, result });

            if (response.ok && result.success) {
                let jiraTicketNumber = result.id; // Fallback to Salesforce ID

                let jiraUrl = undefined;
                
                try {
                    // Retry logic to wait for JIRA ticket creation (as it's asynchronous)
                    const maxRetries = 3;
                    const retryDelay = 2000; // 2 seconds
                    
                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                        const queryResponse = await fetch(getSalesforceQueryUrl(`SELECT+Id%2CJira_Link__c+FROM+Feedback__c+ORDER+BY+CreatedDate+DESC+LIMIT+1`), {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        if (queryResponse.ok) {
                            const queryData = await queryResponse.json();
                            
                            if (queryData.records && queryData.records.length > 0) {
                                const latestRecord = queryData.records[0];
                                
                                if (latestRecord.Jira_Link__c && latestRecord.Jira_Link__c !== 'TBD') {
                                    jiraUrl = latestRecord.Jira_Link__c;
                                    // Extract JIRA ticket number from URL - supports any project key format (GAI-572, DEVSECOPS-14936, etc.)
                                    const jiraUrlMatch = latestRecord.Jira_Link__c.match(CONFIG.jira.ticketPattern);
                                    if (jiraUrlMatch) {
                                        jiraTicketNumber = jiraUrlMatch[1];
                                        break; // Success! Exit retry loop
                                    }
                                }
                            }
                        }
                        
                        // Wait before next attempt (except for the last attempt)
                        if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, retryDelay));
                        }
                    }
                } catch (error) {
                    // Continue with Salesforce ID as fallback
                }

                return {
                    success: true,
                    message: 'Feature submitted to Salesforce successfully!',
                    ticketId: jiraTicketNumber,
                    jiraUrl: jiraUrl,
                    timestamp: new Date().toISOString()
                };
            } else {
                // More detailed error handling
                console.error('Detailed Salesforce error:', JSON.stringify(result, null, 2));
                console.error('Detailed Salesforce error (raw):', result);
                
                let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
                if (Array.isArray(result) && result.length > 0) {
                    // Salesforce often returns an array of error objects
                    const errors = result.map((err: any) => {
                        if (err.errorCode && err.message) {
                            return `${err.errorCode}: ${err.message}`;
                        }
                        return JSON.stringify(err);
                    }).join('; ');
                    errorMsg = errors; // Use the detailed error message directly
                    console.error('Formatted error message:', errorMsg);
                } else if (result && result.errors && result.errors.length > 0) {
                    const errors = result.errors.map((err: any) => `${err.statusCode}: ${err.message}`).join(', ');
                    errorMsg = errors;
                } else if (result && result.message) {
                    errorMsg = result.message;
                }
                
                throw new Error(errorMsg);
            }

        } catch (error) {
            console.error('Salesforce submission failed:', error);
            return {
                success: false,
                message: `Failed to submit to Salesforce: ${(error as Error).message}`,
                error: (error as Error).message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Save feedback as draft
     */
    public async saveDraft(feedbackData: Partial<FeedbackData>): Promise<void> {
        try {
            const drafts = this.context.globalState.get<any[]>('specDrivenDevelopment.feedbackDrafts', []);
            const newDraft = {
                ...feedbackData,
                id: this.generateSubmissionId(),
                createdAt: new Date().toISOString()
            };

            const updatedDrafts = [newDraft, ...drafts.slice(0, 4)]; // Keep last 5 drafts
            await this.context.globalState.update('specDrivenDevelopment.feedbackDrafts', updatedDrafts);

        } catch (error) {
            console.error('Failed to save feedback draft:', error);
        }
    }

    /**
     * Get saved drafts
     */
    public async getDrafts(): Promise<any[]> {
        return this.context.globalState.get<any[]>('specDrivenDevelopment.feedbackDrafts', []);
    }

    /**
     * Delete a draft
     */
    public async deleteDraft(draftId: string): Promise<void> {
        try {
            const drafts = this.context.globalState.get<any[]>('specDrivenDevelopment.feedbackDrafts', []);
            const updatedDrafts = drafts.filter(draft => draft.id !== draftId);
            await this.context.globalState.update('specDrivenDevelopment.feedbackDrafts', updatedDrafts);
        } catch (error) {
            console.error('Failed to delete feedback draft:', error);
        }
    }

    private validateFeedbackData(data: FeedbackData): {isValid: boolean; error?: string} {
        if (!data.name || data.name.trim().length < 3) {
            return {
                isValid: false,
                error: 'Component name must be at least 3 characters long'
            };
        }

        if (!data.description || data.description.trim().length < 10) {
            return {
                isValid: false,
                error: 'Description must be at least 10 characters long'
            };
        }

        if (!data.estimatedHours || data.estimatedHours <= 0) {
            return {
                isValid: false,
                error: 'Estimated hours must be greater than 0'
            };
        }

        if (!data.feedbackType || !['Story', 'Bug', 'Defect'].includes(data.feedbackType)) {
            return {
                isValid: false,
                error: 'Please select a valid feedback type'
            };
        }

        if (!data.initiativeId || data.initiativeId.trim() === '') {
            return {
                isValid: false,
                error: 'Please select an initiative'
            };
        }

        if (!data.epicId || data.epicId.trim() === '') {
            return {
                isValid: false,
                error: 'Please select an epic'
            };
        }



        // If Story type, acceptance criteria is required
        if (data.feedbackType === 'Story' && (!data.acceptanceCriteria || data.acceptanceCriteria.trim().length < 10)) {
            return {
                isValid: false,
                error: 'Acceptance criteria is required for Story type and must be at least 10 characters long'
            };
        }

        return { isValid: true };
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }



    private generateSubmissionId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private async cacheSubmission(payload: any, result: FeedbackSubmissionResult): Promise<void> {
        try {
            const submission = {
                id: this.generateSubmissionId(),
                payload: {
                    name: payload.name,
                    feedbackType: payload.feedbackType,
                    description: payload.description?.substring(0, 100) + '...',
                    estimatedHours: payload.estimatedHours,
                    contactEmail: payload.contactEmail
                },
                result: result,
                timestamp: new Date().toISOString()
            };

            // Store most recent submission
            await this.context.globalState.update('specDrivenDevelopment.lastFeedbackSubmission', submission);

            // Add to submission history
            const history = this.context.globalState.get<any[]>('specDrivenDevelopment.feedbackHistory', []);
            const updatedHistory = [submission, ...history.slice(0, 9)]; // Keep last 10 submissions
            await this.context.globalState.update('specDrivenDevelopment.feedbackHistory', updatedHistory);

        } catch (error) {
            console.error('Failed to cache feedback submission:', error);
        }
    }

    public async getSubmissionHistory(): Promise<any[]> {
        return this.context.globalState.get<any[]>('specDrivenDevelopment.feedbackHistory', []);
    }

    public async getLastSubmission(): Promise<any> {
        return this.context.globalState.get('specDrivenDevelopment.lastFeedbackSubmission');
    }

    public async clearSubmissionHistory(): Promise<void> {
        await this.context.globalState.update('specDrivenDevelopment.lastFeedbackSubmission', undefined);
        await this.context.globalState.update('specDrivenDevelopment.feedbackHistory', []);
    }

    /**
     * Quick feedback for common issues (simplified for Salesforce integration)
     */
    public async submitQuickFeedback(type: 'connection-issue' | 'estimation-wrong' | 'ui-bug', description: string): Promise<FeedbackSubmissionResult> {
        // Note: Quick feedback is simplified as it requires initiative and epic selection from UI
        // This method is deprecated in favor of the full feedback form
        return {
            success: false,
            message: 'Quick feedback is not supported with Salesforce integration. Please use the full feedback form.',
            timestamp: new Date().toISOString(),
            error: 'Feature requires initiative and epic selection'
        };
    }

    /**
     * API 14: Get Application from Repository Name
     * Queries Git_Details__c to find the application linked to the repository
     */
    public async getApplicationFromRepo(repoName: string): Promise<{ id: string; name: string; gitUrl: string } | null> {
        try {
            console.log('Getting application for repo:', repoName);
            const token = await this.getAccessTokenWithRetryAndProtection();

            // API 14: Query Git_Details__c
            const query = encodeURIComponent(
                `SELECT id, Name, Git_URL__c, CX_Application_Name__r.Id, CX_Application_Name__r.Name ` +
                `FROM Git_Details__c ` +
                `WHERE CX_Application_Name__r.Application_Lifecycle__c != 'EOL' ` +
                `AND Name = '${repoName.replace(/'/g, "\\'")}'`
            );

            const response = await fetchWithTimeout(getSalesforceQueryUrl(query), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.records && data.records.length > 0) {
                const record = data.records[0];
                const result = {
                    id: record.CX_Application_Name__r?.Id || '',
                    name: record.CX_Application_Name__r?.Name || '',
                    gitUrl: record.Git_URL__c || ''
                };
                console.log('Found application:', result);
                return result;
            }

            console.log('No application found for repo:', repoName);
            return null;

        } catch (error) {
            console.error('Error getting application from repo:', error);
            return null;
        }
    }

    /**
     * API 15: Get Initiatives from Application Name
     * Queries App_Items__c to find initiatives linked to the application
     */
    public async getInitiativesFromApplication(applicationName: string): Promise<Array<{ id: string; name: string; jiraTeam: string }>> {
        try {
            console.log('Getting initiatives for application:', applicationName);
            const token = await this.getAccessTokenWithRetryAndProtection();

            // API 15: Query App_Items__c
            const query = encodeURIComponent(
                `SELECT id, name, Initiative__c, App__r.Name, Initiative__r.Id, Initiative__r.Name, Initiative__r.Jira_Team__c ` +
                `FROM App_Items__c ` +
                `WHERE App__r.Name = '${applicationName.replace(/'/g, "\\'")}'`
            );

            const response = await fetchWithTimeout(getSalesforceQueryUrl(query), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.records && data.records.length > 0) {
                const initiatives = data.records.map((record: any) => ({
                    id: record.Initiative__r?.Id || record.Initiative__c || '',
                    name: record.Initiative__r?.Name || '',
                    jiraTeam: record.Initiative__r?.Jira_Team__c || ''
                })).filter((init: any) => init.id && init.name); // Filter out invalid records

                console.log(`Found ${initiatives.length} initiatives for application`);
                return initiatives;
            }

            console.log('No initiatives found for application:', applicationName);
            return [];

        } catch (error) {
            console.error('Error getting initiatives from application:', error);
            return [];
        }
    }

    /**
     * API 16: Get Epics from Jira Team
     * Queries Epic__c to find active epics for the specified team
     */
    public async getEpicsFromInitiative(jiraTeam: string): Promise<Array<{ id: string; name: string; teamName: string; status: string }>> {
        try {
            console.log('Getting epics for Jira team:', jiraTeam);
            const token = await this.getAccessTokenWithRetryAndProtection();

            // API 16: Query Epic__c
            const query = encodeURIComponent(
                `SELECT id, name, Team_Name__c, Status__c ` +
                `FROM Epic__c ` +
                `WHERE Team_Name__c LIKE '%${jiraTeam.replace(/'/g, "\\'")}%' ` +
                `AND Status__c != 'done' ` +
                `ORDER BY CreatedDate DESC`
            );

            const response = await fetchWithTimeout(getSalesforceQueryUrl(query), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.records && data.records.length > 0) {
                const epics = data.records.map((record: any) => ({
                    id: record.Id,
                    name: record.Name,
                    teamName: record.Team_Name__c || '',
                    status: record.Status__c || ''
                }));

                console.log(`Found ${epics.length} epics for Jira team`);
                return epics;
            }

            console.log('No epics found for Jira team:', jiraTeam);
            return [];

        } catch (error) {
            console.error('Error getting epics from initiative:', error);
            return [];
        }
    }

    /**
     * Auto-populate Initiative and Epic from Git Repository
     * Chains API 14 → 15 → 16 to auto-detect based on workspace repo
     */
    public async autoPopulateFromGit(): Promise<{
        success: boolean;
        repoName?: string;
        applicationName?: string;
        initiatives: Array<{ id: string; name: string; jiraTeam: string }>;
        recommendedInitiativeId?: string;
        recommendedInitiativeName?: string;
        jiraTeam?: string;
        epics: Array<{ id: string; name: string; teamName: string; status: string }>;
        sprints: Array<{ id: string; name: string; recommended?: boolean }>;
        recommendedSprintId?: string;
        recommendedSprintName?: string;
        autoPopulated: boolean;
        fallbackReason?: string;
    }> {
        try {
            console.log('Starting auto-population from Git repository...');

            // Step 1: Get repository name from workspace
            const repoName = await GitService.getRepositoryName();
            
            if (!repoName) {
                console.log('Could not detect Git repository in workspace');
                return {
                    success: false,
                    initiatives: [],
                    epics: [],
                    sprints: [],
                    autoPopulated: false,
                    fallbackReason: 'No Git repository detected in workspace'
                };
            }

            console.log(`Detected repository: ${repoName}`);

            // Step 2: Get Application from Repository (API 14)
            const application = await this.getApplicationFromRepo(repoName);
            
            if (!application || !application.name) {
                console.log('Repository not found in Salesforce');
                
                // Show notification to user
                vscode.window.showWarningMessage(
                    `Repository "${repoName}" is not present in Hub. Using manual dropdowns.`
                );
                
                return {
                    success: false,
                    repoName,
                    initiatives: [],
                    epics: [],
                    sprints: [],
                    autoPopulated: false,
                    fallbackReason: `Repository "${repoName}" not registered in Salesforce`
                };
            }

            console.log(`Found application: ${application.name}`);

            // Step 3: Get Initiatives from Application (API 15)
            const initiatives = await this.getInitiativesFromApplication(application.name);
            
            if (initiatives.length === 0) {
                console.log('No initiatives found for application');
                return {
                    success: false,
                    repoName,
                    applicationName: application.name,
                    initiatives: [],
                    epics: [],
                    sprints: [],
                    autoPopulated: false,
                    fallbackReason: `No initiatives found for application "${application.name}"`
                };
            }

            console.log(`Found ${initiatives.length} initiative(s)`);

            // Step 4: Select recommended initiative (first one or apply business logic)
            const recommendedInitiative = initiatives[0];
            const jiraTeam = recommendedInitiative.jiraTeam;

            if (!jiraTeam) {
                console.log('No Jira team found for initiative');
                return {
                    success: true,
                    repoName,
                    applicationName: application.name,
                    initiatives,
                    recommendedInitiativeId: recommendedInitiative.id,
                    recommendedInitiativeName: recommendedInitiative.name,
                    epics: [],
                    sprints: [],
                    autoPopulated: true,
                    fallbackReason: 'No Jira team associated with initiative'
                };
            }

            console.log(`Recommended initiative: ${recommendedInitiative.name} (Team: ${jiraTeam})`);

            // Step 5: Get Epics from Jira Team (API 16)
            const epics = await this.getEpicsFromInitiative(jiraTeam);
            
            console.log(`Found ${epics.length} epic(s) for team`);

            // Step 6: Get Sprints for Jira Team
            const sprints = await this.getSprintsForTeam(jiraTeam);
            const recommendedSprint = sprints.find(s => s.recommended);
            
            console.log(`Found ${sprints.length} sprint(s) for team`);
            if (recommendedSprint) {
                console.log(`Recommended sprint: ${recommendedSprint.name}`);
            }

            // Step 7: Return complete result
            return {
                success: true,
                repoName,
                applicationName: application.name,
                initiatives,
                recommendedInitiativeId: recommendedInitiative.id,
                recommendedInitiativeName: recommendedInitiative.name,
                jiraTeam,
                epics,
                sprints,
                recommendedSprintId: recommendedSprint?.id,
                recommendedSprintName: recommendedSprint?.name,
                autoPopulated: true
            };

        } catch (error) {
            console.error('Error in auto-population from Git:', error);
            return {
                success: false,
                initiatives: [],
                epics: [],
                sprints: [],
                autoPopulated: false,
                fallbackReason: `Error: ${(error as Error).message}`
            };
        }
    }

    public dispose(): void {
        // Cleanup if needed
    }
}
