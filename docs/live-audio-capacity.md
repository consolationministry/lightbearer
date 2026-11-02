# Live audio capacity assessment (v1.16.9)

## Finding

Live audio is currently a one-to-many WebRTC peer mesh, not a server-relayed broadcast. The admin broadcaster creates and retains one `RTCPeerConnection` for every listener, adds the microphone track to every peer, and sends ICE candidates and SDP offers/answers over a Supabase Realtime Broadcast topic. The publisher currently counts established and pending peers against a default limit of 16. Supabase Realtime is signaling only; it does not relay the audio media.

The listener limit is not a Supabase-side capacity guarantee. The 16 cap is in publisher JavaScript and can be overridden by an internal `maxListeners` option, but no current admin UI setting exposes it. Raising that value to hundreds would not make the architecture support hundreds: broadcaster upload/network and browser peer-connection work grow approximately linearly with listeners, and Realtime signaling traffic grows with connection and ICE setup/recovery. Actual usable capacity depends on the broadcaster's uplink, peer route (direct versus TURN relay), devices, codecs, network conditions, and service quotas. No production capacity or Supabase project quota was inspected, and no load test was run.

## Safe change in this branch

The client now has an explicit mesh ceiling of 16. An internal requested listener count can lower the ceiling for a test or constrained deployment, but cannot raise it above 16. This prevents a configuration value from silently presenting the existing mesh as a hundreds-listener solution. The existing default remains unchanged.

## Recommendation to reach hundreds

Use an SFU (Selective Forwarding Unit) for interactive, low-latency audio. The broadcaster should publish one WebRTC media stream to the SFU; listeners subscribe to the SFU, rather than the broadcaster creating a peer for every listener. Keep Supabase for programme metadata, authorization/session state and app interactions, not media forwarding. Evaluate a managed SFU first to avoid building and operating media infrastructure; alternatively, self-host an SFU with regional deployment, TURN, monitoring, and capacity planning. The exact provider, monthly cost, and capacity cannot be selected from the repository alone. Obtain current vendor quotes and model egress from the intended codec bitrate, listener count, peak duration, regions, and TURN percentage.

For a one-way service where several seconds of latency is acceptable, an audio HLS pipeline distributed through a CDN is another fit. It trades interactivity/latency for CDN cacheability and avoids maintaining a WebRTC peer per listener on the broadcaster. Estimate delivery cost from the provider's current per-GB rate and measured encoded bitrate, for example `listeners × hours × bitrate_kbps × 3600 / 8 / 1,000,000` gives approximate decimal GB before protocol overhead and rebuffering. This is a planning formula, not a price quote.

## Blockers and safe rollout outline

- There is no SFU, media ingest/egress path, HLS packager, CDN live origin, or provider credentials/integration in this codebase.
- The current TURN endpoint only supplies ICE configuration; TURN fallback can increase relay egress but is not an SFU and does not remove the broadcaster's one-peer-per-listener workload.
- Supabase Realtime signaling and project quotas, peak connection counts, and actual audio bitrate/egress costs were not verified. Do not assume they permit hundreds of signaling clients.
- Choose a target peak listener count, acceptable latency, regions, reliability objective and monthly spend ceiling. Get provider pricing and confirm Supabase quotas before implementation.
- Build an isolated SFU or HLS proof of concept with server-validated, short-lived publish/subscribe credentials and no service-role key in the browser. Add capacity metrics and a staged, non-production load test. Retain the existing 16-listener WebRTC path as fallback until the new path passes acceptance tests.
- After the provider, spend ceiling and latency target are approved, implement a feature-flagged transport adapter, validate tests and a controlled staging load test, then ask separately before any production rollout. This change does not merge, release, deploy, contact a provider, or use production credentials.
