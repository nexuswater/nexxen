'use strict';
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (cents = 0) => (Number(cents) / 100).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const labels = {overview:'Overview',activity:'Activity',mandates:'Spend mandates',credit:'Credit lab',cards:'GPU funding cycle',integrations:'Integrations'};
let state, busy = false, toastTimer;
let cycleScenario = 'success';
const creditResults = {};
const pendingKeys = new Map();
// Request correlation only: never persist credentials or reusable payment signatures.
try {
  const saved = JSON.parse(sessionStorage.getItem('nexxen.pending-orders') || '[]');
  if (Array.isArray(saved)) for (const pair of saved) {
    if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && typeof pair[1] === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(pair[1])) pendingKeys.set(pair[0], pair[1]);
  }
} catch { /* Storage may be disabled or contain invalid data; in-memory retries still work. */ }
function persistPendingKeys() {
  try { sessionStorage.setItem('nexxen.pending-orders', JSON.stringify([...pendingKeys])); }
  catch { /* A storage failure must not break the local application. */ }
}
async function api(path, options = {}) {
  const response = await fetch(path, {headers:{'Content-Type':'application/json'}, ...options});
  let data;
  try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response. Refresh to reconcile before trying again.'); }
  if (!response.ok) throw new Error(data.error || data.message || 'The request could not be completed.');
  return data;
}
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 6500); }
function currentView() { const view = location.hash.slice(1); return labels[view] ? view : 'overview'; }
function heading(eyebrow, title, description, action = '') { return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="subtitle">${description}</p></div>${action}</div>`; }
function pill(text, color = '') { return `<span class="pill ${color}">${esc(text)}</span>`; }
function stats() {
  const b = state.balance;
  return `<div class="stats">${[
    ['AP4M available capacity',b.available,'AP4M funded fixture capacity only','◈'],
    ['AP4M issued obligations',b.issued,'Cumulative fixture obligations','↗'],
    ['AP4M redeemed claims',b.redeemed,'Not proof of seller payout','⇄'],
    ['AP4M settled payout',b.settled,'Simulated · no on-chain transaction','✓']
  ].map(([label,value,foot,icon]) => `<section class="stat"><div class="stat-label">${label}<span class="stat-icon" aria-hidden="true">${icon}</span></div><div class="stat-value">${money(value)}<small>RLUSD</small></div><div class="stat-foot"><span class="dot"></span>${foot}</div></section>`).join('')}</div>`;
}
function servicePanel() {
  return `<section class="panel"><div class="panel-header"><div><h2>Put your agent to work</h2><p class="subtitle">Approved resources. Policy checked on every purchase.</p></div>${pill('FIXTURE CATALOG')}</div><div class="service-list">${state.services.filter(service => service.rail !== 'card_simulation' && service.id !== 'card_cloud').map((service,index) => `<article class="service"><div class="service-symbol" aria-hidden="true">${['⌘','▦','✧'][index % 3]}</div><div><h3>${esc(service.name)}</h3><p>${esc(service.description)}</p></div><div class="service-action"><div class="service-price">${money(service.price)} <small>RLUSD</small></div><button class="button ${index === 0 ? 'primary' : ''} small" data-buy="${esc(service.id)}" ${busy ? 'disabled' : ''}>${service.price > state.balance.available || service.price > state.policy.perRequest ? 'Test limit' : 'Run purchase'} <span aria-hidden="true">↗</span></button>${service.price > state.balance.available || service.price > state.policy.perRequest ? '<div class="over">Exceeds current capacity or policy</div>' : ''}</div></article>`).join('')}</div><div class="panel-note"><span>◇</span> Autonomous within mandate · Simulated payment and delivery</div></section>`;
}
function mandatePanel() {
  return `<section class="panel"><div class="panel-header"><div><h2>Your spending guardrails</h2><p class="subtitle">Shared fixture policy units · both rails · UTC</p></div><a class="text-link" href="#mandates">Manage ↗</a></div><div class="mandate-summary">${[['daily','Daily mandate'],['weekly','Weekly mandate'],['monthly','Monthly mandate']].map(([key,name]) => { const used = state.usage[key] || 0, cap = state.policy[key]; return `<div class="progress-item"><div class="progress-meta"><span>${name}</span><b>${money(used)} <small>/ ${money(cap)}</small></b></div><progress class="progress-track" aria-label="${name} usage" max="${cap || 1}" value="${Math.min(used,cap)}"></progress></div>`; }).join('')}<div class="mini-rule"><span>Per-request limit</span><strong>${money(state.policy.perRequest)} policy units</strong></div><div class="mini-rule"><span>AP4M channel cap · fixture</span><strong>${money(state.balance.funded)} RLUSD</strong></div></div><div class="review-box"><span class="review-icon">◇</span><div><strong>${state.reviews.length ? `${state.reviews.length} request${state.reviews.length === 1 ? '' : 's'} awaiting treasury review` : 'Human control when it matters'}</strong><p>Over-limit requests stay blocked. Ledger approval is unavailable; no bypass or automatic top-up.</p></div></div></section>`;
}
function date(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? 'This session' : d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}) + ' UTC'; }
function orderTable(limit) {
  const orders = [...state.orders].sort((a,b) => new Date(b.created || b.createdAt) - new Date(a.created || a.createdAt)).slice(0,limit || state.orders.length);
  return orders.length ? `<div class="table-wrap"><table><thead><tr><th>RESOURCE / ORDER</th><th>AMOUNT</th><th>STATUS</th><th>CREATED</th><th><span class="sr-only">Details</span></th></tr></thead><tbody>${orders.map(order => `<tr><td><strong>${esc(order.serviceName || order.serviceId)}</strong><small>${esc(order.id)}</small></td><td><strong>${money(order.amount)}</strong><small>${order.rail === 'card_simulation' || order.service === 'card_cloud' || order.serviceId === 'card_cloud' ? 'USD · simulated card quote' : 'RLUSD · fixture'}</small></td><td>${order.status === 'blocked' ? pill('BLOCKED','amber') : order.status === 'settled_fixture' ? pill('SETTLED · FIXTURE','green') : pill(String(order.status).replaceAll('_',' ').toUpperCase(),'gray')}</td><td>${esc(date(order.created || order.createdAt))}</td><td><button class="button small ghost" data-receipt="${esc(order.id)}">View ↗</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><div class="empty-symbol">↗</div>Your next move starts here.<p>Run a fixture purchase to see policy checks, delivery<br>and separate redemption and payout events.</p></div>`;
}
function overview() { return heading('AGENT TREASURY','Business moves. You stay in control.','Funded payments for autonomous work, with boundaries you define.',`<a href="#cards" class="button primary">Try RLUSD → USD → GPU cycle ↗</a>`) + `<div class="bottom-strip cycle-banner"><div class="strip-symbol">⇄</div><div><strong>One simulated cycle. RLUSD funding → USD prefunded card → GPU rental.</strong><p>Provider stand-in and conversion are fixtures. Source funding counts once; downstream card spend does not debit the owner budget twice.</p></div><a href="#cards" class="button primary">Run the cycle ↗</a></div><div class="section-kicker">AP4M-ONLY DIAGNOSTIC BALANCES · FIXTURE</div>` + stats() + `<div class="dashboard-grid">${servicePanel()}${mandatePanel()}</div><section class="panel full-width"><div class="panel-header"><div><h2>Recent activity</h2><p class="subtitle">Every decision, every obligation, in one place.</p></div><a class="text-link" href="#activity">View all ↗</a></div>${orderTable(4)}</section><div class="bottom-strip"><div class="strip-symbol">⊞</div><div><strong>Built for the path from agent intent to accountable payment.</strong><p>Local controls implemented. Sponsor settlement and hardware treasury approval await activation.</p></div><a href="#integrations" class="text-link">Integration readiness ↗</a></div>`; }
function activity() { return heading('AUDIT TRAIL','Every decision has a receipt.','Delivery, redemption and payout are separate events. All payment evidence below is simulated.') + `<section class="panel"><div class="panel-header"><h2>Payment activity</h2>${pill(`${state.orders.length} ORDERS`)}</div>${orderTable()}</section><section class="panel full-width"><div class="panel-header"><div><h2>Treasury review queue</h2><p class="subtitle">A review item is not approval, a signature or additional capacity.</p></div>${pill('HUMAN REQUIRED','amber')}</div><div class="review-list">${state.reviews.length ? [...state.reviews].sort((a,b) => new Date(b.created) - new Date(a.created)).map(r => `<article class="review-item"><h3>Request ${esc(r.orderId)}</h3><p>${esc(r.reason || 'Spending limit exceeded')}<br>Awaiting a supported treasury operation and confirmation. The request remains blocked.</p>${pill('PENDING · LEDGER UNAVAILABLE','amber')}</article>`).join('') : '<div class="empty-state">No requests need treasury review.</div>'}</div></section>`; }
function mandates() { return heading('DETERMINISTIC POLICY','Give autonomy a boundary.','These controls edit local fixture policy only. They do not fund a channel or authorize a treasury transaction.') + `<div class="dashboard-grid"><section class="panel"><div class="panel-header"><div><h2>Spending mandates</h2><p class="subtitle">All configured limits are enforced together.</p></div>${pill('IMPLEMENTED LOCALLY','green')}</div><form id="policy-form" class="form-body"><div class="form-grid">${[['daily','Business daily','Resets at 00:00 UTC.'],['weekly','Business weekly','Monday 00:00 UTC; not a rolling seven days.'],['monthly','Business monthly','First day of each calendar month, UTC.'],['perRequest','Per-request maximum','Each purchase must fit this amount.'],['agentDaily','Agent daily','Separate daily limit for this agent.']].map(([key,label,help]) => `<label>${label} (fixture policy units)<input name="${key}" type="number" min="0.01" max="100000" step="0.01" value="${(state.policy[key]/100).toFixed(2)}" required><small>${help}</small></label>`).join('')}</div><div class="policy-warning">Existing obligations survive reset boundaries. Changing a mandate does not raise the funded channel cap, release outstanding obligations or retry blocked purchases.</div><button class="button primary" type="submit" ${busy ? 'disabled' : ''}>Save fixture mandates</button></form></section><div>${mandatePanel()}<div class="bottom-strip"><div><strong>Fixed payment scope</strong><p>The two-leg cycle accounts for RLUSD source funding once; downstream USD card spending is not charged again to the owner budget. Conversion is a fixture only. Merchant/category controls remain in force; no live bridge, real card or loan.</p></div></div></div></div>`; }
function credit() { return heading('OPTIONAL RESEARCH SANDBOX','A quote, not a loan.','Simulated underwriting with deterministic reason codes. No funds are borrowed or originated.') + `<div class="credit-grid">${[['healthy','A workable engagement','A fixture business with sufficient cash-flow evidence. Explore an indicative repayment calculation.','Calculate fixture quote'],['review','A reason to pause','A fixture with incomplete or insufficient evidence. The policy escalates instead of inventing an approval.','Run review scenario']].map(([scenario,title,description,button]) => `<section class="panel credit-card">${pill('SIMULATED UNDERWRITING')}<h2>${title}</h2><p>${description}</p><button class="button ${scenario === 'healthy' ? 'primary' : ''}" data-credit="${scenario}" ${busy ? 'disabled' : ''}>${button} ↗</button><div id="credit-${scenario}">${creditResults[scenario] || ''}</div></section>`).join('')}</div><div class="bottom-strip"><div class="strip-symbol">⌁</div><div><strong>The future lifecycle — planned, not implemented</strong><p>Quote with margin → borrow RLUSD → fund AP4M → rent compute → deliver → earn → repay.<br>Lender allocation and yield are conceptual and outside this payment demo. AP4M spends funded capacity; it is not a credit card.</p></div></div>`; }
function cycleSummary() {
  const a = state.cycleAccounting || {};
  return `<div class="stats cycle-stats">${[['RLUSD source funding',a.rlusdFunding,'Counts toward owner budget once','RLUSD'],['USD card prefunded',a.usdFunded,'Fixture conversion · not credit','USD'],['GPU vendor charged',a.usdSpent,'Downstream spend, not a second budget debit','USD'],['USD card remaining',a.usdAvailable,'Separate from earnings or borrowed funds','USD']].map(([label,value,foot,currency]) => `<section class="stat"><div class="stat-label">${label}</div><div class="stat-value">${money(value)}<small>${currency}</small></div><div class="stat-foot">${foot}</div></section>`).join('')}</div>`;
}
function cycleHistory() {
  const cycles = [...(state.cycles || [])].sort((a,b) => new Date(b.created || b.createdAt || 0) - new Date(a.created || a.createdAt || 0));
  return `<section class="panel full-width"><div class="panel-header"><div><h2>Two-leg cycle receipts</h2><p class="subtitle">Funding, card debit and remaining USD are tracked separately.</p></div>${pill('FIXTURE EVIDENCE')}</div>${cycles.length ? `<div class="table-wrap"><table><thead><tr><th>CYCLE</th><th>RLUSD SOURCE</th><th>USD FUNDED / SPENT</th><th>OUTCOME</th><th>RECEIPT</th></tr></thead><tbody>${cycles.map(c => `<tr><td><strong>GPU rental cycle</strong><small>${esc(c.id)}</small></td><td>${money(c.rlusdFunding)} RLUSD</td><td>${money(c.usdFunded)} / ${money(c.usdSpent)} USD</td><td>${pill(String(c.status || 'pending').replaceAll('_',' ').toUpperCase(), /fail|declin|block|pending/.test(c.status) ? 'amber' : '')}</td><td><button class="button small" data-cycle-receipt="${esc(c.id)}">View ↗</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">No simulated funding cycles yet.<p>Run the full cycle above, or test either failure boundary.</p></div>'}</section>`;
}
function cards() {
  const quotedUsd = cycleScenario === 'high_spend' ? 2500 : 400;
  return heading('ONE CYCLE · TWO PAYMENT LEGS','Fund in RLUSD. Simulate a USD GPU purchase.','RLUSD → approved-provider stand-in → USD prefunded virtual-card fixture → fictional NVIDIA GPU merchant.') + cycleSummary() + `<div class="dashboard-grid"><section class="panel"><div class="panel-header"><div><h2>One controlled GPU rental cycle</h2><p class="subtitle">Fictional GPU Cloud · NVIDIA GPU compute workload</p></div>${pill('ALL EXTERNAL STEPS SIMULATED')}</div><div class="form-body"><div class="card-request"><div class="eyebrow">ILLUSTRATIVE CYCLE QUOTE</div><div class="receipt-price">${money(quotedUsd + 50)} <small>RLUSD source funding</small></div><p class="subtitle">0.50 RLUSD fixture fee + ${money(quotedUsd)} RLUSD conversion allocation → ${money(quotedUsd)} USD card prefunding → ${money(quotedUsd)} USD fictional GPU charge.<br>Fixture rate: 1.00 USD per RLUSD. Not a real conversion quote.</p></div><label for="cycle-scenario">Simulation outcome<select id="cycle-scenario" ${busy ? 'disabled' : ''}><option value="success" ${cycleScenario === 'success' ? 'selected' : ''}>Both legs complete · fixture</option><option value="funding_failed" ${cycleScenario === 'funding_failed' ? 'selected' : ''}>Provider funding fails · fixture</option><option value="gpu_failed" ${cycleScenario === 'gpu_failed' ? 'selected' : ''}>GPU vendor declines · fixture</option><option value="high_spend" ${cycleScenario === 'high_spend' ? 'selected' : ''}>Large request → human review · fixture</option></select></label><div class="policy-warning">Source funding consumes the owner budget once; the downstream USD card debit is not counted again. Merchant/category rules still apply. Out-of-policy or large requests require human review and remain blocked without authorization.</div><button class="button primary" data-cycle ${busy ? 'disabled' : ''}>Run two-leg simulation ↗</button></div><div class="panel-note">No live wallet transfer, conversion, card, issuer API, merchant charge or GPU provisioning.</div></section><section class="panel"><div class="panel-header"><h2>What each leg represents</h2></div><div class="form-body"><ul class="timeline"><li><strong>1 · RLUSD funding to approved-provider stand-in</strong>AP4M is used only as a modeled funding stand-in in this fixture story—not proof of provider support, endorsement or RLUSD acceptance.</li><li><strong>2 · Fixture conversion and USD card prefunding</strong>Assumed fixture rate and fee are explicit. This is a prefunded virtual-card model, not credit or a loan.</li><li><strong>3 · Fictional GPU vendor card charge</strong>USD is debited from the prefunded card fixture. NVIDIA describes the workload; no NVIDIA merchant integration or endorsement exists.</li></ul><div class="policy-warning"><strong>MARQETA · NOT CONNECTED</strong><br>Signup returned HTTP 403. Marqeta RLUSD acceptance is not verified. Card acceptance depends on network, program and vendor rules—not every vendor accepts every card.</div></div></section></div>${cycleHistory()}<div class="bottom-strip"><div class="strip-symbol">◇</div><div><strong>Funding transfers, expenses and income are different.</strong><p>Service income: ${money(state.cycleAccounting?.serviceIncome || 0)} USD · Borrowed principal: ${money(state.cycleAccounting?.borrowedPrincipal || 0)} RLUSD. Neither is created by this cycle. Card-funding principal remains a restricted asset until spent; only the explicit funding fee and a completed GPU charge are expenses. Source mandate usage is a policy measure, not an expense total.<br>The full funding route is a simulation, not an automatic live bridge. AP4M-only purchases remain available as separate diagnostic tests.</p></div><a href="#overview" class="text-link">AP4M diagnostics ↗</a></div>`;
}
function showCycleReceipt(cycle) {
  $('#receipt-content').innerHTML = `<h2 id="receipt-title">GPU rental · two-leg cycle</h2><div class="receipt-price">${money(cycle.rlusdFunding)} <small>RLUSD funding · fixture</small></div>${pill(String(cycle.status || 'pending').replaceAll('_',' ').toUpperCase())}<div class="receipt-meta">Cycle ${esc(cycle.id)}<br>All external events are fixtures. No real transfer, card issuance or GPU rental.</div><ul class="timeline"><li><strong>RLUSD funding to provider stand-in</strong>${money(cycle.rlusdFunding)} RLUSD recorded source funding. Fee: ${money(cycle.feeRlusd)} RLUSD.<br>Owner-budget accounting occurs at this source leg only.</li><li><strong>Fixture conversion → prefunded USD card</strong>${money(cycle.usdFunded)} USD funded.<br>${esc(cycle.rate || '1.00 USD per RLUSD — FIXTURE')}<br>Marqeta RLUSD acceptance is not verified.</li><li><strong>Fictional GPU merchant card charge</strong>${money(cycle.usdSpent)} USD spent. Card balance remaining: ${money(Math.max(0,(cycle.usdFunded || 0)-(cycle.usdSpent || 0)))} USD.<br>Not a second owner-budget charge.</li></ul>${cycle.reason ? `<div class="policy-warning">${esc(cycle.reason)}</div>` : ''}<ul class="timeline">${(cycle.evidence || []).map(e => `<li><strong>${esc(e.stage)}</strong>${esc(e.status)}</li>`).join('')}</ul><p class="subtitle">Prefunded does not mean credit. No loan or service revenue originates from this flow; no vendor-acceptance guarantee.</p>`;
  if (!$('#receipt-dialog').open) $('#receipt-dialog').showModal();
}
function integrations() { return heading('HONEST BY DESIGN','Know what is live. And what is not.','Missing verified configuration disables transaction paths. No private keys, seed phrases or fabricated evidence.') + `<div class="integration-grid">${(state.capabilities || []).map((c,index) => `<section class="panel integration-card"><div class="integration-icon">${['◇','⇄','⌘','⌁','⊞'][index%5]}</div><h2>${esc(c.name)}</h2><p>${esc(c.detail)}</p>${pill(String(c.status).toUpperCase().replaceAll('_',' '), /implemented/i.test(c.status) ? 'green' : /unavailable|pending|blocked/i.test(c.status) ? 'amber' : '')}</section>`).join('')}</div><section class="panel full-width"><div class="panel-header"><h2>AP4M preparation · public SDK mapped</h2></div><div class="form-body"><p class="subtitle">Public chain, contract, token and exact SDK request schemas are mapped. Known NEXXEN agent and portal-reported 20 RLUSD are recorded; no chain funding receipt is verified. Selected merchant ID and payout remain pending. Channel-request, voucher and redemption-call preparation helpers exist but signing/broadcast are disabled. A personalized starter is not required. Confirm current funded channel capacity; a narrowly scoped operational signer; supported Ledger Flex treasury transport; and independent redemption and settlement receipt checks. No automatic bridge or fallback treasury hot key.</p></div></section>`; }
function render() {
  if (!state) return;
  const view = currentView();
  $('#breadcrumb-view').textContent = labels[view];
  document.title = `NEXXEN — ${labels[view]}`;
  document.querySelectorAll('[data-view]').forEach(link => { link.classList.toggle('active',link.dataset.view === view); if (link.dataset.view === view) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); });
  $('#activity-count').textContent = state.orders.length;
  $('#view-content').innerHTML = ({overview,activity,mandates,credit,cards,integrations})[view]();
}
async function refresh() { state = await api('/api/state'); render(); }
function showReceipt(order) {
  const blocked = order.status === 'blocked';
  const isCard = order.rail === 'card_simulation' || order.service === 'card_cloud' || order.serviceId === 'card_cloud';
  $('#receipt-content').innerHTML = `<h2 id="receipt-title">${esc(order.serviceName || order.serviceId || 'Purchase detail')}</h2><div class="receipt-price">${money(order.amount)} <small>${isCard ? 'USD · simulated card quote' : 'RLUSD · fixture'}</small></div>${pill(blocked ? 'BLOCKED BEFORE PAYMENT' : isCard ? 'CARD-NETWORK SIMULATION' : 'SIMULATED PAYMENT',blocked ? 'amber' : '')}<div class="receipt-meta">Order ${esc(order.id)}<br>${esc(date(order.created || order.createdAt))}<br>${isCard ? 'No card issued, network authorization, merchant purchase or funding conversion.' : 'No real funds moved. No transaction hash exists.'}</div>${blocked ? `<p class="subtitle">${esc(order.reason || 'Policy or funded capacity exceeded.')}<br>Treasury review is pending. Hardware approval is unavailable; the request remains blocked.</p>` : ''}<ul class="timeline">${(order.evidence || []).map(e => `<li><strong>${esc(String(e.stage || e.name || 'Event').replaceAll('_',' '))}</strong>${esc(e.status || e.detail || 'Fixture evidence')}</li>`).join('')}</ul><p class="subtitle">Resource delivery does not prove settlement. Redemption does not establish available seller cash.</p>`;
  if (!$('#receipt-dialog').open) $('#receipt-dialog').showModal();
}
document.addEventListener('click',async event => {
  const receipt = event.target.closest('[data-receipt]');
  if (receipt) { const order = state.orders.find(o => o.id === receipt.dataset.receipt); if (order) showReceipt(order); }
  const buy = event.target.closest('[data-buy]');
  if (buy && !busy) {
    const serviceId = buy.dataset.buy;
    if (!pendingKeys.has(serviceId)) { pendingKeys.set(serviceId,crypto.randomUUID()); persistPendingKeys(); }
    busy = true; render();
    try {
      const result = await api('/api/orders',{method:'POST',body:JSON.stringify({serviceId,idempotencyKey:pendingKeys.get(serviceId)})});
      await refresh();
      pendingKeys.delete(serviceId);
      persistPendingKeys();
      showReceipt(result.order || result);
      toast((result.order || result).status === 'blocked' ? 'Blocked before signing. Treasury review is pending.' : 'Fixture purchase recorded. No real funds moved.');
    } catch (error) { toast(`${error.message} Retry uses the same request key to prevent a duplicate purchase.`); }
    finally { busy = false; render(); }
  }
  const cycleReceipt = event.target.closest('[data-cycle-receipt]');
  if (cycleReceipt) { const cycle = (state.cycles || []).find(c => c.id === cycleReceipt.dataset.cycleReceipt); if (cycle) showCycleReceipt(cycle); }
  const cycleButton = event.target.closest('[data-cycle]');
  if (cycleButton && !busy) {
    const scenario = $('#cycle-scenario')?.value || cycleScenario;
    cycleScenario = scenario;
    const keyName = `cycle-${scenario}`;
    if (!pendingKeys.has(keyName)) { pendingKeys.set(keyName,crypto.randomUUID()); persistPendingKeys(); }
    busy = true; render();
    try {
      const result = await api('/api/card-cycles',{method:'POST',body:JSON.stringify({scenario,idempotencyKey:pendingKeys.get(keyName)})});
      await refresh();
      pendingKeys.delete(keyName); persistPendingKeys();
      showCycleReceipt(result.cycle || result);
      toast('Two-leg fixture outcome recorded. No real funding, card charge or GPU rental.');
    } catch (error) { toast(`${error.message} Retry this scenario uses the same request key for reconciliation.`); }
    finally { busy = false; render(); }
  }
  const creditButton = event.target.closest('[data-credit]');
  if (creditButton && !busy) {
    busy = true; render();
    const scenario = creditButton.dataset.credit;
    try {
      const quote = await api('/api/credit-quotes',{method:'POST',body:JSON.stringify({scenario})});
      creditResults[scenario] = `<div class="credit-result"><strong>${esc(String(quote.outcome).replaceAll('_',' '))}</strong>${quote.fee != null ? `<p>Fixture principal: ${money(quote.principal)} RLUSD<br>Fixture fee: ${money(quote.fee)} RLUSD<br>Illustrative repayment: ${money(quote.repayment)} RLUSD</p>` : '<p>No quote or loan approved.</p>'}<p>Reason codes: ${esc((quote.reasonCodes || []).join(', '))}<br>Policy: ${esc(quote.policyVersion)}</p><small>${esc(quote.disclaimer || 'Simulated underwriting; no loan originated.')}</small></div>`;
    } catch(error) { toast(error.message); }
    finally { busy = false; render(); }
  }
});
document.addEventListener('change',event => { if (event.target.id === 'cycle-scenario') { cycleScenario = event.target.value; render(); $('#cycle-scenario')?.focus(); } });
document.addEventListener('submit',async event => {
  if (event.target.id !== 'policy-form') return;
  event.preventDefault(); if (busy) return;
  const values = Object.fromEntries([...new FormData(event.target)].map(([key,value]) => [key,Math.round(Number(value)*100)]));
  busy = true; render();
  try { await api('/api/policy',{method:'POST',body:JSON.stringify(values)}); await refresh(); toast('Fixture mandates saved. Funded channel capacity is unchanged.'); }
  catch(error) { toast(error.message); }
  finally { busy = false; render(); }
});
$('#close-dialog').addEventListener('click',() => $('#receipt-dialog').close());
$('#receipt-dialog').addEventListener('click',event => { if (event.target === $('#receipt-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
$('#refresh').addEventListener('click',async () => { if (busy) return; $('#refresh').disabled = true; try { await refresh(); toast('Workspace refreshed.'); } catch(error) { toast(error.message); } finally { $('#refresh').disabled = false; } });
window.addEventListener('hashchange',() => { $('#receipt-dialog').close(); render(); });
refresh().catch(error => { $('#view-content').innerHTML = `<div class="error-panel"><h2>Workspace unavailable</h2><p>${esc(error.message)}</p><p>Check the local server, then use the refresh button above.</p></div>`; });
