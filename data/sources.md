# NameSwipe dataset sources

Every curated dataset records the references it drew on, with URL and
license, in a `## <key>` section below. Meanings are carried into a dataset
only when a listed reference attests them; when no verifiable gloss exists the
`meaning` field is omitted — never invented.

## indian

- **File**: `data/indian.dataset.json` — 1046 entries (2026-11-01).
- **Coverage**: pan-Indian given names across major traditions —
  Sanskrit/Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi,
  Gujarati, Punjabi (incl. Sikh tradition), and Urdu/Arabic/Persian names in
  long-standing Indian Muslim use. `origin` tags the etymological language or
  tradition of each name (e.g. a Tamil form of a Sanskrit name is tagged
  `Tamil`, an Arabic name current in Urdu-speaking India is tagged `Arabic`).
- **Display forms**: common contemporary romanized spellings (no diacritics),
  one spelling variant per name — near-duplicate spellings (Payal/Payel,
  Kalyani/Kalyani, Kaushik/Koushik) are represented once.

### Sources (URL + license)

1. Monier-Williams, _Monier-Williams Sanskrit-English Dictionary_ (1899),
   digitized as the Cologne Digital Sanskrit Lexicon —
   <https://www.sanskrit-lexicon.uni-koeln.de/monier/> —
   **Public Domain** (1899 edition; the digitization is freely offered).
   Primary authority for Sanskrit word-meanings (e.g. ānanda, śānti, priyā).
2. Wiktionary, _Appendix:Indian given names_ and individual name entries —
   <https://en.wiktionary.org/wiki/Appendix:Indian_given_names> —
   **CC BY-SA 4.0** (attribution: Wiktionary contributors).
3. Wikipedia, _Indian given names_ and per-language name articles —
   <https://en.wikipedia.org/wiki/Indian_given_names> —
   **CC BY-SA 4.0** (attribution: Wikipedia contributors).
4. Behind the Name, _Indian Names_ —
   <https://www.behindthename.com/names/usage/indian> — consulted as a
   **cross-reference only**; site content is copyrighted and nothing was
   copied verbatim from it.
5. BabyNamesIndia-style open lists were NOT used: commercial baby-name sites
   carry no clear license and are excluded by the dataset policy.

### Tier rationale (curator-assigned)

India publishes **no open national birth-name ranking** (no SSA-equivalent;
civil registration data is not released by given name), so no `popularity_rank`
values are asserted. Tiers are curator-assigned per this heuristic:

- `popular` (183) — names in wide contemporary use across India; names a
  random classroom/billing counter would contain (Aarav, Diya, Ayesha, Arjun).
- `uncommon` (486) — familiar names, traditional or mainstream within a
  region/language, but less frequent nationally (Meenakshi, Gurpreet, Farhan).
- `rare` (377) — literary, scriptural, archaic, or highly regional names
  (Kadambari, Eknath, Paari).

### Honesty notes

- 1034/1046 entries carry meanings; the remaining 12 (e.g. Ayaan, Owais,
  Miraal, Suhana) have no single attested gloss across the references and are
  shipped with `meaning` omitted rather than a folk etymology.
- `neutral` (73) is used only for names genuinely borne by both sexes in
  India (Kiran, Noor, Amrit, Sai); predominantly-one-gender names are tagged
  accordingly.
- `sort_order: 60` — dataset ordering follows the epic-2 task list
  (indian is 6th of 17); renumber freely at merge if a collision arises.
