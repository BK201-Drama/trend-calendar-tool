function groupByPlatform(planDays) {
  const grouped = {};
  for (const day of planDays || []) {
    for (const item of day.items || []) {
      if (!grouped[item.platform]) grouped[item.platform] = [];
      grouped[item.platform].push(item);
    }
  }
  return grouped;
}

function renderBoard(grouped) {
  const board = document.getElementById('board');
  board.innerHTML = '';
  const platforms = Object.keys(grouped);
  if (!platforms.length) {
    board.innerHTML = '<p>暂无发布计划</p>';
    return;
  }

  for (const platform of platforms) {
    const card = document.createElement('article');
    card.className = 'platform-card';
    card.innerHTML = `<h3>${platform}</h3>`;
    const ul = document.createElement('ul');

    grouped[platform].forEach((item) => {
      const li = document.createElement('li');
      li.innerHTML = `<b>${item.date} ${item.suggestedTime}</b> - ${item.topic} <span class="score">(${item.score})</span>`;
      ul.appendChild(li);
    });

    card.appendChild(ul);
    board.appendChild(card);
  }
}

async function loadSettings() {
  const res = await fetch('/api/settings');
  const data = await res.json();
  const s = data.settings || {};
  document.getElementById('limitPerDay').value = s.limitPerDay || 4;
  document.getElementById('hours').value = (s.hours || [10, 12, 18, 20]).join(',');
}

async function loadPlan() {
  const res = await fetch('/api/plan');
  const data = await res.json();
  renderBoard(groupByPlatform(data.plan || []));
}

async function saveSettings() {
  const limitPerDay = Number(document.getElementById('limitPerDay').value || 4);
  const hours = String(document.getElementById('hours').value || '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x));

  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limitPerDay, hours }),
  });
  await loadPlan();
}

async function importHotspots() {
  const platform = document.getElementById('hotspotPlatform').value;
  const topics = String(document.getElementById('hotspots').value || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

  if (!topics.length) return;

  await fetch('/api/hotspots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, topics, tags: ['hot'] }),
  });

  document.getElementById('hotspots').value = '';
  await loadPlan();
}

document.getElementById('saveSettings').addEventListener('click', saveSettings);
document.getElementById('importHotspots').addEventListener('click', importHotspots);

Promise.all([loadSettings(), loadPlan()]).catch(() => {
  const board = document.getElementById('board');
  board.innerHTML = '<p>加载失败，请稍后重试。</p>';
});
