// detail.js — Member detail panel logic

const DetailPanel = (() => {
  let panel, currentMemberId = null;

  function init() {
    panel = document.getElementById('detail-panel');
    document.getElementById('detail-close').addEventListener('click', close);
  }

  function show(member) {
    if (!panel) return;
    currentMemberId = member.id;

    // Photo
    const photoWrap = document.getElementById('detail-photo-wrap');
    photoWrap.className = member.lord ? 'lord' : '';
    photoWrap.innerHTML = `<div class="detail-placeholder">${member.name.charAt(0)}</div>`;

    // Try loading real photo
    const img = new Image();
    img.onload = () => {
      photoWrap.innerHTML = '';
      photoWrap.appendChild(img);
    };
    img.src = member.photo;
    img.alt = member.name;

    // Text fields
    document.getElementById('detail-name').textContent = member.name;
    document.getElementById('detail-nickname').textContent =
      member.nickname ? `"${member.nickname}"` : '';
    document.getElementById('detail-hometown').textContent = member.hometown || '';

    // Lord badge
    const badge = document.getElementById('detail-lord-badge');
    badge.style.display = member.lord ? 'block' : 'none';

    // Stats
    document.getElementById('stat-years').textContent = member.years_attended.length;
    document.getElementById('stat-wins').textContent = member.wins;

    // Years list
    const yearsList = document.getElementById('detail-years');
    yearsList.innerHTML = member.years_attended
      .slice()
      .sort()
      .map(y => `<span class="detail-year-tag">${y}</span>`)
      .join('');

    // Story
    document.getElementById('detail-story').textContent =
      member.funny_story || 'No story yet...';

    // Sponsor
    const sponsorEl = document.getElementById('detail-sponsor');
    if (member.sponsor) {
      sponsorEl.parentElement.style.display = 'block';
      sponsorEl.textContent = member._sponsorName || member.sponsor;
    } else {
      sponsorEl.parentElement.style.display = 'none';
    }

    panel.classList.add('open');
  }

  function close() {
    if (panel) panel.classList.remove('open');
    currentMemberId = null;
  }

  function isOpen() {
    return panel && panel.classList.contains('open');
  }

  function getCurrentId() {
    return currentMemberId;
  }

  return { init, show, close, isOpen, getCurrentId };
})();
