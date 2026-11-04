import assert from "node:assert/strict";
import test from "node:test";
import { hasUnexpectedChinese, localTutorReply } from "../src/lib/study/local-ai.ts";
import { generateCardsFromMaterial } from "../src/lib/study/ai.server.ts";
import {
  applySm2,
  draftPlan,
  isDay,
  isTutorReplySaveable,
  retrieveRelevantChunks,
} from "../src/lib/study/domain.ts";

const source = "chapter-2-alkanes.pdf";
const noteChunks = [
  {
    source,
    noteId: "alkanes",
    position: 4,
    text: [
      "Rules of Systematic Nomenclature",
      "1. Name the longest unbranched carbon chain in the structure.",
      "2. List attached alkyl groups in alphabetical order.",
    ].join("\n"),
  },
  {
    source,
    noteId: "alkanes",
    position: 5,
    text: [
      "2. List attached alkyl groups in alphabetical order.",
      "3. Use prefixes such as di- or tri- for repeated groups.",
      "4. Number the groups from the end with the lowest sum.",
    ].join("\n"),
  },
  {
    source: "unrelated-notes.txt",
    noteId: "other",
    position: 0,
    text: "Photosynthesis converts light energy into chemical energy.",
  },
];

test("retrieves the naming section and the adjacent chunk that completes its list", async () => {
  const context = retrieveRelevantChunks("Rules of Systematic Nomenclature", noteChunks);
  assert.deepEqual(context.map((chunk) => chunk.position), [4, 5]);

  const reply = await localTutorReply({
    subjectTitle: "Chemistry",
    description: "",
    history: [],
    context,
    question: "Rules of Systematic Nomenclature",
  });
  for (const rule of [
    "1. Name the longest unbranched carbon chain",
    "2. List attached alkyl groups",
    "3. Use prefixes such as di- or tri-",
    "4. Number the groups",
  ]) assert.ok(reply.includes(rule), `missing rule: ${rule}`);
  assert.ok(reply.includes(source));
  assert.ok(!reply.includes("double bond"));
});

test("normalizes alkane singular/plural and answers from the matching definition", async () => {
  const chunks = [
    { source, noteId: "alkanes", position: 0, text: "Alkanes are organic compounds containing carbon and hydrogen with single bonds only." },
    { source: "other.txt", noteId: "other", position: 0, text: "Water is a polar molecule." },
  ];
  const context = retrieveRelevantChunks("What is an alkane?", chunks);
  assert.equal(context[0]?.source, source);
  const reply = await localTutorReply({
    subjectTitle: "Chemistry",
    description: "",
    history: [],
    context,
    question: "What is an alkane?",
  });
  assert.ok(reply.includes("single bonds only"));
  assert.ok(reply.includes("[1]"));
});

test("declines unsupported topics and hides non-factual replies from card saving", async () => {
  const context = retrieveRelevantChunks("What is photosynthesis?", noteChunks.slice(0, 2));
  assert.deepEqual(context, []);
  const reply = await localTutorReply({
    subjectTitle: "Chemistry",
    description: "",
    history: [],
    context,
    question: "What is photosynthesis?",
  });
  assert.match(reply, /don’t see relevant notes/i);
  assert.equal(isTutorReplySaveable(reply), false);
  assert.equal(isTutorReplySaveable("Alkanes have carbon-carbon single bonds. [1]"), true);
});

test("rejects unexpected Chinese characters while allowing Chinese questions and translations", () => {
  assert.equal(hasUnexpectedChinese("What is chemistry?", "化学 is the study of substances."), true);
  assert.equal(hasUnexpectedChinese("What is chemistry?", "Chemistry studies substances and reactions."), false);
  assert.equal(hasUnexpectedChinese("Translate chemistry into Chinese", "化学"), false);
  assert.equal(hasUnexpectedChinese("什么是化学？", "化学研究物质及其变化。"), false);
});

test("validates real calendar dates and keeps generated tasks inside the exam range", () => {
  assert.equal(isDay("2026-11-05"), true);
  assert.equal(isDay("2026-02-30"), false);
  assert.equal(isDay("2026-2-05"), false);

  const tasks = draftPlan({
    title: "Chemistry",
    description: "Alkanes and nomenclature",
    topics: "Alkane structure\nSystematic nomenclature",
    today: "2026-11-05",
    examDate: "2026-11-12",
    hoursPerDay: 2,
  });
  assert.ok(tasks.length > 0);
  assert.ok(tasks.every((task) => task.dueDate >= "2026-11-05" && task.dueDate <= "2026-11-12"));
});

test("SM-2 again resets repetitions while a good review advances the interval", () => {
  const now = new Date("2026-11-05T12:00:00.000Z");
  const card = { easinessFactor: 2.5, interval: 6, repetitions: 2 };
  const again = applySm2(card, 1, now);
  assert.equal(again.repetitions, 0);
  assert.equal(again.interval, 1);

  const good = applySm2({ easinessFactor: 2.5, interval: 1, repetitions: 1 }, 4, now);
  assert.equal(good.repetitions, 2);
  assert.equal(good.interval, 6);
  assert.ok(good.nextReviewDate.startsWith("2026-11-11"));
});

test("generated cards join PDF line wraps and skip generic introductory subjects", async () => {
  const cards = await generateCardsFromMaterial({
    material: [
      "CHAPTER 2",
      "ALKANES",
      "2.1 Introduction",
      "Alkanes are organic compounds containing carbon and",
      "hydrogen with single bonds only.",
      "There is one less H atom so that the CH3 group can be bonded by its fourth bond to the propane chain.",
      "If there are several groups of the same kind, list each group once and use the right prefix.",
      "For the formula C5H12 there are 3 isomers as shown below.",
      "The first molecule is the unbranched chain pentane.",
      "The sum of the numbers is 9, so numbering from left to right is preferred.",
      "The C-F bond is much more resistant to UV light than the C-Cl bond.",
      "Methyl bromide is also a very potent ozone destroyer and there have been calls for taking it off the market.",
      "What is the bond angle in a 3-membered cyclic ring?",
      "Thus cycloheptane and larger rings are stable molecules.",
      "The large ring is thought to create a hole in the fungal membrane.",
      "The explanation of both notations is somewhat complex and will be omitted.",
      "Perfluorochemicals are also accumulating in the environment due to their persistence.",
      "The last C is not chiral because it has only three groups bonded to it.",
      "Hence there is one chiral atom, the central C atom.",
      "D enantiomeric amino acids are found occasionally, such as in bacterial cell walls.",
      "The D-enantiomer of this molecule is made when glucose is metabolized.",
      "Those bonds are different and hence 3-methylcyclohexanone exists as two enantiomers.",
      "2.2 Naming of Alkanes",
      "Rules of Systematic Nomenclature",
      "1. Name the longest unbranched carbon chain in the structure.",
      "2. List attached alkyl groups in alphabetical order.",
      "3. Use prefixes for repeated groups such as di- or tri-.",
      "4. Number the groups from the end with the lowest sum.",
      "Examples: Draw and name an isomer.",
    ].join("\n"),
    count: 30,
  });

  assert.ok(cards.some((card) => card.front === "What are alkanes?"));
  assert.ok(cards.some((card) => card.back.includes("carbon and hydrogen with single bonds only")));
  assert.ok(cards.some((card) => card.front === "What is rule 1 of systematic nomenclature?"));
  assert.ok(cards.some((card) => card.front === "What is rule 4 of systematic nomenclature?"));
  assert.ok(cards.some((card) => card.front === "What is methyl bromide?"));
  assert.ok(cards.some((card) => card.front === "What is the large ring thought to do?"));
  assert.ok(cards.some((card) => card.front === "What is happening to Perfluorochemicals?"));
  assert.ok(cards.some((card) => card.front === "Where are D-enantiomeric amino acids found?"));
  assert.ok(cards.some((card) => card.front === "When is the D-enantiomer of this molecule made?"));
  assert.ok(cards.every((card) => card.front !== "What is there?"));
  assert.ok(cards.every((card) => card.front !== "What are if there?"));
  assert.ok(cards.every((card) => !/what (?:are for|is the first molecule|is the sum of|is the c-f bond)/i.test(card.front)));
  assert.ok(cards.every((card) => card.front !== "What is what?"));
  assert.ok(cards.every((card) => !card.front.startsWith("What are thus")));
  assert.ok(cards.every((card) => !card.front.toLowerCase().includes("explanation")));
  assert.ok(cards.every((card) => !card.front.startsWith("What is the last C")));
  assert.ok(cards.every((card) => !card.front.startsWith("What is hence")));
  assert.ok(cards.every((card) => !card.front.startsWith("What are those bonds")));
  assert.ok(cards.every((card) => !card.front.includes("ALKANES Alkanes")));
  assert.ok(cards.every((card) => !card.back.startsWith("There is one less H atom")));
  assert.ok(cards.every((card) => !card.back.startsWith("If there are several groups")));
});
