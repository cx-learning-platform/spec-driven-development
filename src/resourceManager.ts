import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ResourceFile {
    id: string;
    name: string;
    type: 'vscode' | 'howto';
    relativePath: string;
    absolutePath: string;
    content?: string;
}

/**
 * Manages .vscode/ and how-to-guides/ resource files for Copilot integration
 */
export class ResourceManager {
    private static readonly EXTENSION_RESOURCES_PATH = path.join(__dirname, '..', 'resources');
    private static readonly VSCODE_DIR = '.vscode';
    private static readonly HOWTO_DIR = 'how-to-guides';
    
    private resourceFiles: ResourceFile[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Vibe Resource Manager');
    }

    /**
     * Load all resource files from extension resources
     */
    public async loadResourceFiles(): Promise<void> {
        try {
            this.resourceFiles = [];
            
            // Load .vscode files
            await this.loadResourceFilesFromDirectory(
                path.join(ResourceManager.EXTENSION_RESOURCES_PATH, ResourceManager.VSCODE_DIR),
                'vscode',
                '.spec-driven-development/.vscode'
            );

            // Load how-to-guides files
            await this.loadResourceFilesFromDirectory(
                path.join(ResourceManager.EXTENSION_RESOURCES_PATH, ResourceManager.HOWTO_DIR),
                'howto',
                '.spec-driven-development/how-to-guides'
            );

            this.outputChannel.appendLine(`✅ Loaded ${this.resourceFiles.length} resource files`);
            
        } catch (error) {
            this.outputChannel.appendLine(`❌ Error loading resource files: ${error}`);
            console.error('Error loading resource files:', error);
        }
    }

    /**
     * Load resource files from a specific directory
     */
    private async loadResourceFilesFromDirectory(
        dirPath: string, 
        type: 'vscode' | 'howto', 
        relativeDirName: string
    ): Promise<void> {
        if (!fs.existsSync(dirPath)) {
            this.outputChannel.appendLine(`⚠️ Directory not found: ${dirPath}`);
            return;
        }

        const files = await this.getAllFilesRecursive(dirPath);
        
        for (const filePath of files) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const relativePath = path.relative(dirPath, filePath);
                const fileName = path.basename(filePath, path.extname(filePath));
                
                const resourceFile: ResourceFile = {
                    id: `${type}-${fileName}`,
                    name: path.basename(filePath),
                    type: type,
                    relativePath: path.join(relativeDirName, relativePath).replace(/\\/g, '/'),
                    absolutePath: filePath,
                    content: content
                };

                this.resourceFiles.push(resourceFile);
                
            } catch (error) {
                this.outputChannel.appendLine(`❌ Error reading file ${filePath}: ${error}`);
            }
        }
    }

    /**
     * Get all resource files
     */
    public getAllResourceFiles(): ResourceFile[] {
        return [...this.resourceFiles];
    }

    /**
     * Get resource files by type
     */
    public getResourceFilesByType(type: 'vscode' | 'howto'): ResourceFile[] {
        return this.resourceFiles.filter(file => file.type === type);
    }

    /**
     * Get a specific resource file by ID
     */
    public getResourceFile(id: string): ResourceFile | undefined {
        return this.resourceFiles.find(file => file.id === id);
    }

    /**
     * Get resource files relevant to a file context (similar to prompt suggestions)
     */
    public suggestResourceFilesForContext(fileExtension: string, fileName: string): ResourceFile[] {
        const suggestions: ResourceFile[] = [];
        
        // VS Code configuration files
        if (fileExtension === '.json' || fileName.includes('package') || fileName.includes('config')) {
            suggestions.push(...this.getResourceFilesByType('vscode'));
        }

        // How-to guides based on file type
        if (fileExtension === '.go') {
            suggestions.push(...this.resourceFiles.filter(f => 
                f.type === 'howto' && f.name.toLowerCase().includes('go')
            ));
        }

        if (fileExtension === '.py') {
            suggestions.push(...this.resourceFiles.filter(f => 
                f.type === 'howto' && f.name.toLowerCase().includes('python')
            ));
        }

        if (fileExtension === '.ts' || fileExtension === '.js') {
            suggestions.push(...this.resourceFiles.filter(f => 
                f.type === 'howto' && (
                    f.name.toLowerCase().includes('javascript') ||
                    f.name.toLowerCase().includes('typescript') ||
                    f.name.toLowerCase().includes('node')
                )
            ));
        }

        // Always suggest workflow guides
        suggestions.push(...this.resourceFiles.filter(f => 
            f.type === 'howto' && (
                f.name.toLowerCase().includes('workflow') ||
                f.name.toLowerCase().includes('vibe')
            )
        ));

        // Remove duplicates
        return suggestions.filter((file, index, self) => 
            self.findIndex(f => f.id === file.id) === index
        );
    }

    /**
     * Create @workspace references for resource files
     */
    public createWorkspaceReferences(resourceFiles: ResourceFile[]): string[] {
        return resourceFiles.map(file => `@workspace ${file.relativePath}`);
    }

    /**
     * Get all files recursively from a directory
     */
    private async getAllFilesRecursive(dirPath: string): Promise<string[]> {
        const files: string[] = [];
        
        if (!fs.existsSync(dirPath)) {
            return files;
        }
        
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                const subFiles = await this.getAllFilesRecursive(fullPath);
                files.push(...subFiles);
            } else if (entry.isFile()) {
                // Skip binary files, focus on text files
                const ext = path.extname(entry.name).toLowerCase();
                const textExtensions = ['.md', '.json', '.yml', '.yaml', '.txt', '.cfg', '.conf', '.ini', '.properties'];
                
                if (textExtensions.includes(ext) || !ext) {
                    files.push(fullPath);
                }
            }
        }
        
        return files;
    }

    /**
     * Format resource files for display in quick pick
     */
    public formatForQuickPick(resourceFiles: ResourceFile[]): vscode.QuickPickItem[] {
        return resourceFiles.map(file => ({
            label: `📄 ${file.name}`,
            description: `${file.type === 'vscode' ? '⚙️ VS Code' : '📚 How-to Guide'} • ${file.relativePath}`,
            detail: `@workspace ${file.relativePath}`
        }));
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.outputChannel.dispose();
    }
}
