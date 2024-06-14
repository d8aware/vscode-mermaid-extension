import mermaid from "mermaid";
const svgPanZoom = require('./svg-pan-zoom.min.js');
import { debounce } from "../shared/debounce";
import { getQueryParams } from "../shared/querystring";
import { renderGannt, renderMermaidChart, renderPieChart } from "../render/functions";

const MERMAID_DIV_ID = `mermaidDiv_${new Date().getTime()}`;

let panZoomInstance: any;
let diagramSvg: any;

async function renderDiagram(hostDivId: string, md: string, resetZoom?: boolean) {
  try {

    /**
     * If resetZoom is falsy, then we will capture the current pan and zoom,
     * render the updated diagram, and then reapply the pan and zoom. This
     * will prevent the diagram from resetting to the default zoom level each
     * time the diagram is updated with new content.
     */
    const panZoom: Record<string, any> = {};
    if (!resetZoom && diagramSvg && panZoomInstance) {
      panZoom.pan = panZoomInstance.getPan();
      panZoom.zoom = panZoomInstance.getZoom();
      console.log("Pan and zoom:", panZoom.pan, panZoom.zoomLevel);
    }

    const element = document.getElementById("content");
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
      maxTextSize: 10000000000,
      class: {
        defaultRenderer: "dagre-wrapper",
        nodeSpacing: 50,
        rankSpacing: 50,
      },
    });

    const { svg: svgCode, bindFunctions } = await mermaid.render(hostDivId, md, element);
    if (svgCode) {
      element.innerHTML = svgCode;
      const svg: any = element.firstElementChild;
      diagramSvg = svg;
      hideErrorMessage();
      /**
       * The Mermaid library provides a way to determine the type of diagram
       * through the `aria-role-description` attribute. This can one of the
       * following values listed here:
       * https://github.com/mermaid-js/mermaid/blob/d6ccd93cf207a30bbd45edf39fd29afdbb87b05e/packages/mermaid/src/mermaidAPI.spec.ts#L721
       */
      const ariaRoleDescriptionDiagramTypes = {
        'c4': renderMermaidChart,
        'classDiagram': renderMermaidChart,
        'er': renderMermaidChart,
        'flowchart-v2': renderMermaidChart,
        'gitGraph': renderMermaidChart,
        'gantt': renderGannt,
        'journey': renderMermaidChart,
        'pie': renderPieChart,
        'packet': renderMermaidChart,
        'xychart': renderMermaidChart,
        'requirement': renderMermaidChart,
        'sequence': renderMermaidChart,
        'stateDiagram': renderMermaidChart,
      };
      const diagramType = svg.getAttribute('aria-roledescription');
      if (diagramType) {
        const renderFunction = ariaRoleDescriptionDiagramTypes[diagramType];
        if (renderFunction) {
          renderFunction(svg);
        }
      } else {
        renderMermaidChart(svg);
      }
    }
    if (bindFunctions) {
      bindFunctions(element);
    }
    if (typeof svgPanZoom !== 'undefined') {
      panZoomInstance = svgPanZoom(`#${hostDivId}`, {
        zoomEnabled: true,
        controlIconsEnabled: true,
        fit: true,
        center: true,
      });

      // Resize function
      function resize() {
        panZoomInstance.resize();
        hijackResetButtonClick(panZoomInstance);
      }

      // Add event listener for window resize
      window.addEventListener('resize', debounce(resize, 500));
      hijackResetButtonClick(panZoomInstance);
      if (resetZoom) {
        panZoomInstance.zoom(0.8);
      } else {
        panZoomInstance.zoom(panZoom.zoom);
        panZoomInstance.pan(panZoom.pan);
      }
    } else {
      console.error('svgPanZoom is not defined');
    }
  } catch(e) {
    console.error("Error rendering diagram:", e);
    renderErrorMessage(e);
  }
}

function hijackResetButtonClick(panZoomInstance) {
  const resetButton = document.getElementById("svg-pan-zoom-reset-pan-zoom");
  resetButton?.addEventListener("click", function () {
    console.log("Resetting pan and zoom");
    panZoomInstance.zoom(0.8);
  });
}

function hideErrorMessage() {
  const element = document.getElementById("error");
  element.classList.add("hidden");
}

function showErrorMessage() {
  const element = document.getElementById("error");
  element.classList.remove("hidden");
}

function renderErrorMessage(e) {
  const element = document.getElementById("error-message");
  element.innerText = e.message;
  showErrorMessage();
}

async function renderFetchedDiagram(hostDivId: string, diagramFile: string) {
  try {
    const response = await fetch(`media/samples/${diagramFile}`);
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.statusText}`);
    }
    const diagram = await response.text();
    await renderDiagram(hostDivId, diagram);
  } catch (error) {
    console.error("Error fetching diagram:", error);
    renderErrorMessage(error);
  }
}

window.addEventListener("message", async (event) => {
  const message = event.data;
  switch (message.command) {
    case "renderContent":
      await renderDiagram(MERMAID_DIV_ID, message.content, true);
      break;
    case "refreshContent":
      await renderDiagram(MERMAID_DIV_ID, message.content);
      break;
    }
});

window.addEventListener("DOMContentLoaded", async () => {
  /**
   * This app can be run locally with a query 
   * parameter to load a specific diagram. If 
   * there is no query parameter, the app will 
   * send a message to the extension to render 
   * the content.
   */
  const params = getQueryParams();
  if (params.diagram) {
    await renderFetchedDiagram(MERMAID_DIV_ID, params.diagram);
  }
});
