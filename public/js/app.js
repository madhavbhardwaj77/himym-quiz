/**
 * HOW I MET YOUR MURDERER – Round 2
 * Quiz Application — Participant Frontend Logic
 */

const App = (() => {
  // === STATE ===
  let state = {
    team: null,          // { id, name, token }
    questions: [],       // from server
    answers: {},         // { [question_id]: { option_id, flagged } }
    currentIndex: 0,
    attempt: null,       // { startedAt, status, durationMs }
    timerInterval: null,
    autoSaveQueue: {},
    violations: 0,
    toastTimer: null,
    isTabHidden: false,
    isWindowBlurred: false,
  };

  function isQuizActive() {
    return !!(state.attempt && state.attempt.status === 'in_progress');
  }

  // === INIT ===
  function init() {
    // Restore session from localStorage
    const saved = localStorage.getItem('himym_session');
    if (saved) {
      try {
        state.team = JSON.parse(saved);
      } catch(e) {
        state.team = null;
      }
    }

    // If we have a token, try to resume
    if (state.team && state.team.token) {
      resumeSession();
    } else {
      showView('landing');
    }

    // Strict Anti-Cheat & Proctoring Event Listeners
    setupSecurityListeners();
  }

  function setupSecurityListeners() {
    // 1. Tab Switch Detection (Page Visibility API)
    document.addEventListener('visibilitychange', () => {
      if (!isQuizActive()) return;
      if (document.hidden) {
        state.isTabHidden = true;
        logEvent('tab_switch');
      } else {
        if (state.isTabHidden) {
          state.isTabHidden = false;
          showSecurityViolation('Tab switch detected! Navigating away from the investigation window is prohibited.');
        }
      }
    });

    // 2. Window Blur (e.g. clicking outside, alt-tabbing, opening other apps)
    window.addEventListener('blur', () => {
      if (!isQuizActive()) return;
      state.isWindowBlurred = true;
      logEvent('blur');
    });

    window.addEventListener('focus', () => {
      if (!isQuizActive()) return;
      if (state.isWindowBlurred) {
        state.isWindowBlurred = false;
        showSecurityViolation('Window focus lost! Leaving or multitasking during the investigation is prohibited.');
      }
    });

    // 3. Fullscreen exit detection
    document.addEventListener('fullscreenchange', () => {
      if (!isQuizActive()) return;
      if (!document.fullscreenElement) {
        showSecurityViolation('Fullscreen exited! You must maintain fullscreen mode during the investigation.');
        logEvent('fullscreen_exit');
      }
    });

    // 4. Block Copy
    document.addEventListener('copy', (e) => {
      if (!isQuizActive()) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.clipboardData) e.clipboardData.setData('text/plain', '');
      showToastWarning('Copying exam content is strictly prohibited.');
      logEvent('copy');
    });

    // 5. Block Cut
    document.addEventListener('cut', (e) => {
      if (!isQuizActive()) return;
      e.preventDefault();
      e.stopPropagation();
      showToastWarning('Cutting exam content is strictly prohibited.');
      logEvent('cut');
    });

    // 6. Block Paste
    document.addEventListener('paste', (e) => {
      if (!isQuizActive()) return;
      e.preventDefault();
      e.stopPropagation();
      showToastWarning('Pasting content is prohibited.');
      logEvent('paste');
    });

    // 7. Block Right-Click Context Menu
    document.addEventListener('contextmenu', (e) => {
      if (!isQuizActive()) return;
      e.preventDefault();
      e.stopPropagation();
      showToastWarning('Right-click context menu is disabled.');
      logEvent('context_menu');
    });

    // 8. Block Text Selection during quiz
    document.addEventListener('selectstart', (e) => {
      if (!isQuizActive()) return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag !== 'input' && tag !== 'textarea') {
        e.preventDefault();
      }
    });

    // 9. Block Dragging content
    document.addEventListener('dragstart', (e) => {
      if (!isQuizActive()) return;
      e.preventDefault();
    });

    // 10. Block Keyboard Shortcuts (Refresh, Copy, Cut, Paste, Select All, Source, Save, Print, F12, DevTools)
    document.addEventListener('keydown', (e) => {
      if (!isQuizActive()) return;

      const key = (e.key || '').toLowerCase();
      const code = e.keyCode || e.which;
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // F5 (Refresh)
      if (e.key === 'F5' || code === 116) {
        e.preventDefault();
        e.stopPropagation();
        showToastWarning('Page refresh (F5) is strictly disabled during the exam.');
        logEvent('refresh_attempt');
        return;
      }

      // Ctrl+R / Cmd+R / Ctrl+Shift+R (Refresh)
      if (isCtrlOrMeta && (key === 'r' || code === 82)) {
        e.preventDefault();
        e.stopPropagation();
        showToastWarning('Page refresh (Ctrl+R / Cmd+R) is disabled during the exam.');
        logEvent('refresh_attempt');
        return;
      }

      // F12 (DevTools)
      if (e.key === 'F12' || code === 123) {
        e.preventDefault();
        e.stopPropagation();
        showToastWarning('Developer tools shortcut (F12) is disabled.');
        logEvent('shortcut_attempt');
        return;
      }

      // Ctrl/Cmd + Shift + I/J/C (DevTools inspect/console)
      if (isCtrlOrMeta && e.shiftKey && ['i', 'j', 'c'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        showToastWarning('Inspection shortcut is disabled.');
        logEvent('shortcut_attempt');
        return;
      }

      // Ctrl/Cmd + C, V, X, A, U, S, P
      if (isCtrlOrMeta && ['c', 'v', 'x', 'a', 'u', 's', 'p'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        const actionMap = {
          c: 'Copy',
          v: 'Paste',
          x: 'Cut',
          a: 'Select All',
          u: 'View Source',
          s: 'Save Page',
          p: 'Print Page'
        };
        showToastWarning(`Shortcut (${actionMap[key] || key.toUpperCase()}) is disabled.`);
        logEvent('shortcut_attempt');
        return;
      }
    }, true);

    // 11. Page Unload / Reload Warning Dialog
    window.addEventListener('beforeunload', (e) => {
      if (isQuizActive()) {
        try {
          localStorage.setItem('himym_reloaded', '1');
        } catch(err) {}
        e.preventDefault();
        e.returnValue = 'Reloading the page during the investigation is recorded as an infraction.';
        return e.returnValue;
      }
    });
  }

  function showToastWarning(msg) {
    const toast = document.getElementById('security-toast');
    const msgEl = document.getElementById('security-toast-msg');
    if (!toast || !msgEl) return;

    msgEl.textContent = msg;
    toast.classList.add('visible');

    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3200);
  }

  function showSecurityViolation(reason, customTitle) {
    state.violations = (state.violations || 0) + 1;
    const modal = document.getElementById('security-modal');
    const strikeEl = document.getElementById('security-strikes-count');
    const titleEl = document.getElementById('security-modal-title');
    const descEl = document.getElementById('security-modal-desc');

    if (strikeEl) {
      strikeEl.textContent = `Strike #${state.violations}`;
    }

    if (titleEl && customTitle) {
      titleEl.textContent = customTitle;
    } else if (titleEl) {
      titleEl.textContent = '⚠️ TAB SWITCH DETECTED';
    }

    if (descEl && reason) {
      descEl.textContent = reason;
    }

    if (modal) {
      modal.classList.remove('hidden');
    }

    showToastWarning(`Security Violation: Strike #${state.violations} recorded.`);
  }

  function dismissSecurityWarning() {
    const modal = document.getElementById('security-modal');
    if (modal) modal.classList.add('hidden');
    requestFullscreenMode();
  }

  function requestFullscreenMode() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch(e) {}
  }

  async function resumeSession() {
    showLoading('Resuming session...');
    try {
      const res = await apiFetch('/api/questions');
      if (!res.ok) {
        // Not started yet — go to rules
        hideLoading();
        showView('rules');
        updateRulesInfo();
        return;
      }
      const data = await res.json();
      if (data.attempt && data.attempt.status === 'submitted') {
        // Already submitted — show result
        hideLoading();
        showResult(data.score || data.credits || 0, data.timeTaken || null);
        return;
      }
      if (data.attempt && data.attempt.status === 'in_progress') {
        state.questions = data.questions || [];
        state.answers = data.answers || {};
        state.attempt = data.attempt;

        // Restore persisted strike count from server
        state.violations = data.attempt.tabSwitches || 0;

        hideLoading();
        showView('quiz');
        renderQuiz();
        startTimer();

        // Check if page was reloaded mid-quiz
        if (localStorage.getItem('himym_reloaded')) {
          localStorage.removeItem('himym_reloaded');
          logEvent('page_reload');
          showSecurityViolation('Page reload detected! Refreshing during the investigation is recorded as an infraction.', '⚠️ PAGE RELOAD DETECTED');
        }
      } else {
        hideLoading();
        showView('rules');
        updateRulesInfo();
      }
    } catch(e) {
      hideLoading();
      showView('landing');
    }
  }

  // === LOADING OVERLAY ===
  function showLoading(msg) {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `
        <div class="loading-spinner"></div>
        <span class="loading-text" id="loading-text"></span>
      `;
      document.body.appendChild(overlay);
    }
    document.getElementById('loading-text').textContent = msg || 'Loading...';
    overlay.style.display = 'flex';
  }

  function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // === VIEWS ===
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${name}`);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);

    if (name === 'quiz') {
      document.body.classList.add('quiz-active');
      requestFullscreenMode();
    } else {
      document.body.classList.remove('quiz-active');
      const secModal = document.getElementById('security-modal');
      if (secModal) secModal.classList.add('hidden');
    }
  }

  // === REGISTRATION ===
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('team-name').value.trim();
    const route = parseInt(document.getElementById('team-route').value);
    const memberInputs = document.querySelectorAll('.member-input');
    const members = Array.from(memberInputs).map(i => i.value.trim()).filter(Boolean);
    const errEl = document.getElementById('register-error');

    if (!name) {
      errEl.textContent = 'Please enter a team name.';
      errEl.classList.remove('hidden');
      return;
    }

    if (!route || isNaN(route)) {
      errEl.textContent = 'Please select a route number.';
      errEl.classList.remove('hidden');
      return;
    }

    if (members.length < 2) {
      errEl.textContent = 'Please enter at least 2 member names.';
      errEl.classList.remove('hidden');
      return;
    }

    errEl.classList.add('hidden');

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, members, route })
      });
      const data = await res.json();
      if (!res.ok) {
        errEl.textContent = data.error || 'Registration failed. Please try again.';
        errEl.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'REGISTER TEAM →';
        return;
      }
      state.team = { id: data.id, name: data.name, token: data.token };
      localStorage.setItem('himym_session', JSON.stringify(state.team));
      updateRulesInfo();
      showView('rules');
    } catch(e) {
      errEl.textContent = 'Network error. Please try again.';
      errEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'REGISTER TEAM →';
    }
  });

  function addMember() {
    const list = document.getElementById('members-list');
    if (list.children.length >= 4) return;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'member-input form-group input';
    inp.placeholder = `Member ${list.children.length + 1}`;
    // Apply the same base styling via form-group context
    inp.style.width = '100%';
    inp.style.padding = '0.7rem 1rem';
    inp.style.background = 'var(--bg-card2)';
    inp.style.border = '1px solid var(--border)';
    inp.style.borderRadius = 'var(--radius)';
    inp.style.color = 'var(--text-primary)';
    inp.style.fontFamily = 'var(--mono)';
    inp.style.fontSize = '0.95rem';
    list.appendChild(inp);
    inp.focus();
    if (list.children.length >= 4) {
      document.getElementById('add-member-btn').disabled = true;
    }
  }

  function updateRulesInfo() {
    const el = document.getElementById('rules-team-info');
    if (state.team) {
      el.innerHTML = `<strong>Team:</strong> ${escapeHtml(state.team.name)}`;
      el.style.display = 'block';
    }

    if (!state.team || !state.team.token) return;

    // Fetch attempt status without starting it (GET /api/attempts/me)
    apiFetch('/api/attempts/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.durationMs) {
          const mins = Math.round(data.durationMs / 60000);
          const durEl = document.getElementById('rules-duration');
          if (durEl) durEl.textContent = mins;
        }
        if (data.status === 'in_progress') {
          // Quiz already started previously (e.g. resumed), store attempt and show quiz
          state.attempt = { startedAt: data.startedAt, status: data.status, durationMs: data.durationMs };
        }
        if (data.status === 'submitted') {
          showResult(data.score || data.credits || 0, data.timeTaken || null);
        }
      })
      .catch(() => {});
  }

  // === START QUIZ ===
  async function startQuiz() {
    if (!state.team) return;
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    btn.textContent = 'Starting...';
    showLoading('Starting investigation...');

    try {
      const startRes = await apiFetch('/api/attempts/start', { method: 'POST' });
      if (!startRes.ok) {
        const data = await startRes.json().catch(() => ({}));
        hideLoading();
        alert(data.error || 'Could not start quiz. Please try again.');
        btn.disabled = false;
        btn.innerHTML = '🔍 START INVESTIGATION';
        return;
      }
      const startData = await startRes.json();
      state.attempt = {
        startedAt: startData.startedAt,
        status: startData.status,
        durationMs: startData.durationMs
      };

      const qRes = await apiFetch('/api/questions');
      if (!qRes.ok) {
        hideLoading();
        alert('Failed to load questions. Please refresh and try again.');
        btn.disabled = false;
        btn.innerHTML = '🔍 START INVESTIGATION';
        return;
      }
      const qData = await qRes.json();
      state.questions = qData.questions || [];
      state.answers = qData.answers || {};
      // Merge any attempt data from questions endpoint
      if (qData.attempt) {
        state.attempt = { ...state.attempt, ...qData.attempt };
      }

      hideLoading();
      showView('quiz');
      renderQuiz();
      startTimer();
    } catch(e) {
      hideLoading();
      alert('Network error. Please try again.');
      btn.disabled = false;
      btn.innerHTML = '🔍 START INVESTIGATION';
    }
  }

  // === QUIZ RENDER ===
  function renderQuiz() {
    // Team name in topbar
    document.getElementById('quiz-team-name').textContent = state.team?.name || '';

    // Render navigator buttons
    const nav = document.getElementById('question-nav');
    nav.innerHTML = '';
    state.questions.forEach((q, i) => {
      const btn = document.createElement('button');
      btn.className = 'nav-btn';
      btn.textContent = i + 1;
      btn.setAttribute('aria-label', `Question ${i + 1}`);
      btn.onclick = () => goToQuestion(i);
      nav.appendChild(btn);
    });

    renderQuestion(state.currentIndex);
  }

  function renderQuestion(index) {
    state.currentIndex = index;
    const q = state.questions[index];
    if (!q) return;

    // Update navigator highlight
    document.querySelectorAll('.nav-btn').forEach((btn, i) => {
      btn.classList.remove('active', 'answered', 'flagged');
      const ans = state.answers[state.questions[i]?.id];
      if (i === index) {
        btn.classList.add('active');
        // Auto-scroll navigator so active question button is centered into view on mobile
        try {
          btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        } catch(e) {}
      }
      if (ans && ans.option_id) btn.classList.add('answered');
      if (ans && ans.flagged) btn.classList.add('flagged');
    });

    // Progress bar
    const answered = Object.values(state.answers).filter(a => a && a.option_id).length;
    const pct = Math.max(5, Math.round((answered / state.questions.length) * 100));
    document.getElementById('progress-bar').style.width = pct + '%';

    // Question header
    document.getElementById('q-number').textContent = `Q${index + 1}`;
    document.getElementById('q-section').textContent = q.section || '';
    document.getElementById('q-sdg').textContent = q.sdg || '';

    // Question text
    document.getElementById('q-text').textContent = q.text || '';

    // Code block
    const codeBlock = document.getElementById('q-code');
    const codeContent = document.getElementById('q-code-content');
    if (q.code) {
      codeContent.textContent = q.code;
      codeBlock.classList.remove('hidden');
    } else {
      codeBlock.classList.add('hidden');
      codeContent.textContent = '';
    }

    // Flag button
    const flagBtn = document.getElementById('flag-btn');
    const ans = state.answers[q.id];
    const isFlagged = !!(ans && ans.flagged);
    flagBtn.classList.toggle('flagged', isFlagged);
    flagBtn.textContent = isFlagged ? '🚩 Flagged' : '🚩 Flag';

    // Options
    const optionsGrid = document.getElementById('options-grid');
    optionsGrid.innerHTML = '';
    if (q.options && q.options.length) {
      q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        if (ans && ans.option_id === opt.id) btn.classList.add('selected');

        const label = document.createElement('span');
        label.className = 'option-label';
        label.textContent = opt.label || '';

        const text = document.createElement('span');
        text.textContent = opt.text || '';

        btn.appendChild(label);
        btn.appendChild(text);
        btn.onclick = () => selectOption(q.id, opt.id, btn);
        optionsGrid.appendChild(btn);
      });
    }

    // Navigation buttons
    document.getElementById('prev-btn').disabled = (index === 0);
    document.getElementById('next-btn').disabled = (index === state.questions.length - 1);
    document.getElementById('q-counter').textContent = `${index + 1} / ${state.questions.length}`;

    window.scrollTo(0, 0);
  }

  function selectOption(questionId, optionId, btnEl) {
    if (state.attempt && state.attempt.status === 'submitted') return;

    const prev = state.answers[questionId] || {};
    // Toggle deselect: clicking the already-selected option clears it
    const newOptId = (prev.option_id === optionId) ? null : optionId;

    state.answers[questionId] = { ...prev, option_id: newOptId };

    // Update options UI
    document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
    if (newOptId) btnEl.classList.add('selected');

    // Update nav button
    const qIndex = state.questions.findIndex(q => q.id === questionId);
    const navBtn = document.querySelectorAll('.nav-btn')[qIndex];
    if (navBtn) {
      navBtn.classList.toggle('answered', !!newOptId);
      // Preserve flag class
      const ans = state.answers[questionId];
      navBtn.classList.toggle('flagged', !!(ans && ans.flagged));
    }

    // Update progress bar
    const answered = Object.values(state.answers).filter(a => a && a.option_id).length;
    const pct = Math.max(5, Math.round((answered / state.questions.length) * 100));
    document.getElementById('progress-bar').style.width = pct + '%';

    // Autosave
    saveAnswer(questionId);
  }

  function toggleFlag() {
    const q = state.questions[state.currentIndex];
    if (!q) return;
    if (state.attempt && state.attempt.status === 'submitted') return;

    const prev = state.answers[q.id] || {};
    state.answers[q.id] = { ...prev, flagged: !prev.flagged };

    // Re-render current question to reflect flag state
    renderQuestion(state.currentIndex);

    // Autosave the flag change
    saveAnswer(q.id);
  }

  function navigate(dir) {
    const newIndex = state.currentIndex + dir;
    if (newIndex >= 0 && newIndex < state.questions.length) {
      renderQuestion(newIndex);
    }
  }

  function goToQuestion(index) {
    if (index >= 0 && index < state.questions.length) {
      renderQuestion(index);
    }
  }

  // === AUTO-SAVE ===
  async function saveAnswer(questionId) {
    if (!state.team || !state.attempt) return;
    const ans = state.answers[questionId] || {};
    try {
      await apiFetch('/api/answers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: questionId,
          option_id: ans.option_id || null,
          flagged: ans.flagged ? 1 : 0,
          time_spent_sec: 0
        })
      });
    } catch(e) {
      // Silent fail — user can still submit even if individual saves fail
    }
  }

  // === TIMER ===
  function startTimer() {
    if (!state.attempt) return;

    // Clear any existing timer
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
    }

    const startedAt = new Date(state.attempt.startedAt).getTime();
    const durationMs = state.attempt.durationMs;

    function tick() {
      const elapsed = Date.now() - startedAt;
      const remaining = durationMs - elapsed;

      if (remaining <= 0) {
        clearInterval(state.timerInterval);
        const display = document.getElementById('timer-display');
        if (display) {
          display.textContent = '00:00';
          display.className = 'timer-display critical';
        }
        autoSubmit();
        return;
      }

      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const display = document.getElementById('timer-display');
      if (display) {
        display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        if (remaining < 60000) {
          display.className = 'timer-display critical';
        } else if (remaining < 300000) {
          display.className = 'timer-display warning';
        } else {
          display.className = 'timer-display';
        }
      }
    }

    tick();
    state.timerInterval = setInterval(tick, 1000);
  }

  async function autoSubmit() {
    await submitQuiz(true);
  }

  // === SUBMIT ===
  function confirmSubmit() {
    if (state.attempt && state.attempt.status === 'submitted') return;

    const answered = Object.values(state.answers).filter(a => a && a.option_id).length;
    const flagged = Object.values(state.answers).filter(a => a && a.flagged).length;
    const total = state.questions.length;
    const unanswered = total - answered;

    let summary = `You have answered <strong>${answered}</strong> of <strong>${total}</strong> questions.<br>`;
    if (flagged > 0) {
      summary += `<strong>${flagged}</strong> question(s) are still flagged for review.<br>`;
    }
    if (unanswered > 0) {
      summary += `<strong>${unanswered}</strong> question(s) are unanswered and will score 0.<br>`;
    }
    summary += `<br>This action is <strong>final</strong> and cannot be undone.`;

    document.getElementById('modal-summary').innerHTML = summary;
    document.getElementById('submit-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('submit-modal').classList.add('hidden');
  }

  async function submitQuiz(isAuto = false) {
    if (!isAuto) closeModal();
    if (state.attempt && state.attempt.status === 'submitted') return;

    // Remove security lock on submit
    document.body.classList.remove('quiz-active');
    const secModal = document.getElementById('security-modal');
    if (secModal) secModal.classList.add('hidden');

    // Stop timer immediately
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    if (!isAuto) showLoading('Submitting investigation...');

    try {
      const res = await apiFetch('/api/attempts/submit', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        state.attempt = { ...state.attempt, status: 'submitted' };
        hideLoading();
        showResult(data.credits || data.score || 0, data.timeTaken || null);
      } else {
        hideLoading();
        if (!isAuto) {
          alert(data.error || 'Submission failed. Please try again.');
        }
      }
    } catch(e) {
      hideLoading();
      if (!isAuto) {
        alert('Network error during submission. Please check your connection and try again.');
      }
    }
  }

  function showResult(credits, timeTaken) {
    const creditsEl = document.getElementById('result-credits');
    if (creditsEl) creditsEl.textContent = credits;

    const timeEl = document.getElementById('result-time');
    if (timeEl && timeTaken) {
      const mins = Math.floor(timeTaken / 60);
      const secs = timeTaken % 60;
      timeEl.textContent = `Time taken: ${mins}m ${String(secs).padStart(2, '0')}s`;
    } else if (timeEl) {
      timeEl.textContent = '';
    }

    showView('result');
  }

  // === ANTI-CHEAT ===
  async function logEvent(type) {
    if (!state.team || !state.team.token) return;
    try {
      const res = await apiFetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, timestamp: new Date().toISOString() })
      });
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data && typeof data.strikes === 'number') {
          state.violations = data.strikes;
          const strikeEl = document.getElementById('security-strikes-count');
          if (strikeEl) strikeEl.textContent = `Strike #${state.violations}`;
        }
      }
    } catch(e) {
      // Silent — anti-cheat logging should never crash the app
    }
  }

  // === API HELPER ===
  function apiFetch(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
      'x-team-token': state.team?.token || ''
    };
    return fetch(url, { ...options, headers });
  }

  // === UTILITIES ===
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // === PUBLIC API ===
  return {
    init,
    showView,
    addMember,
    startQuiz,
    navigate,
    goToQuestion,
    toggleFlag,
    confirmSubmit,
    closeModal,
    submitQuiz,
    dismissSecurityWarning,
    requestFullscreenMode
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
