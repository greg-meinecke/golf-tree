// tree.js — D3.js tree rendering + interactions (horizontal layout)

const TreeViz = (() => {
  let svg, g, treemap, root, allMembers;
  // HOF members
  const nodeW = 140, nodeH = 32;
  // Non-HOF members (shorter but same width)
  const smallW = 140, smallH = 26;
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

    // Populate year filter dropdown
    const allYears = new Set();
    allMembers.forEach(m => m.years_attended.forEach(y => allYears.add(y)));
    const sortedYears = [...allYears].sort();
    const select = document.getElementById('year-filter');
    sortedYears.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      select.appendChild(opt);
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

  function fitToView(animate) {
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Get bounds of all visible nodes
    const visibleNodes = root.descendants().filter(d => !d.data._virtual);
    if (visibleNodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    visibleNodes.forEach(d => {
      const w = d.data.lord ? lordW : nodeW;
      const h = d.data.lord ? lordH : nodeH;
      // In horizontal layout: d.y = horizontal, d.x = vertical
      minX = Math.min(minX, d.y - w / 2);
      maxX = Math.max(maxX, d.y + w / 2 + 20); // extra for toggle
      minY = Math.min(minY, d.x - h / 2);
      maxY = Math.max(maxY, d.x + h / 2);
    });

    const treeW = maxX - minX;
    const treeH = maxY - minY;
    const pad = 60;

    const scaleX = (width - pad * 2) / treeW;
    const scaleY = (height - pad * 2) / treeH;
    const scale = Math.min(scaleX, scaleY, 1.2); // cap at 1.2 so it doesn't get huge

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const tx = width / 2 - centerX * scale;
    const ty = height / 2 - centerY * scale;

    const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
    const duration = animate !== false ? 500 : 0;

    if (duration > 0) {
      svg.transition().duration(duration).call(zoom.transform, transform);
    } else {
      svg.call(zoom.transform, transform);
    }
  }

  // Alias for backward compat
  function centerTree() { fitToView(true); }

  function isHof(d) { return d.data.years_attended && d.data.years_attended.length >= 5; }
  function getW(d) { return d.data.lord ? lordW : (isHof(d) ? nodeW : smallW); }
  function getH(d) { return d.data.lord ? lordH : (isHof(d) ? nodeH : smallH); }

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
      .attr('fill', 'var(--text-muted)')
      .text(d => {
        const first = Math.min(...d.data.years_attended);
        return `'${String(first % 100).padStart(2,'0')} (${d.data.years_attended.length}y)`;
      });

    // Lord win stars on separate line
    lords.filter(d => d.data.wins > 0).append('text')
      .attr('x', 16).attr('y', 42)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--gold)')
      .attr('font-size', '11px')
      .text(d => '\u2605'.repeat(Math.min(d.data.wins, 5)));

    // === REGULAR NODES (compact pill) ===
    const regulars = nodeEnter.filter(d => !d.data.lord);

    regulars.each(function(d) {
      const hof = isHof(d);
      const w = hof ? nodeW : smallW;
      const h = hof ? nodeH : smallH;
      const el = d3.select(this);

      // Pill background
      el.append('rect')
        .attr('class', 'node-rect' + (hof ? ' hof' : ' non-hof'))
        .attr('x', -w / 2)
        .attr('y', -h / 2)
        .attr('width', w)
        .attr('height', h)
        .attr('rx', h / 2)
        .attr('ry', h / 2);

      // Year info string (computed first so we know how much room the name has)
      const first = Math.min(...d.data.years_attended);
      const yearStr = `'${String(first % 100).padStart(2,'0')} (${d.data.years_attended.length}y)`;

      el.append('text')
        .attr('x', w / 2 - 8)
        .attr('y', 1)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'central')
        .attr('fill', 'var(--text-muted)')
        .attr('font-size', hof ? '9px' : '8px')
        .text(yearStr);

      // Name
      el.append('text')
        .attr('class', 'node-name')
        .attr('x', -w / 2 + 10)
        .attr('y', 1)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'central')
        .attr('font-size', hof ? '11px' : '9px')
        .attr('fill', hof ? 'var(--text-primary)' : 'var(--text-secondary)')
        .text(d.data.name);

      // HOF badge (bottom-right corner)
      const yrs = d.data.years_attended.length;
      if (yrs >= 5) {
        const isNew = yrs === 5;
        const label = isNew ? 'NEW HOF' : 'HOF';
        const badgeW = isNew ? 46 : 28;
        const badge = el.append('g')
          .attr('transform', `translate(${w / 2 - badgeW / 2 + 2}, ${h / 2 - 1})`);

        badge.append('rect')
          .attr('x', -badgeW / 2)
          .attr('y', -6)
          .attr('width', badgeW)
          .attr('height', 12)
          .attr('rx', 6)
          .attr('fill', isNew ? 'var(--green-mid)' : 'var(--gold)')
          .attr('opacity', 0.9);

        badge.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', 3)
          .attr('fill', 'var(--bg-primary)')
          .attr('font-size', '7px')
          .attr('font-weight', '800')
          .attr('letter-spacing', '0.5px')
          .text(label);
      }

      // Win stars overlapping top-left corner
      if (d.data.wins > 0) {
        const starCount = Math.min(d.data.wins, 5);
        for (let i = 0; i < starCount; i++) {
          el.append('text')
            .attr('x', -w / 2 + 6 + i * 11)
            .attr('y', -h / 2 - 2)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--gold)')
            .attr('font-size', hof ? '11px' : '9px')
            .attr('stroke', 'var(--bg-primary)')
            .attr('stroke-width', 0.5)
            .text('\u2605');
        }
      }
    });

    // === TOGGLE BUTTONS (both types) ===
    nodeEnter.filter(d => d.data.id !== '__root__')
      .each(function(d) {
        if (d.children || d._children) {
          const w = getW(d);
          const toggle = d3.select(this).append('g')
            .attr('class', 'toggle-btn')
            .attr('transform', `translate(${w / 2 + 14}, 0)`)
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

    // Auto-fit after transitions settle
    setTimeout(() => fitToView(true), duration + 50);
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

  function nodeWidth(d) {
    if (!d.data) return nodeW;
    if (d.data.lord) return lordW;
    if (d.data.years_attended && d.data.years_attended.length >= 5) return nodeW;
    return smallW;
  }

  function diagonal(s, t) {
    const sW = nodeWidth(s);
    const tW = nodeWidth(t);
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

  function filterByYear(year) {
    const nodes = g.selectAll('.node-group');

    if (!year) {
      nodes.classed('year-match', false).classed('year-dimmed', false);
      return;
    }

    nodes.each(function(d) {
      const match = d.data.years_attended && d.data.years_attended.includes(year);
      d3.select(this)
        .classed('year-match', match)
        .classed('year-dimmed', !match);
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

  return { init, search, filterByYear, expandAll, centerTree };
})();
