const CONFIG = {
  OWM_KEY: '4712f78c9d9ec3c706d09a618565a692',
  GEOCODE_LIMIT: 6,
  UPDATE_INTERVAL_MS: 5 * 60 * 1000
};

const $ = s => document.querySelector(s);
const el = {
  searchInput: $('#searchInput'),
  filterInput: $('#filterInput'),
  suggestions: $('#suggestions'),
  refreshBtn: $('#refreshBtn'),
  unitC: $('#unitC'),
  unitF: $('#unitF'),
  themeToggle: $('#themeToggle'),

  locationName: $('#locationName'),
  timestamp: $('#timestamp'),
  weatherIcon: $('#weatherIcon'),
  tempValue: $('#tempValue'),
  weatherDesc: $('#weatherDesc'),
  humidity: $('#humidity'),
  wind: $('#wind'),
  pressure: $('#pressure'),
  saveFavBtn: $('#saveFavBtn'),
  currentLoading: $('#currentLoading'),

  forecastGrid: $('#forecastGrid'),
  forecastLoading: $('#forecastLoading'),

  favoritesList: $('#favoritesList'),
  apiStatus: $('#apiStatus'),
  autoStatus: $('#autoStatus'),
  activityLog: $('#activityLog')
};

let state = {
  unit: localStorage.getItem('wd_unit') || 'metric',
  theme: localStorage.getItem('wd_theme') || 'light',
  favorites: JSON.parse(localStorage.getItem('wd_favorites') || '[]'),
  coords: null,
  label: null,
  updateTimer: null
};

document.body.classList.toggle('dark', state.theme === 'dark');
[el.unitC, el.unitF].forEach(b => b.classList.toggle('active', b.dataset.unit === state.unit));

const jsonFetch = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};
const iconUrl = code => `https://openweathermap.org/img/wn/${code}@4x.png`;
const fmtTime = (dt, tz=0) => {
  try {
    const d = new Date((dt + tz) * 1000);
    return d.toLocaleString();
  } catch { return '-' }
};
const log = (txt) => {
  const t = new Date().toLocaleTimeString();
  const row = document.createElement('div');
  row.textContent = `[${t}] ${txt}`;
  if (el.activityLog.querySelector('.muted')) el.activityLog.innerHTML = '';
  el.activityLog.prepend(row);
};

let geoTimer = null;
el.searchInput.addEventListener('input', e => {
  const q = e.target.value.trim();
  if (geoTimer) clearTimeout(geoTimer);
  if (!q) { hideSuggestions(); return; }
  geoTimer = setTimeout(() => geocode(q), 280);
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search')) hideSuggestions();
});

function buildGeocodeQuery(q){
  const f = el.filterInput.value.trim();
  if (!f) return encodeURIComponent(q);
  // if user typed country code like "ID" or "US" — combine
  return encodeURIComponent(`${q},${f}`);
}

async function geocode(q){
  if (!CONFIG.OWM_KEY) return showSuggestionMsg('Masukkan API key di app.js');
  const query = buildGeocodeQuery(q);
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${query}&limit=${CONFIG.GEOCODE_LIMIT}&appid=${CONFIG.OWM_KEY}`;
  try {
    const data = await jsonFetch(url);
    if (!data || !data.length) return showSuggestionMsg('Tidak ditemukan');
    el.suggestions.innerHTML = data.map(d=>{
      const label = `${d.name}${d.state? ', ' + d.state : ''}, ${d.country}`;
      return `<button data-lat="${d.lat}" data-lon="${d.lon}" data-label="${label}">${label}</button>`;
    }).join('');
    el.suggestions.classList.add('active');
    // attach
    Array.from(el.suggestions.querySelectorAll('button')).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const lat = Number(btn.dataset.lat), lon = Number(btn.dataset.lon), label = btn.dataset.label;
        el.searchInput.value = label;
        hideSuggestions();
        loadWeatherByCoords({lat, lon}, label);
      });
    });
  } catch (err) {
    showSuggestionMsg('Error: ' + err.message);
  }
}
function showSuggestionMsg(msg){
  el.suggestions.innerHTML = `<div style="padding:12px;color:var(--muted)">${msg}</div>`;
  el.suggestions.classList.add('active');
}
function hideSuggestions(){ el.suggestions.classList.remove('active'); el.suggestions.innerHTML=''; }

/* Weather fetch */
async function fetchCurrent(lat, lon){
  const k = CONFIG.OWM_KEY, u = state.unit;
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${u}&appid=${k}`;
  return jsonFetch(url);
}
async function fetchForecast(lat, lon){
  const k = CONFIG.OWM_KEY, u = state.unit;
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${u}&appid=${k}`;
  return jsonFetch(url);
}

/* aggregate */
function aggregateDaily(list){
  const days = {};
  list.forEach(it=>{
    const key = new Date(it.dt * 1000).toISOString().slice(0,10);
    if (!days[key]) days[key] = {min: it.main.temp_min, max: it.main.temp_max, items: [it]};
    else { days[key].min = Math.min(days[key].min, it.main.temp_min); days[key].max = Math.max(days[key].max, it.main.temp_max); days[key].items.push(it); }
  });
  return Object.keys(days).sort().map(k=>{
    const items = days[k].items;
    const freq = {};
    items.forEach(it=> {
      const id = `${it.weather[0].icon}|${it.weather[0].description}`;
      freq[id] = (freq[id]||0) + 1;
    });
    const top = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0].split('|');
    return {date:k, min:Math.round(days[k].min), max:Math.round(days[k].max), icon: top[0], desc: top[1]};
  });
}

function renderCurrent(data){
  el.locationName.textContent = `${data.name}${data.sys?.country ? ', ' + data.sys.country : ''}`;
  el.timestamp.textContent = `Update: ${fmtTime(data.dt, data.timezone)}`;
  el.weatherIcon.src = iconUrl(data.weather[0].icon);
  el.weatherIcon.alt = data.weather[0].description;
  el.tempValue.textContent = `${Math.round(data.main.temp)} ${state.unit === 'metric' ? '°C' : '°F'}`;
  el.weatherDesc.textContent = data.weather[0].description;
  el.humidity.textContent = `${data.main.humidity}%`;
  el.wind.textContent = `${data.wind?.speed ?? '-'} ${state.unit === 'metric' ? 'm/s' : 'mph'}`;
  el.pressure.textContent = `${data.main.pressure} hPa`;
  el.currentLoading.classList.add('hidden');
  el.saveFavBtn.textContent = state.favorites.some(f=> f.label === state.label) ? '★ Favorit (Tersimpan)' : '☆ Simpan ke Favorit';
  log(`Memuat cuaca: ${state.label || data.name}`);
}

function renderForecast(daily){
  el.forecastGrid.innerHTML = '';
  const today = new Date().toISOString().slice(0,10);
  const items = daily.filter(d=> d.date !== today).slice(0,5);
  if (!items.length){ el.forecastGrid.innerHTML = '<div class="muted">Prakiraan tidak tersedia</div>'; el.forecastGrid.classList.remove('hidden'); el.forecastLoading.classList.add('hidden'); return; }
  items.forEach(d=>{
    const div = document.createElement('div');
    div.className = 'forecast-item';
    div.innerHTML = `
      <div class="date">${(new Date(d.date)).toLocaleDateString(undefined,{weekday:'short', day:'numeric', month:'short'})}</div>
      <img src="${iconUrl(d.icon)}" alt="${d.desc}" />
      <div class="desc" style="text-transform:capitalize">${d.desc}</div>
      <div class="temp-range">${d.min} / ${d.max} ${state.unit === 'metric' ? '°C' : '°F'}</div>
    `;
    el.forecastGrid.appendChild(div);
  });
  el.forecastGrid.classList.remove('hidden');
  el.forecastLoading.classList.add('hidden');
}

function saveFavorites(){
  localStorage.setItem('wd_favorites', JSON.stringify(state.favorites));
  renderFavorites();
}
function renderFavorites(){
  el.favoritesList.innerHTML = '';
  if (!state.favorites.length){ el.favoritesList.innerHTML = '<li class="muted">Belum ada favorit</li>'; return; }
  state.favorites.forEach(f=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>${f.label}</span><div><button class="btn small open" data-lat="${f.lat}" data-lon="${f.lon}">Buka</button><button class="btn small del" data-label="${f.label}">Hapus</button></div>`;
    el.favoritesList.appendChild(li);
  });
  el.favoritesList.querySelectorAll('.open').forEach(b=> b.addEventListener('click', ()=> loadWeatherByCoords({lat: b.dataset.lat, lon: b.dataset.lon}, b.parentElement.parentElement.querySelector('span').textContent)));
  el.favoritesList.querySelectorAll('.del').forEach(b=> b.addEventListener('click', ()=> { state.favorites = state.favorites.filter(x=> x.label !== b.dataset.label); saveFavorites(); log(`Hapus favorit ${b.dataset.label}`); }));
}

async function loadWeatherByCoords(coords, label){
  if (!CONFIG.OWM_KEY) { alert('Masukkan API key OpenWeatherMap di app.js (CONFIG.OWM_KEY).'); return; }
  state.coords = coords; state.label = label || `${coords.lat},${coords.lon}`;
  el.currentLoading.classList.remove('hidden'); el.forecastLoading.classList.remove('hidden');
  try {
    const [cur, fc] = await Promise.all([ fetchCurrent(coords.lat, coords.lon), fetchForecast(coords.lat, coords.lon) ]);
    renderCurrent(cur);
    const daily = aggregateDaily(fc.list);
    renderForecast(daily);
    apiOk(true);
  } catch (err) {
    el.currentLoading.classList.remove('hidden');
    el.currentLoading.textContent = 'Error: ' + err.message;
    apiOk(false);
    log('Error: ' + err.message);
  }
}

function apiOk(ok){ el.apiStatus.className = 'dot ' + (ok ? 'online' : ''); }

el.refreshBtn.addEventListener('click', ()=> { if (!state.coords) return; loadWeatherByCoords(state.coords, state.label); log(`Refresh ${state.label}`); });

el.saveFavBtn.addEventListener('click', ()=> {
  if (!state.coords || !state.label) return;
  const exists = state.favorites.some(f=> f.label === state.label);
  if (exists){ state.favorites = state.favorites.filter(x=> x.label !== state.label); log(`Hapus favorit ${state.label}`); }
  else { state.favorites.push({label: state.label, lat: state.coords.lat, lon: state.coords.lon}); log(`Simpan favorit ${state.label}`); }
  saveFavorites();
});

[el.unitC, el.unitF].forEach(btn=> btn.addEventListener('click', ()=> {
  state.unit = btn.dataset.unit; localStorage.setItem('wd_unit', state.unit);
  [el.unitC, el.unitF].forEach(b=> b.classList.toggle('active', b === btn));
  if (state.coords) loadWeatherByCoords(state.coords, state.label);
}));

el.themeToggle.addEventListener('click', ()=> {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('wd_theme', state.theme);
  document.body.classList.toggle('dark', state.theme === 'dark');
});

function startAuto(){ el.autoStatus.style.background = '#ffd36f'; if (state.updateTimer) clearInterval(state.updateTimer); state.updateTimer = setInterval(()=> { if (state.coords) loadWeatherByCoords(state.coords, state.label); }, CONFIG.UPDATE_INTERVAL_MS); }
function stopAuto(){ if (state.updateTimer) clearInterval(state.updateTimer); el.autoStatus.style.background = '#ddd'; }
document.addEventListener('visibilitychange', ()=> { if (document.hidden) stopAuto(); else startAuto(); });

renderFavorites(); startAuto();

if (navigator.geolocation){
  navigator.geolocation.getCurrentPosition(pos=> loadWeatherByCoords({lat: pos.coords.latitude, lon: pos.coords.longitude}, 'Lokasi Anda'), ()=> log('Geolocation tidak tersedia/ditolak'), {timeout:7000});
} else log('Browser tidak mendukung geolocation');

if (!state.coords && state.favorites.length){ const f = state.favorites[0]; loadWeatherByCoords({lat:f.lat, lon:f.lon}, f.label); }

window.loadByCoords = loadWeatherByCoords;