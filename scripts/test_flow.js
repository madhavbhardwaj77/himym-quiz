const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('=== Step 1: Admin Authentication & Settings ===');
  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { password: 'supersecret' });
  console.log('Admin login status:', loginRes.status);
  const adminToken = loginRes.data.token;
  if (!adminToken) throw new Error('Failed to get admin token');

  const settingsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/settings',
    method: 'GET',
    headers: { 'x-admin-token': adminToken }
  });
  console.log('Settings:', settingsRes.data);
  if (settingsRes.data.quiz_duration_minutes !== '40') {
    throw new Error('quiz_duration_minutes is not 40! Got: ' + settingsRes.data.quiz_duration_minutes);
  }

  console.log('\n=== Step 2: Admin Questions Check (10,000 Credits) ===');
  const questionsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/questions',
    method: 'GET',
    headers: { 'x-admin-token': adminToken }
  });
  const questions = questionsRes.data;
  console.log('Question count:', questions.length);
  if (questions.length !== 20) throw new Error('Expected 20 questions');

  let totalMaxCredits = 0;
  const sectionTotals = {};
  questions.forEach(q => {
    const maxW = Math.max(...q.options.map(o => o.weight));
    const section = q.section;
    sectionTotals[section] = (sectionTotals[section] || 0) + maxW * q.multiplier;
    totalMaxCredits += maxW * q.multiplier;
  });
  console.log('Section Totals:', sectionTotals);
  console.log('Total Max Credits:', totalMaxCredits);
  if (totalMaxCredits !== 10000) throw new Error('Total max credits != 10000');

  console.log('\n=== Step 3: Team Registration & Timer Independence ===');
  const teamRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/teams',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'Inspector Morse ' + Date.now(),
    members: ['Morse', 'Lewis'],
    route: 3
  });
  console.log('Team registration status:', teamRes.status, 'Team ID:', teamRes.data.id);
  const teamToken = teamRes.data.token;

  // Check attempt status before starting
  const meRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/attempts/me',
    method: 'GET',
    headers: { 'x-team-token': teamToken }
  });
  console.log('GET /api/attempts/me before start:', meRes.data);
  if (meRes.data.status !== 'not_started') {
    throw new Error('Attempt should be not_started before clicking Start!');
  }
  if (meRes.data.durationMs !== 40 * 60 * 1000) {
    throw new Error('Duration should be 40 min in ms (2400000)! Got: ' + meRes.data.durationMs);
  }

  console.log('\n=== Step 4: Start Investigation ===');
  const startRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/attempts/start',
    method: 'POST',
    headers: { 'x-team-token': teamToken }
  });
  console.log('Start attempt response:', startRes.data);
  if (startRes.data.status !== 'in_progress' || !startRes.data.startedAt) {
    throw new Error('Start failed');
  }

  console.log('\n=== Step 5: Participant GET /api/questions ===');
  const partQRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/questions',
    method: 'GET',
    headers: { 'x-team-token': teamToken }
  });
  console.log('Participant questions count:', partQRes.data.questions.length);
  const sampleQ1 = partQRes.data.questions[0];
  console.log('Q1 Section:', sampleQ1.section);
  console.log('Q1 Text excerpt:', sampleQ1.text.substring(0, 60) + '...');
  console.log('Q1 Options count:', sampleQ1.options.length);
  console.log('Q1 Option weights exposed?', sampleQ1.options.some(o => o.weight !== undefined));
  if (sampleQ1.options.some(o => o.weight !== undefined)) {
    throw new Error('Option weights MUST NOT be sent to participant!');
  }

  console.log('\n=== Step 6: Log Anti-cheat Event ===');
  const eventRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/events',
    method: 'POST',
    headers: {
      'x-team-token': teamToken,
      'Content-Type': 'application/json'
    }
  }, { type: 'tab_switch' });
  console.log('Event log status:', eventRes.status, eventRes.data);

  console.log('\n=== Step 7: Submit Answer for Q1 ===');
  // Find correct option for Q1 from admin questions to test scoring
  const adminQ1 = questions.find(q => q.position === 1);
  const correctOpt = adminQ1.options.find(o => o.weight > 0);
  console.log('Answering Q1 with correct option ID:', correctOpt.id, 'Expected weight:', correctOpt.weight);

  const ansRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/answers',
    method: 'PUT',
    headers: {
      'x-team-token': teamToken,
      'Content-Type': 'application/json'
    }
  }, {
    question_id: adminQ1.id,
    option_id: correctOpt.id,
    flagged: 0,
    time_spent_sec: 15
  });
  console.log('Answer status:', ansRes.status, ansRes.data);

  console.log('\n=== Step 8: Submit Quiz & Verify Score ===');
  const submitRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/attempts/submit',
    method: 'POST',
    headers: { 'x-team-token': teamToken }
  });
  console.log('Submit response:', submitRes.data);
  if (submitRes.data.credits !== correctOpt.weight) {
    throw new Error(`Expected score ${correctOpt.weight}, got ${submitRes.data.credits}`);
  }

  console.log('\n=== Step 9: Verify Leaderboard & Detail ===');
  const lbRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/leaderboard',
    method: 'GET',
    headers: { 'x-admin-token': adminToken }
  });
  const teamInLb = lbRes.data.find(t => t.id === teamRes.data.id);
  console.log('Team in leaderboard:', {
    name: teamInLb.name,
    score: teamInLb.score,
    status: teamInLb.status,
    tab_switches: teamInLb.tab_switches
  });
  if (teamInLb.tab_switches !== 1) {
    throw new Error('Tab switches should be 1');
  }

  console.log('\n>>> ALL VERIFICATION TESTS PASSED SUCCESSFULLY! <<<');
}

run().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
