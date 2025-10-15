import * as vscode from 'vscode';

export interface EstimationData {
    originalText: string;
    normalizedValue: number; // in hours
    unit: 'hours' | 'days' | 'weeks' | 'months';
    confidence: 'low' | 'medium' | 'high';
    source: string;
    context?: string;
    breakdown?: EstimationBreakdown[];
    timestamp: Date;
}

export interface EstimationBreakdown {
    task: string;
    estimate: string;
    hours: number;
}

export class EstimationParser {
    private context: vscode.ExtensionContext;
    
    // Regex patterns for different estimation formats
    private readonly patterns = [
        // "Total Estimated Effort: 28-45 person-days" (from your example)
        {
            regex: /Total\s+Estimated?\s+Effort[:\s]+(\d+(?:\.\d+)?)\s*[-–—to]\s*(\d+(?:\.\d+)?)\s*(person-)?(?:days?|hours?|hrs?|weeks?|months?)/gi,
            confidence: 'high',
            isRange: true
        },
        // "Final Estimate: 40 hours (5 days)"
        {
            regex: /Final\s+Estimate[:\s]+(\d+(?:\.\d+)?)\s*(hours?|hrs?|days?|weeks?|months?)(?:\s*\([^)]+\))?/gi,
            confidence: 'high'
        },
        // Direct time patterns: "6 days", "3 weeks", "40 hours"
        {
            regex: /(?:estimated?|will take|requires?|needs?)?\s*(?:about|approximately|around|roughly)?\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|days?|weeks?|months?)/gi,
            confidence: 'high'
        },
        // Range patterns: "2-3 days", "3 to 5 weeks"
        {
            regex: /(?:estimated?|will take|requires?|needs?)?\s*(?:about|approximately|around|roughly)?\s*(\d+(?:\.\d+)?)\s*(?:to|-|–|—)\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|days?|weeks?|months?)/gi,
            confidence: 'medium',
            isRange: true
        },
        // Complex patterns: "Estimated Development Time: 6 days"
        {
            regex: /(?:estimated?\s+(?:development\s+)?time|duration|timeline)[:\s]+(?:about|approximately|around|roughly)?\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|days?|weeks?|months?)/gi,
            confidence: 'high'
        },
        // Story points: "5 story points", "8 points"
        {
            regex: /(\d+(?:\.\d+)?)\s*(?:story\s+)?points?/gi,
            confidence: 'low',
            convertToHours: (value: number) => value * 8 // Assume 1 story point = 8 hours
        },
        // Sprint-based: "2 sprints", "1 sprint"
        {
            regex: /(\d+(?:\.\d+)?)\s*sprints?/gi,
            confidence: 'medium',
            convertToHours: (value: number) => value * 80 // Assume 1 sprint = 2 weeks = 80 hours
        }
    ];

    // Breakdown patterns for detailed estimations
    private readonly breakdownPatterns = [
        // "Backend: 3 days, Frontend: 2 days, Testing: 1 day"
        /([^:,\n]+):\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|days?|weeks?|months?)/gi,
        // "- Backend development: 3 days"
        /-\s*([^:,\n]+):\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|days?|weeks?|months?)/gi,
        // "• Backend implementation: 2 days"
        /[•·]\s*([^:,\n]+):\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|days?|weeks?|months?)/gi
    ];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.setupEventListeners();
    }

    private setupEventListeners() {
        // Check if automatic document parsing is enabled (disabled by default to prevent unwanted notifications)
        const autoParsingEnabled = vscode.workspace.getConfiguration('specDrivenDevelopment').get('enableAutoDocumentParsing', false);
        
        if (autoParsingEnabled) {
            // Listen for GitHub Copilot chat responses
            // Note: This is a placeholder - actual implementation would depend on Copilot API
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (this.isCopilotDocument(event.document)) {
                    this.parseDocumentForEstimations(event.document);
                }
            });
        } else {
            console.log('Spec Driven Development: Automatic document parsing disabled to prevent unwanted notifications. Enable in settings if needed.');
        }

        // Listen for chat panel changes if available
        // This would be implemented when Copilot chat API is available
    }

    private isCopilotDocument(document: vscode.TextDocument): boolean {
        // Check if this is a Copilot chat document or response
        // For now, we'll check for common indicators
        const uri = document.uri.toString();
        return uri.includes('copilot') || 
               uri.includes('chat') || 
               document.languageId === 'copilot-chat' ||
               document.getText().includes('GitHub Copilot');
    }

    public parseText(text: string, source: string = 'GitHub Copilot'): EstimationData[] {
        const estimations: EstimationData[] = [];
        const processedTexts = new Set<string>(); // Avoid duplicates

        for (const pattern of this.patterns) {
            let match;
            pattern.regex.lastIndex = 0; // Reset regex state

            while ((match = pattern.regex.exec(text)) !== null) {
                try {
                    let estimation: EstimationData | null = null;
                    const isRangePattern = (pattern as any).isRange;

                    if (isRangePattern && match.length >= 4) {
                        // Handle range patterns: "28-45 person-days" or "2-3 days"
                        let minValue = parseFloat(match[1]);
                        let maxValue = parseFloat(match[2]);
                        let unitMatch = match[match.length - 1]; // Last capture group should be the unit
                        
                        // Skip person- prefix if present
                        const unit = this.normalizeUnit(unitMatch.replace(/^person-/, ''));
                        const avgValue = (minValue + maxValue) / 2;
                        
                        estimation = {
                            originalText: match[0].trim(),
                            normalizedValue: this.convertToHours(avgValue, unit),
                            unit: unit,
                            confidence: pattern.confidence as 'low' | 'medium' | 'high',
                            source: source,
                            context: this.extractContext(text, match.index!),
                            timestamp: new Date()
                        };
                    } else if (match.length >= 3) {
                        // Handle single value patterns: "6 days" or "40 hours"
                        let value = parseFloat(match[1]);
                        let unit = this.normalizeUnit(match[2]);

                        // Apply custom conversion if specified (for story points, sprints, etc.)
                        if (pattern.convertToHours) {
                            value = pattern.convertToHours(value);
                            unit = 'hours';
                        }

                        estimation = {
                            originalText: match[0].trim(),
                            normalizedValue: this.convertToHours(value, unit),
                            unit: unit,
                            confidence: pattern.confidence as 'low' | 'medium' | 'high',
                            source: source,
                            context: this.extractContext(text, match.index!),
                            timestamp: new Date()
                        };
                    }

                    if (estimation && !processedTexts.has(estimation.originalText)) {
                        // Extract breakdown if available
                        const breakdown = this.extractBreakdown(text, match.index!);
                        if (breakdown && breakdown.length > 0) {
                            estimation.breakdown = breakdown;
                        }

                        estimations.push(estimation);
                        processedTexts.add(estimation.originalText);
                    }
                } catch (error) {
                    console.warn('Failed to parse estimation:', error);
                }
            }
        }

        // Sort by confidence and normalized value (prefer higher confidence and more specific estimates)
        estimations.sort((a, b) => {
            const confidenceOrder = { 'high': 3, 'medium': 2, 'low': 1 };
            const confidenceDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
            if (confidenceDiff !== 0) return confidenceDiff;
            
            // If same confidence, prefer more specific (higher) estimates
            return b.normalizedValue - a.normalizedValue;
        });

        return estimations;
    }

    private extractBreakdown(text: string, matchIndex: number): EstimationBreakdown[] | undefined {
        const breakdown: EstimationBreakdown[] = [];
        
        // Look for breakdown patterns in the surrounding context
        const contextStart = Math.max(0, matchIndex - 500);
        const contextEnd = Math.min(text.length, matchIndex + 500);
        const contextText = text.slice(contextStart, contextEnd);

        for (const pattern of this.breakdownPatterns) {
            let match;
            pattern.lastIndex = 0;

            while ((match = pattern.exec(contextText)) !== null) {
                const task = match[1].trim();
                const value = parseFloat(match[2]);
                const unit = this.normalizeUnit(match[3]);
                const hours = this.convertToHours(value, unit);

                breakdown.push({
                    task: task,
                    estimate: `${value} ${unit}`,
                    hours: hours
                });
            }
        }

        return breakdown.length > 0 ? breakdown : undefined;
    }

    private extractContext(text: string, matchIndex: number, contextSize: number = 100): string {
        const start = Math.max(0, matchIndex - contextSize);
        const end = Math.min(text.length, matchIndex + contextSize);
        return text.slice(start, end).trim();
    }

    private normalizeUnit(unit: string): 'hours' | 'days' | 'weeks' | 'months' {
        const normalizedUnit = unit.toLowerCase().replace(/s$/, ''); // Remove plural 's'
        
        switch (normalizedUnit) {
            case 'hour':
            case 'hr':
                return 'hours';
            case 'day':
                return 'days';
            case 'week':
                return 'weeks';
            case 'month':
                return 'months';
            default:
                return 'hours';
        }
    }

    private convertToHours(value: number, unit: 'hours' | 'days' | 'weeks' | 'months'): number {
        switch (unit) {
            case 'hours':
                return value;
            case 'days':
                return value * 8; // Assuming 8-hour work days
            case 'weeks':
                return value * 40; // Assuming 40-hour work weeks
            case 'months':
                return value * 160; // Assuming 4 weeks per month
            default:
                return value;
        }
    }

    public async parseDocumentForEstimations(document: vscode.TextDocument): Promise<EstimationData[]> {
        const text = document.getText();
        const estimations = this.parseText(text, `Document: ${document.fileName}`);
        
        if (estimations.length > 0) {
            // Cache the estimations
            await this.cacheEstimations(estimations);
            
            // Notify about found estimations
            this.notifyEstimationsFound(estimations);
        }
        
        return estimations;
    }

    public parseClipboardText(text: string): EstimationData[] {
        return this.parseText(text, 'Clipboard');
    }

    public parseUserInput(text: string): EstimationData[] {
        return this.parseText(text, 'User Input');
    }

    private async cacheEstimations(estimations: EstimationData[]): Promise<void> {
        try {
            // Store the most recent estimation globally
            if (estimations.length > 0) {
                const bestEstimation = estimations[0]; // Already sorted by confidence/specificity
                await this.context.globalState.update('specDrivenDevelopment.estimationData', bestEstimation);
                
                // Store all estimations for history
                const existingHistory = this.context.globalState.get<EstimationData[]>('specDrivenDevelopment.estimationHistory', []);
                const updatedHistory = [bestEstimation, ...existingHistory.slice(0, 9)]; // Keep last 10
                await this.context.globalState.update('specDrivenDevelopment.estimationHistory', updatedHistory);
            }
        } catch (error) {
            console.error('Failed to cache estimations:', error);
        }
    }

    private notifyEstimationsFound(estimations: EstimationData[]): void {
        if (!vscode.workspace.getConfiguration('specDrivenDevelopment').get('showEstimationNotifications', true)) {
            return;
        }

        const bestEstimation = estimations[0];
        
        // Show notification
        vscode.window.showInformationMessage(
            `📊 Estimation detected: ${bestEstimation.originalText}`,
            'Open DEVSECOPS Hub',
            'Dismiss'
        ).then(selection => {
            if (selection === 'Open DEVSECOPS Hub') {
                vscode.commands.executeCommand('specDrivenDevelopment.openPanel');
            }
        });

        // Notify webview if available
        try {
            vscode.commands.executeCommand('specDrivenDevelopment.showEstimationNotification', bestEstimation);
        } catch (error) {
            // Command might not be available yet, ignore
        }
    }

    public async getCurrentEstimation(): Promise<EstimationData | undefined> {
        return this.context.globalState.get<EstimationData>('specDrivenDevelopment.estimationData');
    }

    public async getEstimationHistory(): Promise<EstimationData[]> {
        return this.context.globalState.get<EstimationData[]>('specDrivenDevelopment.estimationHistory', []);
    }

    public async clearEstimations(): Promise<void> {
        await this.context.globalState.update('specDrivenDevelopment.estimationData', undefined);
        await this.context.globalState.update('specDrivenDevelopment.estimationHistory', []);
    }

    // Method to manually trigger parsing of currently active editor
    public async parseActiveEditor(): Promise<EstimationData[]> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return [];
        }

        return await this.parseDocumentForEstimations(activeEditor.document);
    }

    // Method to parse selected text
    public async parseSelection(): Promise<EstimationData[]> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.selection.isEmpty) {
            return [];
        }

        const selectedText = activeEditor.document.getText(activeEditor.selection);
        const estimations = this.parseText(selectedText, 'Selection');
        
        if (estimations.length > 0) {
            await this.cacheEstimations(estimations);
            this.notifyEstimationsFound(estimations);
        }
        
        return estimations;
    }

    /**
     * Parse GitHub Copilot Chat response for estimations
     * This method can be called when user receives response from copilot chat
     */
    public async parseCopilotChatResponse(chatResponse: string): Promise<EstimationData[]> {
        console.log('Parsing Copilot chat response for estimations...');
        
        const estimations = this.parseText(chatResponse, 'GitHub Copilot Chat');
        
        if (estimations.length > 0) {
            await this.cacheEstimations(estimations);
            
            // Automatically update the JIRA tab with the parsed estimation
            const bestEstimation = estimations[0];
            console.log(`Found estimation: ${bestEstimation.originalText} = ${bestEstimation.normalizedValue} hours`);
            
            // Notify the webview to update the estimation
            try {
                vscode.commands.executeCommand('specDrivenDevelopment.updateEstimationData', bestEstimation);
            } catch (error) {
                console.warn('Failed to update estimation data:', error);
            }
            
            // Show notification to user
            vscode.window.showInformationMessage(
                `📊 Estimation parsed: ${bestEstimation.normalizedValue} hours from "${bestEstimation.originalText}"`,
                'Open DEVSECOPS Hub',
                'Dismiss'
            ).then(selection => {
                if (selection === 'Open DEVSECOPS Hub') {
                    vscode.commands.executeCommand('specDrivenDevelopment.openPanel');
                }
            });
        } else {
            console.log('No estimations found in Copilot response');
        }
        
        return estimations;
    }

    /**
     * Method to be called when user uses the software effort estimation prompt
     * This can monitor clipboard or active text changes for copilot responses
     */
    public async monitorForCopilotEstimations(): Promise<void> {
        // Get current active text editor content
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const content = activeEditor.document.getText();
            
            // Look for estimation patterns that might be from copilot
            const estimations = this.parseText(content, 'Document Analysis');
            
            if (estimations.length > 0) {
                await this.parseCopilotChatResponse(content);
            }
        }

        // Also check clipboard for copilot responses (user might have copied the response)
        try {
            const clipboardContent = await vscode.env.clipboard.readText();
            if (clipboardContent && clipboardContent.length > 50) {
                // Check if clipboard contains estimation patterns
                const clipboardEstimations = this.parseText(clipboardContent, 'Clipboard');
                if (clipboardEstimations.length > 0) {
                    await this.parseCopilotChatResponse(clipboardContent);
                }
            }
        } catch (error) {
            console.warn('Could not read clipboard:', error);
        }
    }

    public dispose(): void {
        // Cleanup if needed
    }
}
