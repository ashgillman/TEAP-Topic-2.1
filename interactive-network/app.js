(() => {
  "use strict";

  const model = window.SUMMARY_DATA;
  if (!model?.documents) {
    throw new Error("Summary data is unavailable. Run node interactive-network/build.mjs.");
  }

  const elements = {
    canvas: document.getElementById("network-canvas"),
    viewport: document.getElementById("network-viewport"),
    coverage: document.getElementById("coverage-note"),
    layer: document.getElementById("layer-pill"),
    status: document.getElementById("summary-status"),
    shortTitle: document.getElementById("short-title"),
    title: document.getElementById("document-title"),
    authority: document.getElementById("authority"),
    heading: document.getElementById("takeaway-heading"),
    list: document.getElementById("takeaway-list"),
    unavailable: document.getElementById("unavailable-message"),
    fullSummaryLink: document.getElementById("full-summary-link"),
    zoomOut: document.getElementById("zoom-out"),
    zoomReset: document.getElementById("zoom-reset"),
    zoomIn: document.getElementById("zoom-in"),
  };

  const baseWidth = 1200;
  const minimumZoom = 0.7;
  const maximumZoom = 1.65;
  const zoomStep = 0.15;
  let zoom = 1;
  let selectedNode = null;
  let svgRoot = null;

  elements.coverage.textContent = `${model.summaryCount} of ${model.nodeCount} document nodes have summary takeaways.`;

  function setZoom(nextZoom) {
    const previousWidth = baseWidth * zoom;
    const previousCentre = elements.viewport.scrollLeft + elements.viewport.clientWidth / 2;
    zoom = Math.min(maximumZoom, Math.max(minimumZoom, nextZoom));
    const nextWidth = baseWidth * zoom;
    elements.canvas.style.width = `${nextWidth}px`;
    elements.zoomOut.disabled = zoom <= minimumZoom;
    elements.zoomIn.disabled = zoom >= maximumZoom;

    requestAnimationFrame(() => {
      const ratio = nextWidth / previousWidth;
      elements.viewport.scrollLeft = previousCentre * ratio - elements.viewport.clientWidth / 2;
    });
  }

  function fitDiagram() {
    const available = Math.max(320, elements.viewport.clientWidth - 24);
    setZoom(Math.min(1, Math.max(minimumZoom, available / baseWidth)));
    elements.viewport.scrollLeft = 0;
    elements.viewport.scrollTop = 0;
  }

  elements.zoomOut.addEventListener("click", () => setZoom(zoom - zoomStep));
  elements.zoomIn.addEventListener("click", () => setZoom(zoom + zoomStep));
  elements.zoomReset.addEventListener("click", fitDiagram);

  function renderDocument(nodeId) {
    const documentData = model.documents[nodeId];
    if (!documentData) return;

    selectedNode?.classList.remove("is-selected");
    selectedNode = svgRoot?.querySelector(`g.node[data-node-id="${nodeId}"]`) ?? null;
    selectedNode?.classList.add("is-selected");

    const hasSummary = documentData.takeaways.length > 0;
    elements.layer.textContent = documentData.layer;
    elements.layer.dataset.layer = documentData.layer;
    elements.status.textContent = hasSummary ? "Summary available" : "No dedicated summary";
    elements.status.classList.toggle("is-missing", !hasSummary);
    elements.shortTitle.textContent = documentData.shortTitle;
    elements.title.textContent = documentData.title;
    elements.authority.textContent = documentData.authority;
    elements.heading.textContent = hasSummary ? "Key takeaways" : "Summary status";
    elements.list.replaceChildren();

    for (const takeaway of documentData.takeaways) {
      const item = document.createElement("li");
      item.textContent = takeaway;
      elements.list.append(item);
    }

    elements.list.hidden = !hasSummary;
    elements.unavailable.hidden = hasSummary;
    elements.unavailable.textContent = documentData.unavailable ?? "No summary is mapped.";
    elements.fullSummaryLink.hidden = !hasSummary;
    if (hasSummary) {
      elements.fullSummaryLink.href = `../${documentData.summaryHtml}`;
      elements.fullSummaryLink.textContent = `Read the full ${documentData.shortTitle} summary`;
    } else {
      elements.fullSummaryLink.removeAttribute("href");
    }
  }

  function installSvgInteractions() {
    elements.canvas.innerHTML = window.NETWORK_SVG ?? "";
    svgRoot = elements.canvas.querySelector("svg");
    if (!svgRoot) {
      elements.coverage.textContent = "The network could not be made interactive.";
      return;
    }

    const namespace = "http://www.w3.org/2000/svg";
    const style = document.createElementNS(namespace, "style");
    style.textContent = `
      g.node.is-interactive { cursor: pointer; }
      g.node.is-interactive > path,
      g.node.is-interactive > polygon,
      g.node.is-interactive > ellipse {
        transition: filter 120ms ease, stroke-width 120ms ease;
      }
      g.node.is-interactive:hover > path,
      g.node.is-interactive:hover > polygon,
      g.node.is-interactive:hover > ellipse {
        filter: drop-shadow(0 2px 3px rgba(15, 23, 42, 0.24));
        stroke-width: 2.4;
      }
      g.node.is-selected > path,
      g.node.is-selected > polygon,
      g.node.is-selected > ellipse {
        stroke: #111827 !important;
        stroke-width: 3.1 !important;
        filter: drop-shadow(0 3px 4px rgba(15, 23, 42, 0.28));
      }
      @media (prefers-reduced-motion: reduce) {
        g.node.is-interactive > path,
        g.node.is-interactive > polygon,
        g.node.is-interactive > ellipse { transition: none; }
      }
    `;
    svgRoot.append(style);

    for (const node of svgRoot.querySelectorAll("g.node")) {
      const nodeId = node.querySelector(":scope > title")?.textContent?.trim();
      const documentData = model.documents[nodeId];
      if (!documentData) continue;

      node.dataset.nodeId = nodeId;
      node.classList.add("is-interactive");
      node.addEventListener("click", () => renderDocument(nodeId));
    }

    renderDocument("rspp");
    fitDiagram();
  }

  installSvgInteractions();
  window.addEventListener("resize", () => {
    if (window.innerWidth <= 680 && zoom < minimumZoom + 0.01) fitDiagram();
  });
})();
