---
description: Detect and flag secrets or sensitive information in Jenkins pipeline code, and provide secure handling recommendations based on best practices.
mode: ask
model: 
tools: [code_scan, secret_scan, recommendations]
inputVariables: [pipeline_code, technology_stack, integration_points]
---

# Jenkins Pipeline Effort Estimation Template

## Task Information
**Type**: [ ] User Story [ ] Bug Fix [ ] Feature [ ] Enhancement  
**Title**: _[Brief description of the pipeline requirement]_  
**Technology Stack**: _[e.g., Golang, Python, Frontend, Salesforce, etc.]_  
**Complexity**: [ ] Simple [ ] Medium [ ] Complex  
**Requestor**: _[Team/Person requesting]_  
**Due Date**: _[If applicable]_  

## Quality, Security, Performance Requirements

### Quality Standards
- [ ] No code duplication - leverage existing utility modules
- [ ] No code smells - follow established LCP patterns  
- [ ] Implement proper abstraction and DRY principles
- [ ] Create reusable functions for common operations
- [ ] Proper error handling patterns and clear separation of concerns

### Security Requirements  
- [ ] Careful usage of credentials in Jenkins
- [ ] Use Jenkins built-in credential store
- [ ] Avoid hardcoded passwords or tokens
- [ ] Implement proper secret masking in logs
- [ ] Include mandatory security scans (SCA, secrets scanning)
- [ ] Follow principle of least privilege for access

### Performance Requirements
- [ ] Feedback time must be less than 3 minutes
- [ ] Implement parallel processing where applicable
- [ ] Optimize API calls and deployment strategies
- [ ] Efficient Docker image handling
- [ ] Optimized SonarQube and test execution

---

## Development Phases & Effort Estimation

### 1. Requirements Analysis
**Estimated Time**: [ ] 0.5 hrs [ ] 1 hr [ ] 1.5 hrs [ ] 2 hrs

**Tasks:**
- [ ] Pipeline scope definition and requirements gathering
- [ ] Identify integration points (SonarQube, ECR, Quay, etc.)
- [ ] Determine branch strategy and deployment environments  
- [ ] Review existing pipeline patterns for reusability
- [ ] Document specific requirements and constraints

**Notes**: _[Add any specific requirement considerations]_

---

### 2. Design & Planning  
**Estimated Time**: [ ] 1 hr [ ] 2 hrs [ ] 3 hrs [ ] 4 hrs

**Tasks:**
- [ ] Pipeline architecture design following LCP standards
- [ ] Stage sequence planning (security scans, build, test, deploy)
- [ ] Credential management strategy
- [ ] Error handling and notification approach
- [ ] Performance optimization planning
- [ ] Integration with existing shared library modules

**Notes**: _[Add design considerations and decisions]_

---

### 3. Implementation
**Estimated Time Based on Complexity:**
- [ ] **Simple** (2-4 hours): Basic build pipeline using existing patterns
- [ ] **Medium** (4-8 hours): Custom stages, parameter handling, conditional logic  
- [ ] **Complex** (8-16 hours): Multi-technology stack, parallel execution, advanced integrations

**Implementation Checklist:**
- [ ] Code reuse from existing utility modules (buildUtils, codeQualityUtils, etc.)
- [ ] Follow established patterns from similar pipelines
- [ ] Implement proper error handling with catchError blocks
- [ ] Include comprehensive logging and stage tracking
- [ ] Proper credential binding using Jenkins credential store
- [ ] Secure handling of tokens and API keys
- [ ] Parallel stage execution where applicable
- [ ] Agent selection for optimal performance

**Notes**: _[Implementation-specific notes and decisions]_

---

### 4. Testing & Validation
**Estimated Time**: [ ] 1 hr [ ] 2 hrs [ ] 3 hrs [ ] 4 hrs

**Tasks:**
- [ ] Pipeline syntax validation
- [ ] Test execution on development branches
- [ ] Credential and integration testing
- [ ] Performance benchmarking (verify <3 min feedback time)
- [ ] Error scenario testing
- [ ] Security scan validation
- [ ] End-to-end pipeline testing

**Notes**: _[Testing approach and validation criteria]_

---

### 5. Documentation & Handover
**Estimated Time**: [ ] 0.5 hrs [ ] 1 hr [ ] 1.5 hrs [ ] 2 hrs

**Tasks:**
- [ ] Pipeline documentation and usage instructions
- [ ] Update copilot-instructions.md if needed
- [ ] Team knowledge transfer if required
- [ ] Create runbook for troubleshooting
- [ ] Document any new patterns or utilities created

**Notes**: _[Documentation requirements and handover plan]_

---

## Total Effort Calculation

| Phase | Estimated Hours |
|-------|----------------|
| Requirements Analysis | ___ |
| Design & Planning | ___ |
| Implementation | ___ |
| Testing & Validation | ___ |
| Documentation & Handover | ___ |
| **Subtotal** | **___** |

### Complexity-Based Baseline Estimates:
- [ ] **Simple Pipeline**: 4-12 hours (0.5-1.5 days)
- [ ] **Medium Pipeline**: 8-20 hours (1-2.5 days)  
- [ ] **Complex Pipeline**: 12-28 hours (1.5-3.5 days)

---

## Risk Assessment & Buffers

**Risk Factors** (Check all that apply):
- [ ] Complex credential management requirements (+20%)
- [ ] Multiple technology stack integration (+30%)
- [ ] Custom security or compliance requirements (+25%)
- [ ] Performance optimization challenges (+20%)
- [ ] Integration with new external services (+40%)
- [ ] Unclear or changing requirements (+50%)
- [ ] Tight deadline constraints (+30%)

**Risk Buffer**: ___% (recommended: 20-50%)  
**Final Estimate**: ___ hours (___ days)

---

## Additional Notes & Considerations
_[Any other factors, dependencies, or special requirements]_

---

## Approval & Sign-off
**Estimated by**: _[Name]_  
**Date**: _[Date]_  
**Reviewed by**: _[Name]_  
**Approved by**: _[Name]_  

---

## Example Usage
"Estimate effort for creating a new Golang service pipeline with ECR deployment, SonarQube integration, and E2E testing capabilities following LCP standards."
