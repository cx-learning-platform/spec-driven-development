import * as vscode from 'vscode';
import * as path from 'path';
import { CodeContext } from './promptManager';

export class ContextAnalyzer {
    private readonly secretPatterns = [
        /api[_-]?key\s*[:=]\s*["']?[^\s"']+["']?/i,
        /secret[_-]?key\s*[:=]\s*["']?[^\s"']+["']?/i,
        /password\s*[:=]\s*["']?[^\s"']+["']?/i,
        /token\s*[:=]\s*["']?[^\s"']+["']?/i,
        /aws[_-]?access[_-]?key\s*[:=]\s*["']?[^\s"']+["']?/i,
        /private[_-]?key\s*[:=]\s*["']?[^\s"']+["']?/i,
        /database[_-]?url\s*[:=]\s*["']?[^\s"']+["']?/i,
        /connection[_-]?string\s*[:=]\s*["']?[^\s"']+["']?/i,
        /bearer\s+[a-zA-Z0-9\-._~+/]+=*/i,
        /gh[pousr]_[A-Za-z0-9_]+/,
        /xox[baprs]-[0-9]{12}-[0-9]{12}-[0-9]{12}-[a-z0-9]{32}/
    ];

    private readonly lintingIndicators = [
        /\/\/\s*TODO:/,
        /\/\/\s*FIXME:/,
        /\/\/\s*HACK:/,
        /console\.log\(/,
        /debugger;?/,
        /var\s+\w+/, // Use of var in JS/TS
        /\t/, // Tab characters
        /\s+$/, // Trailing whitespace
        /if\s*\([^)]*==\s*[^)]*\)/, // == instead of ===
        /import\s+\*\s+as/, // Wildcard imports
        /any\s*;?$/ // TypeScript any type
    ];

    private readonly complexityIndicators = [
        /if\s*\(/g,
        /else\s*if/g,
        /else\s*{/g,
        /switch\s*\(/g,
        /case\s+/g,
        /for\s*\(/g,
        /while\s*\(/g,
        /catch\s*\(/g,
        /try\s*{/g,
        /function\s+/g,
        /=>\s*{/g,
        /class\s+/g
    ];

    public analyzeCurrentContext(): CodeContext {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return this.getDefaultContext();
        }

        const document = activeEditor.document;
        const content = document.getText();
        const fileName = document.fileName;
        const fileExtension = path.extname(fileName);
        const language = document.languageId;

        const technologies = this.detectTechnologies(content, fileExtension, language);
        
        // Enhanced logging for debugging
        console.log('🔍 Context Analysis:', {
            fileName: path.basename(fileName),
            fileExtension,
            language,
            technologies,
            contentLength: content.length,
            hasOTEL: technologies.some(t => t.includes('otel') || t.includes('opentelemetry')),
            isGoFile: fileExtension === '.go' || language === 'go'
        });

        return {
            fileType: fileExtension,
            language: language,
            isReviewContext: this.isCodeReview(content, fileName),
            hasSecrets: this.detectSecrets(content),
            needsLinting: this.needsFormatting(content),
            complexity: this.assessComplexity(content),
            technologies: technologies,
            fileSize: content.length,
            hasErrors: this.hasErrors(document)
        };
    }

    public analyzeDocument(document: vscode.TextDocument): CodeContext {
        const content = document.getText();
        const fileName = document.fileName;
        const fileExtension = path.extname(fileName);
        const language = document.languageId;

        return {
            fileType: fileExtension,
            language: language,
            isReviewContext: this.isCodeReview(content, fileName),
            hasSecrets: this.detectSecrets(content),
            needsLinting: this.needsFormatting(content),
            complexity: this.assessComplexity(content),
            technologies: this.detectTechnologies(content, fileExtension, language),
            fileSize: content.length,
            hasErrors: this.hasErrors(document)
        };
    }

    private getDefaultContext(): CodeContext {
        return {
            fileType: '',
            language: 'plaintext',
            isReviewContext: false,
            hasSecrets: false,
            needsLinting: false,
            complexity: 'simple',
            technologies: [],
            fileSize: 0,
            hasErrors: false
        };
    }

    private isCodeReview(content: string, fileName: string): boolean {
        // Check for PR/review indicators
        const reviewIndicators = [
            'FIXME',
            'TODO',
            'REVIEW',
            'HACK',
            'XXX',
            'BUG',
            '// TODO:',
            '// FIXME:',
            '// REVIEW:',
            '# TODO:',
            '# FIXME:',
            'pull request',
            'code review'
        ];

        const hasReviewComments = reviewIndicators.some(indicator => 
            content.toLowerCase().includes(indicator.toLowerCase())
        );

        // Check file naming patterns that suggest review context
        const reviewFilePatterns = [
            /review/i,
            /pr[_-]?\d+/i,
            /patch/i,
            /diff/i
        ];

        const hasReviewFileName = reviewFilePatterns.some(pattern => 
            pattern.test(path.basename(fileName))
        );

        return hasReviewComments || hasReviewFileName;
    }

    private detectSecrets(content: string): boolean {
        return this.secretPatterns.some(pattern => pattern.test(content));
    }

    private needsFormatting(content: string): boolean {
        return this.lintingIndicators.some(pattern => pattern.test(content));
    }

    private assessComplexity(content: string): 'simple' | 'medium' | 'complex' {
        const lines = content.split('\n').length;
        let complexityScore = 0;

        // Count complexity indicators
        this.complexityIndicators.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                complexityScore += matches.length;
            }
        });

        // Factor in file size
        if (lines > 500) complexityScore += 5;
        else if (lines > 200) complexityScore += 2;

        // Determine complexity level
        if (complexityScore > 20) {
            return 'complex';
        } else if (complexityScore > 8) {
            return 'medium';
        } else {
            return 'simple';
        }
    }

    private detectTechnologies(content: string, fileExtension: string, language: string): string[] {
        const technologies: string[] = [];

        // Language-based technologies
        technologies.push(language);

        // Go technologies
        if (fileExtension === '.go' || language === 'go') {
            technologies.push('golang');
            
            const goTech = [
                { pattern: /go\.opentelemetry\.io/, tech: 'opentelemetry' },
                { pattern: /otel\./, tech: 'otel' },
                { pattern: /trace\./, tech: 'tracing' },
                { pattern: /metric\./, tech: 'metrics' },
                { pattern: /slog\./, tech: 'logging' },
                { pattern: /semconv\./, tech: 'observability' },
                { pattern: /otelsql/, tech: 'otel-database' },
                { pattern: /otelhttp/, tech: 'otel-http' },
                { pattern: /span\./, tech: 'tracing' },
                { pattern: /tracer\./, tech: 'tracing' },
                { pattern: /WithAttributes/, tech: 'otel' },
                { pattern: /RecordError/, tech: 'otel' },
                { pattern: /SetStatus/, tech: 'otel' },
                { pattern: /github\.com\/gin-gonic/, tech: 'gin' },
                { pattern: /github\.com\/gorilla\/mux/, tech: 'gorilla-mux' },
                { pattern: /github\.com\/sirupsen\/logrus/, tech: 'logrus' },
                { pattern: /gorm\.io/, tech: 'gorm' },
                { pattern: /github\.com\/stretchr\/testify/, tech: 'testify' },
                { pattern: /github\.com\/spf13\/cobra/, tech: 'cobra' },
                { pattern: /github\.com\/spf13\/viper/, tech: 'viper' },
                { pattern: /k8s\.io/, tech: 'kubernetes' },
                { pattern: /github\.com\/prometheus/, tech: 'prometheus' },
                { pattern: /database\/sql/, tech: 'sql' },
                { pattern: /net\/http/, tech: 'http' },
                { pattern: /context\./, tech: 'context' },
                { pattern: /testing\./, tech: 'testing' },
                { pattern: /json:/, tech: 'json' },
                { pattern: /yaml:/, tech: 'yaml' }
            ];

            goTech.forEach(({ pattern, tech }) => {
                if (pattern.test(content)) {
                    technologies.push(tech);
                }
            });
        }

        // Python technologies
        if (fileExtension === '.py' || language === 'python') {
            technologies.push('python');
            
            const pythonTech = [
                { pattern: /import django|from django/, tech: 'django' },
                { pattern: /import flask|from flask/, tech: 'flask' },
                { pattern: /import fastapi|from fastapi/, tech: 'fastapi' },
                { pattern: /import pandas|pd\./g, tech: 'pandas' },
                { pattern: /import numpy|np\./g, tech: 'numpy' },
                { pattern: /import tensorflow|import tf/, tech: 'tensorflow' },
                { pattern: /import torch/, tech: 'pytorch' },
                { pattern: /import requests/, tech: 'requests' },
                { pattern: /import sqlalchemy/, tech: 'sqlalchemy' },
                { pattern: /import pytest/, tech: 'pytest' }
            ];

            pythonTech.forEach(({ pattern, tech }) => {
                if (pattern.test(content)) {
                    technologies.push(tech);
                }
            });
        }

        // Terraform technologies
        if (fileExtension === '.tf' || language === 'hcl' || language === 'terraform') {
            technologies.push('terraform');
            
            if (content.includes('provider "aws"')) technologies.push('aws');
            if (content.includes('provider "azurerm"')) technologies.push('azure');
            if (content.includes('provider "google"')) technologies.push('gcp');
            if (content.includes('provider "kubernetes"')) technologies.push('kubernetes');
            if (content.includes('provider "helm"')) technologies.push('helm');
        }

        // JavaScript/TypeScript technologies
        if (['.js', '.jsx', '.ts', '.tsx'].includes(fileExtension)) {
            const jsTech = [
                { pattern: /import.*react|from ['"]react['"]/, tech: 'react' },
                { pattern: /import.*vue|from ['"]vue['"]/, tech: 'vue' },
                { pattern: /import.*angular|from ['"]@angular/, tech: 'angular' },
                { pattern: /import.*express|from ['"]express['"]/, tech: 'express' },
                { pattern: /import.*lodash|from ['"]lodash['"]/, tech: 'lodash' },
                { pattern: /import.*moment|from ['"]moment['"]/, tech: 'moment' },
                { pattern: /import.*axios|from ['"]axios['"]/, tech: 'axios' },
                { pattern: /import.*next|from ['"]next['"]/, tech: 'nextjs' }
            ];

            jsTech.forEach(({ pattern, tech }) => {
                if (pattern.test(content)) {
                    technologies.push(tech);
                }
            });
        }

        // General technology detection
        const generalTech = [
            { pattern: /docker/i, tech: 'docker' },
            { pattern: /kubernetes|k8s/i, tech: 'kubernetes' },
            { pattern: /jenkins/i, tech: 'jenkins' },
            { pattern: /github\.com\/actions/i, tech: 'github-actions' },
            { pattern: /prometheus/i, tech: 'prometheus' },
            { pattern: /grafana/i, tech: 'grafana' },
            { pattern: /elasticsearch/i, tech: 'elasticsearch' },
            { pattern: /redis/i, tech: 'redis' },
            { pattern: /postgresql|postgres/i, tech: 'postgresql' },
            { pattern: /mysql/i, tech: 'mysql' },
            { pattern: /mongodb/i, tech: 'mongodb' }
        ];

        generalTech.forEach(({ pattern, tech }) => {
            if (pattern.test(content)) {
                technologies.push(tech);
            }
        });

        // Remove duplicates and return
        return [...new Set(technologies)];
    }

    private hasErrors(document: vscode.TextDocument): boolean {
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        return diagnostics.some((diagnostic: vscode.Diagnostic) => 
            diagnostic.severity === vscode.DiagnosticSeverity.Error
        );
    }

    public getFileLanguage(fileName: string): string {
        const extension = path.extname(fileName).toLowerCase();
        
        const languageMap: { [key: string]: string } = {
            '.go': 'go',
            '.py': 'python',
            '.tf': 'terraform',
            '.tfvars': 'terraform',
            '.sh': 'bash',
            '.bash': 'bash',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.cs': 'csharp',
            '.php': 'php',
            '.rb': 'ruby',
            '.rs': 'rust',
            '.kt': 'kotlin',
            '.swift': 'swift',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.json': 'json',
            '.xml': 'xml',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.sql': 'sql'
        };

        return languageMap[extension] || 'plaintext';
    }

    public analyzeSelection(selection: string, language: string): CodeContext {
        return {
            fileType: this.getExtensionForLanguage(language),
            language: language,
            isReviewContext: this.isCodeReview(selection, ''),
            hasSecrets: this.detectSecrets(selection),
            needsLinting: this.needsFormatting(selection),
            complexity: this.assessComplexity(selection),
            technologies: this.detectTechnologies(selection, this.getExtensionForLanguage(language), language),
            fileSize: selection.length,
            hasErrors: false // Cannot check errors for selection
        };
    }

    private getExtensionForLanguage(language: string): string {
        const extensionMap: { [key: string]: string } = {
            'go': '.go',
            'python': '.py',
            'terraform': '.tf',
            'bash': '.sh',
            'javascript': '.js',
            'typescript': '.ts',
            'java': '.java',
            'c': '.c',
            'cpp': '.cpp'
        };

        return extensionMap[language] || '';
    }

    /**
     * Analyze an entire folder and return aggregated context
     */
    public async analyzeFolderContext(folderUri: vscode.Uri): Promise<CodeContext & { fileCount: number; languages: string[] }> {
        const files = await this.getAllFilesInFolder(folderUri);
        const contexts: CodeContext[] = [];
        const languages = new Set<string>();
        const technologies = new Set<string>();
        
        for (const fileUri of files) {
            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                const context = this.analyzeDocument(document);
                contexts.push(context);
                languages.add(context.language);
                context.technologies.forEach(tech => technologies.add(tech));
            } catch (error) {
                console.log(`Skipping file ${fileUri.fsPath}: ${error}`);
            }
        }

        return this.aggregateContexts(contexts, {
            fileCount: files.length,
            languages: Array.from(languages),
            technologies: Array.from(technologies)
        });
    }

    /**
     * Analyze entire workspace and return aggregated context
     */
    public async analyzeWorkspaceContext(): Promise<CodeContext & { fileCount: number; folderCount: number; languages: string[] }> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folders found');
        }

        const allContexts: CodeContext[] = [];
        const languages = new Set<string>();
        const technologies = new Set<string>();
        let totalFiles = 0;
        let folderCount = 0;

        for (const workspaceFolder of workspaceFolders) {
            const files = await this.getAllFilesInFolder(workspaceFolder.uri, true); // recursive
            folderCount++;
            totalFiles += files.length;

            for (const fileUri of files) {
                try {
                    const document = await vscode.workspace.openTextDocument(fileUri);
                    const context = this.analyzeDocument(document);
                    allContexts.push(context);
                    languages.add(context.language);
                    context.technologies.forEach(tech => technologies.add(tech));
                } catch (error) {
                    console.log(`Skipping file ${fileUri.fsPath}: ${error}`);
                }
            }
        }

        return this.aggregateContexts(allContexts, {
            fileCount: totalFiles,
            folderCount: folderCount,
            languages: Array.from(languages),
            technologies: Array.from(technologies)
        });
    }

    /**
     * Get all files in a folder (with option for recursive)
     */
    private async getAllFilesInFolder(folderUri: vscode.Uri, recursive: boolean = false): Promise<vscode.Uri[]> {
        const files: vscode.Uri[] = [];
        const entries = await vscode.workspace.fs.readDirectory(folderUri);
        
        for (const [name, type] of entries) {
            const fileUri = vscode.Uri.joinPath(folderUri, name);
            
            if (type === vscode.FileType.File) {
                // Only include supported file types
                if (this.isSupportedFileType(name)) {
                    files.push(fileUri);
                }
            } else if (type === vscode.FileType.Directory && recursive) {
                // Skip common ignored directories
                if (!this.isIgnoredDirectory(name)) {
                    const subFiles = await this.getAllFilesInFolder(fileUri, true);
                    files.push(...subFiles);
                }
            }
        }
        
        return files;
    }

    /**
     * Check if file type is supported for analysis
     */
    private isSupportedFileType(fileName: string): boolean {
        const supportedExtensions = ['.go', '.py', '.js', '.ts', '.tf', '.sh', '.bash', '.yml', '.yaml', '.json', '.jsx', '.tsx', '.java', '.c', '.cpp', '.cs', '.php', '.rb', '.rs', '.kt', '.swift'];
        return supportedExtensions.some(ext => fileName.endsWith(ext));
    }

    /**
     * Check if directory should be ignored
     */
    private isIgnoredDirectory(dirName: string): boolean {
        const ignoredDirs = ['node_modules', '.git', '.github', 'out', 'dist', 'build', '__pycache__', '.terraform', '.vscode', 'vendor', 'target', 'bin', 'obj'];
        return ignoredDirs.includes(dirName);
    }

    /**
     * Aggregate multiple contexts into a single summary context
     */
    private aggregateContexts(contexts: CodeContext[], metadata: any): any {
        if (contexts.length === 0) {
            return { ...this.getDefaultContext(), ...metadata };
        }

        const aggregated = {
            fileType: this.getMostCommonFileType(contexts),
            language: this.getMostCommonLanguage(contexts), 
            isReviewContext: contexts.some(c => c.isReviewContext),
            hasSecrets: contexts.some(c => c.hasSecrets),
            needsLinting: contexts.some(c => c.needsLinting),
            complexity: this.getOverallComplexity(contexts),
            technologies: this.getAllTechnologies(contexts),
            fileSize: contexts.reduce((sum, c) => sum + c.fileSize, 0),
            hasErrors: contexts.some(c => c.hasErrors),
            ...metadata
        };

        return aggregated;
    }

    private getMostCommonFileType(contexts: CodeContext[]): string {
        const typeCounts = contexts.reduce((acc, c) => {
            acc[c.fileType] = (acc[c.fileType] || 0) + 1;
            return acc;
        }, {} as { [key: string]: number });
        
        return Object.keys(typeCounts).reduce((a, b) => typeCounts[a] > typeCounts[b] ? a : b, '');
    }

    private getMostCommonLanguage(contexts: CodeContext[]): string {
        const langCounts = contexts.reduce((acc, c) => {
            acc[c.language] = (acc[c.language] || 0) + 1;
            return acc;
        }, {} as { [key: string]: number });
        
        return Object.keys(langCounts).reduce((a, b) => langCounts[a] > langCounts[b] ? a : b, '');
    }

    private getOverallComplexity(contexts: CodeContext[]): 'simple' | 'medium' | 'complex' {
        const complexityCounts = contexts.reduce((acc, c) => {
            acc[c.complexity] = (acc[c.complexity] || 0) + 1;
            return acc;
        }, { simple: 0, medium: 0, complex: 0 });

        if (complexityCounts.complex > contexts.length * 0.3) return 'complex';
        if (complexityCounts.medium > contexts.length * 0.5) return 'medium';
        return 'simple';
    }

    private getAllTechnologies(contexts: CodeContext[]): string[] {
        const allTechs = new Set<string>();
        contexts.forEach(c => c.technologies.forEach(tech => allTechs.add(tech)));
        return Array.from(allTechs);
    }
}