// app.js (module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  // <-- REPLACE with your firebase config
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ------------------- UI & navigation ------------------- */
const views = document.querySelectorAll('.view');
const navButtons = document.querySelectorAll('.sidebar nav button');
const currentUserSpan = document.getElementById('currentUser');
const logoutBtn = document.getElementById('logoutBtn');
const toast = document.getElementById('toast');

function showView(name){
  views.forEach(v=> v.id === `view-${name}` ? v.classList.add('active') : v.classList.remove('active'));
  navButtons.forEach(btn => btn.dataset.view === name ? btn.classList.add('active') : btn.classList.remove('active'));
}
navButtons.forEach(b=> b.addEventListener('click', ()=> showView(b.dataset.view)));

/* ------------ Toast ------------ */
function showToast(msg){
  toast.innerText = msg; toast.style.display = 'block';
  setTimeout(()=> toast.style.display = 'none', 2500);
}

/* ------------ Auth (simple) ------------
  For demo: if no user logged in, prompt to sign in via window.prompt (or build login UI)
*/
onAuthStateChanged(auth, user => {
  if(user){
    currentUserSpan.textContent = user.email;
    // initial loads
    loadExpensesRealtime();
    loadEggsRealtime();
    loadFeedRealtime();
    loadEmployeesRealtime();
    loadMortalityRealtime();
    loadAttendanceRealtime();
    updateDashboardKPIs();
  } else {
    // quick sign-in for demo (replace with proper UI)
    const email = prompt("Sign in email (demo):");
    const pwd = prompt("Password:");
    if(email && pwd){
      signInWithEmailAndPassword(auth, email, pwd)
      .catch(async err => {
        // try create account
        await createUserWithEmailAndPassword(auth, email, pwd).catch(()=>{});
      });
    }
  }
});

logoutBtn.addEventListener('click', ()=> {
  signOut(auth).then(()=> location.reload());
});

/* ----------------- Collections ----------------- */
const expensesCol = collection(db, 'expenses');
const eggsCol = collection(db, 'eggs');
const feedCol = collection(db, 'feed_consumption');
const empCol = collection(db, 'employees');
const attCol = collection(db, 'attendance');
const mortCol = collection(db, 'mortality');

/* ----------------- Forms handling ----------------- */
// Expenses
const formExpense = document.getElementById('form-expense');
const tableExpenses = document.getElementById('table-expenses');
formExpense.addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(formExpense);
  await addDoc(expensesCol, {
    date: f.get('date'),
    category: f.get('category'),
    amount: Number(f.get('amount')),
    notes: f.get('notes') || '',
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser ? auth.currentUser.uid : 'anon'
  });
  formExpense.reset();
  showToast('Expense added');
});

// Eggs
const formEggs = document.getElementById('form-eggs');
formEggs.addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(formEggs);
  await addDoc(eggsCol, {
    date: f.get('date'),
    shed: f.get('shed'),
    collected: Number(f.get('collected')),
    broken: Number(f.get('broken')||0),
    createdAt: serverTimestamp()
  });
  formEggs.reset();
  showToast('Egg record saved');
});

// Feed
const formFeed = document.getElementById('form-feed');
formFeed.addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(formFeed);
  await addDoc(feedCol, {
    date: f.get('date'),
    shed: f.get('shed'),
    kg: Number(f.get('kg')),
    createdAt: serverTimestamp()
  });
  formFeed.reset();
  showToast('Feed record saved');
});

// Employees
const formEmp = document.getElementById('form-emp');
const tableEmp = document.getElementById('table-emp');
formEmp.addEventListener('submit', async e=>{
  e.preventDefault();
  const f = new FormData(formEmp);
  await addDoc(empCol, {
    name: f.get('name'),
    phone: f.get('phone'),
    role: f.get('role'),
    createdAt: serverTimestamp()
  });
  formEmp.reset();
  showToast('Employee added');
});

// Attendance
const formAtt = document.getElementById('form-att');
const tableAtt = document.getElementById('table-att');
formAtt.addEventListener('submit', async e=>{
  e.preventDefault();
  const f = new FormData(formAtt);
  await addDoc(attCol, {
    date: f.get('date'),
    employee: f.get('employee'),
    status: f.get('status'),
    createdAt: serverTimestamp()
  });
  formAtt.reset();
  showToast('Attendance marked');
});

// Mortality
const formMort = document.getElementById('form-mort');
const tableMort = document.getElementById('table-mort');
formMort.addEventListener('submit', async e=>{
  e.preventDefault();
  const f = new FormData(formMort);
  await addDoc(mortCol, {
    date: f.get('date'),
    shed: f.get('shed'),
    count: Number(f.get('count')),
    reason: f.get('reason') || '',
    createdAt: serverTimestamp()
  });
  formMort.reset();
  showToast('Mortality reported');
});

/* ----------------- Real-time listeners & render ----------------- */

function renderTable(tableEl, headers, rows){
  let html = '<thead><tr>' + headers.map(h=>`<th>${h}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach(r=> {
    html += '<tr>' + r.map(c=>`<td>${c}</td>`).join('') + '</tr>';
  });
  html += '</tbody>';
  tableEl.innerHTML = html;
}

/* Expenses realtime */
function loadExpensesRealtime(){
  onSnapshot(query(expensesCol, orderBy('createdAt','desc')), snap => {
    const rows = [];
    let todayTotal = 0;
    snap.forEach(doc=>{
      const d = doc.data();
      rows.push([d.date||'', d.category||'', d.amount||0, d.notes||'']);
      // if today
      const today = new Date().toISOString().slice(0,10);
      if(d.date === today) todayTotal += (d.amount||0);
    });
    renderTable(tableExpenses, ['Date','Category','Amount','Notes'], rows);
    document.getElementById('kpi-expense').innerText = todayTotal;
    updateDashboardKPIs();
  });
}

/* Eggs realtime */
function loadEggsRealtime(){
  onSnapshot(query(eggsCol, orderBy('createdAt','desc')), snap => {
    const rows = [];
    let todayEggs = 0;
    // weekly aggregation for chart
    const weekly = {};
    const today = new Date();
    for(let i=6;i>=0;i--){ const d = new Date(today); d.setDate(today.getDate()-i); weekly[d.toISOString().slice(0,10)] = 0; }

    snap.forEach(doc=>{
      const d = doc.data();
      rows.push([d.date||'', d.shed||'', d.collected||0, d.broken||0]);
      if(d.date === new Date().toISOString().slice(0,10)) todayEggs += d.collected||0;
      if(weekly.hasOwnProperty(d.date)) weekly[d.date] += d.collected||0;
    });
    renderTable(document.getElementById('table-eggs'), ['Date','Shed','Collected','Broken'], rows);
    document.getElementById('kpi-eggs').innerText = todayEggs;
    renderWeeklyChart(Object.keys(weekly), Object.values(weekly));
    updateDashboardKPIs();
  });
}

/* Feed realtime */
function loadFeedRealtime(){
  onSnapshot(query(feedCol, orderBy('createdAt','desc')), snap => {
    const rows = [];
    let feedWeekTotal = 0;
    snap.forEach(doc=>{
      const d = doc.data();
      rows.push([d.date||'', d.shed||'', d.kg||0]);
      feedWeekTotal += d.kg || 0;
    });
    renderTable(document.getElementById('table-feed'), ['Date','Shed','Kg'], rows);
    updateDashboardKPIs();
  });
}

/* Employees realtime */
function loadEmployeesRealtime(){
  onSnapshot(query(empCol, orderBy('createdAt','desc')), snap => {
    const rows = [];
    const empSelect = document.getElementById('att-employee');
    empSelect.innerHTML = '';
    snap.forEach(doc=>{
      const d = doc.data();
      rows.push([d.name||'', d.phone||'', d.role||'']);
      const opt = document.createElement('option');
      opt.value = d.name || '';
      opt.textContent = d.name || '';
      empSelect.appendChild(opt);
    });
    renderTable(tableEmp, ['Name','Phone','Role'], rows);
    updateDashboardKPIs();
  });
}

/* Attendance realtime */
function loadAttendanceRealtime(){
  onSnapshot(query(attCol, orderBy('createdAt','desc')), snap => {
    const rows = [];
    let presentCount = 0, total = 0;
    snap.forEach(doc=>{
      const d = doc.data();
      rows.push([d.date||'', d.employee||'', d.status||'']);
      if(d.status === 'Present') presentCount++;
      total++;
    });
    renderTable(tableAtt, ['Date','Employee','Status'], rows);
    document.getElementById('kpi-staff').innerText = `${presentCount}/${Math.max(1,total)}`;
    updateDashboardKPIs();
  });
}

/* Mortality realtime */
function loadMortalityRealtime(){
  onSnapshot(query(mortCol, orderBy('createdAt','desc')), snap => {
    const rows = []; let todayMort = 0;
    snap.forEach(doc=>{
      const d = doc.data();
      rows.push([d.date||'', d.shed||'', d.count||0, d.reason||'']);
      if(d.date === new Date().toISOString().slice(0,10)) todayMort += d.count||0;
    });
    renderTable(tableMort, ['Date','Shed','Count','Reason'], rows);
    document.getElementById('kpi-mortality').innerText = todayMort;
    updateDashboardKPIs();
  });
}

/* ------------------ Dashboard chart ------------------ */
let chartInstance = null;
function renderWeeklyChart(labels, values){
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  if(chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Eggs', data: values, borderColor: '#16a34a', fill:false, tension:0.2 }
      ]
    },
    options: { responsive:true, plugins:{legend:{display:true}}}
  });
}

/* ------------------ Exports ------------------ */
document.getElementById('btn-export-expenses').addEventListener('click', async ()=>{
  const q = query(expensesCol, orderBy('createdAt','desc'));
  const snap = await getDocs(q);
  const rows=[['Date','Category','Amount','Notes']];
  snap.forEach(doc=> rows.push([doc.data().date, doc.data().category, doc.data().amount, doc.data().notes]));
  downloadCSV(rows,'expenses.csv');
});
document.getElementById('btn-export-eggs').addEventListener('click', async ()=>{
  const q = query(eggsCol, orderBy('createdAt','desc'));
  const snap = await getDocs(q);
  const rows=[['Date','Shed','Collected','Broken']];
  snap.forEach(doc=> rows.push([doc.data().date, doc.data().shed, doc.data().collected, doc.data().broken]));
  downloadCSV(rows,'eggs.csv');
});
function downloadCSV(rows, filename){
  const csv = rows.map(r=> r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

/* ------------------ KPI updater (light) ------------------ */
async function updateDashboardKPIs(){
  // Summaries are already updated by listeners; this can hold extra logic if needed
}

/* ------------------ Helper (realtime listeners set up earlier) ------------------ */
// already hooked up when auth state changes

// end of app.js
