const API = location.protocol === 'file:' ? null : (location.origin + '/api');

/* ---------- ابزارها ---------- */
const el = (id) => document.getElementById(id);
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const fa = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });
function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return fa.format(-Math.max(1, Math.round(s / 60)), 'minute');
  if (s < 86400) return fa.format(-Math.round(s / 3600), 'hour');
  return fa.format(-Math.round(s / 86400), 'day');
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return String(u).slice(0, 26); }
}

function firstLine(text) {
  // خطوطی که فقط هشتگاند رد کن تا عنوان، متن واقعی پیام باشد
  const line = String(text || '').split('\n').map(s => s.trim())
    .find(s => s && !/^#[\w-]+$/.test(s)) || '(پیام بدون متن)';
  return line.length > 90 ? line.slice(0, 90) + '…' : line;
}

/* ---------- 상태 لیست واحد ---------- */
let allPosts = [];
let state = { tab: 'all', query: '', tag: '' };
const expanded = new Set();

function matches(p) {
  if (state.tab === 'airdrop' && !p.isAirdrop) return false;
  if (state.tab === 'project' && !(p.tags && p.tags.length)) return false;
  if (state.tag && !(p.tags || []).includes(state.tag)) return false;
  if (state.query) {
    const hay = String(p.text + ' ' + (p.tags || []).join(' ')).toLowerCase();
    if (!hay.includes(state.query)) return false;
  }
  return true;
}

function rowHTML(p) {
  const tags = (p.tags || []).slice(0, 3);
  const links = (p.links || []).slice(0, 3);
  const isOpen = expanded.has(p.id);
  const cls = [
    'row',
    p.isAirdrop ? 'is-airdrop' : '',
    /تمام|پایان|تعطیل/.test(p.text || '') ? 'is-ended' : '',
    isOpen ? 'is-open' : ''
  ].filter(Boolean).join(' ');

  return `<div class="${cls}" data-id="${esc(p.id)}">
    <button class="row__head" type="button" aria-expanded="${isOpen}">
      <span class="row__dot"></span>
      <span class="row__main">
        <span class="row__title">${esc(firstLine(p.text))}</span>
        <span class="row__sub">
          ${tags.map(t => `<span class="hash">#${esc(t)}</span>`).join(' · ')}
          ${tags.length ? ' · ' : ''}${timeAgo(p.date)}
        </span>
      </span>
      <span class="row__end">
        ${p.isAirdrop ? '<span class="row__badge">ایردراپ</span>' : ''}
        <span class="row__views">${p.views ? '👁 ' + esc(p.views) : ''}</span>
        <span class="row__chev">⌄</span>
      </span>
    </button>
    <div class="row__detail">
      <div class="detail__text">${esc(p.text || '')}</div>
      ${links.length ? `<div class="detail__links">${links.map(u =>
        `<a class="detail__link" href="${esc(u)}" target="_blank" rel="noopener nofollow">↗ ${esc(hostOf(u))}</a>`
      ).join('')}</div>` : ''}
      <div class="detail__foot">
        <a href="${esc(p.url)}" target="_blank" rel="noopener">مشاهده در تلگرام ←</a>
      </div>
    </div>
  </div>`;
}

function paintList() {
  const box = el('boardList');
  const list = allPosts.filter(matches);
  const count = el('listCount');
  if (count) count.innerHTML = `<b>${list.length.toLocaleString('fa-IR')}</b> پیام`;

  if (!list.length) {
    box.innerHTML = '<p class="empty">پیامی با این فیلتر پیدا نشد. جستجو یا فیلتر رو پاک کن.</p>';
    return;
  }

  // فقط ردیفهایی که محتوایشان تغییر کرده آپدیت میشوند تا جزئیات باز و اسکرول حفظ شود
  const existing = new Map(
    [...box.querySelectorAll('.row')].map(r => [r.dataset.id, r])
  );
  const ids = new Set(list.map(p => p.id));

  for (const p of list) {
    const html = rowHTML(p);
    const row = existing.get(p.id);
    if (!row) continue;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const fresh = tmp.firstElementChild;
    if (row.outerHTML !== fresh.outerHTML) row.replaceWith(fresh);
  }

  // وقتی تب/فیلتر عوض شده، لیست کاملاً بازسازی میشود
  const currentIds = [...box.querySelectorAll('.row')].map(r => r.dataset.id);
  const sameSet = currentIds.length === ids.size && currentIds.every(id => ids.has(id));
  if (!sameSet) {
    box.innerHTML = list.map(rowHTML).join('');
    return;
  }

  for (const [id, row] of existing) if (!ids.has(id)) row.remove();
  const added = list.filter(p => !existing.has(p.id));
  if (added.length) box.insertAdjacentHTML('afterbegin', added.map(rowHTML).join(''));
}

function initToolbar() {
  const tabs = el('tabs');
  const search = el('boardSearch');
  const tagSel = el('boardTag');

  // event listener ها فقط یک بار بسته میشوند (تازهسازی هر دقیقه نباید تکثیرشان کند)
  if (!tabs.dataset.bound) {
    tabs.dataset.bound = '1';

    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      state.tab = btn.dataset.tab;
      tabs.querySelectorAll('.tab').forEach(b => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on);
      });
      paintList();
    });

    search.addEventListener('input', () => {
      state.query = search.value.trim().toLowerCase();
      paintList();
    });

    tagSel.addEventListener('change', () => { state.tag = tagSel.value; paintList(); });
  }

  // پر کردن فیلتر هشتگ از دادههای واقعی، با حفظ انتخاب کاربر
  const tags = [...new Set(allPosts.flatMap(p => p.tags || []))].sort();
  const current = tagSel.value;
  tagSel.innerHTML = '<option value="">همه پروژهها</option>'
    + tags.map(t => `<option value="${esc(t)}">#${esc(t)}</option>`).join('');
  if (tags.includes(current)) tagSel.value = current;
  else if (current) { state.tag = ''; tagSel.value = ''; }
}

// باز/بسته شدن جزئیات (کلیک روی لینک داخل جزئیات نباید ردیف رو ببندد)
el('boardList').addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const head = e.target.closest('.row__head');
  if (!head) return;
  const row = head.closest('.row');
  const id = row.dataset.id;
  if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
  row.classList.toggle('is-open');
  head.setAttribute('aria-expanded', expanded.has(id));
});

/* ---------- آمار ---------- */
let liveStats = { subscribers: 0, members: 0, online: 0 };
function renderStats(s) {
  const set = (id, v) => {
    const n = el(id);
    if (!n) return;
    const target = +v || 0;
    if (n._first === undefined) {
      n._first = false;
      n.textContent = target.toLocaleString('fa-IR');
      return;
    }
    let cur = +String(n.textContent).replace(/[^\d]/g, '') || 0;
    if (cur === target) return;
    const step = Math.max(1, Math.round(Math.abs(target - cur) / 30));
    clearInterval(n._t);
    n._t = setInterval(() => {
      cur += cur < target ? step : -step;
      if ((cur < target && cur >= target) || (cur > target && cur <= target)) {
        cur = target; clearInterval(n._t);
      }
      n.textContent = cur.toLocaleString('fa-IR');
    }, 25);
  };
  set('statSubs', s.subscribers);
  set('statMembers', s.members);
  set('statOnline', s.online);
}

/* ---------- نوار نرخ ---------- */
const nf = new Intl.NumberFormat('fa-IR');
function fmtChange(v) {
  if (v == null || !Number.isFinite(+v)) return '';
  const n = +v;
  return `${n > 0 ? '+' : ''}${nf.format(+n.toFixed(2))}٪`;
}

async function loadRates() {
  if (!API) return;
  try {
    const r = await fetch(`${API}/prices`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const p = d.prices || {};
    if (!p.usdt?.irr) throw new Error('no data');

    el('rateUsdt').textContent = nf.format(p.usdt.irr);
    el('rateBtc').textContent = p.btc?.usdt ? nf.format(p.btc.usdt) : '—';
    el('rateEth').textContent = p.eth?.usdt ? nf.format(p.eth.usdt) : '—';

    const setChg = (id, v) => {
      const n = el(id);
      n.textContent = fmtChange(v);
      n.className = 'rates__change' + (v > 0 ? ' up' : v < 0 ? ' down' : '');
    };
    setChg('rateUsdtChg', p.usdt.change);
    setChg('rateBtcChg', p.btc?.change);
    setChg('rateEthChg', p.eth?.change);

    el('ratesTime').textContent = d.marketTime
      ? `بازار: ${d.marketDate} · ${d.marketTime}${d.stale ? ' · تأخیر' : ''}`
      : (d.stale ? 'نرخ با تأخیر' : '');
    el('rates').hidden = false;
  } catch {
    // منبع در دسترس نیست: نوار مخفی میشود، عدد جعلی نشان داده نمیشود
    el('rates').hidden = true;
  }
}

/* ---------- بارگذاری ---------- */
async function load() {
  if (!API) {
    el('boardList').innerHTML = '<p class="empty">برای دیدن دادههای زنده، سایت رو با <code>npm run dev</code> اجرا کن.</p>';
    return;
  }
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(`${API}/all`, { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);

    const d = await r.json();
    liveStats = d.stats || liveStats;
    renderStats(liveStats);
    el('updatedAt').textContent = timeAgo(d.updatedAt);
    document.body.classList.toggle('is-stale', !!d.stale);

    allPosts = d.posts || [];
    initToolbar();
    paintList();
  } catch (e) {
    el('boardList').innerHTML = '<p class="empty">دریافت اطلاعات ممکن نشد. کانال تلگرام رو ببینید.</p>'
      + '<p class="empty"><a href="https://t.me/Bamboodrop" target="_blank" rel="noopener">@Bamboodrop</a></p>';
    const count = el('listCount');
    if (count) count.textContent = '';
  }
}

/* ---------- FAQ ---------- */
const FAQ = [
  ["آیا رایگان است؟", "بله. بامبو دراپ هیچ هزینهای دریافت نمیکنه و فقط ایردراپهای مناسب رو معرفی میکنه."],
  ["آیا کیف پول لازم دارم؟", "برای تسکهای Testnet معمولاً یه کیف پول رایگان مثل MetaMask کافیه. برای ایردراپهای شبکه اصلی مقدار کمی فی لازم میشه."],
  ["اطلاعات کیف پولم امن میمونه؟", "ما هیچوقت seed phrase یا کلید خصوصی شما رو نمیخوایم. هیچ سایتی جز سایت رسمی پروژه رو تأیید نمیکنیم."],
  ["چطور میتونم کمک کنم؟", "توی گروه گفتگو تجربهت رو بگو یا ادمین @Bamboodrop00 رو پیام بده."],
  ["سوالم رو جواب ندادند چیکار کنم؟", "سؤالت رو با جزئیات کامل (اسم پروژه و کاری که کردی) توی گروه بذار؛ معمولاً سریع پاسخ داده میشه."],
  ["محتوای سایت چقدر تازهست؟", "این صفحه مستقیم از کانال تلگرام خوانده میشه و هر یک دقیقه بهروزرسانی میشه."]
];

const faqList = el('faqList');
faqList.innerHTML = FAQ.map(([q, a], i) => `
  <div class="faq__item ${i === 0 ? 'is-open' : ''}">
    <button class="faq__q" aria-expanded="${i === 0}">${esc(q)}<span class="chev">⌄</span></button>
    <div class="faq__a"><p>${esc(a)}</p></div>
  </div>`).join('');

faqList.addEventListener('click', e => {
  const btn = e.target.closest('.faq__q');
  if (!btn) return;
  const item = btn.parentElement;
  const open = item.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', open);
});

/* ---------- ثبتنام خبرنامه ---------- */
const SUB_KEY = 'bd_subscribed';
(function initSubscribe() {
  const form = el('subForm'), input = el('subEmail'), msg = el('subMsg'), btn = el('subBtn');
  if (!form) return;

  if (localStorage.getItem(SUB_KEY)) {
    input.value = localStorage.getItem(SUB_KEY);
    btn.textContent = 'ثبت شده ✓';
    btn.disabled = true;
    msg.className = 'sub__msg ok';
    msg.textContent = 'ایمیل شما ذخیره شده است.';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"\s]+\.[^\s@<>()[\]\\,;:"\s]{2,}$/.test(email)) {
      msg.className = 'sub__msg err';
      msg.textContent = 'لطفاً یک ایمیل معتبر وارد کنید.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'در حال ثبت…';
    try {
      let saved = false;
      if (API) {
        const r = await fetch(`${API}/subscribe`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        saved = r.ok;
      }
      if (!saved) localStorage.setItem(SUB_KEY, email);
      btn.textContent = 'ثبت شده ✓';
      msg.className = 'sub__msg ok';
      msg.textContent = 'ثبت شد! ایمیل جدیدترین ایردراپها رو برات میفرستیم.';
    } catch {
      localStorage.setItem(SUB_KEY, email);
      btn.textContent = 'ثبت شده ✓';
      msg.className = 'sub__msg ok';
      msg.textContent = 'ثبت شد (حالت آفلاین).';
    }
  });
})();

/* ---------- عمومی ---------- */
el('year').textContent = new Date().getFullYear();

const burger = el('burger');
const links = el('navLinks');
burger.addEventListener('click', () => links.classList.toggle('is-open'));
links.addEventListener('click', e => { if (e.target.tagName === 'A') links.classList.remove('is-open'); });

const nav = el('nav');
addEventListener('scroll', () => nav.classList.toggle('is-sticky', scrollY > 20));

load();
loadRates();
setInterval(load, 60000);
setInterval(loadRates, 60000);
