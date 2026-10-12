# SmartAqua Pro - Project Instructions

## 1. Project Source of Truth

SmartAqua Pro is an IoT-Based Aquarium Monitoring and Automation System
with rule-based Prescriptive Analytics.

All implementation decisions must remain aligned with the approved
SmartAqua Pro manuscript.

The manuscript defines the intended system scope, architecture, monitored
parameters, rule-based analysis, user access, Firebase usage, alerts,
recommendations, equipment controls, logging, and reporting.

Do not introduce functionality that changes the research scope unless
explicitly requested by the developers.

If the existing implementation conflicts with these instructions, report
the conflict before making a major architectural change.

Do not silently redesign working parts of the system.


---

## 2. Current Development Status

The physical IoT equipment, including the ESP32, sensors, and controlled
aquarium equipment, may not yet be available.

Software development and fixes may continue before physical hardware
integration.

Current development may include:

- authentication
- user management
- aquarium management
- aquarium assignment
- Firebase integration
- dashboard improvements
- mobile/web consistency
- sensor display preparation
- sensor data validation logic
- threshold configuration
- condition classification
- rule-based prescriptive analytics
- alerts and notifications
- maintenance recommendations
- maintenance records
- historical monitoring
- reports
- equipment-control preparation
- security and authorization
- UI/UX improvements
- bug fixes

Do NOT create mock, fake, randomly generated, or simulated sensor telemetry
unless explicitly requested by the developer.

Do NOT claim hardware-dependent functionality has been physically verified
when the required hardware is unavailable.

If a requested feature requires physical hardware testing, implement only
the software portion that can be safely completed and clearly identify what
still requires hardware verification.


---

## 3. Core System Architecture

SmartAqua Pro follows these logical layers:

1. Hardware and IoT Layer
2. Communication and Processing Layer
3. Data Layer
4. Application Layer

The intended high-level data flow is:

Aquarium Sensors
-> ESP32
-> Data Transmission
-> Sensor Data Validation
-> Aquarium and Device Association
-> Firebase
-> Rule-Based Evaluation
-> Condition Classification
-> Prescriptive Recommendation
-> Alerts / Historical Records
-> Web and Mobile Applications

Do not substantially change this architecture without explicit approval.


---

## 4. IoT Monitoring Scope

SmartAqua Pro monitors the following aquarium and system parameters:

- pH
- Total Dissolved Solids (TDS)
- turbidity
- water temperature
- ammonia
- water level
- filtration status
- equipment status
- power status

The ESP32 is the intended microcontroller for the physical IoT system.

Every incoming device reading must eventually be associated with the
correct:

- aquarium
- device
- timestamp
- assigned user/account where applicable

Do not add additional required sensors or monitored parameters outside the
approved project scope unless explicitly requested.


---

## 5. Sensor Data Validation

Sensor readings must be validated before threshold evaluation and
prescriptive analysis.

The intended processing order is:

1. Receive sensor/device data.
2. Validate the structure and required fields.
3. Check for missing values.
4. Check for malformed values.
5. Check for invalid or impossible values.
6. Verify aquarium association.
7. Verify device association.
8. Process valid readings.
9. Perform threshold evaluation.
10. Generate classifications and recommendations when applicable.

Missing, malformed, invalid, or impossible readings must NOT automatically
be interpreted as abnormal aquarium water conditions.

Such readings should be handled as possible:

- sensor errors
- device errors
- invalid input
- communication/data problems

Do not generate water-quality maintenance recommendations from invalid data.


---

## 6. Rule-Based Threshold Evaluation

SmartAqua Pro uses predefined threshold rules.

Valid aquarium condition classifications are:

- NORMAL
- WARNING
- CRITICAL

Threshold evaluation must operate only on validated readings.

Do not create additional severity classifications unless explicitly
requested and approved.

Do NOT invent numerical threshold values.

Threshold values must come from:

- approved system configuration
- approved project requirements
- existing verified configuration
- explicit developer-provided values

If a required threshold is missing, report it as missing instead of
guessing a value from general knowledge or the internet.


---

## 7. Rule-Based Prescriptive Analytics

Prescriptive analytics is a CORE feature of SmartAqua Pro.

SmartAqua Pro uses predefined IF-THEN rules to determine appropriate
maintenance recommendations.

The system does NOT use predictive analytics or machine learning for this
purpose.

The intended processing flow is:

Validated Sensor Reading
-> Threshold Evaluation
-> NORMAL / WARNING / CRITICAL
-> Matching IF-THEN Rule
-> Prescriptive Maintenance Recommendation
-> Alert when applicable
-> Historical Record

Prescriptive rules may consider:

- monitored parameter
- current sensor reading
- condition/severity
- aquarium profile
- filtration configuration
- equipment status
- estimated bioload

A prescriptive rule may define:

- monitored parameter
- triggering condition
- severity
- recommended maintenance activity
- reason/justification
- required user action

Recommendations must be explainable and traceable to predefined rules.

Do NOT use:

- machine learning
- predictive modeling
- reinforcement learning
- AI-generated water-quality decisions
- AI-generated fish-health diagnoses
- AI-generated maintenance decisions

Do not invent recommendation rules.

If an appropriate rule does not exist, report that the rule is missing.


---

## 8. Important Distinction: Classification vs Recommendation

Condition classification and prescriptive recommendation generation are
related but separate responsibilities.

Condition classification answers:

"What is the current condition?"

Possible results:

- NORMAL
- WARNING
- CRITICAL

Prescriptive analytics answers:

"What maintenance action should the user consider based on the predefined
rule?"

Do not combine these concepts in a way that makes recommendations
untraceable or inconsistent.


---

## 9. Aquarium Profiles

Aquarium profiles may contain:

- aquarium name
- tank type
- tank dimensions
- working water volume
- filtration configuration
- fish species
- fish quantity
- estimated bioload
- aquarium status

Aquarium profile information may be used when applying approved
aquarium-specific rules.

Do not invent missing aquarium profile information.


---

## 10. Firebase Architecture

SmartAqua Pro uses Firebase for cloud data management.

The intended architecture uses both:

- Cloud Firestore
- Firebase Realtime Database

Do not merge or significantly change their responsibilities without
explicit approval.


### Cloud Firestore

Use Cloud Firestore for structured and historical application data,
including where applicable:

- users
- aquarium profiles
- aquarium assignments
- historical sensor readings
- threshold settings
- prescriptive rules
- alerts
- recommendations
- maintenance activities
- monitoring reports


### Firebase Realtime Database

Use Firebase Realtime Database for real-time device-oriented information,
including where applicable:

- current telemetry
- commands
- control settings
- equipment/device status
- device history

When modifying existing Firebase code, first inspect the current database
structure.

Do not create duplicate collections, nodes, or competing data models
without determining whether an existing structure already serves the
required purpose.


---

## 11. Multiple Users and Aquarium Data Isolation

SmartAqua Pro supports multiple users and aquariums.

Aquarium-specific information must remain associated with the correct
aquarium and authorized user.

Data from different aquariums must never be unintentionally mixed.

This applies to:

- sensor readings
- condition classifications
- alerts
- recommendations
- equipment status
- device commands
- maintenance records
- monitoring history
- reports
- device history

Do not trust an aquarium ID provided by the client as proof of
authorization.

Verify that the authenticated user is authorized to access the requested
aquarium before reading or modifying protected aquarium data.


---

## 12. User Roles and Access

The system includes roles such as:

- System Administrator
- User/Caretaker

Use authentication and role-based access control.

Users/Caretakers must only access aquarium information and controls they
are authorized to use.

Administrator functionality must remain separated from ordinary user
functionality where required.

Do not weaken existing authentication or authorization checks merely to
make a feature easier to implement.


---

## 13. Web Application

The web dashboard is part of the SmartAqua Pro system.

Depending on authorization and implementation status, the web application
should support access to:

- assigned aquarium information
- current sensor readings
- aquarium condition
- NORMAL / WARNING / CRITICAL classification
- alerts
- maintenance recommendations
- equipment status
- monitoring history
- maintenance records
- reports
- supported equipment controls

The frontend should not invent its own independent business rules when
approved rules already exist elsewhere in the system.


---

## 14. Mobile Application Compatibility

SmartAqua Pro also includes a mobile application.

The web application and mobile application must remain logically
consistent.

Both applications should use the same approved:

- aquarium data model
- user/aquarium assignment rules
- sensor definitions
- threshold definitions
- condition classifications
- prescriptive rules
- alert semantics
- recommendation semantics
- equipment-control permissions

Do not intentionally create separate conflicting business logic for web
and mobile applications.

Where practical, condition and recommendation logic should have a single
authoritative definition rather than separate hardcoded versions that may
become inconsistent.


---

## 15. Alerts and Notifications

Alerts may be generated for supported abnormal conditions such as:

- warning threshold conditions
- critical threshold conditions
- power interruption
- supported equipment/device problems

Alerts must be associated with the affected aquarium.

Where applicable, an alert should contain enough information to identify:

- aquarium
- parameter/event
- severity
- timestamp
- relevant status

Alerts and prescriptive recommendations are related but should remain
logically distinguishable.


---

## 16. Supported Equipment Control

SmartAqua Pro supports selected control/automation for:

- feeder
- filtration system
- lighting system

Equipment commands must eventually be:

- authenticated
- authorized
- aquarium-specific
- device-specific where applicable
- logged where required

A user must not be able to control equipment belonging to an aquarium they
are not authorized to manage.

Do not add unsupported equipment automation unless explicitly requested.


---

## 17. Historical Records and Reporting

SmartAqua Pro should maintain appropriate historical records for:

- sensor readings
- aquarium-condition classifications
- alerts
- recommendations
- maintenance activities
- equipment activities
- power-interruption events

Records should contain appropriate timestamps and aquarium associations.

Monitoring reports should remain aquarium-specific and may summarize:

- sensor readings
- classifications
- alerts
- recommendations
- completed maintenance actions
- equipment status
- power-interruption records


---

## 18. Security Requirements

Security must be considered when modifying SmartAqua Pro.

Follow:

- authentication
- role-based access control
- aquarium-specific authorization
- input validation
- Firebase security rules
- secure communication
- appropriate error handling
- audit/logging practices

Where applicable, communication with physical IoT components should use
secure protocols such as HTTPS/TLS or MQTT with TLS.

Never commit:

- passwords
- private keys
- Firebase service-account secrets
- API secrets
- authentication tokens
- other sensitive credentials

Do not expose sensitive configuration to client-side code.


---

## 19. Prototype and Research Scope

The current SmartAqua Pro research prototype focuses on:

- small freshwater aquariums
- goldfish

The system focuses on aquarium environmental conditions and maintenance.

The system does NOT evaluate:

- fish growth
- fish behavior
- reproduction
- disease
- fish health
- fish stress

Do not implement these as existing SmartAqua Pro research features unless
the project scope is formally changed.

The system must not automatically chemically adjust pH.

Do not transform SmartAqua Pro into a predictive fish-health or biological
diagnostic system.


---

## 20. Development Rules for Codex

Before making significant changes:

1. Read this AGENTS.md completely.
2. Inspect the existing implementation relevant to the task.
3. Identify the affected files.
4. Trace the existing data flow.
5. Determine what is already implemented.
6. Compare existing behavior with these requirements.
7. Identify conflicts or missing requirements.
8. Prefer the smallest safe change.
9. Avoid unrelated refactoring.
10. Preserve working functionality unless the requested change requires
    modifying it.
11. Add or update tests where appropriate.
12. Run available lint, typecheck, build, and tests where appropriate.

Do not assume an empty directory must be used.

Do not create a backend service, Firebase Function, collection, database
node, library, or architectural layer merely because it appears useful.

First determine whether the existing architecture already provides the
required functionality.

Do not rename, reorganize, or rewrite large portions of the repository
without a clear reason related to the requested task.


---

## 21. Missing Requirements

Do not guess project-specific requirements.

If implementation requires information that is not defined, such as:

- numerical sensor thresholds
- exact recommendation rules
- device command formats
- ESP32 payload formats
- calibration values
- hardware pin assignments
- hardware communication details

report the missing requirement.

Do not fabricate values merely to make the implementation appear complete.


---

## 22. Hardware Availability

Physical IoT equipment may not yet be available.

Do NOT create mock, simulated, fake, or randomly generated sensor data
unless explicitly requested.

Software components that do not require physical hardware may still be
implemented and improved.

When hardware is required for final verification, clearly distinguish:

- IMPLEMENTED IN SOFTWARE
- VERIFIED BY SOFTWARE TESTS
- REQUIRES PHYSICAL HARDWARE VERIFICATION

Never claim that sensor accuracy, ESP32 communication, equipment switching,
power-interruption detection, or other physical behavior has been verified
without actual hardware testing.


---

## 23. Required Behavior When Asked to Inspect

If the developer asks for inspection, assessment, review, or planning only:

DO NOT modify files.

Return the requested assessment first.

Wait for explicit permission before implementing changes when the developer
has specifically requested an inspection-only step.


---

## 24. Completion Report

After implementing a requested change, provide:

1. Files changed
2. What was changed
3. Why the change was necessary
4. Which SmartAqua Pro requirement it implements
5. Firebase/database impact, if any
6. Authentication/authorization impact, if any
7. Tests/checks performed
8. What was successfully verified
9. What still requires hardware verification
10. Assumptions or unresolved requirements

## Account Status

The user profile may contain an `account_status` field.

For the current development stage, `account_status` is informational and
administrative only.

Do not block login, aquarium access, monitoring, device controls, or Admin
operations based solely on `account_status` unless explicitly requested.

Future account deactivation/enforcement may be implemented later.

Do not report untested behavior as verified.