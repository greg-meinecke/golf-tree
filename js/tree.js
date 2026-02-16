// tree.js — D3.js tree rendering + interactions (horizontal layout)

const TreeViz = (() => {
  let svg, g, treemap, root, allMembers;
  // Compact regular nodes: just a name pill
  const nodeW = 140, nodeH = 32;
  // Lords stay large
  const lordW = 200, lordH = 96;
  const margin = { top: 40, right: 40, bottom: 40, left: 40 };
  let zoom;

  async function init() {
    const resp = await fetch('data/members.json');
    allMembers = await resp.json();

    const byId = {};
    allMembers.forEach(m => byId[m.id] = m);
    allMembers.forEach(m => {
      m._sponsorName = m.sponsor ? (byId[m.sponsor]?.name || m.sponsor) : null;
    });

    const dataWithRoot = [
      { id: '__root__', sponsor: null, name: 'CAC', lord: false, _virtual: true }
    ].concat(
      allMembers.map(m => ({
        ...m,
        sponsor: m.sponsor || '__root__'
      }))
    );

    const stratify = d3.stratify()
      .id(d => d.id)
      .parentId(d => d.sponsor);

    root = stratify(dataWithRoot);

    root.descendants().forEach(d => {
      d._children = null;
    });

    setupSVG();
    update(root);
    centerTree();
  }

  function setupSVG() {
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg = d3.select('#tree-container')
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    zoom = d3.zoom()
      .scaleExtent([0.15, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const defs = svg.append('defs');
    const lordGrad = defs.append('linearGradient')
      .attr('id', 'lord-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '100%');
    lordGrad.append('stop').attr('offset', '0%').attr('stop-color', '#3d3520');
    lordGrad.append('stop').attr('offset', '50%').attr('stop-color', '#2e2a1a');
    lordGrad.append('stop').attr('offset', '100%').attr('stop-color', '#3a3018');

    g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${height / 2})`);

    d3.select('#zoom-in').on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 1.3));
    d3.select('#zoom-out').on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 0.7));
    d3.select('#zoom-fit').on('click', centerTree);
  }

  function centerTree() {
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    svg.transition().duration(500).call(
      zoom.transform,
      d3.zoomIdentity.translate(margin.left + 120, height / 2).scale(0.65)
    );
  }

  function getW(d) { return d.data.lord ? lordW : nodeW; }
  function getH(d) { return d.data.lord ? lordH : nodeH; }

  function update(source) {
    const duration = 400;

    // Use separation function to give lords more vertical space
    treemap = d3.tree()
      .nodeSize([nodeH + 12, lordW + 60])
      .separation((a, b) => {
        const aH = a.data.lord ? lordH : nodeH;
        const bH = b.data.lord ? lordH : nodeH;
        const needed = (aH + bH) / 2 + 12;
        const base = nodeH + 12;
        return needed / base;
      });
    const treeData = treemap(root);

    const nodes = treeData.descendants().filter(d => !d.data._virtual);
    const links = treeData.links().filter(d => !d.source.data._virtual && !d.target.data._virtual);
    const lordLinks = treeData.links().filter(d => d.source.data._virtual);

    // ---- LINKS ----
    const allLinks = links.concat(lordLinks);
    const link = g.selectAll('.tree-link')
      .data(allLinks, d => d.target.data.id);

    const linkEnter = link.enter()
      .insert('path', 'g')
      .attr('class', d => 'tree-link' + (d.source.data._virtual ? ' lord-link' : ''))
      .attr('d', () => {
        const o = { x: source.x0 || 0, y: source.y0 || 0 };
        return diagonal(o, o);
      })
      .style('opacity', 0);

    const linkUpdate = linkEnter.merge(link);
    linkUpdate.transition().duration(duration)
      .attr('d', d => diagonal(d.source, d.target))
      .style('opacity', 1);

    link.exit().transition().duration(duration)
      .attr('d', () => {
        const o = { x: source.x, y: source.y };
        return diagonal(o, o);
      })
      .style('opacity', 0)
      .remove();

    // ---- NODES ----
    const node = g.selectAll('.node-group')
      .data(nodes, d => d.data.id);

    const nodeEnter = node.enter()
      .append('g')
      .attr('class', d => 'node-group' + (d.data.lord ? ' lord' : ''))
      .attr('transform', `translate(${source.y0 || 0},${source.x0 || 0})`)
      .style('opacity', 0)
      .on('click', (event, d) => {
        event.stopPropagation();
        DetailPanel.show(d.data);
      });

    // === LORD NODES (full card) ===
    const lords = nodeEnter.filter(d => d.data.lord);

    lords.append('rect')
      .attr('class', 'node-rect')
      .attr('x', -lordW / 2)
      .attr('y', -lordH / 2)
      .attr('width', lordW)
      .attr('height', lordH)
      .attr('fill', 'url(#lord-gradient)');

    // Fez hat hanging on top-right corner
    lords.each(function() {
      const fez = d3.select(this).append('g')
        .attr('transform', `translate(${lordW / 2 - 8}, ${-lordH / 2 - 6})`);

      // Fez body (trapezoid)
      fez.append('path')
        .attr('d', 'M -10,0 L -7,-16 L 7,-16 L 10,0 Z')
        .attr('fill', '#c0392b')
        .attr('stroke', '#922b21')
        .attr('stroke-width', 1);

      // Flat top
      fez.append('rect')
        .attr('x', -8).attr('y', -17)
        .attr('width', 16).attr('height', 2)
        .attr('rx', 1)
        .attr('fill', '#922b21');

      // Tassel string
      fez.append('path')
        .attr('d', 'M 0,-16 Q 12,-14 14,-6')
        .attr('fill', 'none')
        .attr('stroke', '#d4a843')
        .attr('stroke-width', 1.5);

      // Tassel end
      fez.append('circle')
        .attr('cx', 14).attr('cy', -5)
        .attr('r', 2.5)
        .attr('fill', '#d4a843');
    });

    lords.each(function() {
      const badge = d3.select(this).append('g')
        .attr('transform', `translate(0, ${-lordH / 2 + 14})`);
      badge.append('rect')
        .attr('x', -48).attr('y', -8)
        .attr('width', 96).attr('height', 14)
        .attr('rx', 7)
        .attr('fill', 'var(--gold)')
        .attr('opacity', 0.9);
      badge.append('text')
        .attr('text-anchor', 'middle')
        .attr('y', 2)
        .attr('fill', 'var(--bg-primary)')
        .attr('font-size', '8px')
        .attr('font-weight', '800')
        .attr('letter-spacing', '1px')
        .text('LORD');
    });

    lords.append('circle')
      .attr('cx', -lordW / 2 + 32)
      .attr('cy', 6)
      .attr('r', 22)
      .attr('fill', 'var(--bg-primary)')
      .attr('stroke', 'var(--lord-border)')
      .attr('stroke-width', 2);

    lords.append('text')
      .attr('x', -lordW / 2 + 32)
      .attr('y', 7)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--gold)')
      .attr('font-size', '16px')
      .attr('font-weight', '600')
      .text(d => d.data.name.charAt(0));

    lords.append('text')
      .attr('class', 'node-name')
      .attr('x', 16).attr('y', -2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '15px')
      .text(d => d.data.name);

    lords.append('text')
      .attr('class', 'node-nickname')
      .attr('x', 16).attr('y', 14)
      .attr('text-anchor', 'middle')
      .text(d => d.data.nickname ? `"${d.data.nickname}"` : '');

    lords.append('text')
      .attr('class', 'node-years')
      .attr('x', 16).attr('y', 29)
      .attr('text-anchor', 'middle')
      .text(d => {
        const stars = d.data.wins > 0 ? ' ' + '\u2605'.repeat(Math.min(d.data.wins, 5)) : '';
        return `${d.data.years_attended.length} yrs${stars}`;
      })
      .attr('fill', d => d.data.wins > 0 ? 'var(--gold)' : 'var(--text-muted)');

    // === REGULAR NODES (compact pill) ===
    const regulars = nodeEnter.filter(d => !d.data.lord);

    regulars.append('rect')
      .attr('class', 'node-rect')
      .attr('x', -nodeW / 2)
      .attr('y', -nodeH / 2)
      .attr('width', nodeW)
      .attr('height', nodeH)
      .attr('rx', 16)
      .attr('ry', 16);

    // Name (left-aligned, clipped to available space)
    regulars.each(function(d) {
      const txt = d3.select(this).append('text')
        .attr('class', 'node-name')
        .attr('x', -nodeW / 2 + 12)
        .attr('y', 1)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'central')
        .attr('font-size', '11px')
        .text(d.data.name);

      // Clip with SVG clipPath isn't worth it — just truncate long names
      const maxChars = d.data.wins > 0 ? 12 : 14;
      if (d.data.name.length > maxChars) {
        txt.text(d.data.name.substring(0, maxChars - 1) + '\u2026');
      }
    });

    // Small win trophy indicators (right side of pill)
    regulars.each(function(d) {
      const wins = d.data.wins;
      const years = d.data.years_attended.length;

      // Years dot
      d3.select(this).append('text')
        .attr('x', nodeW / 2 - 12)
        .attr('y', 1)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'central')
        .attr('fill', 'var(--text-muted)')
        .attr('font-size', '9px')
        .text(`${years}y`);

      // Win stars
      if (wins > 0) {
        d3.select(this).append('text')
          .attr('x', nodeW / 2 - 32)
          .attr('y', 1)
          .attr('text-anchor', 'end')
          .attr('dominant-baseline', 'central')
          .attr('fill', 'var(--gold)')
          .attr('font-size', '9px')
          .text('\u2605'.repeat(Math.min(wins, 5)));
      }
    });

    // === TOGGLE BUTTONS (both types) ===
    nodeEnter.filter(d => d.data.id !== '__root__')
      .each(function(d) {
        if (d.children || d._children) {
          const w = getW(d);
          const toggle = d3.select(this).append('g')
            .attr('class', 'toggle-btn')
            .attr('transform', `translate(${w / 2}, 0)`)
            .on('click', (event, d) => {
              event.stopPropagation();
              toggleNode(d);
            });

          toggle.append('circle')
            .attr('class', 'node-toggle')
            .attr('r', 8);

          toggle.append('text')
            .attr('class', 'node-toggle-text')
            .attr('font-size', '10px')
            .text(d => d._children ? '+' : '\u2212');
        }
      });

    // Update positions
    const nodeUpdate = nodeEnter.merge(node);
    nodeUpdate.transition().duration(duration)
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .style('opacity', 1);

    nodeUpdate.select('.node-toggle-text')
      .text(d => d._children ? '+' : (d.children ? '\u2212' : ''));

    node.exit().transition().duration(duration)
      .attr('transform', `translate(${source.y},${source.x})`)
      .style('opacity', 0)
      .remove();

    nodes.forEach(d => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  }

  function toggleNode(d) {
    if (d.children) {
      d._children = d.children;
      d.children = null;
    } else if (d._children) {
      d.children = d._children;
      d._children = null;
    }
    update(d);
  }

  function diagonal(s, t) {
    const sW = s.data && s.data.lord ? lordW : nodeW;
    const tW = t.data && t.data.lord ? lordW : nodeW;
    const sx = s.y + sW / 2;
    const sy = s.x;
    const tx = t.y - tW / 2;
    const ty = t.x;
    const midX = (sx + tx) / 2;
    return `M ${sx} ${sy}
            C ${midX} ${sy},
              ${midX} ${ty},
              ${tx} ${ty}`;
  }

  function search(query) {
    const q = query.toLowerCase().trim();
    const nodes = g.selectAll('.node-group');

    if (!q) {
      nodes.classed('search-match', false).classed('search-dimmed', false);
      return;
    }

    nodes.each(function(d) {
      const match =
        d.data.name.toLowerCase().includes(q) ||
        (d.data.nickname && d.data.nickname.toLowerCase().includes(q)) ||
        (d.data.hometown && d.data.hometown.toLowerCase().includes(q));

      d3.select(this)
        .classed('search-match', match)
        .classed('search-dimmed', !match);
    });
  }

  function expandAll() {
    root.descendants().forEach(d => {
      if (d._children) {
        d.children = d._children;
        d._children = null;
      }
    });
    update(root);
  }

  return { init, search, expandAll, centerTree };
})();
