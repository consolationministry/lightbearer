import { churchGalleryPhotos } from "./church-gallery.js";

const worshipVerses = [
  { text: "O come, let us worship and bow down: let us kneel before the Lord our maker.", reference: "Psalm 95:6 · KJV" },
  { text: "Let every thing that hath breath praise the Lord. Praise ye the Lord.", reference: "Psalm 150:6 · KJV" },
  { text: "I will bless the Lord at all times: his praise shall continually be in my mouth.", reference: "Psalm 34:1 · KJV" },
  { text: "Serve the Lord with gladness: come before his presence with singing.", reference: "Psalm 100:2 · KJV" },
  { text: "Sing unto the Lord, bless his name; shew forth his salvation from day to day.", reference: "Psalm 96:2 · KJV" },
  { text: "O magnify the Lord with me, and let us exalt his name together.", reference: "Psalm 34:3 · KJV" }
];

export function initWorshipQuoteGallery(root = document.querySelector("#worship-quote-gallery")) {
  if (!root || !churchGalleryPhotos.length) return;
  const figure = document.createElement("figure");
  figure.className = "worship-quote-slide is-visible";
  figure.setAttribute("aria-live", "polite");
  const image = document.createElement("img");
  image.className = "worship-quote-image";
  image.alt = "";
  image.loading = "eager";
  image.decoding = "async";
  const caption = document.createElement("figcaption");
  caption.className = "worship-quote-copy";
  const quote = document.createElement("blockquote");
  const cite = document.createElement("cite");
  caption.append(quote, cite);
  figure.append(image, caption);
  root.replaceChildren(figure);

  const items = churchGalleryPhotos.map((photo, index) => ({ photo, verse: worshipVerses[index % worshipVerses.length] }));
  let index = 0;
  const show = next => {
    index = (next + items.length) % items.length;
    const item = items[index];
    image.src = `./assets/church/${item.photo.file}`;
    image.alt = item.photo.caption;
    quote.textContent = `“${item.verse.text}”`;
    cite.textContent = item.verse.reference;
    figure.setAttribute("aria-label", `Worship photo and verse ${index + 1} of ${items.length}`);
  };
  show(0);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!motion.matches) window.setInterval(() => show(index + 1), 6000);
}
