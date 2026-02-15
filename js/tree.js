// tree.js — D3.js tree rendering + interactions

const TreeViz = (() => {
  let svg, g, treemap, root, allMembers;
  const nodeW = 160, nodeH = 72;
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
    treemap = d3.tree().nodeSize([nodeW + 20, nodeH + 60]);
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
      .attr('x', -nodeW / 2)
      .attr('y', -nodeH / 2)
      .attr('width', nodeW)
      .attr('height', nodeH);

    // Crown for lords
    nodeEnter.filter(d => d.data.lord)
      .append('text')
      .attr('class', 'lord-crown')
      .attr('y', -nodeH / 2 - 4)
      .text('\u265B');

    // Photo placeholder circle
    nodeEnter.append('circle')
      .attr('cx', -nodeW / 2 + 28)
      .attr('cy', 0)
      .attr('r', 18)
      .attr('fill', 'var(--bg-primary)')
      .attr('stroke', d => d.data.lord ? 'var(--lord-border)' : 'var(--node-border)')
      .attr('stroke-width', 1.5);

    // Initial letter
    nodeEnter.append('text')
      .attr('x', -nodeW / 2 + 28)
      .attr('y', 1)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .attr('class', 'node-initial')
      .text(d => d.data.name.charAt(0));

    // Name
    nodeEnter.append('text')
      .attr('class', 'node-name')
      .attr('x', 12)
      .attr('y', -8)
      .text(d => d.data.name);

    // Nickname
    nodeEnter.append('text')
      .attr('class', 'node-nickname')
      .attr('x', 12)
      .attr('y', 7)
      .text(d => d.data.nickname ? `"${d.data.nickname}"` : '');

    // Years count
    nodeEnter.append('text')
      .attr('class', 'node-years')
      .attr('x', 12)
      .attr('y', 22)
      .text(d => `${d.data.years_attended.length} yrs | ${d.data.wins} wins`);

    // Expand/collapse toggle
    nodeEnter.filter(d => d.data.id !== '__root__')
      .each(function(d) {
        if (d.children || d._children) {
          const toggle = d3.select(this).append('g')
            .attr('class', 'toggle-btn')
            .attr('transform', `translate(0, ${nodeH / 2})`)
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
    return `M ${s.x} ${s.y + nodeH / 2}
            C ${s.x} ${(s.y + t.y + nodeH) / 2},
              ${t.x} ${(s.y + t.y) / 2},
              ${t.x} ${t.y - nodeH / 2}`;
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
