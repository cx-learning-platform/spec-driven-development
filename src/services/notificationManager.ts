import * as vscode from 'vscode';

export interface NotificationConfig {
    showProgress: boolean;
    showSuccess: boolean;
    showErrors: boolean;
    consolidateMessages: boolean;
    verboseMode: boolean;
}

export class NotificationManager {
    private static instance: NotificationManager;
    private config: NotificationConfig;
    private activeOperations: Map<string, vscode.Progress<any>> = new Map();
    private pendingMessages: string[] = [];
    private consolidationTimer: NodeJS.Timeout | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.config = this.loadNotificationConfig();
    }

    public static getInstance(context?: vscode.ExtensionContext): NotificationManager {
        if (!NotificationManager.instance && context) {
            NotificationManager.instance = new NotificationManager(context);
        }
        return NotificationManager.instance;
    }

    private loadNotificationConfig(): NotificationConfig {
        const config = vscode.workspace.getConfiguration('specDrivenDevelopment.notifications');
        return {
            showProgress: config.get('showProgress', true),
            showSuccess: config.get('showSuccess', true),
            showErrors: config.get('showErrors', true),
            consolidateMessages: config.get('consolidateMessages', true),
            verboseMode: config.get('verboseMode', false)
        };
    }

    /**
     * Show a consolidated operation result instead of multiple notifications
     */
    public async showOperationResult(operation: {
        type: 'instruction' | 'prompt' | 'feedback' | 'analysis';
        success: boolean;
        summary: string;
        details?: string[];
        actions?: { label: string; action: () => void }[];
    }): Promise<void> {
        
        if (!this.config.showSuccess && operation.success) {
            return; // User disabled success notifications
        }

        if (!this.config.showErrors && !operation.success) {
            return; // User disabled error notifications
        }

        const icon = operation.success ? '✅' : '❌';
        const message = `${icon} ${operation.summary}`;

        // Show detailed info only in verbose mode
        let fullMessage = message;
        if (this.config.verboseMode && operation.details && operation.details.length > 0) {
            fullMessage += '\n' + operation.details.join('\n');
        }

        // Show notification with optional actions
        if (operation.actions && operation.actions.length > 0) {
            const actionLabels = operation.actions.map(a => a.label);
            const result = await vscode.window.showInformationMessage(fullMessage, ...actionLabels);
            
            if (result) {
                const selectedAction = operation.actions.find(a => a.label === result);
                if (selectedAction) {
                    selectedAction.action();
                }
            }
        } else {
            if (operation.success) {
                vscode.window.showInformationMessage(fullMessage);
            } else {
                vscode.window.showErrorMessage(fullMessage);
            }
        }
    }

    /**
     * Show progress for long-running operations
     */
    public async withProgress<T>(
        operationId: string,
        title: string,
        task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
    ): Promise<T> {
        
        if (!this.config.showProgress) {
            // If progress disabled, run task without progress UI
            const dummyProgress = { report: () => {} } as any;
            return await task(dummyProgress);
        }

        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title,
                cancellable: false
            },
            async (progress) => {
                this.activeOperations.set(operationId, progress);
                try {
                    const result = await task(progress);
                    return result;
                } finally {
                    this.activeOperations.delete(operationId);
                }
            }
        );
    }

    /**
     * Add message to consolidation queue instead of showing immediately
     */
    public queueMessage(message: string): void {
        if (!this.config.consolidateMessages) {
            vscode.window.showInformationMessage(message);
            return;
        }

        this.pendingMessages.push(message);
        
        // Clear existing timer
        if (this.consolidationTimer) {
            clearTimeout(this.consolidationTimer);
        }

        // Set new timer to consolidate messages
        this.consolidationTimer = setTimeout(() => {
            this.flushConsolidatedMessages();
        }, 2000); // Wait 2 seconds for more messages
    }

    private flushConsolidatedMessages(): void {
        if (this.pendingMessages.length === 0) return;

        if (this.pendingMessages.length === 1) {
            vscode.window.showInformationMessage(this.pendingMessages[0]);
        } else {
            const summary = `✅ Completed ${this.pendingMessages.length} operations`;
            const details = this.pendingMessages.join(' • ');
            
            if (this.config.verboseMode) {
                vscode.window.showInformationMessage(`${summary}\n${details}`);
            } else {
                vscode.window.showInformationMessage(summary, 'Show Details').then(result => {
                    if (result === 'Show Details') {
                        vscode.window.showInformationMessage(details);
                    }
                });
            }
        }

        this.pendingMessages = [];
        this.consolidationTimer = undefined;
    }

    /**
     * Update notification configuration
     */
    public updateConfig(newConfig: Partial<NotificationConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    public dispose(): void {
        if (this.consolidationTimer) {
            clearTimeout(this.consolidationTimer);
        }
        this.activeOperations.clear();
        this.pendingMessages = [];
    }
}
