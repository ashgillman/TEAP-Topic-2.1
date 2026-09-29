(() => {
  "use strict";

  const root = new URL("../concept-graphs/", document.baseURI);
  const layers = [
    ["local", "Local RSPP"],
    ["queensland", "Queensland"],
    ["australia", "Australia"],
    ["international", "International"],
  ];

  async function table(name, columns) {
    const response = await fetch(new URL(name, root), { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`);
    const lines = (await response.text()).trim().split(/\r?\n/);
    const header = lines.shift().split("\t");
    if (header.join("\t") !== columns.join("\t")) throw new Error(`${name}: unexpected columns`);
    return lines.map((line, index) => {
      const cells = line.split("\t");
      if (cells.length !== columns.length || cells.some((cell) => !cell.trim())) {
        throw new Error(`${name}:${index + 2}: malformed row`);
      }
      return Object.fromEntries(header.map((key, i) => [key, cells[i]]));
    });
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  async function load() {
    const [conceptRows, documentRows, claims, crosswalk] = await Promise.all([
      table("concepts.tsv", ["concept_id", "label", "scope_note"]),
      table("documents.tsv", ["document_id", "region", "authority_class", "summary", "source"]),
      table("edges.tsv", ["document_id", "subject", "predicate", "object", "locator", "qualifier"]),
      table("crosswalk.tsv", ["local_concept_id", "source_concept_id", "document_id", "locator_filter", "mapping_kind", "note"]),
    ]);
    const concepts = new Map(conceptRows.map((row) => [row.concept_id, row]));
    const documentIds = new Set(documentRows.map((row) => row.document_id));
    const localDoc = documentRows.find((row) => row.region === "local");
    if (!localDoc || concepts.size !== conceptRows.length || documentIds.size !== documentRows.length) {
      throw new Error("Missing local document or repeated IDs");
    }
    for (const claim of claims) {
      if (!documentIds.has(claim.document_id) || !concepts.has(claim.subject) || !concepts.has(claim.object)) {
        throw new Error("Claim refers to an unknown document or concept");
      }
    }
    const localIds = new Set(claims.filter((row) => row.document_id === localDoc.document_id)
      .flatMap((row) => [row.subject, row.object]));
    for (const row of crosswalk) {
      if (!localIds.has(row.local_concept_id) || !concepts.has(row.source_concept_id)
          || (row.document_id !== "*" && !documentIds.has(row.document_id))) {
        throw new Error("Crosswalk refers to an unknown local or source concept");
      }
      if (!claims.some((claim) => (row.document_id === "*" || row.document_id === claim.document_id)
          && (row.locator_filter === "*" || row.locator_filter === claim.locator)
          && (claim.subject === row.source_concept_id || claim.object === row.source_concept_id))) {
        throw new Error(`Crosswalk has no source passage: ${row.local_concept_id} → ${row.source_concept_id}`);
      }
    }
    const documents = await Promise.all(documentRows.map(async (row) => {
      const orgUrl = new URL(row.summary, root);
      const summaryUrl = new URL(row.summary.replace(/\.org$/i, ".html"), root);
      const [orgResponse, htmlResponse] = await Promise.all([
        fetch(orgUrl, { cache: "no-store" }),
        fetch(summaryUrl, { cache: "no-store" }),
      ]);
      if (!orgResponse.ok || !htmlResponse.ok) throw new Error(`Could not load summary ${row.summary}`);
      const title = (await orgResponse.text()).match(/^#\+title:\s*(.+)$/im)?.[1]?.trim() || row.document_id;
      const html = new DOMParser().parseFromString(await htmlResponse.text(), "text/html");
      const headings = [...html.querySelectorAll("#content h2[id], #content h3[id], #content h4[id]")]
        .map((heading) => {
          const copy = heading.cloneNode(true);
          copy.querySelector('[class^="section-number-"]')?.remove();
          return { id: heading.id, title: copy.textContent.trim() };
        });
      return {
        ...row,
        title,
        headings,
        summaryUrl: summaryUrl.href,
        sourceUrl: new URL(row.source, root).href,
      };
    }));
    return { concepts, localIds, localDoc, documents, claims, crosswalk };
  }

  function addLinks(card, source) {
    const links = element("div", "source-links");
    for (const [label, url] of [["Summary", source.summaryUrl], ["Source", source.sourceUrl]]) {
      const link = element("a", "", label);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      links.append(link);
    }
    card.append(links);
  }

  function summarySection(source, claim) {
    const locator = claim.locator;
    const find = (prefix) => source.headings.find((heading) => heading.title.toLowerCase().startsWith(prefix.toLowerCase()));
    const id = source.document_id;
    let heading;
    if (id === "radiation-safety-regulation-2021") {
      const section = Number(locator.match(/\b(?:ss?\.?\s*)(\d+)/i)?.[1]);
      if (/Part 5 Division 3/i.test(locator) || (section >= 38 && section <= 44)) heading = find("Sections 38–44");
      else if (section >= 29 && section <= 37) heading = find("Sections 29–37");
      else if (/Part 6/.test(locator)) heading = find("Part 6");
      else if (locator === "Part 4 ss 14–24") heading = find("Part 4");
      else if (section >= 14 && section <= 18) heading = find("Sections 14–18");
      else if (section >= 19 && section <= 24) heading = find("Sections 19–24");
      else if (section >= 52 && section <= 55 || /Schedule 5/.test(locator)) heading = find("Part 8 and Schedule 5");
      else if (/Part 7/.test(locator)) heading = find("Part 7");
      else if (/Part 5/.test(locator)) heading = find("Part 5");
      else if (/Part 4/.test(locator)) heading = find("Part 4");
    } else if (id === "radiation-safety-act-1999") {
      if (/ss?\s*4[–-]5/.test(locator)) heading = find("Part 1");
      else if (/ss?\s*16[–-]18/.test(locator)) heading = find("Part 3");
      else if (/ss?\s*28|ss?\s*3[0-4]/.test(locator)) heading = find("Division 1 — Radiation safety");
      else if (/security/i.test(claim.qualifier)) heading = find("Divisions 1A and 1B");
      else if (/ss?\s*3[5-7]/.test(locator)) heading = find("Division 2");
      else if (/ss?\s*3[8-9]|ss?\s*4[0-9]/.test(locator)) heading = find("Divisions 3–8");
      else if (/Parts 4[–-]6/.test(locator)) heading = find("Parts 4 and 5");
    } else if (id.startsWith("thhs-rspp-")) {
      const local = /§\s*9\.1\b/.test(locator) ? "9.1" : locator.match(/§\s*(\d+(?:\.\d+)?)/)?.[1];
      if (local) heading = find(`${local} `) || find(`${local}.`);
    } else if (id === "iaea-ssg-46-2018" && /§\s*5\./.test(locator)) {
      const paragraph = Number(locator.match(/§\s*5\.(\d+)/)?.[1]);
      if (paragraph >= 282) heading = find("Public protection, accidents and transport");
      else if (paragraph >= 189) heading = find("Individuals undergoing medical exposure");
      else if (paragraph >= 93) heading = find("Occupational protection");
      else heading = find("General and facility/equipment safety");
    } else if (id === "iaea-gsr-part-3-2014") {
      if (/Schedule/.test(locator)) heading = find("Schedules");
      else if (/occupational/i.test(locator)) heading = find("Occupational exposure");
      else if (/medical exposure/i.test(locator)) heading = find("Medical exposure");
    } else if (id === "iaea-sf-1-2006" && /Principle/.test(locator)) {
      heading = find("3 — Fundamental safety principles");
    } else if (id === "iaea-nss-11-g-rev-1-2019") {
      heading = find("Section 4");
    } else if (id === "iaea-nss-46-t-2024") {
      heading = /§§5[–-]7/.test(locator) ? find("Section 7") : find("Sections 4–6");
    } else if (id === "iaea-ssr-6-rev-1-2018") {
      heading = /Sections IV[–-]VI/.test(locator) ? find("Section IV") : find("Section V");
    } else if (id === "iaea-gsg-7-2018") {
      if (/§3\.66/.test(locator)) heading = find("Radiation protection officer");
      else if (/§3\.122/.test(locator)) heading = find("Investigation levels");
      else if (/§3\.132/.test(locator)) heading = find("Exposure records");
      else heading = find("Monitoring and assessment");
    } else if (id === "standard-for-premises-ionising-radiation-sources-2021") {
      if (/§2\.1/.test(locator)) heading = find("Section 2.1");
      else if (/§3\.3/.test(locator)) heading = find("Section 3.3");
      else if (/§3\.4/.test(locator)) heading = find("Section 3.4");
      else heading = find("Section 1");
    } else if (id === "ndrp2-2021") {
      heading = /Schedule/.test(locator) ? find("Schedules") : find("Part B");
    } else if (id === "rps-14-3-2008") {
      if (/§13\./.test(locator)) heading = find("11–14");
      else if (/§12\./.test(locator)) heading = find("11–14");
      else if (/§1[–-]3/.test(locator)) heading = find("1–3");
      else if (/§3\.6/.test(locator)) heading = find("1–3");
      else if (/Annex B/.test(locator)) heading = find("Annexes");
    }
    if (!heading) {
      const named = locator.match(/\b(?:Schedule|Annex)\s+([A-Z])/i);
      if (named) heading = find(`${named[0]}`) || find("Schedules") || find("Annexes");
    }
    if (!heading) {
      const number = locator.match(/§\s*(\d+)/)?.[1];
      if (number) heading = find(`${number} —`) || find(`${number} `);
    }
    if (!heading && /Principle/.test(locator)) heading = find("4 — Fundamental principles");
    return heading;
  }

  function addClaims(container, matches, concepts, source) {
    for (const match of matches) {
      const row = element("div", "claim");
      if (match.kind) {
        row.append(element("div", "match-kind", `${match.kind}: ${concepts.get(match.sourceId).label}`));
      }
      row.append(element("p", "locator", match.claim.locator));
      row.append(element("p", "", match.claim.qualifier));
      const section = summarySection(source, match.claim);
      if (section) {
        const link = element("a", "section-link", `Read summary section: ${section.title}`);
        link.href = `${source.summaryUrl}#${section.id}`;
        row.append(link);
      }
      container.append(row);
    }
  }

  function render(data, id) {
    const concept = data.concepts.get(id);
    if (!concept || !data.localIds.has(id)) return;
    document.getElementById("selected-title").textContent = concept.label;
    document.getElementById("selected-note").textContent = concept.scope_note;
    const aliases = data.crosswalk.filter((row) => row.local_concept_id === id);
    document.getElementById("mapping-note").textContent = id === "alara"
      ? "Upstream sources express ALARA through optimisation. Queensland Regulation Part 4 sets a broader RSPP content framework without prescribing the acronym."
      : id === "rso"
        ? "IAEA sources call the analogous role a radiation protection officer (RPO). Queensland law defines the local RSO's appointment, certification and duties."
        : [...new Set(aliases.map((row) => row.note))].join(" ");
    const map = document.getElementById("source-map");
    map.replaceChildren();

    for (const [region, title] of layers) {
      const layer = element("section", `layer ${region}`);
      const sources = data.documents.filter((row) => row.region === region);
      let shown = 0;
      for (const source of sources) {
        const rawMatches = data.claims.filter((claim) => claim.document_id === source.document_id)
          .flatMap((claim) => {
            const found = [];
            if (claim.subject === id || claim.object === id) found.push({ claim, sourceId: id, kind: "" });
            if (region !== "local") {
              for (const alias of aliases) {
                if ((alias.document_id === "*" || alias.document_id === source.document_id)
                    && (alias.locator_filter === "*" || alias.locator_filter === claim.locator)
                    && (alias.mapping_kind !== "conceptual equivalent" || claim.object === alias.source_concept_id)
                    && (claim.subject === alias.source_concept_id || claim.object === alias.source_concept_id)) {
                  found.push({ claim, sourceId: alias.source_concept_id, kind: alias.mapping_kind });
                }
              }
            }
            return found;
          });
        const seenClaims = new Set();
        const matches = rawMatches.filter((match) => {
          if (seenClaims.has(match.claim)) return false;
          seenClaims.add(match.claim);
          return true;
        });
        if (!matches.length) continue;
        shown++;
        const card = element("article", "source-card");
        card.append(element("h4", "", source.title));
        card.append(element("span", "badge", source.authority_class));
        addClaims(card, matches.slice(0, 3), data.concepts, source);
        if (matches.length > 3) {
          const more = element("details", "");
          more.append(element("summary", "", `Show ${matches.length - 3} more cited passages`));
          addClaims(more, matches.slice(3), data.concepts, source);
          card.append(more);
        }
        addLinks(card, source);
        layer.append(card);
      }
      layer.prepend(element("h3", "", `${title} · ${shown} ${shown === 1 ? "document" : "documents"}`));
      if (!shown) layer.append(element("p", "empty", "No passage mapped in the current dataset."));
      map.append(layer);
    }
    if (location.hash.slice(1) !== encodeURIComponent(id)) history.replaceState(null, "", `#${encodeURIComponent(id)}`);
  }

  function start(data) {
    const search = document.getElementById("concept-search");
    const select = document.getElementById("concept-select");
    const count = document.getElementById("concept-count");
    const choices = [...data.localIds].map((id) => data.concepts.get(id))
      .sort((a, b) => a.label.localeCompare(b.label));
    let selected = data.localIds.has(decodeURIComponent(location.hash.slice(1)))
      ? decodeURIComponent(location.hash.slice(1)) : "justification";
    if (!data.localIds.has(selected)) selected = choices[0].concept_id;

    function updateOptions() {
      const query = search.value.trim().toLowerCase();
      const filtered = choices.filter((row) => `${row.label} ${row.concept_id}`.toLowerCase().includes(query));
      select.replaceChildren(...filtered.map((row) => {
        const option = element("option", "", row.label);
        option.value = row.concept_id;
        return option;
      }));
      if (filtered.some((row) => row.concept_id === selected)) {
        select.value = selected;
      } else if (filtered.length) {
        selected = filtered[0].concept_id;
        select.value = selected;
        render(data, selected);
      }
      count.textContent = `${filtered.length} of ${choices.length} local concepts`;
    }
    search.addEventListener("input", updateOptions);
    select.addEventListener("change", () => {
      selected = select.value;
      render(data, selected);
    });
    window.addEventListener("hashchange", () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (data.localIds.has(id)) {
        selected = id;
        search.value = "";
        updateOptions();
        render(data, id);
      }
    });
    updateOptions();
    render(data, selected);
  }

  load().then(start).catch((error) => {
    document.getElementById("selected-title").textContent = "Could not load the source map";
    document.getElementById("selected-note").textContent = `${error.message}. Serve the project root over HTTP and reload.`;
    console.error(error);
  });
})();
