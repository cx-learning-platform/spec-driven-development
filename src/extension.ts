import * as vscode from 'vscode';
import * as path from 'path';
import { InstructionManager, Instruction } from './instructionManager';
import { PromptManager } from './promptManager';
import { ContextAnalyzer } from './contextAnalyzer';
import { CopilotIntegration } from './copilotIntegration';
import { ResourceManager } from './resourceManager';
import { VibeAssistantPanel } from './ui/webviewPanel';
import { AWSService } from './services/awsService';
import { EstimationParser } from './services/estimationParser';
import { JiraService } from './services/jiraService';
import { FeedbackService } from './services/feedbackService';
import { config } from './utils/configurationManager';
import { NotificationManager } from './services/notificationManager';

let instructionManager: InstructionManager;
let promptManager: PromptManager;
let contextAnalyzer: ContextAnalyzer;
let copilotIntegration: CopilotIntegration;
let resourceManager: ResourceManager;
let vibeAssistantPanel: VibeAssistantPanel;
let awsService: AWSService;
let estimationParser: EstimationParser;
let jiraService: JiraService;
let feedbackService: FeedbackService;
let notificationManager: NotificationManager;

// Global timeout variable
declare global {
    var vibeAnalysisTimeout: any;
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('🎯 Spec Driven Development is now active!');

    try {
        // Clear any stale cached estimation data on activation to prevent unwanted notifications
        await context.globalState.update('vibeAssistant.estimationData', undefined);
        
        // Initialize managers
        instructionManager = new InstructionManager(context.extensionPath);
        promptManager = new PromptManager(context.extensionPath);
        contextAnalyzer = new ContextAnalyzer();
        copilotIntegration = new CopilotIntegration();
        resourceManager = new ResourceManager();

        // Load resource files
        await resourceManager.loadResourceFiles();

        // Initialize new services
        awsService = new AWSService(context);
        estimationParser = new EstimationParser(context);
        jiraService = new JiraService(context, awsService);
        feedbackService = new FeedbackService(context);
        
        // Initialize notification manager
        notificationManager = NotificationManager.getInstance(context);

        // Initialize UI providers
        vibeAssistantPanel = new VibeAssistantPanel(context);

        // Register webview panel provider
        vscode.window.registerWebviewViewProvider('vibeAssistantPanel', vibeAssistantPanel);

        // Register commands
        registerCommands(context);

        // Set up event listeners
        setupEventListeners(context);

        // Auto-apply instructions on file open if enabled
        setupAutoApplyInstructions(context);

        // Initialize workspace with copilot instructions
        await initializeWorkspace();

        // Show status bar - updated to open the new panel
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = "$(dashboard) Vibe Assistant";
        statusBarItem.tooltip = "Spec Driven Development - Click to open panel (AWS, JIRA, Feedback)";
        statusBarItem.command = 'vibeAssistant.openPanel';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Show welcome message for first-time users
        const hasShownWelcome = context.globalState.get('hasShownWelcome', false);
        if (!hasShownWelcome) {
            const action = await vscode.window.showInformationMessage(
                '🎉 Welcome to Spec Driven Development! Click the status bar to open the management panel with AWS integration, JIRA connectivity, and feedback system.',
                'Open Panel',
                'Learn More',
                'Got it'
            );
            
            if (action === 'Open Panel') {
                vscode.commands.executeCommand('vibeAssistant.openPanel');
            } else if (action === 'Learn More') {
                vscode.env.openExternal(vscode.Uri.parse(config.getDocumentationUrls().readme));
            }
            
            await context.globalState.update('hasShownWelcome', true);
        }

        // Check if GitHub Copilot is available
        setTimeout(async () => {
            const availableCommands = await vscode.commands.getCommands();
            const hasCopilot = availableCommands.some(cmd => cmd.includes('github.copilot'));
            
            if (hasCopilot) {
                console.log('✅ GitHub Copilot detected - full integration available');
            } else {
                console.log('ℹ️ GitHub Copilot not detected - extension will work with limited features');
            }
        }, 2000);

        console.log('✅ Spec Driven Development activated successfully');

    } catch (error) {
        console.error('❌ Failed to activate Spec Driven Development:', error);
        vscode.window.showErrorMessage(`Failed to activate Spec Driven Development: ${error}`);
    }
}

async function initializeWorkspace(): Promise<void> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            // Create initial copilot instructions with essential best practices
            const essentialInstructions = instructionManager.getEssentialInstructions();
            if (essentialInstructions.length > 0) {
                await copilotIntegration.createOrUpdateCopilotInstructionsFile(essentialInstructions);
                console.log('📝 Created initial copilot instructions');
            }
        }
    } catch (error) {
        console.error('Failed to initialize workspace:', error);
    }
}

function registerCommands(context: vscode.ExtensionContext) {
    // Analyze Code & Apply Instructions
    const analyzeCodeCommand = vscode.commands.registerCommand('vibeAssistant.analyzeCode', async () => {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                await notificationManager.showOperationResult({
                    type: 'analysis',
                    success: false,
                    summary: 'No active editor found',
                    details: ['Please open a file to analyze']
                });
                return;
            }

            // Mark as manual command to show notifications
            copilotIntegration.setManualCommand();

            const result = await notificationManager.withProgress(
                'analyze-code',
                'Analyzing code and applying instructions...',
                async (progress) => {
                    progress.report({ increment: 20, message: "Analyzing file context..." });

                    // Analyze current context
                    const codeContext = contextAnalyzer.analyzeCurrentContext();
                    
                    // Get all instructions with pre-selection based on current file
                    const instructionsWithSelection = instructionManager.getAllInstructionsWithSelection(activeEditor.document.fileName);
                    
                    if (instructionsWithSelection.length === 0) {
                        throw new Error('No instructions available for this file context');
                    }

                    progress.report({ increment: 20, message: "Preparing instruction selection..." });

                    // Create multi-select quick pick items
                    const quickPickItems: (vscode.QuickPickItem & { instruction: Instruction })[] = instructionsWithSelection.map(({ instruction, preSelected }) => ({
                        label: `${preSelected ? '🟣 ' : '⚪ '}${instruction.name}`,
                        description: `${instruction.mode} • ${instruction.id}${preSelected ? ' • 🟣 Auto-selected' : ''}`,
                        detail: instruction.description,
                        picked: preSelected,
                        instruction: instruction
                    }));

                    progress.report({ increment: 10, message: "Showing selection dialog..." });

                    // Show multi-select quick pick
                    const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
                        canPickMany: true,
                        placeHolder: `Select instructions for ${path.basename(activeEditor.document.fileName)} (${codeContext.language || 'unknown'})`,
                        matchOnDescription: true,
                        matchOnDetail: true,
                        ignoreFocusOut: true,
                        title: `📋 Choose Instructions for ${path.basename(activeEditor.document.fileName)}`
                    }) as (vscode.QuickPickItem & { instruction: Instruction })[] | undefined;

                    if (!selectedItems || selectedItems.length === 0) {
                        throw new Error('No instructions selected');
                    }

                    progress.report({ increment: 30, message: "Applying instructions..." });

                    // Extract selected instructions
                    const selectedInstructions = selectedItems.map(item => item.instruction);
                    
                    // Get contextual prompts
                    const prompts = promptManager.suggestPromptForContext(codeContext);
                    const bestPrompt = prompts.length > 0 ? prompts[0] : undefined;

                    progress.report({ increment: 20, message: "Sending to Copilot Chat..." });

                    // Apply selected instructions to Copilot with auto-paste
                    await copilotIntegration.applyInstructionsToWorkspaceWithAutoPaste(selectedInstructions, bestPrompt);
                    
                    return {
                        selectedInstructions,
                        bestPrompt,
                        codeContext,
                        fileName: activeEditor.document.fileName
                    };
                }
            );

            // Single consolidated success notification
            await notificationManager.showOperationResult({
                type: 'instruction',
                success: true,
                summary: `Applied ${result.selectedInstructions.length} instruction(s) to ${path.basename(result.fileName)}`,
                details: [
                    `📄 File: ${path.basename(result.fileName)}`,
                    `💻 Language: ${result.codeContext.language || 'unknown'}`,
                    `🎯 Instructions: ${result.selectedInstructions.map(i => i.name).join(', ')}`,
                    ...(result.bestPrompt ? [`📝 Prompt: ${result.bestPrompt.name}`] : [])
                ]
            });

        } catch (error) {
            await notificationManager.showOperationResult({
                type: 'instruction',
                success: false,
                summary: `Failed to analyze code: ${error instanceof Error ? error.message : String(error)}`,
                details: ['Please try again or check the file content']
            });
        }
    });

    // Suggest Contextual Prompt
    const suggestPromptCommand = vscode.commands.registerCommand('vibeAssistant.suggestPrompt', async () => {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }

            // Get all prompts with pre-selection based on current file
            const promptsWithSelection = promptManager.getAllPromptsWithSelection(activeEditor.document.fileName);
            
            if (promptsWithSelection.length === 0) {
                vscode.window.showInformationMessage('No prompts available');
                return;
            }

            // Create multi-select quick pick items
            const quickPickItems: (vscode.QuickPickItem & { prompt: any })[] = promptsWithSelection.map(({ prompt, preSelected }) => ({
                label: `${preSelected ? '🟣 ' : '⚪ '}${prompt.name}`,
                description: `${prompt.mode} • ${prompt.category}${preSelected ? ' • 🟣 Auto-selected' : ''}`,
                detail: prompt.description,
                picked: preSelected, // Pre-select relevant prompts
                prompt: prompt
            }));

            // Show multi-select quick pick
            const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
                canPickMany: true,
                placeHolder: `Select prompts to apply (${promptsWithSelection.filter(p => p.preSelected).length} file-relevant prompts pre-selected)`,
                matchOnDescription: true,
                matchOnDetail: true,
                ignoreFocusOut: true,
                title: `🎯 Choose Prompts for ${path.basename(activeEditor.document.fileName)}`
            }) as (vscode.QuickPickItem & { prompt: any })[] | undefined;

            if (!selectedItems || selectedItems.length === 0) {
                vscode.window.showInformationMessage('No prompts selected. Operation cancelled.');
                return;
            }

            // Show progress while processing
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Applying ${selectedItems.length} prompt(s)...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 50, message: "Preparing prompts for Copilot Chat..." });
                
                // Apply selected prompts (ONLY prompts, no instructions)
                const selectedPrompts = selectedItems.map(item => item.prompt);
                const promptSummary = selectedPrompts.map((p: any) => p.name).join(', ');
                
                await copilotIntegration.sendPromptsToCopilotChatWithAutoPaste(
                    `Please help me with these prompts: ${promptSummary}`,
                    selectedPrompts
                );
                
                progress.report({ increment: 50, message: "Opening Copilot Chat..." });
                
                // Show success message
                vscode.window.showInformationMessage(
                    `✅ ${selectedPrompts.length} prompt(s) sent to Copilot Chat!\n` +
                    `Applied: ${promptSummary}`
                );
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to suggest prompt: ${error}`);
        }
    });

    // Open Instructions Panel
    const openInstructionsCommand = vscode.commands.registerCommand('vibeAssistant.openInstructions', () => {
        vscode.commands.executeCommand('vibeAssistantInstructions.focus');
    });

    // Apply Copilot Instructions
    const applyCopilotInstructionsCommand = vscode.commands.registerCommand('vibeAssistant.applyCopilotInstructions', async () => {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }

            // Mark as manual command to show notifications
            copilotIntegration.setManualCommand();

            const instructions = instructionManager.getInstructionsForFile(activeEditor.document.fileName);
            
            if (instructions.length === 0) {
                vscode.window.showInformationMessage('No instructions available for this file type');
                return;
            }

            await copilotIntegration.applyInstructionsToWorkspace(instructions);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply instructions: ${error}`);
        }
    });

    // Show Prompts Sidebar
    const showPromptSidebarCommand = vscode.commands.registerCommand('vibeAssistant.showPromptSidebar', () => {
        vscode.commands.executeCommand('vibeAssistantPrompts.focus');
    });

    // Refresh Instructions
    const refreshInstructionsCommand = vscode.commands.registerCommand('vibeAssistant.refreshInstructions', () => {
        instructionManager.refreshInstructions();
        vscode.window.showInformationMessage('Instructions refreshed successfully');
    });

    // Refresh Prompts
    const refreshPromptsCommand = vscode.commands.registerCommand('vibeAssistant.refreshPrompts', () => {
        promptManager.refreshPrompts();
        vscode.window.showInformationMessage('Prompts refreshed successfully');
    });

    // Search Instructions
    const searchInstructionsCommand = vscode.commands.registerCommand('vibeAssistant.searchInstructions', async () => {
        const query = await vscode.window.showInputBox({
            placeHolder: 'Search instructions...',
            prompt: 'Enter search terms for instructions'
        });

        if (query) {
            const results = instructionManager.searchInstructions(query);
            
            if (results.length === 0) {
                vscode.window.showInformationMessage('No instructions found matching your search');
                return;
            }

            const items = results.map(instruction => ({
                label: instruction.name,
                description: instruction.mode,
                detail: instruction.description,
                instruction: instruction
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select an instruction to view',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                const doc = await vscode.workspace.openTextDocument({
                    content: selected.instruction.content,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);
            }
        }
    });

    // Search Prompts
    const searchPromptsCommand = vscode.commands.registerCommand('vibeAssistant.searchPrompts', async () => {
        const query = await vscode.window.showInputBox({
            placeHolder: 'Search prompts...',
            prompt: 'Enter search terms for prompts'
        });

        if (query) {
            const results = promptManager.searchPrompts(query);
            
            if (results.length === 0) {
                vscode.window.showInformationMessage('No prompts found matching your search');
                return;
            }

            const items = results.map(prompt => ({
                label: prompt.name,
                description: prompt.category,
                detail: prompt.description,
                prompt: prompt
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a prompt to use',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                const activeEditor = vscode.window.activeTextEditor;
                const instructions = activeEditor ? 
                    instructionManager.getInstructionsForFile(activeEditor.document.fileName) : [];
                
                await copilotIntegration.sendToCopilotChat(
                    `Please help me with: ${selected.prompt.name}`,
                    instructions.slice(0, 2),
                    selected.prompt
                );
            }
        }
    });

    // Apply Resource Files command
    const applyResourceFilesCommand = vscode.commands.registerCommand('vibeAssistant.applyResourceFiles', async () => {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage('No active editor found. Please open a file to get contextual resource suggestions.');
                return;
            }

            // Get all resource files
            const allResourceFiles = resourceManager.getAllResourceFiles();
            
            if (allResourceFiles.length === 0) {
                vscode.window.showInformationMessage('No resource files available');
                return;
            }

            // Get contextual suggestions
            const fileExtension = path.extname(activeEditor.document.fileName);
            const fileName = path.basename(activeEditor.document.fileName);
            const suggestedResources = resourceManager.suggestResourceFilesForContext(fileExtension, fileName);

            // Create multi-select quick pick items
            const quickPickItems: (vscode.QuickPickItem & { resourceFile: any })[] = allResourceFiles.map(resourceFile => {
                const isPreSelected = suggestedResources.some(s => s.id === resourceFile.id);
                return {
                    label: `${isPreSelected ? '🟣 ' : '⚪ '}${resourceFile.name}`,
                    description: `${resourceFile.type === 'vscode' ? '⚙️ VS Code' : '📚 How-to Guide'} • ${resourceFile.relativePath}${isPreSelected ? ' • 🟣 Auto-selected' : ''}`,
                    detail: `@workspace ${resourceFile.relativePath}`,
                    picked: isPreSelected,
                    resourceFile: resourceFile
                };
            });

            // Show multi-select quick pick
            const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
                canPickMany: true,
                placeHolder: `Select resource files to add to workspace (${suggestedResources.length} contextually relevant files pre-selected)`,
                matchOnDescription: true,
                matchOnDetail: true,
                ignoreFocusOut: true,
                title: `📋 Choose Resource Files for ${path.basename(activeEditor.document.fileName)}`
            }) as (vscode.QuickPickItem & { resourceFile: any })[] | undefined;

            if (!selectedItems || selectedItems.length === 0) {
                vscode.window.showInformationMessage('No resource files selected. Operation cancelled.');
                return;
            }

            // Show progress while processing
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Adding ${selectedItems.length} resource file(s) to workspace...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 30, message: "Copying files to workspace..." });
                
                // Apply selected resource files (copy to workspace only)
                const selectedResources = selectedItems.map(item => item.resourceFile);
                await copilotIntegration.copyResourceFilesToWorkspace(selectedResources);
                
                progress.report({ increment: 40, message: "Preparing Copilot message..." });
                
                // Send directly to Copilot Chat with auto-paste
                const resourceSummary = selectedResources.map((r: any) => r.name).join(', ');
                await copilotIntegration.sendResourcesToCopilotChatWithAutoPaste(
                    `I've added these resource files to the workspace: ${resourceSummary}. Please help me use these resources.`,
                    selectedResources
                );
                
                progress.report({ increment: 30, message: "Opening Copilot Chat..." });
                
                // Show success message
                vscode.window.showInformationMessage(
                    `✅ ${selectedResources.length} resource file(s) added to workspace and sent to Copilot Chat!\n` +
                    `Added: ${resourceSummary}`
                );
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply resource files: ${error}`);
        }
    });

    // New Vibe Assistant Panel Commands
    const openPanelCommand = vscode.commands.registerCommand('vibeAssistant.openPanel', async () => {
        // First, ensure the Vibe Assistant view container is visible
        await vscode.commands.executeCommand('workbench.view.extension.vibeAssistant');
        // Then focus on the panel specifically
        await vscode.commands.executeCommand('vibeAssistantPanel.focus');
    });

    const connectAWSCommand = vscode.commands.registerCommand('vibeAssistant.connectAWS', async () => {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Connecting to AWS...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Testing AWS CLI credentials...' });
                const status = await awsService.connectToAWS();
                
                if (vibeAssistantPanel) {
                    vibeAssistantPanel.updateAWSStatus(status);
                }
                
                if (status.connected) {
                    vscode.window.showInformationMessage('✅ Successfully connected to AWS!');
                } else {
                    vscode.window.showErrorMessage(`❌ Failed to connect to AWS: ${status.error}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to connect to AWS: ${(error as Error).message}`);
        }
    });

    const refreshAWSConnectionCommand = vscode.commands.registerCommand('vibeAssistant.refreshAWSConnection', async () => {
        try {
            const status = await awsService.refreshConnection();
            if (vibeAssistantPanel) {
                vibeAssistantPanel.updateAWSStatus(status);
            }
            vscode.window.showInformationMessage('AWS connection refreshed');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to refresh AWS connection: ${(error as Error).message}`);
        }
    });

    const getRealTimeAWSStatusCommand = vscode.commands.registerCommand('vibeAssistant.getRealTimeAWSStatus', async () => {
        try {
            const status = await awsService.getRealTimeConnectionStatus();
            if (vibeAssistantPanel) {
                vibeAssistantPanel.updateAWSStatus(status);
            }
            return status;
        } catch (error) {
            const errorStatus = { connected: false, status: 'error' as const, error: (error as Error).message };
            if (vibeAssistantPanel) {
                vibeAssistantPanel.updateAWSStatus(errorStatus);
            }
            return errorStatus;
        }
    });

    const listAWSSecretsCommand = vscode.commands.registerCommand('vibeAssistant.listAWSSecrets', async () => {
        try {
            const result = await awsService.listAvailableSecrets();
            const secretsList = result.secrets.length > 0 ? result.secrets.join(', ') : 'No secrets found';
            const message = `Available AWS secrets in ${result.region} (profile: ${result.profile}): ${secretsList}`;
            vscode.window.showInformationMessage(message);
            return result;
        } catch (error) {
            const errorMessage = `Failed to list AWS secrets: ${(error as Error).message}`;
            vscode.window.showErrorMessage(errorMessage);
            console.error(errorMessage, error);
            return { secrets: [], region: '', profile: '' };
        }
    });

    const retrySalesforceCredentialsCommand = vscode.commands.registerCommand('vibeAssistant.retrySalesforceCredentials', async () => {
        try {
            const credentials = await awsService.retryFetchSalesforceCredentials();
            if (credentials) {
                vscode.window.showInformationMessage('Successfully fetched Salesforce credentials!');
                return credentials;
            } else {
                vscode.window.showWarningMessage('No Salesforce credentials found. Check console for details.');
                return null;
            }
        } catch (error) {
            const errorMessage = `Failed to fetch Salesforce credentials: ${(error as Error).message}`;
            vscode.window.showErrorMessage(errorMessage);
            console.error(errorMessage, error);
            return null;
        }
    });

    const updateJiraIssueCommand = vscode.commands.registerCommand('vibeAssistant.updateJiraIssue', async (data: any) => {
        try {
            const result = await jiraService.updateJiraIssue(data);
            if (vibeAssistantPanel) {
                vibeAssistantPanel.updateJiraStatus(result);
            }
            
            if (result.success) {
                vscode.window.showInformationMessage(`✅ JIRA issue ${result.jiraId} updated successfully!`);
            } else {
                vscode.window.showErrorMessage(`❌ Failed to update JIRA issue: ${result.error}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update JIRA issue: ${(error as Error).message}`);
        }
    });

    const submitFeedbackCommand = vscode.commands.registerCommand('vibeAssistant.submitFeedback', async (data: any) => {
        try {
            const result = await feedbackService.submitFeedback(data);
            
            if (result.success) {
                vscode.window.showInformationMessage(`✅ Feedback submitted successfully! Ticket: ${result.ticketId}`);
            } else {
                vscode.window.showErrorMessage(`❌ Failed to submit feedback: ${result.error}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to submit feedback: ${(error as Error).message}`);
        }
    });

    // Add feedback management commands
    const viewFeedbackHistoryCommand = vscode.commands.registerCommand('vibeAssistant.viewFeedbackHistory', async () => {
        try {
            const history = await feedbackService.getSubmissionHistory();
            
            if (history.length === 0) {
                vscode.window.showInformationMessage('No feedback history found.');
                return;
            }

            const items = history.map(entry => ({
                label: `${entry.payload.issueType} - ${entry.payload.component}`,
                detail: `${new Date(entry.timestamp).toLocaleString()} | Priority: ${entry.payload.priority} | ID: ${entry.id}`,
                description: entry.payload.description,
                entry: entry
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select feedback entry to view details'
            });

            if (selected) {
                const doc = await vscode.workspace.openTextDocument({
                    content: JSON.stringify(selected.entry, null, 2),
                    language: 'json'
                });
                await vscode.window.showTextDocument(doc);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load feedback history: ${(error as Error).message}`);
        }
    });

    const exportFeedbackHistoryCommand = vscode.commands.registerCommand('vibeAssistant.exportFeedbackHistory', async () => {
        try {
            const history = await feedbackService.getSubmissionHistory();
            
            if (history.length === 0) {
                vscode.window.showWarningMessage('No feedback history to export.');
                return;
            }

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('vibe-assistant-feedback.json'),
                filters: {
                    'JSON': ['json'],
                    'Text': ['txt']
                }
            });

            if (uri) {
                const content = JSON.stringify(history, null, 2);
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
                vscode.window.showInformationMessage(`Feedback exported to ${uri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export feedback: ${(error as Error).message}`);
        }
    });

    const clearFeedbackHistoryCommand = vscode.commands.registerCommand('vibeAssistant.clearFeedbackHistory', async () => {
        try {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to clear all feedback history?',
                { modal: true },
                'Yes, Clear All'
            );

            if (confirm === 'Yes, Clear All') {
                await feedbackService.clearSubmissionHistory();
                vscode.window.showInformationMessage('Feedback history cleared.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to clear feedback history: ${(error as Error).message}`);
        }
    });

    const configureGitHubTokenCommand = vscode.commands.registerCommand('vibeAssistant.configureGitHubToken', async () => {
        try {
            const currentToken = config.getGitHubToken();
            const hasToken = currentToken && currentToken.length > 0;
            
            const message = hasToken 
                ? 'GitHub token is configured. Do you want to update it?'
                : 'GitHub token is required to create issues directly. Do you want to configure it now?';
                
            const actions = hasToken 
                ? ['Configure Token', 'Help', 'Test Token']
                : ['Configure Token', 'Help'];
            
            const action = await vscode.window.showInformationMessage(message, ...actions);

            if (action === 'Configure Token') {
                const token = await vscode.window.showInputBox({
                    prompt: 'Enter your GitHub Personal Access Token',
                    password: true,
                    placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
                    value: hasToken ? '***********' : '',
                    validateInput: (value) => {
                        if (!value || value.length < 10) {
                            return 'Please enter a valid GitHub token';
                        }
                        if (value === '***********') {
                            return 'Please enter your actual token, not the placeholder';
                        }
                        return null;
                    }
                });

                if (token && token !== '***********') {
                    await config.setGitHubToken(token);
                    vscode.window.showInformationMessage('✅ GitHub token configured successfully!');
                }
            } else if (action === 'Help') {
                const helpMessage = `To create a GitHub Personal Access Token:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Click "Generate new token (classic)"
3. Give it a name like "Vibe Assistant Extension"
4. Select scopes: 'repo' (for private repos) or 'public_repo' (for public repos only)
5. Click "Generate token"
6. Copy the token (you won't see it again!)
7. Run this command again to configure it

Token will be stored securely in VS Code settings.`;
                
                vscode.window.showInformationMessage(helpMessage, 'Open GitHub Settings').then(result => {
                    if (result === 'Open GitHub Settings') {
                        vscode.env.openExternal(vscode.Uri.parse(config.getDocumentationUrls().tokenSettings));
                    }
                });
            } else if (action === 'Test Token') {
                // Test the current token by making a simple API call
                vscode.window.showInformationMessage('Testing GitHub token...');
                try {
                    // Test authentication
                    const userResponse = await fetch(`${config.getApiEndpoints().github.baseUrl}/user`, {
                        headers: {
                            'Authorization': `token ${currentToken}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    });
                    
                    if (!userResponse.ok) {
                        vscode.window.showErrorMessage('❌ Token is invalid or expired. Please reconfigure.');
                        return;
                    }
                    
                    const user = await userResponse.json();
                    
                    // Test repository access
                    const repoResponse = await fetch(`${config.getApiEndpoints().github.baseUrl}/repos/${config.getApiEndpoints().github.repoOwner}/${config.getApiEndpoints().github.repoName}`, {
                        headers: {
                            'Authorization': `token ${currentToken}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    });
                    
                    if (!repoResponse.ok) {
                        vscode.window.showErrorMessage('❌ Token cannot access repository. Please check permissions.');
                        return;
                    }
                    
                    const repo = await repoResponse.json();
                    const permissions = repo.permissions || {};
                    
                    if (permissions.push || permissions.admin) {
                        vscode.window.showInformationMessage(`✅ Token is valid and can create issues!\nAuthenticated as: ${user.login}\nRepository access: ✅ Write permissions`);
                    } else {
                        vscode.window.showWarningMessage(`⚠️ Token is valid but has limited permissions.\nAuthenticated as: ${user.login}\nRepository access: ❌ Read-only\n\nTo create issues, please update your token with 'repo' scope.`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`❌ Failed to test token: ${(error as Error).message}`);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to configure GitHub token: ${(error as Error).message}`);
        }
    });

    // Analyze Folder Code & Apply Instructions
    const analyzeFolderCodeCommand = vscode.commands.registerCommand('vibeAssistant.analyzeFolderCode', async (folderUri: vscode.Uri) => {
        try {
            if (!folderUri) {
                vscode.window.showWarningMessage('No folder selected');
                return;
            }

            // Mark as manual command to show notifications
            copilotIntegration.setManualCommand();

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Analyzing folder: ${path.basename(folderUri.fsPath)}...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 20, message: "Scanning folder contents..." });

                // Analyze folder context
                const folderContext = await contextAnalyzer.analyzeFolderContext(folderUri);
                
                progress.report({ increment: 30, message: "Getting relevant instructions..." });

                // Get all instructions with pre-selection based on folder context
                const instructionsWithSelection = instructionManager.getAllInstructionsWithSelectionForContext(folderContext);
                
                if (instructionsWithSelection.length === 0) {
                    vscode.window.showInformationMessage('No instructions available for this folder context');
                    return;
                }

                progress.report({ increment: 20, message: "Preparing instruction selection..." });

                // Create multi-select quick pick items
                const quickPickItems: (vscode.QuickPickItem & { instruction: Instruction })[] = instructionsWithSelection.map(({ instruction, preSelected }) => ({
                    label: `${preSelected ? '🟣 ' : '⚪ '}${instruction.name}`,
                    description: `${instruction.mode} • ${instruction.id}${preSelected ? ' • 🟣 Auto-selected' : ''}`,
                    detail: instruction.description,
                    picked: preSelected,
                    instruction: instruction
                }));

                progress.report({ increment: 30, message: "Showing selection dialog..." });

                // Show multi-select quick pick
                const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
                    canPickMany: true,
                    placeHolder: `Select instructions for folder (${folderContext.fileCount} files, ${folderContext.languages.join(', ')})`,
                    matchOnDescription: true,
                    matchOnDetail: true,
                    ignoreFocusOut: true,
                    title: `📁 Choose Instructions for ${path.basename(folderUri.fsPath)}`
                }) as (vscode.QuickPickItem & { instruction: Instruction })[] | undefined;

                if (!selectedItems || selectedItems.length === 0) {
                    vscode.window.showInformationMessage('No instructions selected for folder analysis.');
                    return;
                }

                // Extract selected instructions
                const selectedInstructions = selectedItems.map(item => item.instruction);
                
                // Get contextual prompts
                const prompts = promptManager.suggestPromptForContext(folderContext);
                const bestPrompt = prompts.length > 0 ? prompts[0] : undefined;

                // Apply selected instructions with auto-paste
                await copilotIntegration.applyInstructionsToWorkspaceWithAutoPaste(selectedInstructions, bestPrompt);
                
                // Show success message
                const instructionNames = selectedInstructions.map(i => i.name).join(', ');
                vscode.window.showInformationMessage(
                    `✅ Applied ${selectedInstructions.length} instruction(s) to folder analysis!\n` +
                    `📁 Analyzed ${folderContext.fileCount} files\n` +
                    `💻 Languages: ${folderContext.languages.join(', ')}\n` +
                    `Applied: ${instructionNames}` +
                    (bestPrompt ? `\n🎯 With prompt: ${bestPrompt.name}` : '')
                );
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to analyze folder: ${error}`);
        }
    });

    // Analyze Workspace Code & Apply Instructions
    const analyzeWorkspaceCodeCommand = vscode.commands.registerCommand('vibeAssistant.analyzeWorkspaceCode', async () => {
        try {
            // Mark as manual command to show notifications
            copilotIntegration.setManualCommand();

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing entire workspace...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 10, message: "Scanning workspace..." });

                // Analyze workspace context
                const workspaceContext = await contextAnalyzer.analyzeWorkspaceContext();
                
                progress.report({ increment: 30, message: "Getting relevant instructions..." });

                // Get all instructions with pre-selection based on workspace context
                const instructionsWithSelection = instructionManager.getAllInstructionsWithSelectionForContext(workspaceContext);
                
                if (instructionsWithSelection.length === 0) {
                    vscode.window.showInformationMessage('No instructions available for workspace context');
                    return;
                }

                progress.report({ increment: 20, message: "Preparing instruction selection..." });

                // Create multi-select quick pick items
                const quickPickItems: (vscode.QuickPickItem & { instruction: Instruction })[] = instructionsWithSelection.map(({ instruction, preSelected }) => ({
                    label: `${preSelected ? '🟣 ' : '⚪ '}${instruction.name}`,
                    description: `${instruction.mode} • ${instruction.id}${preSelected ? ' • 🟣 Auto-selected' : ''}`,
                    detail: instruction.description,
                    picked: preSelected,
                    instruction: instruction
                }));

                progress.report({ increment: 20, message: "Showing selection dialog..." });

                // Show multi-select quick pick
                const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
                    canPickMany: true,
                    placeHolder: `Select instructions for workspace (${workspaceContext.fileCount} files, ${workspaceContext.languages.join(', ')})`,
                    matchOnDescription: true,
                    matchOnDetail: true,
                    ignoreFocusOut: true,
                    title: `🌐 Choose Instructions for Entire Workspace`
                }) as (vscode.QuickPickItem & { instruction: Instruction })[] | undefined;

                if (!selectedItems || selectedItems.length === 0) {
                    vscode.window.showInformationMessage('No instructions selected for workspace analysis.');
                    return;
                }

                // Extract selected instructions
                const selectedInstructions = selectedItems.map(item => item.instruction);
                
                // Get contextual prompts
                const prompts = promptManager.suggestPromptForContext(workspaceContext);
                const bestPrompt = prompts.length > 0 ? prompts[0] : undefined;

                progress.report({ increment: 20, message: "Applying instructions and sending to Copilot..." });

                // Apply selected instructions with auto-paste
                await copilotIntegration.applyInstructionsToWorkspaceWithAutoPaste(selectedInstructions, bestPrompt);
                
                // Show success message
                const instructionNames = selectedInstructions.map(i => i.name).join(', ');
                vscode.window.showInformationMessage(
                    `✅ Applied ${selectedInstructions.length} instruction(s) to workspace analysis!\n` +
                    `🌐 Analyzed ${workspaceContext.fileCount} files across ${workspaceContext.folderCount} folder(s)\n` +
                    `💻 Languages: ${workspaceContext.languages.join(', ')}\n` +
                    `🔧 Technologies: ${workspaceContext.technologies.slice(0, 3).join(', ')}${workspaceContext.technologies.length > 3 ? '...' : ''}\n` +
                    `Applied: ${instructionNames}` +
                    (bestPrompt ? `\n🎯 With prompt: ${bestPrompt.name}` : '')
                );
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to analyze workspace: ${error}`);
        }
    });

    // Apply Folder Prompts
    const applyFolderPromptsCommand = vscode.commands.registerCommand('vibeAssistant.applyFolderPrompts', async (folderUri: vscode.Uri) => {
        try {
            if (!folderUri) {
                vscode.window.showWarningMessage('No folder selected');
                return;
            }

            // Analyze folder context
            const folderContext = await contextAnalyzer.analyzeFolderContext(folderUri);
            
            // Get all prompts with pre-selection based on folder context
            const promptsWithSelection = promptManager.getAllPromptsWithSelectionForContext(folderContext);
            
            if (promptsWithSelection.length === 0) {
                vscode.window.showInformationMessage('No prompts available for this folder context');
                return;
            }

            // Create multi-select quick pick items
            const quickPickItems: (vscode.QuickPickItem & { prompt: any })[] = promptsWithSelection.map(({ prompt, preSelected }) => ({
                label: `${preSelected ? '🟣 ' : '⚪ '}${prompt.name}`,
                description: `${prompt.category} • ${prompt.id}${preSelected ? ' • 🟣 Auto-selected' : ''}`,
                detail: prompt.description,
                picked: preSelected,
                prompt: prompt
            }));

            // Show multi-select quick pick
            const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
                canPickMany: true,
                placeHolder: `Select prompts for folder (${folderContext.fileCount} files, ${folderContext.languages.join(', ')})`,
                matchOnDescription: true,
                matchOnDetail: true,
                ignoreFocusOut: true,
                title: `📁 Choose Prompts for ${path.basename(folderUri.fsPath)}`
            }) as (vscode.QuickPickItem & { prompt: any })[] | undefined;

            if (!selectedItems || selectedItems.length === 0) {
                vscode.window.showInformationMessage('No prompts selected.');
                return;
            }

            // Apply selected prompts
            const selectedPrompts = selectedItems.map(item => item.prompt);
            const promptSummary = selectedPrompts.map((p: any) => p.name).join(', ');
            
            await copilotIntegration.sendPromptsToCopilotChatWithAutoPaste(
                `Please help me with these prompts for folder analysis (${folderContext.fileCount} files): ${promptSummary}`,
                selectedPrompts
            );
            
            // Show success message
            vscode.window.showInformationMessage(
                `✅ Applied ${selectedPrompts.length} prompt(s) for folder analysis!\n` +
                `📁 ${folderContext.fileCount} files analyzed\n` +
                `Applied: ${promptSummary}`
            );

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply folder prompts: ${error}`);
        }
    });

    // Apply Workspace Prompts
    const applyWorkspacePromptsCommand = vscode.commands.registerCommand('vibeAssistant.applyWorkspacePrompts', async () => {
        try {
            // Analyze workspace context
            const workspaceContext = await contextAnalyzer.analyzeWorkspaceContext();
            
            // Get all prompts with pre-selection based on workspace context
            const promptsWithSelection = promptManager.getAllPromptsWithSelectionForContext(workspaceContext);
            
            if (promptsWithSelection.length === 0) {
                vscode.window.showInformationMessage('No prompts available for workspace context');
                return;
            }

            // Create multi-select quick pick items
            const quickPickItems: (vscode.QuickPickItem & { prompt: any })[] = promptsWithSelection.map(({ prompt, preSelected }) => ({
                label: `${preSelected ? '🟣 ' : '⚪ '}${prompt.name}`,
                description: `${prompt.category} • ${prompt.id}${preSelected ? ' • 🟣 Auto-selected' : ''}`,
                detail: prompt.description,
                picked: preSelected,
                prompt: prompt
            }));

            // Show multi-select quick pick
            const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
                canPickMany: true,
                placeHolder: `Select prompts for workspace (${workspaceContext.fileCount} files, ${workspaceContext.languages.join(', ')})`,
                matchOnDescription: true,
                matchOnDetail: true,
                ignoreFocusOut: true,
                title: `🌐 Choose Prompts for Entire Workspace`
            }) as (vscode.QuickPickItem & { prompt: any })[] | undefined;

            if (!selectedItems || selectedItems.length === 0) {
                vscode.window.showInformationMessage('No prompts selected.');
                return;
            }

            // Apply selected prompts
            const selectedPrompts = selectedItems.map(item => item.prompt);
            const promptSummary = selectedPrompts.map((p: any) => p.name).join(', ');
            
            await copilotIntegration.sendPromptsToCopilotChatWithAutoPaste(
                `Please help me with these prompts for workspace analysis (${workspaceContext.fileCount} files across ${workspaceContext.folderCount} folders): ${promptSummary}`,
                selectedPrompts
            );
            
            // Show success message
            vscode.window.showInformationMessage(
                `✅ Applied ${selectedPrompts.length} prompt(s) for workspace analysis!\n` +
                `🌐 ${workspaceContext.fileCount} files across ${workspaceContext.folderCount} folder(s)\n` +
                `Applied: ${promptSummary}`
            );

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply workspace prompts: ${error}`);
        }
    });

    // Register all commands
    context.subscriptions.push(
        analyzeCodeCommand,
        suggestPromptCommand,
        openInstructionsCommand,
        applyCopilotInstructionsCommand,
        applyResourceFilesCommand,
        showPromptSidebarCommand,
        refreshInstructionsCommand,
        refreshPromptsCommand,
        searchInstructionsCommand,
        searchPromptsCommand,
        // New Vibe Assistant Panel Commands
        openPanelCommand,
        connectAWSCommand,
        refreshAWSConnectionCommand,
        getRealTimeAWSStatusCommand,
        listAWSSecretsCommand,
        retrySalesforceCredentialsCommand,
        updateJiraIssueCommand,
        submitFeedbackCommand,
        viewFeedbackHistoryCommand,
        exportFeedbackHistoryCommand,
        clearFeedbackHistoryCommand,
        configureGitHubTokenCommand,
        analyzeFolderCodeCommand,
        analyzeWorkspaceCodeCommand,
        applyFolderPromptsCommand,
        applyWorkspacePromptsCommand

    );
}

function setupEventListeners(context: vscode.ExtensionContext) {
    // Listen for active editor changes
    const activeEditorChange = vscode.window.onDidChangeActiveTextEditor(async (editor: vscode.TextEditor | undefined) => {
        if (editor && isAutoApplyEnabled()) {
            try {
                const codeContext = contextAnalyzer.analyzeDocument(editor.document);
                const instructions = instructionManager.getInstructionsForFile(editor.document.fileName);
                
                if (instructions.length > 0) {
                    await copilotIntegration.applyInstructionsToWorkspace(instructions);
                }
            } catch (error) {
                console.error('Failed to auto-apply instructions:', error);
            }
        }
    });

    // Listen for configuration changes
    const configChange = vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
        if (event.affectsConfiguration('vibeAssistant')) {
            console.log('Vibe Assistant configuration changed');
        }
    });

    // Listen for text document changes (for context analysis)
    const documentChange = vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
        if (event.document === vscode.window.activeTextEditor?.document) {
            // Debounce context analysis for performance
            clearTimeout((globalThis as any).vibeAnalysisTimeout);
            (globalThis as any).vibeAnalysisTimeout = setTimeout(async () => {
                try {
                    const codeContext = contextAnalyzer.analyzeDocument(event.document);
                    // Context analysis completed - UI providers removed for simplified panel
                } catch (error) {
                    console.error('Failed to analyze document changes:', error);
                }
            }, 1000); // 1 second debounce
        }
    });

    context.subscriptions.push(
        activeEditorChange,
        configChange,
        documentChange
    );
}

function setupAutoApplyInstructions(context: vscode.ExtensionContext) {
    // Auto-apply instructions when files are opened
    if (isAutoApplyEnabled()) {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            setTimeout(async () => {
                try {
                    const instructions = instructionManager.getInstructionsForFile(activeEditor.document.fileName);
                    if (instructions.length > 0) {
                        await copilotIntegration.applyInstructionsToWorkspace(instructions);
                    }
                } catch (error) {
                    console.error('Failed to auto-apply initial instructions:', error);
                }
            }, 1000); // Delay to ensure everything is loaded
        }
    }
}

function isAutoApplyEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('vibeAssistant');
    return config.get('autoApplyInstructions', true);
}

// Command for tree view items
export async function handleInstructionClick(instruction: any) {
    try {
        const doc = await vscode.workspace.openTextDocument({
            content: instruction.content,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open instruction: ${error}`);
    }
}

export async function handlePromptClick(prompt: any) {
    try {
        const activeEditor = vscode.window.activeTextEditor;
        const instructions = activeEditor ? 
            instructionManager.getInstructionsForFile(activeEditor.document.fileName) : [];
        
        await copilotIntegration.sendToCopilotChat(
            `Please help me with: ${prompt.name}`,
            instructions.slice(0, 2),
            prompt
        );
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to use prompt: ${error}`);
    }
}

export function deactivate() {
    if (copilotIntegration) {
        copilotIntegration.dispose();
    }
    if (resourceManager) {
        resourceManager.dispose();
    }
    if (awsService) {
        awsService.dispose();
    }
    if (estimationParser) {
        estimationParser.dispose();
    }
    if (jiraService) {
        jiraService.dispose();
    }
    if (feedbackService) {
        feedbackService.dispose();
    }
    console.log('Spec Driven Development deactivated');
}