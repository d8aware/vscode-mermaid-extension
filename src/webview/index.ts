import mermaid from "mermaid";
const svgPanZoom = require('./svg-pan-zoom.min.js');

// Function to get query parameters from the URL
function getQueryParams() {
  const params: { [key: string]: string } = {};
  location.search
    .substr(1)
    .split("&")
    .forEach(function (item) {
      const [key, value] = item.split("=");
      params[key] = decodeURIComponent(value);
    });
  return params;
}

// Render the diagram
async function renderDiagram(graphDivId: string, md: string) {
  const isPie: boolean = md.startsWith("pie");
  const isGitGraph: boolean = md.startsWith("gitgraph") || md.startsWith("gitGraph");
  const isErDiagram: boolean = md.startsWith("erdiagram") || md.startsWith("erDiagram");
  const isGantt: boolean = md.startsWith("gantt");
  const isJourney: boolean = md.startsWith("journey");
  const isSequence: boolean = md.startsWith("sequenceDiagram");
  const isGraph: boolean = md.startsWith("graph");
  const isClass: boolean = md.startsWith("classDiagram");
  const element = document.getElementById("content");
  mermaid.initialize({
    startOnLoad: true,
    theme: "default",
    securityLevel: "loose",
    class: {
      defaultRenderer: "dagre-wrapper",
      nodeSpacing: 50,
      rankSpacing: 50,
    },
  });
  try {
    const { svg: svgCode, bindFunctions } = await mermaid.render(graphDivId, md, element);
    if (svgCode) {
      element.innerHTML = svgCode;
      const svg: any = element.firstElementChild;
      if (isPie) {
        renderPieChart(svg);
      } else if (isGitGraph || isSequence || isGraph || isClass) {
        renderMermaidChart(svg);
      } else if (isGantt) {
        renderGannt(svg);
      }
    }
    if (bindFunctions) {
      bindFunctions(element);
    }
    if (typeof svgPanZoom !== 'undefined') {
      const panZoomInstance = svgPanZoom(`#${graphDivId}`, {
        zoomEnabled: true,
        controlIconsEnabled: true,
        fit: true,
        center: true
      });
      panZoomInstance.zoom(0.8);
      // Redraw function
      function redraw() {
        panZoomInstance.resize();
      }
      // Add event listener for window resize
      window.addEventListener('resize', function() {
        redraw();
      });
    } else {
      console.error('svgPanZoom is not defined');
    }
  } catch(e) {
    console.error("Error rendering diagram:", e);
    renderErrorMessage(e);
  }
}

function renderErrorMessage(e) {
  /**
   * Step 1. Add the error message to the #errorMessage innerText
   * Step 2. Remove the hidden class from the #errorBox element
   */
  const element = document.getElementById("content");
  element.innerText = e.message;
}

// Fetch the content and then render the diagram
async function renderFetchedDiagram(graphDivId: string, diagramFile: string) {
  try {
    const response = await fetch(`media/samples/${diagramFile}`);
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.statusText}`);
    }
    const diagram = await response.text();
    await renderDiagram(graphDivId, diagram);
  } catch (error) {
    console.error("Error fetching diagram:", error);
    renderErrorMessage(error);
  }
}

const graphDivId = `graphDiv_${new Date().getTime()}`;

window.addEventListener("message", async (event) => {
  const message = event.data;
  switch (message.command) {
    case "renderContent":
      // const vscode = acquireVsCodeApi();
      await renderDiagram(graphDivId, message.content);
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
    await renderFetchedDiagram(graphDivId, params.diagram);
  }
});

function renderPieChart(svg: any) {
  svg?.removeAttribute("width");
  svg?.setAttribute("style", `width: 100%; height: 100%;`);

  const bBox = svg.getBBox();

  const g: any = svg.children[svg.children.length - 1];
  const groupbBox = g.getBBox();

  const zoomLevel = 100 * 0.98; //percent
  const size = {
    width: Math.round(bBox.width / (zoomLevel / 100)),
    height: Math.round(bBox.height / (zoomLevel / 100)),
  };
  const zoom100 = `0 0 ${size.width} ${size.height}`;

  svg?.setAttribute("viewBox", zoom100);
  svg?.setAttribute("preserveAspectRatio", `xMidYMid meet`);

  // compute a translation to position the group in the top left corner
  const xns: any = {};
  xns.x = groupbBox.x < 0 ? groupbBox.x * -1 : groupbBox.x;
  xns.y = groupbBox.y < 0 ? groupbBox.y * -1 : groupbBox.y;

  // center the group
  const centerScreen = { x: size.width / 2, y: size.height / 2 };
  const halfWidth = groupbBox.width / 2;
  const halfHeight = groupbBox.height / 2;
  xns.x += centerScreen.x - halfWidth;
  xns.y += centerScreen.y - halfHeight;

  g.setAttribute("transform", `translate(${xns.x}, ${xns.y})`);
}

// function renderErDiagram(svg: any) {
//   svg?.removeAttribute("width");
//   svg?.setAttribute("style", `width: 100%; height: auto !important;`);
//   svg?.setAttribute("preserveAspectRatio", `xMidYMid meet`);
// }

function renderGannt(svg: any) {
  svg?.setAttribute("style", `max-width: 100%;`);
  svg?.setAttribute("width", `100%`);
  svg?.setAttribute("height", `100%`);
  svg?.setAttribute("viewBox", `0 0 1458 196`);
}

function renderMermaidChart(svg: any) {
  svg?.removeAttribute("width");
  svg?.setAttribute("style", `width: 100%; height: 100%;`);

  const bBox = svg.getBBox();

  svg?.setAttribute("preserveAspectRatio", `xMidYMid meet`);

  const gels = Array.from(svg.children).filter(
    (child: any) => child.tagName === "g"
  );

  let mostLeft = Number.MAX_VALUE;
  let mostTop = Number.MAX_VALUE;
  gels.forEach((gel: any) => {
    const bb = gel.getBBox();
    if (bb.x < mostLeft) {
      mostLeft = bb.x;
    }
    if (bb.y < mostTop) {
      mostTop = bb.y;
    }
  });

  let maxWidth = 0;
  let maxHeight = 0;
  gels.forEach((gel: any) => {
    const bb = gel.getBBox();

    if (bb.width !== 0 || bb.height !== 0) {
      gel.setAttribute("transform", `translate(${-mostLeft}, ${-mostTop})`);
    }

    const h = -mostTop + bb.y + bb.height;
    if (h > maxHeight) {
      maxHeight = h;
    }

    const w = -mostLeft + bb.x + bb.width;
    if (w > maxWidth) {
      maxWidth = w;
    }
  });

  const viewWidth = maxWidth * 1.01;
  const viewHeight = maxHeight * 1.01;

  const size = {
    width: Math.round(viewWidth),
    height: Math.round(viewHeight),
  };
  const zoom100 = `0 0 ${size.width} ${size.height}`;

  svg?.setAttribute("viewBox", zoom100);
}
