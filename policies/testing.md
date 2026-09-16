# Testing Policy

Use existing project-native test/build infrastructure first. Do not create a parallel framework merely to satisfy CEOS.

For a defect fix, prefer a regression check that fails before the fix and passes after it when practical. For browser/UI issues, source inspection alone is insufficient when runtime evidence can be obtained.
