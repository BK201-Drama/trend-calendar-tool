function groupByPlatform(planDays) {
  const grouped = {};

  for (const day of planDays) {
    for (const item of day.items) {
      if (!grouped[item.platform]) grouped[item.platform] = [];
      grouped[item.platform].push({
        date: item.date,
        topic: item.topic,
        suggestedTime: item.suggestedTime,
      });
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

    const title = document.createElement('h2');
    title.className = 'platform-title';
    title.textContent = platform;

    const list = document.createElement('ul');
    list.className = 'plan-list';

    grouped[platform].forEach((item) => {
      const li = document.createElement('li');
      li.className = 'plan-item';
      li.innerHTML = `
        <div class="plan-date">${item.date}</div>
        <div class="plan-topic">${item.topic}</div>
        <div class="plan-time">建议发布时间：${item.suggestedTime}</div>
      `;
      list.appendChild(li);
    });

    card.appendChild(title);
    card.appendChild(list);
    board.appendChild(card);
  }
}

async function init() {
  const res = await fetch('/api/plan');
  const data = await res.json();
  const grouped = groupByPlatform(data.plan || []);
  renderBoard(grouped);
}

init().catch(() => {
  const board = document.getElementById('board');
  board.innerHTML = '<p>加载失败，请稍后重试。</p>';
});
