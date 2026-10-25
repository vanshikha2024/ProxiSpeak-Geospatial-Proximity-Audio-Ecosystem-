# Week 2 spatial audit: $near query

Radius: 100 px. Queries per size: 100. Target: database time under 20 ms.
Database: proxispeak

| People | DB avg (ms) | DB 95th % (ms) | DB max (ms) | Round trip avg (ms) | Round trip max (ms) | Accuracy mismatches | Result |
|---|---|---|---|---|---|---|---|
| 50 | 0 | 0 | 0 | 39.5 | 379 | 0/20 | PASS |
| 500 | 0.2 | 1 | 1 | 55 | 840.9 | 0/20 | PASS |
| 1000 | 0.9 | 1 | 2 | 84.1 | 1577.1 | 0/20 | PASS |

Database time is the work MongoDB does. Round trip includes the internet, so it is always higher for a cloud database.
Overall: PASS
