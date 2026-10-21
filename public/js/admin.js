const Admin = (() => {
  let token = localStorage.getItem('admin_token');
  let refreshInterval = null;
  let currentPanel = 'leaderboard';

  // === AUTH ===
  async function login() {
    const password = document.getElementById('admin-password').value;
    const errEl = document.getElementById('login-error');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) {
        errEl.textContent = data.error || 'Wrong password';
        return;
      }
      token = data.token;
      localStorage.setItem('admin_token', token);
      showApp();
    } catch(e) {
      errEl.textContent = 'Server error';
    }
  }

  function logout() {
    localStorage.removeItem('admin_token');
    token = null;
    clearInterval(refreshInterval);
    document.getElementById('admin-app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  }

  function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-app').style.display = 'flex';
    loadLeaderboard();
    loadSettings();
    startAutoRefresh();
  }

  function startAutoRefresh() {
    clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
      if (currentPanel === 'leaderboard') loadLeaderboard();
    }, 10000);
  }

  // === API ===
  async function apiFetch(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
      'x-admin-token': token,
      'Content-Type': 'application/json'
    };
    return fetch(url, { ...options, headers });
  }

  // === PANELS ===
  function showPanel(name) {
    currentPanel = name;
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${name}`).classList.add('active');
    document.querySelectorAll('.sidebar-nav-item').forEach(item => item.classList.remove('active'));
    const items = document.querySelectorAll('.sidebar-nav-item');
    const panelNames = ['leaderboard', 'questions', 'controls', 'export'];
    const idx = panelNames.indexOf(name);
    if (idx >= 0 && items[idx]) items[idx].classList.add('active');

    if (name === 'leaderboard') loadLeaderboard();
    if (name === 'questions') loadQuestions();
    if (name === 'controls') { loadSettings(); loadTeamsForReset(); }
    if (name === 'export') {}
  }

  // === LEADERBOARD ===
  async function loadLeaderboard() {
    try {
      const res = await apiFetch('/api/admin/leaderboard');
      if (!res.ok) { if (res.status === 401) logout(); return; }
      const teams = await res.json();

      // Stats
      const total = teams.length;
      const submitted = teams.filter(t => t.status === 'submitted').length;
      const inProgress = teams.filter(t => t.status === 'in_progress').length;
      const notStarted = teams.filter(t => t.status === 'not_started').length;
      const statsGrid = document.getElementById('stats-grid');
      statsGrid.innerHTML = `
        <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Teams</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--green-light)">${submitted}</div><div class="stat-label">Submitted</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--amber-light)">${inProgress}</div><div class="stat-label">In Progress</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--text3)">${notStarted}</div><div class="stat-label">Not Started</div></div>
      `;

      // Table
      const tbody = document.getElementById('leaderboard-body');
      tbody.innerHTML = '';
      teams.forEach((t, i) => {
        const rank = i + 1;
        const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
        const statusBadge = `<span class="status-badge status-${t.status}">${t.status.replace('_',' ')}</span>`;
        const timeTaken = t.time_taken_sec ? `${Math.floor(t.time_taken_sec/60)}m ${t.time_taken_sec%60}s` : '–';
        const flags = t.tab_switches || 0;
        const flagsClass = flags >= 10 ? 'flags-danger' : flags >= 5 ? 'flags-warn' : 'flags-cell';
        const members = (t.members || []).join(', ');

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="rank-num ${rankClass}">#${rank}</span></td>
          <td>
            <div style="font-weight:bold">${escHtml(t.name)}</div>
            <div style="font-size:0.75rem;color:var(--text2)">${escHtml(members)}</div>
          </td>
          <td>Route ${t.route}</td>
          <td><span class="score-cell">${t.score || 0}</span></td>
          <td style="color:var(--text2)">${timeTaken}</td>
          <td class="${flagsClass}">${flags}</td>
          <td>${statusBadge}</td>
          <td><button class="btn btn-xs btn-secondary" onclick="Admin.showTeamDetail(${t.id})">VIEW</button></td>
        `;
        tbody.appendChild(tr);
      });

      document.getElementById('last-refresh').textContent = 'Updated ' + new Date().toLocaleTimeString();
    } catch(e) {
      console.error(e);
    }
  }

  // === TEAM DETAIL ===
  async function showTeamDetail(teamId) {
    const modal = document.getElementById('team-modal');
    const content = document.getElementById('team-modal-content');
    content.innerHTML = '<p style="color:var(--text2)">Loading...</p>';
    modal.classList.remove('hidden');

    const res = await apiFetch(`/api/admin/teams/${teamId}`);
    const data = await res.json();
    const { team, attempt, answers } = data;

    document.getElementById('team-modal-title').textContent = team.name;

    let html = `
      <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;">
        <div><span style="color:var(--text2);font-size:0.8rem">ROUTE</span><div>Route ${team.route}</div></div>
        <div><span style="color:var(--text2);font-size:0.8rem">MEMBERS</span><div>${(team.members||[]).join(', ')}</div></div>
        ${attempt ? `
        <div><span style="color:var(--text2);font-size:0.8rem">STATUS</span><div class="status-badge status-${attempt.status}">${attempt.status}</div></div>
        <div><span style="color:var(--text2);font-size:0.8rem">SCORE</span><div style="font-size:1.3rem;color:var(--blue-light)">${attempt.score || 0}</div></div>
        <div><span style="color:var(--text2);font-size:0.8rem">TAB SWITCHES</span><div style="color:${(attempt.tab_switches||0)>=5?'var(--red-light)':'var(--text)'}">${attempt.tab_switches || 0}</div></div>
        ` : '<div style="color:var(--text2)">Not started yet.</div>'}
      </div>
    `;

    if (answers && answers.length > 0) {
      html += `<div style="font-family:var(--sans);font-size:0.7rem;letter-spacing:0.15em;color:var(--text2);margin-bottom:0.5rem;text-transform:uppercase">Per-Question Answers</div>`;
      // Sort by question position
      const sorted = [...answers].sort((a,b) => (a.question?.position||0) - (b.question?.position||0));
      for (const a of sorted) {
        const qText = a.question ? a.question.text.substring(0,80) + (a.question.text.length > 80 ? '…' : '') : 'Q'+a.question_id;
        const optText = a.selectedOption ? `${a.selectedOption.label}: ${a.selectedOption.text.substring(0,40)}` : '—';
        const wClass = a.weightEarned > 0 ? 'weight-pos' : 'weight-zero';
        html += `
          <div class="answer-row">
            <div class="answer-q-num">Q${a.question?.position || a.question_id}</div>
            <div class="answer-q-text">${escHtml(qText)}</div>
            <div class="answer-opt">${escHtml(optText)}</div>
            <div class="answer-weight ${wClass}">+${a.weightEarned}</div>
            ${a.flagged ? '<span style="color:var(--amber);font-size:0.7rem">🚩</span>' : ''}
          </div>
        `;
      }
    }
    content.innerHTML = html;
  }

  // === QUESTIONS ===
  async function loadQuestions() {
    const res = await apiFetch('/api/admin/questions');
    const questions = await res.json();
    const container = document.getElementById('questions-list');
    container.innerHTML = '';

    questions.forEach(q => {
      const card = document.createElement('div');
      card.className = 'q-editor-card';
      card.id = `qcard-${q.id}`;

      const optRows = q.options.map(o => `
        <div class="option-editor-row">
          <span class="option-label-badge">${o.label}</span>
          <input type="text" value="${escHtml(o.text)}" style="flex:1;padding:0.35rem 0.6rem;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--mono);font-size:0.8rem;" id="opt-text-${o.id}">
          <span style="font-size:0.75rem;color:var(--text2);margin:0 0.3rem">wt:</span>
          <input type="number" value="${o.weight}" style="width:70px;padding:0.35rem 0.5rem;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--r);color:var(--blue-light);font-family:var(--mono);font-size:0.8rem;" id="opt-wt-${o.id}">
          <button class="btn btn-xs btn-secondary" onclick="Admin.saveOption(${o.id})">Save</button>
        </div>
      `).join('');

      card.innerHTML = `
        <div class="q-editor-header" onclick="Admin.toggleQEditor(${q.id})">
          <span class="q-pos">${q.position}</span>
          <span class="q-preview">${escHtml(q.text)}</span>
          <span style="font-size:0.7rem;color:var(--text3);margin-right:0.5rem">${q.section}</span>
          <span style="font-size:0.7rem;color:var(--text3);margin-right:0.5rem">×${q.multiplier}</span>
          <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();Admin.deleteQuestion(${q.id})">DEL</button>
          <button class="btn btn-xs btn-secondary" onclick="event.stopPropagation();Admin.editQuestion(${q.id})">EDIT</button>
        </div>
        <div class="q-editor-body" id="qbody-${q.id}">
          <div style="font-size:0.8rem;color:var(--text2);margin-bottom:0.75rem;">${escHtml(q.text)}</div>
          ${q.code ? `<pre style="background:#0d1117;border:1px solid var(--border);padding:0.75rem;border-radius:var(--r);font-size:0.75rem;overflow-x:auto;margin-bottom:0.75rem">${escHtml(q.code)}</pre>` : ''}
          <div class="options-editor">${optRows}</div>
          <div style="display:flex;gap:0.5rem;margin-top:0.75rem;align-items:center">
            <span style="font-size:0.75rem;color:var(--text2)">Multiplier:</span>
            <input type="number" id="mult-${q.id}" value="${q.multiplier}" min="0.1" max="10" step="0.1" style="width:70px;padding:0.35rem 0.5rem;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--r);color:var(--blue-light);font-family:var(--mono);font-size:0.8rem;">
            <button class="btn btn-xs btn-secondary" onclick="Admin.saveMult(${q.id})">Set Multiplier</button>
            <label style="margin-left:auto;display:flex;align-items:center;gap:0.4rem;font-size:0.75rem;color:var(--text2);cursor:pointer">
              <input type="checkbox" ${q.active ? 'checked' : ''} onchange="Admin.toggleActive(${q.id}, this.checked)"> Active
            </label>
          </div>
          ${q.explanation ? `<div style="margin-top:0.75rem;padding:0.6rem;background:rgba(74,111,165,0.08);border:1px solid rgba(74,111,165,0.2);border-radius:var(--r);font-size:0.8rem;color:var(--text2)"><strong style="color:var(--blue-light)">Explanation:</strong> ${escHtml(q.explanation)}</div>` : ''}
        </div>
      `;
      container.appendChild(card);
    });
  }

  function toggleQEditor(id) {
    const body = document.getElementById(`qbody-${id}`);
    body.classList.toggle('open');
  }

  async function saveOption(optId) {
    const text = document.getElementById(`opt-text-${optId}`)?.value;
    const weight = parseInt(document.getElementById(`opt-wt-${optId}`)?.value);
    await apiFetch(`/api/admin/options/${optId}`, {
      method: 'PUT', body: JSON.stringify({ text, weight })
    });
    toast('Option saved', 'success');
  }

  async function saveMult(qId) {
    const mult = parseFloat(document.getElementById(`mult-${qId}`)?.value);
    await apiFetch(`/api/admin/questions/${qId}`, {
      method: 'PUT', body: JSON.stringify({ multiplier: mult })
    });
    toast('Multiplier saved', 'success');
  }

  async function toggleActive(qId, active) {
    await apiFetch(`/api/admin/questions/${qId}`, {
      method: 'PUT', body: JSON.stringify({ active: active ? 1 : 0 })
    });
    toast(`Question ${active ? 'activated' : 'deactivated'}`, 'success');
  }

  function showAddQuestion() {
    document.getElementById('q-modal-title').textContent = 'Add Question';
    document.getElementById('q-modal-id').value = '';
    document.getElementById('q-modal-pos').value = 21;
    document.getElementById('q-modal-section').value = '';
    document.getElementById('q-modal-sdg').value = '';
    document.getElementById('q-modal-mult').value = 1;
    document.getElementById('q-modal-text').value = '';
    document.getElementById('q-modal-code').value = '';
    document.getElementById('q-modal-explanation').value = '';
    renderOptionEditorRows([
      { label: 'A', text: '', weight: 0 },
      { label: 'B', text: '', weight: 0 },
      { label: 'C', text: '', weight: 0 },
      { label: 'D', text: '', weight: 0 },
    ]);
    document.getElementById('question-modal').classList.remove('hidden');
  }

  async function editQuestion(qId) {
    const res = await apiFetch('/api/admin/questions');
    const questions = await res.json();
    const q = questions.find(q => q.id === qId);
    if (!q) return;

    document.getElementById('q-modal-title').textContent = 'Edit Question';
    document.getElementById('q-modal-id').value = q.id;
    document.getElementById('q-modal-pos').value = q.position;
    document.getElementById('q-modal-section').value = q.section;
    document.getElementById('q-modal-sdg').value = q.sdg;
    document.getElementById('q-modal-mult').value = q.multiplier;
    document.getElementById('q-modal-text').value = q.text;
    document.getElementById('q-modal-code').value = q.code || '';
    document.getElementById('q-modal-explanation').value = q.explanation || '';
    renderOptionEditorRows(q.options);
    document.getElementById('question-modal').classList.remove('hidden');
  }

  function renderOptionEditorRows(options) {
    const container = document.getElementById('q-modal-options');
    container.innerHTML = options.map(o => `
      <div class="option-editor-row">
        <span class="option-label-badge">${o.label}</span>
        <input type="text" value="${escHtml(o.text||'')}" placeholder="Option text" style="flex:1;padding:0.4rem 0.7rem;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--mono);font-size:0.85rem;" data-opt-label="${o.label}" class="modal-opt-text">
        <span style="font-size:0.75rem;color:var(--text2);margin:0 0.3rem">wt:</span>
        <input type="number" value="${o.weight||0}" style="width:75px;padding:0.4rem 0.5rem;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--r);color:var(--blue-light);font-family:var(--mono);font-size:0.85rem;" data-opt-label="${o.label}" class="modal-opt-weight">
      </div>
    `).join('');
  }

  async function saveQuestion() {
    const id = document.getElementById('q-modal-id').value;
    const position = parseInt(document.getElementById('q-modal-pos').value);
    const section = document.getElementById('q-modal-section').value.trim();
    const sdg = document.getElementById('q-modal-sdg').value.trim();
    const multiplier = parseFloat(document.getElementById('q-modal-mult').value);
    const text = document.getElementById('q-modal-text').value.trim();
    const code = document.getElementById('q-modal-code').value.trim();
    const explanation = document.getElementById('q-modal-explanation').value.trim();

    if (!text || !section || !sdg) { alert('Text, section and SDG are required'); return; }

    const textInputs = document.querySelectorAll('.modal-opt-text');
    const weightInputs = document.querySelectorAll('.modal-opt-weight');
    const options = Array.from(textInputs).map((input, i) => ({
      label: input.dataset.optLabel,
      text: input.value.trim(),
      weight: parseInt(weightInputs[i].value) || 0
    }));

    if (id) {
      // Edit
      await apiFetch(`/api/admin/questions/${id}`, {
        method: 'PUT', body: JSON.stringify({ position, section, sdg, text, code: code||null, multiplier, explanation })
      });
      toast('Question updated', 'success');
    } else {
      // Add
      await apiFetch('/api/admin/questions', {
        method: 'POST', body: JSON.stringify({ position, section, sdg, text, code: code||null, multiplier, explanation, options })
      });
      toast('Question added', 'success');
    }
    closeModal('question-modal');
    loadQuestions();
  }

  async function deleteQuestion(qId) {
    if (!confirm('Delete this question? This cannot be undone.')) return;
    await apiFetch(`/api/admin/questions/${qId}`, { method: 'DELETE' });
    toast('Question deleted', 'success');
    loadQuestions();
  }

  // === SETTINGS ===
  async function loadSettings() {
    try {
      const res = await apiFetch('/api/admin/settings');
      const s = await res.json();
      const open = s.quiz_open === 'true';
      const badge = document.getElementById('quiz-open-badge');
      if (badge) {
        badge.textContent = open ? 'OPEN' : 'CLOSED';
        badge.className = `quiz-open-badge quiz-open-${open}`;
      }
      const durInput = document.getElementById('duration-input');
      if (durInput) durInput.value = s.quiz_duration_minutes || 25;
    } catch(e) {}
  }

  async function setQuizOpen(open) {
    await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ quiz_open: open }) });
    loadSettings();
    toast(`Quiz ${open ? 'opened' : 'closed'}`, 'success');
  }

  async function setDuration() {
    const mins = document.getElementById('duration-input').value;
    await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ quiz_duration_minutes: mins }) });
    toast('Duration updated', 'success');
  }

  async function loadTeamsForReset() {
    const res = await apiFetch('/api/admin/leaderboard');
    const teams = await res.json();
    const container = document.getElementById('teams-for-reset');
    if (!container) return;
    container.innerHTML = '';
    teams.forEach(t => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border2)';
      row.innerHTML = `
        <span style="font-size:0.9rem">${escHtml(t.name)} <span style="color:var(--text2);font-size:0.8rem">(${t.status})</span></span>
        <button class="btn btn-xs btn-danger" onclick="Admin.resetTeam(${t.id}, '${escHtml(t.name)}')">RESET</button>
      `;
      container.appendChild(row);
    });
  }

  async function resetTeam(teamId, teamName) {
    if (!confirm(`Reset attempt for "${teamName}"? Their answers will be deleted.`)) return;
    await apiFetch(`/api/admin/reset/team/${teamId}`, { method: 'POST' });
    toast(`Reset ${teamName}`, 'success');
    loadTeamsForReset();
  }

  function confirmResetAll() {
    document.getElementById('confirm-title').textContent = 'Reset ALL Data';
    document.getElementById('confirm-msg').textContent = 'This will delete ALL teams, attempts and answers. Type "RESET_ALL" to confirm.';
    document.getElementById('confirm-input').value = '';
    document.getElementById('confirm-input').placeholder = 'Type RESET_ALL';
    document.getElementById('confirm-action-btn').onclick = async () => {
      const val = document.getElementById('confirm-input').value;
      const res = await apiFetch('/api/admin/reset/all', { method: 'POST', body: JSON.stringify({ confirm: val }) });
      if (res.ok) {
        closeModal('confirm-modal');
        toast('All data reset', 'success');
        loadLeaderboard();
        loadTeamsForReset();
      } else {
        const d = await res.json();
        toast(d.error || 'Failed', 'error');
      }
    };
    document.getElementById('confirm-modal').classList.remove('hidden');
  }

  // === EXPORT ===
  function exportCSV() {
    window.open(`/api/admin/export/csv?token=${token}`, '_blank');
  }

  async function exportQuestions() {
    const res = await apiFetch('/api/admin/export/questions');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'questions.json'; a.click();
    URL.revokeObjectURL(url);
  }

  async function importQuestions() {
    const file = document.getElementById('import-file').files[0];
    const replace = document.getElementById('import-replace').checked;
    if (!file) { toast('Select a file', 'error'); return; }
    const text = await file.text();
    let questions;
    try { questions = JSON.parse(text); } catch(e) { toast('Invalid JSON', 'error'); return; }
    const res = await apiFetch('/api/admin/import/questions', {
      method: 'POST', body: JSON.stringify({ questions, replace })
    });
    const data = await res.json();
    if (res.ok) {
      toast(`Imported ${data.imported} questions`, 'success');
      loadQuestions();
    } else {
      toast(data.error || 'Import failed', 'error');
    }
  }

  // === MODAL ===
  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  // === TOAST ===
  function toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = type;
    void el.offsetWidth;
    setTimeout(() => el.classList.add('hidden'), 3000);
  }

  // === UTILS ===
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // === INIT ===
  function init() {
    if (token) {
      // Verify token by loading settings
      apiFetch('/api/admin/settings').then(r => {
        if (r.ok) showApp();
        else { localStorage.removeItem('admin_token'); token = null; }
      }).catch(() => {});
    }
  }

  // Auto-init
  init();

  return {
    login, logout, showPanel,
    loadLeaderboard, showTeamDetail,
    loadQuestions, toggleQEditor, saveOption, saveMult, toggleActive,
    showAddQuestion, editQuestion, saveQuestion, deleteQuestion,
    loadSettings, setQuizOpen, setDuration, loadTeamsForReset, resetTeam, confirmResetAll,
    exportCSV, exportQuestions, importQuestions,
    closeModal
  };
})();
