# Testing Policy

Use existing project-native test/build infrastructure first. Do not create a parallel framework merely to satisfy CEOS.

For a defect fix, prefer a regression check that fails before the fix and passes after it when practical. For browser/UI issues, source inspection alone is insufficient when runtime evidence can be obtained.

## Failure adjudication

Do not treat every non-green command as the same defect class.

- `TEST_FAILURE`: an existing test ran and its asserted behavior failed.
- `CONFIGURATION_ERROR`: a required command/script/profile/fixture wiring is missing or invalid.
- `COMMAND_FAILURE`: a non-test command ran and failed.
- `HARNESS_DEFECT`: automation/driver/fixture behavior is contradicted by a minimal/native reproduction.
- `PRODUCT_DEFECT`: runtime/product behavior is independently reproduced.

Before changing production runtime for an unstable UI/E2E failure, reproduce the interaction on the smallest practical fixture and inspect bounds, hit target, overlays, emitted pointer/touch/input events and active locale. Fix stale or locale-assuming fixtures as fixtures when product behavior is correct.

Never weaken a user-visible assertion merely to make a flaky harness green.
