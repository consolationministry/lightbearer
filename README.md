# C&S Bible Church Hymnal

A standalone, independently versioned English and Yorùbá hymnal app with public reader and admin. English and Yorùbá remain separate, and Chorus/Egbe displays in highlighted chorus blocks.

Version starts at 1.0.0. The logo slot is `assets/church-logo-placeholder.svg`, ready to replace when the church logo is available.

Supabase is intentionally not connected. Configure `admin/config.js` with this app's own project settings before enabling backend features. No payments are included.

GitHub Pages deploys from `main` through `.github/workflows/deploy-pages.yml`.
