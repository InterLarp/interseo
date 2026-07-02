const form = document.querySelector('#auditForm');
const auditButton = document.querySelector('#auditButton');
const scoreRing = document.querySelector('#scoreRing');
const scoreValue = document.querySelector('#scoreValue');
const gradeLabel = document.querySelector('#gradeLabel');
const auditMeta = document.querySelector('#auditMeta');
const categoryBars = document.querySelector('#categoryBars');
const priorityList = document.querySelector('#priorityList');
const allChecks = document.querySelector('#allChecks');
const googleReadiness = document.querySelector('#googleReadiness');
const miniMetrics = document.querySelector('#miniMetrics');
const kitTabs = document.querySelector('#kitTabs');
const kitPreview = document.querySelector('#kitPreview');
const saveKitButton = document.querySelector('#saveKitButton');
const saveResult = document.querySelector('#saveResult');

let currentResult = null;
let activeKitIndex = 0;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  await runAudit(payload);
});

saveKitButton.addEventListener('click', async () => {
  if (!currentResult?.kit?.files?.length) return;
  saveKitButton.disabled = true;
  saveResult.textContent = 'Guardando...';

  try {
    const response = await fetch('/api/save-kit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        siteName: currentResult.kit.siteName,
        origin: currentResult.kit.origin,
        files: currentResult.kit.files
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar el kit.');
    saveResult.textContent = `Guardado en ${data.directory}`;
  } catch (error) {
    saveResult.textContent = error.message;
  } finally {
    saveKitButton.disabled = false;
  }
});

async function runAudit(payload) {
  currentResult = null;
  activeKitIndex = 0;
  auditButton.disabled = true;
  auditButton.textContent = 'Auditando...';
  saveKitButton.disabled = true;
  saveResult.textContent = '';
  gradeLabel.textContent = 'Analizando';
  auditMeta.textContent = 'Revisando home, robots.txt, sitemap, politicas y metadatos.';

  try {
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la auditoria.');
    currentResult = data;
    renderResult(data);
  } catch (error) {
    renderError(error);
  } finally {
    auditButton.disabled = false;
    auditButton.textContent = 'Auditar SEO';
  }
}

function renderResult(result) {
  const percent = Math.round((result.score / result.maxScore) * 100);
  scoreRing.style.setProperty('--score', percent);
  scoreValue.textContent = result.score;
  gradeLabel.textContent = result.grade.label;
  auditMeta.textContent = `${result.finalUrl} · ${result.elapsedMs} ms`;

  renderCategories(result.categories);
  renderMiniMetrics(result.categories);
  renderChecks(priorityList, result.priority.slice(0, 6), true);
  renderChecks(allChecks, result.checks, false);
  renderReadiness(result);
  renderKit(result.kit);
  saveKitButton.disabled = !result.kit?.files?.length;
}

function renderCategories(categories) {
  categoryBars.innerHTML = categories.map((category) => `
    <div class="category-row">
      <strong>${escapeHtml(category.name)}</strong>
      <div class="bar"><span style="--value: ${category.percent}%"></span></div>
      <span>${category.score}/${category.max}</span>
    </div>
  `).join('');
}

function renderMiniMetrics(categories) {
  const byName = new Map(categories.map((category) => [category.name, category]));
  const names = ['Rastreo', 'Indexacion', 'Confianza'];
  miniMetrics.innerHTML = names.map((name) => {
    const category = byName.get(name);
    return `
      <div>
        <span>${name}</span>
        <strong>${category ? `${category.percent}%` : '-'}</strong>
      </div>
    `;
  }).join('');
}

function renderChecks(container, checks, compact) {
  if (!checks.length) {
    container.className = 'check-list empty-state';
    container.textContent = 'Todo correcto en este bloque.';
    return;
  }

  container.className = 'check-list';
  container.innerHTML = checks.map((check) => `
    <article class="check-item ${check.status}">
      <span class="check-dot"></span>
      <div class="check-copy">
        <strong>${escapeHtml(check.label)}</strong>
        <p>${escapeHtml(compact ? check.recommendation : `${check.evidence}. ${check.recommendation}`)}</p>
      </div>
      <span class="check-score">${check.points}/${check.max}</span>
    </article>
  `).join('');
}

function renderReadiness(result) {
  const items = [
    ['Home accesible', result.checks.find((check) => check.id === 'homepage_accessible')],
    ['Sitemap XML', result.checks.find((check) => check.id === 'sitemap_found')],
    ['robots.txt sin bloqueo', result.checks.find((check) => check.id === 'robots_not_blocking')],
    ['Sin noindex', result.checks.find((check) => check.id === 'noindex_absent')],
    ['Search Console', result.checks.find((check) => check.id === 'google_ready_core')]
  ];

  googleReadiness.className = 'readiness-list';
  googleReadiness.innerHTML = items.map(([label, check]) => `
    <div class="readiness-item">
      <span>${escapeHtml(label)}</span>
      <strong class="badge ${check?.status || 'fail'}">${badgeLabel(check?.status)}</strong>
    </div>
  `).join('');
}

function renderKit(kit) {
  if (!kit?.files?.length) {
    kitTabs.innerHTML = '';
    kitPreview.textContent = 'No se ha generado ningun archivo.';
    return;
  }

  kitTabs.innerHTML = kit.files.map((file, index) => `
    <button class="tab ${index === activeKitIndex ? 'active' : ''}" type="button" data-index="${index}">
      ${escapeHtml(file.path)}
    </button>
  `).join('');

  kitTabs.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeKitIndex = Number(tab.dataset.index);
      renderKit(kit);
    });
  });

  kitPreview.textContent = kit.files[activeKitIndex]?.content || '';
}

function renderError(error) {
  scoreRing.style.setProperty('--score', 0);
  scoreValue.textContent = '--';
  gradeLabel.textContent = 'Error';
  auditMeta.textContent = error.message;
  priorityList.className = 'check-list empty-state';
  priorityList.textContent = 'No se pudo analizar la URL.';
}

function badgeLabel(status) {
  if (status === 'pass') return 'OK';
  if (status === 'warn') return 'Revisar';
  return 'Falta';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
