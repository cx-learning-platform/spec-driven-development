import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface TaskMasterTask {
    id: number;
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    type?: "story" | "bug" | "defect";
    estimation?: string;
    acceptanceCriteria?: string;
    initiative?: string;
}

export class TaskMasterService {
    static async loadTaskFromWorkspace(): Promise<TaskMasterTask[]> {
        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder is open');
        }

        // Check for both possible file names
        const possiblePaths = [
            path.join(workspaceFolder.uri.fsPath, '.taskmaster', 'tasks', 'task.json'),
            path.join(workspaceFolder.uri.fsPath, '.taskmaster', 'tasks', 'tasks.json')
        ];

        let taskFilePath: string | null = null;
        
        // Find which file exists
        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                taskFilePath = filePath;
                break;
            }
        }

        if (!taskFilePath) {
            throw new Error('TaskMaster file does not exist. Looking for either .taskmaster/tasks/task.json or .taskmaster/tasks/tasks.json');
        }

        try {
            // Read and parse file
            const fileContent = fs.readFileSync(taskFilePath, 'utf8');
            const parsedData = JSON.parse(fileContent);
            
            let allTasks: TaskMasterTask[] = [];
            
            // Handle direct array format (legacy)
            if (Array.isArray(parsedData)) {
                allTasks = parsedData;
            } else {
                // Handle nested context format
                for (const [contextName, contextData] of Object.entries(parsedData)) {
                    if (contextData && typeof contextData === 'object' && 'tasks' in contextData) {
                        const tasks = (contextData as any).tasks;
                        
                        if (Array.isArray(tasks) && tasks.length > 0) {
                            allTasks = tasks.filter(task => task && task.id && task.title);
                            break; // Use first context with valid tasks
                        }
                        
                        if (tasks && typeof tasks === 'object') {
                            const taskArray = Object.values(tasks);
                            if (taskArray.length > 0 && taskArray[0] && (taskArray[0] as any).id) {
                                allTasks = taskArray.filter(task => task && (task as any).id && (task as any).title) as TaskMasterTask[];
                                break; // Use first context with valid tasks
                            }
                        }
                    }
                }
                
                if (allTasks.length === 0) {
                    throw new Error('No valid tasks found in any context');
                }
            }
            
            // Validate each task and log missing optional fields
            allTasks.forEach((task, index) => {
                try {
                    this.validateTaskData(task);
                    
                    // Log missing optional fields for user awareness
                    const optionalFields = ['description', 'type', 'estimation', 'priority', 'status'];
                    const missingOptionalFields = optionalFields.filter(field => !task[field]);
                    if (missingOptionalFields.length > 0) {
                        console.log(`Task ${task.title}: Missing optional fields (${missingOptionalFields.join(', ')}) - will need to be filled manually`);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
                    throw new Error(`Task ${index + 1}: ${errorMessage}`);
                }
            });
            
            return allTasks;
        } catch (parseError) {
            if (parseError instanceof SyntaxError) {
                throw new Error('Invalid JSON format in TaskMaster file');
            }
            throw parseError;
        }
    }

    private static validateTaskData(data: any): void {
        // Only require absolutely essential fields - others can be filled manually
        const requiredFields = ['id', 'title'];
        const missingFields = requiredFields.filter(field => !data[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Missing essential fields in TaskMaster file: ${missingFields.join(', ')}`);
        }

        // Validate type field only if it's present (optional field)
        if (data.type && !['story', 'bug', 'defect'].includes(data.type)) {
            throw new Error('Invalid type in TaskMaster file. Must be: story, bug, or defect');
        }
    }
}