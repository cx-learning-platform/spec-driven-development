import * as vscode from 'vscode';
import * as os from 'os';
import { config } from '../utils/configurationManager';
import { NotificationManager } from './notificationManager';

export interface FeedbackData {
    issueType: 'bug' | 'feature' | 'feedback' | 'support';
    priority: 'low' | 'medium' | 'high' | 'critical';
    component: 'aws-integration' | 'jira-integration' | 'estimation-parser' | 'ui' | 'other';
    description: string;
    includeSystemInfo: boolean;
    includeLogs: boolean;
    includeAWSDetails: boolean;
    submitAnonymously: boolean;
    contactEmail?: string;
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
    timestamp: string;
    error?: string;
}

export class FeedbackService {
    private context: vscode.ExtensionContext;
    private readonly feedbackEndpoints: { [key: string]: string };
    private notificationManager: NotificationManager;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.notificationManager = NotificationManager.getInstance(context);
        
        // Get endpoints from configuration manager
        const endpoints = config.getApiEndpoints().feedback;
        this.feedbackEndpoints = {
            github: endpoints.github,
            internal: endpoints.internal,
            analytics: endpoints.analytics
        };
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

            // Gather system information if requested
            let systemInfo: SystemInfo | undefined;
            if (feedbackData.includeSystemInfo) {
                systemInfo = await this.gatherSystemInfo();
            }

            // Gather logs if requested
            let logs: string[] | undefined;
            if (feedbackData.includeLogs) {
                logs = await this.gatherRecentLogs();
            }

            // Gather AWS details if requested
            let awsDetails: any;
            if (feedbackData.includeAWSDetails) {
                awsDetails = await this.gatherAWSDetails();
            }

            // Prepare submission payload
            const submissionPayload = {
                ...feedbackData,
                systemInfo,
                logs,
                awsDetails,
                timestamp: new Date().toISOString(),
                submissionId: this.generateSubmissionId()
            };

            // Sanitize sensitive data if submitting anonymously
            if (feedbackData.submitAnonymously) {
                this.sanitizePayload(submissionPayload);
            }

            // Submit to appropriate endpoint
            const result = await this.submitToEndpoint(submissionPayload);

            // Cache the submission for user reference
            await this.cacheSubmission(submissionPayload, result);

            return result;

        } catch (error) {
            const errorResult: FeedbackSubmissionResult = {
                success: false,
                message: 'Failed to submit feedback',
                error: (error as Error).message,
                timestamp: new Date().toISOString()
            };

            // Cache the error for debugging
            await this.cacheSubmission(feedbackData, errorResult);

            return errorResult;
        }
    }

    /**
     * Save feedback as draft
     */
    public async saveDraft(feedbackData: Partial<FeedbackData>): Promise<void> {
        try {
            const drafts = this.context.globalState.get<any[]>('vibeAssistant.feedbackDrafts', []);
            const newDraft = {
                ...feedbackData,
                id: this.generateSubmissionId(),
                createdAt: new Date().toISOString()
            };

            const updatedDrafts = [newDraft, ...drafts.slice(0, 4)]; // Keep last 5 drafts
            await this.context.globalState.update('vibeAssistant.feedbackDrafts', updatedDrafts);

        } catch (error) {
            console.error('Failed to save feedback draft:', error);
        }
    }

    /**
     * Get saved drafts
     */
    public async getDrafts(): Promise<any[]> {
        return this.context.globalState.get<any[]>('vibeAssistant.feedbackDrafts', []);
    }

    /**
     * Delete a draft
     */
    public async deleteDraft(draftId: string): Promise<void> {
        try {
            const drafts = this.context.globalState.get<any[]>('vibeAssistant.feedbackDrafts', []);
            const updatedDrafts = drafts.filter(draft => draft.id !== draftId);
            await this.context.globalState.update('vibeAssistant.feedbackDrafts', updatedDrafts);
        } catch (error) {
            console.error('Failed to delete feedback draft:', error);
        }
    }

    private validateFeedbackData(data: FeedbackData): {isValid: boolean; error?: string} {
        if (!data.description || data.description.trim().length < 10) {
            return {
                isValid: false,
                error: 'Description must be at least 10 characters long'
            };
        }

        // Only require email if NOT submitting anonymously
        if (!data.submitAnonymously) {
            if (!data.contactEmail || data.contactEmail.trim() === '' || data.contactEmail === 'your.email@company.com') {
                return {
                    isValid: false,
                    error: 'Valid contact email is required when not submitting anonymously'
                };
            }
            
            if (!this.isValidEmail(data.contactEmail)) {
                return {
                    isValid: false,
                    error: 'Please enter a valid email address'
                };
            }
        }

        return { isValid: true };
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    private async gatherSystemInfo(): Promise<SystemInfo> {
        const extension = vscode.extensions.getExtension('Gen-Ai-publisher.vibe-sync-code');
        const workspaceInfo = vscode.workspace.workspaceFolders?.[0];
        
        // Get active languages from open editors (simplified approach)
        const activeLanguages = vscode.window.visibleTextEditors
            .map(editor => editor.document.languageId)
            .filter((lang, index, array) => array.indexOf(lang) === index); // Remove duplicates

        return {
            extensionVersion: extension?.packageJSON.version || 'unknown',
            vscodeVersion: vscode.version,
            operatingSystem: `${os.type()} ${os.release()}`,
            nodeVersion: process.version,
            platform: os.platform(),
            architecture: os.arch(),
            workspace: workspaceInfo ? vscode.workspace.asRelativePath(workspaceInfo.uri) : undefined,
            activeLanguages: activeLanguages.length > 0 ? activeLanguages : ['unknown']
        };
    }

    private async gatherRecentLogs(): Promise<string[]> {
        try {
            // Get recent extension logs from output channel
            const outputChannel = vscode.window.createOutputChannel('Vibe Assistant');
            
            // For now, return simulated recent activities
            return [
                `[${new Date().toISOString()}] Extension activated`,
                `[${new Date().toISOString()}] AWS connection attempted`,
                `[${new Date().toISOString()}] Estimation parsing completed`,
                `[${new Date().toISOString()}] User interaction logged`
            ];
        } catch (error) {
            return [`Failed to gather logs: ${(error as Error).message}`];
        }
    }

    private async gatherAWSDetails(): Promise<any> {
        try {
            const awsStatus = this.context.globalState.get('vibeAssistant.awsStatus');
            return {
                connectionStatus: awsStatus || 'not connected',
                lastConnectionAttempt: this.context.globalState.get('vibeAssistant.lastAWSConnectionAttempt'),
                configuredProfile: vscode.workspace.getConfiguration('vibeAssistant').get('awsProfile'),
                configuredRegion: vscode.workspace.getConfiguration('vibeAssistant').get('awsRegion')
            };
        } catch (error) {
            return { error: `Failed to gather AWS details: ${(error as Error).message}` };
        }
    }

    private sanitizePayload(payload: any): void {
        // Remove or mask sensitive information
        if (payload.contactEmail) {
            payload.contactEmail = this.maskEmail(payload.contactEmail);
        }

        if (payload.systemInfo) {
            payload.systemInfo.workspace = payload.systemInfo.workspace ? '[WORKSPACE]' : undefined;
        }

        if (payload.awsDetails) {
            if (payload.awsDetails.configuredProfile) {
                payload.awsDetails.configuredProfile = '[PROFILE]';
            }
        }

        // Remove any potential sensitive data from logs
        if (payload.logs) {
            payload.logs = payload.logs.map((log: string) => 
                log.replace(/[a-zA-Z0-9+/=]{20,}/g, '[REDACTED]') // Remove potential keys/tokens
            );
        }
    }

    private maskEmail(email: string): string {
        const parts = email.split('@');
        if (parts.length !== 2) return '[EMAIL]';
        
        const username = parts[0];
        const domain = parts[1];
        
        const maskedUsername = username.length > 2 
            ? username.substring(0, 2) + '*'.repeat(username.length - 2)
            : '**';
            
        return `${maskedUsername}@${domain}`;
    }

    private async submitToEndpoint(payload: any): Promise<FeedbackSubmissionResult> {
        try {
            // Always save locally first
            const localResult: FeedbackSubmissionResult = {
                success: true,
                message: 'Feedback saved locally',
                ticketId: `LOCAL-${Date.now()}`,
                timestamp: new Date().toISOString()
            };

            // Ask user how they want to submit the feedback
            const choice = await vscode.window.showInformationMessage(
                'Feedback saved! How would you like to submit it?',
                'Create GitHub Issue',
                'Keep Local Only',
                'Email Developer'
            );

            if (choice === 'Create GitHub Issue') {
                const githubResult = await this.createGitHubIssue(payload);
                if (githubResult.success) {
                    vscode.window.showInformationMessage(
                        `✅ GitHub issue created successfully!`,
                        'View Issue'
                    ).then(action => {
                        if (action === 'View Issue' && githubResult.issueUrl) {
                            vscode.env.openExternal(vscode.Uri.parse(githubResult.issueUrl));
                        }
                    });
                    return {
                        ...localResult,
                        message: 'Feedback saved locally and GitHub issue created',
                        ticketId: `GH-${githubResult.issueUrl?.split('/').pop() || 'unknown'}`
                    };
                } else {
                    vscode.window.showErrorMessage(`❌ Failed to create GitHub issue: ${githubResult.error}`);
                    return {
                        ...localResult,
                        message: 'Feedback saved locally but GitHub issue creation failed',
                        error: githubResult.error
                    };
                }
            } else if (choice === 'Email Developer') {
                await this.openEmailClient(payload);
                return {
                    ...localResult,
                    message: 'Feedback saved locally and email client opened',
                    ticketId: localResult.ticketId
                };
            }

            return localResult;

            // Example of actual HTTP submission (commented out):
            /*
            const response = await fetch(this.feedbackEndpoints.github, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'token YOUR_GITHUB_TOKEN',
                    'User-Agent': 'Vibe-Code-Assistant-Extension'
                },
                body: JSON.stringify({
                    title: `[${payload.issueType.toUpperCase()}] ${payload.description.substring(0, 50)}...`,
                    body: this.formatGitHubIssueBody(payload),
                    labels: [payload.issueType, payload.priority, payload.component]
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            return {
                success: true,
                message: 'Feedback submitted to GitHub Issues',
                ticketId: `#${result.number}`,
                timestamp: new Date().toISOString()
            };
            */

        } catch (error) {
            throw new Error(`Failed to submit feedback: ${(error as Error).message}`);
        }
    }

    private formatGitHubIssueBody(payload: any): string {
        let body = `## Issue Description\n${payload.description}\n\n`;
        
        body += `## Details\n`;
        body += `- **Type**: ${payload.issueType}\n`;
        body += `- **Priority**: ${payload.priority}\n`;
        body += `- **Component**: ${payload.component}\n`;
        body += `- **Contact**: ${payload.contactEmail || 'Anonymous'}\n\n`;

        if (payload.systemInfo) {
            body += `## System Information\n`;
            body += `- **Extension Version**: ${payload.systemInfo.extensionVersion}\n`;
            body += `- **VS Code Version**: ${payload.systemInfo.vscodeVersion}\n`;
            body += `- **OS**: ${payload.systemInfo.operatingSystem}\n`;
            body += `- **Platform**: ${payload.systemInfo.platform}\n`;
            body += `- **Architecture**: ${payload.systemInfo.architecture}\n\n`;
        }

        if (payload.awsDetails) {
            body += `## AWS Configuration\n`;
            body += `- **Connection Status**: ${payload.awsDetails.connectionStatus}\n`;
            body += `- **Profile**: ${payload.awsDetails.configuredProfile}\n`;
            body += `- **Region**: ${payload.awsDetails.configuredRegion}\n\n`;
        }

        if (payload.logs && payload.logs.length > 0) {
            body += `## Recent Logs\n\`\`\`\n${payload.logs.join('\n')}\n\`\`\`\n\n`;
        }

        body += `---\n*Submitted via Spec Driven Development Extension on ${payload.timestamp}*`;

        return body;
    }

    private generateSubmissionId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private async createGitHubIssue(payload: any): Promise<{ success: boolean; issueUrl?: string; error?: string }> {
        try {
            const title = `[${payload.issueType.toUpperCase()}] ${payload.component} - ${payload.priority}`;
            const body = this.formatGitHubIssueBody(payload);
            
            // Get GitHub token from VS Code settings
            const githubToken = config.getGitHubToken();
            
            if (!githubToken) {
                return {
                    success: false,
                    error: 'GitHub token not configured. Please set vibeAssistant.githubToken in VS Code settings.'
                };
            }

            // Try creating issue with labels first, fallback to no labels if permission denied
            let issueData = {
                title: title,
                body: body,
                labels: [
                    payload.issueType.toLowerCase().replace(' ', '-'),
                    `priority-${payload.priority.toLowerCase()}`,
                    `component-${payload.component.toLowerCase().replace(' ', '-')}`
                ]
            };

            console.log('Creating GitHub issue with data:', issueData);
            console.log('API Endpoint:', this.feedbackEndpoints.github);
            
            const response = await fetch(this.feedbackEndpoints.github, {
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Authorization': `token ${githubToken}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Vibe-Code-Assistant-Extension'
                },
                body: JSON.stringify(issueData)
            });

            console.log('GitHub API Response:', response.status, response.statusText);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('GitHub API Error Details:', errorData);
                
                // If 403 and it's about labels, try again without labels
                if (response.status === 403 && errorData.message?.includes('labels')) {
                    console.log('Retrying without labels due to permission restrictions...');
                    
                    const issueDataNoLabels = {
                        title: title,
                        body: body + `\n\n---\n**Labels**: ${issueData.labels.join(', ')}`
                    };

                    const retryResponse = await fetch(this.feedbackEndpoints.github, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Authorization': `token ${githubToken}`,
                            'Content-Type': 'application/json',
                            'User-Agent': 'Vibe-Code-Assistant-Extension'
                        },
                        body: JSON.stringify(issueDataNoLabels)
                    });

                    if (retryResponse.ok) {
                        const result = await retryResponse.json();
                        return {
                            success: true,
                            issueUrl: result.html_url
                        };
                    }
                }
                
                // Check if it's a repository access issue
                if (response.status === 404) {
                    return {
                        success: false,
                        error: `Cannot create issues - insufficient permissions.\n\nYour token needs WRITE access to create issues.\n\nPlease:\n1. Go to ${config.getDocumentationUrls().tokenSettings}\n2. Edit your token\n3. Select 'repo' scope (full repository access)\n4. Update the token in VS Code\n\nCurrent token has read-only access.`
                    };
                }

                if (response.status === 403) {
                    return {
                        success: false,
                        error: `Permission denied (403).\n\nPossible issues:\n1. You may not have write access to this repository\n2. Your token may need additional permissions\n3. Repository may have restrictions\n\nError: ${errorData.message || response.statusText}`
                    };
                }
                
                return {
                    success: false,
                    error: `GitHub API Error: ${response.status} - ${errorData.message || response.statusText}`
                };
            }

            const result = await response.json();
            return {
                success: true,
                issueUrl: result.html_url
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to create GitHub issue: ${(error as Error).message}`
            };
        }
    }

    private async openEmailClient(payload: any): Promise<void> {
        try {
            const subject = `[Vibe Assistant] ${payload.issueType}: ${payload.component}`;
            const body = this.formatEmailBody(payload);
            
            // Replace with your actual email
            const emailAddress = 'feedback@yourextension.com';
            
            const mailtoUrl = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            
            await vscode.env.openExternal(vscode.Uri.parse(mailtoUrl));
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open email client: ${(error as Error).message}`);
        }
    }

    private formatEmailBody(payload: any): string {
        let body = `Issue Type: ${payload.issueType}\n`;
        body += `Priority: ${payload.priority}\n`;
        body += `Component: ${payload.component}\n\n`;
        body += `Description:\n${payload.description}\n\n`;
        
        if (payload.contactEmail && !payload.submitAnonymously) {
            body += `Contact: ${payload.contactEmail}\n\n`;
        }
        
        if (payload.systemInfo) {
            body += `--- System Information ---\n`;
            body += `Extension Version: ${payload.systemInfo.extensionVersion}\n`;
            body += `VS Code Version: ${payload.systemInfo.vscodeVersion}\n`;
            body += `OS: ${payload.systemInfo.operatingSystem}\n`;
            body += `Platform: ${payload.systemInfo.platform}\n\n`;
        }
        
        if (payload.awsDetails) {
            body += `--- AWS Details ---\n`;
            body += `Connection Status: ${payload.awsDetails.connectionStatus}\n`;
            body += `Profile: ${payload.awsDetails.configuredProfile}\n`;
            body += `Region: ${payload.awsDetails.configuredRegion}\n\n`;
        }
        
        if (payload.logs && payload.logs.length > 0) {
            body += `--- Recent Logs ---\n${payload.logs.join('\n')}\n\n`;
        }
        
        body += `---\nSubmitted via Spec Driven Development Extension on ${payload.timestamp}`;
        
        return body;
    }

    private async cacheSubmission(payload: any, result: FeedbackSubmissionResult): Promise<void> {
        try {
            const submission = {
                id: this.generateSubmissionId(),
                payload: {
                    issueType: payload.issueType,
                    priority: payload.priority,
                    component: payload.component,
                    description: payload.description?.substring(0, 100) + '...',
                    contactEmail: payload.submitAnonymously ? '[Anonymous]' : payload.contactEmail
                },
                result: result,
                timestamp: new Date().toISOString()
            };

            // Store most recent submission
            await this.context.globalState.update('vibeAssistant.lastFeedbackSubmission', submission);

            // Add to submission history
            const history = this.context.globalState.get<any[]>('vibeAssistant.feedbackHistory', []);
            const updatedHistory = [submission, ...history.slice(0, 9)]; // Keep last 10 submissions
            await this.context.globalState.update('vibeAssistant.feedbackHistory', updatedHistory);

        } catch (error) {
            console.error('Failed to cache feedback submission:', error);
        }
    }

    public async getSubmissionHistory(): Promise<any[]> {
        return this.context.globalState.get<any[]>('vibeAssistant.feedbackHistory', []);
    }

    public async getLastSubmission(): Promise<any> {
        return this.context.globalState.get('vibeAssistant.lastFeedbackSubmission');
    }

    public async clearSubmissionHistory(): Promise<void> {
        await this.context.globalState.update('vibeAssistant.lastFeedbackSubmission', undefined);
        await this.context.globalState.update('vibeAssistant.feedbackHistory', []);
    }

    /**
     * Quick feedback for common issues
     */
    public async submitQuickFeedback(type: 'connection-issue' | 'estimation-wrong' | 'ui-bug', description: string): Promise<FeedbackSubmissionResult> {
        const quickFeedbackData: FeedbackData = {
            issueType: 'bug',
            priority: type === 'connection-issue' ? 'high' : 'medium',
            component: type === 'connection-issue' ? 'aws-integration' : 
                      type === 'estimation-wrong' ? 'estimation-parser' : 'ui',
            description: description,
            includeSystemInfo: true,
            includeLogs: true,
            includeAWSDetails: type === 'connection-issue',
            submitAnonymously: true
        };

        return await this.submitFeedback(quickFeedbackData);
    }

    public dispose(): void {
        // Cleanup if needed
    }
}