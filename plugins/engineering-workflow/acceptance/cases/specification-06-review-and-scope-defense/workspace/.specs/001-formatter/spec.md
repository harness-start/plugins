# Spec: Formatter

## Intent
Trim and lowercase one input string.

## Requirements

### REQ-001: Normalize input
Return trimmed lowercase text.

#### Scenario: mixed input
- Given text with spaces and uppercase letters
- When normalization is requested
- Then trimmed lowercase text is returned

## Non-goals
- Changing distractor modules.
