# Testing Policy

Use existing project-native test/build infrastructure first. Do not create a parallel framework merely to satisfy CEOS.

For a defect fix, prefer a regression check that fails before the fix and passes after it when practical. For browser/UI issues, source inspection alone is insufficient when runtime evidence can be obtained.


## Failure classification

Do not collapse infrastructure and configuration problems into product failures.

- an absent required script/command is `CONFIGURATION_ERROR`;
- a command that was configured and executed but whose test assertions fail is `TEST_FAILURE`;
- unavailable infrastructure is `INFRA_FAILURE` or the applicable external/capability blocker;
- stale fixtures are reported separately from confirmed product regressions;
- a claim with no executed assertion is `EVIDENCE_FAILURE`, never PASS.

Regression coverage should include negative cases for fake-zero assertions, partial coverage,
stale provenance, unavailable external evidence, and configuration gaps where applicable.
