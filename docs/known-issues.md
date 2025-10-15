# Spec Driven Development - Documentation

## 🐛 Known Issues

### Issue: .spec-driven-files Addition to Workspace

**Status**: Design Decision (Not a Bug)  
**Date Documented**: October 15, 2025  

#### Current Implementation
All resource files (Instructions, Prompts, MCP configs, How-To Guides) are physically copied to the workspace under the `.spec-driven-files/` directory.

#### Approaches Evaluated

1. **Internal Extension Resources**
   - Resources stored within extension directory
   - Workspace accesses files internally via API
   - ❌ **Rejected**: GitHub Copilot cannot access extension-internal files

2. **VS Code Virtual File System**
   - Resources added as virtual files to workspace
   - Files exist in memory but not on disk
   - ❌ **Rejected**: GitHub Copilot requires physical files for content analysis

#### Design Decision
**Current approach (physical file copy) maintained** because GitHub Copilot requires files to be physically present in the workspace to utilize their content. Virtual or extension-internal files are ignored by Copilot even when explicitly mentioned in prompts.

#### Future Considerations
- Monitor GitHub Copilot API updates for virtual file system support

---
## 📋 Action Items

### Priority: High
- [ ] **Implement WIP Limit Configuration**
  - **Description**: Add configurable Work-in-Progress limit (default: 2) to prevent overloading active features
  - **Assigned To**: Development Team
  - **Status**: Not Started
  - **Due Date**: TBD
  - **Notes**: WIP limit should be user-configurable through extension settings

- [ ] **Create Configuration Module (config.ts)**
  - **Description**: Centralize all URL variables and configuration data in a dedicated config.ts file
  - **Assigned To**: Development Team
  - **Status**: Not Started
  - **Due Date**: TBD
  - **Notes**: Single source of truth for all environment URLs and configuration parameters

- [ ] **TaskManager PRD Integration**
  - **Description**: Integrate Product Requirements Document (PRD) data into TaskManager to auto-populate feature creation in Manage Features tab
  - **Assigned To**: Development Team
  - **Status**: Not Started
  - **Due Date**: TBD
  - **Notes**: Streamline feature creation workflow by leveraging existing PRD data 