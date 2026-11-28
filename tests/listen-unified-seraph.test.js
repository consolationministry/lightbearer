import assert from "node:assert/strict";
import { test } from "node:test";
import { renderAudioLibrarySection, renderEmbeddedTracks, renderTrackRow, trackMatchesQuery, cleanTracks } from "../js/audio-library.js";
import { renderLiveAudioPage } from "../js/live-audio-views.js";

const church = { id: "p1", status: "published", title: "Sunday Service", speaker: "Pastor A", onAir: false, liveSessionId: "", category: "Sunday Service", recordingUrl: "https://example.invalid/r.mp3", date: "2026-01-01" };
const data = { programs: [church], savedPrograms: [], comments: [], error: "", loading: false };

test("listen page is one unified list: church rows first, seraph mount right after", () => {
  const html = renderLiveAudioPage(data, "", "");
  const churchIdx = html.indexOf('data-testid="audio-program-p1"');
  const seraphIdx = html.indexOf('id="audio-library-root"');
  assert.ok(churchIdx >= 0 && seraphIdx > churchIdx, "seraph mount follows church recordings");
  assert.match(html, /data-seraph-query=""/);
  // no second seraph nav, hero, category tabs or second search on the church page
  assert.doesNotMatch(html, /seraph-audio-library|audio-cat-tab|data-audio-category|id="audio-search"/);
  assert.equal((html.match(/<h2 id="audio-library-heading">/g) || []).length, 1);
  // the one search is the church search and the programme dropdown is in the same row
  assert.match(html, /id="live-audio-search"/);
  assert.match(html, /id="live-audio-programme"/);
});

test("live and saved filter views keep seraph out of the list", () => {
  assert.doesNotMatch(renderLiveAudioPage(data, "", "__live__"), /id="audio-library-root"/);
  assert.doesNotMatch(renderLiveAudioPage(data, "", "__saved__"), /id="audio-library-root"/);
});

test("embedded seraph rows match the church row style and keep embed-only credit", () => {
  const track = { slug: "seraph-hymn", title: "Holy Holy", artist: "Seraph Choir", type: "music", duration: "3:12", category: "Hymns", url: "https://www.seraphmedia.com.ng/tracks/seraph-hymn", embed_url: "https://www.seraphmedia.com.ng/embed/seraph-hymn" };
  const row = renderTrackRow(track);
  assert.match(row, /audio-library-row audio-library-row-seraph/);
  assert.match(row, /data-testid="audio-seraph-seraph-hymn"/);
  assert.match(row, /audio-library-row-play/);
  assert.match(row, /Seraph Media/);
  assert.match(row, /href="https:\/\/www\.seraphmedia\.com\.ng\/tracks\/seraph-hymn"/);
  assert.match(row, /data-src="https:\/\/www\.seraphmedia\.com\.ng\/embed\/seraph-hymn"/);
  assert.doesNotMatch(row, /<audio|<source|<iframe[^>]*\ssrc=/);
  const html = renderEmbeddedTracks({ tracks: [track], query: "", loading: false, total: 1, loaded: 1 });
  assert.match(html, /Audio courtesy of/);
  assert.match(html, /seraphmedia\.com\.ng/);
  assert.doesNotMatch(html, /audio-cat-tab|audio-hero|data-audio-search/);
});

test("shared church search filters seraph tracks client-side", () => {
  const tracks = [
    { slug: "a", title: "Grace Upon Grace", artist: "Seraph Choir", embed_url: "https://www.seraphmedia.com.ng/embed/a" },
    { slug: "b", title: "Holy Anthem", artist: "Seraph Choir", embed_url: "https://www.seraphmedia.com.ng/embed/b" }
  ];
  assert.equal(trackMatchesQuery(tracks[0], "grace"), true);
  assert.equal(trackMatchesQuery(tracks[1], "grace"), false);
  assert.equal(trackMatchesQuery(tracks[0], ""), true);
  const html = renderEmbeddedTracks({ tracks, query: "grace", loading: false, total: 2, loaded: 2 });
  assert.match(html, /audio-seraph-a/);
  assert.doesNotMatch(html, /audio-seraph-b/);
  assert.match(renderEmbeddedTracks({ tracks, query: "zzz", loading: false, total: 2, loaded: 2 }), /No Seraph audio matches that search\./);
});

test("non-seraph-embed tracks are dropped and the section keeps one mount point", () => {
  const bad = { slug: "x", title: "Bad", embed_url: "https://example.invalid/raw.mp3" };
  assert.deepEqual(cleanTracks([bad]), []);
  assert.match(renderAudioLibrarySection("grace"), /id="audio-library-root" data-seraph-query="grace"/);
});
