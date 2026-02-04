const { jsPDF } = window.jspdf;
// --- GLOBAL STATE & MODAL INSTANCES ---
let AppState = {
  currentUser: null,
  ownerData: {},
  // Ganti 'catatanData' dan 'lapakSuppliers' dengan 'masterData' yang lebih komprehensif
  masterData: {
    suppliers: [],
    products: []
  },
};
let pendapatanChartInstance = null;
let biayaChartInstance = null;
let modals = {};
let superownerChartInstance = null;

// --- HELPER & CORE FUNCTIONS ---
// Fungsi helper untuk navigasi bawah Superowner
function showPageAndNav(pageId, btnElement) {
  // 1. Panggil fungsi showPage utama
  showPage(pageId);

  // 2. Update status aktif pada tombol navigasi
  if (btnElement) {
    document.querySelectorAll('.bottom-nav-link').forEach(el => el.classList.remove('active'));
    btnElement.classList.add('active');
  }
}

function formatCurrency(value) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(value)}`;
}
function formatNumberInput(e) {
  let input = e.target;
  // 1. Ambil nilai input dan hapus semua karakter selain angka
  let value = input.value.replace(/\D/g, '');

  // 2. Jika nilainya kosong, biarkan kosong
  if (value === "") {
    input.value = "";
    return;
  }

  // 3. Ubah menjadi angka, lalu format dengan pemisah ribuan (titik)
  let formattedValue = new Intl.NumberFormat('id-ID').format(value);

  // 4. Setel kembali nilai input dengan yang sudah diformat
  input.value = formattedValue;
}
// --- HELPER & CORE FUNCTIONS ---

function manageFooterVisibility() {
  const footer = document.getElementById('rekap-footer');
  const handle = document.getElementById('footer-handle');
  const icon = document.getElementById('footer-toggle-icon');

  // --- BARIS DIAGNOSTIK ---
  // Kita cek dulu apakah elemennya ditemukan
  if (!handle) {
    console.error("DEBUG: Elemen #footer-handle TIDAK DITEMUKAN!");
    return;
  }
  console.log("DEBUG: Elemen #footer-handle ditemukan, event listener dipasang.");
  // --- AKHIR BARIS DIAGNOSTIK ---

  handle.onclick = function () {
    // --- BARIS DIAGNOSTIK ---
    console.log("DEBUG: Footer handle DIKLIK!");
    // --- AKHIR BARIS DIAGNOSTIK ---

    footer.classList.toggle('footer-hidden');

    if (footer.classList.contains('footer-hidden')) {
      icon.classList.remove('bi-chevron-down');
      icon.classList.add('bi-chevron-up');
    } else {
      icon.classList.remove('bi-chevron-up');
      icon.classList.add('bi-chevron-down');
    }
  };
}

function updateDate() {
  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  [
    "current-date-lapak",
    "current-date-owner",
    "current-date-supplier",
  ].forEach((id) => {
    if (document.getElementById(id))
      document.getElementById(id).textContent = today;
  });
}
function showToast(message, isSuccess = true) {
  const toastEl = document.getElementById("liveToast");
  if (!toastEl) return;
  const toast = bootstrap.Toast.getOrCreateInstance(toastEl);
  document.getElementById("toast-body").textContent = message;
  toastEl.className = `toast ${isSuccess ? "bg-success" : "bg-danger"
    } text-white`;
  document.getElementById("toast-icon").className = `bi ${isSuccess ? "bi-check-circle-fill" : "bi-exclamation-triangle-fill"
    } me-2`;
  document.getElementById("toast-title").textContent = isSuccess
    ? "Sukses"
    : "Gagal";
  toast.show();
}
function togglePasswordVisibility(button, fieldId) {
  const field = document.getElementById(fieldId);
  const icon = button.querySelector("i");
  if (field.type === "password") {
    field.type = "text";
    icon.classList.replace("bi-eye-slash", "bi-eye");
  } else {
    field.type = "password";
    icon.classList.replace("bi-eye", "bi-eye-slash");
  }
}
function toggleTablePasswordVisibility(icon) {
  const passSpan = icon.closest("td").querySelector(".password-text");
  if (passSpan.textContent.includes("•")) {
    passSpan.textContent = passSpan.dataset.password;
    icon.classList.replace("bi-eye-slash", "bi-eye");
  } else {
    passSpan.textContent = "••••••••";
    icon.classList.replace("bi-eye", "bi-eye-slash");
  }
}

// --- LOGIN, ROUTING & PAGE MANAGEMENT ---
async function showPage(pageId) {
  document.querySelectorAll(".page").forEach((e) => (e.style.display = "none"));

  const activePage = document.getElementById(pageId);
  if (activePage) {
    activePage.style.display = "block";
    if (pageId === "login-page") activePage.style.display = "flex";

    // === LOGIKA BARU: AUTO UPDATE NAVBAR HIGHLIGHT ===
    // Mapping: Halaman mana -> Tombol Nav ID mana
    const navMapping = {
      // Dashboard Tab
      'owner-dashboard': 'nav-btn-dashboard',
      'owner-chart-page': 'nav-btn-dashboard', // Jika masih ada sisa
      'owner-data-admin-page': 'nav-btn-dashboard', // Sub-menu tetap highlight dashboard
      'owner-data-lapak-page': 'nav-btn-dashboard',

      // Pembayaran Tab
      'owner-pembayaran-page': 'nav-btn-bayar',
      'owner-laporan-biaya-page': 'nav-btn-bayar', // Sub-menu pembayaran

      // Verifikasi Tab
      'owner-verification-center-page': 'nav-btn-verif',
      'owner-manage-reports-page': 'nav-btn-dashboard' // Anggap ini bagian verifikasi/laporan
    };

    const activeNavId = navMapping[pageId];

    // Reset semua tombol nav owner
    document.querySelectorAll('#owner-bottom-nav .bottom-nav-link').forEach(btn => btn.classList.remove('active'));

    // Set active class jika mapping ditemukan
    if (activeNavId) {
      const btn = document.getElementById(activeNavId);
      if (btn) btn.classList.add('active');
    }
    // ===============================================

    // --- LOGIKA NAVBAR DISPLAY (KODE LAMA DISESUAIKAN) ---
    const soNav = document.getElementById("superowner-bottom-nav");
    const ownerNav = document.getElementById("owner-bottom-nav");
    const supNav = document.getElementById("supplier-bottom-nav");

    if (soNav) soNav.style.display = "none";
    if (ownerNav) ownerNav.style.display = "none";
    if (supNav) supNav.style.display = "none";

    if (AppState.currentUser && pageId !== 'login-page') {
      if (AppState.currentUser.role === 'superowner') {
        if (soNav) soNav.style.display = "flex";
      } else if (AppState.currentUser.role === 'owner') {
        if (ownerNav) ownerNav.style.display = "flex";
      } else if (AppState.currentUser.role === 'supplier') {
        if (supNav) supNav.style.display = "flex";
      }
    }
    // ----------------------------------------------------


    // --- Logika Footer Lapak (Kode Lama Anda) ---
    const footerElement = document.getElementById("rekap-footer");
    if (footerElement) {
      footerElement.style.display =
        pageId === "lapak-dashboard" && AppState.currentUser?.role === "lapak"
          ? "block"
          : "none";
    }

    // --- Logika Populate Data (Kode Lama Anda) ---
    const { role } = AppState.currentUser || {};

    if (role === "owner") {
      if (pageId === "owner-dashboard") await populateOwnerDashboard();
      if (pageId.startsWith("owner-laporan")) {
        const dpPendapatan = document.getElementById("laporan-pendapatan-datepicker");
        if (dpPendapatan) dpPendapatan.dispatchEvent(new Event("change"));
        const dpBiaya = document.getElementById("laporan-biaya-datepicker");
        if (dpBiaya) dpBiaya.dispatchEvent(new Event("change"));
      }
      if (pageId === "owner-manage-reports-page") {
        const todayISO = new Date().toISOString().split("T")[0];
        document.getElementById('manage-reports-daily-date').value = todayISO;
        document.getElementById('manage-reports-start-date').value = '';
        document.getElementById('manage-reports-end-date').value = '';
        await populateManageReportsPage();
      }
      if (pageId === "owner-pembayaran-page") {
        const todayISO = new Date().toISOString().split("T")[0];
        document.getElementById('payment-history-daily-date').value = todayISO;
        document.getElementById('payment-history-start-date').value = '';
        document.getElementById('payment-history-end-date').value = '';
        await populatePembayaranPage();
      }
      if (pageId === "owner-supplier-history-page") await populateOwnerSupplierHistoryPage();
      if (pageId === "owner-chart-page") await initDashboardCharts();
      if (pageId === "owner-verification-center-page") await populateVerificationCenter();

    } else if (role === "lapak") {
      if (pageId === "lapak-dashboard") await populateLapakDashboard();
      if (pageId === "history-laporan-page") await populateHistoryLaporanPage();

    } else if (role === "supplier") {
      if (pageId === "supplier-dashboard") await populateSupplierDashboard();
      if (pageId === "supplier-history-page") await populateSupplierHistoryPage();
      if (pageId === "supplier-notification-history-page") await populateArchivedNotifications();

    } else if (role === "superowner") {
      if (pageId === "superowner-dashboard") await populateSuperownerDashboard();
      if (pageId === "superowner-profit-detail-page") await populateSuperownerProfitDetails();
      if (pageId === "superowner-manage-reports-page") await populateSuperownerReports();
      if (pageId === "superowner-transactions-page") {
        const todayISO = new Date().toISOString().split("T")[0];
        document.getElementById('so-tx-daily-date').value = todayISO;
        document.getElementById('so-tx-start-date').value = '';
        document.getElementById('so-tx-end-date').value = '';
        await populateSuperownerTransactions();
      }
      if (pageId === "superowner-manage-owners-page") await populateSuperownerManageOwners();
    }
  }
}
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("username").value.trim(),
    password = document.getElementById("password").value;
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const result = await response.json();
    if (response.ok && result.success) {
      localStorage.setItem("userSession", JSON.stringify(result));
      AppState.currentUser = result;
      await routeUser(result.role);
    } else {
      showToast(result.message || "Login Gagal", false);
    }
  } catch (e) {
    showToast("Terjadi kesalahan koneksi.", false);
  }
}
async function handleAuthRouting() {
  const session = localStorage.getItem("userSession");
  if (session) {
    AppState.currentUser = JSON.parse(session);
    await routeUser(AppState.currentUser.role);
  } else {
    showLoginPage();
  }
}
function showLoginPage() {
  // Pastikan ini ada di awal reset tampilan
  document.getElementById("superowner-bottom-nav").style.display = "none";
  document
    .querySelectorAll("main")
    .forEach((main) => (main.style.display = "none"));
  showPage("login-page");
}
async function routeUser(role) {
  const soNav = document.getElementById("superowner-bottom-nav");
  const ownerNav = document.getElementById("owner-bottom-nav");
  const supNav = document.getElementById("supplier-bottom-nav");
  if (soNav) soNav.style.display = "none";
  if (ownerNav) ownerNav.style.display = "none";
  if (supNav) supNav.style.display = "none";
  document
    .querySelectorAll("main")
    .forEach((main) => (main.style.display = "none"));
  if (role === "owner") {
    document.getElementById("owner-pages").style.display = "block";
    showPage("owner-dashboard");
    document.getElementById("owner-name").textContent =
      AppState.currentUser.user_info.nama_lengkap;
  } else if (role === "lapak") {
    document.getElementById("lapak-pages").style.display = "block";
    document.getElementById("lapak-name").textContent =
      AppState.currentUser.user_info.nama_lengkap;
    showPage("lapak-dashboard");
  } else if (role === "supplier") {
    document.getElementById("supplier-pages").style.display = "block";
    showPage("supplier-dashboard");
    document.getElementById("supplier-name").textContent =
      AppState.currentUser.user_info.nama_supplier;
  } else if (role === "superowner") {
    document.getElementById("superowner-pages").style.display = "block";
    showPage("superowner-dashboard");
    // TAMPILKAN NAVIGASI BAWAH
    document.getElementById("superowner-bottom-nav").style.display = "flex";
    // Update tanggal untuk dashboard baru
    if (document.getElementById("current-date-superowner")) {
      document.getElementById("current-date-superowner").textContent = new Date().toLocaleDateString("id-ID", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
    }

  } else {
    showLoginPage();
  }
}
function handleLogout() {
  if (AppState.currentUser && AppState.currentUser.role === 'lapak') {
    const storageKey = `reportState_${AppState.currentUser.user_info.lapak_id}`;
    localStorage.removeItem(storageKey);
  }

  // TAMBAHKAN INI: Sembunyikan navbar superowner saat logout
  const soNav = document.getElementById("superowner-bottom-nav");
  if (soNav) soNav.style.display = "none";
  const ownerNav = document.getElementById("owner-bottom-nav");
  if (ownerNav) ownerNav.style.display = "none";

  localStorage.removeItem("userSession");
  AppState.currentUser = null;
  window.location.reload();
}

function changeReportDate(dayDelta) {
  const dateEl = document.getElementById('manage-reports-daily-date');
  const newDate = new Date(dateEl.value);
  newDate.setDate(newDate.getDate() + dayDelta);
  dateEl.value = newDate.toISOString().split('T')[0];
  // Otomatis tutup filter canggih & refresh
  bootstrap.Collapse.getOrCreateInstance('#advanced-reports-filter').hide();
  populateManageReportsPage();
}

// FUNGSI HELPER BARU 2: Untuk navigasi harian Pembayaran
function changePaymentDate(dayDelta) {
  const dateEl = document.getElementById('payment-history-daily-date');
  const newDate = new Date(dateEl.value);
  newDate.setDate(newDate.getDate() + dayDelta);
  dateEl.value = newDate.toISOString().split('T')[0];
  // Otomatis tutup filter canggih & refresh
  bootstrap.Collapse.getOrCreateInstance('#advanced-payment-filter').hide();
  populatePaymentHistory();
}

// (Letakkan ini di dalam tag <script>)

// FUNGSI HELPER BARU: Untuk navigasi harian SO Transactions
function changeSuperownerTxDate(dayDelta) {
  const dateEl = document.getElementById('so-tx-daily-date');
  const newDate = new Date(dateEl.value);
  newDate.setDate(newDate.getDate() + dayDelta);
  dateEl.value = newDate.toISOString().split('T')[0];
  // Otomatis tutup filter canggih & refresh
  bootstrap.Collapse.getOrCreateInstance('#so-advanced-tx-filter').hide();
  populateSuperownerTransactions();
}

// --- OWNER FUNCTIONS ---
async function initDashboardCharts() {
  const monthSelect = document.getElementById('chart-month-select');
  const yearSelect = document.getElementById('chart-year-select');

  // Cek jika elemen ada (untuk menghindari error di halaman lain)
  if (!monthSelect || !yearSelect) return;

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  // Set default values jika belum ada value
  if (!monthSelect.value) monthSelect.value = currentMonth;

  // Isi tahun jika kosong
  if (yearSelect.options.length === 0) {
    yearSelect.innerHTML = '';
    for (let y = currentYear; y >= 2023; y--) {
      yearSelect.innerHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
    }
  }

  // Gambar grafik
  await fetchAndDrawCharts();
}

async function fetchAndDrawCharts() {
  const loadingEl = document.getElementById('chart-loading');
  const contentEl = document.getElementById('chart-content');
  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';

  const month = document.getElementById('chart-month-select').value;
  const year = document.getElementById('chart-year-select').value;

  try {
    const resp = await fetch(`/api/get_chart_data?month=${month}&year=${year}`);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);

    const chartOptions = {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value) { return formatCurrency(value); }
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function (context) {
              return context.dataset.label + ': ' + formatCurrency(context.raw);
            }
          }
        }
      }
    };

    // Hancurkan grafik lama sebelum menggambar yang baru
    if (pendapatanChartInstance) pendapatanChartInstance.destroy();
    if (biayaChartInstance) biayaChartInstance.destroy();

    // Gambar Grafik Pendapatan
    const ctxPendapatan = document.getElementById('pendapatanChart').getContext('2d');
    pendapatanChartInstance = new Chart(ctxPendapatan, {
      type: 'line',
      data: {
        labels: result.labels,
        datasets: [{
          label: 'Pendapatan',
          data: result.pendapatanData,
          borderColor: 'rgba(25, 135, 84, 1)',
          backgroundColor: 'rgba(25, 135, 84, 0.2)',
          fill: true,
          tension: 0.1
        }]
      },
      options: chartOptions
    });

    // Gambar Grafik Biaya
    const ctxBiaya = document.getElementById('biayaChart').getContext('2d');
    biayaChartInstance = new Chart(ctxBiaya, {
      type: 'line',
      data: {
        labels: result.labels,
        datasets: [{
          label: 'Biaya Supplier',
          data: result.biayaData,
          borderColor: 'rgba(220, 53, 69, 1)',
          backgroundColor: 'rgba(220, 53, 69, 0.2)',
          fill: true,
          tension: 0.1
        }]
      },
      options: chartOptions
    });

    contentEl.style.display = 'block';
  } catch (e) {
    showToast('Gagal memuat data grafik: ' + e.message, false);
  } finally {
    loadingEl.style.display = 'none';
  }
}

async function populateOwnerSupplierHistoryPage() {
  // Fungsi ini mengisi dropdown supplier saat halaman pertama kali dibuka
  const selectEl = document.getElementById('owner-supplier-select');
  // PERBAIKAN: Pastikan placeholder memiliki value=""
  selectEl.innerHTML = '<option selected value="">-- Pilih Supplier --</option>';

  // Kita gunakan data supplier dari AppState yang sudah ada
  if (AppState.ownerData && AppState.ownerData.supplier_data) {
    AppState.ownerData.supplier_data.forEach(s => {
      selectEl.innerHTML += `<option value="${s.id}">${s.nama_supplier}</option>`;
    });
  }
  // Sembunyikan konten & loading di awal
  document.getElementById('owner-supplier-history-content').style.display = 'none';
  document.getElementById('owner-supplier-history-loading').style.display = 'none';
}

async function fetchAndDisplayOwnerSupplierHistory() {
  const supplierId = document.getElementById('owner-supplier-select').value;
  // Jika belum ada supplier yang dipilih, sembunyikan konten dan jangan lakukan apa-apa
  if (!supplierId) {
    document.getElementById('owner-supplier-history-content').style.display = 'none';
    return;
  }

  const loadingEl = document.getElementById('owner-supplier-history-loading'),
    contentEl = document.getElementById('owner-supplier-history-content'),
    salesBody = document.getElementById('owner-supplier-sales-body'),
    paymentsBody = document.getElementById('owner-supplier-payment-body');

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';

  // Mengambil nilai tanggal dari input
  const startDate = document.getElementById('owner-history-start-date').value;
  const endDate = document.getElementById('owner-history-end-date').value;

  // Membangun query string
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const queryString = params.toString();

  try {
    const apiUrl = `/api/get_owner_supplier_history/${supplierId}?${queryString}`;
    const resp = await fetch(apiUrl);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);

    paymentsBody.innerHTML = result.payments.length === 0
      ? `<tr><td colspan="3" class="text-center text-muted">Tidak ada pembayaran.</td></tr>`
      : result.payments.map(p => `<tr><td>${new Date(p.tanggal + 'T00:00:00').toLocaleDateString('id-ID')}</td><td>${formatCurrency(p.jumlah)}</td><td><span class="badge bg-info">${p.metode}</span></td></tr>`).join('');

    salesBody.innerHTML = result.sales.length === 0
      ? `<tr><td colspan="5" class="text-center text-muted">Tidak ada penjualan.</td></tr>`
      : result.sales.map(s => `<tr><td>${new Date(s.tanggal + 'T00:00:00').toLocaleDateString('id-ID')}</td><td>${s.lokasi}</td><td>${s.nama_produk}</td><td>${s.terjual} Pcs</td><td class="text-end">${formatCurrency(s.total_harga_beli)}</td></tr>`).join('');

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  } catch (e) {
    loadingEl.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

async function populateOwnerDashboard() {
  try {
    const ownerId = AppState.currentUser.user_info.id;
    const dataResp = await fetch(`/api/get_data_owner/${ownerId}`);

    if (!dataResp.ok) throw new Error("Gagal mengambil data owner");
    AppState.ownerData = await dataResp.json();

    document.getElementById("owner-pendapatan-card").textContent = formatCurrency(AppState.ownerData.summary.pendapatan_bulan_ini);
    document.getElementById("owner-biaya-card").textContent = formatCurrency(AppState.ownerData.summary.biaya_bulan_ini);
    document.getElementById("owner-profit-card").textContent = formatCurrency(AppState.ownerData.summary.profit_owner_bulan_ini);
    document.getElementById("owner-superowner-profit-card").textContent = formatCurrency(AppState.ownerData.summary.profit_superowner_bulan_ini);

    await populateOwnerDataPages();
    await initDashboardCharts();
  } catch (error) {
    showToast("Gagal memuat data owner.", false);
  }
}
async function populateOwnerDataPages() {
  const { admin_data, lapak_data, supplier_data } = AppState.ownerData;
  document.getElementById("admin-table-body").innerHTML = admin_data
    .map(
      (u) =>
        `<tr><td>${u.nama_lengkap}</td><td>${u.username}</td><td>${u.email}</td><td>${u.nomor_kontak}</td><td class="password-cell"><span class="password-text me-2" data-password="${u.password}">••••••••</span><i class="bi bi-eye-slash" style="cursor: pointer;" onclick="toggleTablePasswordVisibility(this)"></i></td><td><div class="btn-group"><button class="btn btn-sm btn-warning btn-action" onclick='openEditModal("admin", ${u.id})'><i class="bi bi-pencil-fill"></i></button><button class="btn btn-sm btn-danger btn-action" onclick='handleDelete("admin", ${u.id})'><i class="bi bi-trash-fill"></i></button></div></td></tr>`
    )
    .join("");
  document.getElementById("lapak-table-body").innerHTML = lapak_data
    .map(
      (l) =>
        `<tr><td>${l.lokasi}</td><td>${l.penanggung_jawab}</td><td>${l.anggota
          .map(
            (a) =>
              `<span class="badge bg-secondary me-1">${a.nama}</span>`
          )
          .join("") || "-"
        }</td><td><div class="btn-group"><button class="btn btn-sm btn-warning btn-action" onclick='openEditModal("lapak", ${l.id
        })'><i class="bi bi-pencil-fill"></i></button><button class="btn btn-sm btn-danger btn-action" onclick='handleDelete("lapak", ${l.id
        })'><i class="bi bi-trash-fill"></i></button></div></td></tr>`
    )
    .join("");
  document.getElementById("supplier-table-body").innerHTML = supplier_data
    .map(
      (s) =>
        `<tr><td>${s.nama_supplier}</td><td>${s.username || "-"
        }</td><td>${s.kontak}</td><td>${s.nomor_register || "-"
        }</td><td class="password-cell"><span class="password-text me-2" data-password="${s.password
        }">••••••••</span><i class="bi bi-eye-slash" style="cursor: pointer;" onclick="toggleTablePasswordVisibility(this)"></i></td><td><div class="btn-group"><button class="btn btn-sm btn-warning btn-action" onclick='openEditModal("supplier", ${s.id
        })'><i class="bi bi-pencil-fill"></i></button><button class="btn btn-sm btn-danger btn-action" onclick='handleDelete("supplier", ${s.id
        })'><i class="bi bi-trash-fill"></i></button></div></td></tr>`
    )
    .join("");
}
async function showReportDetails(reportId) {
  const container = document.getElementById("invoice-content");
  container.innerHTML = `<div class="text-center p-5"><div class="spinner-border"></div></div>`;
  modals.reportDetail.show();
  try {
    const resp = await fetch(`/api/get_report_details/${reportId}`);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);

    const data = result.data;

    // --- 1. MEMBUAT HTML STATUS HUTANG (BAGIAN BARU) ---
    let hutangHtml = '';
    if (data.supplier_status && Object.keys(data.supplier_status).length > 0) {
      hutangHtml += `
              <div class="alert alert-warning mt-3 border-warning">
                <h6 class="alert-heading fw-bold mb-2"><i class="bi bi-info-circle-fill"></i> Status Hutang Supplier Terkait</h6>
                <div class="row g-2">`;

      for (const [name, status] of Object.entries(data.supplier_status)) {
        // Warna merah jika hutang > 0, Hijau jika lunas (0)
        const colorClass = status.total_hutang_saat_ini > 100 ? 'text-danger' : 'text-success';

        hutangHtml += `
                  <div class="col-md-6">
                      <div class="p-2 bg-white border rounded">
                        <strong>${name}</strong><br>
                        <small>Total Hutang: <span class="${colorClass} fw-bold">${formatCurrency(status.total_hutang_saat_ini)}</span></small><br>
                        <small class="text-muted" style="font-size:0.8em">Terakhir dibayar: ${status.terakhir_dibayar}</small>
                      </div>
                  </div>
                `;
      }
      hutangHtml += `</div></div>`;
    }
    // ---------------------------------------------------

    let rincianHtml = '';
    const suppliers = Object.keys(data.rincian_per_supplier);

    if (suppliers.length === 0) {
      rincianHtml = '<p class="text-center text-muted">Tidak ada rincian produk untuk laporan ini.</p>';
    } else {
      suppliers.forEach(supplierName => {
        const products = data.rincian_per_supplier[supplierName];
        let supplierSubtotal = 0;

        rincianHtml += `
                      <h5 class="mt-4">${supplierName}</h5>
                      <table class="table table-sm table-bordered">
                          <thead class="table-light">
                              <tr class="heading">
                                  <td>No.</td>
                                  <td>Produk</td>
                                  <td class="text-center">Stok Awal</td>
                                  <td class="text-center">Stok Akhir</td>
                                  <td class="text-center">Terjual</td>
                                  <td class="text-end">Subtotal</td>
                              </tr>
                          </thead>
                          <tbody>
                  `;

        products.forEach((p, index) => {
          supplierSubtotal += p.total_pendapatan;
          rincianHtml += `
                          <tr class="item">
                              <td>${index + 1}</td>
                              <td>${p.nama_produk}</td>
                              <td class="text-center">${p.stok_awal}</td>
                              <td class="text-center">${p.stok_akhir}</td>
                              <td class="text-center">${p.terjual}</td>
                              <td class="text-end">${formatCurrency(p.total_pendapatan)}</td>
                          </tr>
                      `;
        });

        rincianHtml += `
                          <tr class="total">
                              <td colspan="5" class="text-end fw-bold">Subtotal ${supplierName}</td>
                              <td class="text-end fw-bold">${formatCurrency(supplierSubtotal)}</td>
                          </tr>
                          </tbody>
                      </table>
                  `;
      });
    }
    const compareHtml = `
              <tr><td>Terjual (Cash)</td><td class="text-end">${formatCurrency(data.rekap_otomatis.terjual_cash)}</td><td class="text-end">${formatCurrency(data.rekap_manual.terjual_cash)}</td></tr>
              <tr><td>Terjual (QRIS)</td><td class="text-end">${formatCurrency(data.rekap_otomatis.terjual_qris)}</td><td class="text-end">${formatCurrency(data.rekap_manual.terjual_qris)}</td></tr>
              <tr><td>Terjual (BCA)</td><td class="text-end">${formatCurrency(data.rekap_otomatis.terjual_bca)}</td><td class="text-end">${formatCurrency(data.rekap_manual.terjual_bca)}</td></tr>
              <tr class="fw-bold"><td>Total Produk Terjual</td><td class="text-end">${data.rekap_otomatis.total_produk_terjual} Pcs</td><td class="text-end">${data.rekap_manual.total_produk_terjual} Pcs</td></tr>
              <tr class="fw-bold table-group-divider"><td>Total Pendapatan</td><td class="text-end">${formatCurrency(data.rekap_otomatis.total_pendapatan)}</td><td class="text-end">${formatCurrency(data.rekap_manual.total_pendapatan)}</td></tr>
            `;

    container.innerHTML = `
              <table>
                <tr class="top"><td colspan="2"><table><tr><td class="title"><h4>Laporan Penjualan</h4></td><td style="text-align: right;">ID Laporan: #${data.id}<br>Tanggal: ${data.tanggal}<br>Status: ${data.status}</td></tr></table></td></tr>
                <tr class="information"><td colspan="2"><table><tr><td>Lapak: <strong>${data.lokasi}</strong><br>Penanggung Jawab:<br>${data.penanggung_jawab}</td></tr></table></td></tr>
              </table>
              
              ${hutangHtml} ${rincianHtml}
              
              <table class="mt-4">
                 <tr class="total"><td class="text-end fw-bold">Total Pendapatan (Sistem)</td><td class="text-end fw-bold" style="width:25%">${formatCurrency(data.rekap_otomatis.total_pendapatan)}</td></tr>
                 <tr class="total"><td class="text-end fw-bold">Total Biaya Supplier</td><td class="text-end fw-bold" style="width:25%">${formatCurrency(data.rekap_otomatis.total_biaya_supplier)}</td></tr>
              </table>
              <h5 class="mt-5 mb-3">Perbandingan Rekapitulasi</h5>
              <table class="table table-bordered"><thead class="table-light"><tr><th>Deskripsi</th><th class="text-end">Otomatis (Sistem)</th><th class="text-end">Manual (Karyawan)</th></tr></thead><tbody>${compareHtml}</tbody></table>
            `;
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}
async function downloadReportAsPDF() {
  const sourceElement = document.getElementById("invoice-content");

  // 1. Ambil ID Laporan untuk nama file
  let reportId = "unknown";
  try {
    reportId = sourceElement
      .querySelector('td[style="text-align: right;"]')
      .innerText.split("\n")[0]
      .split("#")[1] || "unknown";
  } catch (e) {
    console.warn("Gagal mengambil ID laporan untuk nama file");
  }

  // 2. Tombol loading feedback
  const btn = document.querySelector('#report-detail-modal .btn-primary');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sedang memproses...';
  btn.disabled = true;

  try {
    // 3. KLONING elemen laporan & Setup Ghost Container
    const clonedElement = sourceElement.cloneNode(true);
    const ghostContainer = document.createElement('div');
    ghostContainer.id = "pdf-ghost-container";
    ghostContainer.style.position = 'absolute';
    ghostContainer.style.top = '-9999px';
    ghostContainer.style.left = '-9999px';
    ghostContainer.style.width = '210mm'; // Lebar kertas A4
    ghostContainer.style.padding = '20px';
    ghostContainer.style.backgroundColor = '#ffffff';
    ghostContainer.style.zIndex = '-100';

    // Hapus minHeight agar container menyesuaikan panjang konten sebenarnya
    ghostContainer.style.height = 'auto';

    clonedElement.style.maxWidth = '100%';
    clonedElement.style.width = '100%';

    ghostContainer.appendChild(clonedElement);
    document.body.appendChild(ghostContainer);

    // 4. Ambil gambar dari Ghost Container
    const canvas = await html2canvas(ghostContainer, {
      scale: 2,
      useCORS: true,
      // Pastikan canvas menangkap seluruh tinggi scroll
      windowHeight: ghostContainer.scrollHeight + 100
    });

    // 5. Generate PDF Multi-Halaman
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Hitung tinggi gambar proporsional di PDF
    const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

    let heightLeft = imgHeight;
    let position = 0;

    // Cetak halaman pertama
    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
    heightLeft -= pageHeight;

    // Loop: Jika sisa tinggi gambar masih ada, buat halaman baru
    while (heightLeft > 0) {
      position -= pageHeight; // Geser gambar ke atas (koordinat negatif)
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`laporan-harian-${reportId}.pdf`);

    // 6. Bersihkan wadah sementara
    document.body.removeChild(ghostContainer);
    showToast("PDF berhasil diunduh.", true);

  } catch (error) {
    console.error(error);
    showToast("Gagal mengunduh PDF: " + error.message, false);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}
async function populateLaporanPendapatan() {
  const date = document.getElementById(
    "laporan-pendapatan-datepicker"
  ).value;
  const accordionEl = document.getElementById(
    "laporan-pendapatan-accordion"
  );
  accordionEl.innerHTML = `<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>`;
  try {
    const resp = await fetch(
      `/api/get_laporan_pendapatan_harian?date=${date}`
    );
    if (!resp.ok) throw new Error("Gagal mengambil data");
    const data = await resp.json();
    document.getElementById("total-pendapatan-harian").textContent =
      formatCurrency(data.total_harian);
    accordionEl.innerHTML = "";
    if (data.laporan_per_lapak.length === 0) {
      accordionEl.innerHTML =
        '<div class="alert alert-warning text-center">Tidak ada laporan untuk tanggal ini.</div>';
    } else {
      data.laporan_per_lapak.forEach((lapak, index) => {
        const productList = lapak.rincian_pendapatan
          .map(
            (p) =>
              `<li class="list-group-item d-flex justify-content-between"><div>${p.produk} <small class="text-muted">(${p.supplier})</small></div><div><span class="badge text-bg-light me-2">Awal: ${p.stok_awal}</span><span class="badge text-bg-light me-2">Akhir: ${p.stok_akhir}</span><span class="badge bg-primary rounded-pill">${p.jumlah} Pcs</span></div></li>`
          )
          .join("");
        accordionEl.innerHTML += `<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button ${index !== 0 ? "collapsed" : ""
          }" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-lp-${index}"><strong>${lapak.lokasi
          }</strong> <span class="ms-auto me-3">${formatCurrency(
            lapak.total_pendapatan
          )}</span></button></h2><div id="collapse-lp-${index}" class="accordion-collapse collapse ${index === 0 ? "show" : ""
          }"><div class="accordion-body"><p>PJ: <strong>${lapak.penanggung_jawab
          }</strong></p><ul class="list-group list-group-flush">${productList}</ul></div></div></div>`;
      });
    }
  } catch (error) {
    accordionEl.innerHTML =
      '<div class="alert alert-danger text-center">Gagal memuat.</div>';
  }
}
async function populateLaporanBiaya() {
  const date = document.getElementById("laporan-biaya-datepicker").value;
  const accordionEl = document.getElementById("laporan-biaya-accordion");
  accordionEl.innerHTML = `<div class="text-center p-5"><div class="spinner-border text-warning"></div></div>`;
  try {
    const resp = await fetch(
      `/api/get_laporan_biaya_harian?date=${date}`
    );
    if (!resp.ok) throw new Error("Gagal mengambil data");
    const data = await resp.json();
    document.getElementById("total-biaya-harian").textContent =
      formatCurrency(data.total_harian);
    accordionEl.innerHTML = "";
    if (data.laporan_per_lapak.length === 0) {
      accordionEl.innerHTML =
        '<div class="alert alert-warning text-center">Tidak ada laporan untuk tanggal ini.</div>';
    } else {
      data.laporan_per_lapak.forEach((lapak, index) => {
        const productList = lapak.rincian_biaya
          .map(
            (p) =>
              `<li class="list-group-item d-flex justify-content-between"><div>${p.produk
              } <small class="text-muted">(${p.supplier
              })</small></div><div><span class="badge bg-primary rounded-pill me-2">${p.jumlah
              } Pcs</span><span class="fw-bold">${formatCurrency(
                p.biaya
              )}</span></div></li>`
          )
          .join("");
        accordionEl.innerHTML += `<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button ${index !== 0 ? "collapsed" : ""
          }" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-lb-${index}"><strong>${lapak.lokasi
          }</strong> <span class="ms-auto me-3">${formatCurrency(
            lapak.total_biaya
          )}</span></button></h2><div id="collapse-lb-${index}" class="accordion-collapse collapse ${index === 0 ? "show" : ""
          }"><div class="accordion-body"><p>PJ: <strong>${lapak.penanggung_jawab
          }</strong></p><ul class="list-group list-group-flush">${productList}</ul></div></div></div>`;
      });
    }
  } catch (error) {
    accordionEl.innerHTML =
      '<div class="alert alert-danger text-center">Gagal memuat.</div>';
  }
}
// (Ganti fungsi lama di baris 2017 dengan ini)
async function populateManageReportsPage() {
  const loadingEl = document.getElementById("manage-reports-loading"),
    contentEl = document.getElementById("manage-reports-content"),
    tableBody = document.getElementById("unconfirmed-reports-table-body"),
    supplierSelect = document.getElementById('manage-reports-supplier-filter');

  // (Logika pengisian dropdown supplier tetap sama)
  if (supplierSelect.options.length <= 1) {
    if (AppState.ownerData && AppState.ownerData.supplier_data) {
      AppState.ownerData.supplier_data.forEach(s => {
        supplierSelect.innerHTML += `<option value="${s.id}">${s.nama_supplier}</option>`;
      });
    }
  }
  loadingEl.style.display = "block";
  contentEl.style.display = "none";

  // === LOGIKA FILTER BARU DIMULAI DI SINI ===
  // (Sekitar baris 2035 di index.html)
  // === LOGIKA FILTER BARU DIMULAI DI SINI ===
  const params = new URLSearchParams();
  const ownerId = AppState.currentUser.user_info.id;
  params.append('owner_id', ownerId);
  const supplierId = supplierSelect.value;
  const status = document.getElementById('manage-reports-status-filter').value; // <-- BACA FILTER STATUS

  if (supplierId) params.append('supplier_id', supplierId);
  if (status) params.append('status', status); // <-- KIRIM FILTER STATUS

  const advancedFilterEl = document.getElementById('advanced-reports-filter');
  const isAdvanced = advancedFilterEl.classList.contains('show');
  let startDate, endDate;

  if (isAdvanced) {
    // 1. Gunakan filter canggih (rentang tanggal)
    startDate = document.getElementById('manage-reports-start-date').value;
    endDate = document.getElementById('manage-reports-end-date').value;
  } else {
    // 2. Gunakan filter harian
    const dailyDate = document.getElementById('manage-reports-daily-date').value;
    startDate = dailyDate;
    endDate = dailyDate;
  }

  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  // === LOGIKA FILTER BARU SELESAI ===

  try {
    const resp = await fetch(`/api/get_manage_reports?${params.toString()}`);
    const result = await resp.json();
    // (Sisa dari fungsi ini (try...catch...finally) tetap sama seperti file Anda)
    // ... (Bagian fetch data di atas tetap sama) ...

    if (result.success) {
      const container = document.getElementById("report-list-container"); // Gunakan ID baru

      if (result.reports.length === 0) {
        container.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-clipboard-x text-muted" style="font-size: 3rem;"></i>
        <p class="text-muted mt-3">Tidak ada laporan yang cocok.</p>
      </div>`;
      } else {
        // Render format Kartu
        container.innerHTML = result.reports.map((r) => {
          // Tentukan Status untuk styling
          const isPending = r.status === 'Menunggu Konfirmasi';
          const statusClass = isPending ? 'status-pending' : 'status-confirmed';
          const statusIcon = isPending ? '<i class="bi bi-hourglass-split"></i>' : '<i class="bi bi-check-circle-fill"></i>';
          const statusTextClass = isPending ? 'text-warning' : 'text-success';

          // Format Tanggal
          const dateObj = new Date(r.tanggal);
          const dateStr = dateObj.toLocaleDateString("id-ID", { day: 'numeric', month: 'short' });

          // Tombol Aksi
          // Tombol Konfirmasi hanya aktif jika status masih menunggu
          const confirmButton = isPending
            ? `<button class="btn btn-primary flex-grow-1" onclick="confirmReport(${r.id})">
             <i class="bi bi-check-lg me-1"></i> Konfirmasi
           </button>`
            : `<button class="btn btn-outline-secondary flex-grow-1" disabled>
             <i class="bi bi-check-all me-1"></i> Diterima
           </button>`;

          const profitOwnerHtml = r.status === 'Terkonfirmasi'
            ? `<span class="report-profit"><i class="bi bi-graph-up-arrow me-1"></i>Profit: ${formatCurrency(r.keuntungan_owner)}</span>`
            : `<span class="badge bg-secondary">Profit belum hitung</span>`;

          return `
        <div class="report-mobile-card ${statusClass}">
          <div class="report-card-header">
            <div>
              <strong class="text-primary" style="font-size: 1.05rem;">${r.lokasi}</strong>
              <div class="small text-muted">${r.penanggung_jawab}</div>
            </div>
            <div class="text-end">
              <div class="fw-bold">${dateStr}</div>
              <small class="${statusTextClass} fw-bold" style="font-size: 0.75rem;">
                ${statusIcon} ${r.status === 'Menunggu Konfirmasi' ? 'Menunggu' : 'Selesai'}
              </small>
            </div>
          </div>
          
          <div class="report-card-body">
            <div class="d-flex justify-content-between align-items-end mb-2">
              <div>
                <small class="text-muted d-block text-uppercase" style="font-size: 0.7rem; letter-spacing: 0.5px;">Total Pendapatan</small>
                <div class="report-amount">${formatCurrency(r.total_pendapatan)}</div>
              </div>
              <div class="text-end">
                 ${profitOwnerHtml}
              </div>
            </div>
          </div>

          <div class="report-card-footer">
            <button class="btn btn-outline-info" style="width: 50px;" onclick="showReportDetails(${r.id})">
              <i class="bi bi-eye-fill"></i>
            </button>
            ${confirmButton}
          </div>
        </div>
      `;
        }).join("");
      }

      contentEl.style.display = "block";
    } else { throw new Error(result.message); }
  } catch (error) {
    loadingEl.innerHTML = `<div class="alert alert-danger">${error.message || "Gagal memuat"}</div>`;
  } finally {
    loadingEl.style.display = "none";
  }
}
// (Ganti fungsi lama di baris 2088)
async function confirmReport(reportId) {
  if (
    !confirm(
      "Apakah Anda yakin ingin mengkonfirmasi laporan ini? Tindakan ini akan menghitung profit dan memperbarui saldo tagihan supplier."
    )
  )
    return;
  try {
    // === PERBAIKAN DI SINI: Kirim ID Owner ===
    const ownerId = AppState.currentUser.user_info.id;
    const resp = await fetch(`/api/confirm_report/${reportId}`, {
      method: "POST",
      // Tambahkan body yang mengirim owner_id
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_id: ownerId })
    });
    // === AKHIR PERBAIKAN ===

    const result = await resp.json();
    showToast(result.message, result.success);
    if (result.success) {
      await populateManageReportsPage();
      await populateOwnerDashboard(); // Refresh KPI card juga
    }
  } catch (e) {
    showToast("Gagal terhubung ke server.", false);
  }
}

async function openEditModal(type, id = null) {
  const isEdit = id !== null;
  let data = {};
  if (isEdit) {
    const dataArray = AppState.ownerData[`${type}_data`];
    data = dataArray.find((item) => item.id === id);
    if (!data) return showToast("Data tidak ditemukan.", false);
  }
  if (type === "admin") {
    const form = document.getElementById("edit-admin-form");
    form.reset();
    document.getElementById("admin-modal-title").textContent = isEdit
      ? "Edit Admin"
      : "Tambah Admin Baru";
    document.getElementById("edit-admin-id").value = id || "";
    if (isEdit) {
      document.getElementById("edit-admin-nama").value =
        data.nama_lengkap;
      document.getElementById("edit-admin-username").value =
        data.username;
      document.getElementById("edit-admin-email").value = data.email;
      document.getElementById("edit-admin-kontak").value =
        data.nomor_kontak;
    }
    modals.admin.show();
  } else if (type === "lapak") {
    const form = document.getElementById("edit-lapak-form");
    form.reset();
    document.getElementById("lapak-modal-title").textContent = isEdit
      ? "Edit Lapak"
      : "Tambah Lapak Baru";
    document.getElementById("edit-lapak-id").value = id || "";

    const pjSelect = document.getElementById("lapak-pj-select");
    const anggotaContainer = document.getElementById(
      "lapak-anggota-selection"
    );
    pjSelect.innerHTML =
      '<option value="" selected disabled>-- Pilih PJ --</option>' +
      AppState.ownerData.admin_data
        .map((a) => `<option value="${a.id}">${a.nama_lengkap}</option>`)
        .join("");
    anggotaContainer.innerHTML = AppState.ownerData.admin_data
      .map(
        (a) =>
          `<div class="form-check"><input class="form-check-input" type="checkbox" value="${a.id}" id="anggota-${a.id}"><label class="form-check-label" for="anggota-${a.id}">${a.nama_lengkap}</label></div>`
      )
      .join("");

    if (isEdit) {
      document.getElementById("edit-lapak-lokasi").value = data.lokasi;
      pjSelect.value = data.user_id;
      data.anggota_ids.forEach((anggotaId) => {
        const checkbox = document.getElementById(`anggota-${anggotaId}`);
        if (checkbox) checkbox.checked = true;
      });
    }
    modals.lapak.show();
  } else if (type === "supplier") {
    const form = document.getElementById("edit-supplier-form");
    form.reset();
    document.getElementById("supplier-modal-title").textContent = isEdit ? "Edit Supplier" : "Tambah Supplier Baru";
    document.getElementById("edit-supplier-id").value = id || "";

    // BARIS PENTING: Tidak ada lagi yang disembunyikan. Semua field selalu terlihat.

    // Isi data dasar supplier
    if (isEdit) {
      document.getElementById("edit-supplier-nama").value = data.nama_supplier;
      document.getElementById("edit-supplier-username").value = data.username;
      document.getElementById("edit-supplier-kontak").value = data.kontak;
      document.getElementById("edit-supplier-register").value = data.nomor_register;
      document.getElementById("edit-supplier-alamat").value = data.alamat;
      document.getElementById("edit-supplier-metode").value = data.metode_pembayaran;
      document.getElementById("edit-supplier-rekening").value = data.nomor_rekening;
    } else {
      // Dapatkan nomor register baru untuk supplier baru
      // REVISI: Kirim ID Owner yang sedang login
      const ownerId = AppState.currentUser.user_info.id;
      const resp = await fetch(`/api/get_next_supplier_reg_number/${ownerId}`);

      const result = await resp.json();
      document.getElementById("edit-supplier-register").value = result.reg_number;
    }

    modals.supplier.show();
  }
}
// GANTI FUNGSI LAMA DENGAN VERSI BARU INI
async function handleFormSubmit(type, e) {
  e.preventDefault();
  const form = e.target;
  const id = form.querySelector(`input[type=hidden]`).value;
  const isEdit = id !== "";
  let url = isEdit ? `/api/update_${type}/${id}` : `/api/add_${type}`;
  let method = isEdit ? "PUT" : "POST";
  let payload = {};
  if (type === "admin") {
    const password = form.elements["edit-admin-password"].value;
    if (password && password !== form.elements["edit-admin-password-confirm"].value) {
      return showToast("Password dan konfirmasi tidak cocok.", false);
    }
    payload = {
      nama_lengkap: form.elements["edit-admin-nama"].value,
      username: form.elements["edit-admin-username"].value,
      email: form.elements["edit-admin-email"].value,
      nomor_kontak: form.elements["edit-admin-kontak"].value,
      password: password,
      password_confirm: form.elements["edit-admin-password-confirm"].value,
      // ==========================================================
      // ===           INILAH PERBAIKAN UTAMANYA              ===
      // ==========================================================
      // Pastikan kita selalu mengirim ID Owner yang sedang membuat admin
      created_by_owner_id: AppState.currentUser.user_info.id
      // ==========================================================
    };
  } else if (type === "lapak") {
    const anggota_ids = Array.from(
      form.querySelectorAll("#lapak-anggota-selection input:checked")
    ).map((cb) => cb.value);
    payload = {
      lokasi: form.elements["edit-lapak-lokasi"].value,
      user_id: form.elements["lapak-pj-select"].value,
      anggota_ids,
      owner_id: AppState.currentUser.user_info.id,
    };
  } else if (type === "supplier") {
    const password = form.elements["edit-supplier-password"].value;
    if (password && password !== form.elements["edit-supplier-password-confirm"].value)
      return showToast("Password dan konfirmasi tidak cocok.", false);

    payload = {
      nama_supplier: form.elements["edit-supplier-nama"].value,
      username: form.elements["edit-supplier-username"].value,
      kontak: form.elements["edit-supplier-kontak"].value,
      nomor_register: form.elements["edit-supplier-register"].value,
      alamat: form.elements["edit-supplier-alamat"].value,
      password,
      password_confirm: form.elements["edit-supplier-password-confirm"].value,
      metode_pembayaran: form.elements["edit-supplier-metode"].value,
      nomor_rekening: form.elements["edit-supplier-rekening"].value,
      owner_id: AppState.currentUser.user_info.id,
    };
  }
  const resp = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await resp.json();
  showToast(result.message, resp.ok);
  if (resp.ok) {
    modals[type].hide();
    await populateOwnerDashboard();
  }
}
async function handleDelete(type, id) {
  if (
    !confirm(
      `Apakah Anda yakin ingin menghapus data ini? Tindakan ini tidak dapat dibatalkan.`
    )
  )
    return;
  const resp = await fetch(`/api/delete_${type}/${id}`, {
    method: "DELETE",
  });
  const result = await resp.json();
  showToast(result.message, resp.ok);
  if (resp.ok) await populateOwnerDashboard();
}
// GANTI FUNGSI LAMA DENGAN VERSI BARU INI
async function populateVerificationCenter() {
  const loadingEl = document.getElementById('verification-center-loading');
  const contentEl = document.getElementById('verification-center-content');
  const listEl = document.getElementById('verification-report-list');

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';

  try {
    const ownerId = AppState.currentUser.user_info.id;
    const resp = await fetch(`/api/get_owner_verification_reports/${ownerId}`);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);

    if (result.reports.length === 0) {
      listEl.innerHTML = `<div class="list-group-item text-center text-muted p-4">Tidak ada laporan baru yang perlu diverifikasi.</div>`;
      contentEl.querySelector('button').disabled = true;
    } else {
      // PERUBAHAN DI SINI: Tambahkan 'data-report-id'
      listEl.innerHTML = result.reports.map(r => `
              <div class="list-group-item d-flex justify-content-between align-items-center" data-report-id="${r.id}">
                <div>
                  <strong>Laporan dari ${r.lokasi}</strong>
                  <small class="d-block text-muted">Tanggal: ${r.tanggal} | Total: ${formatCurrency(r.total_pendapatan)}</small>
                </div>
                <button class="btn btn-sm btn-outline-info" onclick="showReportDetails(${r.id})">
                    <i class="bi bi-eye-fill"></i> Lihat Detail
                </button>
              </div>
            `).join('');
      contentEl.querySelector('button').disabled = false;
    }
    contentEl.style.display = 'block';
  } catch (e) {
    loadingEl.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  } finally {
    loadingEl.style.display = 'none';
  }
}

// GANTI FUNGSI LAMA DENGAN VERSI BARU INI
async function handleFinalizeReports() {
  const reportItems = document.querySelectorAll('#verification-report-list .list-group-item');
  const reportIds = Array.from(reportItems).map(item => item.dataset.reportId).filter(id => id);

  if (reportIds.length === 0) {
    return showToast("Tidak ada laporan untuk difinalisasi.", false);
  }

  if (!confirm(`Anda akan memfinalisasi ${reportIds.length} laporan. Setelah difinalisasi, laporan akan dikonfirmasi dan profit akan dibagikan. Lanjutkan?`)) return;

  const button = document.querySelector('#verification-center-content button');
  const originalBtnHTML = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Memproses...`;

  try {
    const ownerId = AppState.currentUser.user_info.id;
    const resp = await fetch('/api/finalize_reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_ids: reportIds, owner_id: ownerId })
    });
    const result = await resp.json();
    showToast(result.message, result.success);

    if (result.success) {
      // Kembali ke dashboard utama setelah berhasil
      showPage('owner-dashboard');
    }
  } catch (e) {
    showToast('Gagal terhubung ke server.', false);
  } finally {
    button.disabled = false;
    button.innerHTML = originalBtnHTML;
  }
}

// (Ganti fungsi lama di baris 2088 dengan ini)
async function populatePembayaranPage() {
  const loadingEl = document.getElementById("pembayaran-content-loading"),
    mainEl = document.getElementById("pembayaran-content-main");
  const tableBody = document.getElementById("pembayaran-table-body");
  const filterMetode = document.getElementById('tagihan-metode-filter').value; // <-- BACA FILTER

  loadingEl.style.display = "block";
  mainEl.style.display = "none";

  try {
    // === PERBAIKAN: Kirim owner_id ===
    const ownerId = AppState.currentUser.user_info.id;
    const resp = await fetch(`/api/get_pembayaran_data?owner_id=${ownerId}`);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);

    tableBody.innerHTML = "";

    // Terapkan filter metode pembayaran
    const filteredBalances = result.supplier_balances.filter(item =>
      filterMetode === 'semua' || item.metode_pembayaran === filterMetode
    );

    // ... (kode atas tetap sama) ...

    if (filteredBalances.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Tidak ada tagihan yang cocok.</td></tr>';
    } else {
      filteredBalances.forEach((item) => {
        // 1. Tentukan Logika Payable
        let isPayable;
        if (item.metode_pembayaran === 'BCA') {
          isPayable = item.total_tagihan > 0.01;
        } else {
          isPayable = item.total_tagihan >= 20000;
        }

        // 2. Buat Tombol View (Mata)
        const viewBtn = `<button class="btn btn-sm btn-outline-info" onclick="showBillDetails(${item.supplier_id}, '${item.nama_supplier}', ${item.total_tagihan})"><i class="bi bi-eye"></i></button>`;

        // 3. Tentukan Status Badge & Tombol Aksi Utama
        const isPaid = item.total_tagihan < 0.01;
        let statusBadge, mainActionBtn; // Gunakan nama variabel baru untuk tombol utama

        if (isPaid) {
          statusBadge = `<span class="badge bg-light text-dark">Lunas</span>`;
          mainActionBtn = `<button class="btn btn-sm btn-secondary" disabled>Lunas</button>`;
        } else if (isPayable) {
          statusBadge = `<span class="badge bg-success">Siap Bayar</span>`;
          mainActionBtn = `<button class="btn btn-sm btn-primary" onclick='openPaymentModal(${item.supplier_id}, "${item.nama_supplier}", ${item.total_tagihan})'>Bayar Tagihan</button>`;
        } else {
          statusBadge = `<span class="badge bg-warning text-dark">Akumulasi</span>`;
          mainActionBtn = `<button class="btn btn-sm btn-secondary" disabled>Dibawah Minimum</button>`;
        }

        // 4. GABUNGKAN TOMBOL (View + Main Action)
        // Kita gabungkan di sini SETELAH mainActionBtn punya nilai
        const finalActionBtn = `<div class="btn-group">${viewBtn}${mainActionBtn}</div>`;

        // 5. Tampilkan tanggal tagihan masuk
        const tanggalMasukHtml = item.tanggal_masuk
          ? `<small class="d-block text-danger" style="font-size: 0.8em;">Tagihan sejak: ${new Date(item.tanggal_masuk + 'T00:00:00').toLocaleDateString('id-ID')}</small>`
          : '';

        // 6. Render Tabel
        tableBody.innerHTML += `<tr>
            <td>
              ${item.nama_supplier}
              <small class="d-block text-muted">${item.metode_pembayaran} - ${item.nomor_rekening}</small>
              ${tanggalMasukHtml}
            </td>
            <td class="fw-bold">${formatCurrency(item.total_tagihan)}</td>
            <td>${statusBadge}</td>
            <td>${finalActionBtn}</td></tr>`; // Gunakan finalActionBtn
      });
    }

    // ... (kode bawah tetap sama) ...

    loadingEl.style.display = "none";
    mainEl.style.display = "block";

    await populatePaymentHistory();
  } catch (e) {
    showToast(e.message, false);
    loadingEl.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

// 1. Fungsi Helper untuk merender HTML Akumulasi Harian
async function renderBillBreakdown(supplierId, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-secondary"></div><div class="small text-muted">Mengambil data akumulasi...</div></div>`;

  try {
    const resp = await fetch(`/api/get_supplier_bill_breakdown/${supplierId}`);
    const result = await resp.json();

    if (!result.success || result.breakdown.length === 0) {
      container.innerHTML = `<div class="text-center text-muted small py-3">Belum ada data tagihan bulan ini.</div>`;
      return;
    }

    let html = '<ul class="list-group list-group-flush small">';

    result.breakdown.forEach(day => {
      // Header Tanggal
      html += `
                    <li class="list-group-item bg-light fw-bold d-flex justify-content-between align-items-center px-2 py-1 mt-2">
                        <span><i class="bi bi-calendar-event me-1"></i> ${day.tanggal_formatted}</span>
                        <span class="text-dark">${formatCurrency(day.total_hari_ini)}</span>
                    </li>
                `;

      // Rincian per Admin/Lapak
      day.items.forEach(item => {
        html += `
                        <li class="list-group-item d-flex justify-content-between align-items-center px-2 py-1 border-0">
                            <span class="ps-3 text-muted"><i class="bi bi-shop me-1"></i> ${item.lokasi} <span style="font-size:0.75em">(${item.pj})</span></span>
                            <span>${formatCurrency(item.nominal)}</span>
                        </li>
                    `;
      });
    });
    html += '</ul>';
    container.innerHTML = html;

  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger small p-1">Gagal memuat rincian.</div>`;
  }
}

// 2. Fungsi Tombol Mata (Lihat Saja)
function showBillDetails(supplierId, supplierName, amount) {
  document.getElementById('detail-supplier-name').textContent = `Tagihan: ${supplierName}`;

  // Setup tombol "Bayar Sekarang" di dalam modal detail agar user bisa langsung bayar
  const payBtn = document.getElementById('btn-pay-from-detail');
  payBtn.onclick = function () {
    modals.billDetail.hide();
    openPaymentModal(supplierId, supplierName, amount);
  };

  modals.billDetail.show();
  renderBillBreakdown(supplierId, 'bill-breakdown-container');
}

// 3. Update Fungsi openPaymentModal (Bayar & Lihat)
// GANTI fungsi openPaymentModal yang lama dengan ini:
async function openPaymentModal(supplierId, supplierName, amount) {
  const supplierData = AppState.ownerData.supplier_data.find(s => s.id === supplierId);

  if (!supplierData || !supplierData.metode_pembayaran) {
    return showToast("Info pembayaran supplier belum diatur.", false);
  }

  // Isi Info Kiri
  document.getElementById("payment-supplier-id").value = supplierId;
  document.getElementById("payment-supplier-amount").value = amount;
  document.getElementById("payment-supplier-name-confirm").textContent = supplierName;
  document.getElementById("payment-amount-confirm").textContent = formatCurrency(amount);
  document.getElementById("payment-method-info").textContent = `${supplierData.metode_pembayaran} - ${supplierData.nomor_rekening}`;

  modals.payment.show();

  // Render Info Kanan (Akumulasi Harian)
  renderBillBreakdown(supplierId, 'payment-modal-breakdown');
}

async function populatePaymentHistory() {
  const loadingEl = document.getElementById('payment-history-loading');
  const tableBody = document.getElementById('payment-history-table-body');
  loadingEl.style.display = 'block';
  tableBody.innerHTML = '';

  // (Sekitar baris 2154 di index.html)
  // === LOGIKA FILTER BARU DIMULAI DI SINI ===
  const params = new URLSearchParams();

  // === PERBAIKAN: Tambahkan owner_id ===
  const ownerId = AppState.currentUser.user_info.id;
  params.append('owner_id', ownerId);

  const metode = document.getElementById('payment-history-method').value;
  if (metode && metode !== 'semua') params.append('metode', metode);

  const advancedFilterEl = document.getElementById('advanced-payment-filter');
  const isAdvanced = advancedFilterEl.classList.contains('show');
  let startDate, endDate;

  if (isAdvanced) {
    startDate = document.getElementById('payment-history-start-date').value;
    endDate = document.getElementById('payment-history-end-date').value;
  } else {
    const dailyDate = document.getElementById('payment-history-daily-date').value;
    startDate = dailyDate;
    endDate = dailyDate;
  }

  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);

  try {
    const resp = await fetch(`/api/get_all_payment_history?${params.toString()}`);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);

    if (result.history.length === 0) {
      // Ganti colspan menjadi 5
      tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Tidak ada riwayat pembayaran.</td></tr>`;
    } else {
      tableBody.innerHTML = result.history.map(p => {
        // Logika baru untuk styling berdasarkan 'tipe'
        const keteranganBadge = p.tipe === 'tagihan'
          ? `<span class="badge bg-warning text-dark">${p.keterangan}</span>`
          : `<span class="badge bg-success">${p.keterangan}</span>`;

        const jumlahClass = p.tipe === 'tagihan' ? 'text-danger' : 'text-success';
        const jumlahPrefix = p.tipe === 'tagihan' ? '-' : '+';

        return `
          <tr>
            <td>${new Date(p.tanggal + 'T00:00:00').toLocaleDateString('id-ID')}</td>
            <td>${p.nama_supplier}</td>
            <td class="${jumlahClass} fw-bold">${jumlahPrefix}${formatCurrency(p.jumlah)}</td>
            <td><span class="badge bg-info">${p.metode}</span></td>
            <td>${keteranganBadge}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (e) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Gagal memuat: ${e.message}</td></tr>`;
  } finally {
    loadingEl.style.display = 'none';
  }
}


async function handlePaymentSubmit(e) {
  e.preventDefault();
  const payload = {
    supplier_id: document.getElementById("payment-supplier-id").value,
    jumlah_pembayaran: document.getElementById("payment-supplier-amount")
      .value,
  };
  const resp = await fetch("/api/submit_pembayaran", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await resp.json();
  showToast(result.message, resp.ok);
  if (resp.ok) {
    modals.payment.hide();
    await populatePembayaranPage();
    await populateOwnerDashboard();
  }
}

// --- LAPAK FUNCTIONS ---

// GANTI FUNGSI LAMA DENGAN VERSI BARU INI
async function openAturProdukModal() {
  const supplierContainer = document.getElementById("supplier-selection-container");
  const productContainer = document.getElementById("product-selection-container");
  const productAreaTitle = document.getElementById("product-area-title");
  const addProductForm = document.getElementById("add-product-form-container");
  const productSelectionArea = document.getElementById("product-selection-area");

  // Reset tampilan modal ke kondisi awal
  supplierContainer.innerHTML = '<div class="spinner-border spinner-border-sm"></div>';
  productContainer.innerHTML = '';
  productAreaTitle.innerHTML = '<p class="text-muted pt-3">Pilih satu supplier untuk melihat & menambah produk.</p>';
  addProductForm.style.display = 'none';
  productSelectionArea.style.display = 'none'; // Sembunyikan juga area produk

  modals.aturProduk.show();

  try {
    const resp = await fetch(`/api/get_data_buat_catatan/${AppState.currentUser.user_info.lapak_id}`);
    const result = await resp.json();
    if (!result.success) {
      if (result.already_exists) {
        modals.aturProduk.hide();
        showToast(result.message, false);
        document.getElementById("laporan-exists").style.display = "block";
        document.getElementById("laporan-content").style.display = "none";
      }
      throw new Error(result.message);
    }

    // Simpan daftar supplier
    AppState.masterData.suppliers = result.data;

    // ==========================================================
    // ===           INILAH PERBAIKAN UTAMANYA              ===
    // ==========================================================
    // Saat mengumpulkan produk, kita juga 'mencatat' supplier_id untuk setiap produk.
    AppState.masterData.products = result.data.flatMap(supplier =>
      supplier.products.map(product => ({
        ...product, // Salin semua data produk (id, name, harga)
        supplier_id: supplier.id // Tambahkan properti supplier_id
      }))
    );
    // ==========================================================

    // Tampilkan daftar supplier sebagai radio button
    supplierContainer.innerHTML = AppState.masterData.suppliers.map(s => `
              <label class="list-group-item">
                <input class="form-check-input me-2 supplier-radio" type="radio" name="supplierSelection" value="${s.id}">
                ${s.name}
              </label>
            `).join('');

    // Tambahkan event listener ke setiap radio button supplier
    document.querySelectorAll('.supplier-radio').forEach(radio => {
      radio.addEventListener('change', updateProductSelection);
    });

  } catch (e) {
    supplierContainer.innerHTML = `<div class="alert alert-danger p-2 small">${e.message}</div>`;
  }
}

function updateProductSelection(event) {
  const supplierId = parseInt(event.target.value);
  const productContainer = document.getElementById("product-selection-container");
  const productAreaTitle = document.getElementById("product-area-title");
  const addProductForm = document.getElementById("add-product-form-container");
  const productSelectionArea = document.getElementById("product-selection-area");
  const searchInput = document.getElementById("modal-product-search-input");

  const selectedSupplier = AppState.masterData.suppliers.find(s => s.id === supplierId);
  productAreaTitle.innerHTML = `<h6>Produk dari: <strong>${selectedSupplier.name}</strong></h6>`;
  addProductForm.style.display = 'block';
  productSelectionArea.style.display = 'block';
  searchInput.value = '';

  const renderProducts = (searchTerm = "") => {
    const productsOfSupplier = AppState.masterData.products.filter(p =>
      p.supplier_id === supplierId && p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (productsOfSupplier.length === 0) {
      productContainer.innerHTML = '<p class="text-muted small p-2">Belum ada produk...</p>';
    } else {
      productContainer.innerHTML = productsOfSupplier.map(p => `
              <div class="input-group input-group-sm mb-2">
                  <div class="input-group-text">
                      <input class="form-check-input mt-0 product-checkbox" type="checkbox" value="${p.id}" id="modal-product-${p.id}">
                  </div>
                  <label for="modal-product-${p.id}" class="form-control d-flex justify-content-between align-items-center">
                    <span>${p.name}</span>
                    <span class="badge bg-light text-dark border">Beli: ${p.harga_beli} | Jual: ${p.harga_jual}</span>
                  </label>
                  
                  <button class="btn btn-outline-secondary" type="button" onclick="openEditProductModal(${p.id})">
                    <i class="bi bi-pencil"></i>
                  </button>

                  <input type="number" class="form-control form-control-sm text-center modal-stok-awal" placeholder="Stok Awal" style="max-width: 80px;" disabled>
              </div>
          `).join('');
    }
  };

  renderProducts();
  searchInput.oninput = () => renderProducts(searchInput.value);

  productContainer.onclick = function (e) {
    if (e.target.classList.contains('product-checkbox')) {
      const stokInput = e.target.closest('.input-group').querySelector('.modal-stok-awal');
      stokInput.disabled = !e.target.checked;
      if (!e.target.checked) stokInput.value = '';
    }
  };
}

async function handleAddNewProduct(e) {
  e.preventDefault();

  // 1. Ambil nilai dari input (Perhatikan ID elemennya)
  const productName = document.getElementById("new-product-name-input").value.trim();

  // ID "new-product-price-input" adalah input lama (Harga Jual)
  // Kita namakan variabelnya productSellPrice agar jelas
  const productSellPrice = document.getElementById("new-product-price-input").value.trim();

  // ID "new-product-buy-price-input" adalah input baru (Harga Beli)
  const productBuyPrice = document.getElementById("new-product-buy-price-input").value.trim();

  const selectedSupplierRadio = document.querySelector('.supplier-radio:checked');

  // 2. Validasi kelengkapan data
  if (!productName || !selectedSupplierRadio || !productSellPrice || !productBuyPrice) {
    return showToast("Semua field (Nama, Harga Beli, Harga Jual) harus diisi.", false);
  }

  const supplierId = parseInt(selectedSupplierRadio.value);
  const lapakId = AppState.currentUser.user_info.lapak_id;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  try {
    // 3. Kirim ke Backend
    const resp = await fetch('/api/add_manual_product_to_supplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nama_produk: productName,
        harga_jual: productSellPrice, // Pastikan variabel ini sama dengan yang dideklarasikan di atas
        harga_beli: productBuyPrice,  // Kirim harga beli
        supplier_id: supplierId,
        lapak_id: lapakId
      })
    });
    const result = await resp.json();
    showToast(result.message, result.success);

    if (result.success) {
      // 4. Update State Lokal (Agar langsung muncul tanpa refresh)
    const newProductEntry = {
          id: result.product.id,
          name: result.product.name,
          // Pastikan supplier_id ada (ambil dari result atau variable lokal)
          supplier_id: result.product.supplier_id || supplierId, 
          harga_beli: parseFloat(result.product.harga_beli),
          harga_jual: parseFloat(result.product.harga_jual)
      };

      AppState.masterData.products.push(result.product);

      // 5. Reset Form
      document.getElementById("new-product-name-input").value = '';
      document.getElementById("new-product-price-input").value = '';     // Reset Harga Jual
      document.getElementById("new-product-buy-price-input").value = ''; // Reset Harga Beli

      // 6. Refresh Tampilan
      updateProductSelection({ target: selectedSupplierRadio });

      // 7. Auto-check produk baru
      setTimeout(() => {
        const newCheckbox = document.getElementById(`modal-product-${result.product.id}`);
        if (newCheckbox) {
          newCheckbox.checked = true;
          const stokInput = newCheckbox.closest('.input-group').querySelector('.modal-stok-awal');
          if (stokInput) stokInput.disabled = false;
        }
      }, 100);
    }
  } catch (error) {
    showToast('Gagal terhubung ke server.', false);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Simpan';
  }
}

// Fungsi Membuka Modal Edit
function openEditProductModal(productId) {
  const product = AppState.masterData.products.find(p => p.id === productId);
  if (!product) return;

  document.getElementById('edit-product-id').value = productId;
  document.getElementById('edit-product-name').value = product.name;
  document.getElementById('edit-product-buy-price').value = product.harga_beli;
  document.getElementById('edit-product-sell-price').value = product.harga_jual;

  modals.editProduct.show();
}

// Fungsi Submit Edit
async function handleEditProductSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-product-id').value;
  const name = document.getElementById('edit-product-name').value;
  const buyPrice = document.getElementById('edit-product-buy-price').value;
  const sellPrice = document.getElementById('edit-product-sell-price').value;

  try {
    const resp = await fetch(`/api/update_product_price/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nama_produk: name,
        harga_beli: buyPrice,
        harga_jual: sellPrice
      })
    });
    const result = await resp.json();
    showToast(result.message, result.success);

    if (result.success) {
      // Update data di AppState lokal agar tidak perlu refresh halaman
      const productIndex = AppState.masterData.products.findIndex(p => p.id == id);
      if (productIndex !== -1) {
        AppState.masterData.products[productIndex].name = result.product.name;
        AppState.masterData.products[productIndex].harga_beli = result.product.harga_beli;
        AppState.masterData.products[productIndex].harga_jual = result.product.harga_jual;
      }

      modals.editProduct.hide();

      // Refresh daftar produk di belakang modal (jika sedang terbuka)
      const selectedSupplierRadio = document.querySelector('.supplier-radio:checked');
      if (selectedSupplierRadio) {
        updateProductSelection({ target: selectedSupplierRadio });
      }
    }
  } catch (e) {
    showToast("Gagal mengupdate produk.", false);
  }
}

function generateReportTables() {
  const container = document.getElementById("report-tables-container");
  const summaryContainer = document.getElementById("report-summary-container");
  const selectedCheckboxes = document.querySelectorAll('.product-checkbox:checked');

  if (selectedCheckboxes.length === 0) return showToast("Pilih setidaknya satu produk.", false);

  let productsToDisplay = [];
  let hasInvalidStok = false;
  selectedCheckboxes.forEach(cb => {
    const productId = parseInt(cb.value);
    const stokInput = cb.closest('.input-group').querySelector('.modal-stok-awal');
    const stokAwal = parseInt(stokInput.value) || 0;
    if (stokAwal <= 0) hasInvalidStok = true;
    const product = AppState.masterData.products.find(p => p.id === productId);
    if (product) productsToDisplay.push({ ...product, stokAwal });
  });

  if (hasInvalidStok) return showToast("Stok awal harus diisi dan lebih dari 0.", false);

  const initialPrompt = document.getElementById("initial-prompt");
  if (initialPrompt) initialPrompt.style.display = 'none';

  document.getElementById("product-search-container").style.display = 'block';

  productsToDisplay.forEach(productData => {
    const supplier = AppState.masterData.suppliers.find(s => s.id === productData.supplier_id);
    const supplierGroupId = `supplier-group-${supplier.id}`;
    let supplierGroup = document.getElementById(supplierGroupId);

    if (!supplierGroup) {
      const newGroup = document.createElement('div');
      newGroup.id = supplierGroupId;
      newGroup.className = 'mb-4 border rounded p-2 bg-white shadow-sm';
      const paymentMethod = supplier.metode_pembayaran ? `<span class="badge bg-info ms-2">${supplier.metode_pembayaran}</span>` : '';

      // PERBAIKAN DI SINI: Header dan Footer disesuaikan menjadi 4 kolom saja
      newGroup.innerHTML = `
          <div class="d-flex justify-content-between align-items-center mb-2 border-bottom pb-2">
              <h6 class="mb-0 fw-bold text-primary">${supplier.name}</h6>
              ${paymentMethod}
          </div>
          <div class="table-responsive">
              <table class="table table-borderless align-middle mb-0">
                  <thead class="table-light small text-muted">
                    <tr>
                        <th class="align-middle">Produk</th> 
                        
                        <th class="text-center align-middle" style="width: 60px;">Awal</th>
                        
                        <th class="text-center align-middle" style="min-width: 130px;">Akhir</th>
                        
                        <th style="width: 30px;"></th> 
                    </tr>
                </thead>
                  <tbody></tbody>
                  <tfoot style="border-top: 1px solid #dee2e6;">
                    <tr class="fw-bold small">
                      <td class="text-end text-muted">Total:</td>
                      <td class="text-center supplier-total-awal">0</td>
                      <td class="text-center supplier-total-akhir">0</td>
                      <td></td>
                    </tr>
                  </tfoot>
              </table>
          </div>
        `;
      container.appendChild(newGroup);
      supplierGroup = newGroup;
    }

    const tableBody = supplierGroup.querySelector('tbody');
    const isProductExist = tableBody.querySelector(`tr[data-product-id="${productData.id}"]`);

    if (!isProductExist) {
      let rowHtml = createProductRow(productData, supplier);
      const tempTbody = document.createElement('tbody');
      tempTbody.innerHTML = rowHtml;
      const newRow = tempTbody.querySelector('tr');

      if (newRow) {
        newRow.querySelector('.stok-awal').value = productData.stokAwal;
        newRow.querySelector('.stok-akhir').value = productData.stokAwal;
        attachEventListenersToRow(newRow);
        tableBody.appendChild(newRow);
        updateRowAndTotals(newRow);
      }
    }
  });

  updateSummarySection();
  saveReportStateToLocalStorage();
  modals.aturProduk.hide();

  // UPDATE UI WIZARD
  updateProgressBar(66);
  showToast("Produk ditambahkan. Silakan isi stok akhir.", true);

  // Auto scroll ke Langkah 2
  document.getElementById("report-tables-container").scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function createProductRow(product, supplier) {
  // PERBAIKAN:
  // 1. Tambahkan class 'flex-nowrap' di div input-group
  // 2. Tambahkan style 'min-width' pada input angka agar tidak gepeng
  // 3. Gunakan 'px-2' pada tombol agar tidak terlalu lebar tapi tetap mudah ditekan

  const stokAkhirInput = `
      <div class="input-group input-group-sm flex-nowrap" style="max-width: 140px;">
          <button class="btn btn-outline-secondary btn-minus px-2" type="button">
            <i class="bi bi-dash"></i>
          </button>
          
          <input type="number" 
                 class="form-control text-center input-stok stok-akhir px-1" 
                 placeholder="0" 
                 min="0" 
                 style="min-width: 40px;">
                 
          <button class="btn btn-outline-secondary btn-plus px-2" type="button">
            <i class="bi bi-plus"></i>
          </button>
      </div>`;

  return `
      <tr class="product-row border-bottom" data-product-id="${product.id}" data-harga-jual="${product.harga_jual}" data-harga-beli="${product.harga_beli}">
          <td class="product-supplier-info py-2 align-middle">
            <div class="fw-bold text-dark text-truncate" style="max-width: 150px; font-size: 0.9rem;">${product.name}</div>
            <div class="d-flex align-items-center mt-1">
               <small class="text-muted me-2">Terjual: <span class="terjual-pcs fw-bold text-primary">0</span></small>
               <button class="btn btn-xs btn-outline-warning notify-btn py-0 px-1" style="font-size: 0.7rem;"><i class="bi bi-bell"></i> Habis</button>
            </div>
          </td>
          
          <td class="text-center align-middle">
             <input type="number" class="form-control-plaintext form-control-sm text-center input-stok stok-awal p-0" readonly style="font-weight:bold;">
          </td>
          
          <td class="py-2 align-middle">
            <div class="d-flex justify-content-center">
              ${stokAkhirInput}
            </div>
          </td>
          
          <td class="text-end align-middle">
            <button class="btn btn-sm btn-link text-danger p-0" onclick="removeProductFromTable(this)">
                <i class="bi bi-x-lg"></i>
            </button>
          </td>
      </tr>`;
}

function removeProductFromTable(button) {
  // 1. Cari elemen baris (tr)
  const row = button.closest('tr');
  const tbody = row.closest('tbody');
  const table = tbody.closest('table');
  const supplierGroupDiv = table.closest('div').parentElement; // Div pembungkus per supplier

  // 2. Hapus baris tersebut
  row.remove();

  // 3. Cek apakah supplier ini masih punya produk lain?
  if (tbody.children.length === 0) {
    // Jika tidak ada produk tersisa, hapus seluruh grup supplier (judul + tabel)
    supplierGroupDiv.remove();
  } else {
    // Jika masih ada, update total angka di footer tabel supplier ini
    // Kita panggil updateSummarySection() yang otomatis menghitung ulang semuanya
  }

  // 4. Update Ringkasan Global (Total Pendapatan, dll) & Simpan State
  updateSummarySection();
  saveReportStateToLocalStorage();
}

async function populateLapakDashboard() {
  const loadingEl = document.getElementById("laporan-loading"),
    contentEl = document.getElementById("laporan-content"),
    existsEl = document.getElementById("laporan-exists");

  loadingEl.style.display = "block";
  contentEl.style.display = "none";
  existsEl.style.display = "none";
  document.getElementById("report-tables-container").innerHTML = `
            <div id="initial-prompt" class="text-center text-muted p-5 border rounded">
                <i class="bi bi-ui-checks-grid" style="font-size: 3rem;"></i><h5 class="mt-3">Mulai Laporan Harian</h5>
                <p>Klik "Atur Produk" di atas untuk memilih produk yang akan dijual hari ini.</p>
            </div>`;
  document.getElementById("product-search-container").style.display = "none";

  try {
    // API dipanggil untuk mengecek apakah laporan hari ini sudah ada
    const resp = await fetch(
      `/api/get_data_buat_catatan/${AppState.currentUser.user_info.lapak_id}`
    );
    if (!resp.ok && resp.status === 409) {
      existsEl.style.display = "block";
      document.getElementById("rekap-footer").style.display = "none";
    } else {
      contentEl.style.display = "block";
    }
  } catch (error) {
    loadingEl.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  } finally {
    loadingEl.style.display = "none";
  }
}
async function populateLapakDashboard() {
  const loadingEl = document.getElementById("laporan-loading");
  const contentEl = document.getElementById("laporan-content");
  const existsEl = document.getElementById("laporan-exists");
  const initialPrompt = document.getElementById("initial-prompt");

  // Matikan Footer Sticky Lama (PENTING untuk desain baru)
  const oldFooter = document.getElementById('rekap-footer');
  if (oldFooter) oldFooter.style.display = 'none';

  // Reset Progress Bar
  updateProgressBar(33);

  loadingEl.style.display = "block";
  contentEl.style.display = "none";
  existsEl.style.display = "none";

  const lapakId = AppState.currentUser.user_info.lapak_id;

  if (!lapakId) {
    loadingEl.style.display = 'none';
    contentEl.style.display = 'none'; // Sembunyikan konten jika belum ada lapak
    alert("Anda belum ditugaskan ke lapak manapun.");
    return;
  }

  // Reset tabel jika ada sisa data lama di DOM
  initialPrompt.style.display = "block";
  document.getElementById("product-search-container").style.display = "none";

  try {
    const resp = await fetch(`/api/get_data_buat_catatan/${lapakId}`);
    if (!resp.ok) {
      const result = await resp.json();
      if (resp.status === 409 && result.already_exists) {
        existsEl.style.display = "block";
        loadingEl.style.display = "none";
      } else {
        throw new Error(result.message);
      }
    } else {
      const result = await resp.json();
      AppState.masterData.suppliers = result.data;
      AppState.masterData.products = result.data.flatMap(supplier =>
        supplier.products.map(product => ({ ...product, supplier_id: supplier.id }))
      );

      contentEl.style.display = "block";
      loadingEl.style.display = "none";

      // Cek apakah ada data tersimpan
      loadReportStateFromLocalStorage();
    }
  } catch (error) {
    loadingEl.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  }
}

// Fungsi Helper Baru untuk Progress Bar
function updateProgressBar(percent) {
  const bar = document.getElementById('report-progress');
  if (bar) {
    bar.style.width = percent + "%";
    if (percent >= 100) {
      bar.classList.add('bg-success');
      bar.classList.remove('bg-primary');
    } else {
      bar.classList.add('bg-primary');
      bar.classList.remove('bg-success');
    }
  }
}

function updateRowAndTotals(row) {
  const awal = parseInt(row.querySelector(".stok-awal").value) || 0;
  let akhirInput = row.querySelector(".stok-akhir");
  let akhir = parseInt(akhirInput.value) || 0;
  if (akhir > awal) { akhir = awal; akhirInput.value = awal; }
  const terjual = awal - akhir;
  row.querySelector(".terjual-pcs").textContent = terjual;
  updateSummarySection(); // Panggil update ringkasan
  saveReportStateToLocalStorage();
}

function updateSummarySection() {
  const summaryPlaceholder = document.getElementById("summary-placeholder");
  // const summaryContent = document.getElementById("summary-content"); // Tidak perlu dimanipulasi display-nya

  // Tampilkan loading kecil jika perlu, atau biarkan saja
  if (summaryPlaceholder) summaryPlaceholder.style.display = 'block';

  let totalTerjual = 0, totalPendapatan = 0, totalBiaya = 0, totalKeuntungan = 0;
  let supplierTotals = {};

  document.querySelectorAll(".product-row").forEach(row => {
    const stokAwal = parseInt(row.querySelector(".stok-awal").value) || 0;
    const stokAkhir = parseInt(row.querySelector(".stok-akhir").value) || 0;

    // Hitung terjual (pastikan tidak negatif)
    let terjual = stokAwal - stokAkhir;
    if (terjual < 0) terjual = 0;

    // Update teks terjual di baris tersebut
    const terjualEl = row.querySelector('.terjual-pcs');
    if (terjualEl) terjualEl.textContent = terjual;

    const hargaJual = parseFloat(row.dataset.hargaJual) || 0;
    const hargaBeli = parseFloat(row.dataset.hargaBeli) || 0;

    const pendapatanRow = terjual * hargaJual;
    const biayaRow = terjual * hargaBeli;

    totalTerjual += terjual;
    totalPendapatan += pendapatanRow;
    totalBiaya += biayaRow;

    // Hitung total per supplier untuk footer tabel kecil
    const supplierGroup = row.closest("[id^='supplier-group-']");
    if (supplierGroup) {
      const supplierId = supplierGroup.id;
      if (!supplierTotals[supplierId]) {
        supplierTotals[supplierId] = { awal: 0, akhir: 0 };
      }
      supplierTotals[supplierId].awal += stokAwal;
      supplierTotals[supplierId].akhir += stokAkhir;
    }
  });

  totalKeuntungan = totalPendapatan - totalBiaya;

  // Update Footer per Supplier (Hanya Total Stok Awal & Akhir agar muat di HP)
  for (const supplierId in supplierTotals) {
    const groupElement = document.getElementById(supplierId);
    if (groupElement) {
      const totals = supplierTotals[supplierId];
      const awalEl = groupElement.querySelector('.supplier-total-awal');
      const akhirEl = groupElement.querySelector('.supplier-total-akhir');

      if (awalEl) awalEl.textContent = totals.awal;
      if (akhirEl) akhirEl.textContent = totals.akhir;
    }
  }

  // Update Data Tersembunyi (untuk Langkah 3)
  const elTerjual = document.getElementById("summary-total-terjual");
  const elPendapatan = document.getElementById("summary-total-pendapatan");
  const elBiaya = document.getElementById("summary-total-biaya");
  const elKeuntungan = document.getElementById("summary-total-keuntungan");
  const elTotalSistem = document.getElementById("total-sistem");

  if (elTerjual) elTerjual.textContent = `${totalTerjual} Pcs`;
  if (elPendapatan) elPendapatan.textContent = formatCurrency(totalPendapatan);
  if (elBiaya) elBiaya.textContent = formatCurrency(totalBiaya);
  if (elKeuntungan) elKeuntungan.textContent = formatCurrency(totalKeuntungan);

  // Update Tampilan "Langkah 3"
  if (elTotalSistem) elTotalSistem.textContent = formatCurrency(totalPendapatan);

  // Update Total Manual (Input User)
  const qris = parseFloat(document.getElementById("rekap-qris").value.replace(/\D/g, '')) || 0;
  const bca = parseFloat(document.getElementById("rekap-bca").value.replace(/\D/g, '')) || 0;
  const cash = parseFloat(document.getElementById("rekap-cash").value.replace(/\D/g, '')) || 0;
  const totalManual = qris + bca + cash;

  const elTotalManual = document.getElementById("total-manual");
  if (elTotalManual) elTotalManual.textContent = formatCurrency(totalManual);

  checkReconciliation(totalPendapatan, totalManual);

  // PERBAIKAN UTAMA: Jangan ubah display summaryContent jadi block
  // Kita hanya sembunyikan placeholder loading
  if (summaryPlaceholder) {
    setTimeout(() => {
      summaryPlaceholder.style.display = 'none';
    }, 200);
  }
}

function checkReconciliation(totalSistem, totalManual) {
  const warningEl = document.getElementById("reconciliation-warning");
  const submitBtn = document.getElementById("kirim-laporan-btn");

  // Toleransi desimal kecil
  const isMatched = Math.abs(totalSistem - totalManual) < 100; // Toleransi Rp 100 perak

  // Update UI Text
  document.getElementById("total-sistem").textContent = formatCurrency(totalSistem);
  document.getElementById("total-manual").textContent = formatCurrency(totalManual);

  if (totalSistem > 0 && isMatched) {
    // KONDISI SIAP KIRIM
    warningEl.style.display = "none";
    submitBtn.disabled = false;
    submitBtn.classList.remove("btn-secondary");
    submitBtn.classList.add("btn-success");
    submitBtn.innerHTML = '<i class="bi bi-send-fill me-2"></i> Kirim Laporan Sekarang';

    updateProgressBar(100); // Langkah 3 Selesai
  } else {
    // KONDISI BELUM SESUAI
    submitBtn.disabled = true;
    submitBtn.classList.add("btn-secondary");
    submitBtn.classList.remove("btn-success");

    if (totalSistem === 0) {
      submitBtn.innerHTML = '<i class="bi bi-lock-fill me-2"></i> Lengkapi Data Dulu';
      warningEl.style.display = "none";
      updateProgressBar(33); // Masih di awal
    } else {
      submitBtn.innerHTML = '<i class="bi bi-exclamation-circle-fill me-2"></i> Perbaiki Input Manual';
      warningEl.style.display = "block";
      warningEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-1"></i> Selisih: ${formatCurrency(totalManual - totalSistem)}`;
      updateProgressBar(66); // Masih di tahap input
    }
  }
}

function attachAllEventListeners() {
  // Fungsi ini sekarang hanya bertanggung jawab untuk event listener di dalam tabel
  document.querySelectorAll(".product-row").forEach((row) => {
    attachEventListenersToRow(row);
  });

  // Listener untuk input pencarian tabel utama
  const mainSearchInput = document.getElementById('main-report-search-input');
  if (mainSearchInput) {
    mainSearchInput.addEventListener('input', filterMainReportTable);
  }
}

// (Letakkan ini setelah fungsi checkReconciliation)

// FUNGSI BARU 1: Untuk menyimpan keadaan tabel ke localStorage
function saveReportStateToLocalStorage() {
  if (!AppState.currentUser || AppState.currentUser.role !== 'lapak') return;

  const reportData = [];
  document.querySelectorAll(".product-row").forEach(row => {
    reportData.push({
      productId: parseInt(row.dataset.productId),
      stokAwal: parseInt(row.querySelector(".stok-awal").value) || 0,
      stokAkhir: parseInt(row.querySelector(".stok-akhir").value) || 0
    });
  });

  const storageKey = `reportState_${AppState.currentUser.user_info.lapak_id}`;
  localStorage.setItem(storageKey, JSON.stringify(reportData));
}

function loadReportStateFromLocalStorage() {
  if (!AppState.currentUser || AppState.currentUser.role !== 'lapak') return;

  const storageKey = `reportState_${AppState.currentUser.user_info.lapak_id}`;
  const savedData = JSON.parse(localStorage.getItem(storageKey) || '[]');

  if (savedData.length === 0) return;

  const container = document.getElementById("report-tables-container");
  const summaryContainer = document.getElementById("report-summary-container");

  // Hapus "initial-prompt" jika ada
  const initialPrompt = document.getElementById("initial-prompt");
  if (initialPrompt) initialPrompt.style.display = 'none';

  container.innerHTML = ''; // Kosongkan container sebelum membangun

  savedData.forEach(item => {
    const product = AppState.masterData.products.find(p => p.id === item.productId);
    const supplier = AppState.masterData.suppliers.find(s => s.id === product.supplier_id);

    if (product && supplier) {
      const supplierGroupId = `supplier-group-${supplier.id}`;
      let supplierGroup = document.getElementById(supplierGroupId);

      // Jika grup supplier belum ada, buat dulu (VERSI MOBILE)
      if (!supplierGroup) {
        const newGroup = document.createElement('div');
        newGroup.id = supplierGroupId;
        newGroup.className = 'mb-4 border rounded p-2 bg-white shadow-sm';
        const paymentMethod = supplier.metode_pembayaran ? `<span class="badge bg-info ms-2">${supplier.metode_pembayaran}</span>` : '';

        newGroup.innerHTML = `
          <div class="d-flex justify-content-between align-items-center mb-2 border-bottom pb-2">
              <h6 class="mb-0 fw-bold text-primary">${supplier.name}</h6>
              ${paymentMethod}
          </div>
          <div class="table-responsive">
              <table class="table table-borderless align-middle mb-0">
                  <thead class="table-light small text-muted">
                      <tr>
                          <th>Produk</th> 
                          <th class="text-center" style="width: 50px;">Awal</th>
                          <th class="text-center" style="min-width: 120px;">Akhir</th>
                          <th style="width: 30px;"></th> 
                      </tr>
                  </thead>
                  <tbody></tbody>
                  <tfoot style="border-top: 1px solid #dee2e6;">
                    <tr class="fw-bold small">
                      <td class="text-end text-muted">Total:</td>
                      <td class="text-center supplier-total-awal">0</td>
                      <td class="text-center supplier-total-akhir">0</td>
                      <td></td>
                    </tr>
                  </tfoot>
              </table>
          </div>
        `;
        container.appendChild(newGroup);
        supplierGroup = newGroup;
      }

      const tableBody = supplierGroup.querySelector('tbody');
      let rowHtml = createProductRow(product, supplier);
      const tempTbody = document.createElement('tbody');
      tempTbody.innerHTML = rowHtml;
      const newRow = tempTbody.querySelector('tr');

      if (newRow) {
        newRow.querySelector('.stok-awal').value = item.stokAwal;
        newRow.querySelector('.stok-akhir').value = item.stokAkhir;
        tableBody.appendChild(newRow);
        attachEventListenersToRow(newRow);
      }
    }
  });

  summaryContainer.style.display = 'block';
  document.getElementById("product-search-container").style.display = 'block';
  updateSummarySection();

  // Set progress bar ke tahap 2 jika ada data tersimpan
  updateProgressBar(66);
  showToast("Sesi laporan sebelumnya berhasil dipulihkan.", true);
}

async function handleNotifySupplier(button) {
  const row = button.closest('tr');
  const productId = row.dataset.productId;
  const lapakId = AppState.currentUser.user_info.lapak_id;

  if (!confirm("Kirim notifikasi stok habis ke supplier?")) return;

  button.disabled = true;
  button.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  try {
    const resp = await fetch('/api/notify_supplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, lapak_id: lapakId })
    });
    const result = await resp.json();
    showToast(result.message, result.success);

    if (result.success) {
      button.classList.remove('btn-outline-warning');
      button.classList.add('btn-success');
      button.innerHTML = '<i class="bi bi-check-lg"></i> Terkirim';
    } else {
      // Jika gagal, kembalikan tombol ke keadaan semula
      button.disabled = false;
      button.innerHTML = '<i class="bi bi-bell-fill"></i> Stok Habis';
    }
  } catch (error) {
    showToast('Gagal terhubung ke server.', false);
    button.disabled = false;
    button.innerHTML = '<i class="bi bi-bell-fill"></i> Stok Habis';
  }
}



// GANTI FUNGSI LAMA DENGAN VERSI BARU INI
function attachEventListenersToRow(row) {
  // Event listener untuk input angka manual (ini sudah benar)
  row.querySelectorAll(".stok-akhir").forEach((input) => {
    input.addEventListener("input", () => updateRowAndTotals(row));
  });

  // Logika untuk tombol spinner (ini juga sudah benar)
  const parentDiv = row.querySelector('.stok-akhir')?.closest('div');
  if (parentDiv) {
    const plusBtn = parentDiv.querySelector('.btn-plus');
    const minusBtn = parentDiv.querySelector('.btn-minus');
    const input = parentDiv.querySelector(".stok-akhir");

    if (plusBtn) {
      plusBtn.addEventListener("click", () => {
        let currentValue = parseInt(input.value) || 0;
        currentValue++;
        input.value = currentValue;
        input.dispatchEvent(new Event("input")); // Picu kalkulasi ulang
      });
    }

    if (minusBtn) {
      minusBtn.addEventListener("click", () => {
        let currentValue = parseInt(input.value) || 0;
        currentValue = Math.max(0, currentValue - 1);
        input.value = currentValue;
        input.dispatchEvent(new Event("input")); // Picu kalkulasi ulang
      });
    }
  }

  const notifyBtn = row.querySelector('.notify-btn');
  if (notifyBtn) {
    notifyBtn.addEventListener('click', () => handleNotifySupplier(notifyBtn));
  }

}

function filterMainReportTable(e) {
  const searchTerm = e.target.value.toLowerCase();

  // Loop melalui setiap grup supplier
  document.querySelectorAll("[id^='supplier-group-']").forEach(group => {
    const supplierName = group.querySelector('h5').textContent.toLowerCase();
    const productRows = group.querySelectorAll('.product-row');
    let groupHasVisibleRows = false;

    // Loop melalui setiap baris produk di dalam grup
    productRows.forEach(row => {
      const productName = row.querySelector('.product-supplier-info strong').textContent.toLowerCase();

      // Sebuah baris akan terlihat jika nama produk ATAU nama suppliernya cocok
      const isVisible = productName.includes(searchTerm) || supplierName.includes(searchTerm);

      row.style.display = isVisible ? "" : "none"; // Tampilkan atau sembunyikan baris ini

      if (isVisible) {
        groupHasVisibleRows = true; // Tandai bahwa grup ini punya setidaknya satu baris yang terlihat
      }
    });

    // Setelah semua baris diperiksa, tentukan apakah seluruh grup (termasuk judulnya) perlu ditampilkan
    group.style.display = groupHasVisibleRows ? 'block' : 'none';
  });
}

async function handleKirimLaporan() {
  if (!confirm("Kirim laporan ini? Laporan yang sudah dikirim tidak bisa diubah.")) return;

  const productData = [];
  document.querySelectorAll(".product-row").forEach((row) => {
    const stokAwal = row.querySelector(".stok-awal").value;
    const stokAkhir = row.querySelector(".stok-akhir").value;
    // Hanya kirim data yang diisi
    if (stokAwal > 0 || stokAkhir > 0) {
      productData.push({
        id: parseInt(row.dataset.productId),
        stok_awal: parseInt(stokAwal) || 0,
        stok_akhir: parseInt(stokAkhir) || 0,
      });
    }
  });

  if (productData.length === 0) return showToast("Tidak ada data penjualan.", false);

  const rekapData = {
    qris: document.getElementById("rekap-qris").value.replace(/\D/g, '') || '0',
    bca: document.getElementById("rekap-bca").value.replace(/\D/g, '') || '0',
    cash: document.getElementById("rekap-cash").value.replace(/\D/g, '') || '0',
    total: document.getElementById("total-manual").textContent.replace(/\D/g, "") || '0',
  };

  const payload = {
    lapak_id: AppState.currentUser.user_info.lapak_id,
    products: productData,
    rekap_pembayaran: rekapData,
  };

  const submitBtn = document.getElementById("kirim-laporan-btn");
  const originalBtnHTML = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Mengirim...`;

  try {
    const response = await fetch("/api/submit_catatan_harian", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    showToast(result.message, response.ok);
    if (response.ok) {
      // Bersihkan localStorage setelah pengiriman berhasil
      const storageKey = `reportState_${AppState.currentUser.user_info.lapak_id}`;
      localStorage.removeItem(storageKey);
      // Muat ulang dashboard untuk menampilkan status terbaru
      await populateLapakDashboard();
    }
  } catch (e) {
    showToast("Gagal terhubung ke server.", false);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnHTML;
  }
}
async function populateHistoryLaporanPage() {
  const loadingEl = document.getElementById("history-loading");
  const listEl = document.getElementById("history-list");

  loadingEl.style.display = "block";
  listEl.innerHTML = ""; // Bersihkan konten lama

  try {
    const lapakId = AppState.currentUser.user_info.lapak_id;
    // Kita panggil API yang sama, asumsinya API ini sudah mengembalikan detail 'rincian_produk'
    // Jika API backend Anda belum mengirim detail produk di endpoint ini, 
    // Anda mungkin perlu menyesuaikan backend atau memanggil API detail per item.
    // TAPI, berdasarkan kode 'get_report_details' Anda sebelumnya, data rincian biasanya ada.

    // *Catatan: Untuk solusi frontend ini, saya berasumsi API '/api/get_history_laporan' 
    // dimodifikasi sedikit di backend untuk menyertakan 'rincian_produk', 
    // ATAU kita harus fetch detail satu per satu (kurang efisien tapi bisa).*

    // Mari kita gunakan pendekatan fetch list dulu, lalu saat user klik "Detail",
    // kita bisa fetch detailnya (Lazy Loading) agar aplikasi cepat. 
    // TAPI untuk sekarang, saya buat agar struktur UI-nya siap menerima data detail.

    const resp = await fetch(`/api/get_history_laporan/${lapakId}`);

    if (!resp.ok) throw new Error("Gagal mengambil data history.");

    const result = await resp.json();
    loadingEl.style.display = "none";

    if (result.reports.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-5">
          <i class="bi bi-clock-history text-muted" style="font-size: 3rem;"></i>
          <p class="mt-3 text-muted">Belum ada riwayat laporan.</p>
        </div>`;
      return;
    }

    // Render List
    listEl.innerHTML = result.reports.map((r, index) => {
      const isConfirmed = r.status === "Terkonfirmasi";
      const statusClass = isConfirmed ? "confirmed" : "pending";
      const statusBadge = isConfirmed
        ? `<span class="badge bg-success"><i class="bi bi-check-circle-fill me-1"></i>Diterima Owner</span>`
        : `<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i>Menunggu</span>`;

      const dateString = new Date(r.tanggal).toLocaleDateString("id-ID", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
      });

      // Kita butuh tombol untuk memuat detail jika data detail belum ada di list awal
      // ID unik untuk collapse
      const collapseId = `history-collapse-${r.id}`;

      return `
        <div class="card history-card ${statusClass} mb-3 border-0 shadow-sm">
          <div class="history-header d-flex justify-content-between align-items-center" 
               data-bs-toggle="collapse" 
               data-bs-target="#${collapseId}" 
               aria-expanded="false" 
               onclick="loadHistoryDetail(${r.id}, '${collapseId}')">
            
            <div class="d-flex align-items-center flex-grow-1">
              <div class="me-3 text-center">
                 <div class="fw-bold text-secondary" style="font-size: 0.8rem; text-transform:uppercase;">${new Date(r.tanggal).toLocaleDateString('id-ID', { month: 'short' })}</div>
                 <div class="display-6 fw-bold text-dark" style="line-height: 1;">${new Date(r.tanggal).getDate()}</div>
              </div>
              
              <div class="border-start ps-3">
                <h6 class="mb-1 fw-bold text-primary">Laporan #${r.id}</h6>
                <div class="small text-muted mb-1">Total Pendapatan: <span class="fw-bold text-dark">${formatCurrency(r.total_pendapatan)}</span></div>
                ${statusBadge}
              </div>
            </div>

            <div class="text-muted">
               <i class="bi bi-chevron-down"></i>
            </div>
          </div>

          <div id="${collapseId}" class="collapse">
            <div class="card-body border-top bg-light p-3">
              <div id="detail-container-${r.id}" class="text-center py-3">
                 <div class="spinner-border spinner-border-sm text-primary"></div>
                 <span class="small ms-2">Memuat rincian produk...</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

  } catch (error) {
    loadingEl.innerHTML = `<div class="alert alert-danger">Gagal memuat history: ${error.message}</div>`;
  }
}

// Cache sederhana agar tidak fetch ulang data yang sudah dibuka
const historyDetailCache = {};

async function loadHistoryDetail(reportId, containerId) {
  const container = document.querySelector(`#${containerId} #detail-container-${reportId}`);

  // Jika konten sudah ada (bukan spinner loading), jangan fetch lagi
  if (!container || container.querySelector('table')) return;

  try {
    // Cek cache dulu
    let data;
    if (historyDetailCache[reportId]) {
      data = historyDetailCache[reportId];
    } else {
      // Panggil API get_report_details yang SUDAH ADA di backend Anda
      const resp = await fetch(`/api/get_report_details/${reportId}`);
      const result = await resp.json();
      if (!result.success) throw new Error(result.message);
      data = result.data;
      historyDetailCache[reportId] = data; // Simpan ke cache
    }

    // Bangun HTML Detail
    let htmlContent = '';

    // Info Ringkas Tambahan
    htmlContent += `
      <div class="row g-2 mb-3 small">
        <div class="col-6">
          <div class="p-2 bg-white border rounded">
            <span class="text-muted d-block">Terjual (Pcs)</span>
            <span class="fw-bold">${data.rekap_otomatis.total_produk_terjual} item</span>
          </div>
        </div>
        <div class="col-6">
          <div class="p-2 bg-white border rounded">
            <span class="text-muted d-block">Biaya Modal (HPP)</span>
            <span class="fw-bold text-danger">${formatCurrency(data.rekap_otomatis.total_biaya_supplier)}</span>
          </div>
        </div>
      </div>
    `;

    // Tabel Rincian Produk
    htmlContent += `
      <div class="table-responsive bg-white border rounded">
        <table class="table table-sm table-hover mb-0 history-detail-table">
          <thead class="table-light">
            <tr>
              <th class="ps-3">Produk / Supplier</th>
              <th class="text-center">Stok</th>
              <th class="text-center">Terjual</th>
              <th class="text-end pe-3">Omzet</th>
            </tr>
          </thead>
          <tbody>
    `;

    // Loop data per supplier
    const suppliers = Object.keys(data.rincian_per_supplier);
    if (suppliers.length === 0) {
      htmlContent += `<tr><td colspan="4" class="text-center p-3">Tidak ada data produk.</td></tr>`;
    } else {
      suppliers.forEach(supplierName => {
        const products = data.rincian_per_supplier[supplierName];

        products.forEach(p => {
          htmlContent += `
            <tr>
              <td class="ps-3 py-2">
                <div class="fw-bold text-dark">${p.nama_produk}</div>
                <div class="d-flex align-items-center mt-1">
                  <span class="badge-supplier me-2"><i class="bi bi-box-seam me-1"></i>${supplierName}</span>
                </div>
              </td>
              <td class="text-center small">
                <div class="text-muted">Aw: ${p.stok_awal}</div>
                <div class="text-dark fw-bold">Ak: ${p.stok_akhir}</div>
              </td>
              <td class="text-center fw-bold text-primary">${p.terjual}</td>
              <td class="text-end pe-3">
                <div class="fw-bold">${formatCurrency(p.total_pendapatan)}</div>
                <div class="small text-muted" style="font-size: 0.75rem;">Modal: ${formatCurrency(p.total_biaya || (p.total_pendapatan - p.keuntungan_bersih))}</div>
              </td>
            </tr>
          `;
        });
      });
    }

    htmlContent += `
          </tbody>
        </table>
      </div>
      
      <div class="mt-3 text-end">
         <button class="btn btn-sm btn-outline-danger" onclick="showReportDetails(${reportId})">
            <i class="bi bi-file-earmark-pdf-fill me-1"></i> Lihat Invoice / PDF
         </button>
      </div>
    `;

    // Render ke dalam container
    container.innerHTML = htmlContent;
    container.className = ""; // Hapus class text-center py-3

  } catch (e) {
    container.innerHTML = `<div class="alert alert-warning small"><i class="bi bi-exclamation-triangle me-1"></i> Gagal memuat rincian: ${e.message}</div>`;
  }
}

async function populateSupplierDashboard() {
  try {
    const supplierId = AppState.currentUser.user_info.supplier_id;
    const resp = await fetch(`/api/get_data_supplier/${supplierId}`);
    if (!resp.ok) throw new Error("Gagal mengambil data dashboard supplier");
    const result = await resp.json();
    if (result.success) {
      document.getElementById("supplier-total-tagihan").textContent = formatCurrency(result.summary.total_tagihan);
      document.getElementById("supplier-penjualan-bulan-ini").textContent = formatCurrency(result.summary.penjualan_bulan_ini);
    } else { throw new Error(result.message); }

    // PERUBAHAN DI SINI: Panggil fungsi untuk memuat notifikasi
    await populateNotifications();

  } catch (error) {
    showToast(error.message || "Gagal memuat data dashboard.", false);
  }
}
async function populateSupplierHistoryPage() {
  const loadingEl = document.getElementById('supplier-history-loading'),
    contentEl = document.getElementById('supplier-history-content'),
    salesBody = document.getElementById('supplier-sales-history-body'),
    paymentsBody = document.getElementById('supplier-payment-history-body'),
    lapakSelect = document.getElementById('supplier-history-lapak-filter');

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';

  // Ambil semua nilai dari filter
  const startDate = document.getElementById('supplier-history-start-date').value;
  const endDate = document.getElementById('supplier-history-end-date').value;
  const lapakId = lapakSelect.value;

  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (lapakId) params.append('lapak_id', lapakId); // Tambahkan lapak_id ke parameter
  const queryString = params.toString();

  try {
    const apiUrl = `/api/get_supplier_history/${AppState.currentUser.user_info.supplier_id}?${queryString}`;
    const resp = await fetch(apiUrl);
    const result = await resp.json();

    if (!result.success) throw new Error(result.message);

    // --- PERUBAHAN DI SINI: Mengisi dropdown lapak saat pertama kali dijalankan ---
    if (lapakSelect.options.length <= 1) { // Cek agar tidak diisi berulang kali
      if (result.lapaks) {
        result.lapaks.forEach(l => {
          lapakSelect.innerHTML += `<option value="${l.id}">${l.lokasi}</option>`;
        });
      }
    }

    // Bagian untuk mengisi tabel pembayaran (tidak berubah)
    if (result.payments.length === 0) {
      paymentsBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Belum ada pembayaran.</td></tr>`;
    } else {
      paymentsBody.innerHTML = result.payments.map(p => `
                    <tr>
                        <td>${new Date(p.tanggal + 'T00:00:00').toLocaleDateString('id-ID')}</td>
                        <td>${formatCurrency(p.jumlah)}</td>
                        <td><span class="badge bg-info">${p.metode}</span></td>
                    </tr>`).join('');
    }

    // --- UBAH BAGIAN INI (Sales Body) ---
    if (result.sales.length === 0) {
      salesBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Belum ada riwayat penjualan.</td></tr>`;
    } else {
      salesBody.innerHTML = result.sales.map(s => `
            <tr>
                <td>${new Date(s.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</td>
                <td>${s.lokasi}</td>
                <td>${s.nama_produk}</td>
                <td class="text-center">${s.terjual}</td>
                <td class="text-end fw-bold text-primary">${formatCurrency(s.nominal)}</td>
            </tr>`).join('');
    }
    // ------------------------------------

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  } catch (e) {
    loadingEl.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

async function populateNotifications() {
  const container = document.getElementById("notification-list-container");

  // Tampilkan loading state yang lebih rapi
  container.innerHTML = `
    <div class="list-group-item text-center p-4 border-0 bg-transparent">
       <div class="spinner-border text-primary" role="status"></div>
       <p class="mt-2 text-muted small">Memuat update stok...</p>
    </div>`;

  try {
    const supplierId = AppState.currentUser.user_info.supplier_id;
    const resp = await fetch(`/api/get_supplier_notifications/${supplierId}`);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);

    if (result.notifications.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5 text-muted">
           <i class="bi bi-check-circle display-4 text-success opacity-50"></i>
           <p class="mt-3">Aman! Stok di semua lapak tersedia.</p>
        </div>`;
      updateNotificationBadge();
      return;
    }

    // Render List
    container.innerHTML = result.notifications.map(n => {
      // Style untuk notifikasi baru vs lama
      const itemClass = n.status === 'baru' ? 'notification-new' : '';
      const btnDisabled = n.status === 'dibaca' ? 'disabled' : '';
      const btnClass = n.status === 'dibaca' ? 'btn-outline-secondary' : 'btn-outline-success';

      return `
        <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-start py-3 ${itemClass}" id="notif-${n.id}">
          <div class="me-3">
            <div class="mb-1">
              Produk <strong>${n.product_name}</strong> habis di <strong class="text-primary">${n.lapak_name}</strong>.
            </div>
            <small class="text-muted">
              <i class="bi bi-clock"></i> ${new Date(n.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} 
              <span class="mx-1">•</span> 
              ${new Date(n.time).toLocaleDateString('id-ID')}
            </small>
          </div>
          
          <div class="btn-group-vertical btn-group-sm">
             <button class="btn ${btnClass}" onclick="markNotificationAsRead(${n.id}, this)" ${btnDisabled} title="Tandai Sudah Dibaca">
               <i class="bi bi-check2"></i>
             </button>
             <button class="btn btn-outline-danger" onclick="archiveNotification(${n.id})" title="Arsipkan">
               <i class="bi bi-archive-fill"></i>
             </button>
          </div>
        </div>
      `;
    }).join('');

    updateNotificationBadge();
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger m-3">Gagal memuat: ${e.message}</div>`;
  }
}

async function updateNotificationStatus(id, status) {
  try {
    const resp = await fetch(`/api/update_notification_status/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    });
    return await resp.json();
  } catch (e) {
    return { success: false, message: 'Gagal terhubung ke server.' };
  }
}

// FUNGSI BARU 2: Aksi saat tombol "Baca" diklik
async function markNotificationAsRead(id, buttonElement) {
  const result = await updateNotificationStatus(id, 'dibaca');
  if (result.success) {
    const notifItem = document.getElementById(`notif-${id}`);
    notifItem.classList.remove('list-group-item-warning');
    buttonElement.disabled = true;
    updateNotificationBadge();
  }
  showToast(result.message, result.success);
}

// FUNGSI BARU 3: Aksi saat tombol "Arsip" diklik
async function archiveNotification(id) {
  if (!confirm("Arsipkan notifikasi ini? Notifikasi akan hilang dari daftar.")) return;
  const result = await updateNotificationStatus(id, 'diarsipkan');
  if (result.success) {
    document.getElementById(`notif-${id}`).remove();
    updateNotificationBadge();
  }
  showToast(result.message, result.success);
}

// FUNGSI BARU 4: Untuk menghitung ulang badge notifikasi
function updateNotificationBadge() {
  const badge = document.getElementById("notification-badge");
  if (!badge) return; // Jika badge tidak ditemukan, hentikan fungsi (jangan error)
  const newNotificationCount = document.querySelectorAll('.list-group-item-warning').length;
  if (newNotificationCount > 0) {
    badge.textContent = newNotificationCount;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

async function populateArchivedNotifications() {
  const container = document.getElementById("archived-notification-list-container");
  container.innerHTML = `<div class="list-group-item text-center p-4"><div class="spinner-border spinner-border-sm"></div></div>`;

  try {
    const supplierId = AppState.currentUser.user_info.supplier_id;
    const resp = await fetch(`/api/get_archived_notifications/${supplierId}`);
    const result = await resp.json();

    if (!result.success) throw new Error(result.message);

    if (result.notifications.length === 0) {
      container.innerHTML = `<div class="list-group-item text-center text-muted p-4">Arsip notifikasi kosong.</div>`;
      return;
    }

    container.innerHTML = result.notifications.map(n => `
            <div class="list-group-item d-flex justify-content-between align-items-center" id="archived-notif-${n.id}">
                <div>
                    Produk <strong>${n.product_name}</strong> habis di <strong>${n.lapak_name}</strong>.
                    <small class="d-block text-muted">Diarsipkan pada ${new Date(n.time).toLocaleString('id-ID')}</small>
                </div>
                <button class="btn btn-sm btn-outline-primary" onclick="unarchiveNotification(${n.id})">
                    <i class="bi bi-box-arrow-up"></i> Pulihkan
                </button>
            </div>
          `).join('');

  } catch (e) {
    container.innerHTML = `<div class="list-group-item text-center text-danger p-4">Gagal memuat arsip: ${e.message}</div>`;
  }
}

// FUNGSI BARU 2: Aksi saat tombol "Pulihkan" diklik
async function unarchiveNotification(id) {
  const result = await updateNotificationStatus(id, 'baru'); // Kembalikan statusnya ke 'baru'
  if (result.success) {
    showPage('supplier-dashboard'); // Kembali ke dashboard untuk melihat notifikasi yang dipulihkan
  }
  showToast(result.message, result.success);
}

async function showSupplierBillDetails() {
  const loadingEl = document.getElementById('supplier-bill-loading');
  const contentEl = document.getElementById('supplier-bill-content');
  const emptyEl = document.getElementById('supplier-bill-empty');
  const tableBody = document.getElementById('supplier-bill-table-body');
  const totalEl = document.getElementById('modal-total-bill');

  // 1. Reset tampilan modal
  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';
  emptyEl.style.display = 'none';
  tableBody.innerHTML = '';

  // 2. Buka Modal
  modals.supplierBillDetail.show();

  try {
    const supplierId = AppState.currentUser.user_info.supplier_id;

    // Panggil API yang sudah diperbarui
    const resp = await fetch(`/api/get_supplier_unpaid_details/${supplierId}`);
    const result = await resp.json();

    if (!result.success) throw new Error(result.message);

    if (result.details.length === 0) {
      loadingEl.style.display = 'none';
      emptyEl.style.display = 'block';
    } else {
      let totalAmount = 0;

      // 3. Render Baris Tabel
      const rows = result.details.map(item => {
        totalAmount += item.nominal;

        const dateObj = new Date(item.tanggal);
        const dateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

        // Logika Badge Status
        let statusBadge = '';
        if (item.status === 'Menunggu Konfirmasi') {
          statusBadge = `<br><span class="badge bg-warning text-dark" style="font-size:0.65rem">Menunggu Owner</span>`;
        } else {
          statusBadge = `<br><span class="badge bg-success" style="font-size:0.65rem">Siap Dibayar</span>`;
        }

        return `
          <tr>
            <td class="ps-3 py-3">
              <div class="fw-bold text-dark">${item.lapak_name}</div>
              <small class="text-muted"><i class="bi bi-calendar-event"></i> ${dateStr}</small>
              ${item.produk ? ` <small class="text-info">(${item.produk})</small>` : ''}
              ${statusBadge}
            </td>
            <td class="text-end pe-3 fw-bold text-primary align-middle">
              ${formatCurrency(item.nominal)}
            </td>
          </tr>
        `;
      }).join('');

      tableBody.innerHTML = rows;

      // Ambil total tagihan asli dari dashboard (agar sinkron dengan Card)
      // Karena detail ini hanya 30 hari terakhir, totalnya mungkin beda sedikit jika ada hutang lama
      const cardTotalText = document.getElementById('supplier-total-tagihan').textContent;
      totalEl.textContent = cardTotalText;

      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
    }

  } catch (error) {
    console.error(error);
    loadingEl.innerHTML = `<div class="alert alert-danger m-3">Gagal memuat data: ${error.message}</div>`;
  }
}

async function populateSuperownerDashboard() {
  const loadingEl = document.getElementById('superowner-loading');
  const contentEl = document.getElementById('superowner-content');
  const totalSaldoEl = document.getElementById('superowner-total-saldo');
  const profitBulanIniEl = document.getElementById('superowner-profit-bulan-ini');
  const ownerTerprofitEl = document.getElementById('superowner-owner-terprofit');
  const totalOwnerEl = document.getElementById('superowner-total-owner'); // Elemen baru
  const listContainer = document.getElementById('superowner-owner-list-container'); // Container List

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';

  try {
    const superownerId = AppState.currentUser.user_info.id;
    const resp = await fetch(`/api/get_superowner_dashboard_data/${superownerId}`);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);

    // Isi Card KPI 2x2
    totalSaldoEl.textContent = formatCurrency(result.total_saldo);
    profitBulanIniEl.textContent = formatCurrency(result.kpi.profit_bulan_ini);
    ownerTerprofitEl.textContent = result.kpi.owner_terprofit || "-";

    // Hitung jumlah owner jika backend tidak menyediakan, atau ambil dari array length
    const ownerCount = result.rincian_per_owner ? result.rincian_per_owner.length : 0;
    if (totalOwnerEl) totalOwnerEl.textContent = ownerCount;

    // Isi List Group Rincian Owner (Tampilan Mobile)
    if (result.rincian_per_owner.length === 0) {
      listContainer.innerHTML = `<div class="list-group-item text-center text-muted p-4">Belum ada Owner yang terdaftar.</div>`;
    } else {
      listContainer.innerHTML = result.rincian_per_owner.map(owner => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <h6 class="mb-0 fw-bold">${owner.owner_name}</h6>
            <div class="small text-muted">Saldo Profit:</div>
            <strong class="text-success">${formatCurrency(owner.balance)}</strong>
          </div>
          <div class="btn-group-vertical">
             <button class="btn btn-sm btn-outline-info mb-1" onclick="openProfitDetailPage(${owner.owner_id}, '${owner.owner_name}')">
               <i class="bi bi-eye-fill"></i> Detail
             </button>
             <button class="btn btn-sm btn-success" onclick="openWithdrawModalForOwner(${owner.owner_id}, '${owner.owner_name}', ${owner.balance})" ${owner.balance <= 0 ? 'disabled' : ''}>
               <i class="bi bi-check-circle-fill"></i> Lunas
             </button>
          </div>
        </div>
      `).join('');
    }

    contentEl.style.display = 'block';
  } catch (e) {
    loadingEl.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  } finally {
    loadingEl.style.display = 'none';
  }
}

// FUNGSI BARU 1: Untuk membuka halaman detail
function openProfitDetailPage(ownerId, ownerName) {
  // Simpan data sementara untuk digunakan oleh fungsi berikutnya
  AppState.currentDetailOwner = { id: ownerId, name: ownerName };
  showPage('superowner-profit-detail-page');
}

// FUNGSI BARU 2: Untuk mengisi halaman detail
// (Ganti seluruh fungsi populateSuperownerProfitDetails di index.html)
async function populateSuperownerProfitDetails() {
  const loadingEl = document.getElementById('profit-detail-loading');
  const contentEl = document.getElementById('profit-detail-content');
  const tableBody = document.getElementById('profit-detail-table-body');
  const ownerNameEl = document.getElementById('detail-owner-name');

  const { id, name } = AppState.currentDetailOwner;
  ownerNameEl.textContent = name;

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';

  try {
    const resp = await fetch(`/api/get_superowner_profit_details/${id}`);
    const result = await resp.json();

    if (!result.success) throw new Error(result.message);

    // PERBAIKAN 1: Ganti colspan jadi 4
    if (result.history.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Belum ada riwayat profit dari owner ini.</td></tr>`;
    } else {
      // PERBAIKAN 2: Tambahkan tombol dan panggil FUNGSI BARU
      tableBody.innerHTML = result.history.map(item => `
          <tr>
            <td>${item.tanggal}</td>
            <td>${item.sumber}</td>
            <td class="text-end fw-bold text-success">${formatCurrency(item.profit)}</td>
            <td class="text-center">
              <button class="btn btn-sm btn-info" onclick="showSuperOwnerProfitModal(${item.report_id})">
                <i class="bi bi-eye-fill"></i> Detail
              </button>
            </td>
          </tr>
        `).join('');
    }
    contentEl.style.display = 'block';
  } catch (e) {
    contentEl.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  } finally {
    loadingEl.style.display = 'none';
  }
}


// (Tambahkan fungsi BARU ini di index.html, di bagian SUPEROWNER FUNCTIONS)

async function showSuperOwnerProfitModal(reportId) {
  const container = document.getElementById("invoice-content");
  container.innerHTML = `<div class="text-center p-5"><div class="spinner-border"></div></div>`;
  modals.reportDetail.show(); // Kita tetap pakai modal yang sama

  try {
    // Panggil API BARU yang kita buat
    const resp = await fetch(`/api/get_superowner_report_profit_detail/${reportId}`);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);

    const data = result.data;

    // Ini adalah template HTML SEDERHANA (profit-only)
    container.innerHTML = `
      <table>
        <tr class="top">
          <td colspan="2">
            <table>
              <tr>
                <td class="title"><h4>Rincian Profit</h4></td>
                <td style="text-align: right;">
                  ID Laporan: #${data.id}<br>
                  Tanggal: ${data.tanggal}<br>
                  Status: ${data.status}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr class="information">
          <td colspan="2">
            <table>
              <tr><td>Lapak Sumber:<br><strong>${data.lokasi}</strong></td></tr>
            </table>
          </td>
        </tr>
        <tr class="heading">
          <td>Deskripsi Profit</td>
          <td style="text-align: right;">Jumlah</td>
        </tr>
        <tr class="item">
          <td>Profit untuk Owner</td>
          <td style="text-align: right;">${formatCurrency(data.keuntungan_owner)}</td>
        </tr>
        <tr class="item last">
          <td>Profit untuk SuperOwner</td>
          <td style="text-align: right;">${formatCurrency(data.keuntungan_superowner)}</td>
        </tr>
        <tr class="total">
          <td></td>
          <td style="text-align: right; border-top: 2px solid #eee; font-weight: bold;">
             <strong>Total: ${formatCurrency(data.keuntungan_owner + data.keuntungan_superowner)}</strong>
          </td>
        </tr>
      </table>
    `;
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}
// (Letakkan ini setelah fungsi populateSuperownerProfitDetails)

// (Ganti fungsi 'openWithdrawModal' LAMA)
function openWithdrawModalForOwner(ownerId, ownerName, balance) {
  document.getElementById('withdraw-owner-id').value = ownerId; // <-- Simpan ID
  document.getElementById('withdraw-owner-name-confirm').textContent = ownerName; // <-- Tampilkan Nama
  document.getElementById('withdraw-amount-confirm').textContent = formatCurrency(balance);
  modals.withdraw.show();
}

// (Ganti fungsi 'handleSuperownerWithdraw' LAMA)
async function handleSuperownerWithdrawForOwner() {
  const superownerId = AppState.currentUser.user_info.id;
  const ownerId = document.getElementById('withdraw-owner-id').value; // <-- Ambil ID

  try {
    const resp = await fetch('/api/superowner_withdraw_from_owner', { // <-- Panggil API baru
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ superowner_id: superownerId, owner_id: ownerId }) // <-- Kirim kedua ID
    });
    const result = await resp.json();
    showToast(result.message, result.success);
    if (result.success) {
      modals.withdraw.hide();
      await populateSuperownerDashboard(); // Refresh dashboard
    }
  } catch (e) {
    showToast('Gagal terhubung ke server.', false);
  }
}

// GANTI FUNGSI LAMA DENGAN VERSI BARU INI
async function populateSuperownerReports() {
  const loadingEl = document.getElementById('superowner-reports-loading');
  const contentEl = document.getElementById('superowner-reports-content');

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';
  contentEl.innerHTML = ''; // Kosongkan konten lama

  // (Sekitar baris 2319 di index.html)
  try {
    const superownerId = AppState.currentUser.user_info.id;

    // === LOGIKA FILTER BARU ===
    const params = new URLSearchParams();
    const startDate = document.getElementById('so-report-start-date').value;
    const endDate = document.getElementById('so-report-end-date').value;
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    // === AKHIR LOGIKA BARU ===

    // 1. PANGGIL API BARU KITA DENGAN PARAMETER
    const resp = await fetch(`/api/get_superowner_owner_reports/${superownerId}?${params.toString()}`);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);

    if (result.reports.length === 0) {
      contentEl.innerHTML = `<div class="alert alert-info text-center">Belum ada laporan profit dari owner manapun.</div>`;
    } else {
      // 2. BANGUN TAMPILAN ACCORDION
      contentEl.innerHTML = result.reports.map((r, index) => {
        // Buat daftar lapak (sesuai permintaan Anda)
        const lapakListHtml = r.lapak_names.length === 0
          ? '<li class="list-group-item text-muted">Owner ini belum memiliki lapak.</li>'
          : r.lapak_names.map(name => `<li class="list-group-item">${name}</li>`).join('');

        const isFirstItem = index === 0;

        return `
                <div class="accordion-item">
                  <h2 class="accordion-header" id="heading-owner-${r.owner_id}">
                    <button class="accordion-button ${isFirstItem ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-owner-${r.owner_id}">
                      <strong>${r.owner_name}</strong>
                    </button>
                  </h2>
                  <div id="collapse-owner-${r.owner_id}" class="accordion-collapse collapse ${isFirstItem ? 'show' : ''}" data-bs-parent="#superowner-reports-content">
                    <div class="accordion-body">
                      <div class="row g-4">
                        <div class="col-md-5">
                          <h6>Daftar Lapak</h6>
                          <ul class="list-group list-group-flush">${lapakListHtml}</ul>
                        </div>
                        <div class="col-md-7">
                          <h6>Ringkasan Keuangan (Terkonfirmasi)</h6>
                          <table class="table table-sm table-bordered">
                            <tbody>
                              <tr>
                                <td>Total Biaya ke Supplier</td>
                                <td class="text-end fw-bold">${formatCurrency(r.total_biaya_supplier)}</td>
                              </tr>
                              <tr>
                                <td>Total Pendapatan Owner</td>
                                <td class="text-end fw-bold text-success">${formatCurrency(r.total_keuntungan_owner)}</td>
                              </tr>
                              <tr>
                                <td>Total Pendapatan Superowner</td>
                                <td class="text-end fw-bold text-primary">${formatCurrency(r.total_keuntungan_superowner)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              `;
      }).join('');
    }
    // 3. Ubah display menjadi 'block' (bukan 'flex' lagi)
    contentEl.style.display = 'block';
  } catch (e) {
    contentEl.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    contentEl.style.display = 'block';
  } finally {
    loadingEl.style.display = 'none';
  }
}

// FUNGSI BARU 4: Untuk mengisi halaman Riwayat Penarikan
// (Ganti fungsi lama di baris 2359)
async function populateSuperownerTransactions() {
  const loadingEl = document.getElementById('so-tx-loading');
  const contentEl = document.getElementById('so-tx-content');
  const tableBody = document.getElementById('so-tx-table-body');

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';
  tableBody.innerHTML = '';

  // === LOGIKA FILTER BARU ===
  const params = new URLSearchParams();
  const advancedFilterEl = document.getElementById('so-advanced-tx-filter');
  const isAdvanced = advancedFilterEl.classList.contains('show');
  let startDate, endDate;

  if (isAdvanced) {
    startDate = document.getElementById('so-tx-start-date').value;
    endDate = document.getElementById('so-tx-end-date').value;
  } else {
    const dailyDate = document.getElementById('so-tx-daily-date').value;
    startDate = dailyDate;
    endDate = dailyDate;
  }

  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  // === AKHIR LOGIKA FILTER ===

  try {
    const superownerId = AppState.currentUser.user_info.id;
    const resp = await fetch(`/api/get_superowner_transactions/${superownerId}?${params.toString()}`);
    const result = await resp.json();

    if (!result.success) throw new Error(result.message);

    if (result.transactions.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Tidak ada transaksi pada rentang tanggal ini.</td></tr>`;
    } else {
      tableBody.innerHTML = result.transactions.map(tx => {
        const isProfit = tx.tipe === 'profit';
        const badge = isProfit
          ? `<span class="badge bg-success">Profit Masuk</span>`
          : `<span class="badge bg-danger">Penarikan</span>`;
        const amountClass = isProfit ? 'text-success' : 'text-danger';
        const amountPrefix = isProfit ? '+' : ''; // Tanda minus sudah ada dari backend

        return `
              <tr>
                <td>${new Date(tx.tanggal + 'T00:00:00').toLocaleDateString('id-ID')}</td>
                <td>${tx.keterangan}</td>
                <td>${badge}</td>
                <td class="text-end fw-bold ${amountClass}">${amountPrefix}${formatCurrency(tx.jumlah)}</td>
              </tr>
            `;
      }).join('');
    }
    contentEl.style.display = 'block';
  } catch (e) {
    loadingEl.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  } finally {
    loadingEl.style.display = 'none';
  }
}

// (Letakkan ini di dalam SUPEROWNER FUNCTIONS)

// FUNGSI BARU 1: Untuk mengisi halaman Manajemen Owner
async function populateSuperownerManageOwners() {
  const tableBody = document.getElementById('superowner-owners-table-body');
  tableBody.innerHTML = `<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm"></div></td></tr>`;
  try {
    const superownerId = AppState.currentUser.user_info.id;
    const resp = await fetch(`/api/get_superowner_owners/${superownerId}`);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);
    if (result.owners.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Belum ada Owner yang terdaftar.</td></tr>`;
    } else {
      tableBody.innerHTML = result.owners.map(o => `
                      <tr>
                          <td>${o.nama_lengkap}</td><td>${o.username}</td><td>${o.email}</td><td>${o.nomor_kontak}</td>
                          <td class="password-cell"><span class="password-text me-2" data-password="${o.password}">••••••••</span><i class="bi bi-eye-slash" style="cursor: pointer;" onclick="toggleTablePasswordVisibility(this)"></i></td>
                          <td><div class="btn-group">
                              <button class="btn btn-sm btn-warning" onclick='openSuperownerEditOwnerModal(${o.id})'><i class="bi bi-pencil-fill"></i></button>
                              <button class="btn btn-sm btn-danger" onclick='handleSuperownerDeleteOwner(${o.id})'><i class="bi bi-trash-fill"></i></button>
                          </div></td>
                      </tr>`).join('');
    }
  } catch (e) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">${e.message}</td></tr>`;
  }
}

// GANTI FUNGSI LAMA DENGAN VERSI BARU INI
async function openSuperownerEditOwnerModal(id = null) {
  const form = document.getElementById("superowner-edit-owner-form");
  form.reset();
  const isEdit = id !== null;
  document.getElementById("superowner-owner-modal-title").textContent = isEdit ? "Edit Owner" : "Tambah Owner Baru";
  document.getElementById("superowner-edit-owner-id").value = id || "";

  if (isEdit) {
    // Logika untuk Mode EDIT
    const superownerId = AppState.currentUser.user_info.id;
    const resp = await fetch(`/api/get_superowner_owners/${superownerId}`);
    const result = await resp.json();
    const ownerData = result.owners.find(o => o.id === id);
    if (ownerData) {
      document.getElementById("superowner-edit-owner-nama").value = ownerData.nama_lengkap;
      document.getElementById("superowner-edit-owner-username").value = ownerData.username;
      document.getElementById("superowner-edit-owner-email").value = ownerData.email;
      document.getElementById("superowner-edit-owner-kontak").value = ownerData.nomor_kontak;
    }
  }
  // Untuk mode TAMBAH BARU, kita tidak melakukan apa-apa,
  // sehingga form NIK akan kosong dan siap diisi manual.

  modals.superownerEditOwner.show();
}

// FUNGSI BARU 3: Untuk submit form Owner
async function handleSuperownerOwnerFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const id = form.elements["superowner-edit-owner-id"].value;
  const isEdit = id !== "";
  const url = isEdit ? `/api/update_admin/${id}` : `/api/add_admin`;
  const method = isEdit ? "PUT" : "POST";
  const password = form.elements["superowner-edit-owner-password"].value;
  const passwordConfirm = form.elements["superowner-edit-owner-password-confirm"].value;
  if (password && password !== passwordConfirm) return showToast("Password dan konfirmasi tidak cocok.", false);

  const payload = {
    nama_lengkap: form.elements["superowner-edit-owner-nama"].value,
    username: form.elements["superowner-edit-owner-username"].value,
    email: form.elements["superowner-edit-owner-email"].value,
    nomor_kontak: form.elements["superowner-edit-owner-kontak"].value,
    password, password_confirm: passwordConfirm,
    super_owner_id: AppState.currentUser.user_info.id // Kirim ID Superowner
  };

  const resp = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await resp.json();
  showToast(result.message, resp.ok);
  if (resp.ok) {
    modals.superownerEditOwner.hide();
    await populateSuperownerManageOwners();
  }
}

// FUNGSI BARU 4: Untuk menghapus Owner
async function handleSuperownerDeleteOwner(id) {
  if (!confirm("Yakin ingin menghapus Owner ini?")) return;
  const resp = await fetch(`/api/delete_admin/${id}`, { method: 'DELETE' });
  const result = await resp.json();
  showToast(result.message, resp.ok);
  if (resp.ok) await populateSuperownerManageOwners();
}

// --- APP INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  modals.admin = new bootstrap.Modal(
    document.getElementById("edit-admin-modal")
  );
  modals.lapak = new bootstrap.Modal(
    document.getElementById("edit-lapak-modal")
  );
  modals.supplier = new bootstrap.Modal(
    document.getElementById("edit-supplier-modal")
  );
  modals.payment = new bootstrap.Modal(
    document.getElementById("payment-confirmation-modal")
  );
  modals.reportDetail = new bootstrap.Modal(
    document.getElementById("report-detail-modal")
  );
  // PERUBAHAN 7: Inisialisasi modal baru

  modals.aturProduk = new bootstrap.Modal(
    document.getElementById("atur-produk-modal")
  );
  modals.withdraw = new bootstrap.Modal(document.getElementById("superowner-withdraw-modal")
  );
  modals.superownerEditOwner = new bootstrap.Modal(document.getElementById("superowner-edit-owner-modal")
  );
  const rekapCollapseEl = document.getElementById('rekap-manual-collapse');
  if (rekapCollapseEl) {
    const rekapText = document.getElementById('toggle-rekap-text');
    const rekapIcon = document.getElementById('toggle-rekap-icon');

    // Saat akan ditampilkan (show)
    rekapCollapseEl.addEventListener('show.bs.collapse', event => {
      rekapText.textContent = 'Sembunyikan Input';
      rekapIcon.classList.remove('bi-chevron-up');
      rekapIcon.classList.add('bi-chevron-down');
    });

    // Saat akan disembunyikan (hide)
    rekapCollapseEl.addEventListener('hide.bs.collapse', event => {
      rekapText.textContent = 'Input Hasil Penjualan';
      rekapIcon.classList.remove('bi-chevron-down');
      rekapIcon.classList.add('bi-chevron-up');
    });
  }
  const todayISO = new Date().toISOString().split("T")[0];
  ["laporan-pendapatan-datepicker", "laporan-biaya-datepicker"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.value = todayISO;
    }
  );
  document
    .getElementById("login-form")
    .addEventListener("submit", handleLogin);
  document
    .getElementById("edit-admin-form")
    .addEventListener("submit", (e) => handleFormSubmit("admin", e));
  document
    .getElementById("edit-lapak-form")
    .addEventListener("submit", (e) => handleFormSubmit("lapak", e));
  document
    .getElementById("edit-supplier-form")
    .addEventListener("submit", (e) => handleFormSubmit("supplier", e));
  document
    .getElementById("payment-confirmation-form")
    .addEventListener("submit", handlePaymentSubmit);
  // ... (setelah listener handlePaymentSubmit)
  // TAMBAHAN: Event listener untuk form tambah produk di modal
  document
    .getElementById("add-product-to-supplier-form")
    .addEventListener("submit", handleAddNewProduct);

  // PERUBAHAN 8: Tambahkan event listener untuk form manual


  const lpd = document.getElementById("laporan-pendapatan-datepicker");
  if (lpd) lpd.addEventListener("change", populateLaporanPendapatan);
  const lbd = document.getElementById("laporan-biaya-datepicker");
  if (lbd) lbd.addEventListener("change", populateLaporanBiaya);
  document
    .getElementById("kirim-laporan-btn")
    .addEventListener("click", handleKirimLaporan);
  // Pasang event listener untuk input footer DI SINI
  document.querySelectorAll(".rekap-input").forEach(input => {
    input.addEventListener("input", formatNumberInput); // Untuk format angka
    input.addEventListener("keyup", updateSummarySection); // Untuk kalkulasi ulang
  });
  document.getElementById("superowner-edit-owner-form").addEventListener("submit", handleSuperownerOwnerFormSubmit);
  const filterBtn = document.getElementById('supplier-history-filter-btn');
  if (filterBtn) {
    filterBtn.addEventListener('click', populateSupplierHistoryPage);
  }
  const manageReportsFilterBtn = document.getElementById('manage-reports-filter-btn');
  if (manageReportsFilterBtn) {
    manageReportsFilterBtn.addEventListener('click', populateManageReportsPage);
  }

  const paymentHistoryFilterBtn = document.getElementById('payment-history-filter-btn');
  if (paymentHistoryFilterBtn) {
    paymentHistoryFilterBtn.addEventListener('click', populatePaymentHistory);
  }

  // (Letakkan ini di dalam 'DOMContentLoaded', setelah listener 'paymentHistoryFilterBtn')
  // (Sekitar baris 2514 di index.html)
  // Listener untuk filter status baru
  document.getElementById('manage-reports-status-filter').addEventListener('change', populateManageReportsPage);

  // Listener untuk filter harian MANAJEMEN LAPORAN
  document.getElementById('manage-reports-daily-date').addEventListener('change', () => {
    bootstrap.Collapse.getOrCreateInstance('#advanced-reports-filter').hide();
    populateManageReportsPage();
  });
  document.getElementById('manage-reports-prev-day').addEventListener('click', () => changeReportDate(-1));
  document.getElementById('manage-reports-next-day').addEventListener('click', () => changeReportDate(1));

  // (Letakkan ini di dalam 'DOMContentLoaded', setelah listener 'manage-reports-next-day')

  // Listener untuk filter harian RIWAYAT PEMBAYARAN
  document.getElementById('payment-history-daily-date').addEventListener('change', () => {
    bootstrap.Collapse.getOrCreateInstance('#advanced-payment-filter').hide();
    populatePaymentHistory();
  });
  document.getElementById('payment-history-prev-day').addEventListener('click', () => changePaymentDate(-1));
  document.getElementById('payment-history-next-day').addEventListener('click', () => changePaymentDate(1));
  // Listener untuk select metode (karena sekarang di luar)
  document.getElementById('payment-history-method').addEventListener('change', () => {
    // Jika filter harian aktif, refresh. Jika filter canggih, jangan lakukan apa-apa (tunggu tombol apply)
    const isAdvanced = document.getElementById('advanced-payment-filter').classList.contains('show');
    if (!isAdvanced) {
      populatePaymentHistory();
    }
  });

  // (Letakkan ini di dalam 'DOMContentLoaded', setelah listener 'payment-history-method')

  // Listener untuk filter baru di tab "Tagihan Saat Ini"
  document.getElementById('tagihan-metode-filter').addEventListener('change', populatePembayaranPage);

  // (Sekitar baris 2531 di index.html)
  // Listener untuk filter di halaman SO Manage Reports
  const soReportFilterBtn = document.getElementById('so-report-filter-btn');
  if (soReportFilterBtn) {
    soReportFilterBtn.addEventListener('click', populateSuperownerReports);
  }
  // (Sekitar baris 2538 di index.html)

  // Listener untuk halaman baru SO Transactions
  const soTxDailyDate = document.getElementById('so-tx-daily-date');
  if (soTxDailyDate) soTxDailyDate.addEventListener('change', () => {
    bootstrap.Collapse.getOrCreateInstance('#so-advanced-tx-filter').hide();
    populateSuperownerTransactions();
  });

  const soTxPrevDay = document.getElementById('so-tx-prev-day');
  if (soTxPrevDay) soTxPrevDay.addEventListener('click', () => changeSuperownerTxDate(-1));

  const soTxNextDay = document.getElementById('so-tx-next-day');
  if (soTxNextDay) soTxNextDay.addEventListener('click', () => changeSuperownerTxDate(1));

  const soTxFilterBtn = document.getElementById('so-tx-filter-btn');
  if (soTxFilterBtn) soTxFilterBtn.addEventListener('click', populateSuperownerTransactions);
  const ownerSupplierSelect = document.getElementById('owner-supplier-select');
  if (ownerSupplierSelect) {
    // Listener ini memastikan data tampil saat supplier DIPILIH
    ownerSupplierSelect.addEventListener('change', fetchAndDisplayOwnerSupplierHistory);
  }
  const chartFilterBtn = document.getElementById('chart-filter-btn');
  if (chartFilterBtn) {
    chartFilterBtn.addEventListener('click', fetchAndDrawCharts);
  }
  const ownerHistoryFilterBtn = document.getElementById('owner-history-filter-btn');
  if (ownerHistoryFilterBtn) {
    // Listener ini memastikan data ter-filter saat tombol DIKLIK
    ownerHistoryFilterBtn.addEventListener('click', fetchAndDisplayOwnerSupplierHistory);
  }
  /*const searchInput = document.getElementById('product-search-input');
  if (searchInput) {
      searchInput.addEventListener('input', filterReportTables);
  }*/
  // Tambahkan ini di dalam DOMContentLoaded
  modals.billDetail = new bootstrap.Modal(document.getElementById("bill-detail-modal"));
  modals.supplierBillDetail = new bootstrap.Modal(document.getElementById("supplier-bill-detail-modal"));
  // Tambahkan ini
  modals.editProduct = new bootstrap.Modal(document.getElementById("edit-product-modal"));
  document.getElementById("edit-product-form").addEventListener("submit", handleEditProductSubmit);
  manageFooterVisibility();
  handleAuthRouting();
  updateDate();
});
// Fungsi untuk memfilter baris tabel berdasarkan input pencarian
document.addEventListener('DOMContentLoaded', function () {
  const searchInput = document.getElementById('main-report-search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', function () {
    const filter = this.value.toLowerCase();
    const tables = document.querySelectorAll('#report-tables-container table tbody');

    tables.forEach(tbody => {
      const rows = tbody.querySelectorAll('tr');
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(filter) ? '' : 'none';
      });
    });
  });
});