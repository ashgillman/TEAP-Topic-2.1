#!/usr/bin/env python3
"""Validate the sourced concept graph and render its per-document text views."""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "graphs.org"


def table(name: str, columns: list[str]) -> list[dict[str, str]]:
    with (ROOT / name).open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream, delimiter="\t")
        if reader.fieldnames != columns:
            raise ValueError(f"{name}: expected columns {columns}, found {reader.fieldnames}")
        rows = list(reader)
    if not rows or any(any(not row[column].strip() for column in columns) for row in rows):
        raise ValueError(f"{name}: empty table or empty required field")
    return rows


def org_cell(value: str) -> str:
    return value.replace("|", r"\vert{}")


def org_table(headers: list[str], rows: list[list[str]]) -> list[str]:
    out = ["| " + " | ".join(map(org_cell, headers)) + " |", "|-" ]
    out.extend("| " + " | ".join(map(org_cell, row)) + " |" for row in rows)
    return out


def build() -> str:
    documents = table("documents.tsv", ["document_id", "region", "authority_class", "summary", "source"])
    concepts = table("concepts.tsv", ["concept_id", "label", "scope_note"])
    edges = table("edges.tsv", ["document_id", "subject", "predicate", "object", "locator", "qualifier"])
    doc_ids = [row["document_id"] for row in documents]
    concept_ids = [row["concept_id"] for row in concepts]
    if len(doc_ids) != len(set(doc_ids)) or len(concept_ids) != len(set(concept_ids)):
        raise ValueError("Document or concept IDs are repeated")
    doc_lookup = {row["document_id"]: row for row in documents}
    concept_lookup = {row["concept_id"]: row for row in concepts}
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    seen = set()
    for index, row in enumerate(edges, 2):
        if row["document_id"] not in doc_lookup:
            raise ValueError(f"edges.tsv:{index}: unknown document")
        for column in ("subject", "object"):
            if row[column] not in concept_lookup:
                raise ValueError(f"edges.tsv:{index}: unknown {column} {row[column]}")
        key = tuple(row[column] for column in ("document_id", "subject", "predicate", "object"))
        if key in seen:
            raise ValueError(f"edges.tsv:{index}: repeated directed claim {key}")
        seen.add(key)
        grouped[row["document_id"]].append(row)
    missing = set(doc_ids) - set(grouped)
    if missing:
        raise ValueError(f"Documents without a graph: {sorted(missing)}")
    neighbours: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        neighbours[edge["subject"]].add(edge["object"])
        neighbours[edge["object"]].add(edge["subject"])
    reached = set()
    stack = [edges[0]["subject"]]
    while stack:
        vertex = stack.pop()
        if vertex in reached:
            continue
        reached.add(vertex)
        stack.extend(neighbours[vertex] - reached)
    if reached != set(concept_ids):
        raise ValueError(f"Union graph has disconnected concepts: {sorted(set(concept_ids) - reached)}")
    for row in documents:
        for column in ("summary", "source"):
            path = row[column]
            if not path.startswith("https://") and not (ROOT / path).is_file():
                raise ValueError(f"{row['document_id']}: missing {column}: {path}")
    listed = {p.stem for p in (ROOT.parent / "summaries").glob("*.org") if p.name != "README.org"}
    if listed != set(doc_ids):
        raise ValueError(f"Graph coverage differs from completed summaries: {sorted(listed ^ set(doc_ids))}")

    lines = [
        "#+title: Sourced concept graphs for the THHS RSPP project",
        "#+FILETAGS: :concept-graph:resource:",
        "",
        "* Reading the graph",
        "Each section is a directed, labelled graph $G_d=(V_d,E_d)$ for one source document.",
        "The shared concept IDs allow a union graph across documents; each edge retains its",
        "source locator and qualifier.  The editable tables are =concepts.tsv=,",
        "=documents.tsv= and =edges.tsv=.  Rebuild this view with =python3 concept-graphs/build.py=.",
        "A shared concept or similar edge does not establish legal adoption or direct historical derivation.",
        "See [[file:README.org][method and interpretation notes]].",
        "",
    ]
    for document in documents:
        doc_id = document["document_id"]
        doc_edges = grouped[doc_id]
        vertices = sorted({node for edge in doc_edges for node in (edge["subject"], edge["object"])})
        lines += [
            f"* {doc_id}",
            f"- Layer :: {document['region']}; {document['authority_class']}.",
            f"- Documents :: [[file:{document['summary']}][Summary]] · " + (
                f"[[file:{document['source']}][Source]]" if not document["source"].startswith("https://")
                else f"[[{document['source']}][Official source]]"
            ),
            f"- Graph :: $|V_d|={len(vertices)}$, $|E_d|={len(doc_edges)}$.",
            "",
            "** Vertices",
        ]
        lines += org_table(["ID", "Concept"], [[node, concept_lookup[node]["label"]] for node in vertices])
        lines += ["", "** Edges"]
        lines += org_table(
            ["From", "Relation", "To", "Source locator", "Qualifier"],
            [[edge["subject"], edge["predicate"], edge["object"], edge["locator"], edge["qualifier"]]
             for edge in doc_edges],
        )
        lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    content = build()
    if "--check" in sys.argv:
        if not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != content:
            raise SystemExit("graphs.org is missing or out of date; run python3 concept-graphs/build.py")
        print("Graph tables and graphs.org validated")
    else:
        OUTPUT.write_text(content, encoding="utf-8")
        print(f"Wrote {OUTPUT}")
