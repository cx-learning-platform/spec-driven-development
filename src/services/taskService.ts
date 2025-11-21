import * as vscode from 'vscode';
import { AWSService } from './awsService';
import { JiraService } from './jiraService';
import { UserService } from './userService';
import { CONFIG, getSalesforceApiUrl, getSalesforceQueryUrl, getSalesforceFeedbackUrl } from '../config/config';

export interface Task {
    Id: string;
    Name: string;
    Description__c?: string;
    Status__c?: string;
    Jira_Link__c?: string;
    Type__c?: string;
    Estimated_Effort_Hours__c?: number;
    Actual_Effort_Hours__c?: number;
    Resolution__c?: string;
    Deployment_Date__c?: string;
    Jira_Priority__c?: string;
    CreatedDate?: string;
    CreatedBy?: {
        Email: string;
    };
    From_External_VS__c?: boolean;
    Assignee_through_VS__c?: string;
}

export class TaskService {
    private context: vscode.ExtensionContext;
    private awsService: AWSService;
    private jiraService: JiraService;
    private userService: UserService;

    // Static properties for concurrent request protection
    private static tokenRequestMutex = new Map<string, Promise<string>>();

    constructor(context: vscode.ExtensionContext, awsService: AWSService, userService: UserService) {
        this.context = context;
        this.awsService = awsService;
        this.userService = userService;
        this.jiraService = new JiraService(context, awsService, userService);
    }

    /**
     * Get Salesforce access token using the same method as other services
     */
    private async getAccessToken(): Promise<string> {
        // Check AWS connection status first
        const awsStatus = await this.awsService.getRealTimeConnectionStatus();
        if (!awsStatus.connected) {
            throw new Error('AWS connection is required. Please connect to AWS first.');
        }

        // Check if Salesforce credentials are available
        const salesforceCredentials = this.awsService.getSalesforceCredentials();
        if (!salesforceCredentials) {
            throw new Error('Salesforce credentials not available. Please ensure AWS is connected and credentials are configured.');
        }

        return await this.getTokenWithRetryAndProtection();
    }

    /**
     * Enhanced token retrieval with retry and concurrent request protection
     */
    private async getTokenWithRetryAndProtection(): Promise<string> {
        const requestKey = 'salesforce_token';
        
        // Concurrent request protection - reuse existing promise if another request is in progress
        if (TaskService.tokenRequestMutex.has(requestKey)) {
            console.log('[SDD:Task] INFO | Token request already in progress, waiting for existing request...');
            return await TaskService.tokenRequestMutex.get(requestKey)!;
        }

        const tokenPromise = this.executeTokenRequest();
        TaskService.tokenRequestMutex.set(requestKey, tokenPromise);

        try {
            return await tokenPromise;
        } finally {
            // Always clean up the mutex
            TaskService.tokenRequestMutex.delete(requestKey);
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

                console.log(`[SDD:Task] INFO | Token request attempt ${attempt + 1} failed:`, {
                    error: lastError.message,
                    is401Error,
                    isNetworkError,
                    willRetry: attempt < maxRetries - 1
                });

                // Handle 401 errors - clear cache and retry once
                if (is401Error && attempt === 0) {
                    console.log('[SDD:Task] INFO | 401 detected, clearing token cache and retrying...');
                    
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
                    
                    console.log(`[SDD:Task] INFO | Network error detected, retrying after ${Math.round(finalDelay)}ms...`);
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
        console.error(`[SDD:Task] ERROR | ${errorMessage}`);
        throw new Error(errorMessage);
    }

    /**
     * Sleep utility for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Retrieve WIP (Work In Progress) tasks with pagination and search - USER SPECIFIC
     */
    async retrieveWipTasks(options: { limit?: number; offset?: number; searchTerm?: string } = {}): Promise<{ tasks: Task[]; totalCount: number; hasMore: boolean }> {
        try {
            const token = await this.getAccessToken();
            const userEmail = await this.userService.getUserEmail();
            const userInfo = await this.userService.getUserInfo();
            
            // Validate that we have a properly configured email (not system-generated)
            if (userInfo.source === 'system') {
                throw new Error('User email not configured. Please configure your email using the "Configure User Email" command before retrieving tasks.');
            }
            
            const username = await this.userService.getUsernameFromEmail();
            const limit = options.limit || 20;
            const offset = options.offset || 0;

            // Build the WHERE clause with WIP conditions, user filter (email OR assignee), and optional search
            let whereClause = `WHERE Jira_Link__c != null AND Status__c != 'Done' AND (CreatedBy.Email = '${userEmail}' OR Assignee_through_VS__c = '${username}')`;
            
            if (options.searchTerm) {
                const searchTerm = options.searchTerm.trim().replace(/'/g, "\\'");
                
                // Check if searching for a specific JIRA ticket ID (e.g., DEVSECOPS-14956)
                const jiraTicketPattern = /^[A-Z]+-\d+$/i;
                if (jiraTicketPattern.test(searchTerm)) {
                    // Search specifically in Jira_Link__c for the ticket ID
                    whereClause += ` AND Jira_Link__c LIKE '%${searchTerm}%'`;
                } else {
                    // General search across multiple fields
                    whereClause += ` AND (Name LIKE '%${searchTerm}%' OR Description__c LIKE '%${searchTerm}%' OR Jira_Link__c LIKE '%${searchTerm}%')`;
                }
            }

            // Use the provided WIP query structure with pagination and user filter
            const query = encodeURIComponent(
                `SELECT Id,CreatedBy.Email,Delivery_Lifecycle__c,Epic__c,Name,Description__c,Estimated_Effort_Hours__c,Estimation_Completion_Date__c,Jira_Priority__c,CreatedDate,Jira_Link__c,Type__c,Jira_Sprint_Details__c,Work_Type__c,Jira_Acceptance_Criteria__c,Initiative__c,Status__c,Jira_Component__c,AI_Adopted__c,From_External_VS__c,Assignee_through_VS__c FROM Feedback__c ${whereClause} ORDER BY CreatedDate DESC LIMIT ${limit} OFFSET ${offset}`
            );

            console.log('[SDD:Task] INFO | WIP tickets Query:', query);

            const response = await fetch(getSalesforceQueryUrl(query), {
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
            
            // Get total count for pagination
            const countQuery = encodeURIComponent(
                `SELECT COUNT() FROM Feedback__c ${whereClause}`
            );
            
            let totalCount = data.records?.length || 0;
            try {
                const countResponse = await fetch(getSalesforceQueryUrl(countQuery), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (countResponse.ok) {
                    const countData = await countResponse.json();
                    totalCount = countData.totalSize || 0;
                }
            } catch (error) {
                console.warn('[SDD:Task] WARN | Failed to get WIP total count, using records length');
            }

            // Filter out locally cleaned up tasks (client-side only)
            const cleanedUpTasks = this.context.workspaceState.get<string[]>('cleanedUpTaskIds', []);
            const filteredTasks = (data.records || []).filter((task: Task) => !cleanedUpTasks.includes(task.Id));
            
            console.log(`[SDD:Task] INFO | Retrieved ${data.records?.length || 0} WIP tickets, ${filteredTasks.length} after filtering ${cleanedUpTasks.length} locally cleaned up tasks (total count: ${totalCount})`);

            return {
                tasks: filteredTasks,
                totalCount: totalCount, // Use real Salesforce count for consistency across all users
                hasMore: (offset + limit) < totalCount
            };
        } catch (error) {
            console.error('[SDD:Task] ERROR | Error retrieving WIP tickets:', error);
            throw error;
        }
    }

    /**
     * Retrieve Running tasks (Tickets List - combines WIP and Done) with pagination and search - USER SPECIFIC
     */
    async retrieveRunningTasks(options: { limit?: number; offset?: number; searchTerm?: string } = {}): Promise<{ tasks: Task[]; totalCount: number; hasMore: boolean }> {
        try {
            const token = await this.getAccessToken();
            const userEmail = await this.userService.getUserEmail();
            const userInfo = await this.userService.getUserInfo();
            
            // Validate that we have a properly configured email (not system-generated)
            if (userInfo.source === 'system') {
                throw new Error('User email not configured. Please configure your email using the "Configure User Email" command before retrieving tasks.');
            }
            
            const username = await this.userService.getUsernameFromEmail();
            const limit = options.limit || 20;
            const offset = options.offset || 0;

            // Build the WHERE clause with user filter (email OR assignee) and optional search
            let whereClause = `WHERE (CreatedBy.Email = '${userEmail}' OR Assignee_through_VS__c = '${username}')`;
            
            if (options.searchTerm) {
                const searchTerm = options.searchTerm.trim().replace(/'/g, "\\'");
                
                // Check if searching for a specific JIRA ticket ID (e.g., DEVSECOPS-14956)
                const jiraTicketPattern = /^[A-Z]+-\d+$/i;
                if (jiraTicketPattern.test(searchTerm)) {
                    // Search specifically in Jira_Link__c for the ticket ID
                    whereClause += ` AND Jira_Link__c LIKE '%${searchTerm}%'`;
                } else {
                    // General search across multiple fields
                    whereClause += ` AND (Name LIKE '%${searchTerm}%' OR Description__c LIKE '%${searchTerm}%' OR Jira_Link__c LIKE '%${searchTerm}%')`;
                }
            }

            // Use the existing query structure with pagination and user filter
            const query = encodeURIComponent(
                `SELECT Id,CreatedBy.Email,Delivery_Lifecycle__c,Epic__c,Name,Description__c,Estimated_Effort_Hours__c,Estimation_Completion_Date__c,Jira_Priority__c,CreatedDate,Jira_Link__c,Type__c,Jira_Sprint_Details__c,Work_Type__c,Jira_Acceptance_Criteria__c,Initiative__c,Deployment_Date__c,Status__c,Actual_Effort_Hours__c,Resolution__c,Jira_Component__c,AI_Adopted__c,From_External_VS__c,Assignee_through_VS__c FROM Feedback__c ${whereClause} ORDER BY CreatedDate DESC LIMIT ${limit} OFFSET ${offset}`
            );

            console.log('[SDD:Task] INFO | Running tasks main query:', decodeURIComponent(query));

            const response = await fetch(getSalesforceQueryUrl(query), {
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
            
            // Get total count for pagination
            const countQuery = encodeURIComponent(
                `SELECT COUNT() FROM Feedback__c ${whereClause}`
            );
            
            console.log('[SDD:Task] INFO | Running tasks count query:', decodeURIComponent(countQuery));
            
            let totalCount = data.records?.length || 0;
            try {
                const countResponse = await fetch(getSalesforceQueryUrl(countQuery), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (countResponse.ok) {
                    const countData = await countResponse.json();
                    totalCount = countData.totalSize || 0;
                    console.log(`[SDD:Task] INFO | Running tasks - Total count: ${totalCount}, Records fetched: ${data.records?.length || 0}, Offset: ${offset}, Limit: ${limit}`);
                } else {
                    console.warn('[SDD:Task] WARN | Running tasks count query failed:', countResponse.status, countResponse.statusText);
                }
            } catch (error) {
                console.warn('[SDD:Task] WARN | Failed to get total count for running tasks, using records length:', error);
            }

            return {
                tasks: data.records || [],
                totalCount,
                hasMore: (offset + limit) < totalCount
            };
        } catch (error) {
            console.error('[SDD:Task] ERROR | Error retrieving all tickets:', error);
            throw error;
        }
    }

    /**
     * Retrieve Done tickets (Status = 'Done' in Salesforce) with pagination and search - USER SPECIFIC
     */
    async retrieveArchivedTasks(options: { limit?: number; offset?: number; searchTerm?: string } = {}): Promise<{ tasks: Task[]; totalCount: number; hasMore: boolean }> {
        try {
            const token = await this.getAccessToken();
            const userEmail = await this.userService.getUserEmail();
            const userInfo = await this.userService.getUserInfo();
            
            // Validate that we have a properly configured email (not system-generated)
            if (userInfo.source === 'system') {
                throw new Error('User email not configured. Please configure your email using the "Configure User Email" command before retrieving tasks.');
            }
            
            const username = await this.userService.getUsernameFromEmail();
            const limit = options.limit || 20;
            const offset = options.offset || 0;

            // Build the WHERE clause for Done tickets with user filter (email OR assignee)
            let whereClause = `WHERE Status__c = 'Done' AND (CreatedBy.Email = '${userEmail}' OR Assignee_through_VS__c = '${username}')`;
            
            if (options.searchTerm) {
                const searchTerm = options.searchTerm.trim().replace(/'/g, "\\'");
                
                // Check if searching for a specific JIRA ticket ID (e.g., DEVSECOPS-14956)
                const jiraTicketPattern = /^[A-Z]+-\d+$/i;
                if (jiraTicketPattern.test(searchTerm)) {
                    // Search specifically in Jira_Link__c for the ticket ID
                    whereClause += ` AND Jira_Link__c LIKE '%${searchTerm}%'`;
                } else {
                    // General search across multiple fields
                    whereClause += ` AND (Name LIKE '%${searchTerm}%' OR Description__c LIKE '%${searchTerm}%' OR Jira_Link__c LIKE '%${searchTerm}%')`;
                }
            }

            // Query for Done tickets from Salesforce (API 13 pattern) with user filter
            const query = encodeURIComponent(
                `SELECT Id,CreatedBy.Email,Delivery_Lifecycle__c,Epic__c,Name,Description__c,Estimated_Effort_Hours__c,Estimation_Completion_Date__c,Jira_Priority__c,CreatedDate,Jira_Link__c,Type__c,Jira_Sprint_Details__c,Work_Type__c,Jira_Acceptance_Criteria__c,Initiative__c,Deployment_Date__c,Status__c,Actual_Effort_Hours__c,Resolution__c,Jira_Component__c,AI_Adopted__c,From_External_VS__c,Assignee_through_VS__c FROM Feedback__c ${whereClause} ORDER BY CreatedDate DESC LIMIT ${limit} OFFSET ${offset}`
            );

            const response = await fetch(getSalesforceQueryUrl(query), {
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
            
            // Get total count for pagination
            const countQuery = encodeURIComponent(
                `SELECT COUNT() FROM Feedback__c ${whereClause}`
            );
            
            let totalCount = data.records?.length || 0;
            try {
                const countResponse = await fetch(getSalesforceQueryUrl(countQuery), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (countResponse.ok) {
                    const countData = await countResponse.json();
                    totalCount = countData.totalSize || 0;
                }
            } catch (error) {
                console.warn('[SDD:Task] WARN | Failed to get Done tickets total count, using records length');
            }

            console.log(`[SDD:Task] INFO | Retrieved ${data.records?.length || 0} Done tickets from Salesforce (total count: ${totalCount})`);

            return {
                tasks: data.records || [],
                totalCount: totalCount,
                hasMore: (offset + limit) < totalCount
            };
        } catch (error) {
            console.error('[SDD:Task] ERROR | Error retrieving Done tickets:', error);
            throw error;
        }
    }

    /**
     * Update a task (Edit functionality) with comprehensive fields
     */
    async updateTask(taskId: string, updates: any): Promise<any> {
        try {
            const token = await this.getAccessToken();

            // Build the update payload with all possible fields
            const updatePayload: any = {};
            
            if (updates.estimatedHours !== undefined) {
                updatePayload.Estimated_Effort_Hours__c = updates.estimatedHours;
            }
            if (updates.epicId !== undefined) {
                updatePayload.Epic__c = updates.epicId;
            }
            if (updates.description !== undefined) {
                updatePayload.Description__c = updates.description;
            }
            if (updates.name !== undefined) {
                updatePayload.Name = updates.name;
            }
            if (updates.type !== undefined) {
                updatePayload.Type__c = updates.type;
            }
            if (updates.priority !== undefined) {
                updatePayload.Jira_Priority__c = updates.priority;
            }
            if (updates.acceptanceCriteria !== undefined) {
                updatePayload.Jira_Acceptance_Criteria__c = updates.acceptanceCriteria;
            }
            if (updates.status !== undefined) {
                updatePayload.Status__c = updates.status;
            }
            if (updates.workType !== undefined) {
                updatePayload.Work_Type__c = updates.workType;
            }
            if (updates.actualHours !== undefined) {
                updatePayload.Actual_Effort_Hours__c = updates.actualHours;
            }
            if (updates.resolution !== undefined) {
                updatePayload.Resolution__c = updates.resolution;
            }
            if (updates.deploymentDate !== undefined) {
                updatePayload.Deployment_Date__c = updates.deploymentDate;
            }
            if (updates.aiAdopted !== undefined) {
                updatePayload.AI_Adopted__c = updates.aiAdopted;
            }

            console.log('[SDD:Task] INFO | Updating task with payload:', updatePayload);

            const response = await fetch(getSalesforceFeedbackUrl(taskId), {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatePayload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[SDD:Task] ERROR | PATCH request failed:', response.status, errorText);
                throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
            }

            return { success: true, message: 'Task updated successfully', taskId };
        } catch (error) {
            console.error('[SDD:Task] ERROR | Error updating task:', error);
            throw error;
        }
    }

    /**
     * Get available epics for dropdown
     */
    async getAvailableEpics(): Promise<any[]> {
        try {
            const token = await this.getAccessToken();
            
            const query = encodeURIComponent(
                'SELECT Id, Name FROM Epic__c ORDER BY Name ASC'
            );

            const response = await fetch(getSalesforceQueryUrl(query), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn('[SDD:Task] WARN | Failed to fetch epics, using empty list');
                return [];
            }

            const data = await response.json();
            return data.records || [];
        } catch (error) {
            console.warn('[SDD:Task] WARN | Error fetching epics:', error);
            return [];
        }
    }

    /**
     * Delete a task (Remove from DevSecOps Hub)
     */
    async deleteTask(taskId: string): Promise<any> {
        try {
            const token = await this.getAccessToken();

            const response = await fetch(getSalesforceFeedbackUrl(taskId), {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.status === 204) {
                return { success: true, message: 'Task deleted successfully' };
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('[SDD:Task] ERROR | Error deleting task:', error);
            throw error;
        }
    }

    /**
     * Cleanup (Mark as Done) a task - Updates Salesforce with Done status and moves to archived
     */
    async cleanupTask(task: Task): Promise<any> {
        try {
            // 1. Calculate actual hours from task creation to now
            const actualHours = this.calculateActualHours(task.CreatedDate || new Date().toISOString());
            
            // 2. Get current date in Salesforce format (YYYY-MM-DD)
            const deploymentDate = new Date().toISOString().split('T')[0];
            
            // 3. Prepare update payload to mark task as Done
            const updates = {
                status: 'Done',
                deploymentDate: deploymentDate,
                actualHours: actualHours,
                resolution: 'Done'
            };
            
            console.log('[SDD:Task] INFO | Marking task as Done in Salesforce:', task.Id, updates);
            
            // 4. Update task in Salesforce
            await this.updateTask(task.Id, updates);
            
            // 5. Store locally to hide from WIP list immediately (for UI responsiveness)
            const cleanedUpTasks = this.context.workspaceState.get<string[]>('cleanedUpTaskIds', []);
            if (!cleanedUpTasks.includes(task.Id)) {
                cleanedUpTasks.push(task.Id);
                await this.context.workspaceState.update('cleanedUpTaskIds', cleanedUpTasks);
            }
            
            console.log('[SDD:Task] INFO | Task successfully marked as Done:', task.Id);
            return { success: true, message: 'Task marked as Done successfully' };
        } catch (error) {
            console.error('[SDD:Task] ERROR | Error marking task as done:', error);
            throw error;
        }
    }

    /**
     * Restore a task from done back to active status (changes Status back to previous state in Salesforce)
     */
    async restoreTask(taskId: string): Promise<any> {
        try {
            // Update task status back to 'Backlog' or 'In Progress' in Salesforce
            const updates = {
                status: 'Backlog', // Or use previous status if tracked
                // Note: We don't clear deployment date, actual hours, or resolution
                // as they represent historical data
            };
            
            console.log('[SDD:Task] INFO | Restoring task in Salesforce:', taskId, updates);
            await this.updateTask(taskId, updates);
            
            // Also remove from local state if it was there
            const cleanedUpTasks = this.context.workspaceState.get<string[]>('cleanedUpTaskIds', []);
            const updatedCleanedUpTasks = cleanedUpTasks.filter(id => id !== taskId);
            await this.context.workspaceState.update('cleanedUpTaskIds', updatedCleanedUpTasks);
            
            console.log('[SDD:Task] INFO | Task successfully restored:', taskId);
            return { success: true, message: 'Task restored successfully' };
        } catch (error) {
            console.error('[SDD:Task] ERROR | Error restoring task:', error);
            throw error;
        }
    }

    /**
     * Extract JIRA ticket ID from various input formats
     * Supports: URLs like /browse/GAI-572, full URLs, or plain ticket IDs like DEVSECOPS-12208
     * @param input JIRA link URL or ticket ID
     * @returns JIRA ticket ID (e.g., "GAI-572") or null if not found
     */
    extractJiraTicketId(input?: string): string | null {
        if (!input) {
            return null;
        }

        // First try to extract from URL pattern /browse/TICKET-ID
        const urlMatch = input.match(CONFIG.jira.ticketPattern);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }

        // If input is already a plain ticket ID (e.g., "GAI-572"), validate and return it
        const trimmed = input.trim();
        if (CONFIG.jira.ticketIdPattern.test(trimmed)) {
            return trimmed;
        }

        return null;
    }

    /**
     * Validate if a string is a valid JIRA ticket ID
     * @param ticketId String to validate (e.g., "GAI-572", "DEVSECOPS-12208")
     * @returns true if valid JIRA ticket ID format
     */
    isValidJiraTicketId(ticketId?: string): boolean {
        if (!ticketId) {
            return false;
        }
        return CONFIG.jira.ticketIdPattern.test(ticketId.trim());
    }

    /**
     * Extract JIRA ticket number from Jira link (legacy method for backward compatibility)
     * @deprecated Use extractJiraTicketId() instead
     */
    extractTicketNumber(jiraLink?: string): string {
        const ticketId = this.extractJiraTicketId(jiraLink);
        return ticketId || 'N/A';
    }

    /**
     * Calculate actual working hours from task creation to now
     * Assuming 8 working hours per day (excluding weekends)
     * @param createdDate ISO 8601 date string from Salesforce
     * @returns Number of working hours rounded to nearest 0.5
     */
    calculateActualHours(createdDate: string): number {
        const created = new Date(createdDate);
        const now = new Date();
        
        let businessHours = 0;
        let currentDate = new Date(created);
        
        // Define business hours: 8 hours per working day
        const HOURS_PER_DAY = 8;
        const WORK_START_HOUR = 9;  // 9 AM
        const WORK_END_HOUR = 17;   // 5 PM
        
        while (currentDate < now) {
            const dayOfWeek = currentDate.getDay();
            
            // Skip weekends (0 = Sunday, 6 = Saturday)
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                const isFirstDay = currentDate.toDateString() === created.toDateString();
                const isLastDay = currentDate.toDateString() === now.toDateString();
                
                if (isFirstDay || isLastDay) {
                    // Partial day calculation
                    let startHour = WORK_START_HOUR;
                    let endHour = WORK_END_HOUR;
                    
                    if (isFirstDay) {
                        // If created during work hours, use created time, otherwise use work start
                        const createdHour = created.getHours() + (created.getMinutes() / 60);
                        startHour = Math.max(createdHour, WORK_START_HOUR);
                        startHour = Math.min(startHour, WORK_END_HOUR); // Cap at end of work day
                    }
                    
                    if (isLastDay) {
                        // Use current time, but cap at end of work day
                        const nowHour = now.getHours() + (now.getMinutes() / 60);
                        endHour = Math.min(nowHour, WORK_END_HOUR);
                        endHour = Math.max(endHour, WORK_START_HOUR); // Don't go below work start
                    }
                    
                    // Add hours for this partial day
                    const hoursWorked = Math.max(0, endHour - startHour);
                    businessHours += hoursWorked;
                } else {
                    // Full working day
                    businessHours += HOURS_PER_DAY;
                }
            }
            
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
            currentDate.setHours(0, 0, 0, 0);
        }
        
        // Round to nearest 0.5 hour
        return Math.round(businessHours * 2) / 2;
    }
}