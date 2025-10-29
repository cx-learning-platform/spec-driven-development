import * as vscode from 'vscode';
import * as path from 'path';

export class SpecDrivenDevelopmentPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'specDrivenDevelopmentPanel';

    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;

    constructor(private readonly extensionContext: vscode.ExtensionContext) {
        this._context = extensionContext;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [
                this._context.extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'connectAWS':
                        vscode.commands.executeCommand('specDrivenDevelopment.connectAWS');
                        break;
                    case 'refreshAWSConnection':
                        vscode.commands.executeCommand('specDrivenDevelopment.refreshAWSConnection');
                        break;
                    case 'updateJiraIssue':
                        vscode.commands.executeCommand('specDrivenDevelopment.updateJiraIssue', message.data);
                        break;
                    case 'submitFeedback':
                        vscode.commands.executeCommand('specDrivenDevelopment.submitFeedback', message.data);
                        break;

                    case 'loadInitiatives':
                        vscode.commands.executeCommand('specDrivenDevelopment.loadInitiatives');
                        break;

                    case 'loadEpics':
                        vscode.commands.executeCommand('specDrivenDevelopment.loadEpics', message.initiativeId);
                        break;

                    case 'loadEpicsForInitiative':
                        vscode.commands.executeCommand('specDrivenDevelopment.loadEpicsForInitiative', message.jiraTeam);
                        break;

                    case 'loadSprintDetails':
                        vscode.commands.executeCommand('specDrivenDevelopment.loadSprintDetails');
                        break;

                    case 'loadSprintsForTeam':
                        vscode.commands.executeCommand('specDrivenDevelopment.loadSprintsForTeam', message.teamName);
                        break;

                    case 'autoPopulateFromGit':
                        vscode.commands.executeCommand('specDrivenDevelopment.autoPopulateFromGit');
                        break;

                    case 'getEstimationData':
                        this.handleGetEstimationData();
                        break;

                    case 'getAWSStatus':
                        this.handleGetAWSStatus();
                        break;

                    case 'getEnhancedAWSStatus':
                        this.updateEnhancedAWSStatus();
                        break;
                    
                    case 'retrieveWipTasks':
                        vscode.commands.executeCommand('specDrivenDevelopment.retrieveWipTasks', message.data);
                        break;
                    
                    case 'retrieveRunningTasks':
                        vscode.commands.executeCommand('specDrivenDevelopment.retrieveRunningTasks', message.data);
                        break;
                    
                    case 'retrieveArchivedTasks':
                        vscode.commands.executeCommand('specDrivenDevelopment.retrieveArchivedTasks', message.data);
                        break;
                    
                    case 'editTask':
                        vscode.commands.executeCommand('specDrivenDevelopment.editTask', message.data);
                        break;
                    
                    case 'deleteTask':
                        vscode.commands.executeCommand('specDrivenDevelopment.deleteTask', message.data);
                        break;
                    
                    case 'cleanupTask':
                        vscode.commands.executeCommand('specDrivenDevelopment.cleanupTask', message.data);
                        break;
                    
                    case 'restoreTask':
                        vscode.commands.executeCommand('specDrivenDevelopment.restoreTask', message.data);
                        break;
                    
                    case 'saveTaskUpdates':
                        vscode.commands.executeCommand('specDrivenDevelopment.saveTaskUpdates', message.data);
                        break;
                    
                    case 'importTaskMaster':
                        vscode.commands.executeCommand('specDrivenDevelopment.importTaskMaster');
                        break;
                    
                    case 'checkDuplicateTaskMaster':
                        vscode.commands.executeCommand('specDrivenDevelopment.checkDuplicateTaskMaster', message.data);
                        break;
                    
                    case 'searchTasks':
                        if (message.data.taskType === 'wip') {
                            vscode.commands.executeCommand('specDrivenDevelopment.retrieveWipTasks', message.data);
                        } else {
                            vscode.commands.executeCommand('specDrivenDevelopment.retrieveRunningTasks', message.data);
                        }
                        break;
                }
            },
            undefined,
            this._context.subscriptions
        );
    }

    public updateAWSStatus(status: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateAWSStatus',
                data: status
            });
        }
    }

    public updateEstimationData(estimation: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateEstimationData',
                data: estimation
            });
        }
    }

    // public showEstimationNotification(estimation: any) {
    //     if (this._view) {
    //         this._view.webview.postMessage({
    //             command: 'showEstimationNotification',
    //             data: estimation
    //         });
    //     }
    // }

    public updateJiraStatus(status: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateJiraStatus',
                data: status
            });
        }
    }

    public sendInitiatives(initiatives: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'initiativesLoaded',
                data: initiatives
            });
        }
    }

    public sendInitiativesError(error: string) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'initiativesError',
                data: { message: error }
            });
        }
    }

    public sendEpics(epics: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'epicsLoaded',
                data: epics
            });
        }
    }

    public sendSprintDetails(sprints: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'sprintDetailsLoaded',
                data: sprints
            });
        }
    }

    public sendAutoPopulationResult(result: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'autoPopulationResult',
                data: result
            });
        }
    }

    public sendFeedbackResult(result: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'feedbackResult',
                data: result
            });
        }
    }

    public sendTaskList(tasks: any[], taskType: 'wip' | 'running' | 'archived', pagination?: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'taskListLoaded',
                data: {
                    tasks,
                    taskType,
                    pagination
                }
            });
        }
    }

    public sendTaskActionResult(result: any, action: string) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'taskActionResult',
                data: {
                    result,
                    action
                }
            });
        }
    }

    public sendTaskNotification(command: string, data: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command,
                data
            });
        }
    }

    public showTaskEditForm(taskData: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'showTaskEditForm',
                data: taskData
            });
        }
    }

    public sendTaskMasterData(taskData: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'populateFromTaskMaster',
                data: taskData
            });
        }
    }

    public sendTaskMasterError(errorMessage: string) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'taskMasterError',
                data: { error: errorMessage }
            });
        }
    }

    public sendDuplicateCheckResult(result: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'duplicateTaskMasterCheck',
                data: result
            });
        }
    }

    private handleGetEstimationData() {
        // Get cached estimation data
        const estimationData = this._context.globalState.get('specDrivenDevelopment.estimationData');
        if (this._view) {
            this._view.webview.postMessage({
                command: 'estimationDataResponse',
                data: estimationData || null
            });
        }
        // Note: Do not automatically show notification here - only show when explicitly requested
    }

    private async handleGetAWSStatus() {
        // Get real-time AWS connection status
        try {
            // Use the new command to get real-time status
            await vscode.commands.executeCommand('specDrivenDevelopment.getRealTimeAWSStatus');
        } catch (error) {
            // Fallback to cached status if real-time check fails
            const awsStatus = this._context.globalState.get('specDrivenDevelopment.awsStatus');
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'awsStatusResponse',
                    data: awsStatus || { connected: false, status: 'disconnected', error: 'Failed to get real-time status' }
                });
            }
        }
    }

    /**
     * Enhanced AWS status check that validates secret content
     */
    public async updateEnhancedAWSStatus() {
        try {
            // Get enhanced status from AWS service
            const enhancedStatus = await vscode.commands.executeCommand('specDrivenDevelopment.getEnhancedAWSStatus') as any;
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'updateEnhancedAWSStatus',
                    data: enhancedStatus
                });
            }
        } catch (error) {
            console.error('Failed to get enhanced AWS status:', error);
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'updateEnhancedAWSStatus',
                    data: {
                        awsConnected: false,
                        secretExists: false,
                        secretValid: false,
                        errorMessage: `Failed to check AWS status: ${error}`
                    }
                });
            }
        }
    }



    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.js'));
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.css'));

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${styleMainUri}" rel="stylesheet">
                <title>Spec Driven Development</title>
            </head>
            <body>
                <div class="container">
                    <header class="header">
                        <h1>🎯 Spec Driven Development</h1>
                    </header>
                    
                    <div class="tab-container">
                        <div class="tabs">
                            <button class="tab-button active" data-tab="aws-config">Configurations</button>
                            <button class="tab-button" data-tab="feedback">Manage Features</button>
                            <button class="tab-button" data-tab="devsecops-hub">My Task List</button>
                        </div>
                        
                        <!-- Configurations Tab -->
                        <div class="tab-content active" id="aws-config">
                            <div class="status-section">
                                <div class="status-indicator" id="aws-status-indicator">
                                    <span class="status-dot status-disconnected"></span>
                                    <span class="status-text" id="aws-status-text">Not Connected</span>
                                </div>
                            </div>
                            
                            <div class="section">
                                <h3>AWS CLI Integration</h3>
                                <ul class="feature-list">
                                    <li>• Uses your local AWS CLI credentials</li>
                                    <li>• Automatic credential detection</li>
                                    <li>• Secure connection to Secrets Manager</li>
                                </ul>
                                
                                <!-- Secret Validation Section - Always visible, matching Connection Details style -->
                                <div class="secret-validation-section" id="secret-validation-section" style="margin-top: 15px;">
                                    <h4>Secret Validation:</h4>
                                    <div class="connection-status-card" id="secret-validation-card">
                                        <div class="connection-header">
                                            <span class="connection-icon" id="secret-validation-icon">🔍</span>
                                            <span class="connection-title" id="secret-validation-title">Checking Secret...</span>
                                        </div>
                                        <div class="connection-info" id="secret-validation-info">
                                            <div class="info-row">
                                                <span class="info-label">Status:</span>
                                                <span class="info-value" id="secret-status-value">Pending validation</span>
                                            </div>
                                            <div class="info-row">
                                                <span class="info-label">Missing Fields:</span>
                                                <span class="info-value" id="secret-missing-fields">Checking...</span>
                                            </div>
                                            <div class="info-row" id="secret-details-row" style="display: none;">
                                                <span class="info-label">Details:</span>
                                                <span class="info-value" id="secret-details-value">-</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="button-group">
                                    <button class="primary-button" id="connect-aws-btn">
                                        🔌 Connect to AWS SM
                                    </button>
                                    <button class="secondary-button" id="refresh-aws-btn" style="display: none;">
                                        🔄 Refresh Connection
                                    </button>
                                </div>
                                
                                <div class="connection-details" id="aws-connection-details" style="display: none;">
                                    <h4>Connection Details:</h4>
                                    <div id="aws-details-content"></div>
                                </div>
                                
                                <div class="loading-indicator" id="aws-loading" style="display: none;">
                                    <div class="loading-spinner"></div>
                                    <div class="loading-steps" id="loading-steps"></div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Manage Features Tab -->
                        <div class="tab-content" id="feedback">
                            <div class="section">
                                <div class="section-header">
                                    <h3>Create Feature</h3>
                                    <button class="import-taskmaster-btn" id="import-taskmaster-btn">
                                        📥 Import from TaskMaster
                                    </button>
                                </div>

                                <!-- Task Selection (Hidden by default) -->
                                <div class="task-selection-section" id="task-selection-section" style="display: none;">
                                    <div class="task-selection-content">
                                        <label for="task-dropdown">Select TaskMaster Task:</label>
                                        <div class="task-selection-row">
                                            <select id="task-dropdown" class="task-dropdown">
                                                <option value="">Choose a task...</option>
                                            </select>
                                            <button class="import-selected-btn" id="import-selected-btn" disabled>
                                                Import Selected
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="input-group">
                                    <label for="feedback-name">Name: <span class="required">*</span></label>
                                    <input type="text" id="feedback-name" placeholder="e.g. AWS Integration Enhancement" required />
                                </div>
                                
                                <div class="input-group">
                                    <label for="feedback-type">Type: <span class="required">*</span></label>
                                    <select id="feedback-type" required>
                                        <option value="">Select Jira Type...</option>
                                        <option value="Story">Story</option>
                                        <option value="Bug">Bug</option>
                                        <option value="Defect">Defect</option>
                                    </select>
                                </div>
                                
                                <div class="input-group">
                                    <label for="estimated-hours">Estimated Hours: <span class="required">*</span></label>
                                    <input type="number" id="estimated-hours" min="0.5" step="0.5" placeholder="e.g. 8 or 8.5 hours" required />
                                </div>
                                
                                <div class="input-group">
                                    <label for="initiative">Initiative: <span class="required">*</span><span id="auto-populate-badge" style="display: none;"></span></label>
                                    <select id="initiative" required>
                                        <option value="">Loading initiatives...</option>
                                    </select>
                                </div>
                                
                                <div class="input-group">
                                    <label for="epic">Epic: <span class="required">*</span></label>
                                    <select id="epic" required>
                                        <option value="">Loading epics...</option>
                                    </select>
                                </div>
                                
                                <div class="input-group">
                                    <label for="work-type">Work Type:</label>
                                    <select id="work-type">
                                        <option value="">Select Work Type...</option>
                                        <option value="New Functionality / Feature">New Functionality / Feature</option>
                                        <option value="RTB">RTB</option>
                                        <option value="Enabler / Innovation">Enabler / Innovation</option>
                                        <option value="Quality">Quality</option>
                                    </select>
                                </div>
                                
                                <div class="input-group">
                                    <label for="jira-priority">JIRA Priority:</label>
                                    <select id="jira-priority">
                                        <option value="">Select Priority...</option>
                                        <option value="Severe-P1">Severe-P1</option>
                                        <option value="Critical-P2">Critical-P2</option>
                                        <option value="Major-P3">Major-P3</option>
                                        <option value="Minor-P4">Minor-P4</option>
                                    </select>
                                </div>
                                
                                <div class="input-group">
                                    <label for="jira-sprint">JIRA Sprint:</label>
                                    <select id="jira-sprint">
                                        <option value="">Loading sprints...</option>
                                    </select>
                                </div>
                                
                                <div class="input-group">
                                    <label for="feedback-description">Description: <span class="required">*</span></label>
                                    <textarea id="feedback-description" rows="6" placeholder="Please describe the feature in detail..." required></textarea>
                                </div>
                                
                                <div class="input-group" id="acceptance-criteria-group" style="display: none;">
                                    <label for="acceptance-criteria">Acceptance Criteria: <span class="required">*</span></label>
                                    <textarea id="acceptance-criteria" rows="4" placeholder="Define acceptance criteria for this story..."></textarea>
                                </div>
                                

                                
                                <div class="button-group">
                                    <button class="primary-button" id="submit-feedback-btn">
                                        Submit Feature
                                    </button>
                                    <button class="secondary-button" id="load-data-btn">
                                        Refresh Tab
                                    </button>
                                </div>
                                
                                <div class="feedback-result" id="feedback-result"></div>
                            </div>
                        </div>
                        
                        <!-- My Task List Tab -->
                        <div class="tab-content" id="devsecops-hub">
                            <div class="prerequisites" id="hub-prerequisites">
                                <div class="prerequisite-item">
                                    <span class="prereq-status" id="prereq-aws-status">❌</span>
                                    <span>AWS Connected</span>
                                </div>
                            </div>
                            
                            <div class="section">
                                <h3>Task Management</h3>
                                
                                <!-- Task List Navigation -->
                                <div class="task-nav-buttons">
                                    <button class="secondary-button" id="retrieve-wip-btn">
                                        WIP Tickets
                                    </button>
                                    <button class="secondary-button active" id="running-tasks-btn">
                                        Tickets List
                                    </button>
                                    <button class="secondary-button" id="archived-tasks-btn">
                                        Done Tickets
                                    </button>
                                </div>
                                
                                <!-- Search Bar -->
                                <div class="search-container" id="search-container" style="display: none;">
                                    <div class="input-group">
                                        <input type="text" id="task-search-input" placeholder="Search by ticket ID, name, or description..." />
                                        <button class="secondary-button" id="task-search-btn">Search</button>
                                        <button class="secondary-button" id="task-clear-search-btn" style="display: none;">Clear</button>
                                    </div>
                                </div>

                                <!-- Task List Container -->
                                <div class="task-list-container" id="task-list-container">
                                    <div class="task-list-header">
                                        <h4 id="task-list-title">Tickets List</h4>
                                        <div class="task-count" id="task-count">0 tasks</div>
                                    </div>
                                    
                                    <div class="task-list-content" id="task-list-content">
                                        <div class="loading-indicator" id="task-loading" style="display: none;">
                                            <div class="loading-spinner"></div>
                                            <span>Loading tasks...</span>
                                        </div>
                                        
                                        <div class="empty-state" id="task-empty-state">
                                            <p>No tasks found. Click "WIP Tickets" or "Tickets List" to load tasks.</p>
                                        </div>
                                        
                                        <div class="task-list" id="task-list" style="display: none;">
                                            <!-- Tasks will be populated here -->
                                        </div>
                                        
                                        <!-- Pagination Controls -->
                                        <div class="pagination-controls" id="pagination-controls" style="display: none;">
                                            <button class="secondary-button" id="prev-page-btn" disabled>← Previous</button>
                                            <span class="pagination-info" id="pagination-info">Page 1 of 1</span>
                                            <button class="secondary-button" id="next-page-btn" disabled>Next →</button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Task Edit Modal -->
                                <div class="task-edit-modal" id="task-edit-modal" style="display: none;">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            <h3>Edit Task</h3>
                                            <button class="close-btn" id="close-edit-modal">×</button>
                                        </div>
                                        <div class="modal-body">
                                            <form id="task-edit-form">
                                                <div class="input-group">
                                                    <label for="edit-task-name">Name:</label>
                                                    <input type="text" id="edit-task-name" required />
                                                </div>
                                                
                                                <div class="input-group">
                                                    <label for="edit-task-description">Description:</label>
                                                    <textarea id="edit-task-description" rows="4"></textarea>
                                                </div>
                                                
                                                <!-- AI-Adopted Toggle Switch -->
                                                <div class="input-group">
                                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                                        <label for="edit-ai-adopted" style="margin: 0; font-weight: 500;">AI-Adopted</label>
                                                        <label class="toggle-switch">
                                                            <input type="checkbox" id="edit-ai-adopted" checked />
                                                            <span class="toggle-slider"></span>
                                                        </label>
                                                    </div>
                                                    <div style="color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 4px;">
                                                        Indicates if AI was used in the development
                                                    </div>
                                                </div>
                                                
                                                <div class="input-group">
                                                    <label for="edit-estimated-hours">Estimated Hours:</label>
                                                    <div class="estimation-input-group">
                                                        <input type="number" id="edit-estimated-hours" step="0.5" min="0" placeholder="e.g. 8 or 8.5 hours" />
                                                        <select id="edit-estimation-unit">
                                                            <option value="hours">Hours</option>
                                                            <option value="days">Days</option>
                                                            <option value="weeks">Weeks</option>
                                                            <option value="months">Months</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                
                                                <div class="input-group">
                                                    <label for="edit-task-type">Type:</label>
                                                    <select id="edit-task-type" disabled>
                                                        <option value="Story">Story</option>
                                                        <option value="Bug">Bug</option>
                                                        <option value="Defect">Defect</option>
                                                    </select>
                                                    <small style="color: #888; font-size: 0.85em;">Type cannot be changed after creation</small>
                                                </div>
                                                
                                                <div class="input-group">
                                                    <label for="edit-task-priority">Priority:</label>
                                                    <select id="edit-task-priority">
                                                        <option value="Severe-P1">Severe-P1</option>
                                                        <option value="Critical-P2">Critical-P2</option>
                                                        <option value="Major-P3">Major-P3</option>
                                                        <option value="Minor-P4">Minor-P4</option>
                                                    </select>
                                                </div>
                                                
                                                <div class="input-group">
                                                    <label for="edit-work-type">Work Type:</label>
                                                    <select id="edit-work-type">
                                                        <option value="">Select Work Type...</option>
                                                        <option value="New Functionality / Feature">New Functionality / Feature</option>
                                                        <option value="RTB">RTB</option>
                                                        <option value="Enabler / Innovation">Enabler / Innovation</option>
                                                        <option value="Quality">Quality</option>
                                                    </select>
                                                </div>
                                                
                                                <div class="input-group">
                                                    <label for="edit-task-status">Status:</label>
                                                    <select id="edit-task-status">
                                                        <option value="Backlog">Backlog</option>
                                                        <option value="In Development">In Development</option>
                                                        <option value="QA">QA</option>
                                                        <option value="Done">Done</option>
                                                    </select>
                                                </div>
                                                
                                                <!-- Fields shown when Status = Done -->
                                                <div class="input-group" id="deployment-date-group" style="display: none;">
                                                    <label for="edit-deployment-date">Deployment Date: <span class="required">*</span></label>
                                                    <input type="date" id="edit-deployment-date" />
                                                </div>
                                                
                                                <div class="input-group" id="actual-hours-group" style="display: none;">
                                                    <label for="edit-actual-hours">Actual Hours: <span class="required">*</span></label>
                                                    <input type="number" id="edit-actual-hours" step="0.5" min="0" placeholder="e.g., 12.5" />
                                                </div>
                                                
                                                <div class="input-group" id="resolution-group" style="display: none;">
                                                    <label for="edit-resolution">Jira Resolution: <span class="required">*</span></label>
                                                    <select id="edit-resolution">
                                                        <option value="">Select Resolution...</option>
                                                        <option value="Fixed">Fixed</option>
                                                        <option value="Done">Done</option>
                                                        <option value="Won't Fix">Won't Fix</option>
                                                        <option value="Duplicate">Duplicate</option>
                                                        <option value="Cannot Reproduce">Cannot Reproduce</option>
                                                        <option value="Incomplete">Incomplete</option>
                                                        <option value="Won't Do">Won't Do</option>
                                                    </select>
                                                </div>
                                                
                                                <div class="input-group">
                                                    <label for="edit-acceptance-criteria">Acceptance Criteria:</label>
                                                    <textarea id="edit-acceptance-criteria" rows="3"></textarea>
                                                </div>
                                                
                                                <input type="hidden" id="edit-task-id" />
                                                <input type="hidden" id="edit-epic-id" />
                                            </form>
                                        </div>
                                        <div class="modal-footer">
                                            <button class="secondary-button" id="cancel-edit-btn">Cancel</button>
                                            <button class="primary-button" id="save-task-btn">Save Changes</button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Task View Modal (Read-only) -->
                                <div class="task-view-modal" id="task-view-modal" style="display: none;">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            <h3>View Task Details</h3>
                                            <button class="close-btn" id="close-view-modal">×</button>
                                        </div>
                                        <div class="modal-body">
                                            <div class="view-group">
                                                <label>Name:</label>
                                                <div class="view-value" id="view-task-name"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>JIRA Ticket:</label>
                                                <div class="view-value" id="view-jira-link"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>Description:</label>
                                                <div class="view-value" id="view-task-description"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>Status:</label>
                                                <div class="view-value" id="view-task-status"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>Type:</label>
                                                <div class="view-value" id="view-task-type"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>Priority:</label>
                                                <div class="view-value" id="view-task-priority"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>Work Type:</label>
                                                <div class="view-value" id="view-work-type"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>JIRA Sprint:</label>
                                                <div class="view-value" id="view-jira-sprint"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>Estimated Hours:</label>
                                                <div class="view-value" id="view-estimated-hours"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>Actual Hours:</label>
                                                <div class="view-value" id="view-actual-hours"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>Acceptance Criteria:</label>
                                                <div class="view-value" id="view-acceptance-criteria"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>Resolution:</label>
                                                <div class="view-value" id="view-resolution"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>Epic ID:</label>
                                                <div class="view-value" id="view-epic-id"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>Deployment Date:</label>
                                                <div class="view-value" id="view-deployment-date"></div>
                                            </div>
                                            
                                            <div class="view-group">
                                                <label>AI-Adopted:</label>
                                                <div class="view-value" id="view-ai-adopted"></div>
                                            </div>
                                        </div>
                                        <div class="modal-footer">
                                            <button class="primary-button" id="close-view-btn">Close</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        

                    </div>
                    
                    <!-- Estimation Notification Popup - REMOVED per user request -->
                </div>
                
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
