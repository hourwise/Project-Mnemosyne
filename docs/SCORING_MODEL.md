# Scoring Model

Reliability scores start from source quality and are adjusted by freshness, hash validity, confirmations, contradictions, risk, and supersession.

Initial source weights:

| Source type | Range |
| --- | --- |
| Law file | 0.95-1.00 |
| ADR | 0.85-0.95 |
| Current code | 0.80-0.95 |
| Test file | 0.75-0.90 |
| README | 0.70-0.90 |
| User instruction | 0.65-0.90 |
| Conversation summary | 0.50-0.75 |
| Model inference | 0.30-0.60 |
| Speculation | 0.10-0.40 |
