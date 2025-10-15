---
description: Software development effort estimation template with comprehensive requirements analysis, risk assessment and best practices for accurate project planning and resource allocation
mode: agent
model: 
tools: [effort_calculator, risk_assessor, time_tracker]
inputVariables: [team_size, complexity_level, timeline_constraints, risk_factors]
---

This prompt depends on [software.requirements.instructions.md](../instructions/software.requirements.instructions.md).  

# Software Development Effort Estimation Template
A comprehensive template for estimating software development effort, incorporating best practices, risk assessment, and detailed breakdowns to ensure accurate project planning and resource allocation.

## Development Phases & Effort Estimation

### 1. Requirements Analysis & Discovery
**Estimated Time**: [ ] 0.5 hrs [ ] 1 hr [ ] 1.5 hrs [ ] 2 hrs [ ] 4 hrs [ ] 1 day

**Tasks:**
- [ ] Requirement gathering and scope definition
- [ ] Stakeholder interviews and clarifications
- [ ] Identify integration points (APIs, databases, external services)
- [ ] Define branch/versioning strategy
- [ ] Review existing components for reusability
- [ ] Document specific requirements and constraints
- [ ] Business objective alignment verification
- [ ] Acceptance criteria definition
- [ ] User persona and use case mapping
- [ ] Risk assessment and mitigation planning

**Additional Considerations:**
- [ ] Technical Dependencies: _[List any technical blockers or dependencies]_
- [ ] Business Constraints: _[Budget, timeline, resource limitations]_
- [ ] Assumptions: _[Key assumptions made during requirements gathering]_
- [ ] External Factors: _[Third-party services, vendor dependencies, approvals]_
- [ ] Success Metrics: _[How success will be measured]_

**Notes**: _[Add any specific considerations]_  

### 2. Design & Planning  
**Estimated Time**: [ ] 1 hr [ ] 2 hrs [ ] 3 hrs [ ] 4 hrs [ ] 1 day

**Tasks:**
- [ ] High-level architecture and component design
- [ ] Define data flows and system interactions
- [ ] Security and credential management approach
- [ ] Error handling, logging, and notification strategy
- [ ] Performance optimization strategy
- [ ] Reuse of shared modules or frameworks
- [ ] Database schema design and migration planning
- [ ] API design and documentation

**Notes**: _[Add design considerations]_  

### 3. Implementation
**Estimated Time Based on Complexity:**
- [ ] **Simple** (2-4 hours): Small feature or change with minimal integration
- [ ] **Medium** (4-8 hours): Custom modules, parameter handling, conditional logic
- [ ] **Complex** (8-16 hours): Multi-module system, advanced integrations, parallel processing
- [ ] **Very Complex** (16-32 hours): Large-scale system changes, multiple integrations, performance optimization

**Implementation Checklist:**
- [ ] Reuse existing utility functions and libraries
- [ ] Follow established coding and design patterns
- [ ] Comprehensive error handling and logging
- [ ] Secure handling of secrets and configuration
- [ ] Implement tests alongside development (TDD/BDD)
- [ ] Ensure performance-efficient code and queries
- [ ] Version control best practices (branching, PR reviews)
- [ ] Code documentation and comments for complex logic

**Notes**: _[Implementation-specific notes]_  

### 4. Testing & Validation
**Estimated Time**: [ ] 1 hr [ ] 2 hrs [ ] 3 hrs [ ] 4 hrs [ ] 1 day

**Tasks:**
- [ ] Unit testing and integration testing
- [ ] Functional and regression testing
- [ ] Performance/load testing (if required)
- [ ] Security validation and scans
- [ ] End-to-end testing across environments
- [ ] Error and edge case handling tests
- [ ] User acceptance testing coordination
- [ ] Test data preparation and cleanup

**Notes**: _[Testing approach and validation criteria]_  

### 5. Documentation & Handover
**Estimated Time**: [ ] 0.5 hrs [ ] 1 hr [ ] 1.5 hrs [ ] 2 hrs

**Tasks:**
- [ ] Update technical documentation and usage guides
- [ ] Update developer instructions (README, contributing guidelines)
- [ ] Knowledge transfer sessions (if required)
- [ ] Create troubleshooting/runbook documentation
- [ ] Document any new utilities or patterns created

**Notes**: _[Documentation and handover plan]_  

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
- [ ] **Simple Task**: 4-12 hours (0.5-1.5 days)
- [ ] **Medium Task**: 8-20 hours (1-2.5 days)
- [ ] **Complex Task**: 12-28 hours (1.5-3.5 days)
- [ ] **Very Complex Task**: 20-40 hours (2.5-5 days)

### Team Size Multipliers:
- [ ] **Solo Developer**: No adjustment
- [ ] **Small Team (2-3)**: +10-20% (coordination overhead)
- [ ] **Large Team (4+)**: +20-30% (communication complexity)  

## Risk Assessment & Buffers

**Risk Factors** (Check all that apply):
- [ ] Complex security or credential management (+20%)
- [ ] Multi-technology stack integration (+30%)
- [ ] Compliance or regulatory requirements (+25%)
- [ ] Performance optimization challenges (+20%)
- [ ] Integration with new external services (+40%)
- [ ] Unclear or changing requirements (+50%)
- [ ] Tight deadlines or dependencies (+30%)
- [ ] Legacy system integration (+35%)
- [ ] Large dataset migrations (+25%)
- [ ] Real-time/high-frequency processing (+30%)

**Risk Buffer**: ___% (recommended: 20-50%)
**Final Estimate**: ___ hours (___ days)  

**Team Size**: _[Number of developers involved]_
**Resource Constraints**: _[Development environment, tools, access limitations]_
**Parallel Work**: _[Work that can be done in parallel vs sequential]_

## Approval & Sign-off
**Estimated by**: _[Name]_  
**Date**: _[Date]_  
**Reviewed by**: _[Name]_  
**Approved by**: _[Name]_  

## Example Usage Templates

### Backend API Development
"Estimate effort for building a new Python microservice with database integration, authentication, API endpoints, and automated testing capabilities."

### Frontend Development
"Estimate effort for creating a React component library with TypeScript, Storybook documentation, unit tests, and accessibility compliance."

### Database Migration
"Estimate effort for migrating legacy MySQL database to PostgreSQL including schema transformation, data migration, and application updates."

### Integration Project
"Estimate effort for integrating third-party payment gateway with existing e-commerce platform including error handling, webhook processing, and PCI compliance."