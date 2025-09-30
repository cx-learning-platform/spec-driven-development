import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface Prompt {
    id: string;
    name: string;
    description: string;
    mode: 'ask' | 'edit' | 'agent';
    tools: string[];
    inputVariables: string[];
    content: string;
    filePath: string;
    category: string;
    triggers: string[];
}

export interface CodeContext {
    fileType: string;
    language: string;
    isReviewContext: boolean;
    hasSecrets: boolean;
    needsLinting: boolean;
    complexity: 'simple' | 'medium' | 'complex';
    technologies: string[];
    fileSize: number;
    hasErrors: boolean;
}

export class PromptManager {
    private prompts: Map<string, Prompt> = new Map();
    private extensionPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
        this.loadPrompts();
    }

    private loadPrompts() {
        const promptDir = path.join(this.extensionPath, 'resources', 'prompts');
        
        if (!fs.existsSync(promptDir)) {
            vscode.window.showErrorMessage('Prompts directory not found');
            return;
        }

        // Clear existing prompts
        this.prompts.clear();

        const files = fs.readdirSync(promptDir).filter((file: string) => file.endsWith('.md'));
        
        console.log(`📁 Found ${files.length} prompt files:`, files);
        
        files.forEach((file: string) => {
            try {
                const filePath = path.join(promptDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const prompt = this.parsePrompt(file, content, filePath);
                
                if (prompt) {
                    this.prompts.set(prompt.id, prompt);
                    console.log(`✅ Loaded prompt: ${prompt.name}`);
                } else {
                    console.warn(`⚠️  Failed to parse prompt: ${file}`);
                }
            } catch (error) {
                console.error(`❌ Failed to load prompt file ${file}:`, error);
            }
        });

        console.log(`📋 Successfully loaded ${this.prompts.size} prompt files`);
        
        // Log all loaded prompts for debugging
        this.prompts.forEach((prompt, id) => {
            console.log(`  - ${id}: ${prompt.name} (${prompt.category})`);
        });
    }

    private parsePrompt(fileName: string, content: string, filePath: string): Prompt | null {
        try {
            // Parse YAML frontmatter if present
            const yamlMatch = content.match(/^---\s*\n(.*?)\n---\n(.*)/s);
            let frontMatter = '';
            let markdownContent = content;
            
            if (yamlMatch) {
                frontMatter = yamlMatch[1];
                markdownContent = yamlMatch[2];
            }

            // Extract metadata from frontmatter or infer from content
            const mode = this.extractMode(frontMatter, content);
            const tools = this.extractTools(frontMatter, content);
            const inputVariables = this.extractInputVariables(content);
            const triggers = this.extractTriggers(fileName, content);

            const id = fileName.replace('.prompt.md', '');
            const name = this.formatName(id);
            const description = this.extractDescription(markdownContent);
            const category = this.categorizePrompt(id, content);

            const prompt: Prompt = {
                id,
                name,
                description,
                mode,
                tools,
                inputVariables,
                content: markdownContent.trim(),
                filePath,
                category,
                triggers
            };

            // Log successful parsing for debugging
            console.log(`✅ Successfully parsed prompt: ${name} (${id})`);
            
            return prompt;
        } catch (error) {
            console.error(`❌ Error parsing prompt ${fileName}:`, error);
            return null;
        }
    }

    private extractMode(frontMatter: string, content: string): 'ask' | 'edit' | 'agent' {
        if (frontMatter.includes('mode:')) {
            const modeMatch = frontMatter.match(/mode:\s*([^\n]+)/);
            if (modeMatch) {
                return modeMatch[1].trim() as 'ask' | 'edit' | 'agent';
            }
        }

        // Infer from content
        if (content.includes('review') || content.includes('analyze')) {
            return 'ask';
        } else if (content.includes('edit') || content.includes('fix') || content.includes('refactor')) {
            return 'edit';
        } else {
            return 'agent';
        }
    }

    private extractTools(frontMatter: string, content: string): string[] {
        const tools: string[] = [];
        
        if (frontMatter.includes('tools:')) {
            const toolsMatch = frontMatter.match(/tools:\s*\n((?:\s*-\s*.*\n)*)/);
            if (toolsMatch) {
                const toolLines = toolsMatch[1].match(/-\s*([^\n]+)/g);
                if (toolLines) {
                    tools.push(...toolLines.map(line => line.replace(/-\s*/, '').trim()));
                }
            }
        }

        // Infer common tools from content
        if (content.includes('lint') || content.includes('format')) {
            tools.push('linter');
        }
        if (content.includes('test')) {
            tools.push('test-runner');
        }
        if (content.includes('security') || content.includes('secret')) {
            tools.push('security-scanner');
        }

        return tools;
    }

    private extractInputVariables(content: string): string[] {
        const variables: string[] = [];
        const variableMatches = content.match(/\{\{(\w+)\}\}/g);
        
        if (variableMatches) {
            variableMatches.forEach(match => {
                const variable = match.replace(/\{\{(\w+)\}\}/, '$1');
                if (!variables.includes(variable)) {
                    variables.push(variable);
                }
            });
        }

        return variables;
    }

    private extractTriggers(fileName: string, content: string): string[] {
        const triggers: string[] = [];

        // Add triggers based on filename
        if (fileName.includes('review')) {
            triggers.push('code-review', 'pull-request');
        }
        if (fileName.includes('estimation') || fileName.includes('jenkins')) {
            triggers.push('planning', 'estimation', 'jenkins');
        }
        if (fileName.includes('linting')) {
            triggers.push('code-quality', 'formatting');
        }
        if (fileName.includes('secrets')) {
            triggers.push('security', 'secrets-detection');
        }
        
        // Add Jenkins-specific detection
        if (fileName.includes('jenkins') || fileName.endsWith('.jenkinsfile') || content.includes('pipeline {')) {
            triggers.push('jenkins', 'estimation', 'ci-cd');
        }

        // Add triggers based on content
        if (content.toLowerCase().includes('performance')) {
            triggers.push('performance');
        }
        if (content.toLowerCase().includes('test')) {
            triggers.push('testing');
        }
        if (content.toLowerCase().includes('refactor')) {
            triggers.push('refactoring');
        }

        return triggers;
    }

    private categorizePrompt(id: string, content: string): string {
        if (id.includes('review') || content.includes('review')) {
            return 'Code Review';
        } else if (id.includes('estimation') || id.includes('effort') || content.includes('estimation') || content.includes('requirements') || content.includes('effort')) {
            return 'Project Planning';
        } else if (id.includes('linting') || content.includes('lint')) {
            return 'Code Quality';
        } else if (id.includes('secrets') || content.includes('security')) {
            return 'Security';
        } else {
            return 'General';
        }
    }

    private formatName(id: string): string {
        return id
            .replace(/\./g, ' ')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .replace(/\s+/g, ' ')
            .trim();
    }

    private extractDescription(content: string): string {
        // Extract first paragraph or purpose section
        const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        return lines[0] ? lines[0].trim() : 'Contextual prompt for code assistance';
    }

    public suggestPromptForContext(context: CodeContext): Prompt[] {
        const suggestions: Prompt[] = [];
        
        // Enhanced context matching for estimation/requirements
        if (context.fileType === '.md' && (context.language === 'markdown' || context.language === 'plaintext')) {
            // Check if this might be requirements or effort estimation
            const estimationPrompts = this.getPromptsByTrigger('estimation');
            const planningPrompts = this.getPromptsByCategory('Project Planning');
            suggestions.push(...estimationPrompts, ...planningPrompts);
        }
        
        // Enhanced Jenkins detection
        if (context.fileType === '.jenkinsfile' || context.language === 'groovy') {
            const jenkinsPrompts = this.getPromptsByTrigger('jenkins');
            const estimationPrompts = this.getPromptsByTrigger('estimation');
            suggestions.push(...jenkinsPrompts, ...estimationPrompts);
        }
        
        // Get prompts based on context triggers
        if (context.isReviewContext) {
            const reviewPrompts = this.getPromptsByTrigger('code-review');
            suggestions.push(...reviewPrompts);
        }

        if (context.hasSecrets) {
            const securityPrompts = this.getPromptsByTrigger('security');
            suggestions.push(...securityPrompts);
        }

        if (context.needsLinting) {
            const qualityPrompts = this.getPromptsByTrigger('code-quality');
            suggestions.push(...qualityPrompts);
        }

        if (context.hasErrors) {
            const debugPrompts = this.getPromptsByCategory('Code Review');
            suggestions.push(...debugPrompts);
        }

        // Language-specific prompts
        const languagePrompts = this.getPromptsByLanguage(context.language);
        suggestions.push(...languagePrompts);

        // Remove duplicates
        const uniquePrompts = suggestions.filter((prompt, index, self) => 
            index === self.findIndex(p => p.id === prompt.id)
        );

        return uniquePrompts.slice(0, 5); // Return top 5 suggestions
    }

    public suggestPromptForFile(fileName: string, context: CodeContext): Prompt[] {
        const suggestions: Prompt[] = [];
        
        // Enhanced context matching for estimation/requirements with filename
        if (fileName.includes('requirements') || fileName.includes('effort_estimation')) {
            const estimationPrompts = this.getPromptsByTrigger('estimation');
            const planningPrompts = this.getPromptsByCategory('Project Planning');
            suggestions.push(...estimationPrompts, ...planningPrompts);
        }
        
        // Enhanced Jenkins detection with filename
        if (fileName.includes('jenkins') || fileName.endsWith('.jenkinsfile')) {
            const jenkinsPrompts = this.getPromptsByTrigger('jenkins');
            const estimationPrompts = this.getPromptsByTrigger('estimation');
            suggestions.push(...jenkinsPrompts, ...estimationPrompts);
        }
        
        // Fall back to regular context matching
        const contextSuggestions = this.suggestPromptForContext(context);
        suggestions.push(...contextSuggestions);

        // Remove duplicates
        const uniquePrompts = suggestions.filter((prompt, index, self) => 
            index === self.findIndex(p => p.id === prompt.id)
        );

        return uniquePrompts.slice(0, 5); // Return top 5 suggestions
    }

    public getPromptsByTrigger(trigger: string): Prompt[] {
        return Array.from(this.prompts.values()).filter(prompt =>
            prompt.triggers.includes(trigger)
        );
    }

    public getPromptsByCategory(category: string): Prompt[] {
        return Array.from(this.prompts.values()).filter(prompt =>
            prompt.category === category
        );
    }

    public getPromptsByLanguage(language: string): Prompt[] {
        return Array.from(this.prompts.values()).filter(prompt =>
            prompt.id.toLowerCase().includes(language.toLowerCase()) ||
            prompt.content.toLowerCase().includes(language.toLowerCase())
        );
    }

    public getAllPrompts(): Prompt[] {
        return Array.from(this.prompts.values());
    }

    /**
     * Get all prompts with pre-selection based on file context
     */
    public getAllPromptsWithSelection(fileName: string): { prompt: Prompt, preSelected: boolean }[] {
        const allPrompts = this.getAllPrompts();
        const fileExtension = path.extname(fileName).toLowerCase();
        const fileBaseName = path.basename(fileName).toLowerCase();
        
        // Create context to determine relevant prompts
        const mockContext: CodeContext = {
            fileType: fileExtension,
            language: this.getLanguageFromExtension(fileExtension),
            isReviewContext: fileBaseName.includes('review') || fileBaseName.includes('test'),
            hasSecrets: fileBaseName.includes('secret') || fileBaseName.includes('key') || fileBaseName.includes('token'),
            needsLinting: true,
            complexity: 'medium',
            technologies: this.getTechnologiesFromFile(fileName),
            fileSize: 1000,
            hasErrors: false
        };

        // Get contextually relevant prompts
        const contextualPrompts = this.suggestPromptForContext(mockContext);
        const contextualIds = new Set(contextualPrompts.map(p => p.id));
        
        // Map all prompts with pre-selection status
        return allPrompts.map(prompt => ({
            prompt: prompt,
            preSelected: contextualIds.has(prompt.id)
        }));
    }

    private getLanguageFromExtension(extension: string): string {
        const languageMap: { [key: string]: string } = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.py': 'python',
            '.go': 'go',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.cs': 'csharp',
            '.php': 'php',
            '.rb': 'ruby',
            '.rs': 'rust',
            '.sh': 'bash',
            '.tf': 'terraform',
            '.yml': 'yaml',
            '.yaml': 'yaml',
            '.json': 'json',
            '.xml': 'xml',
            '.html': 'html',
            '.css': 'css',
            '.md': 'markdown'
        };
        
        return languageMap[extension] || 'text';
    }

    private getTechnologiesFromFile(fileName: string): string[] {
        const technologies: string[] = [];
        const lowerFileName = fileName.toLowerCase();
        
        if (lowerFileName.includes('docker')) technologies.push('docker');
        if (lowerFileName.includes('k8s') || lowerFileName.includes('kubernetes')) technologies.push('kubernetes');
        if (lowerFileName.includes('test')) technologies.push('testing');
        if (lowerFileName.includes('api')) technologies.push('api');
        if (lowerFileName.includes('database') || lowerFileName.includes('db')) technologies.push('database');
        if (lowerFileName.includes('auth')) technologies.push('authentication');
        if (lowerFileName.includes('config')) technologies.push('configuration');
        
        return technologies;
    }

    public getPromptById(id: string): Prompt | undefined {
        return this.prompts.get(id);
    }

    public searchPrompts(query: string): Prompt[] {
        const lowerQuery = query.toLowerCase();
        return Array.from(this.prompts.values()).filter(prompt =>
            prompt.name.toLowerCase().includes(lowerQuery) ||
            prompt.description.toLowerCase().includes(lowerQuery) ||
            prompt.content.toLowerCase().includes(lowerQuery) ||
            prompt.triggers.some(trigger => trigger.toLowerCase().includes(lowerQuery))
        );
    }

    public getPromptsByMode(mode: 'ask' | 'edit' | 'agent'): Prompt[] {
        return Array.from(this.prompts.values()).filter(prompt =>
            prompt.mode === mode
        );
    }

    public refreshPrompts(): void {
        this.prompts.clear();
        this.loadPrompts();
    }

    public substituteVariables(promptContent: string, variables: { [key: string]: string }): string {
        let result = promptContent;
        
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            result = result.replace(regex, value);
        }
        
        return result;
    }

    /**
     * Get all prompts with pre-selection based on context
     */
    public getAllPromptsWithSelectionForContext(context: any): { prompt: Prompt, preSelected: boolean }[] {
        const allPrompts = this.getAllPrompts();
        
        return allPrompts.map(prompt => ({
            prompt,
            preSelected: this.isPromptRelevantForContext(prompt, context)
        })).sort((a, b) => {
            // Sort by: pre-selected first, then alphabetically
            if (a.preSelected && !b.preSelected) return -1;
            if (!a.preSelected && b.preSelected) return 1;
            return a.prompt.name.localeCompare(b.prompt.name);
        });
    }

    /**
     * Check if prompt is relevant for the given context
     */
    private isPromptRelevantForContext(prompt: Prompt, context: any): boolean {
        // Determine context level (file vs folder/workspace)
        const isFileLevel = context.fileCount === 1 || (!context.fileCount && context.language && !context.languages);
        const isMultiFileLevel = context.fileCount > 1 || (context.languages && context.languages.length > 0);

        // Get prompt's target languages and technologies
        const promptLanguages = this.getPromptLanguages(prompt);
        const promptTechnologies = this.getPromptTechnologies(prompt);

        // FILE LEVEL: Only select prompts that match the specific file
        if (isFileLevel) {
            const fileLanguage = context.language || (context.languages && context.languages[0]);
            
            // Language-specific matching (strict for single files)
            if (fileLanguage && promptLanguages.length > 0) {
                const languageMatch = promptLanguages.some(promptLang => 
                    promptLang.toLowerCase() === fileLanguage.toLowerCase()
                );
                if (!languageMatch) {
                    return false;
                }
            }

            // Technology-specific matching (strict for single files)
            if (context.technologies && context.technologies.length > 0 && promptTechnologies.length > 0) {
                const techMatch = context.technologies.some((tech: string) => 
                    promptTechnologies.some(promptTech => 
                        promptTech.toLowerCase().includes(tech.toLowerCase()) ||
                        tech.toLowerCase().includes(promptTech.toLowerCase())
                    )
                );
                if (!techMatch && !this.isGeneralPrompt(prompt)) {
                    return false;
                }
            }
        }

        // FOLDER/WORKSPACE LEVEL: Allow multiple relevant prompts
        if (isMultiFileLevel) {
            // Language-based relevance (inclusive for multi-file contexts)
            if (context.languages && context.languages.length > 0 && promptLanguages.length > 0) {
                const hasLanguageMatch = context.languages.some((lang: string) => 
                    promptLanguages.some(promptLang => 
                        promptLang.toLowerCase() === lang.toLowerCase()
                    )
                );
                if (hasLanguageMatch) {
                    return true;
                }
            }

            // Technology-based relevance (inclusive for multi-file contexts)
            if (context.technologies && context.technologies.length > 0 && promptTechnologies.length > 0) {
                const hasTechMatch = context.technologies.some((tech: string) => 
                    promptTechnologies.some(promptTech => 
                        promptTech.toLowerCase().includes(tech.toLowerCase()) ||
                        tech.toLowerCase().includes(promptTech.toLowerCase())
                    )
                );
                if (hasTechMatch) {
                    return true;
                }
            }
        }

        // COMMON RELEVANCE CHECKS (for both file and multi-file levels)

        // Direct language matching
        if (context.language && promptLanguages.some(lang => 
            lang.toLowerCase() === context.language.toLowerCase()
        )) {
            return true;
        }

        // File size based (large projects need effort estimation)
        if (context.fileCount && context.fileCount > 10 && prompt.id.includes('effort.estimation')) {
            return true;
        }

        // Security context
        if (context.hasSecrets && prompt.id.includes('secrets-detection')) {
            return true;
        }

        // Review context
        if (context.isReviewContext && prompt.id.includes('review')) {
            return true;
        }

        // Linting context
        if (context.needsLinting && prompt.id.includes('linting')) {
            return true;
        }

        // General prompts that apply to any context
        if (this.isGeneralPrompt(prompt)) {
            return true;
        }

        return false;
    }

    /**
     * Extract languages from prompt ID and content
     */
    private getPromptLanguages(prompt: Prompt): string[] {
        const languages: string[] = [];
        const text = `${prompt.id} ${prompt.name} ${prompt.content}`.toLowerCase();

        // Common language patterns
        const languagePatterns = {
            'python': ['python', 'py'],
            'golang': ['golang', 'go'],
            'javascript': ['javascript', 'js'],
            'typescript': ['typescript', 'ts'],
            'java': ['java'],
            'cpp': ['cpp', 'c++'],
            'csharp': ['csharp', 'c#'],
            'terraform': ['terraform', 'tf'],
            'bash': ['bash', 'shell'],
            'sql': ['sql'],
            'yaml': ['yaml', 'yml'],
            'json': ['json']
        };

        for (const [lang, patterns] of Object.entries(languagePatterns)) {
            if (patterns.some(pattern => text.includes(pattern))) {
                languages.push(lang);
            }
        }

        return languages;
    }

    /**
     * Extract technologies from prompt content
     */
    private getPromptTechnologies(prompt: Prompt): string[] {
        const content = `${prompt.id} ${prompt.content}`.toLowerCase();
        const technologies = [
            'jenkins', 'github-actions', 'docker', 'kubernetes', 'aws', 'azure', 'gcp',
            'terraform', 'ansible', 'otel', 'opentelemetry', 'tracing', 'metrics',
            'react', 'vue', 'angular', 'node', 'express', 'spring', 'django'
        ];
        
        return technologies.filter(tech => content.includes(tech));
    }

    /**
     * Check if prompt is general (applies to any language/technology)
     */
    private isGeneralPrompt(prompt: Prompt): boolean {
        const generalPatterns = [
            'estimation',
            'effort',
            'review',
            'linting',
            'secrets-detection',
            'security',
            'documentation',
            'testing',
            'general'
        ];

        const promptText = `${prompt.id} ${prompt.name}`.toLowerCase();
        return generalPatterns.some(pattern => promptText.includes(pattern));
    }
}