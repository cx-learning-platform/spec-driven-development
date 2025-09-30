import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface Instruction {
    id: string;
    name: string;
    description: string;
    appliesTo: string[];
    content: string;
    mode: 'reference' | 'standards' | 'design' | 'guide';
    filePath: string;
}

export class InstructionManager {
    private instructions: Map<string, Instruction> = new Map();
    private extensionPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
        this.loadInstructions();
    }

    private loadInstructions() {
        const instructionDir = path.join(this.extensionPath, 'resources', 'instructions');
        
        if (!fs.existsSync(instructionDir)) {
            vscode.window.showErrorMessage('Instructions directory not found');
            return;
        }

        const files = fs.readdirSync(instructionDir).filter((file: string) => file.endsWith('.md'));
        
        files.forEach((file: string) => {
            try {
                const filePath = path.join(instructionDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const instruction = this.parseInstruction(file, content, filePath);
                
                if (instruction) {
                    this.instructions.set(instruction.id, instruction);
                }
            } catch (error) {
                console.error(`Failed to load instruction file ${file}:`, error);
            }
        });

        console.log(`Loaded ${this.instructions.size} instruction files`);
    }

    private parseInstruction(fileName: string, content: string, filePath: string): Instruction | null {
        try {
            // Parse the YAML frontmatter and content - fix the format
            const yamlMatch = content.match(/^````instructions\s*\n---\s*\n(.*?)\n---\n(.*)/s) || 
                              content.match(/^---\s*\n(.*?)\n---\n(.*)/s);
            if (!yamlMatch) {
                // Fallback: treat entire content as instruction content
                console.warn(`No frontmatter found in ${fileName}, using entire content`);
                return this.createDefaultInstruction(fileName, content, filePath);
            }

            const frontMatter = yamlMatch[1];
            const markdownContent = yamlMatch[2];

            // Extract applyTo patterns
            const applyToMatch = frontMatter.match(/applyTo:\s*\n((?:\s*-\s*".*"\s*\n)*)/);
            const appliesTo: string[] = [];
            
            if (applyToMatch) {
                const patterns = applyToMatch[1].match(/-\s*"([^"]+)"/g);
                if (patterns) {
                    appliesTo.push(...patterns.map(p => p.replace(/-\s*"([^"]+)"/, '$1')));
                }
            }

            // Determine instruction type based on filename
            let mode: 'reference' | 'standards' | 'design' | 'guide' = 'reference';
            if (fileName.includes('best-practices')) {
                mode = 'standards';
            } else if (fileName.includes('design') || fileName.includes('architecture')) {
                mode = 'design';
            } else if (fileName.includes('guide') || fileName.includes('development')) {
                mode = 'guide';
            }

            const id = fileName.replace('.instructions.md', '');
            const name = this.formatName(id);
            
            return {
                id,
                name,
                description: this.extractDescription(markdownContent),
                appliesTo,
                content: markdownContent.trim(),
                mode,
                filePath
            };
        } catch (error) {
            console.error(`Error parsing instruction ${fileName}:`, error);
            return null;
        }
    }

    private formatName(id: string): string {
        return id
            .replace(/\./g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .replace(/\s+/g, ' ')
            .trim();
    }

    private extractDescription(content: string): string {
        // Extract first paragraph or purpose section
        const purposeMatch = content.match(/## Purpose\s*\n([^\n]*(?:\n[^\n#]*)*)/);
        if (purposeMatch) {
            return purposeMatch[1].trim().split('\n')[0];
        }
        
        // Fallback to first meaningful line
        const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        return lines[0] ? lines[0].trim() : 'Code quality instructions';
    }

    public getInstructionsForFile(filePath: string): Instruction[] {
        const fileName = path.basename(filePath);
        const fileExtension = path.extname(filePath);
        const relativePath = vscode.workspace.asRelativePath(filePath);
        
        // Get content-based matching as well
        const activeEditor = vscode.window.activeTextEditor;
        let fileContent = '';
        if (activeEditor && activeEditor.document.fileName === filePath) {
            fileContent = activeEditor.document.getText();
        }
        
        // For Go files, get ALL Go-related instructions
        if (fileExtension === '.go') {
            const allGoInstructions = Array.from(this.instructions.values()).filter(instruction => 
                instruction.id.includes('go') || 
                this.matchesFilePattern(instruction, fileName, fileExtension, relativePath)
            );
            
            console.log(`🚀 Found ${allGoInstructions.length} Go instructions for ${fileName}:`, 
                allGoInstructions.map(i => i.name));
            
            return allGoInstructions;
        }
        
        // For non-Go files, use the existing logic
        const patternMatching = Array.from(this.instructions.values()).filter(instruction => 
            this.matchesFilePattern(instruction, fileName, fileExtension, relativePath)
        );
        
        const contentMatching = Array.from(this.instructions.values()).filter(instruction => 
            this.matchesContentPattern(instruction, fileContent, fileExtension)
        );
        
        const allMatching = [...new Set([...patternMatching, ...contentMatching])];
        
        console.log(`🔍 Found ${allMatching.length} matching instructions for ${fileName}:`, 
            allMatching.map(i => i.name));
        
        return allMatching;
    }

    public getInstructionsByLanguage(language: string): Instruction[] {
        return Array.from(this.instructions.values()).filter(instruction => {
            return instruction.id.toLowerCase().includes(language.toLowerCase()) ||
                   instruction.appliesTo.some(pattern => 
                       this.languageMatchesPattern(language, pattern)
                   );
        });
    }

    private languageMatchesPattern(language: string, pattern: string): boolean {
        const langExtensions: { [key: string]: string[] } = {
            'go': ['.go'],
            'python': ['.py', '.pyx', '.pyi'],
            'terraform': ['.tf', '.tfvars'],
            'bash': ['.sh', '.bash'],
            'javascript': ['.js', '.jsx'],
            'typescript': ['.ts', '.tsx']
        };

        const extensions = langExtensions[language.toLowerCase()];
        if (!extensions) return false;

        return extensions.some(ext => pattern.includes(ext));
    }

    private matchesFilePattern(instruction: Instruction, fileName: string, fileExtension: string, relativePath: string): boolean {
        // Software requirements matching - enhanced for easier testing
        if (instruction.id.includes('software') || instruction.id.includes('requirements')) {
            const requirementsFiles = [
                /requirements?/i,
                /README/i,
                /TODO/i,
                /CHANGELOG/i,
                /project/i,
                /spec/i,
                /specification/i,
                /plan/i,
                /scope/i,
                /feature/i,
                /epic/i,
                /story/i,
                /backlog/i,
                /acceptance/i
            ];
            
            return requirementsFiles.some(pattern => 
                pattern.test(fileName) || 
                pattern.test(relativePath)
            ) && ['.md', '.txt', '.rst', '.doc', '.docx'].includes(fileExtension.toLowerCase());
        }
        
        return instruction.appliesTo.some(pattern => {
            // Convert glob pattern to regex
            const regexPattern = pattern
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*')
                .replace(/\./g, '\\.');
            
            const regex = new RegExp(`^${regexPattern}$`);
            
            return regex.test(relativePath) || 
                   regex.test(fileName) ||
                   (pattern.includes(fileExtension) && fileExtension !== '');
        });
    }

    private matchesContentPattern(instruction: Instruction, content: string, fileExtension: string): boolean {
        if (!content) return false;
        
        // Software Requirements matching - broader patterns for testing
        if (instruction.id.includes('software') || instruction.id.includes('requirements')) {
            const requirementsPatterns = [
                /requirements?/i,
                /project.*plan/i,
                /user.*stor(y|ies)/i,
                /scope/i,
                /specification/i,
                /acceptance.*criteria/i,
                /functional.*requirements/i,
                /non.*functional/i,
                /business.*requirements/i,
                /technical.*requirements/i,
                /README/i,
                /TODO/i,
                /CHANGELOG/i,
                /project/i,
                /feature/i,
                /epic/i
            ];
            
            // Apply to documentation files
            const docExtensions = ['.md', '.txt', '.rst', '.doc', '.docx', '.pdf'];
            if (docExtensions.includes(fileExtension.toLowerCase())) {
                return requirementsPatterns.some(pattern => pattern.test(content)) || 
                       requirementsPatterns.some(pattern => pattern.test(instruction.content));
            }
        }
        
        // OTEL-specific matching for Go files
        if (instruction.id.includes('otel') && fileExtension === '.go') {
            const otelPatterns = [
                /go\.opentelemetry\.io/,
                /otel\./,
                /trace\./,
                /metric\./,
                /semconv\./,
                /tracer\./,
                /span\./,
                /WithAttributes/,
                /RecordError/,
                /SetStatus/,
                /otelsql/,
                /otelhttp/
            ];
            return otelPatterns.some(pattern => pattern.test(content));
        }
        
        // Best practices matching for Go - Always apply for Go files
        if (instruction.id.includes('best-practices') && fileExtension === '.go') {
            return true; // Always apply best practices for Go files
        }
        
        // Development standards matching for Go - Always apply for Go files
        if (instruction.id.includes('development') && fileExtension === '.go') {
            return true; // Always apply development standards for Go files
        }
        
        // Power user guide matching for Go - Always apply for Go files
        if (instruction.id.includes('power-user') && fileExtension === '.go') {
            return true; // Always apply power user guide for Go files
        }
        
        // Architecture/design matching for Go
        if ((instruction.id.includes('design') || instruction.id.includes('architecture')) && fileExtension === '.go') {
            const designPatterns = [
                /interface/,
                /struct/,
                /type.*struct/,
                /func.*\(/,
                /package/
            ];
            return designPatterns.some(pattern => pattern.test(content));
        }
        
        return false;
    }

    public getAllInstructions(): Instruction[] {
        return Array.from(this.instructions.values());
    }

    public getInstructionById(id: string): Instruction | undefined {
        return this.instructions.get(id);
    }

    public getInstructionsByMode(mode: 'reference' | 'standards' | 'design' | 'guide'): Instruction[] {
        return Array.from(this.instructions.values()).filter(instruction => 
            instruction.mode === mode
        );
    }

    public searchInstructions(query: string): Instruction[] {
        const lowerQuery = query.toLowerCase();
        return Array.from(this.instructions.values()).filter(instruction =>
            instruction.name.toLowerCase().includes(lowerQuery) ||
            instruction.description.toLowerCase().includes(lowerQuery) ||
            instruction.content.toLowerCase().includes(lowerQuery)
        );
    }

    private createDefaultInstruction(fileName: string, content: string, filePath: string): Instruction {
        const id = fileName.replace('.instructions.md', '').replace('.md', '');
        const name = this.formatName(id);
        
        // Determine file patterns based on filename
        const appliesTo: string[] = [];
        if (id.includes('go')) appliesTo.push('**/*.go');
        if (id.includes('python')) appliesTo.push('**/*.py');
        if (id.includes('terraform')) appliesTo.push('**/*.tf');
        if (id.includes('bash')) appliesTo.push('**/*.sh', '**/*.bash');
        if (id.includes('javascript')) appliesTo.push('**/*.js', '**/*.jsx');
        if (id.includes('typescript')) appliesTo.push('**/*.ts', '**/*.tsx');
        
        // Default to all files if no specific pattern
        if (appliesTo.length === 0) appliesTo.push('**/*');

        return {
            id,
            name,
            description: this.extractDescription(content),
            appliesTo,
            content: content.trim(),
            mode: 'reference',
            filePath
        };
    }

    public getEssentialInstructions(): Instruction[] {
        // Return top 3 most essential instructions for initial setup
        const essential = Array.from(this.instructions.values())
            .filter(instruction => 
                instruction.mode === 'standards' || 
                instruction.name.toLowerCase().includes('best practices') ||
                instruction.name.toLowerCase().includes('security')
            )
            .slice(0, 3);
        
        return essential.length > 0 ? essential : Array.from(this.instructions.values()).slice(0, 2);
    }

    public getAllInstructionsWithSelection(filePath?: string): { instruction: Instruction, preSelected: boolean }[] {
        const allInstructions = Array.from(this.instructions.values());
        
        if (!filePath) {
            // If no file context, return all instructions unselected
            return allInstructions.map(instruction => ({
                instruction,
                preSelected: false
            }));
        }

        // Get instructions that are relevant to the current file
        const relevantInstructions = this.getInstructionsForFile(filePath);
        const relevantIds = new Set(relevantInstructions.map(inst => inst.id));

        // Map all instructions with pre-selection status
        return allInstructions.map(instruction => ({
            instruction,
            preSelected: relevantIds.has(instruction.id)
        })).sort((a, b) => {
            // Sort by: pre-selected first, then alphabetically
            if (a.preSelected && !b.preSelected) return -1;
            if (!a.preSelected && b.preSelected) return 1;
            return a.instruction.name.localeCompare(b.instruction.name);
        });
    }

    public refreshInstructions(): void {
        this.instructions.clear();
        this.loadInstructions();
    }

    /**
     * Get all instructions with pre-selection based on context (not just filename)
     */
    public getAllInstructionsWithSelectionForContext(context: any): { instruction: Instruction, preSelected: boolean }[] {
        const allInstructions = this.getAllInstructions();
        
        return allInstructions.map(instruction => ({
            instruction,
            preSelected: this.isInstructionRelevantForContext(instruction, context)
        })).sort((a, b) => {
            // Sort by: pre-selected first, then alphabetically
            if (a.preSelected && !b.preSelected) return -1;
            if (!a.preSelected && b.preSelected) return 1;
            return a.instruction.name.localeCompare(b.instruction.name);
        });
    }

    /**
     * Check if instruction is relevant for the given context
     */
    private isInstructionRelevantForContext(instruction: Instruction, context: any): boolean {
        // Determine context level (file vs folder/workspace)
        const isFileLevel = context.fileCount === 1 || (!context.fileCount && context.language && !context.languages);
        const isMultiFileLevel = context.fileCount > 1 || (context.languages && context.languages.length > 0);

        // Get instruction's target languages and technologies
        const instructionLanguages = this.getInstructionLanguages(instruction);
        const instructionTechnologies = this.getInstructionTechnologies(instruction);

        // FILE LEVEL: Only select instructions that match the specific file
        if (isFileLevel) {
            const fileLanguage = context.language || (context.languages && context.languages[0]);
            
            // Language-specific matching (strict for single files)
            if (fileLanguage && instructionLanguages.length > 0) {
                const languageMatch = instructionLanguages.some(instrLang => 
                    instrLang.toLowerCase() === fileLanguage.toLowerCase()
                );
                if (!languageMatch) {
                    // Skip this instruction if it's for a different language
                    return false;
                }
            }

            // Technology-specific matching (strict for single files)
            if (context.technologies && context.technologies.length > 0 && instructionTechnologies.length > 0) {
                const techMatch = context.technologies.some((tech: string) => 
                    instructionTechnologies.some(instrTech => 
                        instrTech.toLowerCase().includes(tech.toLowerCase()) ||
                        tech.toLowerCase().includes(instrTech.toLowerCase())
                    )
                );
                if (!techMatch && !this.isGeneralInstruction(instruction)) {
                    // Skip technology-specific instructions that don't match the file
                    return false;
                }
            }
        }

        // FOLDER/WORKSPACE LEVEL: Allow multiple relevant instructions
        if (isMultiFileLevel) {
            // Language-based relevance (inclusive for multi-file contexts)
            if (context.languages && context.languages.length > 0 && instructionLanguages.length > 0) {
                const hasLanguageMatch = context.languages.some((lang: string) => 
                    instructionLanguages.some(instrLang => 
                        instrLang.toLowerCase() === lang.toLowerCase()
                    )
                );
                if (hasLanguageMatch) {
                    return true;
                }
            }

            // Technology-based relevance (inclusive for multi-file contexts)
            if (context.technologies && context.technologies.length > 0 && instructionTechnologies.length > 0) {
                const hasTechMatch = context.technologies.some((tech: string) => 
                    instructionTechnologies.some(instrTech => 
                        instrTech.toLowerCase().includes(tech.toLowerCase()) ||
                        tech.toLowerCase().includes(instrTech.toLowerCase())
                    )
                );
                if (hasTechMatch) {
                    return true;
                }
            }
        }

        // COMMON RELEVANCE CHECKS (for both file and multi-file levels)
        
        // Direct language matching
        if (context.language && instructionLanguages.some(lang => 
            lang.toLowerCase() === context.language.toLowerCase()
        )) {
            return true;
        }

        // Context-specific patterns
        if (context.hasSecrets && instruction.name.toLowerCase().includes('security')) {
            return true;
        }

        if (context.needsLinting && instruction.name.toLowerCase().includes('best-practices')) {
            return true;
        }

        if (context.isReviewContext && instruction.name.toLowerCase().includes('review')) {
            return true;
        }

        // Complexity-based
        if (context.complexity === 'complex' && instruction.mode === 'design') {
            return true;
        }

        // General instructions that apply to any context
        if (this.isGeneralInstruction(instruction)) {
            return true;
        }

        return false;
    }

    /**
     * Extract languages from instruction ID and name
     */
    private getInstructionLanguages(instruction: Instruction): string[] {
        const languages: string[] = [];
        const text = `${instruction.id} ${instruction.name}`.toLowerCase();

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
     * Check if instruction is general (applies to any language/technology)
     */
    private isGeneralInstruction(instruction: Instruction): boolean {
        const generalPatterns = [
            'best-practices',
            'security',
            'review',
            'standards',
            'estimation',
            'requirements',
            'documentation',
            'testing',
            'general'
        ];

        const instructionText = `${instruction.id} ${instruction.name}`.toLowerCase();
        return generalPatterns.some(pattern => instructionText.includes(pattern));
    }

    /**
     * Extract technologies mentioned in instruction content
     */
    private getInstructionTechnologies(instruction: Instruction): string[] {
        const content = instruction.content.toLowerCase();
        const technologies = ['go', 'python', 'terraform', 'javascript', 'typescript', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'otel', 'opentelemetry', 'observability', 'tracing', 'metrics', 'logging'];
        
        return technologies.filter(tech => content.includes(tech));
    }
}