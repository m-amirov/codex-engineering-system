# Yandex Save Patterns

Critical invariant: never commit metadata for a new generation or clear transaction intent before mandatory runtime apply of that same state. Safe order: prepared intent, verified primary/backup save, local persistence, generation commit, runtime apply, semantic validation, active snapshot, intent clear, optional side effects, corrective upload if needed.
