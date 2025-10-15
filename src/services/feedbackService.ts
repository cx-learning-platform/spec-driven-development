import * as vscode from 'vscode';
import * as os from 'os';
import { config } from '../utils/configurationManager';
import { NotificationManager } from './notificationManager';
import { JiraService } from './jiraService';
import { AWSService } from './awsService';

export interface FeedbackData {
    name: string; // Component name for Salesforce
    description: string;
    estimatedHours: number;
    feedbackType: 'Story' | 'Bug' | 'Defect';
    acceptanceCriteria?: string; // Only for Story type
    initiativeId: string;
    epicId: string;
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

    constructor(context: vscode.ExtensionContext, awsService: AWSService) {
        this.context = context;
        this.notificationManager = NotificationManager.getInstance(context);
        this.awsService = awsService;
        this.jiraService = new JiraService(context, awsService);
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

            const accessToken = await (this.jiraService as any).authenticateWithSalesforce();
            // Use the same hardcoded URL as JiraService for now
            const baseUrl = 'https://ciscolearningservices--secqa.sandbox.my.salesforce-setup.com';
            
            // Try querying the describe API to understand the Initiative__c field relationship
            const describeResponse = await fetch(`${baseUrl}/services/data/v56.0/sobjects/Feedback__c/describe`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!describeResponse.ok) {
                throw new Error(`Failed to describe Feedback object: ${describeResponse.status}`);
            }

            const describeData = await describeResponse.json();
            const initiativeField = describeData.fields.find((field: any) => field.name === 'Initiative__c');
            
            if (initiativeField && initiativeField.referenceTo && initiativeField.referenceTo.length > 0) {
                const referencedObject = initiativeField.referenceTo[0];
                console.log(`Initiative__c field references: ${referencedObject}`);
                
                // Now query the correct object
                const response = await fetch(`${baseUrl}/services/data/v56.0/query/?q=SELECT+Id%2CName+FROM+${referencedObject}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                });

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
                const response = await fetch(`${baseUrl}/services/data/v56.0/query/?q=SELECT+Id%2CName+FROM+CX_Initiative__c`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                });

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

            const accessToken = await (this.jiraService as any).authenticateWithSalesforce();
            // Use the same hardcoded URL as JiraService for now
            const baseUrl = 'https://ciscolearningservices--secqa.sandbox.my.salesforce-setup.com';
            
            // First check if Initiative__c field exists on Epic__c object
            const describeResponse = await fetch(`${baseUrl}/services/data/v56.0/sobjects/Epic__c/describe`, {
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
            const response = await fetch(`${baseUrl}/services/data/v56.0/query/?q=${query}`, {
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
            const accessToken = await (this.jiraService as any).authenticateWithSalesforce();
            // Use the same hardcoded URL as JiraService for now
            const baseUrl = 'https://ciscolearningservices--secqa.sandbox.my.salesforce-setup.com';

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

            console.log('Submitting to Salesforce:', salesforcePayload);

            const response = await fetch(`${baseUrl}/services/data/v56.0/sobjects/Feedback__c/`, {
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
                        const queryResponse = await fetch(`${baseUrl}/services/data/v56.0/query/?q=SELECT+Id%2CJira_Link__c+FROM+Feedback__c+ORDER+BY+CreatedDate+DESC+LIMIT+1`, {
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
                                    // Extract JIRA ticket number from URL like "https://cisco-learning.atlassian.net/browse/DEVSECOPS-14936"
                                    const jiraUrlMatch = latestRecord.Jira_Link__c.match(/\/browse\/([A-Z]+-\d+)$/);
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

    public dispose(): void {
        // Cleanup if needed
    }
}
