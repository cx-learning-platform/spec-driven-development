// Minimal VS Code API types for development
declare module 'vscode' {
    export interface ExtensionContext {
        extensionPath: string;
        subscriptions: any[];
        globalState: any;
    }
    
    export interface TextEditor {
        document: TextDocument;
    }
    
    export interface TextDocument {
        fileName: string;
        languageId: string;
        uri: any;
        getText(): string;
    }
    
    export interface TreeDataProvider<T> {
        onDidChangeTreeData?: any;
        getTreeItem(element: T): TreeItem;
        getChildren(element?: T): Promise<T[]>;
    }
    
    export class TreeItem {
        label: string;
        collapsibleState: TreeItemCollapsibleState;
        tooltip?: string;
        description?: string;
        iconPath?: any;
        command?: any;
        contextValue?: string;
        
        constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
            this.label = label;
            this.collapsibleState = collapsibleState || TreeItemCollapsibleState.None;
        }
    }
    
    export enum TreeItemCollapsibleState {
        None = 0,
        Collapsed = 1,
        Expanded = 2
    }
    
    export class EventEmitter<T> {
        event: any;
        fire(data?: T): void {}
    }
    
    export namespace window {
        export function showErrorMessage(message: string): Promise<string | undefined>;
        export function showWarningMessage(message: string): Promise<string | undefined>;
        export function showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
        export function registerTreeDataProvider<T>(viewId: string, provider: TreeDataProvider<T>): any;
        export function createStatusBarItem(alignment?: any, priority?: number): any;
        export function createOutputChannel(name: string): OutputChannel;
        export const activeTextEditor: TextEditor | undefined;
        export function showInputBox(options?: any): Promise<string | undefined>;
        export function showQuickPick<T>(items: T[], options?: any): Promise<T | undefined>;
        export function showTextDocument(document: any, options?: any): Promise<any>;
        export function withProgress<R>(options: any, task: any): Promise<R>;
        export function onDidChangeActiveTextEditor(listener: any): any;
    }
    
    export namespace workspace {
        export const workspaceFolders: any[] | undefined;
        export function getConfiguration(section?: string): any;
        export function openTextDocument(options: any): Promise<TextDocument>;
        export function asRelativePath(path: string): string;
        export namespace fs {
            export function stat(uri: any): Promise<any>;
            export function createDirectory(uri: any): Promise<void>;
            export function writeFile(uri: any, content: Uint8Array): Promise<void>;
        }
        export function onDidChangeConfiguration(listener: any): any;
        export function onDidChangeTextDocument(listener: any): any;
    }
    
    export namespace commands {
        export function registerCommand(command: string, callback: (...args: any[]) => any): any;
        export function executeCommand(command: string, ...args: any[]): Promise<any>;
    }
    
    export class Uri {
        static file(path: string): Uri;
        fsPath: string;
    }
    
    export enum StatusBarAlignment {
        Left = 1,
        Right = 2
    }
    
    export class ThemeIcon {
        constructor(id: string) {}
    }
    
    export namespace languages {
        export function getDiagnostics(uri: any): any[];
    }
    
    export enum DiagnosticSeverity {
        Error = 0,
        Warning = 1,
        Information = 2,
        Hint = 3
    }
    
    export interface Diagnostic {
        severity: DiagnosticSeverity;
    }
    
    export namespace env {
        export namespace clipboard {
            export function writeText(text: string): Promise<void>;
        }
        export function openExternal(uri: any): Promise<boolean>;
    }
    
    export interface ConfigurationChangeEvent {
        affectsConfiguration(section: string): boolean;
    }
    
    export interface TextDocumentChangeEvent {
        document: TextDocument;
    }
    
    export interface OutputChannel {
        appendLine(value: string): void;
        dispose(): void;
    }
    
    export class MarkdownString {
        value: string;
        isTrusted?: boolean;
        constructor(value?: string) {
            this.value = value || '';
        }
        appendMarkdown(value: string): MarkdownString {
            this.value += value;
            return this;
        }
    }
    
    export interface Event<T> {
        (listener: (e: T) => any): any;
    }
    
    export interface Selection {
        start: any;
        end: any;
    }
    
    export interface TextEditor {
        document: TextDocument;
        selection: Selection;
    }
    
    export interface TextDocument {
        fileName: string;
        languageId: string;
        uri: any;
        getText(range?: Selection): string;
    }
}