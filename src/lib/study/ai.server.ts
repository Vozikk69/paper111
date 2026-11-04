import { draftPlan } from "./domain.ts";

/** Offline-only fallback tutor. The interactive tutor itself runs in the browser model. */
export async function tutorReply(input: {
  subjectTitle: string;
  description: string;
  history: { role: "user" | "assistant"; content: string }[];
  context: { source: string; text: string }[];
  question: string;
}) {
  const note = input.context[0]?.text;
  if (note) {
    const excerpt = note.slice(0, 900);
    return `I can help you study **${input.subjectTitle}**. I found this related material in your notes:\n\n${excerpt}\n\nTry asking a more specific question about this passage, or open the local tutor in your browser for generated explanations.`;
  }
  return `I can help organize your study of **${input.subjectTitle}**, but the browser-based local model is needed for open-ended explanations. Try reloading the tutor so it can finish downloading its model.\n\nYour question: ${input.question.slice(0, 300)}`;
}

function cleanSentence(value: string) {
  return value
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/\s+/g, " ")
    .replace(/^["'`“”]+|["'`“”]+$/g, "")
    .trim();
}

const JUNK_START =
  /^(chapter|section|figure|table|page|copyright|http|www\.|contents|introduction|abstract|references|bibliography|index)\b/i;

function isUsableSentence(s: string) {
  if (s.length < 45 || s.length > 520) return false;
  if (JUNK_START.test(s)) return false;
  const words = s.split(/\s+/);
  if (words.length < 7) return false;
  const letters = (s.match(/[a-zA-Z]/g) || []).length;
  if (letters < s.length * 0.5) return false;
  // Prefer complete sentences
  if (!/[.!?]"?$/.test(s) && words.length < 12) return false;
  return true;
}

function extractSentences(material: string): string[] {
  const text = material
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/^\s*(?:chapter|section)\s+\d+[^\n]*$/gim, " ")
    .replace(/^\s*\d{1,3}\s*$/gm, " ")
    .replace(/^\s*(?:\d+(?:\.\d+)*\s+)?(?:introduction|naming of alkanes|rules of systematic nomenclature|examples?)\s*$/gim, " ")
    // Text PDFs often emit a running chapter title as a standalone ALL-CAPS line.
    .replace(/^\s*[A-Z][A-Z\s'-]{2,}$/gm, " ")
    // PDF extraction wraps a sentence onto multiple lines. Join those lines
    // before sentence detection so cards are not built from fragments.
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ");

  const raw = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map(cleanSentence)
    .filter(isUsableSentence);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    const key = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (key.length < 25 || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Common words that must never become the "term" of a card. */
const STOP_TERMS = new Set(
  [
    "the", "a", "an", "this", "that", "these", "those", "it", "they", "he", "she",
    "group", "groups", "compound", "compounds", "molecule", "molecules", "formula", "formulas",
    "atom", "atoms", "c",
    "structure", "structures", "sum", "sums", "number", "numbers", "explanation", "explanations",
    "note", "remember", "recall", "notice", "we", "there",
    "war", "wars", "conflict", "conflicts", "battle", "battles", "event", "events",
    "thing", "things", "fact", "facts", "period", "time", "year", "years", "of",
    "people", "country", "countries", "government", "side", "sides", "result",
    "one", "two", "three", "first", "second", "third", "last", "both", "many", "some",
    "most", "other", "another", "such", "same", "new", "old", "main", "major",
  ].map((w) => w.toLowerCase()),
);

function isGoodTerm(term: string): boolean {
  const t = term.trim();
  if (t.length < 3 || t.length > 60) return false;
  const words = t.split(/\s+/);
  if (words.length > 6) return false;
  if (/^(?:note|remember|recall|notice|we|there|here|these|those|this|it|its|they|their|our|your|his|her|again|similarly|if|for|when|because|while|although|unless|since|after|before|whereas|whether|such|thus|hence)\b/i.test(t)) return false;
  // Reject pure stop-words or very generic single words
  if (words.length === 1 && STOP_TERMS.has(t.toLowerCase())) return false;
  if (words.every((w) => STOP_TERMS.has(w.toLowerCase()))) return false;
  return true;
}

type DraftCard = { front: string; back: string; score: number };

function extractNomenclatureRuleCards(material: string): DraftCard[] {
  const lines = material.replace(/\r/g, "").split("\n");
  const cards: DraftCard[] = [];
  let collecting = false;
  let current: { number: number; text: string } | null = null;

  const saveCurrent = () => {
    if (!current) return;
    const text = current.text.replace(/\s+/g, " ").trim();
    if (text.length >= 25) {
      cards.push({
        front: `What is rule ${current.number} of systematic nomenclature?`,
        back: text.slice(0, 700),
        score: 110,
      });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (/^rules? of systematic nomenclature$/i.test(line)) {
      saveCurrent();
      collecting = true;
      continue;
    }
    if (!collecting || !line) continue;
    if (/^\.*\s*(?:examples?|solutions?|draw|chapter|section)\b/i.test(line)) {
      saveCurrent();
      collecting = false;
      continue;
    }
    if (/^\d{1,3}$/.test(line)) continue; // PDF page number

    const numberedRule = /^(\d{1,2})[.)]\s+(.+)$/.exec(line);
    if (numberedRule) {
      const number = Number(numberedRule[1]);
      if (number < 1 || number > 8) continue;
      saveCurrent();
      current = { number, text: numberedRule[2] };
      continue;
    }
    if (current) current.text += ` ${line}`;
  }
  saveCurrent();
  return cards.length >= 2 ? cards : [];
}

/**
 * Turn a fact sentence into a proper study Q→A pair.
 */
function sentenceToCard(sentence: string): DraftCard | null {
  const s = sentence.trim().replace(/\s+/g, " ");
  if (!s) return null;
  // A question copied from notes is a prompt, not an answer to turn into a card.
  if (/^(?:what|why|how|who|where|when|which)\b.*\?$/i.test(s)) return null;

  const ongoingChange = s.match(/^(?:(the)\s+)?(.+?)\s+(?:is|are)\s+(?:also\s+)?(?:accumulating|increasing|decreasing|rising|falling|declining|growing|shrinking|moving|changing)\b/i);
  if (ongoingChange && isGoodTerm(ongoingChange[2])) {
    return {
      front: `What is happening to ${ongoingChange[1] ? "the " : ""}${ongoingChange[2]}?`,
      back: s.slice(0, 700),
      score: 88,
    };
  }

  const foundIn = s.match(/^(?:(the|a|an)\s+)?(.+?)\s+(is|are)\s+found\b/i);
  if (foundIn && isGoodTerm(foundIn[2])) {
    const subject = foundIn[2].replace(/^D\s+enantiomeric\b/i, "D-enantiomeric");
    return {
      front: `Where ${foundIn[3].toLowerCase()} ${foundIn[1] ? `${foundIn[1].toLowerCase()} ` : ""}${subject} found?`,
      back: s.slice(0, 700),
      score: 90,
    };
  }

  const madeWhen = s.match(/^(?:(the|a|an)\s+)?(.+?)\s+is made when\b/i);
  if (madeWhen && isGoodTerm(madeWhen[2])) {
    const subject = madeWhen[2].replace(/^D\s+enantiomer\b/i, "D-enantiomer");
    return {
      front: `When is ${madeWhen[1] ? `${madeWhen[1].toLowerCase()} ` : ""}${subject} made?`,
      back: s.slice(0, 700),
      score: 90,
    };
  }

  const hypothesizedFunction = s.match(/^(?:(the)\s+)?(.+?)\s+(is|are)\s+thought to\s+(?:create|cause|provide|form|enable|help|allow)\b/i);
  if (hypothesizedFunction && isGoodTerm(hypothesizedFunction[2])) {
    const article = hypothesizedFunction[1] ? "the " : "";
    return {
      front: `What ${hypothesizedFunction[3].toLowerCase()} ${article}${hypothesizedFunction[2]} thought to do?`,
      back: s.slice(0, 700),
      score: 90,
    };
  }

  // --- Pattern 1: "X is/was/were/are/refers to …"
  // Capture multi-word proper-ish subjects, not bare "The wars were…"
  const defMatch = s.match(
    /^(?:(A|An|The)\s+)?([A-Z][\w'’-]*(?:\s+(?:[A-Z][\w'’-]*|of|the|and|for|in)){0,5})\s+(is|are|was|were|means|refers to|describes)\s+(.+)$/i,
  );
  if (defMatch) {
    const article = defMatch[1]?.toLowerCase();
    const term = defMatch[2].trim().replace(/\s+/g, " ");
    const verb = defMatch[3].toLowerCase();
    const rest = defMatch[4].trim();
    const weakPredicate = /^(?:(?:much|very|far|slightly|significantly|somewhat)\s+)?(?:more|less|too|quite|rather|small|large|high|low|frequent|complicated|resistant|important|rare|complex)\b|^all\s+too\s+\w+/i;
    const isCopula = ["is", "are", "was", "were"].includes(verb);
    const isOriginalName = verb === "was" && /^originally called\b/i.test(rest);
    const hasClearQuestionForm = !["was", "were"].includes(verb) || isOriginalName;
    if (isGoodTerm(term) && rest.length >= 20 && hasClearQuestionForm && !(isCopula && weakPredicate.test(rest))) {
      const termForQuestion =
        article || term.includes("-") || /[A-Z]/.test(term.slice(1))
          ? term
          : `${term[0].toLowerCase()}${term.slice(1)}`;
      let front: string;
      const phaseTopic = term.match(/^phases of (.+)$/i)?.[1] ?? term.match(/^(.+?)\s+phases$/i)?.[1];
      if (phaseTopic && (verb === "are" || verb === "were")) {
        front = `What are the phases of ${phaseTopic.toLowerCase()}?`;
      } else if (verb === "are" || verb === "were") {
        front = `What ${verb} ${article === "the" ? "the " : ""}${termForQuestion}?`;
      } else if (verb === "refers to" || verb === "means" || verb === "describes") {
        front = verb === "refers to" ? `What does ${termForQuestion} refer to?` : `What does ${termForQuestion} mean?`;
      } else if (verb === "was" && /^originally called\b/i.test(rest)) {
        front = `What was the original name of the ${termForQuestion}?`;
      } else {
        const needsDefiniteArticle = /^(?:geometry|bond angle|study|process|function|structure|relationship|effect|cause)\b/i.test(term);
        const questionArticle = article
          ? `${article} `
          : verb === "is" && needsDefiniteArticle
            ? "the "
            : "";
        front = `What ${verb === "was" ? "was" : "is"} ${questionArticle}${termForQuestion}?`;
      }
      return { front, back: s.slice(0, 700), score: 95 };
    }
  }

  // --- Pattern 1b: active function facts (e.g. "The Golgi apparatus modifies…")
  const functionMatch = s.match(
    /^(the\s+)?([A-Z][\w'’-]*(?:\s+(?:[A-Z][\w'’-]*|of|the|and|for|in|apparatus|membrane|nucleus|reticulum|organelle)){0,5})\s+(produces?|stores?|modifies|sorts|packages|controls?|transports?|moves?|enables?|contains?)\s*[,;:]?\s+(.+)$/i,
  );
  if (functionMatch) {
    const article = functionMatch[1] ? "the " : "";
    const subject = functionMatch[2].trim().replace(/\s+/g, " ");
    const verb = functionMatch[3].toLowerCase();
    if (isGoodTerm(subject) && functionMatch[4].length >= 15) {
      const questionSubject = article
        ? `${article}${subject}`
        : `${subject[0].toLowerCase()}${subject.slice(1)}`;
      const singularVerb = verb.endsWith("s");
      const baseVerb = verb.endsWith("ies")
        ? `${verb.slice(0, -3)}y`
        : singularVerb
          ? verb.slice(0, -1)
          : verb;
      const asksForFunctionList = ["modifies", "sorts", "packages"].includes(verb);
      return {
        front: asksForFunctionList
          ? `What does ${questionSubject} do?`
          : `What ${singularVerb ? "does" : "do"} ${questionSubject} ${baseVerb}?`,
        back: s.slice(0, 700),
        score: 90,
      };
    }
  }

  // --- Pattern 2: "X was fought / took place / occurred from YEAR to YEAR …"
  const fought = s.match(
    /^(?:(?:The)\s+)?([A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*){0,5})\s+(?:was|were)\s+(?:fought|waged|fought out)\b(.+)$/i,
  );
  if (fought) {
    const term = fought[1].trim();
    if (isGoodTerm(term)) {
      return {
        front: `When and between whom was the ${term} fought?`,
        back: s.slice(0, 700),
        score: 92,
      };
    }
  }

  // --- Pattern 3: sentence starting with a year
  const yearStart = s.match(/^In\s+((?:1[6-9]|20)\d{2})[,:]?\s+(.+)$/i);
  if (yearStart && yearStart[2].trim().length >= 25) {
    return {
      front: `What happened in ${yearStart[1]}?`,
      back: s.slice(0, 700),
      score: 85,
    };
  }

  // Year somewhere in a factual sentence about a named event
  const yearAnywhere = s.match(/\b((?:1[6-9]|20)\d{2})\b/);
  const namedEvent = s.match(
    /\b((?:Treaty|War|Battle|Revolution|Act|Conference|Agreement|Empire|Dynasty|Rebellion|Century)(?:\s+of)?\s+[A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*){0,3})/,
  );
  if (yearAnywhere && namedEvent && isGoodTerm(namedEvent[1])) {
    return {
      front: `What is the significance of the ${namedEvent[1]} (${yearAnywhere[1]})?`,
      back: s.slice(0, 700),
      score: 80,
    };
  }

  // --- Pattern 4: cause / effect (active voice only)
  // Avoid matching passive "was/were triggered by…"
  const cause = s.match(
    /^(.{10,90}?)\s+(?:caused|led to|resulted in|sparked|brought about)\s+(.+)$/i,
  );
  if (cause && !/\b(?:was|were|is|are|been)\s*$/i.test(cause[1])) {
    const subject = cause[1].trim().replace(/^(?:the|a|an)\s+/i, "");
    if (
      subject.length >= 8 &&
      !STOP_TERMS.has(subject.toLowerCase()) &&
      !/\b(was|were|is|are)\b/i.test(subject)
    ) {
      const verb = s.match(/\b(caused|led to|resulted in|sparked|brought about)\b/i)?.[1]?.toLowerCase();
      const action =
        verb === "caused" ? "cause" :
        verb === "led to" ? "lead to" :
        verb === "sparked" ? "spark" :
        "bring about";
      const front = verb === "resulted in" ? `What resulted from ${subject}?` : `What did ${subject} ${action}?`;
      return {
        front: front.slice(0, 220),
        back: s.slice(0, 700),
        score: 78,
      };
    }
  }
  // Passive trigger: "X was triggered by Y" → ask what triggered X
  const passiveTrigger = s.match(
    /^(.+?)\s+(?:was|were)\s+triggered by\s+(.+)$/i,
  );
  if (passiveTrigger) {
    const thing = passiveTrigger[1].trim().replace(/^(?:the|a|an)\s+/i, "");
    // Skip ultra-generic subjects
    if (
      thing.length >= 4 &&
      !STOP_TERMS.has(thing.toLowerCase()) &&
      !/^(?:war|wars|conflict|conflicts|it|this|they)$/i.test(thing)
    ) {
      return {
        front: `What triggered the ${thing}?`,
        back: s.slice(0, 700),
        score: 82,
      };
    }
    // Generic subject — ask about the cause instead
    return {
      front: `What triggered these events?`,
      back: s.slice(0, 700),
      score: 70,
    };
  }

  // --- Pattern 4b: "…, causing Y" / "…, leading to Y"
  const causing = s.match(/^(.{20,200}?),\s+causing\s+(.+)$/i);
  if (causing && causing[2].trim().length >= 10) {
    return {
      front: `What did the following lead to?\n${causing[1].trim().slice(0, 120)}`,
      back: causing[2].trim().replace(/\.$/, ""),
      score: 72,
    };
  }

  // --- Pattern 5: "X ceded / opened / established / signed …"
  const action = s.match(
    /^(?:(?:The)\s+)?([A-Z][\w'’-]*(?:\s+(?:of\s+)?[A-Z][\w'’-]*){0,4})\s+(ceded|opened|established|signed|abolished|annexed|declared|forced|required)\b(.+)$/i,
  );
  if (action && isGoodTerm(action[1])) {
    return {
      front: `What did the ${action[1]} ${action[2]}?`,
      back: s.slice(0, 700),
      score: 76,
    };
  }

  // --- Pattern 6: Cloze deletion of a multi-word proper noun or a year
  // Prefer longer proper phrases over single words
  const properPhrase = s.match(
    /\b((?:[A-Z][a-z]+(?:\s+(?:of|the|and))?\s+){0,2}[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  );
  const year = s.match(/\b((?:1[6-9]|20)\d{2}(?:\s*[–-]\s*(?:1[6-9]|20)\d{2})?)\b/);
  const clozeTerm = (() => {
    if (properPhrase && isGoodTerm(properPhrase[1]) && properPhrase[1].split(/\s+/).length >= 2) {
      return properPhrase[1];
    }
    if (year) return year[1];
    if (properPhrase && isGoodTerm(properPhrase[1])) return properPhrase[1];
    return null;
  })();

  if (clozeTerm) {
    const idx = s.indexOf(clozeTerm);
    // Don't cloze the very start of the sentence only (weak)
    // Avoid blanking the first word(s): sentence-initial capitalization often
    // marks an article plus a lowercase concept rather than a named entity.
    if (idx > 4) {
      const blanked = (s.slice(0, idx) + "_____" + s.slice(idx + clozeTerm.length)).trim();
      const front = `Fill in the blank: ${blanked.slice(0, 200)}${/[.!?]$/.test(blanked) ? "" : "."}`;
      if (front.length >= 35 && front.length <= 240) {
        return { front, back: clozeTerm, score: 60 };
      }
    }
  }

  // Skip sentences that do not support a specific, answerable question or cloze.
  return null;
}

/**
 * Create useful extractive cards from notes without an external LLM.
 */
export async function generateCardsFromMaterial(input: {
  material: string;
  count: number;
}) {
  const sentences = extractSentences(input.material);
  if (!sentences.length) {
    throw new Error(
      "I couldn't find enough complete facts in these notes. Add clear sentences with definitions, dates, or causes — or create cards manually.",
    );
  }

  const drafts: DraftCard[] = extractNomenclatureRuleCards(input.material);
  const usedBacks = new Set<string>();
  const usedFronts = new Set<string>();

  for (const sentence of sentences) {
    const card = sentenceToCard(sentence);
    if (!card || card.score < 60) continue;

    const backKey = card.back
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 140);
    const frontKey = card.front
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    if (usedBacks.has(backKey) || usedFronts.has(frontKey)) continue;
    // Reject fronts that are basically the answer
    if (frontKey.length > 35 && backKey.includes(frontKey.slice(0, 35))) continue;
    // Reject useless fronts
    if (/^what is (a|an|the) (war|wars|conflict|event)\?$/i.test(card.front)) continue;

    usedBacks.add(backKey);
    usedFronts.add(frontKey);
    drafts.push(card);
  }

  drafts.sort((a, b) => b.score - a.score);
  const selected = drafts.slice(0, input.count);

  if (!selected.length) {
    throw new Error(
      "I couldn't find enough complete facts in these notes. Add clear sentences with definitions, dates, or causes — or create cards manually.",
    );
  }

  return selected.map((card) => ({
    front: card.front.slice(0, 220),
    back: card.back.slice(0, 800),
  }));
}

export async function generateStudyPlan(input: {
  title: string;
  description: string;
  topics: string;
  today: string;
  examDate: string;
  hoursPerDay: number;
}) {
  return { tasks: draftPlan(input), source: "draft" as const };
}
