# Guarded settings editing

19 November 2026. Invoice settings freeze the opened snapshot/revision independently of background refetch. Sparse changes compare against that snapshot, including per-key invoice visibility changes. Every new save requires settings_revision 1 metadata and sends opaque expected_revision; unsupported servers cannot fall back to an unsafe unguarded write.

Stale conflicts preserve typed fields, disable save and offer explicit latest review. Rebase reapplies only locally changed fields/show keys onto the reviewed latest snapshot; remote phone/layout/visibility changes are preserved. Existing tabs, preview and theme remain. Image reviews show presence placeholders rather than raw base64. Owner lifetime guards keep old user/shop editors from dispatching after unmount.

Validation: 410 tests across 43 files, typecheck, lint and build pass. Actual localhost browser settings-revision scenario passed stale rejection, retained text, explicit dirty-only field/show rebase and preservation of an independent remote phone/show update. API generated types include the readonly revision, guarded input and capability. Fixture cleanup and final emulator/Docker evidence are in central E01 slice 5 evidence.
