'use strict';
const $ = id => document.getElementById(id);
const notes = JSON.parse($('notes_data').textContent);
const scroller = $('paper_scroll');
const pages = [...document.querySelectorAll('.paper_page')];
const highlights = [...document.querySelectorAll('.highlight')];
const mobile = matchMedia('(max-width:800px)');
let selected = null;
let current_page = 1;
let scroll_frame = 0;

// The image decode/rasterization is independent of the document's layout tree.
const loader = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    const img = entry.target.querySelector('img');
    if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
    loader.unobserve(entry.target);
  }
}, {root: scroller, rootMargin: '650px 0px'});
pages.forEach(page => loader.observe(page));

function update_page() {
  scroll_frame = 0;
  const available = scroller.clientHeight-(mobile.matches && selected ? $('note_panel').offsetHeight+16 : 0);
  const marker = scroller.getBoundingClientRect().top + available * .3;
  let number = 1;
  for (const page of pages) {
    if (page.getBoundingClientRect().top > marker) break;
    number = Number(page.dataset.page);
  }
  if (scroller.scrollTop+scroller.clientHeight >= scroller.scrollHeight-2) number = pages.length;
  current_page = number;
  $('page_select').value = String(number);
  $('previous_page').disabled = number === 1;
  $('next_page').disabled = number === pages.length;
}
scroller.addEventListener('scroll', () => {
  if (!scroll_frame) scroll_frame = requestAnimationFrame(update_page);
}, {passive: true});
function go_to_page(number) {
  const page = pages[Math.max(1, Math.min(pages.length, number))-1];
  scroller.scrollTop += page.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 20;
}
$('page_select').addEventListener('change', event => go_to_page(Number(event.target.value)));
$('previous_page').addEventListener('click', () => go_to_page(current_page-1));
$('next_page').addEventListener('click', () => go_to_page(current_page+1));
function zoom() {
  const page = pages[current_page-1];
  const fraction = (scroller.getBoundingClientRect().top-page.getBoundingClientRect().top)/page.clientHeight;
  const scale = Number($('zoom_select').value);
  const fit = Math.min(scroller.clientWidth-(mobile.matches ? 24 : 48), 860);
  if (scale === 1) {
    scroller.style.removeProperty('--paper-width');
    scroller.style.removeProperty('--paper-max');
  } else {
    scroller.style.setProperty('--paper-width', `${Math.round(fit*scale)}px`);
    scroller.style.setProperty('--paper-max', 'none');
  }
  scroller.scrollTop += page.getBoundingClientRect().top-scroller.getBoundingClientRect().top+fraction*page.clientHeight;
}
$('zoom_select').addEventListener('change', zoom);
window.addEventListener('resize', zoom);

function reveal_highlight(id) {
  const highlight = $(`note_${id}`);
  const page = highlight.closest('.paper_page');
  const img = page.querySelector('img');
  if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
  const available = scroller.clientHeight-(mobile.matches ? $('note_panel').offsetHeight+16 : 0);
  const top = page.getBoundingClientRect().top + Number(highlight.dataset.top)*page.clientHeight;
  scroller.scrollTop += top-scroller.getBoundingClientRect().top-Math.max(30, available*.28);
}
function select_note(id, reveal = false, write_hash = true) {
  const index = notes.findIndex(note => note.id === Number(id));
  if (index < 0) return;
  selected = notes[index];
  highlights.forEach(mark => {
    const active = Number(mark.dataset.note) === selected.id;
    mark.classList.toggle('selected', active);
    mark.setAttribute('aria-expanded', String(active));
  });
  $('empty_note').hidden = true;
  $('selected_note').hidden = false;
  $('note_panel').classList.add('active');
  $('note_location').textContent = `PAGE ${String(selected.page).padStart(2,'0')} · READING NOTES`;
  $('note_title').textContent = `Note ${selected.number}`;
  $('note_quote').innerHTML = selected.quote;
  $('note_body').innerHTML = selected.body;
  $('note_content').scrollTop = 0;
  $('note_counter').textContent = `${index+1} / ${notes.length}`;
  $('previous_note').disabled = index === 0;
  $('next_note').disabled = index === notes.length-1;
  $('reader_status').textContent = `Note ${selected.number}, page ${selected.page}, opened.`;
  if (write_hash) history.replaceState(null, '', `#note_${selected.id}`);
  const chosen_id = selected.id;
  if (reveal || mobile.matches) requestAnimationFrame(() => {
    if (selected?.id === chosen_id) reveal_highlight(chosen_id);
  });
}
function close_note(write_hash = true) {
  const id = selected?.id;
  selected = null;
  $('selected_note').hidden = true;
  $('empty_note').hidden = false;
  $('note_panel').classList.remove('active');
  highlights.forEach(mark => { mark.classList.remove('selected'); mark.setAttribute('aria-expanded','false'); });
  if (write_hash) history.replaceState(null, '', location.pathname+location.search);
  if (id) $(`note_${id}`).focus({preventScroll:true});
}
for (const mark of highlights) {
  mark.addEventListener('click', () => select_note(mark.dataset.note));
  mark.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select_note(mark.dataset.note);
      $('note_title').focus({preventScroll:true});
    }
  });
}
$('first_note').addEventListener('click', () => select_note(notes[0].id, true));
$('jump_notes').addEventListener('click', () => select_note(selected?.id ?? notes[0].id, true));
$('close_note').addEventListener('click', () => close_note());
$('previous_note').addEventListener('click', () => select_note(notes[notes.indexOf(selected)-1].id,true));
$('next_note').addEventListener('click', () => select_note(notes[notes.indexOf(selected)+1].id,true));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && selected) close_note(); });
function read_hash() {
  const match = location.hash.match(/^#note_(\d+)$/);
  if (match) select_note(Number(match[1]),true,false);
  else if (selected) close_note(false);
}
window.addEventListener('hashchange', read_hash);
$('theme_toggle').addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  $('theme_toggle').setAttribute('aria-label',`Switch to ${light ? 'dark' : 'light'} theme`);
});
update_page();
read_hash();
