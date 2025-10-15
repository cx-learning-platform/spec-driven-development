import * as vscode from 'vscode';
import { PromptManager, Prompt, CodeContext } from '../promptManager';

export class PromptsProvider implements vscode.TreeDataProvider<PromptItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PromptItem | undefined | null | void> = new vscode.EventEmitter<PromptItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PromptItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentContext?: CodeContext;

    constructor(private promptManager: PromptManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setContext(context: CodeContext): void {
        this.currentContext = context;
        this.refresh();
    }

    getTreeItem(element: PromptItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: PromptItem): Promise<PromptItem[]> {
        if (!element) {
            // Root level - show categories
            return Promise.resolve(this.getPromptCategories());
        } else if (element.contextValue === 'category') {
            // Category level - show prompts in that category
            return Promise.resolve(this.getPromptsInCategory(element.label as string));
        } else {
            // Prompt level - no children
            return Promise.resolve([]);
        }
    }

    private getPromptCategories(): PromptItem[] {
        const categories = new Set<string>();
        
        // Get all prompts
        const allPrompts = this.promptManager.getAllPrompts();
        
        // Group by category
        allPrompts.forEach(prompt => {
            categories.add(prompt.category);
        });

        // Add contextual category if we have context
        if (this.currentContext) {
            categories.add('🎯 Suggested');
        }

        return Array.from(categories).map(category => {
            const displayName = category === '🎯 Suggested' ? '🎯 Suggested (Auto-Selected)' : `${this.getCategoryIcon(category)} ${category}`;
            const item = new PromptItem(
                displayName,
                vscode.TreeItemCollapsibleState.Expanded
            );
            item.contextValue = 'category';
            
            // Special styling for auto-selected prompts
            if (category === '🎯 Suggested') {
                item.iconPath = new vscode.ThemeIcon('target', new vscode.ThemeColor('charts.red'));
                item.description = 'Context-aware suggestions';
            }
            
            return item;
        });
    }

    private getPromptsInCategory(category: string): PromptItem[] {
        let prompts: Prompt[];

        if (category === '🎯 Suggested' && this.currentContext) {
            // Get contextual prompts
            prompts = this.promptManager.suggestPromptForContext(this.currentContext);
        } else {
            // Remove emoji and get prompts by category
            const cleanCategory = category.replace(/^[^\s]+ /, '');
            prompts = this.promptManager.getPromptsByCategory(cleanCategory);
        }

        return prompts.map(prompt => {
            const isAutoSelected = category === '🎯 Suggested';
            const displayName = isAutoSelected ? `✨ ${prompt.name}` : prompt.name;
            
            const item = new PromptItem(
                displayName,
                vscode.TreeItemCollapsibleState.None,
                isAutoSelected ? `🤖 Auto-selected: ${prompt.description}` : prompt.description
            );
            
            item.contextValue = isAutoSelected ? 'autoSelectedPrompt' : 'prompt';
            item.command = {
                command: 'specDrivenDevelopment.usePrompt',
                title: 'Use Prompt',
                arguments: [prompt]
            };
            
            // Enhanced tooltip for auto-selected prompts
            if (isAutoSelected) {
                item.tooltip = `🎯 Context-aware suggestion\n\n${prompt.description}\n\nThis prompt was automatically selected based on your current file context.`;
            } else {
                item.tooltip = prompt.description;
            }
            
            item.iconPath = this.getPromptIcon(prompt);
            
            return item;
        });
    }

    private getCategoryIcon(category: string): string {
        const iconMap: { [key: string]: string } = {
            'Code Review': '🔍',
            'Project Planning': '📋',
            'Code Quality': '✨',
            'Security': '🔒',
            'General': '💡'
        };
        
        return iconMap[category] || '📄';
    }

    private getPromptIcon(prompt: Prompt): vscode.ThemeIcon {
        // Colorful icons based on prompt category and mode
        if (prompt.category === 'Security') {
            return new vscode.ThemeIcon('shield', new vscode.ThemeColor('charts.red'));
        } else if (prompt.category === 'Code Review') {
            return new vscode.ThemeIcon('search', new vscode.ThemeColor('charts.blue'));
        } else if (prompt.category === 'Project Planning') {
            return new vscode.ThemeIcon('project', new vscode.ThemeColor('charts.purple'));
        } else if (prompt.category === 'Code Quality') {
            return new vscode.ThemeIcon('sparkle', new vscode.ThemeColor('charts.green'));
        } else if (prompt.mode === 'ask') {
            return new vscode.ThemeIcon('question', new vscode.ThemeColor('charts.orange'));
        } else if (prompt.mode === 'edit') {
            return new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.yellow'));
        } else if (prompt.mode === 'agent') {
            return new vscode.ThemeIcon('robot', new vscode.ThemeColor('charts.foreground'));
        } else {
            return new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.foreground'));
        }
    }

    private createTooltip(prompt: Prompt): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${prompt.name}**\n\n`);
        tooltip.appendMarkdown(`${prompt.description}\n\n`);
        tooltip.appendMarkdown(`**Category:** ${prompt.category}\n`);
        tooltip.appendMarkdown(`**Mode:** ${prompt.mode}\n`);
        
        if (prompt.triggers.length > 0) {
            tooltip.appendMarkdown(`**Triggers:** ${prompt.triggers.join(', ')}\n`);
        }
        
        if (prompt.tools.length > 0) {
            tooltip.appendMarkdown(`**Tools:** ${prompt.tools.join(', ')}\n`);
        }
        
        if (prompt.inputVariables.length > 0) {
            tooltip.appendMarkdown(`**Variables:** ${prompt.inputVariables.join(', ')}\n`);
        }
        
        tooltip.appendMarkdown(`\n*Click to use this prompt*`);
        tooltip.isTrusted = true;
        return tooltip;
    }
}

export class PromptItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        description?: string
    ) {
        super(label, collapsibleState);
        if (description) {
            this.tooltip = description;
            this.description = description;
        }
    }
}

// Register command to handle prompt clicks
vscode.commands.registerCommand('specDrivenDevelopment.usePrompt', async (prompt: Prompt) => {
    try {
        // Get current editor context
        const activeEditor = vscode.window.activeTextEditor;
        let contextMessage = '';
        
        if (activeEditor) {
            const selection = activeEditor.selection;
            if (selection && !selection.isEmpty) {
                const selectedText = activeEditor.document.getText(selection);
                contextMessage = `\n\nSelected code:\n\`\`\`${activeEditor.document.languageId}\n${selectedText}\n\`\`\``;
            }
        }

        // Handle variable substitution if needed
        let promptContent = prompt.content;
        if (prompt.inputVariables.length > 0) {
            const variables: { [key: string]: string } = {};
            
            for (const variable of prompt.inputVariables) {
                const value = await vscode.window.showInputBox({
                    placeHolder: `Enter value for ${variable}`,
                    prompt: `This prompt requires a value for: ${variable}`
                });
                
                if (value !== undefined) {
                    variables[variable] = value;
                } else {
                    // User cancelled
                    return;
                }
            }
            
            // Substitute variables
            for (const [key, value] of Object.entries(variables)) {
                promptContent = promptContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
            }
        }

        // Create message with context
        const message = `${prompt.name}\n\n${promptContent}${contextMessage}`;

        // Use the improved Copilot integration with multiple fallbacks
        // Try multiple Copilot commands in order of preference
        const copilotCommands = [
            'github.copilot.interactiveEditor.explain',
            'github.copilot.openChat',
            'workbench.panel.chat.view.copilot.focus',
            'github.copilot.chat.open'
        ];

        let commandWorked = false;
        
        for (const command of copilotCommands) {
            try {
                const availableCommands = await vscode.commands.getCommands();
                if (availableCommands.includes(command)) {
                    await vscode.commands.executeCommand(command);
                    
                    // Copy message to clipboard for user to paste
                    await vscode.env.clipboard.writeText(message);
                    
                    vscode.window.showInformationMessage(
                        '✅ Copilot Chat opened! Prompt copied to clipboard - paste it to start.',
                        { modal: false }
                    );
                    commandWorked = true;
                    break;
                }
            } catch (error) {
                console.log(`Command ${command} failed:`, error);
                continue;
            }
        }

        if (!commandWorked) {
            // Final fallback: copy to clipboard and show instructions
            await vscode.env.clipboard.writeText(message);
            
            const action = await vscode.window.showInformationMessage(
                '📋 Prompt copied to clipboard. Please open GitHub Copilot Chat manually and paste.',
                'Show Prompt',
                'Try Opening Copilot'
            );
            
            if (action === 'Show Prompt') {
                // Show prompt in a new document
                const doc = await vscode.workspace.openTextDocument({
                    content: `# ${prompt.name}\n\n${prompt.description}\n\n## Content\n\n${promptContent}${contextMessage}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, { preview: true });
            } else if (action === 'Try Opening Copilot') {
                // Try to open command palette with copilot search
                vscode.commands.executeCommand('workbench.action.quickOpen', '>GitHub Copilot');
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`❌ Failed to use prompt: ${error}`);
        console.error('Prompt usage error:', error);
    }
});

// Register command to preview prompt
vscode.commands.registerCommand('specDrivenDevelopment.previewPrompt', async (prompt: Prompt) => {
    try {
        const doc = await vscode.workspace.openTextDocument({
            content: `# ${prompt.name}\n\n**Description:** ${prompt.description}\n\n**Category:** ${prompt.category}\n\n**Mode:** ${prompt.mode}\n\n## Content\n\n${prompt.content}`,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to preview prompt: ${error}`);
    }
});
