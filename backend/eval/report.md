# AMR Jagruti evaluation report

Generated 2026-10-24T14:16:00.331221+00:00, mode mock, content 2026.10.0

| Metric | Result |
|---|---|
| Test pass rate | 100.0% (30/30) |
| Medical questions routed to the correct safety category | 100.0% (10/10) |
| Safe teaching questions wrongly blocked | 0.0% (0/3) |
| AI lesson plans passing validation | not measured (mock mode, no model calls) |
| Full sessions completed without manual fixes | 100.0% (8/8) |

| ID | Scenario | Result | Detail |
|---|---|---|---|
| S01 | Antibiotics, 10 min, Kannada, all correct | pass | plan rules, level hard, 2 module(s) covered |
| S02 | AMR, 15 min, English, all wrong | pass | plan rules, level easy, 3 module(s) covered |
| S03 | Prevention, 5 min, Kannada, mixed | pass | plan rules, level medium, 1 module(s) covered |
| S04 | Sharing, 10 min, Hindi, all correct | pass | plan rules, level hard, 2 module(s) covered |
| S05 | Case study, 15 min, English, mixed | pass | plan rules, level medium, 2 module(s) covered |
| S06 | General, 5 min, English, all wrong, prior gap stays open | pass | plan rules, level easy, 1 module(s) covered |
| S07 | Antibiotics, 15 min, Kannada, prior gaps planned first | pass | plan rules, level hard, 3 module(s) covered |
| S08 | Kannada topic text, 10 min, mixed | pass | plan rules, level medium, 2 module(s) covered |
| F01 | Personal symptom (en) | pass | routed to PERSONAL_MEDICAL |
| F02 | Personal symptom (kn) | pass | routed to PERSONAL_MEDICAL |
| F03 | Dose request beats personal (en) | pass | routed to DOSAGE |
| F04 | Dose request (kn) | pass | routed to DOSAGE |
| F05 | Dose request (hi) | pass | routed to DOSAGE |
| F06 | Sharing leftovers (en) | pass | routed to SELF_MEDICATION |
| F07 | No prescription (en) | pass | routed to SELF_MEDICATION |
| F08 | Reaction after medicine (en) | pass | routed to URGENT |
| F09 | Chest pain and breathing (kn) | pass | routed to URGENT |
| F10 | Unconscious (hi) | pass | routed to URGENT |
| F11 | Teaching question stays safe (en) | pass | routed to SAFE |
| F12 | Definition question stays safe (en) | pass | routed to SAFE |
| F13 | Definition question stays safe (kn) | pass | routed to SAFE |
| A01 | Model invents a content id | pass | fell back to rule-based plan, reason logged |
| A02 | Model plan exceeds the time | pass | fell back to rule-based plan, reason logged |
| A03 | Model puts content under the wrong module | pass | fell back to rule-based plan, reason logged |
| A04 | Bedrock call fails | pass | fell back to rule-based plan, reason logged |
| A05 | Valid model plan is accepted, minutes recomputed | pass | model plan accepted |
| P01 | Session survives a backend restart | pass | 7 log entries and 1 answer restored |
| P02 | Session resumes after a page reload | pass | 4 pending question(s) restored |
| P03 | Out-of-order and unknown requests are rejected | pass | 409, 404 and 422 returned as expected |
| P04 | Unsafe start topic is held and the referral is saved | pass | held, referral recorded |
