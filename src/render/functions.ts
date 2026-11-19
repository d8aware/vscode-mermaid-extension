
export function renderPieChart(svg: SVGGraphicsElement) {
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
  
  // export function renderErDiagram(svg: SVGGraphicsElement) {
  //   svg?.removeAttribute("width");
  //   svg?.setAttribute("style", `width: 100%; height: auto !important;`);
  //   svg?.setAttribute("preserveAspectRatio", `xMidYMid meet`);
  // }
  
  export function renderGannt(svg: SVGGraphicsElement) {
    svg?.removeAttribute("width");
    svg?.setAttribute("style", `width: 100%; height: 100%;`);
    svg?.setAttribute("preserveAspectRatio", `xMidYMid meet`);

    // Mermaid draws a "today" marker even when today falls far outside the
    // chart's date range (e.g. a 2014 plan viewed in 2026 puts it ~14,000px
    // to the right). Measure the chart without it so the view fits the
    // tasks; when today is inside the range the marker is within these
    // bounds anyway and stays visible.
    const todayMarkers = Array.from(svg.querySelectorAll<SVGElement>(".today"));
    todayMarkers.forEach((el) => el.style.setProperty("display", "none"));
    const bBox = svg.getBBox();
    todayMarkers.forEach((el) => el.style.removeProperty("display"));

    const pad = 10;
    svg?.setAttribute(
      "viewBox",
      `${Math.floor(bBox.x - pad)} ${Math.floor(bBox.y - pad)} ${Math.ceil(bBox.width + 2 * pad)} ${Math.ceil(bBox.height + 2 * pad)}`
    );
  }
  
  export function renderMermaidChart(svg: SVGGraphicsElement) {
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
  
  