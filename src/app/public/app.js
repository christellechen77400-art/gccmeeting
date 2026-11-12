// Interface GCC Meeting (sans framework). Écrans : #/nouveau, #/cr/<id> ; les autres arrivent aux étapes suivantes.

const AUDIO = ['.m4a', '.mp3', '.wav', '.webm', '.mp4', '.ogg'];
const ACCEPT = [...AUDIO, '.pdf', '.docx', '.txt', '.md'];
const GROQ_LIMIT = 25 * 1024 * 1024; // au-delà, le serveur compresse l'audio avant la transcription
const POLL_MS = 1500;

const ICONS = {
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
};
const icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24">${ICONS[name]}</svg>`;
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
const frDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const ext = (name) => (name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
const size = (n) => `${n < 10e6 ? (n / 1e6).toFixed(1).replace('.', ',') : Math.round(n / 1e6)} Mo`;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const minutes = (s) => (s < 60 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);

let config = { categories: [], groupes: {}, annuaire: [] };

// Formulaire en cours : gardé si on change d'écran puis qu'on revient.
const draft = {
  tab: 'fichier', file: null, duration: null, notes: '', recording: null,
  categorie: null, groupe: '', date: today(), titre: '', people: [], absents: new Set(), adding: false,
  job: null, // { phase: 'envoi', pct } puis { id, meta } ; { error } en cas d'échec
};
let recorder = null; // { media, chunks, started, timer }

function catColor(name) {
  return config.categories.find((c) => c.nom === name)?.couleur ?? '#2d5a65';
}
function setCat(name) {
  document.documentElement.style.setProperty('--cat', catColor(name));
}

async function api(path, options) {
  const res = await fetch(path, { ...options, headers: { 'X-GCC-Meeting': '1', ...options?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.erreur || `Erreur ${res.status}`);
  return body;
}

// ---------- navigation ----------

const SOON = {
  'comptes-rendus': ['Comptes-rendus', 'L\'historique, la recherche et les filtres arrivent à l\'étape 4.'],
  annuaire: ['Annuaire et groupes', 'La modification des groupes et de l\'annuaire arrive à l\'étape 4.'],
  regles: ['Règles apprises', 'Les règles arrivent à l\'étape 5.'],
};

function route() {
  const [screen, id] = location.hash.replace(/^#\/?/, '').split('/');
  const name = screen || 'nouveau';
  for (const a of document.querySelectorAll('.links a')) {
    a.classList.toggle('on', a.dataset.screen === (name === 'cr' ? 'comptes-rendus' : name));
  }
  if (name === 'cr' && id) return showCompteRendu(id);
  if (SOON[name]) {
    setCat(null);
    $('#screen').innerHTML = `<header><h1>${SOON[name][0]}</h1><p class="lead soon">${SOON[name][1]}</p></header>`;
    return;
  }
  showNouveau();
}

// ---------- écran 1 : nouveau compte-rendu ----------

function showNouveau() {
  setCat(draft.categorie);
  $('#screen').innerHTML = `
    <header><h1>Nouveau compte-rendu</h1><p class="lead">Dépose un enregistrement ou tes notes : le compte-rendu se rédige tout seul.</p></header>
    <div class="cols"><section class="panel main" id="source"></section><section class="panel side" id="meeting"></section></div>`;
  renderSource();
  renderMeeting();
}

// La source choisie est-elle un audio (donc à transcrire) ? Sans fichier encore choisi, on compte sur un audio.
function audioSource() {
  if (draft.tab === 'enregistrer') return true;
  if (draft.tab === 'notes') return false;
  return !draft.file || AUDIO.includes(ext(draft.file.name));
}

function hasSource() {
  if (draft.tab === 'fichier') return Boolean(draft.file);
  if (draft.tab === 'notes') return Boolean(draft.notes.trim());
  return Boolean(draft.recording);
}

function fileItem({ name, details, audioUrl, remove }) {
  const audio = AUDIO.includes(ext(name));
  return `<div class="item"><span class="ic">${icon(audio ? 'music' : 'doc')}</span>
    <span class="txt"><b>${esc(name)}</b><span>${esc(details)}</span></span>
    ${audioUrl ? `<audio controls src="${audioUrl}"></audio>` : ''}
    <button class="x" data-remove="${remove}" aria-label="Retirer">${icon('x')}</button></div>`;
}

function fileDetails(file, duration) {
  const parts = [];
  if (duration && Number.isFinite(duration)) parts.push(minutes(duration));
  parts.push(size(file.size));
  if (AUDIO.includes(ext(file.name)) && file.size > GROQ_LIMIT) parts.push('sera compressé avant l\'envoi');
  return parts.join(' · ');
}

function renderSource() {
  const el = $('#source');
  if (!el) return;
  const busy = Boolean(draft.job && !draft.job.error);
  const tab = (id, label) => `<button role="tab" data-tab="${id}" aria-selected="${draft.tab === id}" ${busy ? 'disabled' : ''}>${label}</button>`;
  let body = '';
  if (draft.tab === 'fichier') {
    body = `<label class="drop" id="drop"><span class="bubble">${icon('upload')}</span>
        <b>Glisse ton fichier ici, ou clique pour le choisir</b>
        <span class="hint">Audio (m4a, mp3, wav…) · PDF · Word (.docx) · texte</span>
        <input id="file" type="file" accept="${ACCEPT.join(',')}" ${busy ? 'disabled' : ''}></label>`
      + (draft.file ? fileItem({ name: draft.file.name, details: fileDetails(draft.file, draft.duration), remove: 'file' }) : '');
  } else if (draft.tab === 'notes') {
    body = `<textarea id="notes" placeholder="Colle ici tes notes de réunion…" ${busy ? 'disabled' : ''}>${esc(draft.notes)}</textarea>`;
  } else if (recorder) {
    body = `<div class="rec"><button class="recbtn stop" id="recstop" aria-label="Arrêter l'enregistrement">${icon('stop')}</button>
        <span class="timer" id="timer">${clock((Date.now() - recorder.started) / 1000)}</span>
        <span class="live"><i></i>Enregistrement en cours</span>
        <span class="hint">Garde cette page ouverte jusqu'à la fin de la réunion.</span></div>`;
  } else if (draft.recording) {
    body = fileItem({ name: draft.recording.name, details: `${clock(draft.recording.seconds)} · ${size(draft.recording.blob.size)}`, audioUrl: draft.recording.url, remove: 'recording' });
  } else {
    body = `<div class="rec"><button class="recbtn" id="recstart" aria-label="Commencer l'enregistrement">${icon('mic')}</button>
        <b>Enregistrer la réunion avec le micro</b>
        <span class="hint">Le navigateur demandera l'autorisation d'utiliser le micro.</span></div>`;
  }
  el.innerHTML = `<div class="tabs" role="tablist" aria-label="Source">${tab('fichier', 'Fichier')}${tab('notes', 'Coller des notes')}${tab('enregistrer', 'Enregistrer')}</div>
    ${body}
    <p class="hint">Astuce : commence ${draft.tab === 'notes' ? 'tes notes' : 'l\'enregistrement'} par « Absents : … » pour les retirer automatiquement.</p>`;

  for (const b of el.querySelectorAll('[data-tab]')) b.onclick = () => { draft.tab = b.dataset.tab; renderSource(); renderMeeting(); };
  for (const b of el.querySelectorAll('[data-remove]')) b.onclick = () => removeSource(b.dataset.remove);
  const input = $('#file', el);
  if (input) input.onchange = () => input.files[0] && pickFile(input.files[0]);
  const drop = $('#drop', el);
  if (drop && !busy) {
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]); };
  }
  const notes = $('#notes', el);
  if (notes) notes.oninput = () => { draft.notes = notes.value; renderButton(); };
  if ($('#recstart', el)) $('#recstart', el).onclick = startRecording;
  if ($('#recstop', el)) $('#recstop', el).onclick = stopRecording;
}

function pickFile(file) {
  if (!ACCEPT.includes(ext(file.name))) {
    alertBox(`Format non pris en charge : « ${ext(file.name) || 'sans extension'} ». Audio, PDF, Word (.docx) ou texte.`);
    return;
  }
  draft.file = file;
  draft.duration = null;
  draft.job = null;
  if (AUDIO.includes(ext(file.name))) {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => { draft.duration = audio.duration; URL.revokeObjectURL(audio.src); renderSource(); };
    audio.src = URL.createObjectURL(file);
  }
  renderSource();
  renderMeeting();
}

function removeSource(which) {
  if (which === 'file') draft.file = null;
  if (which === 'recording') { URL.revokeObjectURL(draft.recording.url); draft.recording = null; }
  renderSource();
  renderMeeting();
}

async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    alertBox('Micro refusé ou introuvable : autorise le micro pour localhost dans le navigateur, puis réessaie.');
    return;
  }
  // Chrome enregistre en webm, Safari en mp4 : deux formats que la transcription accepte.
  const type = ['audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const media = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  recorder = { media, chunks: [], started: Date.now(), timer: null };
  media.ondataavailable = (e) => e.data.size && recorder.chunks.push(e.data);
  media.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(recorder.chunks, { type: media.mimeType });
    const seconds = (Date.now() - recorder.started) / 1000;
    const name = `Enregistrement ${new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).replace(/[/:]/g, '-')}${media.mimeType.includes('mp4') ? '.mp4' : '.webm'}`;
    clearInterval(recorder.timer);
    recorder = null;
    draft.recording = { blob, name, seconds, url: URL.createObjectURL(blob) };
    renderSource();
    renderMeeting();
  };
  media.start(10000); // un morceau toutes les 10 s : rien de perdu si l'enregistrement est long
  recorder.timer = setInterval(() => { const t = $('#timer'); if (t) t.textContent = clock((Date.now() - recorder.started) / 1000); }, 500);
  renderSource();
}

function stopRecording() {
  recorder?.media.stop();
}

function alertBox(message) {
  draft.job = { error: message };
  renderMeeting();
}

function renderMeeting() {
  const el = $('#meeting');
  if (!el) return;
  const busy = Boolean(draft.job && !draft.job.error);
  const dis = busy ? 'disabled' : '';
  const absents = draft.people.filter((p) => draft.absents.has(p));
  const directory = config.annuaire.filter((n) => !draft.people.includes(n));
  el.innerHTML = `<h2>La réunion</h2>
    <div class="field" role="group" aria-label="Catégorie"><span>Catégorie</span><div class="chips">
      ${config.categories.map((c) => `<button class="cat${c.nom === draft.categorie ? ' on' : ''}" data-cat="${esc(c.nom)}" ${dis}
        style="${c.nom === draft.categorie ? `background:${c.couleur}` : ''}"><i style="background:${c.couleur}"></i>${esc(c.nom)}</button>`).join('')}
    </div></div>
    <div class="two">
      <label class="field">Groupe<select id="groupe" ${dis}><option value="">Aucun groupe</option>
        ${Object.keys(config.groupes).map((g) => `<option${g === draft.groupe ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <label class="field">Date<input id="date" type="date" value="${esc(draft.date)}" ${dis}></label>
    </div>
    <label class="field">Titre (facultatif)<input id="titre" value="${esc(draft.titre)}" placeholder="Sinon, l'IA le propose" ${dis}></label>
    <div class="field"><span>Participants${draft.people.length ? ` · ${draft.people.length - absents.length} présent${draft.people.length - absents.length > 1 ? 's' : ''}, ${absents.length} absent${absents.length > 1 ? 's' : ''}` : ''}</span>
      <div class="people">
        ${draft.people.map((p) => `<button class="person${draft.absents.has(p) ? ' abs' : ''}" data-person="${esc(p)}" aria-pressed="${draft.absents.has(p)}" ${dis}>${esc(p)}</button>`).join('')}
        ${draft.adding ? '' : `<button class="add" id="add" ${dis}>+ Ajouter</button>`}
      </div>
      ${draft.adding ? `<div class="addbox"><input id="addname" list="annuaire" placeholder="Nom (annuaire)" autocomplete="off">
        <datalist id="annuaire">${directory.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <button class="add" id="addok">Ajouter</button></div>` : ''}
      <span class="small">${draft.people.length ? 'Touche un nom pour le passer en absent. Le groupe lui-même ne change pas.' : 'Choisis un groupe ou ajoute des personnes.'}</span>
    </div>
    <button class="primary" id="create" disabled>Créer le compte-rendu</button>
    <div id="progress"></div>`;

  for (const b of el.querySelectorAll('[data-cat]')) b.onclick = () => { draft.categorie = b.dataset.cat; setCat(draft.categorie); renderMeeting(); };
  $('#groupe', el).onchange = (e) => {
    draft.groupe = e.target.value;
    draft.people = [...(config.groupes[draft.groupe] ?? [])];
    draft.absents.clear();
    renderMeeting();
  };
  $('#date', el).onchange = (e) => { draft.date = e.target.value; renderButton(); };
  $('#titre', el).oninput = (e) => { draft.titre = e.target.value; };
  for (const b of el.querySelectorAll('[data-person]')) {
    b.onclick = () => {
      const p = b.dataset.person;
      if (draft.absents.has(p)) draft.absents.delete(p); else draft.absents.add(p);
      renderMeeting();
    };
  }
  if ($('#add', el)) $('#add', el).onclick = () => { draft.adding = true; renderMeeting(); $('#addname').focus(); };
  if (draft.adding) {
    const add = () => {
      const name = $('#addname').value.trim();
      if (name && !draft.people.includes(name)) draft.people.push(name);
      draft.adding = false;
      renderMeeting();
    };
    $('#addok', el).onclick = add;
    $('#addname', el).onkeydown = (e) => {
      if (e.key === 'Enter') add();
      if (e.key === 'Escape') { draft.adding = false; renderMeeting(); }
    };
  }
  $('#create', el).onclick = create;
  renderButton();
  renderProgress();
}

function renderButton() {
  const button = $('#create');
  if (!button) return;
  const busy = Boolean(draft.job && !draft.job.error);
  button.disabled = busy || !hasSource() || !draft.categorie || !draft.date;
  button.title = !draft.categorie ? 'Choisis une catégorie' : !hasSource() ? 'Ajoute un fichier, des notes ou un enregistrement' : '';
}

const STEPS = [['envoi', 'Envoi'], ['transcription', 'Transcription'], ['redaction', 'Rédaction'], ['mise_en_page', 'Mise en page']];

function stepsHtml(job, audio) {
  const current = job.phase === 'envoi' ? 'envoi' : job.meta?.etape;
  const index = STEPS.findIndex(([id]) => id === current);
  return `<ul class="steps">${STEPS.map(([id, label], i) => {
    if (id === 'transcription' && !audio) return `<li class="skip"><span class="dot"></span>${label} (pas besoin)</li>`;
    const state = i < index ? 'done' : i === index ? 'now' : '';
    const bar = id === 'envoi' && state === 'now' ? `<span class="bar"><i style="width:${job.pct ?? 0}%"></i></span>` : '';
    return `<li class="${state}"><span class="dot">${state === 'done' ? icon('check') : ''}</span>${label}${bar}</li>`;
  }).join('')}</ul>`;
}

function renderProgress() {
  const el = $('#progress');
  if (!el) return;
  const job = draft.job;
  if (!job) {
    el.innerHTML = `<p class="small" style="text-align:center;margin:0">${audioSource()
      ? 'Transcription puis rédaction : environ 1 minute' : 'Rédaction : environ 30 secondes'}</p>`;
    return;
  }
  if (job.error) {
    el.innerHTML = `<div class="error">${esc(job.error)}</div>`;
    return;
  }
  el.innerHTML = stepsHtml(job, audioSource());
}

function create() {
  const form = new FormData();
  form.append('categorie', draft.categorie);
  form.append('groupe', draft.groupe);
  form.append('date', draft.date);
  form.append('titre', draft.titre.trim());
  form.append('presents', JSON.stringify(draft.people.filter((p) => !draft.absents.has(p))));
  form.append('absents', JSON.stringify(draft.people.filter((p) => draft.absents.has(p))));
  if (draft.tab === 'fichier') form.append('fichier', draft.file);
  else if (draft.tab === 'notes') form.append('notes', draft.notes);
  else { form.append('fichier', draft.recording.blob, draft.recording.name); form.append('source', 'enregistrement'); }

  // XMLHttpRequest plutôt que fetch : il donne l'avancement de l'envoi.
  draft.job = { phase: 'envoi', pct: 0 };
  renderSource();
  renderMeeting();
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/comptes-rendus');
  xhr.setRequestHeader('X-GCC-Meeting', '1'); // exigé par le serveur pour toute modification
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    draft.job.pct = Math.round((e.loaded / e.total) * 100);
    renderProgress();
  };
  xhr.onload = () => {
    let body = {};
    try { body = JSON.parse(xhr.responseText); } catch { /* réponse vide */ }
    if (xhr.status !== 201) return fail(body.erreur || `Erreur ${xhr.status}`);
    draft.job = { id: body.id, meta: body };
    renderProgress();
    follow(body.id);
  };
  xhr.onerror = () => fail('L\'interface ne répond pas : est-ce que `npm run app` tourne toujours ?');
  xhr.send(form);
}

function fail(message) {
  draft.job = { error: message };
  renderSource();
  renderMeeting();
}

// Suit la création jusqu'au compte-rendu prêt, puis ouvre son aperçu.
async function follow(id) {
  try {
    const meta = await api(`/api/comptes-rendus/${id}`);
    if (draft.job?.id !== id) return;
    draft.job.meta = meta;
    if (meta.etat === 'erreur') return fail(meta.erreur);
    if (meta.etat === 'pret') {
      resetDraft();
      // Ouvre l'aperçu, sauf si on est parti sur un autre écran entre-temps.
      if (['', '#', '#/', '#/nouveau'].includes(location.hash)) location.hash = `#/cr/${id}`;
      return;
    }
    renderProgress();
  } catch (err) {
    console.warn(err); // serveur momentanément injoignable : on réessaie
  }
  setTimeout(() => follow(id), POLL_MS);
}

function resetDraft() {
  if (draft.recording) URL.revokeObjectURL(draft.recording.url);
  Object.assign(draft, { file: null, duration: null, notes: '', recording: null, titre: '', job: null, adding: false });
  draft.absents.clear();
  draft.people = [...(config.groupes[draft.groupe] ?? [])];
}

// ---------- écran 2 : aperçu et corrections ----------

// État de l'écran ouvert : onglet du volet, corrections, demande en cours.
let view = null; // { id, meta, tab, corrections, pending, error, whatsapp }

async function showCompteRendu(id) {
  const screen = $('#screen');
  let meta;
  try {
    meta = await api(`/api/comptes-rendus/${id}`);
  } catch (err) {
    screen.innerHTML = `<a class="back" href="#/comptes-rendus">‹ Comptes-rendus</a><div class="error">${esc(err.message)}</div>`;
    return;
  }
  if (location.hash !== `#/cr/${id}`) return;
  setCat(meta.categorie);
  const line = [meta.categorie, meta.groupe, frDate(meta.date)].filter(Boolean).map(esc).join(' · ');
  const head = `<div><a class="back" href="#/comptes-rendus">‹ Comptes-rendus</a>
    <div class="svc"><i></i>${line}</div><h1 id="crtitle">${esc(meta.titre || 'Compte-rendu en préparation')}</h1></div>`;
  if (meta.etat === 'en_cours') {
    screen.innerHTML = `<div class="head">${head}</div><section class="panel" style="max-width:420px">${stepsHtml({ meta }, AUDIO.includes(ext(meta.source.fichier)))}</section>`;
    setTimeout(() => location.hash === `#/cr/${id}` && showCompteRendu(id), POLL_MS);
    return;
  }
  if (meta.etat === 'erreur') {
    screen.innerHTML = `<div class="head">${head}</div><div class="error">${esc(meta.erreur)}</div>`;
    return;
  }
  if (view?.id !== id) view = { id, tab: 'corriger', corrections: [], pending: null, error: null, whatsapp: null };
  view.meta = meta;
  screen.innerHTML = `<div class="head">${head}
      <div class="actions">
        <button class="secondary" id="whatsapp">Texte WhatsApp</button>
        <a class="secondary" id="png" download>PNG</a>
        <a class="primary" id="pdf" download>Télécharger le PDF</a>
      </div></div>
    <div id="wabox"></div>
    <div class="cols">
      <section class="preview" aria-label="Aperçu"><div id="overflow"></div><img id="crimg" alt="Aperçu du compte-rendu"></section>
      <section class="panel side drawer" aria-label="Corrections">
        <div class="tabs wide" role="tablist" aria-label="Volet">
          ${[['corriger', 'Corriger'], ['transcription', 'Transcription'], ['details', 'Détails']].map(([t, label]) =>
            `<button role="tab" data-drawer="${t}" aria-selected="${view.tab === t}">${label}</button>`).join('')}
        </div>
        <div id="drawer"></div>
      </section>
    </div>`;
  $('#whatsapp').onclick = whatsapp;
  for (const b of document.querySelectorAll('[data-drawer]')) b.onclick = () => { view.tab = b.dataset.drawer; showTab(); };
  renderResult();
  renderWhatsapp();
  try {
    view.corrections = await api(`/api/comptes-rendus/${id}/corrections`);
  } catch (err) {
    view.error = err.message;
  }
  showTab();
}

// Aperçu et liens de téléchargement, à jour après chaque correction.
function renderResult() {
  const { id, meta } = view;
  const file = (meta.titre || 'compte-rendu').replace(/[\\/:*?"<>|]/g, '-');
  const v = encodeURIComponent(meta.modifieLe ?? meta.creeLe);
  $('#crtitle').textContent = meta.titre;
  $('#png').href = `/api/comptes-rendus/${id}/cr.png?v=${v}`;
  $('#png').download = `${file}.png`;
  $('#pdf').href = `/api/comptes-rendus/${id}/cr.pdf?v=${v}`;
  $('#pdf').download = `${file}.pdf`;
  $('#crimg').src = `/api/comptes-rendus/${id}/cr.png?v=${v}`;
  $('#overflow').innerHTML = meta.overflow
    ? `<p class="hint warn">Le compte-rendu dépasse une page de ${meta.overflow} % : le PDF fait 2 pages. Demande de raccourcir dans « Corriger ».</p>` : '';
}

function showTab() {
  for (const b of document.querySelectorAll('[data-drawer]')) b.setAttribute('aria-selected', b.dataset.drawer === view.tab);
  if (view.tab === 'corriger') return renderChat();
  if (view.tab === 'transcription') return renderTranscription();
  return renderDetails();
}

function renderChat() {
  const el = $('#drawer');
  if (!el || view.tab !== 'corriger') return;
  const bubbles = [`<div class="msg bot">Le compte-rendu est prêt. Dis-moi ce qu'il faut changer.</div>`];
  view.corrections.forEach((c, i) => {
    bubbles.push(`<div class="msg mine">${esc(c.demande)}</div>`);
    let choice = '';
    if (!c.choix) {
      choice = `<span>Je retiens ça pour les prochains comptes-rendus ?</span>
        ${c.resume ? `<span class="small">Règle proposée · ${esc(c.resume)}</span>` : ''}
        <div class="choices"><button class="secondary sm" data-choix="ici" data-i="${i}">Seulement ici</button>
          <button class="primary sm" data-choix="regle" data-i="${i}">Retenir comme règle</button></div>`;
    }
    bubbles.push(`<div class="msg bot">${esc(c.reponse)}${choice}</div>`);
    if (c.choix === 'regle') bubbles.push(`<div class="msg rule"><b>Règle ajoutée</b> · ${esc(c.resumeRegle ?? c.resume ?? `Rédaction : ${c.demande}`)}</div>`);
    if (c.choix === 'ici') bubbles.push('<div class="msg note">Corrigé seulement ici.</div>');
  });
  if (view.pending) {
    bubbles.push(`<div class="msg mine">${esc(view.pending)}</div>`,
      '<div class="msg bot typing"><i></i><i></i><i></i><span>Correction en cours, environ 30 secondes…</span></div>');
  }
  if (view.error) bubbles.push(`<div class="error">${esc(view.error)}</div>`);
  el.innerHTML = `<div class="chat" id="chat">${bubbles.join('')}</div>
    <form class="ask" id="ask"><label for="msg" class="sr">Correction demandée</label>
      <input id="msg" placeholder="Demande une correction…" autocomplete="off" maxlength="2000" ${view.pending ? 'disabled' : ''}>
      <button aria-label="Envoyer" ${view.pending ? 'disabled' : ''}>${icon('up')}</button></form>`;
  const chat = $('#chat');
  chat.scrollTop = chat.scrollHeight;
  $('#ask').onsubmit = (e) => { e.preventDefault(); sendCorrection($('#msg').value.trim()); };
  for (const b of el.querySelectorAll('[data-choix]')) b.onclick = () => choose(Number(b.dataset.i), b.dataset.choix);
  if (!view.pending) $('#msg').focus({ preventScroll: true });
}

async function sendCorrection(demande) {
  if (!demande || view.pending) return;
  const current = view;
  current.pending = demande;
  current.error = null;
  renderChat();
  try {
    const { meta, correction } = await api(`/api/comptes-rendus/${current.id}/corrections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demande }),
    });
    current.meta = meta;
    current.corrections.push(correction);
    if (view === current) renderResult();
  } catch (err) {
    current.error = err.message;
  }
  current.pending = null;
  if (view === current) renderChat();
}

async function choose(i, choix) {
  const current = view;
  try {
    const { correction, resume } = await api(`/api/comptes-rendus/${current.id}/corrections/${i}/choix`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choix }),
    });
    current.corrections[i] = { ...current.corrections[i], ...correction, resumeRegle: resume };
  } catch (err) {
    current.error = err.message;
  }
  if (view === current) renderChat();
}

async function renderTranscription() {
  const el = $('#drawer');
  const audio = AUDIO.includes(ext(view.meta.source.fichier));
  el.innerHTML = '<p class="hint">Chargement…</p>';
  const res = await fetch(`/api/comptes-rendus/${view.id}/cr.texte.txt`);
  if (view.tab !== 'transcription' || !$('#drawer')) return;
  el.innerHTML = `<p class="hint">${audio ? 'Transcription automatique de l\'enregistrement (noms corrigés par les règles).' : 'Texte des notes, tel que l\'IA l\'a reçu.'}</p>
    <pre class="text">${res.ok ? esc(await res.text()) : 'Texte introuvable.'}</pre>`;
}

async function renderDetails() {
  const el = $('#drawer');
  const { meta } = view;
  const SOURCE = { fichier: 'Fichier déposé', notes: 'Notes collées', enregistrement: 'Enregistrement au micro' };
  let cr = {};
  try { cr = await (await fetch(`/api/comptes-rendus/${view.id}/cr.json?v=${encodeURIComponent(meta.modifieLe ?? '')}`)).json(); } catch { /* affiché sans */ }
  if (view.tab !== 'details' || !$('#drawer')) return;
  const when = (iso) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
  const list = (items) => (items?.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="small">Aucun</span>');
  el.innerHTML = `<dl class="details">
    <dt>Source</dt><dd>${esc(SOURCE[meta.source.type])}${meta.source.type === 'notes' ? '' : ` · ${esc(meta.source.nom)}`}</dd>
    <dt>Créé le</dt><dd>${when(meta.creeLe)}</dd>
    ${meta.modifieLe ? `<dt>Dernière correction</dt><dd>${when(meta.modifieLe)}</dd>` : ''}
    <dt>Pages</dt><dd>${meta.overflow ? `2 (dépasse une page de ${meta.overflow} %)` : '1'}</dd>
    <dt>Présents (${cr.participants?.length ?? 0})</dt><dd>${esc((cr.participants ?? []).join(', ')) || '<span class="small">Aucun groupe</span>'}</dd>
    <dt>Absents (${cr.absents?.length ?? 0})</dt><dd>${esc((cr.absents ?? []).join(', ')) || '<span class="small">Aucun</span>'}</dd>
    <dt>À confirmer</dt><dd>${list(cr.a_confirmer)}</dd>
    <dt>Contrôles automatiques</dt><dd>${list(meta.avertissements)}</dd>
  </dl>`;
}

// Texte court pour WhatsApp : copié dans le presse-papiers et affiché.
async function whatsapp() {
  const current = view;
  try {
    const { texte } = await api(`/api/comptes-rendus/${current.id}/whatsapp`);
    let copied = false;
    try { await navigator.clipboard.writeText(texte); copied = true; } catch { /* copie à la main */ }
    current.whatsapp = { texte, copied };
  } catch (err) {
    current.whatsapp = { error: err.message };
  }
  if (view === current) renderWhatsapp();
}

function renderWhatsapp() {
  const el = $('#wabox');
  const wa = view.whatsapp;
  if (!el) return;
  if (!wa) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="panel wa">
    <div class="wahead"><b>${wa.error ? esc(wa.error) : wa.copied ? 'Texte copié : colle-le dans WhatsApp.' : 'Sélectionne le texte et copie-le.'}</b>
      <button class="x" id="waclose" aria-label="Fermer">${icon('x')}</button></div>
    ${wa.texte ? `<textarea readonly id="watext">${esc(wa.texte)}</textarea>` : ''}</div>`;
  $('#waclose').onclick = () => { view.whatsapp = null; renderWhatsapp(); };
}

// ---------- démarrage ----------

window.addEventListener('beforeunload', (e) => {
  if (recorder || (draft.job && !draft.job.error && !draft.job.meta)) e.preventDefault();
});
window.addEventListener('hashchange', route);
api('/api/config').then((c) => { config = c; route(); }).catch((err) => {
  $('#screen').innerHTML = `<div class="error">${esc(err.message)}</div>`;
});
