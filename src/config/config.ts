/**
 * Centralized configuration for all hardcoded values in the workspace
 * This file contains all URLs, timeouts, and constants used throughout the extension
 */
export const CONFIG = {
    salesforce: {
        // authUrl: 'https://test.salesforce.com/services/oauth2/token',
        // baseUrl: 'https://ciscolearningservices--secqa.sandbox.my.salesforce-setup.com',
        authUrl: 'https://test.salesforce.com/services/oauth2/token',
        baseUrl: 'https://ciscolearningservices--clnuat4.sandbox.my.salesforce-setup.com',
        apiVersion: 'v56.0'
    },
    
    api: {
        endpoints: {
            // Salesforce API endpoints
            query: '/services/data/v56.0/query',
            feedback: '/services/data/v56.0/sobjects/Feedback__c',
            feedbackDescribe: '/services/data/v56.0/sobjects/Feedback__c/describe',
            epic: '/services/data/v56.0/sobjects/Epic__c',
            epicDescribe: '/services/data/v56.0/sobjects/Epic__c/describe',
            initiative: '/services/data/v56.0/sobjects/CX_Initiative__c',
            specDrivenUserDetails: '/services/data/v56.0/sobjects/Spec_Driven_User_Details__c'
        }
    },
    
    aws: {
        secretsManager: {
            // Default secret name for Salesforce credentials
            defaultSecretName: 'lcp-devsecops-plugin'
        }
    },
    
    retry: {
        maxRetries: 3,
        baseDelay: 1000, // 1 second
        maxDelay: 10000  // 10 seconds
    },
    
    cache: {
        tokenTTL: 30 * 60 * 1000 // 30 minutes in milliseconds
    },
    
    jira: {
        // Pattern to extract JIRA ticket ID from URL like /browse/GAI-572 or /browse/DEVSECOPS-12208
        // Supports any project key format: [A-Z0-9]+ followed by dash and numbers
        ticketPattern: /\/browse\/([A-Z0-9]+-\d+)/i,
        
        // Pattern to validate standalone JIRA ticket IDs like GAI-572, DEVSECOPS-12208, ABC123-999
        ticketIdPattern: /^[A-Z0-9]+-\d+$/i
    },
    
    termsAndConditions: {
        // Periodic display intervals (in milliseconds)
        periodicIntervals: {
            twiceDaily: 12 * 60 * 60 * 1000,      // 12 hours
            thriceWeekly: 56 * 60 * 60 * 1000     // ~56 hours (3 times per week)
        },
        
        // Timing constants for T&C behavior
        timing: {
            periodicCollectionInterval: 12 * 60 * 60 * 1000,  // 12 hours (twice a day)
            disagreedRetryInterval: 3 * 24 * 60 * 60 * 1000,  // 3 days
            agreedReminderInterval: 30 * 24 * 60 * 60 * 1000  // 30 days
        },
        
        // Copilot-wrapper health check configuration
        copilotWrapper: {
            healthCheckUrl: 'http://localhost:4141/health',
            healthCheckTimeout: 3000  // 3 seconds
        },
        
        // Bill of Materials files to detect in workspace root
        // Add new files here to include them in BOM detection
        billOfMaterialsFiles: [
            '.taskmaster',
            '.devcontainer',
            '.devbox',
            '.spec-driven-development'
        ],
        
        // Active periodic schedule to use ('twiceDaily' or 'thriceWeekly')
        activeSchedule: 'twiceDaily' as 'twiceDaily' | 'thriceWeekly'
    }
} as const;

// Helper functions to get full URLs
export const getSalesforceApiUrl = (endpoint: string): string => {
    return `${CONFIG.salesforce.baseUrl}${endpoint}`;
};

export const getSalesforceAuthUrl = (): string => {
    return CONFIG.salesforce.authUrl;
};

export const getSalesforceQueryUrl = (query: string): string => {
    return `${CONFIG.salesforce.baseUrl}${CONFIG.api.endpoints.query}/?q=${query}`;
};

export const getSalesforceFeedbackUrl = (id?: string): string => {
    const baseUrl = `${CONFIG.salesforce.baseUrl}${CONFIG.api.endpoints.feedback}`;
    return id ? `${baseUrl}/${id}` : `${baseUrl}/`;
};

export const getSalesforceDescribeUrl = (objectType: 'feedback' | 'epic'): string => {
    const endpoint = objectType === 'feedback' 
        ? CONFIG.api.endpoints.feedbackDescribe 
        : CONFIG.api.endpoints.epicDescribe;
    return `${CONFIG.salesforce.baseUrl}${endpoint}`;
};

export const getSalesforceInitiativeUrl = (): string => {
    return `${CONFIG.salesforce.baseUrl}${CONFIG.api.endpoints.initiative}`;
};

export const getSalesforceEpicUrl = (): string => {
    return `${CONFIG.salesforce.baseUrl}${CONFIG.api.endpoints.epic}`;
};