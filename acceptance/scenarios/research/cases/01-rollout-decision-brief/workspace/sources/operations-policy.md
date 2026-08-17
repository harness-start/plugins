# Router rollout policy

Use a staged rollout for request-routing changes.
Stop expansion when the rolling 30-minute request error rate exceeds 2.0% or p95 latency exceeds 800 ms.
Advance to the next cohort only after both measures remain below their thresholds for 24 hours.
