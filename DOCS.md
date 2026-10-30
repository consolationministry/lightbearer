# Lightbearer - C&S Bible Church Hymnal

A free English and Yoruba digital hymnal for C&S Bible Church, with public reader, forms, live audio and an admin workspace.

## For members

- Open the app: the hymn reader is the home page.
- Switch language: tap EN / YO in the header. English and Yoruba are separate collections.
- Search: by hymn number, title, or first line.
- Text size: A- / A+ controls on the reading page.
- Forms: menu > Forms. Fill a published form, receive a registration ID, view "My submissions" with the email you used.
- Favorites and recent: saved on your device only. No account needed.
- Live audio: menu > listen to live and recorded programmes.

## For admins

- Admin workspace: /admin (sign in with an admin account).
- Hymns: draft, edit and publish hymns. Published hymns appear in the public catalog.
- Forms: /admin/forms.html - build forms, publish or keep drafts, set expiry and registration options, review responses.
- Live audio: manage programmes and streams.

## Tech notes

- Static Vite app, hosted on GitHub from main.
- Backend is Supabase: admin/config.js holds the project URL and publishable key; database migrations live in the supabase folder, applied in filename order.
- The bundled data files feed the admin seed; Supabase stays the runtime source of truth.
- Android wrapper uses Capacitor; update checks read js/version.js.
- Keep package.json, js/version.js and manifest.webmanifest versions in sync (tests enforce it).

## Rights

- Hymn texts courtesy of Seraph Media C&S Hymnary - seraphmedia.com.ng. Used by permission.
- The app is free for worship and devotion: no ads, no paid features, texts kept as supplied.
- Seraph Media audio, artwork, logo and design are not used.
