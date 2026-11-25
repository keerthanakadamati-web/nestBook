# LABANYA ENCLAVE gallery storage and backups

## Storage

The gallery reuses the existing Lovable Cloud storage provider. `apartment-event-photos` is private. Association-owned files use year/event-album/photo paths; uploader attribution does not transfer ownership to personal accounts.

The initial application warning budget is 1,000,000,000 bytes (1 GB), not a purchased allowance or verified provider quota. Measured usage includes thumbnails and staged files. The verified bucket upload cap is 5 MiB per file; the application accepts optimized JPEGs up to 5,000,000 bytes. Overall remaining provider capacity is not reliably exposed by available tools. No paid provider, upgrade or purchase was enabled; existing Cloud storage/bandwidth charges can still apply.

## Make a backup

1. In the signed-in Storage Management page, prepare and download the gallery metadata JSON. This includes albums, photos, upload records and the application budget, with paths but without signed URLs.
2. An authorized Lovable project administrator separately opens **More → Storage → apartment-event-photos** and downloads the photo files and thumbnails. Preserve the exact directory paths.
3. For a full database backup, use **More → Database → Manage → Settings → Export project data**. The JSON gallery export is not a substitute for a full database export.
4. Store the metadata and files securely together, record the backup time, and compare file counts and sizes against measured storage. Keep a separate copy before any restore.

**Daily database backups and database exports do not include storage photo files.** No automatic photo backup, retention cleanup or restore has been configured. Actual Cloud backup inventory and a restore exercise have not been verified.

## Restore and verify

Database restore changes the database in place and can lose newer records. Restore photo files separately to their original private bucket paths, reconcile metadata with available files, and test President/Secretary and Owner access, cover images, and downloads. Do not replace existing live data without an explicit restore decision. The application never auto-deletes files to recover storage.

## Permissions and deletion

Owners and Treasurer read published albums only. Secretary adds verified private staged photos and submits metadata/removal/budget proposals; a different President approves them through the existing approval history. Admin and President retain authorized live access. Removed photo files can be explicitly purged through Storage Management after the metadata removal is effective; rejected/incomplete uploads are explicitly discarded. Nothing is deleted automatically.

Short-lived download links are bearer links and may remain usable until their expiry (60 seconds for downloads; thumbnails 300 seconds), even if an album is subsequently unpublished. Browser ZIPs are capped at 200 MB; larger albums use individual photo downloads or authorized Cloud retrieval.

## Verification

Separate President, Secretary, Treasurer and Owner test accounts verified image optimization, publication isolation, Secretary staging and President approval, protected JPEG/ZIP and metadata downloads, storage measurement, threshold deduplication and invalid-image rejection. Temporary photos/accounts/alerts/measurements were removed after testing. A 9,008,773-byte JPEG became a 1,279,764-byte JPEG at 1920 × 1440; high-detail images may exceed the 200–600 KB target. Thumbnail was 76,210 bytes. Current gallery usage after cleanup is zero files/zero bytes; the application budget is 1 GB. Published-site persistence after a new publish, real provider-quota exhaustion, full backup restoration and a complete broad sidebar regression remain unverified; publishing was not requested and the broad sidebar run timed out.