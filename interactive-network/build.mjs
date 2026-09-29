import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(siteDirectory, "..");

const documents = {
  rspp: {
    title: "THHS Radiation Therapy RSPP v6.01",
    shortTitle: "LOCAL-RSPP",
    layer: "THHS",
    authority: "Approved local plan",
    summary: "summaries/thhs-rspp-radiation-therapy-practices-v6.0-r1.org",
  },
  act: {
    title: "Radiation Safety Act 1999",
    shortTitle: "QLD-ACT",
    layer: "Queensland",
    authority: "Legally binding legislation",
    summary: "summaries/radiation-safety-act-1999.org",
  },
  reg: {
    title: "Radiation Safety Regulation 2021",
    shortTitle: "QLD-REG",
    layer: "Queensland",
    authority: "Subordinate legislation",
    summary: "summaries/radiation-safety-regulation-2021.org",
  },
  notice: {
    title: "Radiation Safety (Radiation Safety Standards) Notice 2021",
    shortTitle: "QLD-NOTICE",
    layer: "Queensland",
    authority: "Subordinate legislation notifying statutory standards",
    summary: "summaries/radiation-safety-standards-notice-2021.org",
  },
  premises: {
    title: "Standard for premises—ionising radiation sources (2021)",
    shortTitle: "QLD-PREMISES",
    layer: "Queensland",
    authority: "Statutory radiation-safety standard",
    summary: "summaries/standard-for-premises-ionising-radiation-sources-2021.org",
  },
  rpsf1: {
    title: "Fundamentals for Protection Against Ionising Radiation",
    shortTitle: "RPS F-1",
    layer: "Australia",
    authority: "Non-mandatory national fundamentals",
    summary: "summaries/rps-f-1-2014.org",
  },
  ndrp2: {
    title: "National Directory for Radiation Protection, 2nd ed.",
    shortTitle: "NDRP2",
    layer: "Australia",
    authority: "National regulatory framework; jurisdictional adoption required",
    summary: "summaries/ndrp2-2021.org",
  },
  rpsc1: {
    title: "Code for Radiation Protection in Planned Exposure Situations",
    shortTitle: "RPS C-1 Rev. 1",
    layer: "Australia",
    authority: "National code; binding status depends on an identified Queensland mechanism",
    summary: "summaries/rps-c-1-rev-1-2020.org",
  },
  rpsc5: {
    title: "Code for Radiation Protection in Medical Exposure",
    shortTitle: "RPS C-5",
    layer: "Australia",
    authority: "Enforceable Queensland licence condition for relevant practices",
    summary: "summaries/rps-c-5-2019.org",
  },
  rps143: {
    title: "Safety Guide for Radiation Protection in Radiotherapy",
    shortTitle: "RPS 14.3",
    layer: "Australia",
    authority: "Non-mandatory guidance",
    summary: "summaries/rps-14-3-2008.org",
  },
  rps8: {
    title: "Code of Practice for Human Research Exposure",
    shortTitle: "RPS 8",
    layer: "Australia",
    authority: "Enforceable Queensland licence condition for human radiation research",
    summary: "summaries/rps-8-2005.org",
  },
  rps11: {
    title: "Code of Practice for the Security of Radioactive Sources",
    shortTitle: "RPS 11",
    layer: "Australia",
    authority: "Enforceable Queensland licence condition for security-enhanced sources",
    summary: "summaries/rps-11-2019.org",
  },
  rpsc2: {
    title: "Code for the Safe Transport of Radioactive Material",
    shortTitle: "RPS C-2 Rev. 1",
    layer: "Australia",
    authority: "Transport licence condition where applicable",
    summary: "summaries/rps-c-2-rev-1-2019.org",
  },
  icrp103: {
    title: "The 2007 Recommendations of the ICRP",
    shortTitle: "ICRP 103",
    layer: "International",
    authority: "International recommendation and professional consensus",
    summary: "summaries/icrp-publication-103-2007.org",
  },
  sf1: {
    title: "Fundamental Safety Principles",
    shortTitle: "IAEA SF-1",
    layer: "International",
    authority: "International safety fundamentals; not direct Queensland law",
    summary: "summaries/iaea-sf-1-2006.org",
  },
  gsr3: {
    title: "Radiation Protection and Safety of Radiation Sources: International Basic Safety Standards",
    shortTitle: "IAEA GSR Part 3",
    layer: "International",
    authority: "International safety requirements; not direct Queensland law",
    summary: "summaries/iaea-gsr-part-3-2014.org",
  },
  ssg46: {
    title: "Radiation Protection and Safety in Medical Uses of Ionizing Radiation",
    shortTitle: "IAEA SSG-46",
    layer: "International",
    authority: "Non-binding international safety guide",
    summary: "summaries/iaea-ssg-46-2018.org",
  },
  srs47: {
    title: "Radiation Protection in the Design of Radiotherapy Facilities",
    shortTitle: "IAEA SRS 47",
    layer: "International",
    authority: "Non-binding international technical report",
    summary: "summaries/iaea-safety-reports-series-47-2006.org",
  },
  procedure: {
    title: "Controlled departmental procedures",
    shortTitle: "PROCEDURES",
    layer: "THHS",
    authority: "Implementation layer; not an upstream source document",
    unavailable: "This node represents the controlled procedures that operationalise the approved RSPP. It is not mapped to one summary document.",
  },
  workinstructions: {
    title: "Controlled departmental work instructions",
    shortTitle: "WORK INSTRUCTIONS",
    layer: "THHS",
    authority: "Detailed implementation layer; not an upstream source document",
    unavailable: "This node represents the task-specific work instructions that implement controlled departmental procedures. It is not mapped to one summary document.",
  },
  records: {
    title: "Implementation records",
    shortTitle: "RECORDS",
    layer: "THHS",
    authority: "Evidence layer; not an upstream source document",
    unavailable: "This node represents the prescriptions, QA results, monitoring records and incident records that demonstrate implementation. It is not a source document with a separate summary.",
  },
};

function cleanOrgInline(text) {
  return text
    .replace(/\[\[[^\]]+\]\[([^\]]+)\]\]/g, "$1")
    .replace(/([/~_=*+])([^\n]+?)\1/g, "$2")
    .replace(/\\([\[\]])/g, "$1")
    .trim();
}

function extractKeyTakeaways(source, sourcePath) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\* Key takeaways(?:\s|$)/i.test(line));
  if (start === -1) {
    throw new Error(`No Key takeaways section found in ${sourcePath}`);
  }

  const takeaways = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\* /.test(line)) break;
    if (/^- /.test(line)) {
      takeaways.push(cleanOrgInline(line.slice(2)));
    } else if (takeaways.length && line.trim()) {
      takeaways[takeaways.length - 1] += ` ${cleanOrgInline(line)}`;
    }
  }

  if (!takeaways.length) {
    throw new Error(`Key takeaways section is empty in ${sourcePath}`);
  }
  return takeaways;
}

const svgSource = await readFile(
  path.join(projectDirectory, "figures/document-relationship-network.svg"),
  "utf8",
);
const svgNodeIds = new Set(
  [...svgSource.matchAll(/<g id="[^"]+" class="node">\s*<title>([^<]+)<\/title>/g)].map(
    (match) => match[1],
  ),
);

for (const nodeId of svgNodeIds) {
  if (!documents[nodeId]) throw new Error(`No page metadata for SVG node: ${nodeId}`);
}
for (const nodeId of Object.keys(documents)) {
  if (!svgNodeIds.has(nodeId)) throw new Error(`No SVG node for page metadata: ${nodeId}`);
}

for (const document of Object.values(documents)) {
  if (!document.summary) {
    document.takeaways = [];
    continue;
  }
  const summaryPath = path.join(projectDirectory, document.summary);
  const source = await readFile(summaryPath, "utf8");
  document.takeaways = extractKeyTakeaways(source, document.summary);
  document.summaryHtml = document.summary.replace(/\.org$/, ".html");
}

const summaryCount = Object.values(documents).filter(
  (document) => document.takeaways.length,
).length;

const output = {
  summaryCount,
  nodeCount: Object.keys(documents).length,
  documents,
};

await writeFile(
  path.join(siteDirectory, "summary-data.js"),
  `window.SUMMARY_DATA = Object.freeze(${JSON.stringify(output, null, 2)});\n`,
  "utf8",
);
await writeFile(
  path.join(siteDirectory, "network-svg.js"),
  `window.NETWORK_SVG = ${JSON.stringify(svgSource)};\n`,
  "utf8",
);
await copyFile(
  path.join(projectDirectory, "figures/document-relationship-network.svg"),
  path.join(siteDirectory, "network.svg"),
);

console.log(`Built interactive network with ${summaryCount} summaries.`);
