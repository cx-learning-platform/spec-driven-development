import * as vscode from 'vscode';
import { InstructionManager, Instruction } from '../instructionManager';
import { CodeContext } from '../promptManager';

export class InstructionsProvider implements vscode.TreeDataProvider<InstructionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<InstructionItem | undefined | null | void> = new vscode.EventEmitter<InstructionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<InstructionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentContext?: CodeContext;

    constructor(private instructionManager: InstructionManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setContext(context: CodeContext): void {
        this.currentContext = context;
        this.refresh();
    }

    getTreeItem(element: InstructionItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: InstructionItem): Promise<InstructionItem[]> {
        if (!element) {
            // Root level - show categories
            return Promise.resolve(this.getInstructionCategories());
        } else if (element.contextValue === 'category') {
            // Category level - show instructions in that category
            return Promise.resolve(this.getInstructionsInCategory(element.label as string));
        } else {
            // Instruction level - no children
            return Promise.resolve([]);
        }
    }

    private getInstructionCategories(): InstructionItem[] {
        const categories = new Set<string>();
        
        // Get all instructions
        const allInstructions = this.instructionManager.getAllInstructions();
        
        // Group by mode/category
        allInstructions.forEach(instruction => {
            const category = this.getCategoryName(instruction.mode);
            categories.add(category);
        });

        // Add contextual category if we have context
        if (this.currentContext) {
            categories.add('📍 Contextual');
        }

        return Array.from(categories).map(category => {
            const displayName = category === '📍 Contextual' ? '📍 Contextual (Auto-Selected)' : category;
            const item = new InstructionItem(
                displayName,
                vscode.TreeItemCollapsibleState.Expanded
            );
            item.contextValue = 'category';
            item.iconPath = this.getCategoryIcon(category);
            
            // Special description for contextual category
            if (category === '📍 Contextual') {
                item.description = 'Smart context-aware instructions';
            }
            
            return item;
        });
    }

    private getInstructionsInCategory(category: string): InstructionItem[] {
        let instructions: Instruction[];

        if (category === '📍 Contextual' && this.currentContext) {
            // Get contextual instructions based on current file
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                instructions = this.instructionManager.getInstructionsForFile(activeEditor.document.fileName);
            } else {
                instructions = this.instructionManager.getInstructionsByLanguage(this.currentContext.language);
            }
        } else {
            // Get instructions by mode
            const mode = this.getModeFromCategory(category);
            instructions = this.instructionManager.getInstructionsByMode(mode);
        }

        return instructions.map(instruction => {
            const isContextual = category === '📍 Contextual';
            const displayName = isContextual ? `✨ ${instruction.name}` : instruction.name;
            
            const item = new InstructionItem(
                displayName,
                vscode.TreeItemCollapsibleState.None,
                isContextual ? `🤖 Auto-selected: ${instruction.description}` : instruction.description
            );
            
            item.contextValue = isContextual ? 'contextualInstruction' : 'instruction';
            item.command = {
                command: 'specDrivenDevelopment.openInstruction',
                title: 'Open Instruction',
                arguments: [instruction]
            };
            
            // Enhanced tooltip for contextual instructions
            if (isContextual) {
                item.tooltip = `📍 Context-aware selection\n\n${instruction.description}\n\nThis instruction was automatically selected based on your current file context.`;
            } else {
                item.tooltip = instruction.description;
            }
            
            item.iconPath = this.getInstructionIcon(instruction);
            
            return item;
        });
    }

    private getCategoryName(mode: string): string {
        const categoryNames: { [key: string]: string } = {
            'standards': '⭐ Best Practices',
            'design': '🏗️ Architecture', 
            'guide': '📖 Development Guide',
            'reference': '📚 Reference'
        };
        
        return categoryNames[mode] || '📄 General';
    }

    private getModeFromCategory(category: string): 'reference' | 'standards' | 'design' | 'guide' {
        const modeMap: { [key: string]: 'reference' | 'standards' | 'design' | 'guide' } = {
            '⭐ Best Practices': 'standards',
            '🏗️ Architecture': 'design',
            '📖 Development Guide': 'guide',
            '📚 Reference': 'reference'
        };
        
        return modeMap[category] || 'reference';
    }

    private getCategoryIcon(category: string): vscode.ThemeIcon {
        const iconMap: { [key: string]: { name: string; color: vscode.ThemeColor } } = {
            '⭐ Best Practices': { name: 'star-full', color: new vscode.ThemeColor('charts.yellow') },
            '🏗️ Architecture': { name: 'organization', color: new vscode.ThemeColor('charts.blue') },
            '📖 Development Guide': { name: 'book', color: new vscode.ThemeColor('charts.green') },
            '📚 Reference': { name: 'library', color: new vscode.ThemeColor('charts.purple') },
            '📍 Contextual': { name: 'location', color: new vscode.ThemeColor('charts.orange') }
        };
        
        const iconConfig = iconMap[category] || { name: 'file', color: new vscode.ThemeColor('icon.foreground') };
        return new vscode.ThemeIcon(iconConfig.name, iconConfig.color);
    }

    private getInstructionIcon(instruction: Instruction): vscode.ThemeIcon {
        // Colorful icons based on instruction content/type
        if (instruction.id.includes('go')) {
            return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.blue'));
        } else if (instruction.id.includes('python')) {
            return new vscode.ThemeIcon('symbol-class', new vscode.ThemeColor('charts.green'));
        } else if (instruction.id.includes('terraform')) {
            return new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.orange'));
        } else if (instruction.id.includes('bash')) {
            return new vscode.ThemeIcon('terminal', new vscode.ThemeColor('terminal.ansiYellow'));
        } else if (instruction.mode === 'standards') {
            return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        } else if (instruction.mode === 'design') {
            return new vscode.ThemeIcon('organization', new vscode.ThemeColor('charts.purple'));
        } else {
            return new vscode.ThemeIcon('code', new vscode.ThemeColor('charts.foreground'));
        }
    }

    private createTooltip(instruction: Instruction): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${instruction.name}**\n\n`);
        tooltip.appendMarkdown(`${instruction.description}\n\n`);
        tooltip.appendMarkdown(`**Type:** ${instruction.mode}\n`);
        tooltip.appendMarkdown(`**Applies to:** ${instruction.appliesTo.join(', ')}\n\n`);
        tooltip.appendMarkdown(`*Click to view full content*`);
        tooltip.isTrusted = true;
        return tooltip;
    }
}

export class InstructionItem extends vscode.TreeItem {
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

// Register command to handle instruction clicks
vscode.commands.registerCommand('specDrivenDevelopment.openInstruction', async (instruction: Instruction) => {
    try {
        const doc = await vscode.workspace.openTextDocument({
            content: `# ${instruction.name}\n\n${instruction.content}`,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open instruction: ${error}`);
    }
});
