// Passage-level AI citability scoring — a TypeScript port of citability_scorer.py
// from the GEO audit toolkit (~/.claude/skills/geo/scripts). Deterministic: no LLM
// call. Scores how likely an AI answer engine is to quote a passage, 0–100:
//   answer-block quality 30 · self-containment 25 · structural readability 20 ·
//   statistical density 15 · uniqueness signals 10
// The patterns are English; non-English passages score lower on the pattern-based
// parts (answer blocks, uniqueness) and the UI says so.

export interface PassageScore {
  heading: string;
  wordCount: number;
  total: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    answerBlockQuality: number;
    selfContainment: number;
    structuralReadability: number;
    statisticalDensity: number;
    uniquenessSignals: number;
  };
  preview: string;
}

export interface PageCitability {
  score: number;               // average passage score, 0–100
  passages: number;
  optimalLengthPassages: number; // 134–167 words
  gradeDistribution: Record<PassageScore['grade'], number>;
  top: PassageScore[];
  bottom: PassageScore[];
}

const count = (re: RegExp, text: string) => (text.match(re) ?? []).length;

export function scorePassage(text: string, heading = ''): PassageScore {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/);

  // 1. Answer block quality (30)
  let abq = 0;
  const definitions = [
    /\b\w+\s+is\s+(?:a|an|the)\s/i,
    /\b\w+\s+refers?\s+to\s/i,
    /\b\w+\s+means?\s/i,
    /\b\w+\s+(?:can be |are )?defined\s+as\s/i,
    /\bin\s+(?:simple|other)\s+(?:terms|words)\s*,/i,
  ];
  if (definitions.some((re) => re.test(text))) abq += 15;
  const first60 = words.slice(0, 60).join(' ');
  if ([/\b(?:is|are|was|were|means?|refers?)\b/i, /\d+%/, /\$[\d,]+/, /\d+\s+(?:million|billion|thousand)/i].some((re) => re.test(first60))) abq += 15;
  if (heading.trim().endsWith('?')) abq += 10;
  const clear = sentences.filter((s) => { const n = s.split(/\s+/).filter(Boolean).length; return n >= 5 && n <= 25; }).length;
  if (sentences.length) abq += Math.floor((clear / sentences.length) * 10);
  if (/(?:according to|research shows|studies? (?:show|indicate|suggest|found)|data (?:shows|indicates|suggests))/i.test(text)) abq += 10;

  // 2. Self-containment (25)
  let sc = 0;
  if (wordCount >= 134 && wordCount <= 167) sc += 10;
  else if (wordCount >= 100 && wordCount <= 200) sc += 7;
  else if (wordCount >= 80 && wordCount <= 250) sc += 4;
  else if (wordCount >= 30 && wordCount <= 400) sc += 2;
  if (wordCount > 0) {
    const ratio = count(/\b(?:it|they|them|their|this|that|these|those|he|she|his|her)\b/gi, text) / wordCount;
    if (ratio < 0.02) sc += 8; else if (ratio < 0.04) sc += 5; else if (ratio < 0.06) sc += 3;
  }
  const properNouns = count(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, text);
  if (properNouns >= 3) sc += 7; else if (properNouns >= 1) sc += 4;

  // 3. Structural readability (20)
  let sr = 0;
  if (sentences.length) {
    const avg = wordCount / sentences.length;
    sr += avg >= 10 && avg <= 20 ? 8 : avg >= 8 && avg <= 25 ? 5 : 2;
  }
  if (/(?:first|second|third|finally|additionally|moreover|furthermore)/i.test(text)) sr += 4;
  if (/(?:\d+[.)]\s|\b(?:step|tip|point)\s+\d+)/i.test(text)) sr += 4;
  if (text.includes('\n')) sr += 4;

  // 4. Statistical density (15)
  let sd = 0;
  sd += Math.min(count(/\d+(?:\.\d+)?%/g, text) * 3, 6);
  sd += Math.min(count(/\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|M|B|K))?/g, text) * 3, 5);
  sd += Math.min(count(/\b\d+(?:,\d{3})*(?:\.\d+)?\s+(?:users|customers|pages|sites|companies|businesses|people|percent|times|x\b)/gi, text) * 2, 4);
  if (/\b20(?:2\d|1\d)\b/.test(text)) sd += 2;
  for (const re of [/(?:according to|per|from|by)\s+[A-Z]/, /(?:Gartner|Forrester|McKinsey|Harvard|Stanford|MIT|Google|Microsoft|OpenAI|Anthropic)/, /\([A-Z][a-z]+(?:\s+\d{4})?\)/]) {
    if (re.test(text)) sd += 2;
  }

  // 5. Uniqueness signals (10)
  let us = 0;
  if (/(?:our (?:research|study|data|analysis|survey|findings)|we (?:found|discovered|analyzed|surveyed|measured))/i.test(text)) us += 5;
  if (/(?:case study|for example|for instance|in practice|real-world|hands-on)/i.test(text)) us += 3;
  if (/(?:using|with|via|through)\s+[A-Z][a-z]+/.test(text)) us += 2;

  const breakdown = {
    answerBlockQuality: Math.min(abq, 30),
    selfContainment: Math.min(sc, 25),
    structuralReadability: Math.min(sr, 20),
    statisticalDensity: Math.min(sd, 15),
    uniquenessSignals: Math.min(us, 10),
  };
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const grade = total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : total >= 35 ? 'D' : 'F';
  return {
    heading,
    wordCount,
    total,
    grade,
    breakdown,
    preview: words.slice(0, 30).join(' ') + (wordCount > 30 ? '…' : ''),
  };
}

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ').trim();

// Splits the main content into heading-delimited blocks, like the Python version:
// non-content elements are removed, then paragraphs and list items are grouped
// under the nearest preceding h1–h4. Blocks under 20 words are skipped.
export function extractBlocks(html: string): { heading: string; content: string }[] {
  const body = html
    .replace(/<(script|style|noscript|nav|footer|header|aside|form|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  const blocks: { heading: string; content: string }[] = [];
  let heading = 'Introduction';
  let paragraphs: string[] = [];
  const flush = () => {
    const combined = paragraphs.join(' ');
    if (combined.split(/\s+/).filter(Boolean).length >= 20) blocks.push({ heading, content: combined });
    paragraphs = [];
  };
  for (const m of body.matchAll(/<(h[1-4]|p|li|td|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = decode(m[2]);
    if (/^h[1-4]$/i.test(m[1])) {
      flush();
      heading = text || heading;
    } else if (text.split(/\s+/).length >= 5) {
      paragraphs.push(text);
    }
  }
  flush();
  return blocks;
}

export function analyzeCitability(html: string): PageCitability {
  const scored = extractBlocks(html).map((b) => scorePassage(b.content, b.heading));
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const s of scored) gradeDistribution[s.grade]++;
  const byScore = [...scored].sort((a, b) => b.total - a.total);
  return {
    score: scored.length ? Math.round(scored.reduce((a, s) => a + s.total, 0) / scored.length) : 0,
    passages: scored.length,
    optimalLengthPassages: scored.filter((s) => s.wordCount >= 134 && s.wordCount <= 167).length,
    gradeDistribution,
    top: byScore.slice(0, 5),
    bottom: byScore.slice(-5).reverse(),
  };
}
