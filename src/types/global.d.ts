// Global type declarations for Spec Driven Development

declare global {
    var vibeAnalysisTimeout: NodeJS.Timeout | undefined;
    
    namespace NodeJS {
        interface Global {
            vibeAnalysisTimeout?: NodeJS.Timeout;
        }
    }
}

export {};