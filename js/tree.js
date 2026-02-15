// tree.js — D3.js tree rendering + interactions

const TreeViz = (() => {
  let svg, g, treemap, root, allMembers;
  const nodeW = 160, nodeH = 72;
  const lordW = 200, lordH = 96;
  const margin = { top: 60, right: 40, bottom: 60, left: 40 };
  let zoom;

  async function init() {
    const resp = await fetch('data/members.json');
    allMembers = await resp.json();

    // Build a lookup for sponsor names
    const byId = {};
    allMembers.forEach(m => byId[m.id] = m);
    allMembers.forEach(m => {
      m._sponsorName = m.sponsor ? (byId[m.sponsor]?.name || m.sponsor) : null;
    });

    // Add a virtual root so d3.stratify works with multiple lords
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

    // Initial state: all expanded
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
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // SVG defs for lord gradient
    const defs = svg.append('defs');
    const lordGrad = defs.append('linearGradient')
      .attr('id', 'lord-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '100%');
    lordGrad.append('stop').attr('offset', '0%').attr('stop-color', '#3d3520');
    lordGrad.append('stop').attr('offset', '50%').attr('stop-color', '#2e2a1a');
    lordGrad.append('stop').attr('offset', '100%').attr('stop-color', '#3a3018');

    g = svg.append('g')
      .attr('transform', `translate(${width / 2}, ${margin.top})`);

    // Zoom control buttons
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
      d3.zoomIdentity.translate(width / 2, margin.top).scale(0.85)
    );
  }

  function update(source) {
    const duration = 400;

    // Compute tree layout
    treemap = d3.tree().nodeSize([lordW + 20, lordH + 60]);
    const treeData = treemap(root);

    const nodes = treeData.descendants().filter(d => !d.data._virtual);
    const links = treeData.links().filter(d => !d.source.data._virtual && !d.target.data._virtual);
    // Links from virtual root to lords
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
      .attr('transform', `translate(${source.x0 || 0},${source.y0 || 0})`)
      .style('opacity', 0)
      .on('click', (event, d) => {
        event.stopPropagation();
        DetailPanel.show(d.data);
      });

    // Card background
    nodeEnter.append('rect')
      .attr('class', 'node-rect')
      .attr('x', d => d.data.lord ? -lordW / 2 : -nodeW / 2)
      .attr('y', d => d.data.lord ? -lordH / 2 : -nodeH / 2)
      .attr('width', d => d.data.lord ? lordW : nodeW)
      .attr('height', d => d.data.lord ? lordH : nodeH)
      .attr('fill', d => d.data.lord ? 'url(#lord-gradient)' : 'var(--node-bg)');

    // Crown for lords
    nodeEnter.filter(d => d.data.lord)
      .append('text')
      .attr('class', 'lord-crown')
      .attr('y', -lordH / 2 - 6)
      .attr('font-size', '18px')
      .text('\u265B');

    // "LORD" badge for lords
    nodeEnter.filter(d => d.data.lord).each(function() {
      const badge = d3.select(this).append('g')
        .attr('transform', `translate(0, ${-lordH / 2 + 14})`);
      badge.append('rect')
        .attr('x', -48)
        .attr('y', -8)
        .attr('width', 96)
        .attr('height', 14)
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

    // Photo placeholder circle
    nodeEnter.append('circle')
      .attr('cx', d => d.data.lord ? -lordW / 2 + 32 : -nodeW / 2 + 28)
      .attr('cy', d => d.data.lord ? 6 : 0)
      .attr('r', d => d.data.lord ? 22 : 18)
      .attr('fill', 'var(--bg-primary)')
      .attr('stroke', d => d.data.lord ? 'var(--lord-border)' : 'var(--node-border)')
      .attr('stroke-width', d => d.data.lord ? 2 : 1.5);

    // Initial letter
    nodeEnter.append('text')
      .attr('x', d => d.data.lord ? -lordW / 2 + 32 : -nodeW / 2 + 28)
      .attr('y', d => d.data.lord ? 7 : 1)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', d => d.data.lord ? 'var(--gold)' : 'var(--text-muted)')
      .attr('font-size', d => d.data.lord ? '16px' : '14px')
      .attr('font-weight', '600')
      .attr('class', 'node-initial')
      .text(d => d.data.name.charAt(0));

    // Name
    nodeEnter.append('text')
      .attr('class', 'node-name')
      .attr('x', d => d.data.lord ? 16 : 12)
      .attr('y', d => d.data.lord ? -2 : -8)
      .attr('font-size', d => d.data.lord ? '15px' : '13px')
      .text(d => d.data.name);

    // Nickname
    nodeEnter.append('text')
      .attr('class', 'node-nickname')
      .attr('x', d => d.data.lord ? 16 : 12)
      .attr('y', d => d.data.lord ? 14 : 7)
      .text(d => d.data.nickname ? `"${d.data.nickname}"` : '');

    // Years count
    nodeEnter.append('text')
      .attr('class', 'node-years')
      .attr('x', d => d.data.lord ? 16 : 12)
      .attr('y', d => d.data.lord ? 29 : 22)
      .text(d => `${d.data.years_attended.length} yrs | ${d.data.wins} wins`);

    // Expand/collapse toggle
    nodeEnter.filter(d => d.data.id !== '__root__')
      .each(function(d) {
        if (d.children || d._children) {
          const h = d.data.lord ? lordH : nodeH;
          const toggle = d3.select(this).append('g')
            .attr('class', 'toggle-btn')
            .attr('transform', `translate(0, ${h / 2})`)
            .on('click', (event, d) => {
              event.stopPropagation();
              toggleNode(d);
            });

          toggle.append('circle')
            .attr('class', 'node-toggle')
            .attr('r', 10);

          toggle.append('text')
            .attr('class', 'node-toggle-text')
            .text(d => d._children ? '+' : '\u2212');
        }
      });

    // Update
    const nodeUpdate = nodeEnter.merge(node);
    nodeUpdate.transition().duration(duration)
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('opacity', 1);

    nodeUpdate.select('.node-toggle-text')
      .text(d => d._children ? '+' : (d.children ? '\u2212' : ''));

    // Exit
    node.exit().transition().duration(duration)
      .attr('transform', `translate(${source.x},${source.y})`)
      .style('opacity', 0)
      .remove();

    // Stash positions for transitions
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
    const sH = s.data && s.data.lord ? lordH : nodeH;
    const tH = t.data && t.data.lord ? lordH : nodeH;
    return `M ${s.x} ${s.y + sH / 2}
            C ${s.x} ${(s.y + sH / 2 + t.y - tH / 2) / 2},
              ${t.x} ${(s.y + sH / 2 + t.y - tH / 2) / 2},
              ${t.x} ${t.y - tH / 2}`;
  }

  // Search functionality
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
