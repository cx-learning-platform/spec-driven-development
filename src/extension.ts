import * as vscode from 'vscode';
import * as path from 'path';
import { InstructionManager, Instruction } from './instructionManager';
import { PromptManager } from './promptManager';
import { ContextAnalyzer } from './contextAnalyzer';
import { CopilotIntegration } from './copilotIntegration';
import { ResourceManager } from './resourceManager';
import { SpecDrivenDevelopmentPanel } from './ui/webviewPanel';
import { AWSService } from './services/awsService';
import { UserService } from './services/userService';
import { EstimationParser } from './services/estimationParser';
import { JiraService } from './services/jiraService';
import { FeedbackService } from './services/feedbackService';
import { TaskService } from './services/taskService';
import { TaskMasterService, TaskMasterTask } from './services/taskMasterService';
// GitHub configuration removed - only using Salesforce config now
import { NotificationManager } from './services/notificationManager';
import { TermsConditionsService } from './services/termsConditionsService';

let instructionManager: InstructionManager;
let promptManager: PromptManager;
let contextAnalyzer: ContextAnalyzer;
let copilotIntegration: CopilotIntegration;
let resourceManager: ResourceManager;
let specDrivenDevelopmentPanel: SpecDrivenDevelopmentPanel;
let awsService: AWSService;
let userService: UserService;
let estimationParser: EstimationParser;
let jiraService: JiraService;
let feedbackService: FeedbackService;
let taskService: TaskService;
let notificationManager: NotificationManager;
let termsConditionsService: TermsConditionsService;
let awsStatusBarItem: vscode.StatusBarItem;

// Module-level timeout variable for debouncing
let vibeAnalysisTimeout: NodeJS.Timeout | undefined;

// Function to update AWS status bar
async function updateAWSStatusBar() {
    if (!awsStatusBarItem || !awsService) return;
    
    const isConnected = await awsService.isConnected();
    if (isConnected) {
        const connectionTime = await awsService.getConnectionTime();
        const selectedProfile = awsService.getSelectedProfile();
        const profileMsg = selectedProfile ? ` [${selectedProfile}]` : '';
        const expiryMsg = connectionTime ? `\nExpires: ${new Date(connectionTime).toLocaleString()}` : '';
        
        awsStatusBarItem.text = `$(cloud) AWS: Connected${profileMsg}`;
        awsStatusBarItem.tooltip = `AWS Connected${profileMsg}${expiryMsg}`;
        awsStatusBarItem.command = 'specDrivenDevelopment.disconnectAWS';
    } else {
        awsStatusBarItem.text = "$(cloud) AWS: Disconnected";
        awsStatusBarItem.tooltip = "AWS Connection Status - Click to connect";
        awsStatusBarItem.command = 'specDrivenDevelopment.connectAWS';
    }
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('[SDD:Core] INFO | 🎯 Spec Driven Development is now active!');

    try {
        // Clear any stale cached estimation data on activation to prevent unwanted notifications
        await context.globalState.update('specDrivenDevelopment.estimationData', undefined);
        
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
        userService = new UserService(context);
        estimationParser = new EstimationParser(context);
        jiraService = new JiraService(context, awsService, userService);
        feedbackService = new FeedbackService(context, awsService, userService);
        taskService = new TaskService(context, awsService, userService);
        
        // Initialize notification manager
        notificationManager = NotificationManager.getInstance(context);

        // Initialize Terms & Conditions service (requires UserService and FeedbackService)
        termsConditionsService = new TermsConditionsService(context, userService, feedbackService);

        // Start periodic data collection (if user has agreed)
        await termsConditionsService.initializePeriodicCollection();

        // Add to subscriptions for cleanup
        context.subscriptions.push({
            dispose: () => termsConditionsService.dispose()
        });

        // Initialize UI providers
        specDrivenDevelopmentPanel = new SpecDrivenDevelopmentPanel(context);

        // Register webview panel provider
        vscode.window.registerWebviewViewProvider('specDrivenDevelopmentPanel', specDrivenDevelopmentPanel);

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
        statusBarItem.text = "$(dashboard) Spec Driven Development";
        statusBarItem.tooltip = "Spec Driven Development - Click to open panel (AWS, JIRA, Feedback)";
        statusBarItem.command = 'specDrivenDevelopment.openPanel';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // AWS connection status bar item
        awsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        awsStatusBarItem.text = "$(cloud) AWS: Disconnected";
        awsStatusBarItem.tooltip = "AWS Connection Status - Click to connect";
        awsStatusBarItem.command = 'specDrivenDevelopment.connectAWS';
        awsStatusBarItem.show();
        context.subscriptions.push(awsStatusBarItem);

        // Update status bar initially
        await updateAWSStatusBar();

        // Update status bar when connection changes
        const updateStatusBarInterval = setInterval(updateAWSStatusBar, 30000); // Every 30 seconds
        context.subscriptions.push({ dispose: () => clearInterval(updateStatusBarInterval) });

        // Show welcome message for first-time users
        const hasShownWelcome = context.globalState.get('hasShownWelcome', false);
        if (!hasShownWelcome) {
            const action = await vscode.window.showInformationMessage(
                '🎉 Welcome to Spec Driven Development! Click the status bar to open the management panel with AWS integration, JIRA connectivity, and feedback system.',
                'Open Panel',
                'Got it'
            );
            
            if (action === 'Open Panel') {
                vscode.commands.executeCommand('specDrivenDevelopment.openPanel');
            }
            
            await context.globalState.update('hasShownWelcome', true);
        }

        // Check if GitHub Copilot is available
        setTimeout(async () => {
            const availableCommands = await vscode.commands.getCommands();
            const hasCopilot = availableCommands.some(cmd => cmd.includes('github.copilot'));
            
            if (hasCopilot) {
                console.log('[SDD:Core] INFO | ✅ GitHub Copilot detected - full integration available');
            } else {
                console.log('[SDD:Core] INFO | ℹ️ GitHub Copilot not detected - extension will work with limited features');
            }
        }, 2000);

        console.log('[SDD:Core] INFO | ✅ Spec Driven Development activated successfully');

    } catch (error) {
        console.error('[SDD:Core] ERROR | ❌ Failed to activate Spec Driven Development:', error);
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
                console.log('[SDD:Core] INFO | 📝 Created initial copilot instructions');
            }
        }
    } catch (error) {
        console.error('[SDD:Core] ERROR | Failed to initialize workspace:', error);
    }
}

function registerCommands(context: vscode.ExtensionContext) {
    // Analyze Code & Apply Instructions
    const analyzeCodeCommand = vscode.commands.registerCommand('specDrivenDevelopment.analyzeCode', async (fileUri?: vscode.Uri) => {
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

            const result = await notificationManager.withProgress(
                'analyze-code',
                'Analyzing code and applying instructions...',
                async (progress) => {
                    progress.report({ increment: 20, message: "Analyzing file context..." });

                    // Analyze current context
                    const codeContext = contextAnalyzer.analyzeDocument(activeEditor.document);
                    
                    // Get all instructions with pre-selection based on current file
                    const instructionsWithSelection = instructionManager.getAllInstructionsWithSelection(activeEditor.document.fileName);
                    
                    console.log(`[SDD:Core] INFO | 📋 Found ${instructionsWithSelection.length} instructions for ${path.basename(activeEditor.document.fileName)}`);
                    
                    if (instructionsWithSelection.length === 0) {
                        throw new Error('No instructions available for this file context. Please check that instruction files are loaded correctly.');
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

                    // Apply selected instructions to Copilot with auto-paste, including file context
                    const targetFile = fileUri ? fileUri.fsPath : activeEditor.document.fileName;
                    await copilotIntegration.applyInstructionsToWorkspaceWithAutoPasteForContext(selectedInstructions, bestPrompt, targetFile, 'file');
                    
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
    const suggestPromptCommand = vscode.commands.registerCommand('specDrivenDevelopment.suggestPrompt', async (fileUri?: vscode.Uri) => {
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
                
                // Use file context when available
                const targetFile = fileUri ? fileUri.fsPath : activeEditor.document.fileName;
                await copilotIntegration.sendPromptsToCopilotChatWithAutoPasteForContext(
                    `Please help me with these prompts: ${promptSummary}`,
                    selectedPrompts,
                    targetFile,
                    'file'
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
    const openInstructionsCommand = vscode.commands.registerCommand('specDrivenDevelopment.openInstructions', () => {
        vscode.commands.executeCommand('specDrivenDevelopmentInstructions.focus');
    });

    // Apply Copilot Instructions
    const applyCopilotInstructionsCommand = vscode.commands.registerCommand('specDrivenDevelopment.applyCopilotInstructions', async () => {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }

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
    const showPromptSidebarCommand = vscode.commands.registerCommand('specDrivenDevelopment.showPromptSidebar', () => {
        vscode.commands.executeCommand('specDrivenDevelopmentPrompts.focus');
    });

    // Refresh Instructions
    const refreshInstructionsCommand = vscode.commands.registerCommand('specDrivenDevelopment.refreshInstructions', () => {
        instructionManager.refreshInstructions();
        vscode.window.showInformationMessage('Instructions refreshed successfully');
    });

    // Refresh Prompts
    const refreshPromptsCommand = vscode.commands.registerCommand('specDrivenDevelopment.refreshPrompts', () => {
        promptManager.refreshPrompts();
        vscode.window.showInformationMessage('Prompts refreshed successfully');
    });

    // Search Instructions
    const searchInstructionsCommand = vscode.commands.registerCommand('specDrivenDevelopment.searchInstructions', async () => {
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
    const searchPromptsCommand = vscode.commands.registerCommand('specDrivenDevelopment.searchPrompts', async () => {
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
    const applyResourceFilesCommand = vscode.commands.registerCommand('specDrivenDevelopment.applyResourceFiles', async (folderUri?: vscode.Uri) => {
        try {
            let fileExtension = '';
            let fileName = '';
            let suggestedResources: any[] = [];

            if (folderUri) {
                // Called from folder context menu - use folder context
                fileExtension = '';
                fileName = path.basename(folderUri.fsPath);
                suggestedResources = resourceManager.suggestResourceFilesForContext('', fileName);
            } else {
                // Called from command palette or other means - try to use active editor
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor) {
                    vscode.window.showWarningMessage('No active editor found. Please open a file or use the context menu on a folder.');
                    return;
                }
                fileExtension = path.extname(activeEditor.document.fileName);
                fileName = path.basename(activeEditor.document.fileName);
                suggestedResources = resourceManager.suggestResourceFilesForContext(fileExtension, fileName);
            }

            // Get all resource files
            const allResourceFiles = resourceManager.getAllResourceFiles();
            
            if (allResourceFiles.length === 0) {
                vscode.window.showInformationMessage('No resource files available');
                return;
            }

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
                title: `📋 Choose Resource Files for ${fileName}`
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
                progress.report({ increment: 30, message: "Setting up workspace structure..." });
                
                // First, ensure the workspace has the full directory structure and essential files
                // This is needed so Copilot can find referenced files
                const essentialInstructions = instructionManager.getEssentialInstructions();
                await copilotIntegration.createOrUpdateCopilotInstructionsFile(essentialInstructions);
                
                progress.report({ increment: 20, message: "Copying selected resource files..." });
                
                // Then copy the selected resource files
                const selectedResources = selectedItems.map(item => item.resourceFile);
                await copilotIntegration.copyResourceFilesToWorkspace(selectedResources);
                
                progress.report({ increment: 30, message: "Preparing Copilot message..." });
                
                // Send directly to Copilot Chat with auto-paste, including context
                const resourceSummary = selectedResources.map((r: any) => r.name).join(', ');
                
                // Determine context path and type
                let contextPath: string | undefined = undefined;
                let contextType: 'file' | 'folder' | 'directory' = 'file';
                
                console.log(`[SDD:Core] INFO | 🔍 Debug: folderUri = ${folderUri ? folderUri.fsPath : 'undefined'}`);
                
                if (folderUri) {
                    // Called from folder context menu
                    contextPath = folderUri.fsPath;
                    contextType = 'folder';
                    console.log(`[SDD:Core] INFO | 🔍 Debug: Using folder context: ${contextPath}`);
                } else {
                    // Called from file context or command palette
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor) {
                        contextPath = activeEditor.document.fileName;
                        contextType = 'file';
                        console.log(`[SDD:Core] INFO | 🔍 Debug: Using file context: ${contextPath}`);
                    } else {
                        console.log(`[SDD:Core] INFO | 🔍 Debug: No context available (no folder or active editor)`);
                    }
                }
                
                await copilotIntegration.sendResourcesToCopilotChatWithAutoPasteForContext(
                    `I've added these resource files to the workspace: ${resourceSummary}. Please help me use these resources.`,
                    selectedResources,
                    contextPath,
                    contextType
                );
                
                progress.report({ increment: 20, message: "Opening Copilot Chat..." });
                
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

    // New Spec Driven Development Panel Commands
    const openPanelCommand = vscode.commands.registerCommand('specDrivenDevelopment.openPanel', async () => {
        // First, ensure the Spec Driven Development view container is visible
        await vscode.commands.executeCommand('workbench.view.extension.specDrivenDevelopment');
        // Then focus on the panel specifically
        await vscode.commands.executeCommand('specDrivenDevelopmentPanel.focus');
    });

    const connectAWSCommand = vscode.commands.registerCommand('specDrivenDevelopment.connectAWS', async () => {
        try {
            // Connection progress is handled inside awsService
            const status = await awsService.connectToAWS();
            
            // Update UI with the status
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.updateAWSStatus(status);
            }
            
            // Show success message with clean configuration details
            if (status.connected) {
                const region = status.region || 'us-east-1';
                const profile = status.profile || 'default';
                vscode.window.showInformationMessage(
                    `✅ AWS Connection Successful\n\n` +
                    `Configuration Details:\n` +
                    `• Region: ${region}\n` +
                    `• Profile: ${profile}\n` +
                    `• Secrets Manager: ${status.secretsManagerAccess ? 'Ready' : 'Not Available'}`
                );

                // Note: T&C check will happen after auto-populate completes
                // to ensure application name is fetched from Hub
            }
            
            // Update status bar
            await updateAWSStatusBar();
        } catch (error) {
            // Get connection details from service for error notification
            const connectionLog = awsService.getConnectionLog();
            
            // Extract configuration details from logs
            let configDetails = '';
            const profileLog = connectionLog.find(log => log.includes('Configured AWS Profile:'));
            const regionLog = connectionLog.find(log => log.includes('Configured AWS Region:'));
            
            if (profileLog) {
                const profileMatch = profileLog.match(/Configured AWS Profile: "([^"]+)"/);
                if (profileMatch) {
                    configDetails += `• Profile: ${profileMatch[1]}\n`;
                }
            }
            
            if (regionLog) {
                const regionMatch = regionLog.match(/Configured AWS Region: "([^"]+)"/);
                if (regionMatch) {
                    configDetails += `• Region: ${regionMatch[1]}\n`;
                }
            }
            
            // Show detailed error with configuration info
            const errorMsg = (error as Error).message;
            vscode.window.showErrorMessage(
                `❌ AWS Connection Failed\n\n` +
                `Configuration Used:\n${configDetails || '• Profile: default\n• Region: AWS CLI default\n'}\n` +
                `Error: ${errorMsg}\n\n` +
                `💡 Check your AWS credentials and configuration`
            );
            await updateAWSStatusBar();
        }
    });

    const refreshAWSConnectionCommand = vscode.commands.registerCommand('specDrivenDevelopment.refreshAWSConnection', async () => {
        try {
            const status = await awsService.refreshConnection();
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.updateAWSStatus(status);
            }
            vscode.window.showInformationMessage('✅ AWS connection refreshed successfully');
            await updateAWSStatusBar();
        } catch (error) {
            vscode.window.showErrorMessage(`❌ Failed to refresh AWS connection: ${(error as Error).message}`);
            await updateAWSStatusBar();
        }
    });

    const disconnectAWSCommand = vscode.commands.registerCommand('specDrivenDevelopment.disconnectAWS', async () => {
        try {
            await awsService.disconnect();
            const disconnectedStatus = {
                connected: false,
                status: 'disconnected' as const
            };
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.updateAWSStatus(disconnectedStatus);
            }
            vscode.window.showInformationMessage('✅ Disconnected from AWS');
            await updateAWSStatusBar();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to disconnect from AWS: ${(error as Error).message}`);
            await updateAWSStatusBar();
        }
    });

    const getRealTimeAWSStatusCommand = vscode.commands.registerCommand('specDrivenDevelopment.getRealTimeAWSStatus', async () => {
        try {
            const status = await awsService.getRealTimeConnectionStatus();
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.updateAWSStatus(status);
            }
            return status;
        } catch (error) {
            const errorStatus = { connected: false, status: 'error' as const, error: (error as Error).message };
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.updateAWSStatus(errorStatus);
            }
            return errorStatus;
        }
    });

    const getEnhancedAWSStatusCommand = vscode.commands.registerCommand('specDrivenDevelopment.getEnhancedAWSStatus', async () => {
        try {
            const enhancedStatus = await awsService.checkEnhancedConnectionStatus();
            
            // Transform the response to match frontend expectations
            let status: string;
            let details = enhancedStatus.errorMessage || '';
            let missingFields = enhancedStatus.missingFields || [];
            let recommendations = '';
            
            if (!enhancedStatus.awsConnected) {
                status = 'aws-not-configured';
                recommendations = 'Please configure AWS CLI credentials using "aws configure" command.';
            } else if (!enhancedStatus.secretExists) {
                status = 'secret-not-found';
                recommendations = `Create the secret "${enhancedStatus.secretName}" in AWS Secrets Manager or change the secret name in settings.`;
            } else if (!enhancedStatus.secretValid) {
                status = 'secret-invalid';
                recommendations = `Update the secret "${enhancedStatus.secretName}" to include the missing Salesforce fields: ${missingFields.join(', ')}.`;
            } else {
                status = 'ready';
                details = `Secret "${enhancedStatus.secretName}" is valid and contains all required Salesforce fields.`;
            }
            
            const transformedStatus = {
                status,
                details,
                missingFields,
                recommendations,
                secretName: enhancedStatus.secretName,
                availableFields: enhancedStatus.availableFields
            };
            
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.updateEnhancedAWSStatus();
            }
            return transformedStatus;
        } catch (error) {
            const errorStatus = {
                status: 'error',
                details: `Failed to check enhanced status: ${(error as Error).message}`,
                recommendations: 'Check your AWS CLI configuration and try again.'
            };
            return errorStatus;
        }
    });

    const listAWSSecretsCommand = vscode.commands.registerCommand('specDrivenDevelopment.listAWSSecrets', async () => {
        try {
            const result = await awsService.listAvailableSecrets();
            const secretsList = result.secrets.length > 0 ? result.secrets.join(', ') : 'No secrets found';
            const message = `Available AWS secrets in ${result.region} (profile: ${result.profile}): ${secretsList}`;
            vscode.window.showInformationMessage(message);
            return result;
        } catch (error) {
            const errorMessage = `Failed to list AWS secrets: ${(error as Error).message}`;
            vscode.window.showErrorMessage(errorMessage);
            console.error('[SDD:Core] ERROR |', errorMessage, error);
            return { secrets: [], region: '', profile: '' };
        }
    });

    const retrySalesforceCredentialsCommand = vscode.commands.registerCommand('specDrivenDevelopment.retrySalesforceCredentials', async () => {
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
            console.error('[SDD:Core] ERROR |', errorMessage, error);
            return null;
        }
    });

    const updateJiraIssueCommand = vscode.commands.registerCommand('specDrivenDevelopment.updateJiraIssue', async (data: any) => {
        try {
            const result = await jiraService.updateJiraIssue(data);
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.updateJiraStatus(result);
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

    const loadInitiativesCommand = vscode.commands.registerCommand('specDrivenDevelopment.loadInitiatives', async () => {
        try {
            const initiatives = await feedbackService.getInitiatives();
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendInitiatives(initiatives);
            }
        } catch (error) {
            const errorMessage = (error as Error).message;
            console.error('[SDD:Core] ERROR | Failed to load initiatives:', errorMessage);
            
            // Send user-friendly error message to UI - no popup notification
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendInitiativesError(errorMessage);
            }
        }
    });

    const loadEpicsCommand = vscode.commands.registerCommand('specDrivenDevelopment.loadEpics', async () => {
        try {
            const epics = await feedbackService.getEpics();
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendEpics(epics);
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Failed to load epics:', (error as Error).message);
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendEpics([]);
            }
        }
    });

    const loadEpicsForInitiativeCommand = vscode.commands.registerCommand('specDrivenDevelopment.loadEpicsForInitiative', async (jiraTeam: string) => {
        try {
            console.log(`[SDD:Core] INFO | Loading epics for Jira team: ${jiraTeam}`);
            const epics = await feedbackService.getEpicsFromInitiative(jiraTeam);
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendEpics(epics);
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Failed to load epics for initiative:', (error as Error).message);
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendEpics([]);
            }
        }
    });

    const loadSprintDetailsCommand = vscode.commands.registerCommand('specDrivenDevelopment.loadSprintDetails', async () => {
        try {
            const sprints = await feedbackService.getSprintDetails();
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendSprintDetails(sprints);
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Failed to load sprint details:', (error as Error).message);
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendSprintDetails([]);
            }
        }
    });

    const loadSprintsForTeamCommand = vscode.commands.registerCommand('specDrivenDevelopment.loadSprintsForTeam', async (teamName: string) => {
        try {
            console.log(`[SDD:Core] INFO | Loading sprints for team: ${teamName}`);
            const sprints = await feedbackService.getSprintsForTeam(teamName);
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendSprintDetails(sprints);
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Failed to load sprints for team:', (error as Error).message);
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendSprintDetails([]);
            }
        }
    });

    const autoPopulateFromGitCommand = vscode.commands.registerCommand('specDrivenDevelopment.autoPopulateFromGit', async () => {
        try {
            console.log('[SDD:Core] INFO | Auto-populate from Git command triggered');
            
            // Trigger username/email configuration - this will block until email is configured
            console.log('[SDD:Core] INFO | Ensuring email is configured...');
            const userEmail = await userService.getUserEmail();
            const username = await userService.getUsernameFromEmail();
            console.log(`[SDD:Core] INFO | Email configured: ${userEmail} (username: ${username})`);
            
            // Now proceed with auto-populate (email is guaranteed to be configured)
            const result = await feedbackService.autoPopulateFromGit();
            
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendAutoPopulationResult(result);
            }
            
            // Log result for debugging
            if (result.success) {
                console.log(`[SDD:Core] INFO | Auto-population successful: ${result.repoName} → ${result.applicationName} → ${result.recommendedInitiativeName}`);
                console.log(`[SDD:Core] INFO | Assignee configured: ${username} (${userEmail})`);
            } else {
                console.log(`[SDD:Core] INFO | Auto-population failed: ${result.fallbackReason}`);
            }

            // After auto-populate completes (success or failure), check T&C
            // This ensures we always ask for consent even if repo is not in Hub
            setTimeout(async () => {
                try {
                    console.log('[SDD:Core] INFO | Checking T&C after auto-populate completion...');
                    await termsConditionsService.checkAndShowTermsConditions();
                } catch (error) {
                    console.error('[SDD:Core] ERROR | Failed to check T&C:', error);
                }
            }, 500);

        } catch (error) {
            console.error('[SDD:Core] ERROR | Error in autoPopulateFromGitCommand:', error);
            
            // Even if auto-populate throws error, still check T&C
            setTimeout(async () => {
                try {
                    console.log('[SDD:Core] INFO | Auto-populate error - checking T&C anyway...');
                    await termsConditionsService.checkAndShowTermsConditions();
                } catch (tcError) {
                    console.error('[SDD:Core] ERROR | Failed to check T&C:', tcError);
                }
            }, 500);
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendAutoPopulationResult({
                    success: false,
                    initiatives: [],
                    epics: [],
                    autoPopulated: false,
                    fallbackReason: `Error: ${(error as Error).message}`
                });
            }
        }
    });

    const configureUserForFeaturesCommand = vscode.commands.registerCommand('specDrivenDevelopment.configureUserForFeatures', async () => {
        try {
            console.log('[SDD:Core] INFO | Configure user for features command triggered');
            
            // Trigger username/email configuration for feature creation
            const userEmail = await userService.getUserEmail();
            const username = await userService.getUsernameFromEmail();
            console.log(`[SDD:Core] INFO | User configured for feature creation: ${userEmail} (username: ${username})`);
            
            // Optional: Show subtle notification that user is configured
            const userInfo = await userService.getUserInfo();
            if (userInfo.source !== 'system') {
                console.log(`[SDD:Core] INFO | ✅ User ready for feature creation with assignee: ${username}`);
            }
            
        } catch (error) {
            console.error('[SDD:Core] ERROR | Error in configureUserForFeaturesCommand:', error);
        }
    });

    const submitFeedbackCommand = vscode.commands.registerCommand('specDrivenDevelopment.submitFeedback', async (data: any) => {
        try {
            const result = await feedbackService.submitFeedback(data);
            
            // If submission was successful and data contains TaskMaster task info, store it
            if (result.success && data.taskMasterTask) {
                try {
                    const submittedTasks = context.globalState.get<any[]>('specDrivenDevelopment.submittedTaskMasterTasks', []);
                    
                    const newSubmission = {
                        taskId: data.taskMasterTask.id,
                        taskTitle: data.taskMasterTask.title,
                        submittedAt: new Date().toISOString(),
                        ticketId: result.ticketId,
                        jiraUrl: result.jiraUrl, // Store Jira URL for duplicate checking
                        epicId: data.epicId
                    };
                    
                    // Add to submitted tasks list
                    submittedTasks.push(newSubmission);
                    await context.globalState.update('specDrivenDevelopment.submittedTaskMasterTasks', submittedTasks);
                    
                    console.log(`[SDD:Core] INFO | TaskMaster task ${data.taskMasterTask.id} marked as submitted: ${result.ticketId}`);
                } catch (storageError) {
                    console.error('[SDD:Core] ERROR | Failed to store TaskMaster submission info:', storageError);
                    // Don't fail the whole submission for storage errors
                }
            }
            
            // Send result back to webview
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendFeedbackResult(result);
            }

            // Also show VS Code notification
            if (result.success) {
                // Extract Jira ticket ID from URL if available
                let displayTicketId = result.ticketId || 'Unknown';
                if (result.jiraUrl) {
                    const extractedTicketId = taskService.extractJiraTicketId(result.jiraUrl);
                    if (extractedTicketId) {
                        displayTicketId = extractedTicketId;
                    }
                }
                vscode.window.showInformationMessage(`✅ Feature submitted successfully! Ticket: ${displayTicketId}`);
            } else {
                vscode.window.showErrorMessage(`❌ Failed to submit feature: ${result.error}`);
            }
        } catch (error) {
            const errorMessage = `Failed to submit feature: ${(error as Error).message}`;
            
            // Send error back to webview
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendFeedbackResult({
                    success: false,
                    message: errorMessage,
                    error: (error as Error).message,
                    timestamp: new Date().toISOString()
                });
            }
            
            vscode.window.showErrorMessage(errorMessage);
        }
    });

    const importTaskMasterCommand = vscode.commands.registerCommand('specDrivenDevelopment.importTaskMaster', async () => {
        try {
            const taskDataArray = await TaskMasterService.loadTaskFromWorkspace();
            
            // Send data to webview
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendTaskMasterData(taskDataArray);
            }

            if (taskDataArray.length === 1) {
                const task = taskDataArray[0];
                const missingFields = ['description', 'type', 'estimation', 'priority', 'status'].filter(field => !task[field as keyof TaskMasterTask]);
                if (missingFields.length > 0) {
                    vscode.window.showInformationMessage(
                        `TaskMaster task imported successfully! Please manually fill: ${missingFields.join(', ')}`
                    );
                } else {
                    vscode.window.showInformationMessage('TaskMaster task imported successfully!');
                }
            } else {
                vscode.window.showInformationMessage(`Found ${taskDataArray.length} tasks. Please select one to import.`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Provide more helpful error messages for common issues
            let userFriendlyMessage = errorMessage;
            if (errorMessage.includes('Missing essential fields')) {
                userFriendlyMessage = `${errorMessage}\n\nNote: Only 'id' and 'title' are required. Other fields can be filled manually after import.`;
            } else if (errorMessage.includes('Invalid JSON format')) {
                userFriendlyMessage = `${errorMessage}\n\nPlease check the .taskmaster/tasks/task.json file for syntax errors.`;
            }
            
            vscode.window.showErrorMessage(`Failed to import TaskMaster data: ${userFriendlyMessage}`);
            
            // Send error to webview so it can re-enable the button
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendTaskMasterError(userFriendlyMessage);
            }
        }
    });

    const checkDuplicateTaskMasterCommand = vscode.commands.registerCommand('specDrivenDevelopment.checkDuplicateTaskMaster', async (data: any) => {
        try {
            // Get stored submitted tasks from global state
            const submittedTasks = context.globalState.get<any[]>('specDrivenDevelopment.submittedTaskMasterTasks', []);
            
            // Check if current task was already submitted
            const existingSubmission = submittedTasks.find(task => task.taskId === data.taskId);
            
            // If there's a previous submission, verify the JIRA ticket still exists
            if (existingSubmission && existingSubmission.jiraUrl) {
                try {
                    // Extract JIRA ticket ID from URL
                    const jiraTicketId = taskService.extractJiraTicketId(existingSubmission.jiraUrl);
                    if (jiraTicketId) {
                        console.log(`[SDD:Core] INFO | Verifying if JIRA ticket ${jiraTicketId} still exists...`);
                        
                        // Verify ticket exists in JIRA
                        const validationResult = await jiraService.validateJiraIssue(jiraTicketId);
                        
                        if (!validationResult.isValid) {
                            // Ticket no longer exists, remove from cache and allow resubmission
                            console.log(`[SDD:Core] INFO | JIRA ticket ${jiraTicketId} no longer exists. Removing from cache and allowing resubmission.`);
                            const updatedTasks = submittedTasks.filter(task => task.taskId !== data.taskId);
                            await context.globalState.update('specDrivenDevelopment.submittedTaskMasterTasks', updatedTasks);
                            
                            // Allow submission to proceed
                            const result = {
                                isDuplicate: false,
                                feedbackData: data.feedbackData,
                                previousSubmission: null
                            };
                            
                            if (specDrivenDevelopmentPanel) {
                                specDrivenDevelopmentPanel.sendDuplicateCheckResult(result);
                            }
                            return;
                        }
                        
                        // Check if ticket status is DONE
                        if (validationResult.status && validationResult.status.toUpperCase() === 'DONE') {
                            // Ticket is marked as DONE, remove from cache and allow resubmission
                            console.log(`[SDD:Core] INFO | JIRA ticket ${jiraTicketId} is marked as DONE. Removing from cache and allowing resubmission.`);
                            const updatedTasks = submittedTasks.filter(task => task.taskId !== data.taskId);
                            await context.globalState.update('specDrivenDevelopment.submittedTaskMasterTasks', updatedTasks);
                            
                            // Allow submission to proceed
                            const result = {
                                isDuplicate: false,
                                feedbackData: data.feedbackData,
                                previousSubmission: null
                            };
                            
                            if (specDrivenDevelopmentPanel) {
                                specDrivenDevelopmentPanel.sendDuplicateCheckResult(result);
                            }
                            return;
                        }
                        
                        console.log(`[SDD:Core] INFO | JIRA ticket ${jiraTicketId} still exists with status: ${validationResult.status || 'Unknown'}. Showing duplicate warning.`);
                    }
                } catch (validationError) {
                    console.error('[SDD:Core] ERROR | Error validating JIRA ticket existence:', validationError);
                    // If validation fails, assume ticket might not exist and remove from cache
                    const updatedTasks = submittedTasks.filter(task => task.taskId !== data.taskId);
                    await context.globalState.update('specDrivenDevelopment.submittedTaskMasterTasks', updatedTasks);
                    
                    // Allow submission to proceed
                    const result = {
                        isDuplicate: false,
                        feedbackData: data.feedbackData,
                        previousSubmission: null
                    };
                    
                    if (specDrivenDevelopmentPanel) {
                        specDrivenDevelopmentPanel.sendDuplicateCheckResult(result);
                    }
                    return;
                }
            }
            
            const result = {
                isDuplicate: !!existingSubmission,
                feedbackData: data.feedbackData,
                previousSubmission: existingSubmission || null
            };

            // Send result back to webview
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendDuplicateCheckResult(result);
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Error checking duplicate TaskMaster submission:', error);
            // On error, allow submission to proceed
            const result = {
                isDuplicate: false,
                feedbackData: data.feedbackData,
                previousSubmission: null
            };
            
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendDuplicateCheckResult(result);
            }
        }
    });

    // Add feedback management commands
    const viewFeedbackHistoryCommand = vscode.commands.registerCommand('specDrivenDevelopment.viewFeedbackHistory', async () => {
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
            console.error('[SDD:Core] ERROR | Failed to load feedback history:', (error as Error).message);
        }
    });

    const exportFeedbackHistoryCommand = vscode.commands.registerCommand('specDrivenDevelopment.exportFeedbackHistory', async () => {
        try {
            const history = await feedbackService.getSubmissionHistory();
            
            if (history.length === 0) {
                vscode.window.showWarningMessage('No feedback history to export.');
                return;
            }

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('spec-driven-development-feedback.json'),
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

    const clearFeedbackHistoryCommand = vscode.commands.registerCommand('specDrivenDevelopment.clearFeedbackHistory', async () => {
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

    // GitHub token configuration command removed - not needed for Salesforce-only functionality

    // Analyze Folder Code & Apply Instructions
    const analyzeFolderCodeCommand = vscode.commands.registerCommand('specDrivenDevelopment.analyzeFolderCode', async (folderUri: vscode.Uri) => {
        try {
            if (!folderUri) {
                vscode.window.showWarningMessage('No folder selected');
                return;
            }

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

                // Apply selected instructions with auto-paste, including folder context
                await copilotIntegration.applyInstructionsToWorkspaceWithAutoPasteForContext(selectedInstructions, bestPrompt, folderUri.fsPath, 'folder');
                
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
    const analyzeWorkspaceCodeCommand = vscode.commands.registerCommand('specDrivenDevelopment.analyzeWorkspaceCode', async () => {
        try {
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

                // Apply selected instructions with auto-paste, including workspace context
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                const workspacePath = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
                await copilotIntegration.applyInstructionsToWorkspaceWithAutoPasteForContext(selectedInstructions, bestPrompt, workspacePath, 'directory');
                
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
    const applyFolderPromptsCommand = vscode.commands.registerCommand('specDrivenDevelopment.applyFolderPrompts', async (folderUri: vscode.Uri) => {
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

            // Apply selected prompts with folder context
            const selectedPrompts = selectedItems.map(item => item.prompt);
            const promptSummary = selectedPrompts.map((p: any) => p.name).join(', ');
            
            await copilotIntegration.sendPromptsToCopilotChatWithAutoPasteForContext(
                `Please help me with these prompts for folder analysis (${folderContext.fileCount} files): ${promptSummary}`,
                selectedPrompts,
                folderUri.fsPath,
                'folder'
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
    const applyWorkspacePromptsCommand = vscode.commands.registerCommand('specDrivenDevelopment.applyWorkspacePrompts', async () => {
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

            // Apply selected prompts with workspace context
            const selectedPrompts = selectedItems.map(item => item.prompt);
            const promptSummary = selectedPrompts.map((p: any) => p.name).join(', ');
            
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const workspacePath = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
            await copilotIntegration.sendPromptsToCopilotChatWithAutoPasteForContext(
                `Please help me with these prompts for workspace analysis (${workspaceContext.fileCount} files across ${workspaceContext.folderCount} folders): ${promptSummary}`,
                selectedPrompts,
                workspacePath,
                'directory'
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

    // Task Management Commands
    const retrieveWipTasksCommand = vscode.commands.registerCommand('specDrivenDevelopment.retrieveWipTasks', async (options: any = {}) => {
        try {
            console.log('[SDD:Core] INFO | Retrieve WIP tickets command triggered with options:', options);
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Retrieving WIP tickets...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 20, message: 'Checking AWS connection...' });
                console.log('[SDD:Core] INFO | Checking AWS connection status...');
                
                progress.report({ increment: 30, message: 'Fetching WIP tickets from Salesforce...' });
                console.log('[SDD:Core] INFO | Calling taskService.retrieveWipTasks()...');
                
                const result = await taskService.retrieveWipTasks(options);
                console.log(`[SDD:Core] INFO | Retrieved ${result.tasks.length} WIP tickets (${result.totalCount} total):`, result);
                
                const foundStartRecord = (options.offset || 0) + 1;
                const foundEndRecord = Math.min((options.offset || 0) + result.tasks.length, result.totalCount);
                const foundRangeText = result.totalCount > 0 ? `${foundStartRecord}-${foundEndRecord} of ${result.totalCount}` : result.tasks.length.toString();
                progress.report({ increment: 50, message: `Found ${foundRangeText} WIP tickets` });
                
                if (specDrivenDevelopmentPanel) {
                    console.log('[SDD:Core] INFO | Sending WIP task list to webview...');
                    specDrivenDevelopmentPanel.sendTaskList(result.tasks, 'wip', {
                        totalCount: result.totalCount,
                        hasMore: result.hasMore,
                        currentOffset: options.offset || 0,
                        currentLimit: options.limit || 20,
                        searchTerm: options.searchTerm
                    });
                } else {
                    console.error('[SDD:Core] ERROR | specDrivenDevelopmentPanel is null');
                }
                
                const searchText = options.searchTerm ? ` (search: "${options.searchTerm}")` : '';
                const startRecord = (options.offset || 0) + 1;
                const endRecord = Math.min((options.offset || 0) + result.tasks.length, result.totalCount);
                const rangeText = result.totalCount > 0 ? `${startRecord}-${endRecord} of ${result.totalCount}` : result.tasks.length.toString();
                vscode.window.showInformationMessage(`✅ Retrieved ${rangeText} WIP tickets${searchText}`);
            });
        } catch (error) {
            console.error('[SDD:Core] ERROR | Error in retrieveWipTasksCommand:', error);
            
            // Check if this is an email configuration error
            const errorMessage = (error as Error).message;
            if (errorMessage.includes('User email not configured')) {
                const action = await vscode.window.showErrorMessage(
                    '❌ User email not configured. Configure your email to retrieve personalized tasks.',
                    'Configure Email'
                );
                if (action === 'Configure Email') {
                    vscode.commands.executeCommand('specDrivenDevelopment.configureUser');
                }
            } else {
                vscode.window.showErrorMessage(`Failed to retrieve WIP tickets: ${errorMessage}`);
            }
            
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendTaskList([], 'wip', { totalCount: 0, hasMore: false, currentOffset: 0, currentLimit: 20 });
            }
        }
    });

    const retrieveRunningTasksCommand = vscode.commands.registerCommand('specDrivenDevelopment.retrieveRunningTasks', async (options: any = {}) => {
        try {
            console.log('[SDD:Core] INFO | Retrieve all tickets command triggered with options:', options);
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Retrieving all tickets...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 20, message: 'Checking AWS connection...' });
                console.log('[SDD:Core] INFO | Checking AWS connection status...');
                
                progress.report({ increment: 30, message: 'Fetching tickets from Salesforce...' });
                console.log('[SDD:Core] INFO | Calling taskService.retrieveRunningTasks()...');
                
                const result = await taskService.retrieveRunningTasks(options);
                console.log(`[SDD:Core] INFO | Retrieved ${result.tasks.length} tickets (${result.totalCount} total):`, result);
                
                const foundStartRecord = (options.offset || 0) + 1;
                const foundEndRecord = Math.min((options.offset || 0) + result.tasks.length, result.totalCount);
                const foundRangeText = result.totalCount > 0 ? `${foundStartRecord}-${foundEndRecord} of ${result.totalCount}` : result.tasks.length.toString();
                progress.report({ increment: 50, message: `Found ${foundRangeText} tasks` });
                
                if (specDrivenDevelopmentPanel) {
                    console.log('[SDD:Core] INFO | Sending task list to webview...');
                    specDrivenDevelopmentPanel.sendTaskList(result.tasks, 'running', {
                        totalCount: result.totalCount,
                        hasMore: result.hasMore,
                        currentOffset: options.offset || 0,
                        currentLimit: options.limit || 20,
                        searchTerm: options.searchTerm
                    });
                } else {
                    console.error('[SDD:Core] ERROR | specDrivenDevelopmentPanel is null');
                }
                
                const searchText = options.searchTerm ? ` (search: "${options.searchTerm}")` : '';
                const startRecord = (options.offset || 0) + 1;
                const endRecord = Math.min((options.offset || 0) + result.tasks.length, result.totalCount);
                const rangeText = result.totalCount > 0 ? `${startRecord}-${endRecord} of ${result.totalCount}` : result.tasks.length.toString();
                vscode.window.showInformationMessage(`✅ Retrieved ${rangeText} tickets${searchText}`);
            });
        } catch (error) {
            console.error('[SDD:Core] ERROR | Error in retrieveRunningTasksCommand:', error);
            
            // Check if this is an email configuration error
            const errorMessage = (error as Error).message;
            if (errorMessage.includes('User email not configured')) {
                const action = await vscode.window.showErrorMessage(
                    '❌ User email not configured. Configure your email to retrieve personalized tasks.',
                    'Configure Email'
                );
                if (action === 'Configure Email') {
                    vscode.commands.executeCommand('specDrivenDevelopment.configureUser');
                }
            } else {
                vscode.window.showErrorMessage(`Failed to retrieve tickets: ${errorMessage}`);
            }
            
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendTaskList([], 'running', { totalCount: 0, hasMore: false, currentOffset: 0, currentLimit: 20 });
            }
        }
    });

    const retrieveArchivedTasksCommand = vscode.commands.registerCommand('specDrivenDevelopment.retrieveArchivedTasks', async (options: any = {}) => {
        try {
            console.log('[SDD:Core] INFO | Retrieve done tickets command triggered with options:', options);
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Retrieving done tickets...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 20, message: 'Checking AWS connection...' });
                console.log('[SDD:Core] INFO | Checking AWS connection status...');
                
                progress.report({ increment: 30, message: 'Fetching done tickets from Salesforce...' });
                console.log('[SDD:Core] INFO | Calling taskService.retrieveArchivedTasks()...');
                
                const result = await taskService.retrieveArchivedTasks(options);
                console.log(`[SDD:Core] INFO | Retrieved ${result.tasks.length} done tickets (${result.totalCount} total):`, result);
                
                const foundStartRecord = (options.offset || 0) + 1;
                const foundEndRecord = Math.min((options.offset || 0) + result.tasks.length, result.totalCount);
                const foundRangeText = result.totalCount > 0 ? `${foundStartRecord}-${foundEndRecord} of ${result.totalCount}` : result.tasks.length.toString();
                progress.report({ increment: 50, message: `Found ${foundRangeText} done tickets` });
                
                if (specDrivenDevelopmentPanel) {
                    console.log('[SDD:Core] INFO | Sending done ticket list to webview...');
                    specDrivenDevelopmentPanel.sendTaskList(result.tasks, 'archived', {
                        totalCount: result.totalCount,
                        hasMore: result.hasMore,
                        currentOffset: options.offset || 0,
                        currentLimit: options.limit || 20,
                        searchTerm: options.searchTerm
                    });
                } else {
                    console.error('[SDD:Core] ERROR | specDrivenDevelopmentPanel is null');
                }
                
                const searchText = options.searchTerm ? ` (search: "${options.searchTerm}")` : '';
                const startRecord = (options.offset || 0) + 1;
                const endRecord = Math.min((options.offset || 0) + result.tasks.length, result.totalCount);
                const rangeText = result.totalCount > 0 ? `${startRecord}-${endRecord} of ${result.totalCount}` : result.tasks.length.toString();
                vscode.window.showInformationMessage(`✅ Retrieved ${rangeText} done tickets${searchText}`);
            });
        } catch (error) {
            console.error('[SDD:Core] ERROR | Error in retrieveArchivedTasksCommand:', error);
            
            // Check if this is an email configuration error
            const errorMessage = (error as Error).message;
            if (errorMessage.includes('User email not configured')) {
                const action = await vscode.window.showErrorMessage(
                    '❌ User email not configured. Configure your email to retrieve personalized tasks.',
                    'Configure Email'
                );
                if (action === 'Configure Email') {
                    vscode.commands.executeCommand('specDrivenDevelopment.configureUser');
                }
            } else {
                vscode.window.showErrorMessage(`Failed to retrieve done tickets: ${errorMessage}`);
            }
            
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendTaskList([], 'archived', { totalCount: 0, hasMore: false, currentOffset: 0, currentLimit: 20 });
            }
        }
    });

    const restoreTaskCommand = vscode.commands.registerCommand('specDrivenDevelopment.restoreTask', async (taskData: any) => {
        try {
            // Extract taskId from the taskData object
            const taskId = typeof taskData === 'string' ? taskData : taskData?.taskId || taskData?.Id;
            console.log('[SDD:Core] INFO | Restore task command triggered for:', taskData, 'extracted taskId:', taskId);
            
            if (!taskId) {
                throw new Error('No valid task ID provided');
            }
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Restoring task...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 20, message: 'Checking AWS connection...' });
                console.log('[SDD:Core] INFO | Checking AWS connection status...');
                
                progress.report({ increment: 50, message: 'Restoring task in Salesforce...' });
                console.log('[SDD:Core] INFO | Calling taskService.restoreTask()...');
                
                await taskService.restoreTask(taskId);
                console.log('[SDD:Core] INFO | Task restored successfully');
                
                progress.report({ increment: 100, message: 'Task restored successfully' });
                
                vscode.window.showInformationMessage('✅ Task restored successfully!');
                
                // Refresh the current view by notifying webview
                if (specDrivenDevelopmentPanel) {
                    console.log('[SDD:Core] INFO | Notifying webview of task restoration...');
                    specDrivenDevelopmentPanel.sendTaskNotification('taskRestored', { taskId: taskId });
                }
            });
        } catch (error) {
            console.error('[SDD:Core] ERROR | Error in restoreTaskCommand:', error);
            vscode.window.showErrorMessage(`Failed to restore task: ${(error as Error).message}`);
        }
    });

    const editTaskCommand = vscode.commands.registerCommand('specDrivenDevelopment.editTask', async (taskData: any) => {
        try {
            const { taskId } = taskData;
            console.log('[SDD:Core] INFO | Edit task command triggered for:', taskId, taskData);
            
            // Send task data to webview for comprehensive editing
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.showTaskEditForm(taskData);
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Error in editTaskCommand:', error);
            vscode.window.showErrorMessage(`Failed to open edit form: ${(error as Error).message}`);
        }
    });

    const saveTaskUpdatesCommand = vscode.commands.registerCommand('specDrivenDevelopment.saveTaskUpdates', async (updateData: any) => {
        try {
            const { taskId, updates, taskType } = updateData;
            console.log('[SDD:Core] INFO | Save task updates command triggered:', taskId, updates, 'taskType:', taskType);
            
            const result = await taskService.updateTask(taskId, updates);
            
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendTaskActionResult(result, 'edit');
            }
            
            if (result.success) {
                vscode.window.showInformationMessage('✅ Task updated successfully!');
                // Refresh the appropriate task list based on which list was being viewed
                if (taskType === 'wip') {
                    vscode.commands.executeCommand('specDrivenDevelopment.retrieveWipTasks');
                } else if (taskType === 'archived') {
                    vscode.commands.executeCommand('specDrivenDevelopment.retrieveArchivedTasks');
                } else {
                    // Default to running tasks list
                    vscode.commands.executeCommand('specDrivenDevelopment.retrieveRunningTasks');
                }
            } else {
                vscode.window.showErrorMessage(`❌ Failed to update task: ${result.message}`);
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Error in saveTaskUpdatesCommand:', error);
            vscode.window.showErrorMessage(`Failed to save task updates: ${(error as Error).message}`);
        }
    });

    const deleteTaskCommand = vscode.commands.registerCommand('specDrivenDevelopment.deleteTask', async (taskData: any) => {
        try {
            const { taskId, taskName } = taskData;
            
            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to delete task "${taskName}"? This action cannot be undone.`,
                { modal: true },
                'Yes, Delete'
            );
            
            if (confirmation !== 'Yes, Delete') {
                return;
            }
            
            const result = await taskService.deleteTask(taskId);
            
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendTaskActionResult(result, 'delete');
            }
            
            if (result.success) {
                vscode.window.showInformationMessage('✅ Task deleted successfully!');
            } else {
                vscode.window.showErrorMessage(`❌ Failed to delete task: ${result.message}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete task: ${(error as Error).message}`);
        }
    });

    const cleanupTaskCommand = vscode.commands.registerCommand('specDrivenDevelopment.cleanupTask', async (taskData: any) => {
        try {
            const { taskId, taskName } = taskData;
            console.log('[SDD:Core] INFO | Marking task as Done in Salesforce:', taskId, taskName);
            
            // Retrieve full task object to get CreatedDate and other fields
            const wipResult = await taskService.retrieveWipTasks({ limit: 1000 });
            const fullTask = wipResult.tasks.find((t: any) => t.Id === taskId);
            
            if (!fullTask) {
                throw new Error('Task not found in WIP list');
            }
            
            // Extract ticket number from Jira link
            const ticketNumber = taskService.extractTicketNumber(fullTask.Jira_Link__c);
            
            // Calculate actual hours and deployment date for confirmation dialog
            const actualHours = taskService.calculateActualHours(fullTask.CreatedDate || new Date().toISOString());
            const deploymentDate = new Date().toISOString().split('T')[0];
            
            // Show confirmation dialog with ticket details
            const confirmMessage = `Are you sure you want to submit ticket ${ticketNumber}?\n\nActual Hours: ${actualHours}\nDeployment Date: ${deploymentDate}`;
            const confirmation = await vscode.window.showWarningMessage(
                confirmMessage,
                { modal: true },
                'Yes, Submit'
            );
            
            // If user cancels, exit early
            if (confirmation !== 'Yes, Submit') {
                console.log('[SDD:Core] INFO | User cancelled ticket submission');
                return;
            }
            
            // Call cleanupTask with full task object
            const result = await taskService.cleanupTask(fullTask);
            
            if (specDrivenDevelopmentPanel) {
                // Send result with task ID for UI removal
                specDrivenDevelopmentPanel.sendTaskActionResult({ ...result, taskId }, 'cleanup');
            }
            
            if (result.success) {
                vscode.window.showInformationMessage(`✅ Ticket ${ticketNumber} marked as done successfully!`);
            } else {
                vscode.window.showErrorMessage(`❌ Failed to mark ticket as Done: ${result.message}`);
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Error in cleanupTaskCommand:', error);
            vscode.window.showErrorMessage(`Failed to mark ticket as Done: ${(error as Error).message}`);
        }
    });

    // User Configuration Command
    const configureUserCommand = vscode.commands.registerCommand('specDrivenDevelopment.configureUser', async () => {
        try {
            // Get current configured email without triggering auto-detection popup
            const currentConfiguredEmail = vscode.workspace.getConfiguration('specDrivenDevelopment').get<string>('userEmail') || '';
            
            // Show input box directly for email configuration
            const newEmail = await vscode.window.showInputBox({
                prompt: 'Enter your Cisco email address for JIRA ticket filtering',
                placeHolder: 'e.g., john.doe@cisco.com',
                value: currentConfiguredEmail,
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'Email address is required';
                    }
                    
                    // Check basic email format first
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(value)) {
                        // More specific feedback based on what's missing
                        if (!value.includes('@')) {
                            return 'Please include @ in your email address';
                        }
                        if (!value.includes('.')) {
                            return 'Please include a domain (e.g., @cisco.com)';
                        }
                        return 'Please enter a valid email format (e.g., your.name@cisco.com)';
                    }
                    
                    // Check domain requirement - more specific feedback
                    if (!value.toLowerCase().endsWith('@cisco.com')) {
                        const domain = value.toLowerCase().split('@')[1];
                        if (domain && domain !== 'cisco.com') {
                            return `Please use @cisco.com instead of @${domain}`;
                        }
                        return 'Please use your cisco email address';
                    }
                    
                    return null;
                }
            });

            if (newEmail) {
                await vscode.workspace.getConfiguration('specDrivenDevelopment').update('userEmail', newEmail, vscode.ConfigurationTarget.Global);
                userService.clearCache();
                // Don't trigger auto-detection popup - just confirm the configuration
                console.log(`[SDD:Core] INFO | Email configuration updated: ${newEmail}`);
                vscode.window.showInformationMessage(`✅ Email configured: ${newEmail}. You can now retrieve your tasks.`);
                
                // Note: T&C check is handled after AWS connection, not here
                // to avoid duplicate popups
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to configure email: ${(error as Error).message}`);
        }
    });

    // Debug command to check user filtering
    const debugUserFilterCommand = vscode.commands.registerCommand('specDrivenDevelopment.debugUserFilter', async () => {
        try {
            vscode.window.showInformationMessage('🔍 Checking user filter configuration...');
            
            // Get user email and username
            const userEmail = await userService.getUserEmail();
            const username = await userService.getUsernameFromEmail();
            const userInfo = await userService.getUserInfo();
            

            
            // Check manual email configuration
            const manualEmail = vscode.workspace.getConfiguration('specDrivenDevelopment').get<string>('userEmail');
            const hasManualEmail = !!manualEmail;
            
            // Show debug information
            const debugInfo = `
🔍 User Filter Debug Information:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 Current Email: ${userEmail}
👤 Username (from email): ${username}
🎯 Email Source: ${userInfo.source}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚙️ Manual Email Configured: ${hasManualEmail ? '✅ Yes' : '❌ No'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Status: ${userInfo.source === 'system' ? '❌ Email not configured - API calls blocked' : 
    userInfo.source === 'manual' ? '✅ Manual email configured - API calls allowed' :
    userInfo.source === 'git-config' ? '✅ Git config email retrieved - API calls allowed' : 
    '✅ Email configured - API calls allowed'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${userInfo.source !== 'system' ? `🎯 Filter Query (WIP):
WHERE Jira_Link__c != null AND Status__c != 'Done' AND (CreatedBy.Email = '${userEmail}' OR Assignee_through_VS__c = '${username}')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ''}
� How to Configure Email:
1. Use Command Palette: "Configure User Email"
2. Or ensure Git is configured: git config --global user.email your@cisco.com
3. Or set manual email: Settings → specDrivenDevelopment.userEmail

📋 Requirements:
• Email must be cisco.com domain
• Git config email will be auto-detected if available
• Your email in Salesforce must match configured email
• 'Assignee_through_VS__c' field should contain your username
            `.trim();
            
            // Show in an output channel for better formatting
            const outputChannel = vscode.window.createOutputChannel('User Filter Debug');
            outputChannel.clear();
            outputChannel.appendLine(debugInfo);
            outputChannel.show();
            
            // Also show a summary message
            const statusIcon = userInfo.source === 'system' ? '❌' : '✅';
            vscode.window.showInformationMessage(
                `${statusIcon} Email: ${userEmail} | Source: ${userInfo.source} - Check Output panel for details`
            );
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to debug user filter: ${(error as Error).message}`);
        }
    });

    // Terms & Conditions Commands
    const resetTCStateCommand = vscode.commands.registerCommand('specDrivenDevelopment.resetTCState', async () => {
        try {
            await termsConditionsService.resetState();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to reset T&C state: ${(error as Error).message}`);
        }
    });

    const showTCPopupCommand = vscode.commands.registerCommand('specDrivenDevelopment.showTCPopup', async () => {
        try {
            const userChoice = await termsConditionsService.showTCPopup();
            if (userChoice) {
                await termsConditionsService.processUserConsent(userChoice);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show T&C popup: ${(error as Error).message}`);
        }
    });

    // Quick Feedback Commands
    const submitQuickFeedbackCommand = vscode.commands.registerCommand('specDrivenDevelopment.submitQuickFeedback', async (data: any) => {
        try {
            // Get user email
            const userEmail = await userService.getUserEmail();
            const result = await feedbackService.submitSddFeedback(data, userEmail);
            
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendQuickFeedbackResult(result);
            }

            if (result.success) {
                vscode.window.showInformationMessage(`✅ Quick feedback submitted successfully! Ticket: ${result.ticketId || 'N/A'}`);
            } else {
                vscode.window.showErrorMessage(`❌ Failed to submit quick feedback: ${result.error}`);
            }
        } catch (error) {
            const errorMessage = `Failed to submit quick feedback: ${(error as Error).message}`;
            
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendQuickFeedbackResult({
                    success: false,
                    message: errorMessage,
                    error: (error as Error).message,
                    timestamp: new Date().toISOString()
                });
            }
            
            vscode.window.showErrorMessage(errorMessage);
        }
    });

    const retrieveQuickFeedbackCommand = vscode.commands.registerCommand('specDrivenDevelopment.retrieveQuickFeedback', async (options: any = {}) => {
        try {
            console.log('[SDD:Core] INFO | Retrieve quick feedback command triggered with options:', options);
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Retrieving quick feedback...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 20, message: 'Checking AWS connection...' });
                console.log('[SDD:Core] INFO | Checking AWS connection status...');
                
                progress.report({ increment: 30, message: 'Fetching quick feedback from Salesforce...' });
                console.log('[SDD:Core] INFO | Calling feedbackService.retrieveQuickFeedback()...');
                
                const result = await feedbackService.retrieveQuickFeedback(options);
                console.log(`[SDD:Core] INFO | Retrieved ${result.feedbacks.length} quick feedback items (${result.totalCount} total):`, result);
                
                const foundStartRecord = (options.offset || 0) + 1;
                const foundEndRecord = Math.min((options.offset || 0) + result.feedbacks.length, result.totalCount);
                const foundRangeText = result.totalCount > 0 ? `${foundStartRecord}-${foundEndRecord} of ${result.totalCount}` : result.feedbacks.length.toString();
                progress.report({ increment: 50, message: `Found ${foundRangeText} quick feedback items` });
                
                if (specDrivenDevelopmentPanel) {
                    console.log('[SDD:Core] INFO | Sending quick feedback list to webview...');
                    specDrivenDevelopmentPanel.sendQuickFeedbackList(result.feedbacks, {
                        totalCount: result.totalCount,
                        hasMore: result.hasMore,
                        currentOffset: options.offset || 0,
                        currentLimit: options.limit || 10,
                        searchTerm: options.searchTerm
                    });
                } else {
                    console.error('[SDD:Core] ERROR | specDrivenDevelopmentPanel is null');
                }
                
                const searchText = options.searchTerm ? ` (search: "${options.searchTerm}")` : '';
                const startRecord = (options.offset || 0) + 1;
                const endRecord = Math.min((options.offset || 0) + result.feedbacks.length, result.totalCount);
                const rangeText = result.totalCount > 0 ? `${startRecord}-${endRecord} of ${result.totalCount}` : result.feedbacks.length.toString();
                vscode.window.showInformationMessage(`✅ Retrieved ${rangeText} quick feedback items${searchText}`);
            });
        } catch (error) {
            console.error('[SDD:Core] ERROR | Error in retrieveQuickFeedbackCommand:', error);
            
            const errorMessage = (error as Error).message;
            if (errorMessage.includes('User email not configured')) {
                const action = await vscode.window.showErrorMessage(
                    '❌ User email not configured. Configure your email to retrieve quick feedback.',
                    'Configure Email'
                );
                if (action === 'Configure Email') {
                    vscode.commands.executeCommand('specDrivenDevelopment.configureUser');
                }
            } else {
                vscode.window.showErrorMessage(`Failed to retrieve quick feedback: ${errorMessage}`);
            }
            
            if (specDrivenDevelopmentPanel) {
                specDrivenDevelopmentPanel.sendQuickFeedbackList([], { totalCount: 0, hasMore: false, currentOffset: 0, currentLimit: 10 });
            }
        }
    });

    const deleteQuickFeedbackCommand = vscode.commands.registerCommand('specDrivenDevelopment.deleteQuickFeedback', async (data: any) => {
        try {
            const { feedbackId, feedbackName, ticketNumber } = data;
            console.log('[SDD:Core] INFO | Delete quick feedback command triggered:', { feedbackId, feedbackName, ticketNumber });
            
            // Show confirmation dialog
            const displayTicket = (ticketNumber && ticketNumber !== 'N/A' && ticketNumber !== 'TBD') ? ticketNumber : feedbackName;
            const confirmed = await vscode.window.showWarningMessage(
                `Are you sure you want to delete feedback "${feedbackName}" (${displayTicket})? This action cannot be undone.`,
                { modal: true },
                'Delete'
            );
            
            if (confirmed !== 'Delete') {
                console.log('[SDD:Core] INFO | Delete cancelled by user');
                return;
            }
            
            const result = await feedbackService.deleteQuickFeedback(feedbackId);
            
            if (result.success) {
                vscode.window.showInformationMessage(`✅ Quick feedback "${displayTicket}" deleted successfully!`);
                // Refresh the quick feedback list
                vscode.commands.executeCommand('specDrivenDevelopment.retrieveQuickFeedback');
            } else {
                vscode.window.showErrorMessage(`❌ Failed to delete quick feedback: ${result.message}`);
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Delete quick feedback failed:', error);
            vscode.window.showErrorMessage(`Failed to delete quick feedback: ${(error as Error).message}`);
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
        configureUserCommand,
        debugUserFilterCommand,
        resetTCStateCommand,
        showTCPopupCommand,
        // New Spec Driven Development Panel Commands
        openPanelCommand,
        connectAWSCommand,
        refreshAWSConnectionCommand,
        disconnectAWSCommand,
        getRealTimeAWSStatusCommand,
        getEnhancedAWSStatusCommand,
        listAWSSecretsCommand,
        retrySalesforceCredentialsCommand,
        updateJiraIssueCommand,
        loadInitiativesCommand,
        loadEpicsCommand,
        loadEpicsForInitiativeCommand,
        loadSprintDetailsCommand,
        loadSprintsForTeamCommand,
        autoPopulateFromGitCommand,
        configureUserForFeaturesCommand,
        submitFeedbackCommand,
        importTaskMasterCommand,
        checkDuplicateTaskMasterCommand,
        viewFeedbackHistoryCommand,
        exportFeedbackHistoryCommand,
        clearFeedbackHistoryCommand,
        analyzeFolderCodeCommand,
        analyzeWorkspaceCodeCommand,
        applyFolderPromptsCommand,
        applyWorkspacePromptsCommand,
        // Task Management Commands
        retrieveWipTasksCommand,
        retrieveRunningTasksCommand,
        retrieveArchivedTasksCommand,
        editTaskCommand,
        saveTaskUpdatesCommand,
        deleteTaskCommand,
        cleanupTaskCommand,
        restoreTaskCommand,
        // Quick Feedback Commands
        submitQuickFeedbackCommand,
        retrieveQuickFeedbackCommand,
        deleteQuickFeedbackCommand

    );
}

function setupEventListeners(context: vscode.ExtensionContext) {
    // Listen for active editor changes
    const activeEditorChange = vscode.window.onDidChangeActiveTextEditor(async (editor: vscode.TextEditor | undefined) => {
        try {
            if (editor && isAutoApplyEnabled()) {
                const codeContext = contextAnalyzer.analyzeDocument(editor.document);
                const instructions = instructionManager.getInstructionsForFile(editor.document.fileName);
                
                if (instructions.length > 0) {
                    await copilotIntegration.applyInstructionsToWorkspace(instructions);
                }
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Failed to auto-apply instructions:', error);
            // Don't rethrow - prevent extension crash
        }
    });

    // Listen for configuration changes
    const configChange = vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
        try {
            if (event.affectsConfiguration('specDrivenDevelopment')) {
                console.log('[SDD:Core] INFO | Configuration changed');
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Configuration change handler error:', error);
        }
    });

    // Listen for text document changes (for context analysis)
    const documentChange = vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
        try {
            if (event.document === vscode.window.activeTextEditor?.document) {
                // Debounce context analysis for performance
                if (vibeAnalysisTimeout) {
                    clearTimeout(vibeAnalysisTimeout);
                }
                vibeAnalysisTimeout = setTimeout(async () => {
                    try {
                        const codeContext = contextAnalyzer.analyzeDocument(event.document);
                        // Context analysis completed - UI providers removed for simplified panel
                    } catch (error) {
                        console.error('[SDD:Core] ERROR | Failed to analyze document changes:', error);
                    }
                }, 1000); // 1 second debounce
            }
        } catch (error) {
            console.error('[SDD:Core] ERROR | Document change handler error:', error);
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
                    console.error('[SDD:Core] ERROR | Failed to auto-apply initial instructions:', error);
                    // Don't rethrow - prevent extension crash
                }
            }, 2000); // Delay to ensure extension is fully loaded
        }
    }
}

function isAutoApplyEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('specDrivenDevelopment');
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
    console.log('[SDD:Core] INFO | Starting extension deactivation and cleanup...');
    
    // Clean up timeouts
    if (vibeAnalysisTimeout) {
        clearTimeout(vibeAnalysisTimeout);
        vibeAnalysisTimeout = undefined;
        console.log('[SDD:Core] INFO | Cleared vibeAnalysisTimeout');
    }
    
    // Dispose services
    if (copilotIntegration) {
        copilotIntegration.dispose();
        console.log('[SDD:Core] INFO | Disposed copilotIntegration');
    }
    if (resourceManager) {
        resourceManager.dispose();
        console.log('[SDD:Core] INFO | Disposed resourceManager');
    }
    if (awsService) {
        awsService.dispose();
        console.log('[SDD:Core] INFO | Disposed awsService');
    }
    if (userService) {
        userService.dispose();
        console.log('[SDD:Core] INFO | Disposed userService');
    }
    if (estimationParser) {
        estimationParser.dispose();
        console.log('[SDD:Core] INFO | Disposed estimationParser');
    }
    if (jiraService) {
        jiraService.dispose();
        console.log('[SDD:Core] INFO | Disposed jiraService');
    }
    if (feedbackService) {
        feedbackService.dispose();
        console.log('[SDD:Core] INFO | Disposed feedbackService');
    }
    if (notificationManager) {
        notificationManager.dispose();
        console.log('[SDD:Core] INFO | Disposed notificationManager');
    }
    
    // taskService doesn't have a dispose method, so no cleanup needed
    console.log('[SDD:Core] INFO | Spec Driven Development deactivated and cleaned up successfully');
}
