// Interface GCC Meeting (sans framework). Écrans : #/nouveau, #/cr/<id>, #/comptes-rendus, #/annuaire, #/regles.

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
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
};
const icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24">${ICONS[name]}</svg>`;
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fold = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
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

function route() {
  const [screen, id] = location.hash.replace(/^#\/?/, '').split('/');
  const name = screen || 'nouveau';
  for (const a of document.querySelectorAll('.links a')) {
    a.classList.toggle('on', a.dataset.screen === (name === 'cr' ? 'comptes-rendus' : name));
  }
  if (name === 'cr' && id) return showCompteRendu(id);
  if (name === 'comptes-rendus') return showListe();
  if (name === 'annuaire') return showAnnuaire();
  if (name === 'regles') return showRegles();
  showNouveau();
}

// ---------- écran 1 : nouveau compte-rendu ----------

function showNouveau() {
  // Groupe renommé ou supprimé entre-temps dans « Annuaire et groupes ».
  if (draft.groupe && !config.groupes[draft.groupe]) { draft.groupe = ''; draft.people = []; draft.absents.clear(); }
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

// ---------- écran 3 : comptes-rendus ----------

const ETATS = [['', 'Tous les états'], ['en_cours', 'En cours'], ['pret', 'Prêts'], ['erreur', 'Erreurs']];
const EN_COURS = { transcription: 'Transcription en cours…', redaction: 'Rédaction en cours…', mise_en_page: 'Mise en page…' };
const liste = { q: '', categorie: '', etat: '', items: null, error: null, timer: null };

function showListe() {
  setCat(liste.categorie || null);
  $('#screen').innerHTML = `
    <div class="head"><header><h1>Comptes-rendus</h1><p class="lead">Toutes les réunions, les plus récentes en premier</p></header>
      <a class="primary big" href="#/nouveau">+ Nouveau compte-rendu</a></div>
    <label class="searchbox">${icon('search')}<span class="sr">Rechercher</span>
      <input id="q" type="search" placeholder="Rechercher un mot, une personne, une décision…" value="${esc(liste.q)}" autocomplete="off"></label>
    <div class="filters">
      <div class="chips" role="group" aria-label="Catégorie">
        <button class="cat${liste.categorie ? '' : ' on all'}" data-filter="">Tout</button>
        ${config.categories.map((c) => `<button class="cat${liste.categorie === c.nom ? ' on' : ''}" data-filter="${esc(c.nom)}"
          style="${liste.categorie === c.nom ? `background:${c.couleur}` : ''}"><i style="background:${c.couleur}"></i>${esc(c.nom)}</button>`).join('')}
      </div>
      <label class="field inline"><span class="sr">État</span><select id="etat">
        ${ETATS.map(([v, label]) => `<option value="${v}"${liste.etat === v ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    </div>
    <section class="panel list" id="rows"></section>`;
  for (const b of document.querySelectorAll('[data-filter]')) b.onclick = () => { liste.categorie = b.dataset.filter; showListe(); };
  $('#etat').onchange = (e) => { liste.etat = e.target.value; renderRows(); };
  let debounce;
  $('#q').oninput = (e) => { liste.q = e.target.value; clearTimeout(debounce); debounce = setTimeout(loadListe, 250); };
  renderRows();
  loadListe();
}

async function loadListe() {
  clearTimeout(liste.timer);
  const q = liste.q;
  try {
    const items = await api(`/api/comptes-rendus?q=${encodeURIComponent(q)}`);
    if (q !== liste.q) return; // une recherche plus récente est partie
    liste.items = items;
    liste.error = null;
  } catch (err) {
    liste.error = err.message;
  }
  if (location.hash !== '#/comptes-rendus') return;
  renderRows();
  // Rafraîchi tant qu'un compte-rendu se prépare.
  if (liste.items?.some((m) => m.etat === 'en_cours')) liste.timer = setTimeout(loadListe, POLL_MS);
}

function renderRows() {
  const el = $('#rows');
  if (!el) return;
  if (liste.error) { el.innerHTML = `<div class="error">${esc(liste.error)}</div>`; return; }
  if (!liste.items) { el.innerHTML = '<p class="hint">Chargement…</p>'; return; }
  const items = liste.items.filter((m) => (!liste.categorie || m.categorie === liste.categorie) && (!liste.etat || m.etat === liste.etat));
  if (!items.length) {
    el.innerHTML = `<p class="empty">${liste.items.length || liste.q ? 'Aucun compte-rendu ne correspond.' : 'Aucun compte-rendu pour l\'instant. <a href="#/nouveau">Créer le premier</a>'}</p>`;
    return;
  }
  el.innerHTML = items.map((m) => {
    const color = catColor(m.categorie);
    const d = new Date(`${m.date}T12:00:00Z`);
    const extra = m.etat === 'pret' ? [m.presents.length ? `${m.presents.length} participant${m.presents.length > 1 ? 's' : ''}` : '', m.overflow ? '2 pages' : '1 page'].filter(Boolean) : [];
    const state = m.etat === 'pret' ? `<span class="ok">Prêt</span>${icon('chevron')}`
      : m.etat === 'erreur' ? `<span class="ko" title="${esc(m.erreur)}">Erreur</span>${icon('chevron')}`
      : `<span class="wait"><i class="spin"></i>${EN_COURS[m.etape] ?? 'En cours…'}</span>`;
    return `<a class="row" href="#/cr/${m.id}" style="--c:${color}">
      <span class="day"><b>${d.getUTCDate()}</b>${d.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' })}</span>
      <span class="what"><b>${esc(m.titre || 'Compte-rendu en préparation')}</b>
        <span><span class="svcs"><i></i>${[m.categorie, m.groupe].filter(Boolean).map(esc).join(' · ')}</span>${extra.map((x) => ` · ${x}`).join('')}</span></span>
      <span class="state">${state}</span></a>`;
  }).join('');
}

// ---------- écran 4 : annuaire et groupes ----------

const annuaire = { tab: 'groupes', edit: null, q: '', adding: '', error: null };
// edit : { original (nom actuel, '' pour un nouveau), nom, membres, q, confirm, error }

// Groupes où figure une personne, pour les suggestions.
const groupsOf = (name) => Object.keys(config.groupes).filter((g) => config.groupes[g].includes(name));

function showAnnuaire() {
  setCat(null);
  const tab = (id, label) => `<button role="tab" data-atab="${id}" aria-selected="${annuaire.tab === id}">${label}</button>`;
  $('#screen').innerHTML = `
    <div class="head"><header><h1>Annuaire et groupes</h1><p class="lead">Qui participe à quelle réunion. Tout se modifie.</p></header>
      <div class="actions"><div class="tabs" role="tablist">${tab('groupes', 'Groupes')}${tab('annuaire', `Annuaire · ${config.annuaire.length}`)}</div>
      ${annuaire.tab === 'groupes' ? '<button class="primary big" id="newgroup">+ Nouveau groupe</button>' : ''}</div></div>
    <div id="abody"></div>`;
  for (const b of document.querySelectorAll('[data-atab]')) b.onclick = () => { annuaire.tab = b.dataset.atab; showAnnuaire(); };
  if ($('#newgroup')) $('#newgroup').onclick = () => editGroup('');
  if (annuaire.tab === 'groupes') renderGroups(); else renderDirectory();
}

function renderGroups() {
  const el = $('#abody');
  const edit = annuaire.edit;
  const cards = Object.entries(config.groupes).map(([g, members]) => {
    const on = edit && edit.original === g;
    return `<article class="panel gcard${on ? ' on' : ''}">
      <div class="gtop"><div><h2>${esc(g)}</h2><span class="count">${members.length} personne${members.length > 1 ? 's' : ''}</span></div>
        ${on ? '<span class="badge">En cours de modification</span>' : `<button class="x pen" data-edit="${esc(g)}" aria-label="Modifier ${esc(g)}">${icon('pen')}</button>`}</div>
      <p>${members.map(esc).join(' · ') || '<span class="small">Aucun membre</span>'}</p></article>`;
  }).join('');
  el.innerHTML = `<div class="cols"><div class="gcards">${cards || '<p class="empty">Aucun groupe. Crée le premier avec « + Nouveau groupe ».</p>'}</div>
    ${edit ? '<section class="panel side editor" id="editor"></section>' : ''}</div>`;
  for (const b of el.querySelectorAll('[data-edit]')) b.onclick = () => editGroup(b.dataset.edit);
  if (edit) renderEditor();
}

function editGroup(name) {
  annuaire.edit = { original: name, nom: name, membres: [...(config.groupes[name] ?? [])], q: '', confirm: false, error: null };
  renderGroups();
  $('#gname')?.focus();
}

function renderEditor() {
  const el = $('#editor');
  const edit = annuaire.edit;
  const q = edit.q.trim();
  const matches = q ? config.annuaire.filter((n) => !edit.membres.includes(n) && fold(n).includes(fold(q))).slice(0, 6) : [];
  const exact = config.annuaire.some((n) => fold(n) === fold(q));
  el.innerHTML = `<h2>${edit.original ? `Modifier · ${esc(edit.original)}` : 'Nouveau groupe'}</h2>
    <label class="field">Nom du groupe<input id="gname" value="${esc(edit.nom)}" maxlength="60"></label>
    <div class="field"><span>Membres · ${edit.membres.length}</span><div class="people">
      ${edit.membres.map((m) => `<span class="person member">${esc(m)}<button class="rm" data-rm="${esc(m)}" aria-label="Retirer ${esc(m)}">×</button></span>`).join('') || '<span class="small">Aucun membre pour l\'instant.</span>'}
    </div></div>
    <label class="field">Ajouter une personne<input id="gq" value="${esc(edit.q)}" placeholder="Prénom ou nom…" autocomplete="off"></label>
    ${q ? `<div class="suggest">${matches.map((n) => `<button data-pick="${esc(n)}"><b>${esc(n)}</b>${groupsOf(n).length ? ` <span>· ${esc(groupsOf(n).join(', '))}</span>` : ''}</button>`).join('')}
      ${exact ? '' : `<button class="addnew" data-new="${esc(q)}">+ Ajouter « ${esc(q)} » à l'annuaire</button>`}</div>` : ''}
    ${edit.error ? `<div class="error">${esc(edit.error)}</div>` : ''}
    <div class="buttons"><button class="secondary" id="gcancel">Annuler</button><button class="primary" id="gsave">Enregistrer</button></div>
    ${edit.original ? `<button class="linkbtn danger" id="gdel">${edit.confirm ? 'Confirmer la suppression du groupe' : 'Supprimer le groupe'}</button>` : ''}`;
  $('#gname').oninput = (e) => { edit.nom = e.target.value; };
  $('#gq').oninput = (e) => {
    edit.q = e.target.value;
    renderEditor();
    const input = $('#gq');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };
  $('#gq').onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = $('#editor [data-pick]') ?? $('#editor [data-new]');
    first?.click();
  };
  for (const b of el.querySelectorAll('[data-rm]')) b.onclick = () => { edit.membres = edit.membres.filter((m) => m !== b.dataset.rm); renderEditor(); };
  for (const b of el.querySelectorAll('[data-pick]')) b.onclick = () => { edit.membres.push(b.dataset.pick); edit.q = ''; renderEditor(); $('#gq').focus(); };
  const add = $('[data-new]', el);
  if (add) add.onclick = async () => {
    try {
      config.annuaire = await api('/api/annuaire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom: add.dataset.new }) });
      edit.membres.push(config.annuaire.at(-1));
      edit.q = '';
      edit.error = null;
    } catch (err) {
      edit.error = err.message;
    }
    renderEditor();
  };
  $('#gcancel').onclick = () => { annuaire.edit = null; renderGroups(); };
  $('#gsave').onclick = () => {
    const nom = edit.nom.trim();
    if (!nom) { edit.error = 'Donne un nom au groupe.'; return renderEditor(); }
    if (nom !== edit.original && config.groupes[nom]) { edit.error = `Un groupe s'appelle déjà « ${nom} ».`; return renderEditor(); }
    // Ordre des groupes gardé ; un groupe renommé reste à sa place.
    const groupes = {};
    for (const [g, members] of Object.entries(config.groupes)) groupes[g === edit.original ? nom : g] = g === edit.original ? edit.membres : members;
    if (!edit.original) groupes[nom] = edit.membres;
    saveGroups(groupes);
  };
  if ($('#gdel')) $('#gdel').onclick = () => {
    if (!edit.confirm) { edit.confirm = true; return renderEditor(); }
    const groupes = { ...config.groupes };
    delete groupes[edit.original];
    saveGroups(groupes);
  };
}

async function saveGroups(groupes) {
  try {
    config.groupes = await api('/api/groupes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupes }) });
    annuaire.edit = null;
    renderGroups();
  } catch (err) {
    annuaire.edit.error = err.message;
    renderEditor();
  }
}

function renderDirectory() {
  const el = $('#abody');
  const q = fold(annuaire.q.trim());
  const names = config.annuaire.filter((n) => fold(n).includes(q));
  el.innerHTML = `<section class="panel">
    <div class="dirtools">
      <label class="searchbox small-box">${icon('search')}<span class="sr">Rechercher</span><input id="dq" type="search" placeholder="Rechercher dans l'annuaire…" value="${esc(annuaire.q)}" autocomplete="off"></label>
      <form class="addbox" id="dadd"><input id="dname" placeholder="Nouveau nom (Prénom I.)" value="${esc(annuaire.adding)}" maxlength="60" autocomplete="off"><button class="add">+ Ajouter</button></form>
    </div>
    ${annuaire.error ? `<div class="error">${esc(annuaire.error)}</div>` : ''}
    <ul class="dir">${names.map((n) => `<li><b>${esc(n)}</b>${groupsOf(n).length ? `<span>${esc(groupsOf(n).join(', '))}</span>` : ''}</li>`).join('')
      || '<li class="empty">Personne ne correspond.</li>'}</ul></section>`;
  $('#dq').oninput = (e) => {
    annuaire.q = e.target.value;
    renderDirectory();
    const input = $('#dq');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };
  $('#dname').oninput = (e) => { annuaire.adding = e.target.value; };
  $('#dadd').onsubmit = async (e) => {
    e.preventDefault();
    try {
      config.annuaire = await api('/api/annuaire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom: annuaire.adding }) });
      annuaire.q = annuaire.adding.trim();
      annuaire.adding = '';
      annuaire.error = null;
    } catch (err) {
      annuaire.error = err.message;
    }
    showAnnuaire();
  };
}

// ---------- écran 5 : règles apprises ----------

const RULE_TYPES = {
  nom: { section: 'Noms et mots mal transcrits', label: 'Nom ou mot mal transcrit', fields: [['de', 'Mal transcrit (ex. Davidson)'], ['vers', 'Bonne forme (ex. David S.)']] },
  redaction: { section: 'Façon de rédiger', label: 'Façon de rédiger', fields: [['texte', 'Consigne (ex. Toujours écrire l\'année avec un mois)'], ['detail', 'Exemple (facultatif)']] },
  glossaire: { section: 'Glossaire GCC', label: 'Mot du glossaire', fields: [['terme', 'Terme (ex. MD)'], ['definition', 'Définition (ex. directeur musical)']] },
};
const regles = { items: null, edit: null, error: null };
// edit : { id ('' pour une nouvelle), type, champs, actif, confirm, error }

async function showRegles() {
  setCat(null);
  $('#screen').innerHTML = `
    <div class="head"><header><h1>Règles apprises</h1><p class="lead">Ce que l'outil a retenu de tes corrections. Elles s'appliquent à chaque nouveau compte-rendu.</p></header>
      <button class="primary big" id="newrule">+ Ajouter une règle</button></div>
    <div id="rules"></div>`;
  $('#newrule').onclick = () => editRule(null);
  renderRules();
  try {
    regles.items = await api('/api/regles');
    regles.error = null;
  } catch (err) {
    regles.error = err.message;
  }
  if (location.hash === '#/regles') renderRules();
}

const shortDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });

function toggle(rule) {
  return `<button class="switch" role="switch" aria-checked="${rule.actif}" data-toggle="${rule.id}"
    aria-label="${rule.actif ? 'Désactiver' : 'Activer'} la règle"><i></i></button>`;
}

function ruleForm() {
  const edit = regles.edit;
  const type = RULE_TYPES[edit.type];
  return `<form class="ruleform" id="ruleform">
    ${edit.id ? '' : `<label class="field">Type de règle<select id="rtype">${Object.entries(RULE_TYPES).map(([t, d]) =>
      `<option value="${t}"${t === edit.type ? ' selected' : ''}>${d.label}</option>`).join('')}</select></label>`}
    <div class="two">${type.fields.map(([key, label]) => `<label class="field">${esc(label.replace(/ \(.*\)$/, ''))}
      <input data-field="${key}" value="${esc(edit.champs[key] ?? '')}" placeholder="${esc(label.match(/\((.*)\)$/)?.[1] ?? '')}" maxlength="200"></label>`).join('')}</div>
    ${edit.error ? `<div class="error">${esc(edit.error)}</div>` : ''}
    <div class="buttons">${edit.id ? `<button type="button" class="linkbtn danger" id="rdel">${edit.confirm ? 'Confirmer la suppression' : 'Supprimer la règle'}</button><span class="grow"></span>` : ''}
      <button type="button" class="secondary" id="rcancel">Annuler</button><button class="primary">${edit.id ? 'Enregistrer' : 'Ajouter'}</button></div>
  </form>`;
}

function renderRules() {
  const el = $('#rules');
  if (!el) return;
  if (regles.error) { el.innerHTML = `<div class="error">${esc(regles.error)}</div>`; return; }
  if (!regles.items) { el.innerHTML = '<p class="hint">Chargement…</p>'; return; }
  const edit = regles.edit;
  const origin = (r) => `<span class="small">${r.origine ? `Appris le ${shortDate(r.creeLe)} · ${esc(r.origine)}` : `Ajouté le ${shortDate(r.creeLe)}`}</span>`;
  const row = (r, main) => (edit?.id === r.id
    ? `<li class="rule editing">${ruleForm()}</li>`
    : `<li class="rule${r.actif ? '' : ' off'}"><button class="ruletext" data-rule="${r.id}" title="Modifier">${main}${origin(r)}</button>${toggle(r)}</li>`);
  const sections = Object.entries(RULE_TYPES).map(([type, d]) => {
    const items = regles.items.filter((r) => r.type === type);
    let body;
    if (type === 'glossaire') {
      const editing = items.find((r) => r.id === edit?.id);
      body = `<p class="hint">Le glossaire de base (GCC, Franco, EDD, MD, Régie…) est déjà dans la consigne de l'IA : ajoute ici les nouveaux mots.</p>
        ${items.length ? `<div class="gloss">${items.map((r) => `<button class="term${r.actif ? '' : ' off'}${editing === r ? ' on' : ''}" data-rule="${r.id}" title="Modifier"><b>${esc(r.terme)}</b> · ${esc(r.definition)}</button>`).join('')}</div>` : ''}
        ${editing ? `<div class="panel">${ruleForm()}<label class="check"><input type="checkbox" id="ractif"${editing.actif ? ' checked' : ''}> Active</label></div>` : ''}`;
    } else {
      body = items.length ? `<ul class="panel rules">${items.map((r) => row(r, type === 'nom'
        ? `<span><s>${esc(r.de)}</s> → <b>${esc(r.vers)}</b></span>`
        : `<span><b>${esc(r.texte)}</b>${r.detail ? `<br><span class="small">${esc(r.detail)}</span>` : ''}</span>`)).join('')}</ul>` : '';
    }
    if (!items.length) body = `${type === 'glossaire' ? body : ''}<p class="empty left">Aucune règle pour l'instant.</p>`;
    return `<section class="rulesec"><h2>${d.section} <span class="count">· ${items.length}</span></h2>${body}</section>`;
  }).join('');
  el.innerHTML = (edit && !edit.id ? `<section class="panel">${ruleForm()}</section>` : '') + sections;

  for (const b of el.querySelectorAll('[data-toggle]')) b.onclick = () => saveRule(b.dataset.toggle, { actif: b.getAttribute('aria-checked') !== 'true' });
  for (const b of el.querySelectorAll('[data-rule]')) b.onclick = () => editRule(regles.items.find((r) => r.id === b.dataset.rule));
  if (!edit) return;
  const form = $('#ruleform');
  for (const input of form.querySelectorAll('[data-field]')) input.oninput = () => { edit.champs[input.dataset.field] = input.value; };
  if ($('#rtype')) $('#rtype').onchange = (e) => { edit.type = e.target.value; edit.champs = {}; renderRules(); };
  $('#rcancel').onclick = () => { regles.edit = null; renderRules(); };
  if ($('#rdel')) $('#rdel').onclick = () => {
    if (!edit.confirm) { edit.confirm = true; return renderRules(); }
    saveRule(edit.id, null);
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!edit.id) return saveRule('', { type: edit.type, ...edit.champs });
    const change = { champs: edit.champs };
    if ($('#ractif')) change.actif = $('#ractif').checked;
    saveRule(edit.id, change);
  };
  form.querySelector('[data-field]').focus();
}

function editRule(rule) {
  const champs = {};
  if (rule) for (const [key] of RULE_TYPES[rule.type].fields) champs[key] = rule[key] ?? '';
  regles.edit = { id: rule?.id ?? '', type: rule?.type ?? 'nom', champs, confirm: false, error: null };
  renderRules();
}

// Ajout (id vide), modification ou activation (change), suppression (change null).
async function saveRule(id, change) {
  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    if (!id) regles.items.push(await api('/api/regles', json('POST', change)));
    else if (!change) {
      await api(`/api/regles/${id}`, { method: 'DELETE' });
      regles.items = regles.items.filter((r) => r.id !== id);
    } else {
      const saved = await api(`/api/regles/${id}`, json('PUT', change));
      regles.items = regles.items.map((r) => (r.id === id ? saved : r));
    }
    if (change?.actif === undefined || change?.champs || !id) regles.edit = null;
  } catch (err) {
    if (regles.edit) regles.edit.error = err.message; else regles.error = err.message;
  }
  renderRules();
}

// ---------- démarrage ----------

window.addEventListener('beforeunload', (e) => {
  if (recorder || (draft.job && !draft.job.error && !draft.job.meta)) e.preventDefault();
});
window.addEventListener('hashchange', route);
api('/api/config').then((c) => { config = c; route(); }).catch((err) => {
  $('#screen').innerHTML = `<div class="error">${esc(err.message)}</div>`;
});
