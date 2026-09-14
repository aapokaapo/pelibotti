function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderLayout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
    a.button, button { display: inline-block; background: #5865f2; color: white; border: 0; border-radius: 10px; padding: 12px 18px; text-decoration: none; cursor: pointer; font-size: 14px; }
    .secondary { background: #1e293b; }
    .hero, .card, .fixture-card, .admin-box { background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 20px; }
    .hero { display: flex; justify-content: space-between; gap: 20px; align-items: center; margin-bottom: 24px; flex-wrap: wrap; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .stack { display: grid; gap: 16px; }
    .muted { color: #94a3b8; }
    h1, h2, h3 { margin-top: 0; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    form { display: grid; gap: 12px; }
    input[type="text"], input[type="password"], input[type="file"] { width: 100%; box-sizing: border-box; border-radius: 10px; border: 1px solid #475569; background: #020617; color: #e2e8f0; padding: 12px; }
    .notice { padding: 12px 14px; border-radius: 10px; background: #1d4ed8; }
    .error { background: #991b1b; }
    .top-links { display: flex; gap: 12px; flex-wrap: wrap; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

function withCsrf(action, csrfToken) {
  if (!csrfToken) {
    return action;
  }

  const separator = action.includes('?') ? '&' : '?';
  return `${action}${separator}csrfToken=${encodeURIComponent(csrfToken)}`;
}

function renderHomePage({ inviteUrl, fixtures, weekNumber, timezone, notice }) {
  const fixtureCards = fixtures.length > 0
    ? fixtures.map((fixture) => {
      const logo = fixture.teamA.logoUrl || fixture.teamB.logoUrl;
      const logoAlt = fixture.teamA.logoUrl ? `${fixture.teamA.name} logo` : `${fixture.teamB.name} logo`;
      const mapPoolHtml = fixture.mapPool
        ? `<ul>${fixture.mapPool.maps.map((map) => `<li>${escapeHtml(map)}</li>`).join('')}</ul>`
        : '<p class="muted">No map pool uploaded yet.</p>';

      return `<section class="fixture-card">
        ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(logoAlt)}" width="64" height="64" loading="lazy" decoding="async" style="width:64px;height:64px;object-fit:cover;border-radius:12px;margin-bottom:12px;" />` : ''}
        <h3>${escapeHtml(fixture.teamA.name)} vs ${escapeHtml(fixture.teamB.name)}</h3>
        <p class="muted">Week ${escapeHtml(fixture.weekNumber)} fixture</p>
        ${mapPoolHtml}
      </section>`;
    }).join('')
    : '<section class="card"><p class="muted">No fixtures are available for the current display week yet.</p></section>';

  return renderLayout('pelibotti', `
    <section class="hero">
      <div>
        <h1>pelibotti league portal</h1>
        <p class="muted">Invite the bot, manage weekly match scheduling, and review the current fixtures from one place.</p>
        <p class="muted">Current week: ${escapeHtml(weekNumber)} · Timezone: ${escapeHtml(timezone)}</p>
      </div>
      <div class="top-links">
        <a class="button" href="${escapeHtml(inviteUrl)}">Invite bot</a>
        <a class="button secondary" href="/admin">Admin uploads</a>
      </div>
    </section>
    <section class="stack">
      ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
      <div class="card">
        <h2>How teams get started</h2>
        <ul>
          <li>Invite the bot to your Discord server.</li>
          <li>Run <code>/setup_team</code> in the target channel.</li>
          <li>Run <code>/set_default_dates</code> and <code>/set_schedule_time</code> to configure weekly automation.</li>
        </ul>
      </div>
      <div>
        <h2>Current fixtures</h2>
        <div class="grid">${fixtureCards}</div>
      </div>
    </section>
  `);
}

function renderAdminPage({ isAuthenticated, message, isError, csrfToken = '' }) {
  const notice = message
    ? `<div class="notice ${isError ? 'error' : ''}">${escapeHtml(message)}</div>`
    : '';

  if (!isAuthenticated) {
    return renderLayout('Admin login', `
      <section class="admin-box stack">
        <h1>Admin uploads</h1>
        ${notice}
        <p class="muted">Sign in with the shared admin key to upload teams, fixtures, and map pools.</p>
        <form method="post" action="/admin/login">
          <input type="password" name="adminKey" placeholder="Admin key" required />
          <button type="submit">Open admin portal</button>
        </form>
      </section>
    `);
  }

  return renderLayout('Admin uploads', `
    <section class="stack">
      <div class="hero">
        <div>
          <h1>Admin uploads</h1>
          <p class="muted">Uploads are scoped per Discord guild ID so each server keeps its own league data.</p>
        </div>
        <form method="post" action="${escapeHtml(withCsrf('/admin/logout', csrfToken))}">
          <button class="secondary" type="submit">Log out</button>
        </form>
      </div>
      ${notice}
      <div class="grid">
        <section class="admin-box">
          <h2>Upload teams</h2>
          <form method="post" action="${escapeHtml(withCsrf('/admin/upload/teams', csrfToken))}" enctype="multipart/form-data">
            <input type="text" name="guildId" placeholder="Discord guild ID" required />
            <input type="file" name="file" accept=".csv,.json" required />
            <button type="submit">Upload teams</button>
          </form>
        </section>
        <section class="admin-box">
          <h2>Upload fixtures</h2>
          <form method="post" action="${escapeHtml(withCsrf('/admin/upload/fixtures', csrfToken))}" enctype="multipart/form-data">
            <input type="text" name="guildId" placeholder="Discord guild ID" required />
            <input type="file" name="file" accept=".csv,.json" required />
            <button type="submit">Upload fixtures</button>
          </form>
        </section>
        <section class="admin-box">
          <h2>Upload map pools</h2>
          <form method="post" action="${escapeHtml(withCsrf('/admin/upload/map-pools', csrfToken))}" enctype="multipart/form-data">
            <input type="text" name="guildId" placeholder="Discord guild ID" required />
            <input type="file" name="file" accept=".csv,.json" required />
            <button type="submit">Upload map pools</button>
          </form>
        </section>
      </div>
    </section>
  `);
}

module.exports = {
  escapeHtml,
  renderAdminPage,
  renderHomePage
};
