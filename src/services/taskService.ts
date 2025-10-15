import * as vscode from 'vscode';
import { AWSService } from './awsService';
import { JiraService } from './jiraService';

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
}

export class TaskService {
    private context: vscode.ExtensionContext;
    private awsService: AWSService;
    private jiraService: JiraService;
    private salesforceBaseUrl = 'https://ciscolearningservices--secqa.sandbox.my.salesforce-setup.com';

    constructor(context: vscode.ExtensionContext, awsService: AWSService) {
        this.context = context;
        this.awsService = awsService;
        this.jiraService = new JiraService(context, awsService);
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

        return await (this.jiraService as any).authenticateWithSalesforce();
    }

    /**
     * Retrieve WIP (Work In Progress) tasks with pagination and search
     */
    async retrieveWipTasks(options: { limit?: number; offset?: number; searchTerm?: string } = {}): Promise<{ tasks: Task[]; totalCount: number; hasMore: boolean }> {
        try {
            const token = await this.getAccessToken();
            const limit = options.limit || 20;
            const offset = options.offset || 0;

            // Build the WHERE clause with WIP conditions and optional search
            let whereClause = 'WHERE Jira_Link__c != null AND Status__c != \'Done\'';
            
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

            // Use the provided WIP query structure with pagination
            const query = encodeURIComponent(
                `SELECT Id,Delivery_Lifecycle__c,Epic__c,Name,Description__c,Estimated_Effort_Hours__c,Estimation_Completion_Date__c,Jira_Priority__c,Jira_Link__c,Type__c,Jira_Sprint_Details__c,Work_Type__c,Jira_Acceptance_Criteria__c,Initiative__c,Status__c,AI_Adopted__c FROM Feedback__c ${whereClause} ORDER BY CreatedDate DESC LIMIT ${limit} OFFSET ${offset}`
            );

            console.log('WIP Tasks Query:', query);

            const response = await fetch(`${this.salesforceBaseUrl}/services/data/v56.0/query/?q=${query}`, {
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
                const countResponse = await fetch(`${this.salesforceBaseUrl}/services/data/v56.0/query/?q=${countQuery}`, {
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
                console.warn('Failed to get WIP total count, using records length');
            }

            // Filter out locally cleaned up tasks
            const cleanedUpTasks = this.context.workspaceState.get<string[]>('cleanedUpTaskIds', []);
            const filteredTasks = (data.records || []).filter((task: Task) => !cleanedUpTasks.includes(task.Id));
            
            // Calculate approximate total after filtering (subtract cleaned up tasks from total)
            const approximateTotalCount = Math.max(0, totalCount - cleanedUpTasks.length);
            
            console.log(`Retrieved ${data.records?.length || 0} WIP tasks, ${filteredTasks.length} after filtering ${cleanedUpTasks.length} cleaned up tasks (${totalCount} original total, ~${approximateTotalCount} estimated remaining)`);

            return {
                tasks: filteredTasks,
                totalCount: approximateTotalCount, // Use estimated total after removing cleaned up tasks
                hasMore: (offset + limit) < approximateTotalCount
            };
        } catch (error) {
            console.error('Error retrieving WIP tasks:', error);
            throw error;
        }
    }

    /**
     * Retrieve Running tasks (created via Manage Features) with pagination and search
     */
    async retrieveRunningTasks(options: { limit?: number; offset?: number; searchTerm?: string } = {}): Promise<{ tasks: Task[]; totalCount: number; hasMore: boolean }> {
        try {
            const token = await this.getAccessToken();
            const limit = options.limit || 20;
            const offset = options.offset || 0;

            // Build the WHERE clause for search
            let whereClause = '';
            if (options.searchTerm) {
                const searchTerm = options.searchTerm.trim().replace(/'/g, "\\'");
                
                // Check if searching for a specific JIRA ticket ID (e.g., DEVSECOPS-14956)
                const jiraTicketPattern = /^[A-Z]+-\d+$/i;
                if (jiraTicketPattern.test(searchTerm)) {
                    // Search specifically in Jira_Link__c for the ticket ID
                    whereClause = ` WHERE Jira_Link__c LIKE '%${searchTerm}%'`;
                } else {
                    // General search across multiple fields
                    whereClause = ` WHERE (Name LIKE '%${searchTerm}%' OR Description__c LIKE '%${searchTerm}%' OR Jira_Link__c LIKE '%${searchTerm}%')`;
                }
            }

            // Use the existing query structure with pagination
            const query = encodeURIComponent(
                `SELECT Id,Delivery_Lifecycle__c,Epic__c,Name,Description__c,Estimated_Effort_Hours__c,Estimation_Completion_Date__c,Jira_Priority__c,Jira_Link__c,Type__c,Jira_Sprint_Details__c,Work_Type__c,Jira_Acceptance_Criteria__c,Initiative__c,Deployment_Date__c,Status__c,Actual_Effort_Hours__c,Resolution__c,AI_Adopted__c FROM Feedback__c${whereClause} ORDER BY CreatedDate DESC LIMIT ${limit} OFFSET ${offset}`
            );

            const response = await fetch(`${this.salesforceBaseUrl}/services/data/v56.0/query/?q=${query}`, {
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
                `SELECT COUNT() FROM Feedback__c${whereClause}`
            );
            
            let totalCount = data.records?.length || 0;
            try {
                const countResponse = await fetch(`${this.salesforceBaseUrl}/services/data/v56.0/query/?q=${countQuery}`, {
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
                console.warn('Failed to get total count, using records length');
            }

            return {
                tasks: data.records || [],
                totalCount,
                hasMore: (offset + limit) < totalCount
            };
        } catch (error) {
            console.error('Error retrieving running tasks:', error);
            throw error;
        }
    }

    /**
     * Retrieve Archived tasks (locally cleaned up) with pagination and search
     */
    async retrieveArchivedTasks(options: { limit?: number; offset?: number; searchTerm?: string } = {}): Promise<{ tasks: Task[]; totalCount: number; hasMore: boolean }> {
        try {
            // Get the list of locally cleaned up task IDs
            const cleanedUpTasks = this.context.workspaceState.get<string[]>('cleanedUpTaskIds', []);
            
            if (cleanedUpTasks.length === 0) {
                return {
                    tasks: [],
                    totalCount: 0,
                    hasMore: false
                };
            }

            const token = await this.getAccessToken();
            const limit = options.limit || 20;
            const offset = options.offset || 0;

            // Build query to get all the cleaned up tasks by their IDs
            const taskIdsString = cleanedUpTasks.map(id => `'${id}'`).join(',');
            let whereClause = `WHERE Id IN (${taskIdsString})`;
            
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

            // Use the same query structure as other tasks
            const query = encodeURIComponent(
                `SELECT Id,Delivery_Lifecycle__c,Epic__c,Name,Description__c,Estimated_Effort_Hours__c,Estimation_Completion_Date__c,Jira_Priority__c,Jira_Link__c,Type__c,Jira_Sprint_Details__c,Work_Type__c,Jira_Acceptance_Criteria__c,Initiative__c,Deployment_Date__c,Status__c,Actual_Effort_Hours__c,Resolution__c,AI_Adopted__c FROM Feedback__c ${whereClause} ORDER BY CreatedDate DESC LIMIT ${limit} OFFSET ${offset}`
            );

            const response = await fetch(`${this.salesforceBaseUrl}/services/data/v56.0/query/?q=${query}`, {
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
            
            // Total count is based on the locally cleaned up tasks
            const totalCount = cleanedUpTasks.length;

            return {
                tasks: data.records || [],
                totalCount,
                hasMore: (offset + limit) < totalCount
            };
        } catch (error) {
            console.error('Error retrieving archived tasks:', error);
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

            console.log('Updating task with payload:', updatePayload);

            const response = await fetch(`${this.salesforceBaseUrl}/services/data/v56.0/sobjects/Feedback__c/${taskId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatePayload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('PATCH request failed:', response.status, errorText);
                throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
            }

            return { success: true, message: 'Task updated successfully', taskId };
        } catch (error) {
            console.error('Error updating task:', error);
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

            const response = await fetch(`${this.salesforceBaseUrl}/services/data/v56.0/query/?q=${query}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn('Failed to fetch epics, using empty list');
                return [];
            }

            const data = await response.json();
            return data.records || [];
        } catch (error) {
            console.warn('Error fetching epics:', error);
            return [];
        }
    }

    /**
     * Delete a task (Remove from DevSecOps Hub)
     */
    async deleteTask(taskId: string): Promise<any> {
        try {
            const token = await this.getAccessToken();

            const response = await fetch(`${this.salesforceBaseUrl}/services/data/v56.0/sobjects/Feedback__c/${taskId}`, {
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
            console.error('Error deleting task:', error);
            throw error;
        }
    }

    /**
     * Cleanup (Delete) a task - stores locally as archived without modifying Salesforce
     */
    async cleanupTask(taskId: string): Promise<any> {
        try {
            // Store the cleaned up task ID in VS Code workspace state
            const cleanedUpTasks = this.context.workspaceState.get<string[]>('cleanedUpTaskIds', []);
            
            if (!cleanedUpTasks.includes(taskId)) {
                cleanedUpTasks.push(taskId);
                await this.context.workspaceState.update('cleanedUpTaskIds', cleanedUpTasks);
            }
            
            console.log('Task marked as cleaned up locally:', taskId);
            return { success: true };
        } catch (error) {
            console.error('Error cleaning up task:', error);
            throw error;
        }
    }

    /**
     * Restore a task from archived back to active status
     */
    async restoreTask(taskId: string): Promise<any> {
        try {
            // Remove the task ID from the cleaned up list in VS Code workspace state
            const cleanedUpTasks = this.context.workspaceState.get<string[]>('cleanedUpTaskIds', []);
            const updatedCleanedUpTasks = cleanedUpTasks.filter(id => id !== taskId);
            
            await this.context.workspaceState.update('cleanedUpTaskIds', updatedCleanedUpTasks);
            
            console.log('Task restored from cleaned up list:', taskId);
            return { success: true };
        } catch (error) {
            console.error('Error restoring task:', error);
            throw error;
        }
    }

    /**
     * Extract DEVSECOPS ticket number from Jira link
     */
    extractTicketNumber(jiraLink?: string): string {
        if (!jiraLink) {
            return 'N/A';
        }
        const match = jiraLink.match(/DEVSECOPS-(\d+)/);
        return match ? `DEVSECOPS-${match[1]}` : 'N/A';
    }
}