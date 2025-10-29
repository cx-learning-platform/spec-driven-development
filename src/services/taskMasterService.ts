import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface TaskMasterTask {
    id: number;
    title: string;
    description: string;
    status: string;
    priority: string;
    type: "story" | "bug" | "defect";
    estimation: string;
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

        // Build file path
        const taskFilePath = path.join(
            workspaceFolder.uri.fsPath, 
            '.taskmaster', 
            'tasks', 
            'task.json'
        );

        // Check if file exists - throw error if not
        if (!fs.existsSync(taskFilePath)) {
            throw new Error('TaskMaster file does not exist at .taskmaster/tasks/task.json');
        }

        try {
            // Read and parse file
            const fileContent = fs.readFileSync(taskFilePath, 'utf8');
            const parsedData = JSON.parse(fileContent);
            
            // Handle both single object and array formats
            let tasksArray: TaskMasterTask[];
            if (Array.isArray(parsedData)) {
                tasksArray = parsedData;
            } else {
                tasksArray = [parsedData];
            }
            
            // Validate each task
            tasksArray.forEach((task, index) => {
                try {
                    this.validateTaskData(task);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
                    throw new Error(`Task ${index + 1}: ${errorMessage}`);
                }
            });
            
            return tasksArray;
        } catch (parseError) {
            if (parseError instanceof SyntaxError) {
                throw new Error('Invalid JSON format in TaskMaster file');
            }
            throw parseError;
        }
    }

    private static validateTaskData(data: any): void {
        const requiredFields = ['id', 'title', 'description', 'type', 'estimation'];
        const missingFields = requiredFields.filter(field => !data[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields in TaskMaster file: ${missingFields.join(', ')}`);
        }

        if (!['story', 'bug', 'defect'].includes(data.type)) {
            throw new Error('Invalid type in TaskMaster file. Must be: story, bug, or defect');
        }
    }
}