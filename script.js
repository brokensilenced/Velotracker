// ---------- Управление темой ----------
function applyTheme(mode) {
  if (mode === 'light') {
    document.body.classList.add('light-mode');
    localStorage.setItem('veloTheme', 'light');
  } else {
    document.body.classList.remove('light-mode');
    localStorage.setItem('veloTheme', 'dark');
  }
}

function toggleTheme() {
  if (document.body.classList.contains('light-mode')) {
    applyTheme('dark');
  } else {
    applyTheme('light');
  }
}

const savedTheme = localStorage.getItem('veloTheme');
if (savedTheme === 'light') {
  applyTheme('light');
} else {
  applyTheme('dark');
}

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// ---------- Планета (Three.js) ----------
const canvas = document.getElementById('planetCanvas');
const scene = new THREE.Scene();
scene.background = null;
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
camera.position.set(0, 0, 3.5);
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

function resizeCanvas() {
  const container = canvas.parentElement;
  const width = container.clientWidth;
  const height = Math.min(450, window.innerHeight * 0.5);
  canvas.width = width;
  canvas.height = height;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const textureLoader = new THREE.TextureLoader();
const earthLightsMap = textureLoader.load('https://threejs.org/examples/textures/planets/earth_lights_2048.png');
const geometry = new THREE.SphereGeometry(1.2, 128, 128);
const material = new THREE.MeshBasicMaterial({ map: earthLightsMap });
const earth = new THREE.Mesh(geometry, material);
scene.add(earth);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.7;
controls.enableZoom = true;
controls.zoomSpeed = 0.7;
controls.rotateSpeed = 0.7;
controls.enablePan = false;
controls.target.set(0, 0, 0);

let interactionTimeout;
renderer.domElement.addEventListener('mousedown', () => { controls.autoRotate = false; clearTimeout(interactionTimeout); });
renderer.domElement.addEventListener('mouseup', () => { interactionTimeout = setTimeout(() => { controls.autoRotate = true; }, 1800); });
renderer.domElement.addEventListener('touchstart', () => { controls.autoRotate = false; clearTimeout(interactionTimeout); });
renderer.domElement.addEventListener('touchend', () => { interactionTimeout = setTimeout(() => { controls.autoRotate = true; }, 1800); });

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ---------- Велотрекер ----------
(function() {
  function vibrate() { if (window.navigator?.vibrate) window.navigator.vibrate(25); }
  async function sendNotification(title, body) {
    if (Notification.permission === "granted") new Notification(title, { body });
    else if (Notification.permission !== "denied") {
      await Notification.requestPermission();
      if (Notification.permission === "granted") new Notification(title, { body });
    }
  }

  let map, polyline, currentPosition = null, positions = [], tracking = false, paused = false;
  let startTime = null, pauseTime = 0, timerInterval = null, totalDistance = 0, maxSpeed = 0;
  let history = [], bikeMarker = null, watchId = null;

  const customIcon = L.divIcon({
    html: `<div style="filter: drop-shadow(0 4px 8px rgba(255,255,255,0.3)); transition: transform 0.2s;">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="19" r="2" stroke="#ffffff" stroke-width="2" fill="none"/>
        <circle cx="8" cy="19" r="2" stroke="#ffffff" stroke-width="2" fill="none"/>
        <path d="M16 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" fill="#ffffff"/>
        <path d="M16.41 11H20V9h-3.59l-3-3c-.78-.78-2.05-.78-2.83 0L7.99 8.59c-.78.78-.78 2.05 0 2.83l3 3v4.59h2v-4.59c0-.53-.21-1.04-.59-1.41l-2-2 2.59-2.59 2 2c.38.38.88.59 1.41.59Z" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>`,
    iconSize: [36, 36],
    className: ''
  });

  function initMap() {
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([55.751244, 37.618423], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);
    polyline = L.polyline([], { color: '#ffffff', weight: 5, opacity: 0.9, smoothFactor: 1 }).addTo(map);
  }

  function updatePosition(position) {
    if (!tracking || paused) return;
    const lat = position.coords.latitude, lng = position.coords.longitude, now = Date.now();
    if (currentPosition) {
      const R = 6371, dLat = (lat - currentPosition.lat) * Math.PI/180, dLng = (lng - currentPosition.lng) * Math.PI/180;
      const a = Math.sin(dLat/2)**2 + Math.cos(currentPosition.lat * Math.PI/180) * Math.cos(lat * Math.PI/180) * Math.sin(dLng/2)**2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      totalDistance += dist;
      const dt = (now - currentPosition.timestamp) / 3600000;
      const speed = dt > 0 ? dist / dt : 0;
      if (speed > maxSpeed) maxSpeed = speed;
      document.getElementById('distanceDisplay').innerText = totalDistance.toFixed(2);
      document.getElementById('speedCurrent').innerText = speed.toFixed(1);
      positions.push({lat, lng, timestamp: now});
      polyline.setLatLngs(positions.map(p => [p.lat, p.lng]));
      if (bikeMarker) map.removeLayer(bikeMarker);
      bikeMarker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
      if (positions.length > 1) map.fitBounds(polyline.getBounds(), { padding: [50,50], maxZoom: 17 });
    } else {
      positions.push({lat, lng, timestamp: now});
      bikeMarker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
    }
    currentPosition = { lat, lng, timestamp: now };
  }

  async function startTracking() {
    if (tracking && !paused) return;
    if (paused) { paused = false; startTime = Date.now() - pauseTime; startTimer(); return; }
    await new Promise((resolve) => navigator.geolocation.getCurrentPosition((pos) => {
      currentPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: Date.now() };
      resolve();
    }, () => resolve(), { enableHighAccuracy: true, timeout: 5000 }));
    if (!currentPosition) { alert("Не удалось определить местоположение"); return; }
    map.flyTo([currentPosition.lat, currentPosition.lng], 5, { duration: 0.6 });
    setTimeout(() => { map.flyTo([currentPosition.lat, currentPosition.lng], 17, { duration: 1 }); }, 700);
    setTimeout(() => { vibrate(); }, 1200);
    setTimeout(() => {
      tracking = true; paused = false;
      positions = []; totalDistance = 0; maxSpeed = 0; currentPosition = null;
      startTime = Date.now(); pauseTime = 0;
      polyline.setLatLngs([]);
      document.getElementById('distanceDisplay').innerText = '0.00';
      document.getElementById('speedCurrent').innerText = '0.0';
      document.getElementById('speedAvg').innerText = '0.0';
      startTimer();
      if (watchId) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(updatePosition, console.error, { enableHighAccuracy: true });
    }, 1800);
  }

  function pauseTracking() { if (tracking && !paused) { paused = true; if (timerInterval) clearInterval(timerInterval); } }
  async function stopTracking() {
    if (!tracking) return;
    tracking = false; paused = false;
    if (timerInterval) clearInterval(timerInterval);
    if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (positions.length > 1) {
      const duration = pauseTime + (Date.now() - startTime);
      const avgSpeed = totalDistance / (duration / 3600000);
      document.getElementById('speedAvg').innerText = avgSpeed.toFixed(1);
      const ride = { id: Date.now(), date: new Date().toISOString(), distance: totalDistance, duration, avgSpeed, maxSpeed, positions: positions.slice() };
      history.unshift(ride);
      if (history.length > 50) history.pop();
      localStorage.setItem('veloTracker_history', JSON.stringify(history));
      renderHistory(); updateRecords();
      await sendNotification('Поездка завершена', `${totalDistance.toFixed(1)} км за ${Math.floor(duration/60000)} мин`);
    }
    document.getElementById('timeDisplay').innerText = '00:00:00';
    document.getElementById('speedCurrent').innerText = '0.0';
    if (bikeMarker) map.removeLayer(bikeMarker);
    positions = []; totalDistance = 0; startTime = null; pauseTime = 0;
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (!tracking || paused) return;
      const elapsed = pauseTime + (Date.now() - startTime);
      const hours = Math.floor(elapsed / 3600000);
      const minutes = Math.floor((elapsed % 3600000) / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      document.getElementById('timeDisplay').innerText = `${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
      if (totalDistance > 0 && elapsed > 0) document.getElementById('speedAvg').innerText = (totalDistance / (elapsed / 3600000)).toFixed(1);
    }, 400);
  }

  function updateRecords() {
    if (history.length === 0) { document.getElementById('bestDist').innerText = '0'; document.getElementById('bestAvg').innerText = '0'; document.getElementById('bestTime').innerText = '0'; return; }
    document.getElementById('bestDist').innerText = Math.max(...history.map(r => r.distance)).toFixed(1);
    document.getElementById('bestAvg').innerText = Math.max(...history.map(r => r.avgSpeed)).toFixed(1);
    document.getElementById('bestTime').innerText = Math.floor(Math.max(...history.map(r => r.duration)) / 60000);
  }

  function renderHistory() {
    const container = document.getElementById('historyList');
    if (!history.length) { container.innerHTML = '<div style="text-align:center;padding:30px;color:#555;"><i class="bx bx-bike" style="font-size:2rem;"></i><p>пока нет поездок</p></div>'; return; }
    let html = '';
    history.forEach((r, idx) => {
      const date = new Date(r.date).toLocaleDateString();
      const minutes = Math.floor(r.duration / 60000);
      html += `<div class="history-item" data-idx="${idx}"><strong>${date}</strong> — ${r.distance.toFixed(2)} км<br><small>⏱ ${minutes} мин | 🚴 ср. ${r.avgSpeed.toFixed(1)} км/ч | ⚡ макс. ${r.maxSpeed.toFixed(1)} км/ч</small></div>`;
    });
    container.innerHTML = html;
    document.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        const ride = history[idx];
        if (ride && ride.positions && ride.positions.length) {
          polyline.setLatLngs(ride.positions.map(p => [p.lat, p.lng]));
          map.fitBounds(polyline.getBounds(), { padding: [40,40] });
        }
      });
    });
  }

  function clearHistory() {
    if (confirm('Удалить всю историю поездок?')) {
      history = [];
      localStorage.removeItem('veloTracker_history');
      renderHistory();
      updateRecords();
    }
  }

  let chart = null;
  function updateChart() {
    const ctx = document.getElementById('distanceChart').getContext('2d');
    const last7 = history.slice(0,7).reverse();
    if (chart) chart.destroy();
    if (last7.length === 0) return;
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: last7.map(r => new Date(r.date).toLocaleDateString()),
        datasets: [{ label: 'км', data: last7.map(r => r.distance), backgroundColor: '#ffffff', borderRadius: 10, barPercentage: 0.6 }]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#aaa' } } }, scales: { y: { grid: { color: '#2a2a2a' } } } }
    });
  }

  function exportCSV() { let csv = "Date,Distance(km),Duration(ms),AvgSpeed(kmh),MaxSpeed(kmh)\n"; history.forEach(r => csv += `${r.date},${r.distance},${r.duration},${r.avgSpeed},${r.maxSpeed}\n`); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = `velotracker_${Date.now()}.csv`; a.click(); }
  function exportGPX() { if (!positions.length) { alert("нет активного маршрута"); return; } let gpx = `<?xml version="1.0"?><gpx version="1.1" creator="VeloTracker"><trk><name>Поездка</name><trkseg>\n`; positions.forEach(p => gpx += `<trkpt lat="${p.lat}" lon="${p.lng}"><time>${new Date(p.timestamp).toISOString()}</time></trkpt>\n`); gpx += `</trkseg></trk></gpx>`; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([gpx],{type:'application/gpx+xml'})); a.download = `route_${Date.now()}.gpx`; a.click(); }
  function setReminder() { const time = document.getElementById('reminderTime').value; if (!time) return; const [h,m] = time.split(':').map(Number); let d = new Date(); d.setHours(h,m,0,0); if (d <= new Date()) d.setDate(d.getDate()+1); const ms = d - new Date(); if (window._reminderTimeout) clearTimeout(window._reminderTimeout); window._reminderTimeout = setTimeout(async () => { await sendNotification('VeloTracker', 'Пора на велосипед!'); setReminder(); }, ms); }
  async function getWeather() { try { const pos = await new Promise((res,rej)=> navigator.geolocation.getCurrentPosition(res,rej,{timeout:4000})); const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current_weather=true`); const d = await r.json(); document.getElementById('weatherText').innerHTML = `${d.current_weather.temperature}°C, ${d.current_weather.windspeed} км/ч`; } catch(e) { document.getElementById('weatherText').innerHTML = '—'; } }
  function switchTab(tabId) { document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none'); document.getElementById(tabId+'Tab').style.display = 'block'; document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active'); if (tabId === 'stats') updateChart(); }

  // ---- Свайп-панель ----
  const panel = document.getElementById('controlPanel');
  const dragHandle = document.getElementById('dragHandle');
  let startY = 0;
  let currentTranslate = 0;
  let isDragging = false;
  let panelHeight = panel.offsetHeight;

  function updatePanelHeight() {
    panelHeight = panel.offsetHeight;
  }
  window.addEventListener('resize', updatePanelHeight);

  function setPanelTranslate(value) {
    panel.style.transform = `translateY(${value}px)`;
    currentTranslate = value;
    if (value > panelHeight * 0.6) {
      panel.classList.add('hidden');
    } else {
      panel.classList.remove('hidden');
    }
  }

  function onTouchStart(e) {
    startY = e.touches[0].clientY;
    panel.style.transition = 'none';
    isDragging = true;
  }

  function onTouchMove(e) {
    if (!isDragging) return;
    const deltaY = e.touches[0].clientY - startY;
    let newTranslate = Math.max(0, currentTranslate + deltaY);
    newTranslate = Math.min(newTranslate, panelHeight);
    panel.style.transform = `translateY(${newTranslate}px)`;
  }

  function onTouchEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    panel.style.transition = 'transform 0.3s ease';
    const current = currentTranslate;
    if (current > panelHeight * 0.3) {
      setPanelTranslate(panelHeight);
    } else {
      setPanelTranslate(0);
    }
    startY = 0;
  }

  dragHandle.addEventListener('touchstart', onTouchStart);
  dragHandle.addEventListener('touchmove', onTouchMove);
  dragHandle.addEventListener('touchend', onTouchEnd);

  // Инициализация: панель видна
  setPanelTranslate(0);
  updatePanelHeight();

  // Остальные обработчики
  const splash = document.getElementById('splashScreen');
  const mainApp = document.getElementById('mainApp');
  document.getElementById('startJourneyBtn').addEventListener('click', () => {
    splash.classList.add('hide');
    setTimeout(() => {
      splash.style.display = 'none';
      mainApp.classList.add('visible');
      initMap();
      const saved = localStorage.getItem('veloTracker_history');
      if (saved) { history = JSON.parse(saved); renderHistory(); updateRecords(); }
      if ("geolocation" in navigator) navigator.geolocation.getCurrentPosition(pos => map.setView([pos.coords.latitude, pos.coords.longitude], 14));
      getWeather();
      setInterval(getWeather, 600000);
      if (Notification.permission === "default") Notification.requestPermission();
    }, 650);
  });
  document.getElementById('startBtn').addEventListener('click', startTracking);
  document.getElementById('pauseBtn').addEventListener('click', pauseTracking);
  document.getElementById('stopBtn').addEventListener('click', stopTracking);
  document.getElementById('exportCSVBtn').addEventListener('click', exportCSV);
  document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
  document.getElementById('exportGPXBtn').addEventListener('click', exportGPX);
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  document.getElementById('reminderTime').addEventListener('change', setReminder);
})();
