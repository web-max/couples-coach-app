# backend/

The app's server. Four jobs, one service: the **relay** (AI provider traffic,
keys server-side, transit-only), the **meter** (free sessions per person/month,
quiet per-session cap, RevenueCat entitlements), the **vault** (opaque E2EE backup
blobs), and the **importer** (one-time PairGPT migration, two-key for the shared
record). Coach-doc build jobs (send–build–purge–deliver) run here too.
