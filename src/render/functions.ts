
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
    svg?.setAttribute("style", `max-width: 100%;`);
    svg?.setAttribute("width", `100%`);
    svg?.setAttribute("height", `100%`);
    svg?.setAttribute("viewBox", `0 0 1458 196`);
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
  
  