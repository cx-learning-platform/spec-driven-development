(function() {
    // Get the VS Code API
    const vscode = acquireVsCodeApi();

    // State management
    let currentState = {
        awsStatus: { connected: false, status: 'disconnected' },
        estimationData: null,
        jiraValidation: null,
        settings: {},
        parsedEstimation: null,
        allEpics: [], // Store all epics for filtering
        allInitiatives: [], // Store all initiatives with jiraTeam data
        pagination: null, // Store pagination state
        currentTaskList: [], // Store current task list
        editingTask: null, // Store currently editing task data
        currentTaskType: null, // Track which task list is currently displayed (wip, running, archived)
        availableTasks: [], // Store available TaskMaster tasks
        currentImportedTask: null // Store currently imported TaskMaster task for duplicate checking
    };

    // Unit conversion function
    function convertToHours(value, unit) {
        if (!value || value <= 0) return 0;
        
        switch (unit) {
            case 'hours':
                return value;
            case 'days':
                return value * 8; // 8 hours per day
            case 'weeks':
                return value * 40; // 40 hours per week (5 days × 8 hours)
            case 'months':
                return value * 160; // 160 hours per month (4 weeks × 40 hours)
            default:
                return value; // Default to hours if unknown unit
        }
    }

    // Initialize the webview
    function initialize() {
        setupTabs();
        setupEventListeners();
        initializeUIState();
        loadInitialData();
    }

    // Initialize UI state to prevent glitches
    function initializeUIState() {
        // Initialize secret validation to disconnected state
        updateSecretValidationForDisconnected();
        // Initialize feedback form state
        updateFeedbackFormState();
        // Ensure task edit modal is hidden on initialization
        const editModal = document.getElementById('task-edit-modal');
        if (editModal) {
            editModal.style.display = 'none';
        }
        // Ensure task view modal is hidden on initialization
        const viewModal = document.getElementById('task-view-modal');
        if (viewModal) {
            viewModal.style.display = 'none';
        }
    }

    // Tab functionality
    function setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Remove active class from all tabs and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked tab and corresponding content
                button.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
                
                // Auto-load tasks when My Task List tab is opened
                if (targetTab === 'devsecops-hub') {
                    autoLoadDefaultTaskList();
                }
            });
        });
    }

    // Setup all event listeners
    function setupEventListeners() {
        // AWS Configuration Tab
        setupAWSEventListeners();
        
        // Task List functionality
        setupTaskListEventListeners();
        
        // Features Tab
        setupFeedbackEventListeners();
        
        // Estimation Notification
        setupNotificationEventListeners();
    }

    function setupAWSEventListeners() {
        const connectBtn = document.getElementById('connect-aws-btn');
        const refreshBtn = document.getElementById('refresh-aws-btn');

        connectBtn.addEventListener('click', () => {
            updateAWSStatus({ status: 'connecting' });
            showLoadingSteps([
                'Loading AWS CLI credentials...',
                'Testing Secrets Manager access...',
                'Fetching Salesforce credentials...'
            ]);
            vscode.postMessage({ command: 'connectAWS' });
        });

        refreshBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'refreshAWSConnection' });
            vscode.postMessage({ command: 'getEnhancedAWSStatus' });
        });
    }

    function setupTaskListEventListeners() {
        // Task navigation buttons
        const retrieveWipBtn = document.getElementById('retrieve-wip-btn');
        const runningTasksBtn = document.getElementById('running-tasks-btn');
        const archivedTasksBtn = document.getElementById('archived-tasks-btn');

        retrieveWipBtn?.addEventListener('click', () => {
            console.log('WIP tickets button clicked');
            setActiveTaskTab('wip');
            showSearchContainer(); // Enable search for WIP tasks too
            loadWipTasks();
        });

        runningTasksBtn?.addEventListener('click', () => {
            console.log('Running tasks button clicked');
            setActiveTaskTab('running');
            showSearchContainer();
            loadRunningTasks();
        });

        archivedTasksBtn?.addEventListener('click', () => {
            console.log('Done tasks button clicked');
            setActiveTaskTab('archived');
            showSearchContainer();
            loadArchivedTasks();
        });

        // Search functionality
        const searchInput = document.getElementById('task-search-input');
        const searchBtn = document.getElementById('task-search-btn');
        const clearSearchBtn = document.getElementById('task-clear-search-btn');

        searchBtn?.addEventListener('click', () => {
            const searchTerm = searchInput?.value.trim();
            if (searchTerm) {
                performSearch(searchTerm);
            } else {
                const activeTab = getActiveTaskTab();
                if (activeTab === 'wip') {
                    loadWipTasks();
                } else {
                    loadRunningTasks();
                }
            }
        });

        clearSearchBtn?.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            clearSearchBtn.style.display = 'none';
            const activeTab = getActiveTaskTab();
            if (activeTab === 'wip') {
                loadWipTasks();
            } else {
                loadRunningTasks();
            }
        });

        searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchBtn?.click();
            }
        });

        searchInput?.addEventListener('input', () => {
            const hasValue = searchInput.value.trim().length > 0;
            if (clearSearchBtn) {
                clearSearchBtn.style.display = hasValue ? 'inline-block' : 'none';
            }
        });

        // Pagination controls
        const prevBtn = document.getElementById('prev-page-btn');
        const nextBtn = document.getElementById('next-page-btn');

        prevBtn?.addEventListener('click', () => {
            if (currentState.pagination && currentState.pagination.currentOffset > 0) {
                const newOffset = Math.max(0, currentState.pagination.currentOffset - currentState.pagination.currentLimit);
                const activeTab = getActiveTaskTab();
                if (activeTab === 'wip') {
                    loadWipTasks(newOffset, currentState.pagination.searchTerm);
                } else if (activeTab === 'archived') {
                    loadArchivedTasks(newOffset, currentState.pagination.searchTerm);
                } else {
                    loadRunningTasks(newOffset, currentState.pagination.searchTerm);
                }
            }
        });

        nextBtn?.addEventListener('click', () => {
            if (currentState.pagination && currentState.pagination.hasMore) {
                const newOffset = currentState.pagination.currentOffset + currentState.pagination.currentLimit;
                const activeTab = getActiveTaskTab();
                if (activeTab === 'wip') {
                    loadWipTasks(newOffset, currentState.pagination.searchTerm);
                } else if (activeTab === 'archived') {
                    loadArchivedTasks(newOffset, currentState.pagination.searchTerm);
                } else {
                    loadRunningTasks(newOffset, currentState.pagination.searchTerm);
                }
            }
        });

        // Task edit modal
        setupTaskEditModal();

        // Don't auto-load tasks - let user click when ready
    }

    function setupFeedbackEventListeners() {
        const submitFeedbackBtn = document.getElementById('submit-feedback-btn');
        const loadDataBtn = document.getElementById('load-data-btn');
        const importTaskMasterBtn = document.getElementById('import-taskmaster-btn');
        const importSelectedBtn = document.getElementById('import-selected-btn');
        const taskDropdown = document.getElementById('task-dropdown');
        const feedbackTypeSelect = document.getElementById('feedback-type');
        const acceptanceCriteriaGroup = document.getElementById('acceptance-criteria-group');

        // Handle feedback type change to show/hide acceptance criteria
        feedbackTypeSelect.addEventListener('change', () => {
            if (feedbackTypeSelect.value === 'Story') {
                acceptanceCriteriaGroup.style.display = 'block';
                document.getElementById('acceptance-criteria').required = true;
            } else {
                acceptanceCriteriaGroup.style.display = 'none';
                document.getElementById('acceptance-criteria').required = false;
                document.getElementById('acceptance-criteria').value = '';
            }
        });

        // Handle initiative change - load epics for selected initiative's jira team
        const initiativeSelect = document.getElementById('initiative');
        initiativeSelect.addEventListener('change', () => {
            const epicSelect = document.getElementById('epic');
            const selectedInitiativeId = initiativeSelect.value;
            
            if (!selectedInitiativeId) {
                // No initiative selected, clear epics
                epicSelect.innerHTML = '<option value="">Select Epic...</option>';
                epicSelect.value = '';
                return;
            }
            
            // Find the selected initiative's jiraTeam
            const selectedOption = initiativeSelect.options[initiativeSelect.selectedIndex];
            const jiraTeam = selectedOption.getAttribute('data-jira-team');
            
            if (jiraTeam) {
                // Request epics for this jira team from backend
                console.log(`Loading epics for Jira team: ${jiraTeam}`);
                vscode.postMessage({ 
                    command: 'loadEpicsForInitiative', 
                    jiraTeam: jiraTeam 
                });
            } else {
                // Fallback: load all epics
                console.log('No jiraTeam found for initiative, loading all epics');
                vscode.postMessage({ command: 'loadEpics' });
            }
        });

        // Handle epic change - load sprints for selected epic's team
        const epicSelect = document.getElementById('epic');
        epicSelect.addEventListener('change', () => {
            const sprintSelect = document.getElementById('jira-sprint');
            const selectedEpicId = epicSelect.value;
            
            if (!selectedEpicId) {
                // No epic selected, clear sprints or load all
                vscode.postMessage({ command: 'loadSprintDetails' });
                return;
            }
            
            // Find the team name from the epic's data
            // Epics are stored in currentState.allEpics with teamName property
            const selectedEpic = currentState.allEpics.find(epic => epic.id === selectedEpicId);
            
            if (selectedEpic && selectedEpic.teamName) {
                // Request sprints for this team from backend
                console.log(`Loading sprints for team: ${selectedEpic.teamName}`);
                vscode.postMessage({ 
                    command: 'loadSprintsForTeam', 
                    teamName: selectedEpic.teamName 
                });
            } else {
                // Fallback: load all sprints
                console.log('No team name found for epic, loading all sprints');
                vscode.postMessage({ command: 'loadSprintDetails' });
            }
        });

        // Handle form submission
        submitFeedbackBtn.addEventListener('click', () => {
            // Check AWS connection first
            if (!canSubmitFeedback()) {
                showFeedbackResult({
                    success: false,
                    message: 'AWS connection is required to submit features. Please connect to AWS first.',
                    error: 'AWS connection required'
                });
                return;
            }

            const feedbackData = {
                name: document.getElementById('feedback-name').value,
                feedbackType: document.getElementById('feedback-type').value,
                estimatedHours: parseFloat(document.getElementById('estimated-hours').value),
                initiativeId: document.getElementById('initiative').value,
                epicId: document.getElementById('epic').value,
                description: document.getElementById('feedback-description').value,
                acceptanceCriteria: document.getElementById('acceptance-criteria').value,
                workType: document.getElementById('work-type').value,
                jiraPriority: document.getElementById('jira-priority').value,
                sprintId: document.getElementById('jira-sprint').value
            };

            // Basic validation
            if (!feedbackData.name || !feedbackData.feedbackType || !feedbackData.estimatedHours || 
                !feedbackData.initiativeId || !feedbackData.epicId || !feedbackData.description) {
                showFeedbackResult({
                    success: false,
                    message: 'Please fill in all required fields',
                    error: 'Validation failed'
                });
                return;
            }

            if (feedbackData.feedbackType === 'Story' && !feedbackData.acceptanceCriteria) {
                showFeedbackResult({
                    success: false,
                    message: 'Acceptance criteria is required for Story type',
                    error: 'Validation failed'
                });
                return;
            }

            // Check for duplicate TaskMaster task submission
            if (currentState.currentImportedTask) {
                checkForDuplicateSubmission(feedbackData);
            } else {
                // No TaskMaster task imported, proceed with submission
                submitFeedbackData(feedbackData);
            }
        });

        // Handle refresh tab - clear all fields and reload dropdowns
        loadDataBtn.addEventListener('click', () => {
            refreshTabContent();
        });

        // Handle import from TaskMaster
        if (importTaskMasterBtn) {
            importTaskMasterBtn.addEventListener('click', () => {
                // Disable button during import
                importTaskMasterBtn.disabled = true;
                importTaskMasterBtn.textContent = '📥 Loading Tasks...';
                
                vscode.postMessage({ command: 'importTaskMaster' });
                
                // Fallback: Re-enable button after 5 seconds if no response received
                // This ensures the button doesn't stay disabled indefinitely if there's an error
                setTimeout(() => {
                    if (importTaskMasterBtn.disabled && importTaskMasterBtn.textContent === '📥 Loading Tasks...') {
                        importTaskMasterBtn.disabled = false;
                        importTaskMasterBtn.textContent = '📥 Import from TaskMaster';
                        console.warn('TaskMaster import timed out or failed - button re-enabled after 5 seconds');
                    }
                }, 5000); // 5 second timeout
            });
        }

        // Handle task dropdown selection
        if (taskDropdown) {
            taskDropdown.addEventListener('change', () => {
                if (importSelectedBtn) {
                    importSelectedBtn.disabled = !taskDropdown.value;
                }
            });
        }

        // Handle import selected task
        if (importSelectedBtn) {
            importSelectedBtn.addEventListener('click', () => {
                const selectedIndex = parseInt(taskDropdown.value);
                if (!isNaN(selectedIndex) && currentState.availableTasks && currentState.availableTasks[selectedIndex]) {
                    const selectedTask = currentState.availableTasks[selectedIndex];
                    populateSingleTask(selectedTask);
                    console.log(`TaskMaster task "${selectedTask.title}" imported successfully`);
                }
            });
        }
    }

    // Function to check for duplicate TaskMaster task submission
    function checkForDuplicateSubmission(feedbackData) {
        // Ask for submitted tasks from extension
        vscode.postMessage({ 
            command: 'checkDuplicateTaskMaster',
            data: {
                taskId: currentState.currentImportedTask.id,
                taskTitle: currentState.currentImportedTask.title,
                feedbackData: feedbackData
            }
        });
    }

    // Function to actually submit feedback data
    function submitFeedbackData(feedbackData) {
        // Include TaskMaster task info if available
        const submissionData = {
            ...feedbackData,
            taskMasterTask: currentState.currentImportedTask ? {
                id: currentState.currentImportedTask.id,
                title: currentState.currentImportedTask.title
            } : null
        };

        vscode.postMessage({ 
            command: 'submitFeedback', 
            data: submissionData 
        });
    }

    function loadFeedbackDropdowns() {
        // Check if AWS is connected before loading dropdowns
        if (!currentState.awsStatus || currentState.awsStatus.status !== 'connected') {
            console.log('AWS not connected, skipping feedback dropdown loading');
            populateInitiativesDropdown([]);
            populateEpicsDropdown([]);
            populateSprintDetailsDropdown([]);
            return;
        }

        // Trigger auto-population from Git repository
        autoPopulateFromGit();
        
        // Also load sprint details (not auto-populated)
        vscode.postMessage({ command: 'loadSprintDetails' });
    }

    function canSubmitFeedback() {
        return currentState.awsStatus && currentState.awsStatus.status === 'connected';
    }

    function updateFeedbackFormState() {
        const submitBtn = document.getElementById('submit-feedback-btn');
        const loadDataBtn = document.getElementById('load-data-btn');
        const epicSelect = document.getElementById('epic');
        
        if (canSubmitFeedback()) {
            submitBtn.disabled = false;
            loadDataBtn.disabled = false;
            submitBtn.textContent = 'Submit Feature';
        } else {
            submitBtn.disabled = true;
            loadDataBtn.disabled = true;
            submitBtn.textContent = 'Connect to AWS First';
            
            // Ensure epic dropdown is disabled when AWS is not connected
            if (epicSelect) {
                epicSelect.disabled = true;
                epicSelect.innerHTML = '<option value="">Connect to AWS first</option>';
            }
        }
    }

    function clearFeedbackForm() {
        // Clear all form fields
        document.getElementById('feedback-name').value = '';
        document.getElementById('feedback-type').value = '';
        document.getElementById('estimated-hours').value = '';
        document.getElementById('initiative').value = '';
        document.getElementById('epic').value = '';
        document.getElementById('feedback-description').value = '';
        document.getElementById('acceptance-criteria').value = '';
        document.getElementById('work-type').value = '';
        document.getElementById('jira-priority').value = '';
        document.getElementById('jira-sprint').value = '';
        
        // Hide acceptance criteria group if visible
        const acceptanceCriteriaGroup = document.getElementById('acceptance-criteria-group');
        if (acceptanceCriteriaGroup) {
            acceptanceCriteriaGroup.style.display = 'none';
        }
        
        // Hide feedback result message
        const feedbackResult = document.getElementById('feedback-result');
        if (feedbackResult) {
            feedbackResult.style.display = 'none';
            feedbackResult.innerHTML = '';
        }
        
        // Clear task selection dropdown
        const taskDropdown = document.getElementById('task-dropdown');
        if (taskDropdown) {
            taskDropdown.innerHTML = '<option value="">Choose a task...</option>';
            taskDropdown.value = '';
        }
        
        // Hide task selection section
        const taskSelectionSection = document.getElementById('task-selection-section');
        if (taskSelectionSection) {
            taskSelectionSection.style.display = 'none';
        }
        
        // Clear current imported task
        currentState.currentImportedTask = null;
    }

    // Function to refresh tab content - clear all fields and reload dropdowns
    function refreshTabContent() {
        console.log('Refreshing tab content - clearing all fields and reloading dropdowns');
        
        // Use existing clear form function
        clearFeedbackForm();
        
        // Clear any previous auto-populate badge
        const autopopulateBadge = document.getElementById('auto-populate-badge');
        if (autopopulateBadge) {
            autopopulateBadge.style.display = 'none';
            autopopulateBadge.innerHTML = '';
        }
        
        // Reset dropdowns to loading state
        resetDropdownsToLoadingState();
        
        // Re-trigger the dropdown loading and auto-population
        loadFeedbackDropdowns();
        
        // Show success message briefly
        showRefreshMessage();
    }

    // Function to reset dropdowns to their initial loading state
    function resetDropdownsToLoadingState() {
        const initiativeSelect = document.getElementById('initiative');
        const epicSelect = document.getElementById('epic');
        const sprintSelect = document.getElementById('jira-sprint');
        
        if (initiativeSelect) {
            initiativeSelect.innerHTML = '<option value="">Loading initiatives...</option>';
        }
        
        if (epicSelect) {
            epicSelect.innerHTML = '<option value="">Loading epics...</option>';
        }
        
        if (sprintSelect) {
            sprintSelect.innerHTML = '<option value="">Loading sprints...</option>';
        }
    }

    // Function to show brief refresh success message
    function showRefreshMessage() {
        const feedbackResult = document.getElementById('feedback-result');
        if (feedbackResult) {
            feedbackResult.innerHTML = '<div class="success-message">Tab refreshed successfully! Auto-population in progress...</div>';
            feedbackResult.style.display = 'block';
            
            // Clear the message after 3 seconds
            setTimeout(() => {
                if (feedbackResult.innerHTML.includes('Tab refreshed successfully')) {
                    feedbackResult.innerHTML = '';
                    feedbackResult.style.display = 'none';
                }
            }, 3000);
        }
    }

    function setupNotificationEventListeners() {
        // Notification elements removed - no event listeners needed
        console.log('Notification event listeners disabled - HTML elements removed');
    }

    // Load initial data
    function loadInitialData() {
        vscode.postMessage({ command: 'getAWSStatus' });
        // Only get enhanced status after AWS status is loaded to prevent premature display
        vscode.postMessage({ command: 'getEstimationData' });
    }



    // AWS Status Updates
    function updateAWSStatus(status) {
        currentState.awsStatus = status;
        const statusIndicator = document.getElementById('aws-status-indicator');
        const statusDot = statusIndicator.querySelector('.status-dot');
        const statusText = document.getElementById('aws-status-text');
        const connectBtn = document.getElementById('connect-aws-btn');
        const refreshBtn = document.getElementById('refresh-aws-btn');
        const connectionDetails = document.getElementById('aws-connection-details');
        const loading = document.getElementById('aws-loading');

        // Update status indicator
        statusDot.className = 'status-dot';
        switch (status.status) {
            case 'connected':
                statusDot.classList.add('status-connected');
                statusText.textContent = '🟢 Connected & Ready';
                connectBtn.style.display = 'none';
                refreshBtn.style.display = 'inline-block';
                connectionDetails.style.display = 'block';
                loading.style.display = 'none';
                updateConnectionDetails(status);
                updatePrerequisites();
                // Immediately show validating state for secret validation
                updateSecretValidationForValidating();
                // Load enhanced status after showing validating state
                vscode.postMessage({ command: 'getEnhancedAWSStatus' });
                // Load feedback dropdowns when AWS is connected
                loadFeedbackDropdowns();
                // Auto-load task list if user is on My Task List tab
                checkAndAutoLoadTasks();
                break;
            case 'connecting':
                statusDot.classList.add('status-connecting');
                statusText.textContent = '🟡 Connecting...';
                connectBtn.style.display = 'none';
                refreshBtn.style.display = 'none';
                connectionDetails.style.display = 'none';
                loading.style.display = 'block';
                // Update secret validation to show connecting state
                updateSecretValidationForConnecting();
                break;
            case 'error':
                statusDot.classList.add('status-disconnected');
                statusText.textContent = '🔴 Connection Failed';
                connectBtn.style.display = 'inline-block';
                refreshBtn.style.display = 'none';
                connectionDetails.style.display = 'none';
                loading.style.display = 'none';
                // Update secret validation to show error state
                updateSecretValidationForError();
                break;
            default:
                statusDot.classList.add('status-disconnected');
                statusText.textContent = '🔴 Not Connected';
                connectBtn.style.display = 'inline-block';
                refreshBtn.style.display = 'none';
                connectionDetails.style.display = 'none';
                loading.style.display = 'none';
                // Update secret validation to show disconnected state
                updateSecretValidationForDisconnected();
        }
        
        // Update feedback form state based on AWS connection
        updateFeedbackFormState();
    }

    function updateEnhancedAWSStatus(enhancedStatus) {
        // Update the secret validation card with new structure
        const secretIcon = document.getElementById('secret-validation-icon');
        const secretTitle = document.getElementById('secret-validation-title');
        const secretStatusValue = document.getElementById('secret-status-value');
        const secretMissingFields = document.getElementById('secret-missing-fields');
        const secretDetailsRow = document.getElementById('secret-details-row');
        const secretDetailsValue = document.getElementById('secret-details-value');
        
        // Always process enhanced status regardless of current connection state
        // This allows for proper error handling and status updates
        
        if (secretIcon && secretTitle && secretStatusValue && secretMissingFields) {
            switch (enhancedStatus.status) {
                case 'ready':
                    secretIcon.textContent = '✅';
                    secretTitle.textContent = 'Secret Validation Complete';
                    secretStatusValue.textContent = 'All required fields found';
                    secretMissingFields.textContent = 'none';
                    break;
                case 'secret-invalid':
                    secretIcon.textContent = '⚠️';
                    secretTitle.textContent = 'Secret Invalid';
                    secretStatusValue.textContent = 'Missing required fields';
                    secretMissingFields.textContent = enhancedStatus.missingFields ? enhancedStatus.missingFields.join(', ') : 'Unknown fields';
                    break;
                case 'secret-not-found':
                    secretIcon.textContent = '⚠️';
                    secretTitle.textContent = 'Secret Not Found';
                    secretStatusValue.textContent = 'Secret does not exist';
                    secretMissingFields.textContent = 'N/A';
                    break;
                case 'aws-not-configured':
                    secretIcon.textContent = '❌';
                    secretTitle.textContent = 'AWS Not Configured';
                    secretStatusValue.textContent = 'AWS CLI not configured';
                    secretMissingFields.textContent = 'N/A';
                    break;
                case 'error':
                    secretIcon.textContent = '❌';
                    secretTitle.textContent = 'Validation Error';
                    secretStatusValue.textContent = 'Failed to validate secret';
                    secretMissingFields.textContent = 'N/A';
                    break;
                default:
                    secretIcon.textContent = '🔍';
                    secretTitle.textContent = 'Checking Secret...';
                    secretStatusValue.textContent = 'Validation in progress';
                    secretMissingFields.textContent = 'Checking...';
            }
            
            // Show details if available
            if (enhancedStatus.details && secretDetailsRow && secretDetailsValue) {
                secretDetailsValue.textContent = enhancedStatus.details;
                secretDetailsRow.style.display = 'flex';
            } else if (secretDetailsRow) {
                secretDetailsRow.style.display = 'none';
            }
        }
        
        // Update prerequisites based on enhanced status
        updatePrerequisites();
    }

    function updateSecretValidationForConnecting() {
        const secretIcon = document.getElementById('secret-validation-icon');
        const secretTitle = document.getElementById('secret-validation-title');
        const secretStatusValue = document.getElementById('secret-status-value');
        const secretMissingFields = document.getElementById('secret-missing-fields');
        const secretDetailsRow = document.getElementById('secret-details-row');
        
        if (secretIcon) secretIcon.textContent = '🔄';
        if (secretTitle) secretTitle.textContent = 'Preparing Validation...';
        if (secretStatusValue) secretStatusValue.textContent = 'Establishing AWS connection';
        if (secretMissingFields) secretMissingFields.textContent = 'Pending...';
        if (secretDetailsRow) secretDetailsRow.style.display = 'none';
    }

    function updateSecretValidationForError() {
        const secretIcon = document.getElementById('secret-validation-icon');
        const secretTitle = document.getElementById('secret-validation-title');
        const secretStatusValue = document.getElementById('secret-status-value');
        const secretMissingFields = document.getElementById('secret-missing-fields');
        const secretDetailsRow = document.getElementById('secret-details-row');
        
        if (secretIcon) secretIcon.textContent = '❌';
        if (secretTitle) secretTitle.textContent = 'Connection Failed';
        if (secretStatusValue) secretStatusValue.textContent = 'Unable to connect to AWS';
        if (secretMissingFields) secretMissingFields.textContent = 'N/A';
        if (secretDetailsRow) secretDetailsRow.style.display = 'none';
    }

    function updateSecretValidationForDisconnected() {
        const secretIcon = document.getElementById('secret-validation-icon');
        const secretTitle = document.getElementById('secret-validation-title');
        const secretStatusValue = document.getElementById('secret-status-value');
        const secretMissingFields = document.getElementById('secret-missing-fields');
        const secretDetailsRow = document.getElementById('secret-details-row');
        
        if (secretIcon) secretIcon.textContent = '⏸️';
        if (secretTitle) secretTitle.textContent = 'Not Connected';
        if (secretStatusValue) secretStatusValue.textContent = 'Connect to AWS to validate';
        if (secretMissingFields) secretMissingFields.textContent = 'N/A';
        if (secretDetailsRow) secretDetailsRow.style.display = 'none';
    }

    function updateSecretValidationForValidating() {
        const secretIcon = document.getElementById('secret-validation-icon');
        const secretTitle = document.getElementById('secret-validation-title');
        const secretStatusValue = document.getElementById('secret-status-value');
        const secretMissingFields = document.getElementById('secret-missing-fields');
        const secretDetailsRow = document.getElementById('secret-details-row');
        
        if (secretIcon) secretIcon.textContent = '🔍';
        if (secretTitle) secretTitle.textContent = 'Validating Secret...';
        if (secretStatusValue) secretStatusValue.textContent = 'Checking Salesforce credentials';
        if (secretMissingFields) secretMissingFields.textContent = 'Validating...';
        if (secretDetailsRow) secretDetailsRow.style.display = 'none';
    }

    function updateConnectionDetails(status) {
        const detailsContent = document.getElementById('aws-details-content');
        const connectionTime = new Date().toLocaleTimeString();
        
        // Calculate session expiry display
        let sessionExpiryDisplay = 'Unknown';
        let timeRemaining = '';
        
        if (status.sessionExpiry) {
            const expiryDate = new Date(status.sessionExpiry);
            const now = new Date();
            const timeDiff = expiryDate.getTime() - now.getTime();
            
            if (timeDiff > 0) {
                const hours = Math.floor(timeDiff / (1000 * 60 * 60));
                const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
                
                if (hours > 0) {
                    timeRemaining = `${hours}h ${minutes}m remaining`;
                } else if (minutes > 0) {
                    timeRemaining = `${minutes}m remaining`;
                } else {
                    timeRemaining = 'Expiring soon';
                }
                sessionExpiryDisplay = timeRemaining;
            } else {
                sessionExpiryDisplay = 'Session expired';
            }
        }
        
        detailsContent.innerHTML = `
            <div class="connection-status-card">
                <div class="connection-header">
                    <span class="connection-icon">🔗</span>
                    <span class="connection-title">AWS Connection Active</span>
                </div>
                <div class="connection-info">
                    <div class="info-row">
                        <span class="info-label">Connected at:</span>
                        <span class="info-value">${connectionTime}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Session status:</span>
                        <span class="info-value session-expiry">${sessionExpiryDisplay}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Services:</span>
                        <span class="info-value">${status.secretsManagerAccess ? '✅ Secrets Manager Ready' : '❌ Limited Access'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function showLoadingSteps(steps) {
        const loadingSteps = document.getElementById('loading-steps');
        let currentStep = 0;
        
        function updateStep() {
            if (currentStep < steps.length) {
                loadingSteps.innerHTML = `
                    ${steps.slice(0, currentStep).map(step => `<div class="step-completed">✅ ${step}</div>`).join('')}
                    ${currentStep < steps.length ? `<div class="step-in-progress">⏳ ${steps[currentStep]}</div>` : ''}
                    ${steps.slice(currentStep + 1).map(step => `<div class="step-pending">⏸️ ${step}</div>`).join('')}
                `;
                currentStep++;
                setTimeout(updateStep, 1000);
            }
        }
        
        updateStep();
    }

    // Prerequisites Updates
    function updatePrerequisites() {
        const awsConnected = currentState.awsStatus?.connected || false;
        
        // Update prerequisite status
        const awsStatus = document.getElementById('prereq-aws-status');
        
        if (awsStatus) {
            awsStatus.textContent = awsConnected ? '✅' : '❌';
        }
    }

    // Estimation Data Updates
    function updateEstimationData(estimation) {
        currentState.estimationData = estimation;
        const estimationDetails = document.getElementById('estimation-details');
        const estimationContent = document.getElementById('estimation-content');

        if (estimation) {
            estimationDetails.style.display = 'block';
            estimationContent.innerHTML = `
                <div>├── Original Estimate: ${estimation.originalText || 'N/A'}</div>
                <div>├── Hours Equivalent: ${estimation.normalizedValue || 'N/A'} hours</div>
                <div>├── Confidence: ${estimation.confidence || 'Medium'}</div>
                <div>└── Source: ${estimation.source || 'GitHub Copilot'}</div>
            `;
        } else {
            estimationDetails.style.display = 'none';
        }

        updatePrerequisites();
        
        // Note: This function only updates the display data - it does NOT show notification popups
        // Notifications are only shown via the showEstimationNotification() function when explicitly triggered
    }



    // JIRA Update Results
    function showJiraUpdateResult(result) {
        const updateResult = document.getElementById('jira-update-result');
        const updateBtn = document.getElementById('update-jira-btn');
        
        // Reset button state
        if (updateBtn) {
            updateBtn.disabled = false;
            updateBtn.textContent = '📊 Update DEVSECOPS Ticket';
        }
        
        if (result.success) {
            updateResult.className = 'result-display success';
            updateResult.innerHTML = `
                <div class="result-header">
                    <span class="result-icon">✅</span>
                    <span class="result-title">DEVSECOPS Ticket Updated Successfully</span>
                </div>
                <div class="result-details">
                    <div class="result-item">
                        <span class="result-label">Ticket ID:</span>
                        <span class="result-value">${result.jiraId}</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">Status:</span>
                        <span class="result-value">${result.message}</span>
                    </div>
                    ${result.epicId ? `
                    <div class="result-item">
                        <span class="result-label">Epic ID:</span>
                        <span class="result-value">${result.epicId}</span>
                    </div>` : ''}
                    ${result.recordUrl ? `
                    <div class="result-item">
                        <span class="result-label">URL:</span>
                        <span class="result-value"><a href="${result.recordUrl}" target="_blank">View in Salesforce</a></span>
                    </div>` : ''}
                </div>
            `;
        } else {
            updateResult.className = 'result-display error';
            updateResult.innerHTML = `
                <div class="result-header">
                    <span class="result-icon">❌</span>
                    <span class="result-title">Failed to Update DEVSECOPS Ticket</span>
                </div>
                <div class="result-details">
                    <div class="result-item">
                        <span class="result-label">Ticket ID:</span>
                        <span class="result-value">${result.jiraId}</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">Message:</span>
                        <span class="result-value">${result.message}</span>
                    </div>
                    ${result.error ? `
                    <div class="result-item">
                        <span class="result-label">Error:</span>
                        <span class="result-value error-text">${result.error}</span>
                    </div>` : ''}
                </div>
            `;
        }
        
        updateResult.style.display = 'block';
    }

    // Feedback Results
    function showFeedbackResult(result) {
        console.log('showFeedbackResult called with:', result);
        const feedbackResult = document.getElementById('feedback-result');
        
        if (!feedbackResult) {
            console.error('Feedback result element not found!');
            return;
        }
        
        if (result.success) {
            // Extract Jira ticket ID from Jira URL if available - supports any project format
            let displayTicketId = result.ticketId || 'N/A';
            if (result.jiraUrl) {
                const jiraTicketMatch = result.jiraUrl.match(/\/browse\/([A-Z0-9]+-\d+)/i);
                if (jiraTicketMatch) {
                    displayTicketId = jiraTicketMatch[1]; // Extract GAI-572, DEVSECOPS-12208, etc. from URL
                }
            }
            
            feedbackResult.className = 'feedback-result success';
            feedbackResult.innerHTML = `
                <div class="result-header">
                    <span class="result-icon">✅</span>
                    <span class="result-title">Feature Submitted Successfully</span>
                </div>
                <div class="result-details">
                    <div class="result-item">
                        <span class="result-label">Ticket ID:</span>
                        <span class="result-value">${displayTicketId}</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">Status:</span>
                        <span class="result-value">${result.message}</span>
                    </div>
                    ${result.jiraUrl ? `
                    <div class="result-item">
                        <span class="result-label">JIRA Link:</span>
                        <span class="result-value"><a href="${result.jiraUrl}" target="_blank">View in JIRA</a></span>
                    </div>` : ''}
                </div>
            `;
        } else {
            feedbackResult.className = 'feedback-result error';
            feedbackResult.innerHTML = `
                <div class="result-header">
                    <span class="result-icon">❌</span>
                    <span class="result-title">Failed to Submit Feature</span>
                </div>
                <div class="result-details">
                    <div class="result-item">
                        <span class="result-label">Message:</span>
                        <span class="result-value">${result.message}</span>
                    </div>
                    ${result.error ? `
                    <div class="result-item">
                        <span class="result-label">Error:</span>
                        <span class="result-value error-text">${result.error}</span>
                    </div>` : ''}
                    ${result.existingTicketId ? `
                    <div class="result-item">
                        <span class="result-label">Existing Ticket:</span>
                        <span class="result-value">${result.existingTicketId}</span>
                    </div>` : ''}
                    ${result.existingJiraUrl ? `
                    <div class="result-item">
                        <span class="result-label">JIRA Link:</span>
                        <span class="result-value"><a href="${result.existingJiraUrl}" target="_blank">View in JIRA</a></span>
                    </div>` : ''}
                </div>
            `;
        }
        
        feedbackResult.style.display = 'block';
        
        // Scroll the feedback result into view so user can see it
        feedbackResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Message stays persistent - user can see it until they clear the form or take action
    }

    function showImportResult(result) {
        const feedbackResult = document.getElementById('feedback-result');
        
        if (result.success) {
            feedbackResult.className = 'feedback-result success';
            feedbackResult.innerHTML = `
                <div class="result-header">
                    <span class="result-icon">📥</span>
                    <span class="result-title">TaskMaster Data Imported Successfully</span>
                </div>
                <div class="result-details">
                    <div class="result-item">
                        <span class="result-label">Task Name:</span>
                        <span class="result-value">${result.taskData?.name || 'N/A'}</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">Type:</span>
                        <span class="result-value">${result.taskData?.type || 'N/A'}</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">Estimation:</span>
                        <span class="result-value">${result.taskData?.estimation || 'N/A'} hours</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">Next Steps:</span>
                        <span class="result-value">Please select Initiative and Epic before submitting</span>
                    </div>
                </div>
            `;
        } else {
            feedbackResult.className = 'feedback-result error';
            feedbackResult.innerHTML = `
                <div class="result-header">
                    <span class="result-icon">❌</span>
                    <span class="result-title">Failed to Import TaskMaster Data</span>
                </div>
                <div class="result-details">
                    <div class="result-item">
                        <span class="result-label">Message:</span>
                        <span class="result-value">${result.message}</span>
                    </div>
                    ${result.error ? `
                    <div class="result-item">
                        <span class="result-label">Error:</span>
                        <span class="result-value error-text">${result.error}</span>
                    </div>` : ''}
                </div>
            `;
        }
        
        feedbackResult.style.display = 'block';
    }



    // Estimation Notification - DISABLED
    function showEstimationNotification(estimation) {
        // Function disabled - user doesn't want estimation popup notifications
        console.log('Estimation notification disabled by user request');
        return;
    }

    function hideEstimationNotification() {
        // Function disabled - HTML element removed
        console.log('Hide estimation notification disabled - element removed');
    }





    // Populate initiatives dropdown
    function populateInitiativesDropdown(initiatives) {
        // Store initiatives with jiraTeam data
        currentState.allInitiatives = initiatives || [];
        
        const initiativeSelect = document.getElementById('initiative');
        
        if (!canSubmitFeedback()) {
            initiativeSelect.innerHTML = '<option value="">Connect to AWS to load initiatives</option>';
            initiativeSelect.disabled = true;
            return;
        }
        
        initiativeSelect.disabled = false;
        initiativeSelect.innerHTML = '<option value="">Select Initiative...</option>';
        
        if (initiatives && initiatives.length > 0) {
            initiatives.forEach(initiative => {
                const option = document.createElement('option');
                option.value = initiative.id;
                option.textContent = initiative.name;
                // Store jiraTeam as a data attribute
                if (initiative.jiraTeam) {
                    option.setAttribute('data-jira-team', initiative.jiraTeam);
                }
                initiativeSelect.appendChild(option);
            });
        } else {
            initiativeSelect.innerHTML = '<option value="">No initiatives available</option>';
        }
    }

    function handleInitiativesError(error) {
        const initiativeSelect = document.getElementById('initiative');
        
        // Show user-friendly error message in dropdown
        let errorMessage = 'Failed to load initiatives';
        if (error && error.message) {
            if (error.message.includes('timeout')) {
                errorMessage = 'Network timeout - please try again';
            } else if (error.message.includes('connection')) {
                errorMessage = 'Connection failed - check network';
            } else if (error.message.includes('authentication')) {
                errorMessage = 'Authentication failed - reconnect AWS';
            }
        }
        
        initiativeSelect.innerHTML = `<option value="">${errorMessage}</option>`;
        initiativeSelect.disabled = false;
        
        console.warn('Failed to load initiatives:', error);
        
        // Show a non-intrusive notification to the user
        const notification = document.createElement('div');
        notification.className = 'error-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--vscode-errorBackground);
            color: var(--vscode-errorForeground);
            padding: 8px 12px;
            border-radius: 4px;
            border: 1px solid var(--vscode-errorBorder);
            font-size: 12px;
            z-index: 1000;
            max-width: 300px;
        `;
        notification.textContent = `Initiative loading failed: ${errorMessage}. TaskMaster import will still work.`;
        
        document.body.appendChild(notification);
        
        // Auto-remove notification after 8 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 8000);
    }

    // Populate epics dropdown
    function populateEpicsDropdown(epics) {
        // Store epics for reference
        currentState.allEpics = epics || [];
        
        const epicSelect = document.getElementById('epic');
        
        if (!canSubmitFeedback()) {
            epicSelect.innerHTML = '<option value="">Connect to AWS to load epics</option>';
            epicSelect.disabled = true;
            return;
        }
        
        epicSelect.disabled = false;
        epicSelect.innerHTML = '<option value="">Select Epic...</option>';
        
        if (epics && epics.length > 0) {
            // Show all epics - no filtering needed
            epics.forEach(epic => {
                const option = document.createElement('option');
                option.value = epic.id;
                option.textContent = `${epic.name}${epic.teamName ? ' (' + epic.teamName + ')' : ''}`;
                epicSelect.appendChild(option);
            });
        } else {
            epicSelect.innerHTML = '<option value="">No epics available</option>';
        }
    }

    // Populate sprint details dropdown
    function populateSprintDetailsDropdown(sprints) {
        // Store sprints for reference
        currentState.allSprints = sprints || [];
        
        const sprintSelect = document.getElementById('jira-sprint');
        
        if (!canSubmitFeedback()) {
            sprintSelect.innerHTML = '<option value="">Connect to AWS to load sprints</option>';
            sprintSelect.disabled = true;
            return;
        }
        
        sprintSelect.disabled = false;
        sprintSelect.innerHTML = '<option value="">Select Sprint...</option>';
        
        if (sprints && sprints.length > 0) {
            sprints.forEach(sprint => {
                const option = document.createElement('option');
                option.value = sprint.id;
                option.textContent = sprint.name;
                sprintSelect.appendChild(option);
            });
        } else {
            sprintSelect.innerHTML = '<option value="">No sprints available</option>';
        }
    }


    // Task List Management Functions
    function setActiveTaskTab(tabType) {
        const retrieveWipBtn = document.getElementById('retrieve-wip-btn');
        const runningTasksBtn = document.getElementById('running-tasks-btn');
        const archivedTasksBtn = document.getElementById('archived-tasks-btn');
        const taskListTitle = document.getElementById('task-list-title');

        // Remove active from all buttons first
        retrieveWipBtn?.classList.remove('active');
        runningTasksBtn?.classList.remove('active');
        archivedTasksBtn?.classList.remove('active');

        // Update button states and title
        if (tabType === 'wip') {
            retrieveWipBtn?.classList.add('active');
            if (taskListTitle) taskListTitle.textContent = 'WIP Tickets';
        } else if (tabType === 'archived') {
            archivedTasksBtn?.classList.add('active');
            if (taskListTitle) taskListTitle.textContent = 'Done Tickets';
        } else {
            runningTasksBtn?.classList.add('active');
            if (taskListTitle) taskListTitle.textContent = 'Tickets List';
        }
    }

    function showTaskLoading() {
        const taskLoading = document.getElementById('task-loading');
        const taskEmptyState = document.getElementById('task-empty-state');
        const taskList = document.getElementById('task-list');

        if (taskLoading) taskLoading.style.display = 'flex';
        if (taskEmptyState) taskEmptyState.style.display = 'none';
        if (taskList) taskList.style.display = 'none';
    }

    function hideTaskLoading() {
        const taskLoading = document.getElementById('task-loading');
        if (taskLoading) taskLoading.style.display = 'none';
    }

    // Helper functions for task management
    function showSearchContainer() {
        const searchContainer = document.getElementById('search-container');
        if (searchContainer) searchContainer.style.display = 'block';
    }

    function hideSearchContainer() {
        const searchContainer = document.getElementById('search-container');
        if (searchContainer) searchContainer.style.display = 'none';
    }

    function loadRunningTasks(offset = 0, searchTerm = '') {
        showTaskLoading();
        const options = { 
            limit: 20, 
            offset: offset,
            ...(searchTerm && { searchTerm })
        };
        vscode.postMessage({ 
            command: 'retrieveRunningTasks',
            data: options
        });
    }

    function loadWipTasks(offset = 0, searchTerm = '') {
        showTaskLoading();
        const options = { 
            limit: 20, 
            offset: offset,
            ...(searchTerm && { searchTerm })
        };
        vscode.postMessage({ 
            command: 'retrieveWipTasks',
            data: options
        });
    }

    function loadArchivedTasks(offset = 0, searchTerm = '') {
        showTaskLoading();
        const options = { 
            limit: 20, 
            offset: offset,
            ...(searchTerm && { searchTerm })
        };
        vscode.postMessage({ 
            command: 'retrieveArchivedTasks',
            data: options
        });
    }

    function performSearch(searchTerm) {
        console.log('Performing search for:', searchTerm);
        const activeTab = getActiveTaskTab();
        if (activeTab === 'wip') {
            loadWipTasks(0, searchTerm);
        } else if (activeTab === 'archived') {
            loadArchivedTasks(0, searchTerm);
        } else {
            loadRunningTasks(0, searchTerm);
        }
    }

    function autoLoadDefaultTaskList() {
        console.log('Auto-loading default task list...');
        // Check if AWS is connected before auto-loading
        if (!currentState.awsStatus || !currentState.awsStatus.connected) {
            console.log('AWS not connected, skipping auto-load');
            return;
        }
        
        // Check if tasks are already loaded to avoid unnecessary reloading
        const taskList = document.getElementById('task-list');
        const taskEmptyState = document.getElementById('task-empty-state');
        const hasExistingTasks = taskList && taskList.children.length > 0 && taskList.style.display !== 'none';
        
        if (hasExistingTasks) {
            console.log('Tasks already loaded, skipping auto-load');
            return;
        }
        
        // Set Tickets List as active by default
        const wipBtn = document.getElementById('retrieve-wip-btn');
        const runningBtn = document.getElementById('running-tasks-btn');
        
        if (wipBtn && runningBtn) {
            // Remove active from both buttons first
            wipBtn.classList.remove('active');
            runningBtn.classList.remove('active');
            // Set running as active
            runningBtn.classList.add('active');
        }
        
        // Update the title
        const taskListTitle = document.getElementById('task-list-title');
        if (taskListTitle) {
            taskListTitle.textContent = 'Tickets List';
        }
        
        // Load the running tasks
        loadRunningTasks();
    }

    function checkAndAutoLoadTasks() {
        // Check if user is currently on My Task List tab
        const myTaskListTab = document.querySelector('[data-tab="devsecops-hub"]');
        const myTaskListContent = document.getElementById('devsecops-hub');
        
        if (myTaskListTab && myTaskListContent && 
            myTaskListTab.classList.contains('active') && 
            myTaskListContent.classList.contains('active')) {
            console.log('User is on My Task List tab and AWS is connected, auto-loading tasks...');
            autoLoadDefaultTaskList();
        }
    }

    function getActiveTaskTab() {
        const wipBtn = document.getElementById('retrieve-wip-btn');
        const runningBtn = document.getElementById('running-tasks-btn');
        const archivedBtn = document.getElementById('archived-tasks-btn');
        
        if (wipBtn?.classList.contains('active')) {
            return 'wip';
        } else if (archivedBtn?.classList.contains('active')) {
            return 'archived';
        } else if (runningBtn?.classList.contains('active')) {
            return 'running';
        }
        return 'running'; // default
    }

    function displayTaskList(tasks, taskType, pagination = null) {
        console.log(`Displaying ${tasks.length} ${taskType} tasks:`, tasks);
        hideTaskLoading();
        
        // Store current state
        currentState.currentTaskList = tasks;
        currentState.pagination = pagination;
        currentState.currentTaskType = taskType; // Track which task list is currently displayed
        
        const taskCount = document.getElementById('task-count');
        const taskEmptyState = document.getElementById('task-empty-state');
        const taskList = document.getElementById('task-list');
        const paginationControls = document.getElementById('pagination-controls');

        // Update task count
        if (taskCount) {
            if (pagination && pagination.totalCount > 0) {
                const startRecord = pagination.currentOffset + 1;
                const endRecord = Math.min(pagination.currentOffset + tasks.length, pagination.totalCount);
                taskCount.textContent = `${startRecord}-${endRecord} of ${pagination.totalCount} tasks`;
            } else {
                taskCount.textContent = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
            }
        }

        if (tasks.length === 0) {
            // Show empty state
            if (taskEmptyState) {
                const searchText = pagination?.searchTerm ? ` matching "${pagination.searchTerm}"` : '';
                taskEmptyState.innerHTML = `<p>No ${taskType === 'wip' ? 'WIP' : 'running'} tasks found${searchText}.</p>`;
                taskEmptyState.style.display = 'block';
            }
            if (taskList) taskList.style.display = 'none';
            if (paginationControls) paginationControls.style.display = 'none';
            return;
        }

        // Hide empty state and show task list
        if (taskEmptyState) taskEmptyState.style.display = 'none';
        if (taskList) {
            taskList.style.display = 'block';
            taskList.innerHTML = tasks.map(task => createTaskItemHTML(task, taskType)).join('');
            
            // Add event listeners to task action buttons (for both WIP and running tasks)
            addTaskActionListeners();
        }

        // Update pagination controls
        if (pagination && paginationControls) {
            updatePaginationControls(pagination);
            paginationControls.style.display = 'flex';
        } else if (paginationControls) {
            paginationControls.style.display = 'none';
        }
    }

    function updatePaginationControls(pagination) {
        const prevBtn = document.getElementById('prev-page-btn');
        const nextBtn = document.getElementById('next-page-btn');
        const paginationInfo = document.getElementById('pagination-info');

        if (prevBtn) {
            prevBtn.disabled = pagination.currentOffset === 0;
        }

        if (nextBtn) {
            nextBtn.disabled = !pagination.hasMore;
        }

        if (paginationInfo) {
            const currentPage = Math.floor(pagination.currentOffset / pagination.currentLimit) + 1;
            const totalPages = Math.ceil(pagination.totalCount / pagination.currentLimit);
            const searchText = pagination.searchTerm ? ` (filtered)` : '';
            paginationInfo.textContent = `Page ${currentPage} of ${totalPages}${searchText}`;
        }
    }

    function createTaskItemHTML(task, taskType = 'running') {
        const ticketNumber = extractTicketNumber(task.Jira_Link__c);
        const description = task.Description__c || 'No description available';
        const truncatedDescription = description.length > 100 ? description.substring(0, 100) + '...' : description;
        
        // Show different action buttons based on task type
        let actionButtonsHTML = '';
        if (taskType === 'wip') {
            // WIP tasks: Edit, Delete, Done buttons
            actionButtonsHTML = `
                <div class="task-actions">
                    <button class="task-action-btn edit" data-action="edit" data-task-id="${task.Id}" data-task-data='${JSON.stringify(task).replace(/'/g, "&apos;")}'>
                        Edit
                    </button>
                    <button class="task-action-btn delete" data-action="delete" data-task-id="${task.Id}" data-task-name="${task.Name}">
                        Delete
                    </button>
                    <button class="task-action-btn cleanup" data-action="cleanup" data-task-id="${task.Id}" data-task-name="${task.Name}">
                        Done
                    </button>
                </div>`;
        } else if (taskType === 'archived') {
            // Done tasks: View button only (read-only, no restore)
            actionButtonsHTML = `
                <div class="task-actions">
                    <button class="task-action-btn view" data-action="view" data-task-id="${task.Id}" data-task-data='${JSON.stringify(task).replace(/'/g, "&apos;")}'>
                        View
                    </button>
                </div>`;
        } else {
            // Running tasks: View button only (read-only)
            actionButtonsHTML = `
                <div class="task-actions">
                    <button class="task-action-btn view" data-action="view" data-task-id="${task.Id}" data-task-data='${JSON.stringify(task).replace(/'/g, "&apos;")}'>
                        View
                    </button>
                </div>`;
        }
        
        return `
            <div class="task-item" data-task-id="${task.Id}">
                <div class="task-main-content">
                    <div class="task-header">
                        <h4 class="task-name">${task.Name}</h4>
                        <span class="task-ticket">${ticketNumber}</span>
                    </div>
                    <p class="task-description">${truncatedDescription}</p>
                    <div class="task-meta">
                        <span class="task-status ${getStatusClass(task.Status__c)}">${task.Status__c || 'Unknown'}</span>
                        <span class="task-type ${getTypeClass(task.Type__c)}">${task.Type__c || 'Unknown'}</span>
                        ${task.Estimated_Effort_Hours__c ? `<span class="task-effort">${task.Estimated_Effort_Hours__c}h</span>` : ''}
                    </div>
                </div>
                ${actionButtonsHTML}
            </div>
        `;
    }

    function extractTicketNumber(jiraLink) {
        if (!jiraLink) return 'N/A';
        // Future-proof pattern supporting GAI-572, DEVSECOPS-12208, ABC123-999, etc.
        const match = jiraLink.match(/\/browse\/([A-Z0-9]+-\d+)/i);
        return match ? match[1] : 'N/A';
    }

    function getStatusClass(status) {
        if (!status) return '';
        const statusLower = status.toLowerCase().replace(/\s+/g, '-');
        return statusLower;
    }

    function getTypeClass(type) {
        if (!type) return '';
        return type.toLowerCase();
    }

    function addTaskActionListeners() {
        const actionButtons = document.querySelectorAll('.task-action-btn');
        
        actionButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const action = button.getAttribute('data-action');
                const taskId = button.getAttribute('data-task-id');
                const taskName = button.getAttribute('data-task-name');
                const description = button.getAttribute('data-description');
                
                // For edit and view actions, use full task data if available
                let taskData = {
                    taskId,
                    taskName,
                    description
                };
                
                switch (action) {
                    case 'edit':
                        // Get full task data from data-task-data attribute
                        const editTaskDataAttr = button.getAttribute('data-task-data');
                        if (editTaskDataAttr && editTaskDataAttr.trim() !== '') {
                            try {
                                taskData = JSON.parse(editTaskDataAttr.replace(/&apos;/g, "'"));
                                console.log('Edit with full task data:', taskData);
                            } catch (error) {
                                console.error('Error parsing task data for edit:', error, editTaskDataAttr);
                            }
                        } else {
                            console.warn('No full task data found for edit button, using basic data');
                        }
                        vscode.postMessage({ 
                            command: 'editTask', 
                            data: taskData 
                        });
                        break;
                    case 'delete':
                        vscode.postMessage({ 
                            command: 'deleteTask', 
                            data: taskData 
                        });
                        break;
                    case 'cleanup':
                        vscode.postMessage({ 
                            command: 'cleanupTask', 
                            data: taskData 
                        });
                        break;
                    case 'view':
                        const taskDataAttr = button.getAttribute('data-task-data');
                        if (taskDataAttr && taskDataAttr.trim() !== '') {
                            try {
                                const fullTaskData = JSON.parse(taskDataAttr.replace(/&apos;/g, "'"));
                                if (fullTaskData && fullTaskData.Id && fullTaskData.Name) {
                                    showTaskViewModal(fullTaskData);
                                } else {
                                    console.warn('Invalid task data for view modal:', fullTaskData);
                                }
                            } catch (error) {
                                console.error('Error parsing task data:', error, taskDataAttr);
                            }
                        } else {
                            console.warn('No task data attribute found for view button');
                        }
                        break;
                }
            });
        });
    }

    function handleTaskActionResult(result, action) {
        if (result.success) {
            // For cleanup action, remove the task from the UI immediately
            if (action === 'cleanup') {
                // Find and remove the task item from the UI
                const currentTaskItems = document.querySelectorAll('.task-item');
                currentTaskItems.forEach(item => {
                    const taskId = item.getAttribute('data-task-id');
                    if (taskId === result.taskId) {
                        item.remove();
                        // Update task count
                        const taskCount = document.getElementById('task-count');
                        const remainingTasks = document.querySelectorAll('.task-item').length;
                        if (taskCount) {
                            taskCount.textContent = `${remainingTasks} task${remainingTasks !== 1 ? 's' : ''}`;
                        }
                        
                        // Show empty state if no tasks remain
                        if (remainingTasks === 0) {
                            const taskEmptyState = document.getElementById('task-empty-state');
                            const taskList = document.getElementById('task-list');
                            if (taskEmptyState) {
                                taskEmptyState.innerHTML = '<p>No tasks remaining in the list.</p>';
                                taskEmptyState.style.display = 'block';
                            }
                            if (taskList) taskList.style.display = 'none';
                        }
                    }
                });
            } else if (action === 'delete') {
                // For delete action, reload the current task list
                const activeTab = document.querySelector('.task-nav-buttons .secondary-button.active');
                if (activeTab) {
                    activeTab.click();
                }
            }
        }
    }

    // Message handling from extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'updateAWSStatus':
                updateAWSStatus(message.data);
                break;
            case 'updateEnhancedAWSStatus':
                updateEnhancedAWSStatus(message.data);
                break;
            case 'updateEstimationData':
                updateEstimationData(message.data);
                break;
            case 'showEstimationNotification':
                // showEstimationNotification(message.data); // Disabled - user doesn't want popup
                break;
            case 'updateJiraStatus':
                showJiraUpdateResult(message.data);
                break;

            case 'awsStatusResponse':
                updateAWSStatus(message.data);
                break;
            case 'enhancedAWSStatusResponse':
                updateEnhancedAWSStatus(message.data);
                break;
            case 'estimationDataResponse':
                updateEstimationData(message.data);
                break;
            case 'feedbackResult':
                showFeedbackResult(message.data);
                // Clear form and reset state ONLY on successful submission
                if (message.data.success) {
                    // Add delay to allow user to see the success message and click JIRA link
                    setTimeout(() => {
                        clearFeedbackForm();
                    }, 8000); // 8 second delay to show success message
                }
                // On failure, keep the form data so user can fix and resubmit
                break;
            case 'initiativesLoaded':
                populateInitiativesDropdown(message.data);
                break;
            case 'initiativesError':
                handleInitiativesError(message.data);
                break;
            case 'epicsLoaded':
                populateEpicsDropdown(message.data);
                break;
            case 'sprintDetailsLoaded':
                populateSprintDetailsDropdown(message.data);
                // Auto-select recommended sprint if present
                const recommendedSprint = message.data.find(s => s.recommended);
                if (recommendedSprint) {
                    const sprintField = document.getElementById('jira-sprint');
                    if (sprintField) {
                        sprintField.value = recommendedSprint.id;
                        console.log(`Auto-selected recommended sprint: ${recommendedSprint.name}`);
                    }
                }
                break;
            case 'autoPopulationResult':
                console.log('Auto-population result received:', message.data);
                handleAutoPopulationResult(message.data);
                break;
            
            // Task List Messages
            case 'taskListLoaded':
                console.log('Task list loaded message received:', message.data);
                displayTaskList(message.data.tasks, message.data.taskType, message.data.pagination);
                break;
            case 'taskActionResult':
                console.log('Task action result received:', message.data);
                handleTaskActionResult(message.data.result, message.data.action);
                break;
            case 'showTaskEditForm':
                console.log('Show task edit form message received:', message.data);
                if (message.data && (message.data.taskId || message.data.Id)) {
                    showTaskEditModal(message.data);
                } else {
                    console.warn('Invalid task data received for edit form:', message.data);
                }
                break;
            case 'populateFromTaskMaster':
                console.log('TaskMaster data received:', message.data);
                populateFromTaskMaster(message.data);
                break;
            case 'taskMasterError':
                console.error('TaskMaster error received:', message.data);
                handleTaskMasterError(message.data.error);
                break;
            case 'duplicateTaskMasterCheck':
                console.log('Duplicate check result:', message.data);
                handleDuplicateCheckResult(message.data);
                break;
        }
    });

    // Handle duplicate check result and show confirmation dialog if needed
    function handleDuplicateCheckResult(result) {
        if (result.isDuplicate) {
            showDuplicateSubmissionDialog(result);
        } else {
            // No duplicate, proceed with submission
            submitFeedbackData(result.feedbackData);
        }
    }

    // Show duplicate submission confirmation dialog
    function showDuplicateSubmissionDialog(result) {
        // Extract Jira ticket ID from the previous submission - supports any project format
        let displayTicketId = result.previousSubmission.ticketId;
        if (result.previousSubmission.jiraUrl) {
            const jiraTicketMatch = result.previousSubmission.jiraUrl.match(/\/browse\/([A-Z0-9]+-\d+)/i);
            if (jiraTicketMatch) {
                displayTicketId = jiraTicketMatch[1]; // Extract GAI-572, DEVSECOPS-12208, etc. from URL
            }
        }

        const confirmed = confirm(`⚠️ Duplicate Submission Warning

Task "${result.previousSubmission.taskTitle}" was already submitted:
• Jira Ticket: ${displayTicketId}
• Submitted: ${new Date(result.previousSubmission.submittedAt).toLocaleDateString()}
• Epic: ${result.previousSubmission.epicId || 'N/A'}

Do you want to submit it again?`);

        if (confirmed) {
            // User confirmed, proceed with submission
            submitFeedbackData(result.feedbackData);
        } else {
            // User cancelled, show cancelled message with existing ticket info
            showFeedbackResult({
                success: false,
                message: 'Submission cancelled',
                error: 'Duplicate submission cancelled',
                existingTicketId: displayTicketId,
                existingJiraUrl: result.previousSubmission.jiraUrl
            });
        }
    }

    // Task Edit Modal Functions
    function setupTaskEditModal() {
        const modal = document.getElementById('task-edit-modal');
        const closeBtn = document.getElementById('close-edit-modal');
        const cancelBtn = document.getElementById('cancel-edit-btn');
        const saveBtn = document.getElementById('save-task-btn');
        const statusSelect = document.getElementById('edit-task-status');

        closeBtn?.addEventListener('click', hideTaskEditModal);
        cancelBtn?.addEventListener('click', hideTaskEditModal);
        
        // Close modal when clicking outside
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideTaskEditModal();
            }
        });

        saveBtn?.addEventListener('click', saveTaskUpdates);
        
        // Add status change listener to show/hide Done-related fields
        statusSelect?.addEventListener('change', function() {
            toggleDoneFields(this.value);
        });
        
        // Setup view modal listeners
        setupTaskViewModal();
    }

    function toggleDoneFields(status) {
        const deploymentDateGroup = document.getElementById('deployment-date-group');
        const actualHoursGroup = document.getElementById('actual-hours-group');
        const resolutionGroup = document.getElementById('resolution-group');
        
        const deploymentDateField = document.getElementById('edit-deployment-date');
        const actualHoursField = document.getElementById('edit-actual-hours');
        const resolutionField = document.getElementById('edit-resolution');
        
        const isDone = status === 'Done';
        
        // Show/hide the field groups
        if (deploymentDateGroup) deploymentDateGroup.style.display = isDone ? 'block' : 'none';
        if (actualHoursGroup) actualHoursGroup.style.display = isDone ? 'block' : 'none';
        if (resolutionGroup) resolutionGroup.style.display = isDone ? 'block' : 'none';
        
        // Set required attribute
        if (deploymentDateField) deploymentDateField.required = isDone;
        if (actualHoursField) actualHoursField.required = isDone;
        if (resolutionField) resolutionField.required = isDone;
        
        // Debug logging for auto-calculation
        console.log('toggleDoneFields - Debug Info:', {
            status: status,
            isDone: isDone,
            hasEditingTask: !!currentState.editingTask,
            hasCreatedDate: currentState.editingTask?.CreatedDate,
            createdDateValue: currentState.editingTask?.CreatedDate,
            hasActualHoursField: !!actualHoursField,
            actualHoursFieldValue: actualHoursField?.value,
            fieldIsEmpty: !actualHoursField?.value
        });
        
        // Auto-calculate actual hours when status changes to Done (only if field is empty)
        if (isDone && 
            currentState.editingTask && 
            currentState.editingTask.CreatedDate &&
            actualHoursField &&
            !actualHoursField.value) {
            
            console.log('✅ All conditions met - calling calculateAndPopulateActualHours');
            calculateAndPopulateActualHours(currentState.editingTask.CreatedDate);
        } else if (isDone) {
            console.warn('⚠️ Auto-calculation skipped. Reason:', {
                noEditingTask: !currentState.editingTask,
                noCreatedDate: !currentState.editingTask?.CreatedDate,
                noActualHoursField: !actualHoursField,
                fieldNotEmpty: !!actualHoursField?.value
            });
        }
        
        console.log(`Status changed to: ${status}, Done fields ${isDone ? 'shown' : 'hidden'}`);
    }

    /**
     * Calculate actual working hours from task creation to now
     * Assuming 8 working hours per day (excluding weekends)
     * @param {string} createdDate - ISO 8601 date string from Salesforce
     */
    function calculateAndPopulateActualHours(createdDate) {
        const actualHoursField = document.getElementById('edit-actual-hours');
        
        // Safety check 1: Required elements exist
        if (!createdDate || !actualHoursField) {
            console.warn('Cannot calculate actual hours - missing data');
            return;
        }
        
        // Safety check 2: Don't overwrite existing manual values
        if (actualHoursField.value && actualHoursField.value.trim() !== '') {
            console.log('Actual hours already set, skipping auto-calculation');
            return;
        }
        
        try {
            const created = new Date(createdDate);
            const now = new Date();
            
            // Safety check 3: Valid date
            if (isNaN(created.getTime())) {
                throw new Error('Invalid CreatedDate format');
            }
            
            // Safety check 4: CreatedDate not in future
            if (created > now) {
                console.warn('CreatedDate is in the future, cannot calculate');
                return;
            }
            
            let businessHours = 0;
            let currentDate = new Date(created);
            
            const HOURS_PER_DAY = 8;
            const WORK_START_HOUR = 9;
            const WORK_END_HOUR = 17;
            
            // Safety check 5: Limit calculation to reasonable timeframe (e.g., 2 years)
            const MAX_DAYS = 730; // 2 years
            let daysProcessed = 0;
            
            while (currentDate < now && daysProcessed < MAX_DAYS) {
                const dayOfWeek = currentDate.getDay();
                
                // Skip weekends (0 = Sunday, 6 = Saturday)
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    const isFirstDay = currentDate.toDateString() === created.toDateString();
                    const isLastDay = currentDate.toDateString() === now.toDateString();
                    
                    if (isFirstDay || isLastDay) {
                        let startHour = WORK_START_HOUR;
                        let endHour = WORK_END_HOUR;
                        
                        if (isFirstDay) {
                            const createdHour = created.getHours() + (created.getMinutes() / 60);
                            startHour = Math.max(createdHour, WORK_START_HOUR);
                            startHour = Math.min(startHour, WORK_END_HOUR);
                        }
                        
                        if (isLastDay) {
                            const nowHour = now.getHours() + (now.getMinutes() / 60);
                            endHour = Math.min(nowHour, WORK_END_HOUR);
                            endHour = Math.max(endHour, WORK_START_HOUR);
                        }
                        
                        const hoursWorked = Math.max(0, endHour - startHour);
                        businessHours += hoursWorked;
                    } else {
                        businessHours += HOURS_PER_DAY;
                    }
                }
                
                currentDate.setDate(currentDate.getDate() + 1);
                currentDate.setHours(0, 0, 0, 0);
                daysProcessed++;
            }
            
            const actualHours = Math.round(businessHours * 2) / 2;
            actualHoursField.value = actualHours.toString();
            
            // Add helper text
            const existingHelper = document.getElementById('actual-hours-helper');
            if (existingHelper) {
                existingHelper.remove();
            }
            
            const helperText = document.createElement('small');
            helperText.id = 'actual-hours-helper';
            helperText.style.display = 'block';
            helperText.style.color = '#888';
            helperText.style.marginTop = '4px';
            helperText.style.fontSize = '11px';
            
            const workingDays = Math.ceil(businessHours / HOURS_PER_DAY);
            helperText.textContent = `Auto-calculated: ${actualHours} hours (${workingDays} working days) from ${created.toLocaleDateString()} to ${now.toLocaleDateString()}. Business hours: 9 AM - 5 PM, Mon-Fri. You can override this value.`;
            
            actualHoursField.parentElement.appendChild(helperText);
            
            console.log(`Auto-calculated actual hours: ${actualHours} hours (${workingDays} working days)`);
            console.log(`Created: ${created.toLocaleString()}`);
            console.log(`Now: ${now.toLocaleString()}`);
            
        } catch (error) {
            console.error('Error calculating actual hours:', error);
            // Fail gracefully - user can still enter manually
            if (actualHoursField) {
                actualHoursField.placeholder = 'Enter hours manually';
            }
        }
    }

    function setupTaskViewModal() {
        const modal = document.getElementById('task-view-modal');
        const closeBtn = document.getElementById('close-view-modal');
        const closeFooterBtn = document.getElementById('close-view-btn');

        closeBtn?.addEventListener('click', hideTaskViewModal);
        closeFooterBtn?.addEventListener('click', hideTaskViewModal);
        
        // Close modal when clicking outside
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideTaskViewModal();
            }
        });
    }

    function showTaskEditModal(taskData) {
        console.log('Showing edit modal for task:', taskData);
        console.log('🔍 Task CreatedDate check:', {
            hasCreatedDate: !!taskData.CreatedDate,
            createdDateValue: taskData.CreatedDate,
            taskDataKeys: Object.keys(taskData)
        });
        
        // Safeguard: Don't show modal if no valid task data
        if (!taskData || (!taskData.taskId && !taskData.Id)) {
            console.warn('No valid task data provided, not showing edit modal');
            return;
        }
        
        currentState.editingTask = taskData;
        
        // Store CreatedDate for actual hours calculation (IMPORTANT for auto-calculation)
        if (taskData.CreatedDate) {
            currentState.editingTask.CreatedDate = taskData.CreatedDate;
            console.log('✅ Task CreatedDate stored:', taskData.CreatedDate);
        } else {
            console.warn('❌ No CreatedDate found in task data - auto-calculation will not work');
        }
        
        // Populate form fields
        const fields = {
            'edit-task-id': taskData.taskId || taskData.Id,
            'edit-task-name': taskData.taskName || taskData.Name || '',
            'edit-task-description': taskData.description || taskData.Description__c || '',
            'edit-estimated-hours': taskData.Estimated_Effort_Hours__c || '',
            'edit-task-type': taskData.Type__c || 'Story',
            'edit-task-priority': taskData.Jira_Priority__c || 'Major-P3',
            'edit-work-type': taskData.Work_Type__c || '',
            'edit-task-status': taskData.Status__c || 'Backlog',
            'edit-acceptance-criteria': taskData.Jira_Acceptance_Criteria__c || '',
            'edit-actual-hours': taskData.Actual_Effort_Hours__c || '',
            'edit-resolution': taskData.Resolution__c || '',
            'edit-deployment-date': taskData.Deployment_Date__c || '',
            'edit-epic-id': taskData.Epic__c || ''
        };

        Object.entries(fields).forEach(([fieldId, value]) => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = value || '';
            }
        });

        // Handle checkbox field for AI-Adopted (default to true)
        const aiAdoptedField = document.getElementById('edit-ai-adopted');
        if (aiAdoptedField) {
            // If taskData has AI_Adopted__c, use it; otherwise default to true
            aiAdoptedField.checked = taskData.AI_Adopted__c !== undefined ? taskData.AI_Adopted__c : true;
        }

        // Set the estimation unit dropdown to "hours" by default since stored values are in hours
        const estimationUnitField = document.getElementById('edit-estimation-unit');
        if (estimationUnitField) {
            estimationUnitField.value = 'hours';
        }

        // Toggle Done fields based on current status
        toggleDoneFields(taskData.Status__c || 'Backlog');

        const modal = document.getElementById('task-edit-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    function hideTaskEditModal() {
        const modal = document.getElementById('task-edit-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        currentState.editingTask = null;
    }

    function showTaskViewModal(taskData) {
        console.log('Showing view modal for task:', taskData);
        
        // Safeguard: Don't show modal if no valid task data
        if (!taskData || (!taskData.Id && !taskData.taskId) || !taskData.Name) {
            console.warn('No valid task data provided for view modal:', taskData);
            return;
        }
        
        // Extract JIRA ticket number from link
        const jiraTicket = extractTicketNumber(taskData.Jira_Link__c);
        
        // Look up sprint name from ID if available
        let sprintName = 'Not specified';
        if (taskData.Jira_Sprint_Details__c && currentState.allSprints && currentState.allSprints.length > 0) {
            const sprint = currentState.allSprints.find(s => s.id === taskData.Jira_Sprint_Details__c);
            if (sprint) {
                sprintName = sprint.name;
            } else {
                // If we can't find the sprint name, show the ID
                sprintName = taskData.Jira_Sprint_Details__c;
            }
        }
        
        // Look up epic name from ID if available
        let epicName = 'Not specified';
        if (taskData.Epic__c && currentState.allEpics && currentState.allEpics.length > 0) {
            const epic = currentState.allEpics.find(e => e.id === taskData.Epic__c);
            if (epic) {
                epicName = `${epic.name}${epic.teamName ? ' (' + epic.teamName + ')' : ''}`;
            } else {
                // If we can't find the epic name, show the ID
                epicName = taskData.Epic__c;
            }
        }
        
        // Populate view fields
        const fields = {
            'view-task-name': taskData.Name || 'N/A',
            'view-jira-link': jiraTicket,
            'view-task-description': taskData.Description__c || 'No description available',
            'view-task-status': taskData.Status__c || 'Unknown',
            'view-task-type': taskData.Type__c || 'Unknown',
            'view-task-priority': taskData.Jira_Priority__c || 'Not specified',
            'view-work-type': taskData.Work_Type__c || 'Not specified',
            'view-jira-sprint': sprintName,
            'view-estimated-hours': taskData.Estimated_Effort_Hours__c ? `${taskData.Estimated_Effort_Hours__c} hours` : 'Not specified',
            'view-actual-hours': taskData.Actual_Effort_Hours__c ? `${taskData.Actual_Effort_Hours__c} hours` : 'Not specified',
            'view-acceptance-criteria': taskData.Jira_Acceptance_Criteria__c || 'Not specified',
            'view-resolution': taskData.Resolution__c || 'Not specified',
            'view-epic-id': epicName,
            'view-deployment-date': taskData.Deployment_Date__c ? new Date(taskData.Deployment_Date__c).toLocaleDateString() : 'Not specified',
            'view-ai-adopted': taskData.AI_Adopted__c !== undefined ? (taskData.AI_Adopted__c ? 'Yes' : 'No') : 'Yes'
        };

        Object.entries(fields).forEach(([fieldId, value]) => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.textContent = value || 'Not specified';
            }
        });

        const modal = document.getElementById('task-view-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    function hideTaskViewModal() {
        const modal = document.getElementById('task-view-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    function saveTaskUpdates() {
        const taskId = document.getElementById('edit-task-id')?.value;
        if (!taskId) {
            console.error('No task ID found');
            return;
        }

        const status = document.getElementById('edit-task-status')?.value;
        
        // Validate required fields when status is "Done"
        if (status === 'Done') {
            const deploymentDate = document.getElementById('edit-deployment-date')?.value;
            const actualHours = document.getElementById('edit-actual-hours')?.value;
            const resolution = document.getElementById('edit-resolution')?.value;
            
            if (!deploymentDate || !actualHours || !resolution) {
                alert('When status is "Done", Deployment Date, Actual Hours, and Jira Resolution are required!');
                return;
            }
        }

        // Get estimated hours and unit, then convert to hours
        const estimatedValue = parseFloat(document.getElementById('edit-estimated-hours')?.value);
        const estimatedUnit = document.getElementById('edit-estimation-unit')?.value || 'hours';
        const estimatedHoursConverted = estimatedValue ? convertToHours(estimatedValue, estimatedUnit) : undefined;

        const updates = {
            name: document.getElementById('edit-task-name')?.value,
            description: document.getElementById('edit-task-description')?.value,
            estimatedHours: estimatedHoursConverted,
            // type: document.getElementById('edit-task-type')?.value, // DO NOT SEND - Salesforce validation: "Jira Type Should Not Change"
            priority: document.getElementById('edit-task-priority')?.value,
            workType: document.getElementById('edit-work-type')?.value,
            status: status,
            acceptanceCriteria: document.getElementById('edit-acceptance-criteria')?.value,
            actualHours: parseFloat(document.getElementById('edit-actual-hours')?.value) || undefined,
            resolution: document.getElementById('edit-resolution')?.value,
            deploymentDate: document.getElementById('edit-deployment-date')?.value,
            aiAdopted: document.getElementById('edit-ai-adopted')?.checked,
            epicId: document.getElementById('edit-epic-id')?.value
        };

        // Remove undefined values
        Object.keys(updates).forEach(key => {
            if (updates[key] === undefined || updates[key] === '') {
                delete updates[key];
            }
        });

        console.log('Saving task updates:', taskId, updates);

        vscode.postMessage({
            command: 'saveTaskUpdates',
            data: { taskId, updates, taskType: currentState.currentTaskType }
        });

        hideTaskEditModal();
    }

    // Function to handle TaskMaster errors
    function handleTaskMasterError(errorMessage) {
        // Re-enable the import button
        const importBtn = document.getElementById('import-taskmaster-btn');
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.textContent = '📥 Import from TaskMaster';
        }
        
        // Hide task selection dropdown if visible
        const taskSelectionSection = document.getElementById('task-selection-section');
        if (taskSelectionSection) {
            taskSelectionSection.style.display = 'none';
        }
        
        // Show error message to user
        showImportResult({
            success: false,
            message: 'Failed to import TaskMaster data',
            error: errorMessage
        });
    }

    // Function to populate form from TaskMaster data
    function populateFromTaskMaster(taskDataArray) {
        try {
            // Re-enable the import button first
            const importBtn = document.getElementById('import-taskmaster-btn');
            if (importBtn) {
                importBtn.disabled = false;
                importBtn.textContent = '📥 Import from TaskMaster';
            }

            // Store tasks in state
            currentState.availableTasks = Array.isArray(taskDataArray) ? taskDataArray : [taskDataArray];
            
            const taskSelectionSection = document.getElementById('task-selection-section');
            const taskDropdown = document.getElementById('task-dropdown');
            
            if (currentState.availableTasks.length === 1) {
                // Single task - import directly and hide dropdown
                if (taskSelectionSection) {
                    taskSelectionSection.style.display = 'none';
                }
                populateSingleTask(currentState.availableTasks[0]);
                console.log(`TaskMaster task "${currentState.availableTasks[0].title}" imported successfully`);
            } else if (currentState.availableTasks.length > 1) {
                // Multiple tasks - show dropdown
                if (taskSelectionSection) {
                    taskSelectionSection.style.display = 'block';
                }
                
                // Populate dropdown
                if (taskDropdown) {
                    taskDropdown.innerHTML = '<option value="">Choose a task...</option>';
                    currentState.availableTasks.forEach((task, index) => {
                        const option = document.createElement('option');
                        option.value = index.toString();
                        option.textContent = `Task ${index + 1}: ${task.title}`;
                        taskDropdown.appendChild(option);
                    });
                }
                
                console.log(`Found ${currentState.availableTasks.length} tasks. Please select one to import.`);
            } else {
                throw new Error('No valid tasks found in TaskMaster file');
            }

        } catch (error) {
            console.error('Error populating form from TaskMaster:', error);
            
            // Re-enable button on error
            const importBtn = document.getElementById('import-taskmaster-btn');
            if (importBtn) {
                importBtn.disabled = false;
                importBtn.textContent = '📥 Import from TaskMaster';
            }
            
            // Hide dropdown on error
            const taskSelectionSection = document.getElementById('task-selection-section');
            if (taskSelectionSection) {
                taskSelectionSection.style.display = 'none';
            }
            
            showImportResult({
                success: false,
                message: 'Failed to load TaskMaster data',
                error: error.message
            });
        }
    }

    // Function to populate form with a single task
    function populateSingleTask(taskData) {
        // Store current imported task for duplicate checking
        currentState.currentImportedTask = taskData;
        
        // Get all form fields
        const nameField = document.getElementById('feedback-name');
        const descriptionField = document.getElementById('feedback-description');
        const estimatedHoursField = document.getElementById('estimated-hours');
        const typeField = document.getElementById('feedback-type');
        const acceptanceCriteriaField = document.getElementById('acceptance-criteria');
        const workTypeField = document.getElementById('work-type');
        const jiraPriorityField = document.getElementById('jira-priority');
        const initiativeField = document.getElementById('initiative');
        const epicField = document.getElementById('epic');
        
        // Clear all fields first to prevent stale data from previous imports
        if (nameField) nameField.value = '';
        if (descriptionField) descriptionField.value = '';
        if (estimatedHoursField) estimatedHoursField.value = '';
        if (typeField) typeField.value = '';
        if (acceptanceCriteriaField) acceptanceCriteriaField.value = '';
        if (workTypeField) workTypeField.value = '';
        if (jiraPriorityField) jiraPriorityField.value = '';
        
        // Reset initiative and epic dropdowns to default state
        if (initiativeField) initiativeField.selectedIndex = 0;
        if (epicField) epicField.selectedIndex = 0;
        
        // Now populate with task data (only fields that have values)
        if (nameField && taskData.title) nameField.value = taskData.title;
        if (descriptionField && taskData.description) descriptionField.value = taskData.description;
        if (estimatedHoursField && taskData.estimation) estimatedHoursField.value = taskData.estimation;
        
        // Handle type field - capitalize first letter to match dropdown options
        if (typeField && taskData.type) {
            const typeValue = taskData.type.charAt(0).toUpperCase() + taskData.type.slice(1).toLowerCase();
            typeField.value = typeValue;
            
            // Trigger change event to show/hide acceptance criteria
            typeField.dispatchEvent(new Event('change'));
        }
        
        // Handle acceptance criteria for story type (case-insensitive check)
        if (acceptanceCriteriaField && taskData.type && taskData.type.toLowerCase() === 'story' && taskData.acceptanceCriteria) {
            // Handle both array and string formats
            if (Array.isArray(taskData.acceptanceCriteria)) {
                // Convert array to numbered list
                acceptanceCriteriaField.value = taskData.acceptanceCriteria.map((criteria, index) => `${index + 1}. ${criteria}`).join('\n');
            } else {
                acceptanceCriteriaField.value = taskData.acceptanceCriteria;
            }
        }

        // Handle work type if available - only populate if field exists in task data
        if (workTypeField && taskData.workType !== undefined && taskData.workType !== null && taskData.workType !== '') {
            // Normalize the work type value to match dropdown options
            const workTypeMapping = {
                'new functionality/ feature': 'New Functionality / Feature',
                'new functionality / feature': 'New Functionality / Feature',
                'rtb': 'RTB',
                'enabler/ innovation': 'Enabler / Innovation',
                'enabler / innovation': 'Enabler / Innovation',
                'quality': 'Quality'
            };
            const normalizedWorkType = workTypeMapping[taskData.workType.toLowerCase()] || taskData.workType;
            workTypeField.value = normalizedWorkType;
        }

        // Handle JIRA priority if available - only populate if field exists in task data
        if (jiraPriorityField && taskData.priority !== undefined && taskData.priority !== null && taskData.priority !== '') {
            // Priority values in JSON should match exactly: Severe-P1, Critical-P2, Major-P3, Minor-P4
            // But also handle legacy formats for backward compatibility
            const priorityMapping = {
                'severe-p1': 'Severe-P1',
                'critical-p2': 'Critical-P2',
                'major-p3': 'Major-P3',
                'minor-p4': 'Minor-P4',
                'severe': 'Severe-P1',
                'critical': 'Critical-P2',
                'major': 'Major-P3',
                'minor': 'Minor-P4',
                'high': 'Critical-P2',
                'medium': 'Major-P3',
                'low': 'Minor-P4'
            };
            const mappedPriority = priorityMapping[taskData.priority.toLowerCase()] || taskData.priority;
            jiraPriorityField.value = mappedPriority;
        }

        // Handle Initiative dropdown auto-population if available
        if (initiativeField && taskData.initiative !== undefined && taskData.initiative !== null && taskData.initiative !== '') {
            let matchFound = false;
            const jsonInitiative = taskData.initiative.trim();
            
            console.log(`Looking for initiative match for: "${jsonInitiative}"`);
            
            // First pass: Try exact match (case-insensitive, whitespace normalized)
            for (let i = 0; i < initiativeField.options.length; i++) {
                const option = initiativeField.options[i];
                const optionText = option.text.trim();
                const optionValue = option.value.trim();
                
                // Normalize both strings for comparison (case-insensitive, normalized whitespace)
                const normalizedOption = optionText.toLowerCase().replace(/\s+/g, ' ');
                const normalizedJsonValue = jsonInitiative.toLowerCase().replace(/\s+/g, ' ');
                const normalizedOptionValue = optionValue.toLowerCase().replace(/\s+/g, ' ');
                
                console.log(`Checking option ${i}: "${optionText}" (normalized: "${normalizedOption}")`);
                
                if (normalizedOption === normalizedJsonValue || normalizedOptionValue === normalizedJsonValue) {
                    initiativeField.selectedIndex = i;
                    initiativeField.dispatchEvent(new Event('change'));
                    matchFound = true;
                    console.log(`✅ Initiative exact match: "${jsonInitiative}" → "${optionText}"`);
                    break;
                }
            }
            
            // Second pass: ONLY if no exact match found, try very conservative partial matching
            if (!matchFound) {
                console.log(`No exact match found, trying conservative partial matching...`);
                let bestMatch = { index: -1, score: 0, optionText: '' };
                
                for (let i = 0; i < initiativeField.options.length; i++) {
                    const option = initiativeField.options[i];
                    const optionText = option.text.toLowerCase().trim();
                    const initiativeText = jsonInitiative.toLowerCase().trim();
                    
                    // Skip empty options and default options
                    if (!optionText || 
                        optionText === 'select initiative...' || 
                        optionText === 'loading initiatives...' ||
                        optionText === 'no initiatives available' ||
                        optionText === 'connect to aws to load initiatives') {
                        continue;
                    }
                    
                    let score = 0;
                    
                    // VERY conservative partial matching - only if JSON is much longer than option
                    if (initiativeText.includes(optionText) && optionText.length >= 6) {
                        // Only match if the option is reasonably long and takes up less than 60% of the JSON text
                        const ratio = optionText.length / initiativeText.length;
                        if (ratio < 0.6) {
                            score = optionText.length * ratio; // Much lower score than before
                            console.log(`Potential partial match: "${optionText}" in "${initiativeText}" (ratio: ${ratio}, score: ${score})`);
                        }
                    }
                    
                    // Update best match if this score is higher
                    if (score > bestMatch.score) {
                        bestMatch = { index: i, score: score, optionText: option.text };
                    }
                }
                
                // Only apply partial match if score is very high (much more conservative)
                if (bestMatch.score > 10) {
                    initiativeField.selectedIndex = bestMatch.index;
                    initiativeField.dispatchEvent(new Event('change'));
                    matchFound = true;
                    console.log(`⚠️ Initiative partial match: "${jsonInitiative}" → "${bestMatch.optionText}" (score: ${bestMatch.score})`);
                }
            }
            
            // Log result for debugging
            if (!matchFound) {
                console.log(`❌ No matching initiative found for: "${jsonInitiative}"`);
                console.log(`Available options:`, Array.from(initiativeField.options).map((opt, i) => `${i}: "${opt.text}"`));
            }
        }
        
        // Trigger auto-population from Git after populating task data
        console.log('Task populated, triggering auto-population from Git...');
        autoPopulateFromGit();
    }

    // Auto-populate Initiative and Epic from Git repository
    function autoPopulateFromGit() {
        console.log('Triggering auto-population from Git repository...');
        vscode.postMessage({ command: 'autoPopulateFromGit' });
    }

    // Handle auto-population result
    function handleAutoPopulationResult(data) {
        console.log('Auto-population result received:', data);
        
        const initiativeField = document.getElementById('initiative');
        const epicField = document.getElementById('epic');
        const sprintField = document.getElementById('jira-sprint');
        const autoPopulateBadge = document.getElementById('auto-populate-badge');
        
        if (!data.success) {
            console.log('Auto-population failed:', data.fallbackReason);
            // Fall back to manual selection - load dropdowns normally
            if (currentState.awsStatus && currentState.awsStatus.status === 'connected') {
                vscode.postMessage({ command: 'loadInitiatives' });
                vscode.postMessage({ command: 'loadEpics' });
                vscode.postMessage({ command: 'loadSprintDetails' });
            }
            return;
        }
        
        console.log(`Auto-population successful: ${data.repoName} → ${data.applicationName}`);
        
        // Populate initiative dropdown
        if (data.initiatives && data.initiatives.length > 0) {
            populateInitiativesDropdown(data.initiatives);
            
            // Auto-select recommended initiative
            if (data.recommendedInitiativeId && initiativeField) {
                initiativeField.value = data.recommendedInitiativeId;
                initiativeField.dispatchEvent(new Event('change'));
                console.log(`Auto-selected initiative: ${data.recommendedInitiativeName}`);
            }
        }
        
        // Populate epic dropdown
        if (data.epics && data.epics.length > 0) {
            populateEpicsDropdown(data.epics);
            console.log(`Populated ${data.epics.length} epics`);
        }
        
        // Populate sprint dropdown
        if (data.sprints && data.sprints.length > 0) {
            populateSprintDetailsDropdown(data.sprints);
            console.log(`Populated ${data.sprints.length} sprints`);
            
            // Auto-select recommended sprint
            if (data.recommendedSprintId && sprintField) {
                sprintField.value = data.recommendedSprintId;
                console.log(`Auto-selected sprint: ${data.recommendedSprintName}`);
            }
        }
        
        // Show success badge
        if (autoPopulateBadge) {
            autoPopulateBadge.textContent = `✓ Auto-populated from repository: ${data.repoName}`;
            autoPopulateBadge.style.display = 'inline-block';
            autoPopulateBadge.style.color = '#4caf50';
            autoPopulateBadge.style.fontSize = '12px';
            autoPopulateBadge.style.marginLeft = '8px';
        }
    }

    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();