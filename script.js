function renderSubmissions() {
    const listEl = document.getElementById('submissionsList');
    const congrats = document.getElementById('submissionsCongrats');
    const congratsText = document.getElementById('submissionsCongratsText');
    if (!listEl) return;
    const email = userData?.email || '';
    const mine = submissionsStore.filter(s => s.submittedBy === email);
    if (mine.length === 0) {
        listEl.innerHTML = '<div class="no-data">No submissions yet. Use Upload Survey to submit your first request.</div>';
        if (congrats) congrats.style.display = 'none';
        return;
    }
    // Show a congrats banner if any recently approved item (last 24h)
    const now = Date.now();
    const recentlyApproved = mine.find(s => s.status === 'approved' && now - new Date(s.updatedAt).getTime() < 24*3600*1000);
    if (congrats) {
        if (recentlyApproved) {
            congrats.style.display = 'block';
            if (congratsText) {
                congratsText.textContent = `Congratulations! Your survey was approved. Token ID: ${recentlyApproved.tokenId || ''}`;
            }
        } else {
            congrats.style.display = 'none';
        }
    }
    listEl.innerHTML = mine.sort((a,b)=> new Date(b.updatedAt) - new Date(a.updatedAt)).map(s => `
        <div class="approval-card">
            <div class="approval-header">
                <h3 class="approval-title">Survey #${s.details?.surveyNumber || ''}</h3>
                <span class="status-badge ${s.status}">${s.status.toUpperCase()}</span>
            </div>
            <div class="approval-details">
                <div class="detail-item"><span class="detail-label">District</span><span class="detail-value">${s.details?.district || ''}</span></div>
                <div class="detail-item"><span class="detail-label">Village</span><span class="detail-value">${s.details?.village || ''}</span></div>
                <div class="detail-item"><span class="detail-label">Updated</span><span class="detail-value">${new Date(s.updatedAt).toLocaleString()}</span></div>
                ${s.tokenId ? `<div class="detail-item"><span class="detail-label">Token ID</span><span class="detail-value">${s.tokenId}</span></div>` : ''}
            </div>
            <div class="approval-actions">
                ${s.status === 'approved' && s.plotCode ? `<button class="btn btn-outline" onclick="openPropertyDemo('${s.plotCode}','Property')"><i class=\"fas fa-eye\"></i> View</button>` : ''}
            </div>
        </div>
    `).join('');
}
// ===== Property search (open to all users) =====
function propertySearch() {
    const input = document.getElementById('propertySearchInput');
    const term = (input?.value || '').trim();
    const resultsContainer = document.getElementById('propertySearchResults');
    if (!term) {
        showNotification('Enter Token ID or Plot Code', 'error');
        return;
    }
    resultsContainer.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
    setTimeout(() => {
        const results = [];
        const tokenData = localStorage.getItem(`token_${term}`);
        if (tokenData) results.push({ type: 'token', data: JSON.parse(tokenData) });
        const plotData = localStorage.getItem(`plot_${term}`);
        if (plotData) results.push({ type: 'plot', data: JSON.parse(plotData) });
        if (results.length === 0) {
            // Try mappings
            const maps = JSON.parse(localStorage.getItem('token_mappings') || '[]');
            const matches = maps.filter(m => m.tokenId.toLowerCase().includes(term.toLowerCase()) || m.plotCode.toLowerCase().includes(term.toLowerCase()));
            matches.forEach(m => {
                const pdata = localStorage.getItem(`plot_${m.plotCode}`);
                if (pdata) results.push({ type: 'mapping', data: JSON.parse(pdata) });
            });
        }
        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No property found. Try a valid Token ID or Plot Code.</div>';
            return;
        }
        resultsContainer.innerHTML = `
            <div class="search-results-list">
                ${results.map(r => `
                    <div class=\"search-result-card\">
                        <div class=\"result-header\">
                            <h4>${r.data.plotCode}</h4>
                            <span class=\"result-type\">${r.type.toUpperCase()}</span>
                        </div>
                        <div class=\"result-details\">
                            <div class=\"detail-row\"><span class=\"label\">Token ID:</span><span class=\"value\">${r.data.tokenId}</span></div>
                            <div class=\"detail-row\"><span class=\"label\">Location:</span><span class=\"value\">${r.data.location?.district || ''}, ${r.data.location?.village || ''}</span></div>
                        </div>
                        <div class=\"result-actions\">
                            <button class=\"btn btn-primary\" onclick=\"openPropertyDemo('${r.data.plotCode}','Property','')\"><i class=\"fas fa-eye\"></i> View Badges</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }, 300);
}
// Global state management
let currentUser = null;
let userData = null;
let map = null;
let polygonLayer = null;
let pendingApprovals = [];
let tokenizedLands = [];
let registeredUsers = [];
let drawingMode = false;
let drawnItems = null;
let uploadMap = null;
let uploadDrawnItems = null;

// ZK and consent demo stores
let zkClaimsStore = []; // { plotCode, claims: { ownershipVerified, cleanTitleCount, floodRiskOk, eqZoneOk, areaSqft, registered } , proof: {root, inputs} }
let consentRequestsStore = []; // { id, plotCode, requesterRole, requesterName, requesterOrg, scope: ['ownerId','saleDeed'], status, ts }
let clientAccessStore = []; // { clientEmail, plotCode, scope, approvedAt }

// New domain stores (persisted in localStorage)
let plotsStore = []; // Plot { plot_id, polygon_geojson, survey_no, village, district, gov_source_ids[], last_gov_fetch_ts, gov_hash }
let ownershipRecordsStore = []; // OwnershipRecord { owner_id_hash, name_redacted, gov_document_ref, ec_ref[] }
let encumbranceRecordsStore = []; // EncumbranceRecord { encumbrance_id, type, source, registered_date, status, raw_doc_uri, hash, verified_by }
let verificationLogsStore = []; // VerificationLog { who, method, ts, proof_hash }
let rawGovDocsStore = []; // { id, type: 'gov_json'|'gov_pdf', filename, size, hash, storedAt, rawRef }
let anchorQueue = []; // array of hashes pending anchoring
let submissionsStore = []; // { id, status, submittedBy, details, tokenId?, plotCode?, updatedAt }
let activityStore = []; // { id, type, message, meta, ts }

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    loadMockData();
    loadPersistentStores();
    checkAuthStatus();
});

// Initialize application
function initializeApp() {
    console.log('Naks.io Land Tokenization Platform initialized');
}

// ===== Persistence Helpers =====
function loadPersistentStores() {
    plotsStore = JSON.parse(localStorage.getItem('naks_plots') || '[]');
    ownershipRecordsStore = JSON.parse(localStorage.getItem('naks_ownership_records') || '[]');
    encumbranceRecordsStore = JSON.parse(localStorage.getItem('naks_encumbrance_records') || '[]');
    verificationLogsStore = JSON.parse(localStorage.getItem('naks_verification_logs') || '[]');
    rawGovDocsStore = JSON.parse(localStorage.getItem('naks_raw_gov_docs') || '[]');
    anchorQueue = JSON.parse(localStorage.getItem('naks_anchor_queue') || '[]');
    zkClaimsStore = JSON.parse(localStorage.getItem('naks_zk_claims') || '[]');
    consentRequestsStore = JSON.parse(localStorage.getItem('naks_consent_requests') || '[]');
    clientAccessStore = JSON.parse(localStorage.getItem('naks_client_access') || '[]');
    submissionsStore = JSON.parse(localStorage.getItem('naks_submissions') || '[]');
    activityStore = JSON.parse(localStorage.getItem('naks_activity') || '[]');
}

function persistStores() {
    localStorage.setItem('naks_plots', JSON.stringify(plotsStore));
    localStorage.setItem('naks_ownership_records', JSON.stringify(ownershipRecordsStore));
    localStorage.setItem('naks_encumbrance_records', JSON.stringify(encumbranceRecordsStore));
    localStorage.setItem('naks_verification_logs', JSON.stringify(verificationLogsStore));
    localStorage.setItem('naks_raw_gov_docs', JSON.stringify(rawGovDocsStore));
    localStorage.setItem('naks_anchor_queue', JSON.stringify(anchorQueue));
    localStorage.setItem('naks_zk_claims', JSON.stringify(zkClaimsStore));
    localStorage.setItem('naks_consent_requests', JSON.stringify(consentRequestsStore));
    localStorage.setItem('naks_client_access', JSON.stringify(clientAccessStore));
    localStorage.setItem('naks_submissions', JSON.stringify(submissionsStore));
    localStorage.setItem('naks_activity', JSON.stringify(activityStore));
}

// ===== Crypto & Merkle Utilities =====
async function sha256Hex(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(typeof input === 'string' ? input : JSON.stringify(input));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function merkleRootHex(hashes) {
    if (!hashes || hashes.length === 0) return null;
    let level = [...hashes];
    while (level.length > 1) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) {
            const left = level[i];
            const right = level[i + 1] || left; // duplicate last if odd count
            const combined = await sha256Hex(left + right);
            next.push(combined);
        }
        level = next;
    }
    return level[0];
}

// Check authentication status
function checkAuthStatus() {
    const savedUser = localStorage.getItem('naksio_user');
    if (savedUser) {
        userData = JSON.parse(savedUser);
        currentUser = (typeof normalizeRole === 'function') ? normalizeRole(userData.role) : userData.role;
        showDashboard();
    } else {
        showLogin();
    }
}

// Show login screen
function showLogin() {
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('dashboardContainer').style.display = 'none';
}

// Show dashboard
function showDashboard() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('dashboardContainer').style.display = 'flex';
    updateUserInterface();
    showSection('dashboard');
    
    // Initialize map after a short delay to ensure DOM is ready
    setTimeout(() => {
        if (map === null) {
            initializeMap();
        }
    }, 100);
}

// Setup event listeners
function setupEventListeners() {
    // Login/Register forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    
    // Form submission
    document.getElementById('surveyForm').addEventListener('submit', handleSurveySubmit);
    
    // File upload
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('drop', handleFileDrop);
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    // Map controls
    const polygonTool = document.getElementById('polygonTool');
    const panTool = document.getElementById('panTool');
    const zoomTool = document.getElementById('zoomTool');
    const superZoomTool = document.getElementById('superZoomTool');
    
    if (polygonTool) polygonTool.addEventListener('click', () => activatePolygonTool());
    if (panTool) panTool.addEventListener('click', () => activatePanTool());
    if (zoomTool) zoomTool.addEventListener('click', () => activateZoomTool());
    if (superZoomTool) superZoomTool.addEventListener('click', () => activateSuperZoomTool());

    // Upload map controls
    const uploadPolygonTool = document.getElementById('uploadPolygonTool');
    const uploadZoomTool = document.getElementById('uploadZoomTool');
    if (uploadPolygonTool) uploadPolygonTool.addEventListener('click', () => activateUploadPolygonTool());
    if (uploadZoomTool) uploadZoomTool.addEventListener('click', () => activateUploadZoomTool());

    // Government ingestion (JSON-first)
    const govJsonInput = document.getElementById('govJsonInput');
    const govJsonIngestBtn = document.getElementById('govJsonIngestBtn');
    if (govJsonInput) {
        govJsonInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const text = await file.text();
            await ingestGovJson(text, file.name, file.size);
            renderGovDocsList();
            showNotification('Government JSON ingested', 'success');
            e.target.value = '';
        });
    }
    if (govJsonIngestBtn) {
        govJsonIngestBtn.addEventListener('click', () => {
            const input = document.getElementById('govJsonInput');
            if (input) input.click();
        });
    }

    // Property demo: open from map via global method
    window.openPropertyDemo = openPropertyDemo;

    // Anchor batch action (in Settings)
    const anchorBtn = document.getElementById('anchorBatchBtn');
    if (anchorBtn) {
        anchorBtn.addEventListener('click', async () => {
            await anchorBatch();
        });
    }
    
    // Keyboard shortcuts for zoom
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case '=':
                case '+':
                    e.preventDefault();
                    if (map) map.zoomIn();
                    break;
                case '-':
                    e.preventDefault();
                    if (map) map.zoomOut();
                    break;
                case '0':
                    e.preventDefault();
                    if (map) map.setZoom(20);
                    break;
                case '9':
                    e.preventDefault();
                    if (map) map.setZoom(22);
                    break;
            }
        }
    });
    
}

// Navigation functions
function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionName).classList.add('active');
    
    // Add active class to corresponding nav link
    document.querySelector(`[onclick="showSection('${sectionName}')"]`).classList.add('active');
    
    // Special handling for map section
    if (sectionName === 'map') {
        if (map) {
            setTimeout(() => map.invalidateSize(), 100);
        } else {
            // Initialize map if it doesn't exist
            setTimeout(() => {
                initializeMap();
            }, 100);
        }
    }
    if (sectionName === 'upload') {
        if (uploadMap) {
            setTimeout(() => uploadMap.invalidateSize(), 100);
        } else {
            setTimeout(() => {
                initializeUploadMap();
            }, 150);
        }
    }
    if (sectionName === 'consent') {
        setTimeout(renderConsentCenter, 50);
    }
    if (sectionName === 'access') {
        setTimeout(renderAccessList, 50);
    }
    if (sectionName === 'property') {
        // Auto-render a demo property if empty
        setTimeout(() => {
            const container = document.getElementById('propertyPage');
            if (container && container.innerHTML.trim() === '') {
                const demoPlot = getOrCreateDemoPlot();
                openPropertyDemo(demoPlot.plotCode, 'Demo Property', demoPlot);
            }
        }, 50);
    }
    if (sectionName === 'submissions') {
        setTimeout(renderSubmissions, 50);
    }
}

// Authentication functions
function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const loginData = Object.fromEntries(formData.entries());
    
    // Simple validation
    if (!loginData.email || !loginData.password || !loginData.role) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    // Debug logging
    console.log('Login attempt:', loginData);
    console.log('Available users:', registeredUsers);
    
    // Check if user exists
    const user = registeredUsers.find(u => 
        u.email === loginData.email && 
        u.password === loginData.password && 
        u.role === loginData.role
    );
    
    if (user) {
        // Login successful
        userData = user;
        currentUser = (typeof normalizeRole === 'function') ? normalizeRole(user.role) : user.role;
        localStorage.setItem('naksio_user', JSON.stringify(user));
        showNotification('Login successful!', 'success');
        showDashboard();
    } else {
        // More detailed error message
        const emailMatch = registeredUsers.find(u => u.email === loginData.email);
        const roleMatch = registeredUsers.find(u => u.role === loginData.role);
        
        if (!emailMatch) {
            showNotification('Email not found. Please register first.', 'error');
        } else if (!roleMatch) {
            showNotification('Invalid role selected.', 'error');
        } else {
            showNotification('Invalid password. Please try again.', 'error');
        }
    }
}

function handleRegister(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const regData = Object.fromEntries(formData.entries());
    
    // Validation
    if (!regData.name || !regData.email || !regData.password || !regData.role || !regData.phone) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    if (regData.password !== regData.confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }
    
    if (regData.password.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        return;
    }
    
    // Check if user already exists
    if (registeredUsers.find(u => u.email === regData.email)) {
        showNotification('User with this email already exists', 'error');
        return;
    }
    
    // Create new user
    const newUser = {
        id: generateId(),
        name: regData.name,
        email: regData.email,
        password: regData.password,
        role: regData.role,
        phone: regData.phone,
        createdAt: new Date().toISOString()
    };
    
    registeredUsers.push(newUser);
    localStorage.setItem('naksio_users', JSON.stringify(registeredUsers));
    
    showNotification('Registration successful! Please login.', 'success');
    showLoginTab('login');
    e.target.reset();
}

function showLoginTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[onclick="showLoginTab('${tab}')"]`).classList.add('active');
    
    // Update forms
    document.querySelectorAll('.login-form').forEach(form => form.classList.remove('active'));
    document.getElementById(tab === 'login' ? 'loginForm' : 'registerForm').classList.add('active');
}

function quickLogin(email, password, role) {
    // Fill the login form
    document.getElementById('loginEmail').value = email;
    document.getElementById('loginPassword').value = password;
    document.getElementById('loginRole').value = role;
    
    // Trigger login
    const loginData = { email, password, role };
    
    // Debug logging
    console.log('Quick login attempt:', loginData);
    console.log('Available users:', registeredUsers);
    
    // Check if user exists
    const user = registeredUsers.find(u => 
        u.email === email && 
        u.password === password && 
        u.role === role
    );
    
    if (user) {
        // Login successful
        userData = user;
        currentUser = (typeof normalizeRole === 'function') ? normalizeRole(user.role) : user.role;
        localStorage.setItem('naksio_user', JSON.stringify(user));
        showNotification('Login successful!', 'success');
        showDashboard();
    } else {
        showNotification('Demo user not found. Please register first.', 'error');
    }
}

// Allow demo roles for Bank and Regulator quickly
window.quickLoginRole = function(role) {
    const creds = {
        bank: { email: 'bank@demo.com', name: 'HDFC Bank Officer' },
        regulator: { email: 'regulator@demo.com', name: 'Gov Officer' }
    }[role];
    if (!creds) return;
    const existing = registeredUsers.find(u => u.email === creds.email);
    const user = existing || {
        id: generateId(),
        name: creds.name,
        email: creds.email,
        password: 'password123',
        role: role,
        phone: '+91 90000 00000',
        createdAt: new Date().toISOString()
    };
    if (!existing) {
        registeredUsers.push(user);
        localStorage.setItem('naksio_users', JSON.stringify(registeredUsers));
    }
    userData = user;
    currentUser = role;
    localStorage.setItem('naksio_user', JSON.stringify(user));
    showDashboard();
    showNotification(`${role.toUpperCase()} demo login successful`, 'success');
};

function logout() {
    console.log('Logout function called');
    localStorage.removeItem('naksio_user');
    currentUser = null;
    userData = null;
    showLogin();
    showNotification('Logged out successfully', 'info');
}

// Add a simple test function
function testLogout() {
    console.log('Testing logout...');
    logout();
}

function showProfile() {
    showSection('profile');
    updateProfileDisplay();
}

function updateProfileDisplay() {
    if (!userData) return;
    
    const profileName = document.getElementById('profileName');
    const profileRole = document.getElementById('profileRole');
    const profileAvatar = document.getElementById('profileAvatar');
    const profileDetails = document.getElementById('profileDetails');
    
    // Update basic info
    profileName.textContent = userData.name;
    profileRole.textContent = userData.role.charAt(0).toUpperCase() + userData.role.slice(1);
    
    // Update avatar based on role
    profileAvatar.className = `profile-avatar role-${userData.role}`;
    profileAvatar.innerHTML = `<i class="fas fa-${getRoleIcon(userData.role)}"></i>`;
    
    // Update profile details
    profileDetails.innerHTML = `
        <div class="profile-detail-item">
            <span class="profile-detail-label">Full Name</span>
            <span class="profile-detail-value">${userData.name}</span>
        </div>
        <div class="profile-detail-item">
            <span class="profile-detail-label">Email</span>
            <span class="profile-detail-value">${userData.email}</span>
        </div>
        <div class="profile-detail-item">
            <span class="profile-detail-label">Phone</span>
            <span class="profile-detail-value">${userData.phone}</span>
        </div>
        <div class="profile-detail-item">
            <span class="profile-detail-label">Role</span>
            <span class="profile-detail-value">${userData.role.charAt(0).toUpperCase() + userData.role.slice(1)}</span>
        </div>
        <div class="profile-detail-item">
            <span class="profile-detail-label">Member Since</span>
            <span class="profile-detail-value">${new Date(userData.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="profile-detail-item">
            <span class="profile-detail-label">User ID</span>
            <span class="profile-detail-value">${userData.id}</span>
        </div>
    `;
}

function getRoleIcon(role) {
    switch(role) {
        case 'user': return 'user';
        case 'client': return 'eye';
        case 'admin': return 'user-shield';
        default: return 'user';
    }
}

function showSettings() {
    showSection('settings');
}

function updateUserInterface() {
    if (!userData) return;
    
    const roleBadge = document.getElementById('userRoleBadge');
    const profileImg = document.getElementById('userProfileImg');
    const username = document.getElementById('userDisplayName');
    const sidebarNav = document.getElementById('sidebarNav');
    
    // Update user info
    username.textContent = userData.name;
    
    // Update role badge and profile image for new roles
    switch(currentUser) {
        case 'user':
            roleBadge.innerHTML = '<i class="fas fa-user"></i><span>User</span>';
            profileImg.src = 'https://via.placeholder.com/32x32/28a745/FFFFFF?text=U';
            break;
        case 'client':
            roleBadge.innerHTML = '<i class="fas fa-eye"></i><span>Client</span>';
            profileImg.src = 'https://via.placeholder.com/32x32/6f42c1/FFFFFF?text=C';
            break;
        case 'admin':
            roleBadge.innerHTML = '<i class="fas fa-user-shield"></i><span>Admin</span>';
            profileImg.src = 'https://via.placeholder.com/32x32/007BFF/FFFFFF?text=A';
            break;
        default:
            roleBadge.innerHTML = `<i class="fas fa-${getRoleIcon(currentUser)}"></i><span>${(currentUser||'User').charAt(0).toUpperCase() + (currentUser||'user').slice(1)}</span>`;
            profileImg.src = 'https://via.placeholder.com/32x32/007BFF/FFFFFF?text=U';
            break;
    }
    
    // Update sidebar navigation based on role
    updateSidebarNavigation();
    
    // Update interface based on user role
    updateApprovalsList();
}

function updateSidebarNavigation() {
    const sidebarNav = document.getElementById('sidebarNav');
    let navItems = [];
    
    switch(currentUser) {
        case 'user':
            navItems = [
                { icon: 'fas fa-tachometer-alt', text: 'Dashboard', section: 'dashboard' },
                { icon: 'fas fa-search', text: 'Property', section: 'property' },
                { icon: 'fas fa-user-lock', text: 'Consent Center', section: 'consent' },
                { icon: 'fas fa-upload', text: 'Upload Survey', section: 'upload' },
                { icon: 'fas fa-history', text: 'My Submissions', section: 'submissions' },
                { icon: 'fas fa-bell', text: 'Notifications', section: 'notifications' },
                { icon: 'fas fa-user', text: 'Profile', section: 'profile' }
            ];
            break;
        case 'client':
            navItems = [
                { icon: 'fas fa-tachometer-alt', text: 'Dashboard', section: 'dashboard' },
                { icon: 'fas fa-search', text: 'Property', section: 'property' },
                { icon: 'fas fa-eye', text: 'My Access', section: 'access' },
                { icon: 'fas fa-user', text: 'Profile', section: 'profile' }
            ];
            break;
        case 'admin':
            navItems = [
                { icon: 'fas fa-tachometer-alt', text: 'Dashboard', section: 'dashboard' },
                { icon: 'fas fa-search', text: 'Property', section: 'property' },
                { icon: 'fas fa-upload', text: 'Survey Upload', section: 'upload' },
                { icon: 'fas fa-check-circle', text: 'Approvals', section: 'approvals', badge: pendingApprovals.length },
                { icon: 'fas fa-database', text: 'Gov Ingestion', section: 'ingestion' },
                { icon: 'fas fa-search', text: 'Search Records', section: 'search' },
                { icon: 'fas fa-cog', text: 'Settings', section: 'settings' },
                { icon: 'fas fa-sign-out-alt', text: 'Logout', action: 'logout' }
            ];
            break;
    }
    
    sidebarNav.innerHTML = navItems.map((item, index) => {
        if (item.action === 'logout') {
            return `
                <a href="#" class="nav-link logout-link" onclick="logout()">
                    <i class="${item.icon}"></i>
                    <span>${item.text}</span>
                </a>
            `;
        } else {
            return `
                <a href="#" class="nav-link ${index === 0 ? 'active' : ''}" onclick="showSection('${item.section}')">
                    <i class="${item.icon}"></i>
                    <span>${item.text}</span>
                    ${item.badge ? `<span class="badge">${item.badge}</span>` : ''}
                </a>
            `;
        }
    }).join('');
}


// Survey form handling
function handleSurveySubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const surveyData = Object.fromEntries(formData.entries());
    
    // Simulate form validation
    if (validateSurveyForm(surveyData)) {
        // Create approval request
        const approvalId = generateId();
        const approval = {
            id: approvalId,
            ...surveyData,
            status: 'pending',
            submittedAt: new Date().toISOString(),
            submittedBy: currentUser,
            files: getUploadedFiles()
        };
        
        pendingApprovals.push(approval);
        // Track in submissions history
        submissionsStore.push({ id: approvalId, status: 'pending', submittedBy: userData ? userData.email : 'anonymous', details: surveyData, updatedAt: new Date().toISOString() });
        persistStores();
        updateApprovalsList();
        
        // Show success message
        showNotification('Survey submitted successfully! Awaiting admin approval.', 'success');
        
        // Clear form
        clearForm();
        
        // Switch to approvals section
        showSection('submissions');
    } else {
        showNotification('Please fill in all required fields.', 'error');
    }
}

function validateSurveyForm(data) {
    const requiredFields = ['district', 'taluk', 'hobli', 'village', 'surnoc', 'hissa', 'period', 'surveyNumber'];
    return requiredFields.every(field => data[field] && data[field].trim() !== '');
}

// File upload handling
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.style.borderColor = '#007BFF';
    e.currentTarget.style.backgroundColor = '#f0f9ff';
}

function handleFileDrop(e) {
    e.preventDefault();
    e.currentTarget.style.borderColor = '#cbd5e1';
    e.currentTarget.style.backgroundColor = '#f8fafc';
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    handleFiles(files);
}

function handleFiles(files) {
    const uploadedFilesContainer = document.getElementById('uploadedFiles');
    
    files.forEach(file => {
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            showNotification(`File ${file.name} is too large. Maximum size is 10MB.`, 'error');
            return;
        }
        
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <i class="fas fa-file-pdf file-icon"></i>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            </div>
            <button onclick="removeFile(this)" class="btn btn-danger" style="padding: 0.5rem;">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        uploadedFilesContainer.appendChild(fileItem);
    });
}

function getUploadedFiles() {
    const fileItems = document.querySelectorAll('.file-item');
    return Array.from(fileItems).map(item => ({
        name: item.querySelector('.file-name').textContent,
        size: item.querySelector('.file-size').textContent
    }));
}

function removeFile(button) {
    button.parentElement.remove();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function clearForm() {
    document.getElementById('surveyForm').reset();
    document.getElementById('uploadedFiles').innerHTML = '';
}

// Map functionality
function initializeMap() {
    console.log('Initializing map...');
    
    // Check if map container exists
    const mapContainer = document.getElementById('mapCanvas');
    if (!mapContainer) {
        console.error('Map container not found!');
        return;
    }
    
    try {
        // Initialize map centered on Bangalore with higher zoom
        map = L.map('mapCanvas', {
            preferCanvas: true,
            wheelDebounceTime: 35,
            zoomAnimation: true,
            updateWhenZooming: false,
            updateWhenIdle: true
        }).setView([12.9716, 77.5946], 15);
        console.log('Map created successfully');
        
        // Add tile layer with resilient fallback
        addResilientTileLayer();
        console.log('Tile layer added');
        
        // Initialize drawing layer
        drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        
        // Add zoom controls
        addZoomControls();
        
        // Add drawing controls
        addDrawingControls();
        
        // Hide loading indicator
        const loadingIndicator = document.getElementById('mapLoading');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        
        // Add some sample land parcels
        addSampleLandParcels();
        console.log('Sample parcels added');
        
        // Observe container resizes to keep tiles rendered
        setupMapResizeObserver();

    } catch (error) {
        console.error('Error initializing map:', error);
        // Show error message
        const loadingIndicator = document.getElementById('mapLoading');
        if (loadingIndicator) {
            loadingIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>Map failed to load</p>';
        }
    }
}

function initializeUploadMap() {
    const container = document.getElementById('uploadMapCanvas');
    if (!container) return;
    try {
        uploadMap = L.map('uploadMapCanvas', {
            preferCanvas: true,
            wheelDebounceTime: 35,
            zoomAnimation: true,
            updateWhenZooming: false,
            updateWhenIdle: true
        }).setView([12.9716, 77.5946], 16);
        addResilientTileLayerFor(uploadMap);
        uploadDrawnItems = new L.FeatureGroup();
        uploadMap.addLayer(uploadDrawnItems);
        addDrawingControlsFor(uploadMap, uploadDrawnItems);
        setupMapResizeObserverFor(uploadMap, 'uploadMapCanvas');
    } catch (e) {
        console.error('Upload map init failed', e);
    }
}

function addResilientTileLayer() {
    const providers = [
        {
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors'
        },
        {
            url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors, HOT'
        },
        {
            url: 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors (DE)'
        }
    ];

    let current = 0;
    let layer = null;

    const add = (idx) => {
        const prov = providers[idx];
        if (!prov) return; // no provider
        layer = L.tileLayer(prov.url, {
            attribution: prov.attribution,
            maxZoom: 22,
            minZoom: 10,
            crossOrigin: true,
            keepBuffer: 8,
            updateWhenIdle: true,
            updateWhenZooming: false,
            detectRetina: true
        }).addTo(map);
        // If the first tile errors, switch provider once
        let switched = false;
        layer.on('tileerror', () => {
            if (switched) return;
            switched = true;
            map.removeLayer(layer);
            current += 1;
            add(current);
        });
    };

    add(current);
}

function addResilientTileLayerFor(targetMap) {
    const providers = [
        { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
        { url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors, HOT' },
        { url: 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors (DE)' }
    ];
    let i = 0; let layer = null; let switched = false;
    const add = () => {
        const p = providers[i]; if (!p) return;
        layer = L.tileLayer(p.url, { attribution: p.attribution, maxZoom: 22, minZoom: 10, crossOrigin: true, keepBuffer: 8, updateWhenIdle: true, updateWhenZooming: false, detectRetina: true }).addTo(targetMap);
        layer.on('tileerror', () => {
            if (switched) return; switched = true; targetMap.removeLayer(layer); i += 1; add();
        });
    };
    add();
}

function addDrawingControlsFor(targetMap, featureGroup) {
    const drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
            polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: '#007BFF', fillColor: '#007BFF', fillOpacity: 0.3, weight: 3 } },
            rectangle: { showArea: true, shapeOptions: { color: '#28a745', fillColor: '#28a745', fillOpacity: 0.3, weight: 3 } },
            polyline: false, circle: false, marker: false, circlemarker: false
        },
        edit: { featureGroup: featureGroup, remove: true }
    });
    targetMap.addControl(drawControl);
    targetMap.on(L.Draw.Event.CREATED, function (e) {
        const layer = e.layer; layer.polygonId = 'upload-' + Date.now(); featureGroup.addLayer(layer);
        showNotification('Boundary added to survey', 'success');
    });
}

function activateUploadPolygonTool() {
    showNotification('Upload: Polygon tool activated', 'info');
}

function activateUploadZoomTool() {
    if (uploadMap) uploadMap.setZoom(18);
}

function setupMapResizeObserver() {
    const el = document.getElementById('mapCanvas');
    if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => {
        if (map) {
            map.invalidateSize(false);
        }
    });
    ro.observe(el);
}

function setupMapResizeObserverFor(targetMap, elementId) {
    const el = document.getElementById(elementId);
    if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => {
        if (targetMap) {
            targetMap.invalidateSize(false);
        }
    });
    ro.observe(el);
}

function addSampleLandParcels() {
    const sampleParcels = [
        {
            id: 'parcel-1',
            name: 'Survey #12345',
            coordinates: [[12.9716, 77.5946], [12.9726, 77.5946], [12.9726, 77.5956], [12.9716, 77.5956]],
            status: 'tokenized',
            tokenId: 'NAK-2024-001234'
        },
        {
            id: 'parcel-2',
            name: 'Survey #12346',
            coordinates: [[12.9750, 77.6000], [12.9760, 77.6000], [12.9760, 77.6010], [12.9750, 77.6010]],
            status: 'pending',
            tokenId: null
        }
    ];
    
    sampleParcels.forEach(parcel => {
        const polygon = L.polygon(parcel.coordinates, {
            color: parcel.status === 'tokenized' ? '#007BFF' : '#ffc107',
            fillColor: parcel.status === 'tokenized' ? '#007BFF' : '#ffc107',
            fillOpacity: 0.3,
            weight: 2
        }).addTo(map);
        
        polygon.bindPopup(`
            <div style="min-width: 200px;">
                <h4>${parcel.name}</h4>
                <p><strong>Status:</strong> ${parcel.status}</p>
                ${parcel.tokenId ? `<p><strong>Token ID:</strong> ${parcel.tokenId}</p>` : ''}
                <button onclick="viewTokenDetails('${parcel.id}')" class="btn btn-primary" style="margin-top: 10px;">
                    View Details
                </button>
                <button onclick="openPropertyDemo('${parcel.tokenId || 'NAK-DEMO'}', '${parcel.name}')" class="btn btn-outline" style="margin-top: 10px; margin-left: 6px;">
                    Open Property
                </button>
            </div>
        `);
    });
}

function addZoomControls() {
    // Add custom zoom controls
    const zoomControl = L.control.zoom({
        position: 'topleft'
    });
    
    // Add zoom to drawing area button
    const zoomToDrawingButton = L.Control.extend({
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
            container.style.backgroundColor = 'white';
            container.style.width = '40px';
            container.style.height = '40px';
            container.style.cursor = 'pointer';
            container.style.border = '2px solid #ccc';
            container.style.borderRadius = '4px';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.marginTop = '10px';
            container.title = 'Zoom to Drawing Area';
            
            container.innerHTML = '<i class="fas fa-search-plus" style="font-size: 16px; color: #007BFF;"></i>';
            
            container.onclick = function() {
                if (drawnItems.getLayers().length > 0) {
                    const group = new L.featureGroup(drawnItems.getLayers());
                    map.fitBounds(group.getBounds().pad(0.1));
                } else {
                    map.setZoom(20);
                }
            };
            
            return container;
        }
    });
    
    map.addControl(zoomControl);
    map.addControl(new zoomToDrawingButton({ position: 'topleft' }));
}

function addDrawingControls() {
    // Add drawing controls to the map
    const drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
            polygon: {
                allowIntersection: false,
                showArea: true,
                showLength: true,
                metric: true,
                drawError: {
                    color: '#e1e100',
                    message: '<strong>Error:</strong> shape edges cannot cross!'
                },
                shapeOptions: {
                    color: '#007BFF',
                    fillColor: '#007BFF',
                    fillOpacity: 0.3,
                    weight: 3
                }
            },
            polyline: {
                allowIntersection: false,
                showLength: true,
                metric: true,
                shapeOptions: {
                    color: '#ff0000',
                    weight: 3
                }
            },
            circle: false,
            rectangle: {
                showArea: true,
                metric: true,
                shapeOptions: {
                    color: '#28a745',
                    fillColor: '#28a745',
                    fillOpacity: 0.3,
                    weight: 3
                }
            },
            marker: false,
            circlemarker: false
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    
    map.addControl(drawControl);
    
    // Handle drawing events
    map.on(L.Draw.Event.CREATED, function (event) {
        const layer = event.layer;
        const type = event.layerType;
        
        if (type === 'polygon') {
            // Add the drawn polygon to the map
            drawnItems.addLayer(layer);
            
            // Generate a unique ID for the polygon
            const polygonId = 'drawn-' + Date.now();
            layer.polygonId = polygonId;
            
            // Add popup with polygon info
            layer.bindPopup(`
                <div style="min-width: 200px;">
                    <h4>Drawn Land Parcel</h4>
                    <p><strong>ID:</strong> ${polygonId}</p>
                    <p><strong>Status:</strong> Draft</p>
                    <p><strong>Area:</strong> Calculating...</p>
                    <button onclick="savePolygon('${polygonId}')" class="btn btn-primary" style="margin-top: 10px;">
                        Save Parcel
                    </button>
                    <button onclick="deletePolygon('${polygonId}')" class="btn btn-danger" style="margin-top: 10px; margin-left: 5px;">
                        Delete
                    </button>
                </div>
            `);
            
            showNotification('Polygon drawn successfully! Click on it to see details.', 'success');
        }
    });
    
    // Handle edit events
    map.on(L.Draw.Event.EDITED, function (event) {
        showNotification('Polygon updated successfully!', 'success');
    });
    
    // Handle delete events
    map.on(L.Draw.Event.DELETED, function (event) {
        showNotification('Polygon deleted successfully!', 'info');
    });
}

function activatePolygonTool() {
    // Update button states
    document.querySelectorAll('.map-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('polygonTool').classList.add('active');
    
    // Enable drawing mode
    drawingMode = true;
    showNotification('Polygon tool activated. Click and drag to draw land boundaries.', 'info');
}

function activatePanTool() {
    document.querySelectorAll('.map-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('panTool').classList.add('active');
    showNotification('Pan tool activated.', 'info');
}

function activateZoomTool() {
    document.querySelectorAll('.map-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('zoomTool').classList.add('active');
    
    // Zoom to maximum detail level
    map.setZoom(20);
    showNotification('Zoomed to maximum detail level for precise drawing.', 'info');
}

function activateSuperZoomTool() {
    document.querySelectorAll('.map-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('superZoomTool').classList.add('active');
    
    // Zoom to super maximum detail level
    map.setZoom(22);
    showNotification('Super zoom activated! Maximum detail for ultra-precise drawing.', 'success');
}

function savePolygon(polygonId) {
    // Find the polygon layer
    let polygonLayer = null;
    drawnItems.eachLayer(function(layer) {
        if (layer.polygonId === polygonId) {
            polygonLayer = layer;
        }
    });
    
    if (polygonLayer) {
        // Get polygon coordinates
        const coordinates = polygonLayer.getLatLngs()[0];
        // Simple area calculation (approximate)
        const area = calculatePolygonArea(coordinates);
        
        // Create a new land parcel entry
        const newParcel = {
            id: polygonId,
            name: `Drawn Parcel ${polygonId.split('-')[1]}`,
            coordinates: coordinates.map(coord => [coord.lat, coord.lng]),
            status: 'draft',
            area: area.toFixed(2),
            createdAt: new Date().toISOString(),
            createdBy: userData ? userData.email : 'anonymous'
        };
        
        // Add to tokenized lands (as draft)
        tokenizedLands.push(newParcel);
        
        // Update the polygon popup
        polygonLayer.bindPopup(`
            <div style="min-width: 200px;">
                <h4>Saved Land Parcel</h4>
                <p><strong>ID:</strong> ${polygonId}</p>
                <p><strong>Status:</strong> Saved</p>
                <p><strong>Area:</strong> ${area.toFixed(2)} hectares</p>
                <p><strong>Created:</strong> ${new Date().toLocaleString()}</p>
                <button onclick="submitParcel('${polygonId}')" class="btn btn-success" style="margin-top: 10px;">
                    Submit for Approval
                </button>
            </div>
        `);
        
        showNotification('Polygon saved successfully!', 'success');
    }
}

function deletePolygon(polygonId) {
    // Find and remove the polygon layer
    drawnItems.eachLayer(function(layer) {
        if (layer.polygonId === polygonId) {
            drawnItems.removeLayer(layer);
        }
    });
    
    // Remove from tokenized lands if it exists
    tokenizedLands = tokenizedLands.filter(parcel => parcel.id !== polygonId);
    
    showNotification('Polygon deleted successfully!', 'info');
}

function calculatePolygonArea(coordinates) {
    // Simple area calculation using the shoelace formula
    let area = 0;
    const n = coordinates.length;
    
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += coordinates[i].lng * coordinates[j].lat;
        area -= coordinates[j].lng * coordinates[i].lat;
    }
    
    area = Math.abs(area) / 2;
    
    // Convert to hectares (very approximate)
    return (area * 111000 * 111000) / 10000;
}

function submitParcel(polygonId) {
    // Find the parcel
    const parcel = tokenizedLands.find(p => p.id === polygonId);
    if (parcel) {
        // Update status to pending
        parcel.status = 'pending';
        parcel.submittedAt = new Date().toISOString();
        
        // Add to pending approvals
        const approval = {
            id: 'approval-' + Date.now(),
            polygonId: polygonId,
            parcelData: parcel,
            status: 'pending',
            submittedAt: new Date().toISOString(),
            submittedBy: userData ? userData.email : 'anonymous',
            type: 'drawn_parcel'
        };
        
        pendingApprovals.push(approval);
        updateApprovalsList();
        
        showNotification('Parcel submitted for approval!', 'success');
    }
}

// Approvals management
function updateApprovalsList() {
    const container = document.getElementById('approvalsList');
    
    if (pendingApprovals.length === 0) {
        container.innerHTML = '<div class="no-data">No pending approvals</div>';
        return;
    }
    
    // Role-based access: only admin and verifier can approve/reject
    const canApprove = currentUser === 'admin' || currentUser === 'verifier';
    
    container.innerHTML = pendingApprovals.map(approval => `
        <div class="approval-card">
            <div class="approval-header">
                <h3 class="approval-title">Survey #${approval.surveyNumber}</h3>
                <span class="status-badge ${approval.status}">${approval.status.toUpperCase()}</span>
            </div>
            <div class="approval-details">
                <div class="detail-item">
                    <span class="detail-label">District</span>
                    <span class="detail-value">${approval.district}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Taluk</span>
                    <span class="detail-value">${approval.taluk}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Village</span>
                    <span class="detail-value">${approval.village}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Submitted By</span>
                    <span class="detail-value">${approval.submittedBy}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Submitted At</span>
                    <span class="detail-value">${new Date(approval.submittedAt).toLocaleString()}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Files</span>
                    <span class="detail-value">${approval.files.length} documents</span>
                </div>
            </div>
            <div class="approval-actions">
                ${canApprove ? `
                <button class="btn btn-success" onclick="approveSurvey('${approval.id}')">
                    <i class="fas fa-check"></i>
                    Approve & Tokenize
                </button>
                <button class="btn btn-danger" onclick="rejectSurvey('${approval.id}')">
                    <i class="fas fa-times"></i>
                    Reject
                </button>
                ` : ''}
                <button class="btn btn-outline" onclick="viewSurveyDetails('${approval.id}')">
                    <i class="fas fa-eye"></i>
                    View Details
                </button>
            </div>
        </div>
    `).join('');
}

function approveSurvey(approvalId) {
    const approval = pendingApprovals.find(a => a.id === approvalId);
    if (!approval) return;
    
    // Update status
    approval.status = 'approved';
    
    // Generate unique plot code
    const plotCode = generatePlotCode();
    
    // Generate token
    const tokenId = generateTokenId();
    const token = {
        id: tokenId,
        plotCode: plotCode,
        surveyId: approvalId,
        surveyData: approval,
        tokenHash: generateTokenHash(),
        ipfsHash: generateIPFSHash(),
        blockNumber: generateBlockNumber(),
        transactionHash: generateTransactionHash(),
        createdAt: new Date().toISOString(),
        status: 'minted'
    };
    
    // Create comprehensive plot data with NAKS score card
    const plotData = createMockPlotData(plotCode, approval, token);
    
    // Add to tokenized lands
    tokenizedLands.push(token);
    
    // Store plot data with token reference
    plotData.tokenization.tokenId = tokenId;
    plotData.tokenization.status = 'Minted';
    localStorage.setItem(`plot_${plotCode}`, JSON.stringify(plotData));
    localStorage.setItem(`token_${tokenId}`, JSON.stringify(plotData));
    
    // Store token mapping for search
    const tokenMappings = JSON.parse(localStorage.getItem('token_mappings') || '[]');
    tokenMappings.push({
        tokenId: tokenId,
        plotCode: plotCode,
        surveyNumber: approval.surveyNumber,
        district: approval.district,
        village: approval.village,
        createdAt: new Date().toISOString()
    });
    localStorage.setItem('token_mappings', JSON.stringify(tokenMappings));
    
    // Remove from pending approvals
    pendingApprovals = pendingApprovals.filter(a => a.id !== approvalId);
    
    // Update UI
    updateApprovalsList();
    updateStats();
    // Update submissions history
    const sub = submissionsStore.find(s => s.id === approvalId);
    if (sub) {
        sub.status = 'approved';
        sub.tokenId = tokenId;
        sub.plotCode = plotCode;
        sub.updatedAt = new Date().toISOString();
        persistStores();
        // If the approved submission belongs to the logged-in user, show congrats banner next time they open My Submissions
        if (userData && sub.submittedBy === userData.email) {
            setTimeout(renderSubmissions, 50);
        }
    }
    
    // Show success message and plot dashboard
    showNotification(`Survey approved and tokenized successfully! Token ID: ${tokenId}`, 'success');
    showPlotDashboard(plotData);
}

function rejectSurvey(approvalId) {
    const approval = pendingApprovals.find(a => a.id === approvalId);
    if (!approval) return;
    
    // Update status
    approval.status = 'rejected';
    
    // Remove from pending approvals
    pendingApprovals = pendingApprovals.filter(a => a.id !== approvalId);
    
    // Update UI
    updateApprovalsList();
    updateStats();
    // Update submissions history
    const sub = submissionsStore.find(s => s.id === approvalId);
    if (sub) {
        sub.status = 'rejected';
        sub.updatedAt = new Date().toISOString();
        persistStores();
        setTimeout(renderSubmissions, 50);
    }
    
    showNotification('Survey rejected.', 'info');
}

function viewSurveyDetails(approvalId) {
    const approval = pendingApprovals.find(a => a.id === approvalId);
    if (!approval) return;
    
    // Show detailed view (simplified for demo)
    alert(`Survey Details:\n\nSurvey Number: ${approval.surveyNumber}\nDistrict: ${approval.district}\nTaluk: ${approval.taluk}\nVillage: ${approval.village}\nStatus: ${approval.status}`);
}

// Token management
function generateTokenId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `NAK-2024-${timestamp}-${random}`.toUpperCase();
}

function generatePlotCode() {
    const random1 = Math.floor(Math.random() * 9999) + 1000;
    const random2 = Math.floor(Math.random() * 999) + 100;
    const random3 = Math.floor(Math.random() * 26) + 65; // A-Z
    return `NKS-${random1}-${random2}${String.fromCharCode(random3)}`;
}

function createMockPlotData(plotCode, approval, token) {
    const mockOwners = [
        'Ramesh Gowda', 'Lakshmi Devi', 'Kumar Reddy', 'Priya Sharma', 
        'Rajesh Kumar', 'Sunita Singh', 'Vikram Patel', 'Anita Joshi'
    ];
    
    const mockVillages = [
        'Hosahalli', 'Kodihalli', 'Chikkaballapur', 'Devanahalli',
        'Nelamangala', 'Magadi', 'Ramanagara', 'Kanakapura'
    ];
    
    const loanStatuses = ['Active', 'Paid Off', 'Default', 'No Loan'];
    const insuranceStatuses = ['Insured', 'Not Insured', 'Expired', 'Under Review'];
    
    // Generate comprehensive NAKS score card
    const naksScore = generateNAKSScore();
    
    return {
        plotCode: plotCode,
        tokenId: token.id,
        surveyData: approval,
        ownership: {
            owner: mockOwners[Math.floor(Math.random() * mockOwners.length)],
            coOwners: [],
            ownershipPercentage: 100,
            registrationDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
            documentNumber: `DOC-${Math.floor(Math.random() * 999999)}`
        },
        financial: {
            loanStatus: loanStatuses[Math.floor(Math.random() * loanStatuses.length)],
            loanAmount: Math.floor(Math.random() * 5000000) + 500000,
            interestRate: (Math.random() * 5 + 8).toFixed(2),
            monthlyEMI: Math.floor(Math.random() * 50000) + 10000,
            remainingBalance: Math.floor(Math.random() * 3000000) + 200000
        },
        insurance: {
            status: insuranceStatuses[Math.floor(Math.random() * insuranceStatuses.length)],
            provider: 'Agricultural Insurance Company',
            policyNumber: `POL-${Math.floor(Math.random() * 999999)}`,
            coverageAmount: Math.floor(Math.random() * 2000000) + 1000000,
            expiryDate: new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()
        },
        naksScoreCard: naksScore,
        riskAssessment: {
            floodRisk: Math.floor(Math.random() * 100),
            soilQuality: Math.floor(Math.random() * 100),
            waterAvailability: Math.floor(Math.random() * 100),
            accessibility: Math.floor(Math.random() * 100),
            overallScore: Math.floor(Math.random() * 100)
        },
        location: {
            district: approval.district,
            taluk: approval.taluk,
            village: approval.village,
            coordinates: {
                latitude: 12.9716 + (Math.random() - 0.5) * 0.1,
                longitude: 77.5946 + (Math.random() - 0.5) * 0.1
            },
            area: (Math.random() * 5 + 1).toFixed(2) + ' acres'
        },
        tokenization: {
            tokenId: token.id,
            tokenHash: token.tokenHash,
            ipfsHash: token.ipfsHash,
            blockNumber: token.blockNumber,
            transactionHash: token.transactionHash,
            mintedAt: token.createdAt,
            blockchain: 'Polygon Mumbai Testnet',
            status: 'Minted'
        },
        createdAt: new Date().toISOString()
    };
}

function generateTokenHash() {
    return '0x' + Math.random().toString(16).substr(2, 64);
}

function generateIPFSHash() {
    return 'Qm' + Math.random().toString(36).substr(2, 44);
}

function generateBlockNumber() {
    return Math.floor(Math.random() * 1000000) + 50000000;
}

function generateTransactionHash() {
    return '0x' + Math.random().toString(16).substr(2, 64);
}

function generateNAKSScore() {
    const categories = {
        landQuality: {
            score: Math.floor(Math.random() * 40) + 60, // 60-100
            factors: ['Soil fertility', 'Drainage', 'Topography', 'Climate suitability']
        },
        legalCompliance: {
            score: Math.floor(Math.random() * 30) + 70, // 70-100
            factors: ['Title clarity', 'Boundary disputes', 'Encumbrances', 'Regulatory compliance']
        },
        infrastructure: {
            score: Math.floor(Math.random() * 50) + 50, // 50-100
            factors: ['Road connectivity', 'Water access', 'Electricity', 'Telecom coverage']
        },
        marketValue: {
            score: Math.floor(Math.random() * 40) + 60, // 60-100
            factors: ['Location premium', 'Development potential', 'Comparable sales', 'Future prospects']
        },
        riskFactors: {
            score: Math.floor(Math.random() * 50) + 50, // 50-100
            factors: ['Natural disasters', 'Environmental risks', 'Political stability', 'Economic factors']
        }
    };
    
    // Calculate overall NAKS score
    const overallScore = Math.round(
        (categories.landQuality.score * 0.25) +
        (categories.legalCompliance.score * 0.25) +
        (categories.infrastructure.score * 0.20) +
        (categories.marketValue.score * 0.20) +
        (categories.riskFactors.score * 0.10)
    );
    
    return {
        overallScore: overallScore,
        grade: overallScore >= 90 ? 'A+' : 
               overallScore >= 80 ? 'A' : 
               overallScore >= 70 ? 'B+' : 
               overallScore >= 60 ? 'B' : 
               overallScore >= 50 ? 'C+' : 'C',
        categories: categories,
        lastUpdated: new Date().toISOString(),
        assessmentMethod: 'Automated NAKS Algorithm v2.1'
    };
}

function showPlotDashboard(plotData) {
    // Create plot dashboard modal
    const modal = document.createElement('div');
    modal.className = 'modal plot-dashboard-modal';
    modal.innerHTML = `
        <div class="modal-content plot-dashboard-content">
            <div class="modal-header">
                <h2>Plot Dashboard - ${plotData.plotCode}</h2>
                <button class="close-btn" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="plot-dashboard">
                    <div class="plot-header">
                        <div class="plot-code-display">
                            <h3>${plotData.plotCode}</h3>
                            <p>Land information successfully processed</p>
                        </div>
                        <div class="qr-code-section">
                            <div class="qr-placeholder" id="plotQrCode"></div>
                        </div>
                    </div>
                    
                    <div class="plot-details-grid">
                        <div class="detail-card">
                            <h4>Ownership</h4>
                            <div class="detail-item">
                                <span class="label">Owner:</span>
                                <span class="value">${plotData.ownership.owner}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Registration:</span>
                                <span class="value">${new Date(plotData.ownership.registrationDate).toLocaleDateString()}</span>
                            </div>
                        </div>
                        
                        <div class="detail-card">
                            <h4>Loan Status</h4>
                            <div class="detail-item">
                                <span class="label">Status:</span>
                                <span class="value ${plotData.financial.loanStatus === 'Active' ? 'active' : 'inactive'}">${plotData.financial.loanStatus}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Amount:</span>
                                <span class="value">₹${plotData.financial.loanAmount.toLocaleString()}</span>
                            </div>
                        </div>
                        
                        <div class="detail-card">
                            <h4>Insurance</h4>
                            <div class="detail-item">
                                <span class="label">Status:</span>
                                <span class="value ${plotData.insurance.status === 'Insured' ? 'insured' : 'not-insured'}">${plotData.insurance.status}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Provider:</span>
                                <span class="value">${plotData.insurance.provider}</span>
                            </div>
                        </div>
                        
                        <div class="detail-card">
                            <h4>NAKS Score Card</h4>
                            <div class="detail-item">
                                <span class="label">Overall Score:</span>
                                <span class="value naks-score">${plotData.naksScoreCard.overallScore}/100</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Grade:</span>
                                <span class="value naks-grade grade-${plotData.naksScoreCard.grade.replace('+', '-plus')}">${plotData.naksScoreCard.grade}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Assessment:</span>
                                <span class="value">${plotData.naksScoreCard.assessmentMethod}</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill naks-progress" style="width: ${plotData.naksScoreCard.overallScore}%"></div>
                            </div>
                        </div>
                        
                        <div class="detail-card">
                            <h4>Risk Assessment</h4>
                            <div class="detail-item">
                                <span class="label">Flood Risk:</span>
                                <span class="value">${plotData.riskAssessment.floodRisk}%</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Soil Quality:</span>
                                <span class="value">${plotData.riskAssessment.soilQuality}%</span>
                                </div>
                            <div class="detail-item">
                                <span class="label">Water Access:</span>
                                <span class="value">${plotData.riskAssessment.waterAvailability}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="plot-visualization">
                        <div class="land-parcel-visual">
                            <div class="parcel-shape"></div>
                            <div class="parcel-grid"></div>
                        </div>
                    </div>
                    
                    <div class="tokenization-info">
                        <h4>Tokenization Details</h4>
                        <div class="token-details">
                            <div class="token-item">
                                <span class="label">Token ID:</span>
                                <span class="value">${plotData.tokenization.tokenId}</span>
                            </div>
                            <div class="token-item">
                                <span class="label">Blockchain:</span>
                                <span class="value">${plotData.tokenization.blockchain}</span>
                            </div>
                            <div class="token-item">
                                <span class="label">Minted:</span>
                                <span class="value">${new Date(plotData.tokenization.mintedAt).toLocaleString()}</span>
                            </div>
                        </div>
                        <button class="btn btn-primary" onclick="mintToken('${plotData.plotCode}')">
                            <i class="fas fa-coins"></i>
                            Mint Token
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.classList.add('active');
    
    // Generate QR code for plot
    const qrCodeData = {
        plotCode: plotData.plotCode,
        tokenId: plotData.tokenId,
        owner: plotData.ownership.owner,
        location: plotData.location
    };
    
    setTimeout(() => {
        const qrElement = document.getElementById('plotQrCode');
        if (qrElement) {
            QRCode.toCanvas(qrElement, JSON.stringify(qrCodeData), {
                width: 120,
                height: 120,
                margin: 2
            }, function (error) {
                if (error) console.error(error);
            });
        }
    }, 100);
}

// ========== ZK Badges + Property UI ==========
function ensureZkClaims(plotCode, plotData) {
    let entry = zkClaimsStore.find(z => z.plotCode === plotCode);
    if (entry) return entry;
    // Create simulated claims and a Merkle-like root
    const claims = {
        ownershipVerified: true,
        cleanTitleCount: 3,
        floodRiskOk: Math.random() > 0.2,
        eqZoneOk: true,
        areaSqft: 2400,
        registered: true,
        lienPresent: Math.random() > 0.7,
        courtCasePending: Math.random() > 0.85
    };
    const inputs = Object.entries(claims).map(([k,v]) => `${k}:${v}`).join('|');
    const rootPromise = sha256Hex(inputs);
    entry = { plotCode, claims, proof: { root: null, inputs } };
    zkClaimsStore.push(entry);
    rootPromise.then(root => { entry.proof.root = root; });
    return entry;
}

function renderPropertyPage(plotCode, title, plotData) {
    const container = document.getElementById('propertyPage');
    if (!container) return;
    const zk = ensureZkClaims(plotCode, plotData);
    const role = currentUser || 'public';

    const metaHtml = `
        <div class="property-header">
            <h2>Property ID: ${plotData?.plotCode || plotCode}</h2>
            <span class="badge-status ok"><i class="fas fa-badge-check"></i> Verified Snapshot</span>
        </div>
        <div class="property-meta">
            <div class="meta-item"><strong>Size</strong><br/>${zk.claims.areaSqft} sq ft</div>
            <div class="meta-item"><strong>Location</strong><br/>${plotData?.location?.district || 'Bangalore'}, ${plotData?.location?.village || 'KR Puram'}</div>
            <div class="meta-item"><strong>Status</strong><br/>${plotData?.tokenization?.status || 'Minted'}</div>
        </div>
    `;

    const publicBadges = `
        <div class="badges-grid">
            <div class="badge-card">
                <h4>Ownership Verified</h4>
                <div class="badge-status ${zk.claims.ownershipVerified ? 'ok' : 'bad'}">
                    <i class="fas fa-check-circle"></i> ${zk.claims.ownershipVerified ? 'Yes' : 'No'} (name hidden)
                </div>
            </div>
            <div class="badge-card">
                <h4>Clean Title History</h4>
                <div class="badge-status ok">
                    <i class="fas fa-history"></i> ${zk.claims.cleanTitleCount} transfers, all clear
                </div>
            </div>
            <div class="badge-card">
                <h4>Risk Profile</h4>
                <div class="badge-status ${zk.claims.floodRiskOk ? 'ok' : 'bad'}">
                    <i class="fas fa-water"></i> Flood-prone ${zk.claims.floodRiskOk ? 'No' : 'Yes'}
                </div>
                <div class="badge-status ${zk.claims.eqZoneOk ? 'ok' : 'bad'}" style="margin-top: 6px;">
                    <i class="fas fa-house-crack"></i> Earthquake Zone ${zk.claims.eqZoneOk ? 'Safe' : 'Risk'}
                </div>
            </div>
            <div class="badge-card">
                <h4>Owner Details</h4>
                <div class="badge-status lock">
                    <i class="fas fa-lock"></i> Locked — Consent Required
                </div>
            </div>
        </div>
    `;

    const bankExtras = role === 'bank' || role === 'admin' || role === 'verifier' ? `
        <div class="badges-grid" style="margin-top: 1rem;">
            <div class="badge-card">
                <h4>Lien Check</h4>
                <div class="badge-status ${zk.claims.lienPresent ? 'bad' : 'ok'}">
                    <i class="fas fa-scale-balanced"></i> ${zk.claims.lienPresent ? 'Mortgage/Lien Present' : 'No Lien'}
                </div>
            </div>
            <div class="badge-card">
                <h4>Court Case Check</h4>
                <div class="badge-status ${zk.claims.courtCasePending ? 'warn' : 'ok'}">
                    <i class="fas fa-gavel"></i> ${zk.claims.courtCasePending ? 'Pending litigation' : 'No pending cases'}
                </div>
            </div>
        </div>
    ` : '';

    const actions = `
        <div class="property-actions">
            <button class="btn btn-outline" onclick="viewPublicRiskData('${plotCode}')"><i class="fas fa-eye"></i> View Public Risk Data</button>
            ${role === 'bank' || role === 'investor' ? `<button class="btn btn-primary" onclick="requestOwnerConsent('${plotCode}', ['ownerId','saleDeed'])"><i class=\"fas fa-key\"></i> Request Owner Consent</button>` : ''}
        </div>
    `;

    container.innerHTML = metaHtml + publicBadges + bankExtras + actions + `
        <div style="margin-top: 1rem; font-size: 0.85rem; color: #64748b;">
            Proof Root: <span id="zkRoot">computing...</span>
        </div>
    `;

    setTimeout(() => {
        const rootSpan = document.getElementById('zkRoot');
        if (rootSpan) rootSpan.textContent = zk.proof.root ? zk.proof.root.slice(0, 16) + '…' : 'ready';
    }, 150);
}

function openPropertyDemo(plotCode, title, plotData) {
    if (!plotData) {
        // try load from localStorage
        const p = JSON.parse(localStorage.getItem(`plot_${plotCode}`) || 'null');
        renderPropertyPage(plotCode, title, p || {});
    } else {
        renderPropertyPage(plotCode, title, plotData);
    }
    showSection('property');
}

function getOrCreateDemoPlot() {
    let p = JSON.parse(localStorage.getItem('plot_NKS-DEMO-392Z') || 'null');
    if (!p) {
        const token = {
            id: 'NAK-2024-DEMO-XYZ',
            plotCode: 'NKS-DEMO-392Z',
            surveyId: 'approval-demo',
            surveyData: { surveyNumber: '392', district: 'bengaluru', village: 'kr-puram' },
            tokenHash: generateTokenHash(),
            ipfsHash: generateIPFSHash(),
            blockNumber: generateBlockNumber(),
            transactionHash: generateTransactionHash(),
            createdAt: new Date().toISOString(),
            status: 'minted'
        };
        p = createMockPlotData('NKS-DEMO-392Z', token.surveyData, token);
        p.tokenization.status = 'Minted';
        localStorage.setItem('plot_NKS-DEMO-392Z', JSON.stringify(p));
        localStorage.setItem('token_NAK-2024-DEMO-XYZ', JSON.stringify(p));
    }
    return p;
}

function viewPublicRiskData(plotCode) {
    const p = zkClaimsStore.find(z => z.plotCode === plotCode) || ensureZkClaims(plotCode);
    showNotification(`Flood risk: ${p.claims.floodRiskOk ? 'Low' : 'High'}; EQ Zone: ${p.claims.eqZoneOk ? 'Safe' : 'Risk'}`, 'info');
}

// ========== Consent Flow ==========
function requestOwnerConsent(plotCode, scope) {
    const req = {
        id: 'consent-' + Date.now(),
        plotCode,
        requesterRole: currentUser,
        requesterName: userData?.name || 'Unknown',
        requesterOrg: currentUser === 'bank' ? 'HDFC Bank' : (currentUser === 'investor' ? 'Investor' : 'Org'),
        scope,
        status: 'pending',
        ts: new Date().toISOString()
    };
    consentRequestsStore.push(req);
    persistStores();
    showNotification('Consent request sent to owner', 'success');
}

function renderConsentCenter() {
    const container = document.getElementById('consentCenter');
    if (!container) return;
    const myRole = currentUser;
    const isOwner = myRole === 'user';
    const list = consentRequestsStore.filter(r => isOwner ? r.status === 'pending' : true);
    if (list.length === 0) {
        container.innerHTML = '<div class="no-results">No consent activity.</div>';
        return;
    }
    container.innerHTML = `
        <div class="consent-list">
            ${list.map(r => `
                <div class=\"consent-card\">
                    <div>
                        <div><strong>${r.requesterOrg}</strong> (${r.requesterRole}) requests access to <strong>${r.scope.join(', ')}</strong> for <code>${r.plotCode}</code></div>
                        <div style=\"color:#64748b; font-size: 0.9rem;\">${new Date(r.ts).toLocaleString()} · Status: ${r.status}</div>
                    </div>
                    <div class=\"consent-actions\">${isOwner && r.status==='pending' ? `
                        <button class=\"btn btn-success\" onclick=\"approveConsent('${r.id}')\"><i class=\"fas fa-check\"></i></button>
                        <button class=\"btn btn-danger\" onclick=\"denyConsent('${r.id}')\"><i class=\"fas fa-times\"></i></button>
                    ` : ''}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function approveConsent(id) {
    const r = consentRequestsStore.find(x => x.id === id);
    if (!r) return;
    r.status = 'approved';
    verificationLogsStore.push({ who: userData?.email || 'owner', method: 'consent-approve', ts: new Date().toISOString(), proof_hash: r.id });
    // Grant access to requester
    if (r.requesterRole === 'client' || r.requesterRole === 'user') {
        clientAccessStore.push({ clientEmail: r.requesterName || 'client', plotCode: r.plotCode, scope: r.scope, approvedAt: new Date().toISOString() });
    }
    persistStores();
    renderConsentCenter();
    showNotification('Consent approved. Access logged on-chain (simulated).', 'success');
}

function denyConsent(id) {
    const r = consentRequestsStore.find(x => x.id === id);
    if (!r) return;
    r.status = 'denied';
    verificationLogsStore.push({ who: userData?.email || 'owner', method: 'consent-deny', ts: new Date().toISOString(), proof_hash: r.id });
    persistStores();
    renderConsentCenter();
    showNotification('Consent denied.', 'info');
}

function renderAccessList() {
    const container = document.getElementById('accessList');
    if (!container) return;
    const email = userData?.email || '';
    const mine = clientAccessStore.filter(a => a.clientEmail === (userData?.name || 'client') || a.clientEmail === email);
    if (mine.length === 0) {
        container.innerHTML = '<div class="no-data">No granted access yet.</div>';
        return;
    }
    container.innerHTML = mine.map(a => {
        const pdata = JSON.parse(localStorage.getItem(`plot_${a.plotCode}`) || 'null');
        const title = pdata ? pdata.plotCode : a.plotCode;
        return `
        <div class="approval-card">
            <div class="approval-header">
                <h3 class="approval-title">${title}</h3>
                <span class="status-badge approved">APPROVED</span>
            </div>
            <div class="approval-details">
                <div class="detail-item"><span class="detail-label">Scope</span><span class="detail-value">${(a.scope||[]).join(', ')}</span></div>
                <div class="detail-item"><span class="detail-label">Granted</span><span class="detail-value">${new Date(a.approvedAt).toLocaleString()}</span></div>
            </div>
            <div class="approval-actions">
                <button class="btn btn-outline" onclick="openPropertyDemo('${a.plotCode}','Property')"><i class="fas fa-eye"></i> View</button>
            </div>
        </div>`;
    }).join('');
}

function mintToken(plotCode) {
    const plotData = JSON.parse(localStorage.getItem(`plot_${plotCode}`));
    if (!plotData) return;
    
    // Update tokenization status
    plotData.tokenization.status = 'Minted';
    plotData.tokenization.mintedAt = new Date().toISOString();
    plotData.tokenization.tokenId = `#${Math.floor(Math.random() * 99999) + 10000}`;
    
    // Save updated data
    localStorage.setItem(`plot_${plotCode}`, JSON.stringify(plotData));
    
    // Show success message
    showNotification(`Token ID ${plotData.tokenization.tokenId} minted on blockchain`, 'success');
    
    // Update the display
    setTimeout(() => {
        const tokenIdElement = document.querySelector('.token-item .value');
        if (tokenIdElement) {
            tokenIdElement.textContent = plotData.tokenization.tokenId;
        }
    }, 100);
}

// Search functionality
function showSearchTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.search-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[onclick="showSearchTab('${tab}')"]`).classList.add('active');
    
    // Update placeholder text
    const searchInput = document.getElementById('searchInput');
    switch(tab) {
        case 'token':
            searchInput.placeholder = 'Enter Token ID (e.g., NAK-2024-...)';
            break;
        case 'plot':
            searchInput.placeholder = 'Enter Plot Code (e.g., NKS-2451-908X)';
            break;
        case 'survey':
            searchInput.placeholder = 'Enter Survey Number (e.g., 12345)';
            break;
    }
}

function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.trim();
    const resultsContainer = document.getElementById('searchResults');
    
    if (!searchTerm) {
        showNotification('Please enter a search term', 'error');
        return;
    }
    
    // Clear previous results
    resultsContainer.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
    
    // Perform search
    setTimeout(() => {
        const results = searchLandRecords(searchTerm);
        displaySearchResults(results);
    }, 500);
}

function searchLandRecords(searchTerm) {
    const results = [];
    
    // Search by token ID
    const tokenData = localStorage.getItem(`token_${searchTerm}`);
    if (tokenData) {
        results.push({
            type: 'token',
            data: JSON.parse(tokenData),
            match: 'exact'
        });
    }
    
    // Search by plot code
    const plotData = localStorage.getItem(`plot_${searchTerm}`);
    if (plotData) {
        results.push({
            type: 'plot',
            data: JSON.parse(plotData),
            match: 'exact'
        });
    }
    
    // Search in token mappings
    const tokenMappings = JSON.parse(localStorage.getItem('token_mappings') || '[]');
    const mappingResults = tokenMappings.filter(mapping => 
        mapping.tokenId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mapping.plotCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mapping.surveyNumber.includes(searchTerm) ||
        mapping.district.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mapping.village.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    mappingResults.forEach(mapping => {
        const plotData = localStorage.getItem(`plot_${mapping.plotCode}`);
        if (plotData) {
            results.push({
                type: 'mapping',
                data: JSON.parse(plotData),
                mapping: mapping,
                match: 'partial'
            });
        }
    });
    
    return results;
}

function displaySearchResults(results) {
    const resultsContainer = document.getElementById('searchResults');
    
    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No Results Found</h3>
                <p>No land records found matching your search criteria.</p>
            </div>
        `;
        return;
    }
    
    resultsContainer.innerHTML = `
        <div class="search-results-header">
            <h3>Search Results (${results.length} found)</h3>
        </div>
        <div class="search-results-list">
            ${results.map(result => `
                <div class="search-result-card">
                    <div class="result-header">
                        <h4>${result.data.plotCode}</h4>
                        <span class="result-type">${result.type.toUpperCase()}</span>
                        <span class="match-type ${result.match}">${result.match}</span>
                    </div>
                    <div class="result-details">
                        <div class="detail-row">
                            <span class="label">Token ID:</span>
                            <span class="value">${result.data.tokenId}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Owner:</span>
                            <span class="value">${result.data.ownership.owner}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Location:</span>
                            <span class="value">${result.data.location.district}, ${result.data.location.village}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">NAKS Score:</span>
                            <span class="value naks-score">${result.data.naksScoreCard.overallScore}/100 (${result.data.naksScoreCard.grade})</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Status:</span>
                            <span class="value status-${result.data.tokenization.status.toLowerCase()}">${result.data.tokenization.status}</span>
                        </div>
                    </div>
                    <div class="result-actions">
                        <button class="btn btn-primary" onclick="viewSearchResult('${result.data.plotCode}')">
                            <i class="fas fa-eye"></i>
                            View Details
                        </button>
                        <button class="btn btn-outline" onclick="downloadSearchResult('${result.data.plotCode}')">
                            <i class="fas fa-download"></i>
                            Download Report
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function viewSearchResult(plotCode) {
    const plotData = JSON.parse(localStorage.getItem(`plot_${plotCode}`));
    if (plotData) {
        // Open Property page with ZK badges by default
        openPropertyDemo(plotData.tokenId || plotData.plotCode, `Survey #${plotData.surveyData?.surveyNumber || 'N/A'}`, plotData);
        showSection('property');
    }
}

function downloadSearchResult(plotCode) {
    const plotData = JSON.parse(localStorage.getItem(`plot_${plotCode}`));
    if (plotData) {
        // Create downloadable report
        const reportData = {
            plotCode: plotData.plotCode,
            tokenId: plotData.tokenId,
            owner: plotData.ownership.owner,
            location: plotData.location,
            naksScore: plotData.naksScoreCard,
            financial: plotData.financial,
            insurance: plotData.insurance,
            generatedAt: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(reportData, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `land-report-${plotCode}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        showNotification('Land report downloaded successfully!', 'success');
    }
}

function showIdCard(token) {
    const modal = document.getElementById('idCardModal');
    const idCard = document.getElementById('idCard');
    
    // Generate QR code
    const qrCodeData = {
        tokenId: token.id,
        hash: token.tokenHash,
        ipfs: token.ipfsHash,
        blockNumber: token.blockNumber,
        transactionHash: token.transactionHash
    };
    
    // Create ID card content
    idCard.innerHTML = `
        <div class="id-card-header">
            <div class="id-logo">
                <i class="fas fa-map-marked-alt"></i>
            </div>
            <h3>Naks.io Digital Ownership</h3>
        </div>
        <div class="id-card-body">
            <div class="qr-code">
                <div class="qr-placeholder" id="qrCode"></div>
            </div>
            <div class="id-details">
                <div class="id-field">
                    <label>Reference ID:</label>
                    <span>${token.id}</span>
                </div>
                <div class="id-field">
                    <label>Token Hash:</label>
                    <span>${token.tokenHash}</span>
                </div>
                <div class="id-field">
                    <label>IPFS Hash:</label>
                    <span>${token.ipfsHash}</span>
                </div>
                <div class="id-field">
                    <label>Block Number:</label>
                    <span>${token.blockNumber}</span>
                </div>
                <div class="id-field">
                    <label>Transaction:</label>
                    <span>${token.transactionHash}</span>
                </div>
                <div class="id-field">
                    <label>Issue Date:</label>
                    <span>${new Date(token.createdAt).toLocaleDateString()}</span>
                </div>
                <div class="id-field">
                    <label>Status:</label>
                    <span class="status-verified">Verified</span>
                </div>
            </div>
        </div>
        <div class="id-card-footer">
            <button class="btn btn-outline" onclick="downloadIdCard('${token.id}')">
                <i class="fas fa-download"></i>
                Download ID
            </button>
        </div>
    `;
    
    // Generate QR code
    QRCode.toCanvas(document.getElementById('qrCode'), JSON.stringify(qrCodeData), {
        width: 120,
        height: 120,
        margin: 2
    }, function (error) {
        if (error) console.error(error);
    });
    
    modal.classList.add('active');
}

function downloadIdCard(tokenId) {
    // Simulate download
    showNotification('ID card download started...', 'info');
}

function viewTokenDetails(parcelId) {
    const token = tokenizedLands.find(t => t.id === parcelId);
    if (!token) return;
    
    const modal = document.getElementById('tokenModal');
    const details = document.getElementById('tokenDetails');
    
    details.innerHTML = `
        <div class="token-details">
            <h3>Token Information</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <label>Token ID:</label>
                    <span>${token.id}</span>
                </div>
                <div class="detail-item">
                    <label>Survey Number:</label>
                    <span>${token.surveyData.surveyNumber}</span>
                </div>
                <div class="detail-item">
                    <label>District:</label>
                    <span>${token.surveyData.district}</span>
                </div>
                <div class="detail-item">
                    <label>Village:</label>
                    <span>${token.surveyData.village}</span>
                </div>
                <div class="detail-item">
                    <label>Token Hash:</label>
                    <span>${token.tokenHash}</span>
                </div>
                <div class="detail-item">
                    <label>IPFS Hash:</label>
                    <span>${token.ipfsHash}</span>
                </div>
                <div class="detail-item">
                    <label>Block Number:</label>
                    <span>${token.blockNumber}</span>
                </div>
                <div class="detail-item">
                    <label>Transaction Hash:</label>
                    <span>${token.transactionHash}</span>
                </div>
                <div class="detail-item">
                    <label>Created At:</label>
                    <span>${new Date(token.createdAt).toLocaleString()}</span>
                </div>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
        // Remove dynamically created modals
        if (modal.classList.contains('plot-dashboard-modal')) {
            setTimeout(() => modal.remove(), 300);
        }
    });
}

// Utility functions
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// ===== Ingestion & Matching =====
async function ingestGovJson(jsonText, filename, size) {
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (e) {
        showNotification('Invalid JSON file', 'error');
        return;
    }

    const hash = await sha256Hex(jsonText);
    const docId = 'gov-' + Date.now();
    rawGovDocsStore.push({ id: docId, type: 'gov_json', filename, size, hash, storedAt: new Date().toISOString(), rawRef: docId });

    // Attach to queue for future anchoring
    anchorQueue.push(hash);

    // Attempt auto mapping
    const surveyNo = (parsed.survey_no || parsed.surveyNumber || '').toString();
    const district = (parsed.district || '').toString();
    const village = (parsed.village || '').toString();

    const plot = autoMapOrCreatePlot({ surveyNo, village, district, govHash: hash, rawRef: docId, geojson: parsed.polygon_geojson });

    // Parse encumbrances if present
    const encs = Array.isArray(parsed.encumbrances) ? parsed.encumbrances : [];
    for (const enc of encs) {
        const encData = await createEncumbranceFromGov(enc, docId);
        encumbranceRecordsStore.push(encData);
        // Link to plot via survey number metadata
        // Minimal linkage retained via verification log
        verificationLogsStore.push({ who: 'system', method: 'EC', ts: new Date().toISOString(), proof_hash: encData.hash });
        anchorQueue.push(encData.hash);
    }

    persistStores();
}

function autoMapOrCreatePlot({ surveyNo, village, district, govHash, rawRef, geojson }) {
    let best = null;
    let bestScore = -1;
    for (const p of plotsStore) {
        const score = similarityKey(p.survey_no + '|' + p.village + '|' + p.district, surveyNo + '|' + village + '|' + district);
        if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best && bestScore >= 0.8) {
        best.gov_source_ids = Array.from(new Set([...(best.gov_source_ids || []), rawRef]));
        best.last_gov_fetch_ts = new Date().toISOString();
        best.gov_hash = govHash;
        if (geojson) best.polygon_geojson = geojson;
        return best;
    }
    const plot = {
        plot_id: 'plot-' + Date.now(),
        polygon_geojson: geojson || null,
        survey_no: surveyNo,
        village: village,
        district: district,
        gov_source_ids: [rawRef],
        last_gov_fetch_ts: new Date().toISOString(),
        gov_hash: govHash
    };
    plotsStore.push(plot);
    return plot;
}

async function createEncumbranceFromGov(enc, rawRef) {
    const payload = {
        encumbrance_id: enc.id || ('enc-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
        type: enc.type || 'unknown',
        source: enc.source || 'EC',
        registered_date: enc.registered_date || enc.date || null,
        status: enc.status || 'unknown',
        raw_doc_uri: rawRef,
        verified_by: 'system'
    };
    payload.hash = await sha256Hex(payload);
    return payload;
}

function similarityKey(a, b) {
    // Simple similarity using Jaccard of token sets
    const setA = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const setB = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const inter = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : inter.size / union.size;
}

function renderGovDocsList() {
    const list = document.getElementById('govDocsList');
    if (!list) return;
    if (rawGovDocsStore.length === 0) {
        list.innerHTML = '<div class="no-results">No ingested documents yet.</div>';
        return;
    }
    list.innerHTML = rawGovDocsStore.map(doc => `
        <div class="search-result-card">
            <div class="result-header">
                <h4>${doc.filename}</h4>
                <span class="result-type">${doc.type.toUpperCase()}</span>
            </div>
            <div class="result-details">
                <div class="detail-row"><span class="label">Hash:</span><span class="value">${doc.hash}</span></div>
                <div class="detail-row"><span class="label">Stored:</span><span class="value">${new Date(doc.storedAt).toLocaleString()}</span></div>
            </div>
        </div>
    `).join('');
}

async function anchorBatch() {
    if (anchorQueue.length === 0) {
        showNotification('No pending items to anchor', 'info');
        return;
    }
    const root = await merkleRootHex(anchorQueue);
    // Simulate on-chain tx
    const txHash = generateTransactionHash();
    verificationLogsStore.push({ who: userData ? userData.email : 'admin', method: 'anchor', ts: new Date().toISOString(), proof_hash: root });
    anchorQueue = [];
    persistStores();
    renderGovDocsList();
    showNotification(`Anchored Merkle root ${root.slice(0, 10)}... Tx ${txHash.slice(0, 10)}...`, 'success');
    if (typeof logActivity === 'function') {
        logActivity('anchor', 'Batch anchored', { root: root.slice(0,10), tx: txHash.slice(0,10) });
    }
}

function updateStats() {
    // Update dashboard stats
    const pendingCount = pendingApprovals.length;
    const approvedCount = tokenizedLands.length;
    
    // Update stats display (simplified)
    console.log(`Updated stats: ${pendingCount} pending, ${approvedCount} approved`);
}

// ===== Activity & Notifications =====
function logActivity(type, message, meta) {
    activityStore.push({ id: generateId(), type, message, meta: meta || {}, ts: new Date().toISOString() });
    persistStores();
}

function renderNotifications() {
    const list = document.getElementById('notificationsList');
    if (!list) return;
    if (!activityStore || activityStore.length === 0) {
        list.innerHTML = '<div class="no-data">No activity yet.</div>';
        return;
    }
    const items = [...activityStore].sort((a,b)=> new Date(b.ts)-new Date(a.ts)).slice(0, 50);
    list.innerHTML = items.map(a => `
        <div class="approval-card">
            <div class="approval-header">
                <h3 class="approval-title">${a.message}</h3>
                <span class="status-badge approved">${a.type.replace(/_/g,' ').toUpperCase()}</span>
            </div>
            <div class="approval-details">
                <div class="detail-item"><span class="detail-label">Time</span><span class="detail-value">${new Date(a.ts).toLocaleString()}</span></div>
                ${a.meta && a.meta.tokenId ? `<div class=\"detail-item\"><span class=\"detail-label\">Token</span><span class=\"detail-value\">${a.meta.tokenId}</span></div>` : ''}
                ${a.meta && a.meta.plotCode ? `<div class=\"detail-item\"><span class=\"detail-label\">Plot</span><span class=\"detail-value\">${a.meta.plotCode}</span></div>` : ''}
            </div>
        </div>
    `).join('');
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== Assets: Export Logo as PNG =====
// removed logo download utilities

function loadMockData() {
    // Load registered users from localStorage
    const savedUsers = localStorage.getItem('naksio_users');
    if (savedUsers) {
        registeredUsers = JSON.parse(savedUsers);
        console.log('Loaded users from localStorage:', registeredUsers);
        // Migrate old demo roles to new roles (user/admin/client)
        const hasNewRole = registeredUsers.some(u => ['user','admin','client'].includes(u.role));
        const hasDemoUser = registeredUsers.some(u => u.email === 'user@demo.com');
        const hasDemoAdmin = registeredUsers.some(u => u.email === 'admin@demo.com');
        if (!hasNewRole || !hasDemoUser || !hasDemoAdmin) {
            registeredUsers = [
                { id: 'user-1', name: 'John Smith', email: 'user@demo.com', password: 'password123', role: 'user', phone: '+91 98765 43210', createdAt: new Date().toISOString() },
                { id: 'user-2', name: 'Client One', email: 'client@demo.com', password: 'password123', role: 'client', phone: '+91 98765 43211', createdAt: new Date().toISOString() },
                { id: 'user-3', name: 'Admin User', email: 'admin@demo.com', password: 'password123', role: 'admin', phone: '+91 98765 43213', createdAt: new Date().toISOString() }
            ];
            localStorage.setItem('naksio_users', JSON.stringify(registeredUsers));
            console.log('Migrated users to new role model');
        }
    } else {
        // Create some demo users
        registeredUsers = [
            {
                id: 'user-1',
                name: 'John Smith',
                email: 'user@demo.com',
                password: 'password123',
                role: 'user',
                phone: '+91 98765 43210',
                createdAt: new Date().toISOString()
            },
            {
                id: 'user-2',
                name: 'Client One',
                email: 'client@demo.com',
                password: 'password123',
                role: 'client',
                phone: '+91 98765 43211',
                createdAt: new Date().toISOString()
            },
            {
                id: 'user-3',
                name: 'Admin User',
                email: 'admin@demo.com',
                password: 'password123',
                role: 'admin',
                phone: '+91 98765 43213',
                createdAt: new Date().toISOString()
            }
        ];
        localStorage.setItem('naksio_users', JSON.stringify(registeredUsers));
        console.log('Created demo users:', registeredUsers);
    }
    
    // Load some mock data for demonstration
    pendingApprovals = [
        {
            id: 'approval-1',
            district: 'bangalore',
            taluk: 'bangalore-south',
            hobli: 'hobli1',
            village: 'village1',
            surnoc: 'surnoc1',
            hissa: 'hissa1',
            period: '2024',
            surveyNumber: '12347',
            status: 'pending',
            submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            submittedBy: 'landowner@demo.com',
            files: [{ name: 'survey.pdf', size: '2.5 MB' }]
        },
        {
            id: 'approval-2',
            district: 'mysore',
            taluk: 'bangalore-north',
            hobli: 'hobli2',
            village: 'village2',
            surnoc: 'surnoc2',
            hissa: 'hissa2',
            period: '2024',
            surveyNumber: '12348',
            status: 'pending',
            submittedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            submittedBy: 'landowner@demo.com',
            files: [{ name: 'ownership.pdf', size: '1.8 MB' }, { name: 'survey.jpg', size: '3.2 MB' }]
        }
    ];
    
    updateApprovalsList();

    // Seed demo plot/token if not present
    if (!localStorage.getItem('plot_NKS-DEMO-392Z')) {
        const approval = pendingApprovals[0];
        const token = {
            id: 'NAK-2024-DEMO-XYZ',
            plotCode: 'NKS-DEMO-392Z',
            surveyId: approval?.id || 'approval-demo',
            surveyData: approval || {},
            tokenHash: generateTokenHash(),
            ipfsHash: generateIPFSHash(),
            blockNumber: generateBlockNumber(),
            transactionHash: generateTransactionHash(),
            createdAt: new Date().toISOString(),
            status: 'minted'
        };
        const plotData = createMockPlotData('NKS-DEMO-392Z', approval || {
            district: 'bengaluru', village: 'kr-puram', surveyNumber: '392'
        }, token);
        plotData.tokenization.status = 'Minted';
        localStorage.setItem('plot_NKS-DEMO-392Z', JSON.stringify(plotData));
        localStorage.setItem('token_NAK-2024-DEMO-XYZ', JSON.stringify(plotData));
        const mappings = JSON.parse(localStorage.getItem('token_mappings') || '[]');
        mappings.push({ tokenId: token.id, plotCode: 'NKS-DEMO-392Z', surveyNumber: '392', district: 'bengaluru', village: 'kr-puram', createdAt: new Date().toISOString() });
        localStorage.setItem('token_mappings', JSON.stringify(mappings));
    }

    // Seed one consent request example
    if (consentRequestsStore.length === 0) {
        consentRequestsStore.push({
            id: 'consent-seed-1',
            plotCode: 'NKS-DEMO-392Z',
            requesterRole: 'bank',
            requesterName: 'HDFC Officer',
            requesterOrg: 'HDFC Bank',
            scope: ['ownerId','saleDeed'],
            status: 'pending',
            ts: new Date().toISOString()
        });
        persistStores();
    }

    // Seed additional demo plots and consent requests
    seedDemoPlotsAndRequests();
}

function seedDemoPlotsAndRequests() {
    const demos = [
        { code: 'NKS-BLR-100A', district: 'bengaluru', village: 'kr-puram', survey: '100', token: 'NAK-2024-BLR-100A' },
        { code: 'NKS-MYS-221B', district: 'mysore', village: 'village2', survey: '221', token: 'NAK-2024-MYS-221B' },
        { code: 'NKS-UDU-334C', district: 'udupi', village: 'village3', survey: '334', token: 'NAK-2024-UDU-334C' },
        { code: 'NKS-RAI-445D', district: 'raichur', village: 'village4', survey: '445', token: 'NAK-2024-RAI-445D' }
    ];
    const mappings = JSON.parse(localStorage.getItem('token_mappings') || '[]');
    demos.forEach(d => {
        if (!localStorage.getItem(`plot_${d.code}`)) {
            const approval = {
                id: `approval-${d.code}`,
                district: d.district,
                taluk: 'bangalore-east',
                hobli: 'hobli1',
                village: d.village,
                surnoc: 's1',
                hissa: 'h1',
                period: '2024',
                surveyNumber: d.survey
            };
            const token = {
                id: d.token,
                plotCode: d.code,
                surveyId: approval.id,
                surveyData: approval,
                tokenHash: generateTokenHash(),
                ipfsHash: generateIPFSHash(),
                blockNumber: generateBlockNumber(),
                transactionHash: generateTransactionHash(),
                createdAt: new Date().toISOString(),
                status: 'minted'
            };
            const plotData = createMockPlotData(d.code, approval, token);
            plotData.tokenization.status = 'Minted';
            localStorage.setItem(`plot_${d.code}`, JSON.stringify(plotData));
            localStorage.setItem(`token_${d.token}`, JSON.stringify(plotData));
            mappings.push({ tokenId: token.id, plotCode: d.code, surveyNumber: d.survey, district: d.district, village: d.village, createdAt: new Date().toISOString() });
        }
    });
    localStorage.setItem('token_mappings', JSON.stringify(mappings));

    // Add varied consent requests if fewer than 4 exist
    const now = Date.now();
    const toAdd = [
        { id: 'consent-seed-2', plotCode: 'NKS-BLR-100A', role: 'investor', org: 'Buyer App', scope: ['ownerId'], status: 'pending', dt: now - 3600_000 },
        { id: 'consent-seed-3', plotCode: 'NKS-MYS-221B', role: 'bank', org: 'ICICI Bank', scope: ['saleDeed','aadhaarMappedDoc'], status: 'approved', dt: now - 7200_000 },
        { id: 'consent-seed-4', plotCode: 'NKS-UDU-334C', role: 'verifier', org: 'Gov Verifier', scope: ['lienReport'], status: 'denied', dt: now - 5400_000 },
        { id: 'consent-seed-5', plotCode: 'NKS-RAI-445D', role: 'bank', org: 'HDFC Bank', scope: ['ownerId','courtCaseReport'], status: 'pending', dt: now - 1800_000 }
    ];
    const existingIds = new Set(consentRequestsStore.map(r => r.id));
    toAdd.forEach(r => {
        if (!existingIds.has(r.id)) {
            consentRequestsStore.push({
                id: r.id,
                plotCode: r.plotCode,
                requesterRole: r.role,
                requesterName: r.org + ' User',
                requesterOrg: r.org,
                scope: r.scope,
                status: r.status,
                ts: new Date(r.dt).toISOString()
            });
        }
    });
    persistStores();
}

// Add notification styles
const notificationStyles = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 8px;
        padding: 1rem 1.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        z-index: 3000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    }
    
    .notification.show {
        transform: translateX(0);
    }
    
    .notification-success {
        border-left: 4px solid #28a745;
    }
    
    .notification-error {
        border-left: 4px solid #dc3545;
    }
    
    .notification-info {
        border-left: 4px solid #007BFF;
    }
    
    .notification i {
        font-size: 1.25rem;
    }
    
    .notification-success i {
        color: #28a745;
    }
    
    .notification-error i {
        color: #dc3545;
    }
    
    .notification-info i {
        color: #007BFF;
    }
`;

// Add styles to head
const styleSheet = document.createElement('style');
styleSheet.textContent = notificationStyles;
document.head.appendChild(styleSheet);
