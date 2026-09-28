// ═══════════════════════════════════════════════════════════════
// COCON APP — Main Application Logic
// ═══════════════════════════════════════════════════════════════

let currentProject = null;
let isSharedView = false;
let currentRoom = null;
let projects = [];
let allItems = [];
let unsubProject = null;
let unsubItems = null;
let unsubComments = null;

// ─── SCREEN MANAGEMENT ───────────────────────────────────────

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    const el = document.getElementById(id);
    if (el) el.style.display = '';
    // Dismiss loading screen
    const loader = document.getElementById('loading-screen');
    if (loader) loader.style.opacity = '0';
    setTimeout(() => { if (loader && loader.parentNode) loader.remove(); }, 400);
}

// ─── DASHBOARD ───────────────────────────────────────────────

async function showDashboard() {
    showScreen('dashboard-screen');
    currentProject = null;
    currentRoom = null;
    allItems = [];
    cleanupListeners();
    loadProjects();
}

async function loadProjects() {
    if (!currentUser) return;
    try {
        const snap = await db.collection('projects')
            .where('ownerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error('Load projects error:', err);
        projects = [];
    }
    renderProjects();
}

function renderProjects() {
    const grid = document.getElementById('projects-grid');
    const empty = document.getElementById('empty-state');
    const subtitle = document.getElementById('dashboard-subtitle');

    if (projects.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'flex';
        subtitle.textContent = 'Vous avez 0 projet';
        return;
    }

    empty.style.display = 'none';
    grid.style.display = 'grid';
    subtitle.textContent = `Vous avez ${projects.length} projet${projects.length > 1 ? 's' : ''}`;

    grid.innerHTML = projects.map(p => `
        <div class="project-card" onclick="openProject('${p.id}')">
            <div class="project-card-header">
                <div class="project-card-icon">🏠</div>
                <button class="btn-icon-sm" onclick="event.stopPropagation(); deleteProject('${p.id}', '${escHtml(p.name).replace(/'/g, "\\'")}')" title="Supprimer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
            <h3 class="project-card-name">${escHtml(p.name)}</h3>
            <p class="project-card-meta">${p.surface ? p.surface + ' m²' : ''}${p.surface && p.style ? ' • ' : ''}${p.style || ''}</p>
            <div class="project-card-footer">
                <span class="project-card-rooms">${(p.rooms || []).length} pièce${(p.rooms || []).length > 1 ? 's' : ''}</span>
                <span class="project-card-budget">${formatPrice(p.totalBudget || 0)}</span>
            </div>
        </div>
    `).join('');
}

// ─── PROJECT CRUD ────────────────────────────────────────────

function showNewProjectModal() {
    document.getElementById('modal-new-project').classList.add('active');
    document.getElementById('project-input-name').focus();
}

async function createProject(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const name = document.getElementById('project-input-name').value.trim();
    const surface = parseFloat(document.getElementById('project-input-surface').value) || null;
    const style = document.getElementById('project-input-style').value;

    // Use template rooms if a template is selected, otherwise use checked chips
    let rooms;
    if (selectedTemplate && PROJECT_TEMPLATES[selectedTemplate]) {
        rooms = PROJECT_TEMPLATES[selectedTemplate].rooms.map(r => ({ ...r }));
    } else {
        rooms = [...document.querySelectorAll('#room-chips input:checked')].map(cb => {
            const icons = { 'Salon': '🛋️', 'Cuisine': '🍳', 'Chambre': '🛏️', 'Salle de bain': '🚿', 'Entrée': '🚪', 'Bureau': '💻', 'Chambre enfant': '🧸', 'Terrasse': '🌿' };
            return { name: cb.value, icon: icons[cb.value] || '🏠', surface: null };
        });
    }

    const shareId = generateShareId();

    try {
        const docRef = await db.collection('projects').add({
            name, surface, style,
            rooms: rooms,
            colors: [],
            totalBudget: 0,
            ownerId: currentUser.uid,
            ownerName: currentUser.displayName || currentUser.email,
            shareId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        closeModalById('modal-new-project');
        e.target.reset();
        selectedTemplate = null;
        document.querySelectorAll('#room-chips input').forEach((cb, i) => cb.checked = i < 3);
        document.getElementById('room-chips').style.display = '';
        toast('Projet créé !');
        openProject(docRef.id);
    } catch (err) {
        console.error('Create project error:', err);
        toast('Erreur lors de la création');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function deleteProject(id, name) {
    if (!confirm(`Supprimer "${name}" ? Cette action est irréversible.`)) return;

    try {
        const items = await db.collection('projects').doc(id).collection('items').get();
        const comments = await db.collection('projects').doc(id).collection('comments').get();
        const batch = db.batch();
        items.docs.forEach(doc => batch.delete(doc.ref));
        comments.docs.forEach(doc => batch.delete(doc.ref));
        batch.delete(db.collection('projects').doc(id));
        await batch.commit();
        toast('Projet supprimé');
        loadProjects();
    } catch (err) {
        console.error('Delete project error:', err);
        toast('Erreur lors de la suppression');
    }
}

// ─── OPEN PROJECT / MOODBOARD ────────────────────────────────

async function openProject(projectId) {
    showScreen('project-screen');
    cleanupListeners();
    currentRoom = null;

    // Real-time listener on project
    unsubProject = db.collection('projects').doc(projectId).onSnapshot(doc => {
        if (!doc.exists) { showDashboard(); return; }
        currentProject = { id: doc.id, ...doc.data() };
        renderProjectSidebar();
        document.getElementById('breadcrumb-project').textContent = currentProject.name;

        if (currentRoom === null && currentProject.rooms && currentProject.rooms.length > 0) {
            selectRoom(0);
        } else if (currentRoom !== null) {
            updateRoomHeader();
        }
        checkCollabBanner();
        checkOnboarding();
    });

    // Real-time listener on items
    unsubItems = db.collection('projects').doc(projectId).collection('items')
        .orderBy('createdAt', 'asc')
        .onSnapshot(snap => {
            allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderItems();
            recalcBudget(projectId, allItems);
        });

    // Real-time listener on comments
    unsubComments = db.collection('projects').doc(projectId).collection('comments')
        .orderBy('createdAt', 'asc')
        .onSnapshot(snap => {
            renderComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
}

function cleanupListeners() {
    if (unsubProject) unsubProject();
    if (unsubItems) unsubItems();
    if (unsubComments) unsubComments();
    if (unsubPostits) unsubPostits();
    if (unsubMeasures) unsubMeasures();
    if (unsubPlans) unsubPlans();
    unsubProject = unsubItems = unsubComments = unsubPostits = unsubMeasures = unsubPlans = null;
}

// ─── SIDEBAR ─────────────────────────────────────────────────

function renderProjectSidebar() {
    if (!currentProject) return;

    document.getElementById('project-name').textContent = currentProject.name;
    const meta = [currentProject.surface ? currentProject.surface + ' m²' : '', currentProject.style].filter(Boolean).join(' • ');
    document.getElementById('project-meta').textContent = meta || 'Projet déco';
    document.getElementById('total-budget').textContent = formatPrice(currentProject.totalBudget || 0);

    const roomsEl = document.getElementById('sidebar-rooms');
    const rooms = currentProject.rooms || [];
    roomsEl.innerHTML = rooms.map((r, i) => `
        <div class="sidebar-room ${currentRoom === i ? 'active' : ''}" onclick="selectRoom(${i})"
             ondragover="event.preventDefault(); this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="handleRoomDrop(event, ${i}); this.classList.remove('drag-over')">
            <span class="sidebar-room-icon">${r.icon || '🏠'}</span>
            <span class="sidebar-room-name">${escHtml(r.name)}</span>
            ${r.surface ? `<span class="sidebar-room-surface">${r.surface}m²</span>` : ''}
            <button class="btn-icon-xs" onclick="event.stopPropagation(); deleteRoom(${i})" title="Supprimer">×</button>
        </div>
    `).join('');

    renderPalette();
}

function selectRoom(index) {
    if (budgetViewActive) hideBudgetDashboard();
    if (exploreViewActive) hideExplorePage();
    if (dimensionsViewActive) hideDimensionsView();
    if (wishlistViewActive) hideWishlist();
    currentRoom = index;
    currentCategoryFilter = 'all';
    renderProjectSidebar();
    updateRoomHeader();
    renderItems();
}

let currentCategoryFilter = 'all';

function setCategoryFilter(cat) {
    currentCategoryFilter = cat;
    document.querySelectorAll('.category-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
    renderItems();
}

function updateRoomHeader() {
    if (!currentProject || currentRoom === null) return;
    const room = currentProject.rooms[currentRoom];
    if (!room) return;
    document.getElementById('room-title').textContent = room.name;
}

// ─── DRAG & DROP BETWEEN ROOMS ──────────────────────────────

let draggedItemId = null;

function handleItemDragStart(e, itemId) {
    draggedItemId = itemId;
    e.dataTransfer.effectAllowed = 'move';
    e.target.closest('.item-card').classList.add('dragging');
}

function handleItemDragEnd(e) {
    draggedItemId = null;
    e.target.closest('.item-card')?.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

async function handleRoomDrop(e, targetRoomIndex) {
    e.preventDefault();
    if (!draggedItemId || !currentProject) return;
    if (targetRoomIndex === currentRoom) return; // same room, ignore

    try {
        const targetRoom = currentProject.rooms[targetRoomIndex];
        await db.collection('projects').doc(currentProject.id).collection('items').doc(draggedItemId).update({
            roomIndex: targetRoomIndex,
            roomName: targetRoom.name
        });
        toast(`Déplacé vers ${targetRoom.name}`);
    } catch (err) {
        console.error('Move item error:', err);
        toast('Erreur lors du déplacement');
    }
    draggedItemId = null;
}

// ─── ROOMS ───────────────────────────────────────────────────

function showAddRoomModal() {
    document.getElementById('modal-add-room').classList.add('active');
    document.getElementById('room-input-name').focus();
}

async function addRoom(e) {
    e.preventDefault();
    const name = document.getElementById('room-input-name').value.trim();
    const surface = parseFloat(document.getElementById('room-input-surface').value) || null;
    const icon = document.getElementById('room-input-icon').value;

    try {
        const rooms = [...(currentProject.rooms || []), { name, surface, icon }];
        await db.collection('projects').doc(currentProject.id).update({ rooms });
        closeModalById('modal-add-room');
        e.target.reset();
        selectRoom(rooms.length - 1);
        toast('Pièce ajoutée !');
    } catch (err) {
        console.error('Add room error:', err);
        toast('Erreur lors de l\'ajout');
    }
}

async function deleteRoom(index) {
    const room = currentProject.rooms[index];
    if (!confirm(`Supprimer "${room.name}" et tous ses éléments ?`)) return;

    try {
        const rooms = currentProject.rooms.filter((_, i) => i !== index);
        await db.collection('projects').doc(currentProject.id).update({ rooms });

        const items = await db.collection('projects').doc(currentProject.id).collection('items')
            .where('roomIndex', '==', index).get();
        const batch = db.batch();
        items.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        if (currentRoom >= rooms.length) currentRoom = Math.max(0, rooms.length - 1);
        if (rooms.length === 0) currentRoom = null;
        toast('Pièce supprimée');
    } catch (err) {
        console.error('Delete room error:', err);
        toast('Erreur lors de la suppression');
    }
}

// ─── IMAGE UPLOAD ────────────────────────────────────────────

let pendingItemFile = null;

function initDragDrop() {
    const zone = document.getElementById('item-drop-zone');
    if (!zone) return;

    ['dragenter', 'dragover'].forEach(evt => {
        zone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(evt => {
        zone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('dragover'); });
    });
    zone.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) processItemImage(file);
    });
}

function handleItemImageSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) processItemImage(file);
}

function processItemImage(file) {
    if (file.size > 5 * 1024 * 1024) { toast('Image trop lourde (5 MB max)'); return; }
    pendingItemFile = file;
    const reader = new FileReader();
    reader.onload = e => showItemImagePreview(e.target.result);
    reader.readAsDataURL(file);
}

function showItemImagePreview(src) {
    const preview = document.getElementById('item-image-preview');
    const dropZone = document.getElementById('item-drop-zone');
    preview.classList.add('has-image');
    preview.innerHTML = `<img src="${src}" alt="Preview">`;
    // Remove existing remove button
    const existingBtn = dropZone.querySelector('.image-remove');
    if (existingBtn) existingBtn.remove();
    // Add remove button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'image-remove';
    btn.textContent = '✕';
    btn.onclick = (e) => { e.stopPropagation(); removeItemImage(); };
    dropZone.appendChild(btn);
}

function removeItemImage() {
    pendingItemFile = null;
    document.getElementById('item-image-file-data').value = '';
    resetItemImagePreview();
}

function resetItemImagePreview() {
    pendingItemFile = null;
    const preview = document.getElementById('item-image-preview');
    const dropZone = document.getElementById('item-drop-zone');
    if (preview) {
        preview.classList.remove('has-image');
        preview.innerHTML = `
            <span style="font-size:1.8rem">📷</span>
            <span>Glissez une image ou cliquez</span>
            <span style="font-size:0.72rem; opacity:0.5">JPG, PNG, WebP — 5 MB max</span>
        `;
    }
    if (dropZone) {
        const btn = dropZone.querySelector('.image-remove');
        if (btn) btn.remove();
    }
    const fileInput = document.getElementById('item-file-input');
    if (fileInput) fileInput.value = '';
}

async function uploadItemImage(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const filename = `${currentProject.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const ref = storage.ref().child(`items/${filename}`);
    const snapshot = await ref.put(file);
    return await snapshot.ref.getDownloadURL();
}

document.addEventListener('DOMContentLoaded', initDragDrop);

// ─── ITEMS ───────────────────────────────────────────────────

function showAddItemModal(editItem = null) {
    const modal = document.getElementById('modal-add-item');
    modal.classList.add('active');
    resetItemImagePreview();
    populatePaidByOptions();

    if (editItem) {
        document.getElementById('item-modal-title').textContent = 'Modifier l\'élément';
        document.getElementById('item-submit-btn').textContent = 'Enregistrer';
        document.getElementById('item-edit-id').value = editItem.id;
        document.getElementById('item-input-name').value = editItem.name || '';
        document.getElementById('item-input-category').value = editItem.category || '';
        updateSubcategoryOptions(editItem.subcategory || '');
        document.getElementById('item-input-supplier').value = editItem.supplier || '';
        document.getElementById('item-input-ref').value = editItem.ref || '';
        document.getElementById('item-input-link').value = editItem.link || '';
        document.getElementById('item-input-price').value = editItem.price || '';
        document.getElementById('item-input-qty').value = editItem.qty || 1;
        document.getElementById('item-input-dimensions').value = editItem.dimensions || '';
        document.getElementById('item-input-status').value = editItem.status || 'planned';
        document.getElementById('item-input-paid-by').value = editItem.paidBy || '';
        document.getElementById('item-input-notes').value = editItem.notes || '';
        if (editItem.imageUrl) {
            showItemImagePreview(editItem.imageUrl);
            document.getElementById('item-image-file-data').value = editItem.imageUrl;
        }
    } else {
        document.getElementById('item-modal-title').textContent = 'Ajouter un élément';
        document.getElementById('item-submit-btn').textContent = 'Ajouter';
        document.getElementById('item-edit-id').value = '';
        document.getElementById('modal-add-item').querySelector('form').reset();
        document.getElementById('item-input-qty').value = 1;
        document.getElementById('subcategory-row').style.display = 'none';
        document.getElementById('smart-link-hint').textContent = '';
    }
}

async function saveItem(e) {
    e.preventDefault();
    if (currentRoom === null) { toast('Sélectionnez d\'abord une pièce'); return; }

    const editId = document.getElementById('item-edit-id').value;
    const submitBtn = document.getElementById('item-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = pendingItemFile ? 'Upload en cours…' : 'Enregistrement…';

    let imageUrl = document.getElementById('item-image-file-data').value || '';

    if (pendingItemFile) {
        try {
            imageUrl = await uploadItemImage(pendingItemFile);
        } catch (err) {
            console.error('Upload error:', err);
            toast('Erreur upload image');
            submitBtn.disabled = false;
            submitBtn.textContent = editId ? 'Enregistrer' : 'Ajouter';
            return;
        }
    }

    const data = {
        name: document.getElementById('item-input-name').value.trim(),
        imageUrl,
        category: document.getElementById('item-input-category').value,
        subcategory: document.getElementById('item-input-subcategory').value,
        supplier: document.getElementById('item-input-supplier').value.trim(),
        ref: document.getElementById('item-input-ref').value.trim(),
        link: document.getElementById('item-input-link').value.trim(),
        price: parseFloat(document.getElementById('item-input-price').value) || 0,
        qty: parseInt(document.getElementById('item-input-qty').value) || 1,
        dimensions: document.getElementById('item-input-dimensions').value.trim(),
        status: document.getElementById('item-input-status').value || 'planned',
        paidBy: document.getElementById('item-input-paid-by').value || '',
        notes: document.getElementById('item-input-notes').value.trim(),
        roomIndex: currentRoom,
        roomName: currentProject.rooms[currentRoom].name,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const itemsRef = db.collection('projects').doc(currentProject.id).collection('items');

    if (editId) {
        await itemsRef.doc(editId).update(data);
        toast('Élément mis à jour');
    } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await itemsRef.add(data);
        toast('Élément ajouté !');
    }

    closeModalById('modal-add-item');
    submitBtn.disabled = false;
    submitBtn.textContent = editId ? 'Enregistrer' : 'Ajouter';
    pendingItemFile = null;
}

function renderItems() {
    const grid = document.getElementById('items-grid');
    const empty = document.getElementById('room-empty');

    // If dimensions view is active, don't render regular items
    if (dimensionsViewActive) return;

    if (currentRoom === null) {
        grid.style.display = 'none';
        empty.style.display = 'flex';
        document.getElementById('inspiration-view').style.display = 'none';
        document.getElementById('dimensions-view').style.display = 'none';
        document.getElementById('category-tabs')?.remove();
        return;
    }

    const items = allItems.filter(i => i.roomIndex === currentRoom);
    const roomBudget = items.reduce((sum, i) => sum + (i.price || 0) * (i.qty || 1), 0);
    const voteSummary = getVoteSummary(items);
    document.getElementById('room-meta').innerHTML =
        `${currentProject?.rooms?.[currentRoom]?.surface ? currentProject.rooms[currentRoom].surface + ' m² • ' : ''}${items.length} élément${items.length !== 1 ? 's' : ''} • ${formatPrice(roomBudget)}${voteSummary ? `<span class="vote-summary"> · ${voteSummary}</span>` : ''}`;

    // Category tabs
    const categories = ['all', ...new Set(items.map(i => i.category).filter(Boolean))];
    if (!categories.includes('Inspiration')) categories.push('Inspiration');
    renderCategoryTabs(categories, items);

    // Filter
    const filtered = currentCategoryFilter === 'all' ? items : items.filter(i => i.category === currentCategoryFilter);

    if (filtered.length === 0 && items.length === 0) {
        // Special case: Inspiration tab should always show split view (for post-its)
        if (currentCategoryFilter === 'Inspiration') {
            grid.style.display = 'none';
            empty.style.display = 'none';
            document.getElementById('inspiration-view').style.display = 'grid';
            renderInspirationSplitView([]);
            return;
        }
        grid.style.display = 'none';
        empty.style.display = 'flex';
        document.getElementById('inspiration-view').style.display = 'none';
        return;
    }

    if (filtered.length === 0) {
        // Special case: Inspiration tab shows split view even with 0 items (for post-its)
        if (currentCategoryFilter === 'Inspiration') {
            grid.style.display = 'none';
            empty.style.display = 'none';
            document.getElementById('inspiration-view').style.display = 'grid';
            renderInspirationSplitView([]);
            return;
        }
        grid.style.display = 'none';
        empty.style.display = 'flex';
        empty.querySelector('h3').textContent = 'Aucun élément dans cette catégorie';
        empty.querySelector('p').textContent = 'Changez de filtre ou ajoutez un élément';
        return;
    }

    empty.style.display = 'none';
    grid.style.display = 'grid';
    document.getElementById('inspiration-view').style.display = 'none';

    // INSPIRATION SPLIT VIEW
    if (currentCategoryFilter === 'Inspiration') {
        grid.style.display = 'none';
        document.getElementById('inspiration-view').style.display = 'grid';
        renderInspirationSplitView(filtered);
        return;
    }

    grid.innerHTML = filtered.map(item => {
        const itemJson = JSON.stringify(item).replace(/\\/g, '\\\\').replace(/'/g, "&#39;").replace(/"/g, '&quot;');
        const isInspo = item.category === 'Inspiration';
        return `
        <div class="item-card ${isInspo ? 'item-card-inspo' : ''}" draggable="true"
             ondragstart="handleItemDragStart(event, '${item.id}')"
             ondragend="handleItemDragEnd(event)"
             onclick='openLightbox(JSON.parse(this.dataset.item))' data-item="${itemJson}" style="cursor:pointer">
            <div class="item-card-img" style="background: ${item.imageUrl ? `url(${escHtml(item.imageUrl)}) center/cover` : '#F5F0EB'}">
                ${!item.imageUrl ? `<span style="font-size:2rem">${getCategoryEmoji(item.category)}</span>` : ''}
                ${item.status && item.status !== 'planned' ? `<span class="item-badge item-status-${item.status}">${getStatusLabel(item.status)}</span>` : ''}
                ${item.link ? `<a href="${escHtml(getItemAffiliateUrl(item) || item.link)}" target="_blank" rel="noopener" class="item-source-badge" onclick="trackAffClick('${escHtml(item.supplier || '')}', '${escHtml(item.category || '')}');event.stopPropagation()" style="background:${getLinkSource(item.link).color}">${getLinkSource(item.link).icon}${getLinkSource(item.link).label}</a>` : ''}
                ${isInspo ? '<span class="item-badge-inspo">✨</span>' : ''}
            </div>
            <div class="item-card-body">
                <div class="item-card-top">
                    <h4>${escHtml(item.name)}</h4>
                    <div class="item-card-actions">
                        <button class="btn-icon-xs" onclick='event.stopPropagation(); showAddItemModal(JSON.parse(this.parentElement.parentElement.parentElement.parentElement.dataset.item))' title="Modifier">✏️</button>
                        <button class="btn-icon-xs" onclick="event.stopPropagation(); deleteItem('${item.id}')" title="Supprimer">🗑️</button>
                    </div>
                </div>
                ${!isInspo ? `<div class="item-card-price">${formatPrice((item.price || 0) * (item.qty || 1))}${item.qty > 1 ? ` <small>(${item.qty} × ${formatPrice(item.price)})</small>` : ''}</div>` : ''}
                ${item.supplier ? `<div class="item-card-supplier">${escHtml(item.supplier)}${item.subcategory ? ' · ' + escHtml(item.subcategory) : ''}</div>` : (item.subcategory ? `<div class="item-card-supplier">${escHtml(item.subcategory)}</div>` : '')}
                ${item.link ? `<a href="${escHtml(getItemAffiliateUrl(item) || item.link)}" target="_blank" rel="noopener" class="item-card-link" onclick="trackAffClick('${escHtml(item.supplier || '')}', '${escHtml(item.category || '')}');event.stopPropagation()">🔗 Voir le produit</a>` : ''}
                ${item.notes ? `<div class="item-card-notes">${escHtml(item.notes)}</div>` : ''}
                <div class="item-votes">
                    ${renderVoteButtons(item)}
                </div>
            </div>
        </div>
    `}).join('');

    // Handle view mode
    if (currentViewMode === 'moodboard') {
        grid.style.display = 'none';
        document.getElementById('inspiration-view').style.display = 'none';
        document.getElementById('moodboard-view').style.display = 'block';
        if (document.getElementById('category-tabs')) document.getElementById('category-tabs').style.display = 'none';
        renderMoodboardView();
    } else {
        document.getElementById('moodboard-view').style.display = 'none';
    }
}

function renderCategoryTabs(categories, items) {
    let tabsEl = document.getElementById('category-tabs');
    if (!tabsEl) {
        tabsEl = document.createElement('div');
        tabsEl.id = 'category-tabs';
        tabsEl.className = 'category-tabs';
        const roomHeader = document.querySelector('.room-header');
        roomHeader.parentNode.insertBefore(tabsEl, roomHeader.nextSibling);
    }

    tabsEl.innerHTML = categories.map(cat => {
        const count = cat === 'all' ? items.length : items.filter(i => i.category === cat).length;
        const label = cat === 'all' ? 'Tous' : cat;
        const emoji = cat === 'all' ? '' : getCategoryEmoji(cat) + ' ';
        return `<button class="category-tab ${currentCategoryFilter === cat ? 'active' : ''}" data-cat="${cat}" onclick="setCategoryFilter('${escHtml(cat)}')">${emoji}${label} <span class="cat-count">${count}</span></button>`;
    }).join('');
}

async function deleteItem(itemId) {
    if (!confirm('Supprimer cet élément ?')) return;
    await db.collection('projects').doc(currentProject.id).collection('items').doc(itemId).delete();
    toast('Élément supprimé');
}

// ─── ITEM DETAIL VIEW ───────────────────────────────────────

let currentDetailItem = null;

function openLightbox(item) {
    currentDetailItem = item;
    const lightbox = document.getElementById('item-lightbox');
    const image = document.getElementById('lightbox-image');
    const info = document.getElementById('lightbox-info');

    // Image — natural size, no crop
    if (item.imageUrl) {
        image.src = item.imageUrl;
        image.style.display = 'block';
    } else {
        image.src = '';
        image.style.display = 'none';
    }

    // Build info panel (exactly like fancy-ganache)
    const total = (item.price || 0) * (item.qty || 1);
    const linkBadge = getLinkBadgeHTML(item.link);
    const commentsCount = item.commentsCount || 0;

    let html = `<h2>${escHtml(item.name)}</h2>`;
    
    if (item.supplier) html += `<div class="info-row"><span class="label">Fournisseur</span><span class="value">${escHtml(item.supplier)}</span></div>`;
    if (item.ref) html += `<div class="info-row"><span class="label">Référence</span><span class="value">${escHtml(item.ref)}</span></div>`;
    if (item.dimensions) html += `<div class="info-row"><span class="label">Dimensions</span><span class="value">${escHtml(item.dimensions)}</span></div>`;
    if (item.category) html += `<div class="info-row"><span class="label">Catégorie</span><span class="value">${escHtml(item.category)}${item.subcategory ? ' → ' + escHtml(item.subcategory) : ''}</span></div>`;
    if (item.status) html += `<div class="info-row"><span class="label">Statut</span><span class="value" style="color:${getStatusColor(item.status)};font-weight:600">${getStatusLabel(item.status)}</span></div>`;
    if (item.paidBy) html += `<div class="info-row"><span class="label">Payé par</span><span class="value">${item.paidBy === 'commun' ? '👥 Commun' : escHtml(item.paidBy)}</span></div>`;
    
    if (linkBadge) html += `<div class="info-row"><span class="label">Lien</span>${linkBadge}</div>`;
    
    if (item.price) html += `<div class="info-row"><span class="label">Prix unitaire</span><span class="value">${formatPrice(item.price)}</span></div>`;
    html += `<div class="info-row"><span class="label">Quantité</span><span class="value">${item.qty || 1}</span></div>`;

    html += `
        <div class="total-price">
            <div class="amount">${formatPrice(total)}</div>
            <div class="label">Coût total</div>
        </div>
    `;

    if (item.notes) html += `<div class="notes-section"><strong>Notes :</strong><br>${escHtml(item.notes)}</div>`;

    // Votes
    html += `<div class="lightbox-votes"><div class="item-votes">${renderVoteButtons(item)}</div></div>`;

    // Action buttons
    html += `
        <div class="lightbox-actions">
            <button class="btn-lightbox btn-lightbox-edit" onclick="editFromLightbox()">✏️ Modifier</button>
            <button class="btn-lightbox btn-lightbox-comment" onclick="closeLightboxForce(); showComments()">💬 Commentaires</button>
        </div>
    `;

    info.innerHTML = html;
    lightbox.classList.add('active');
}

function getLinkBadgeHTML(link) {
    if (!link) return '';
    try {
        const isPinterest = link.includes('pinterest.com') || link.includes('pin.it');
        if (isPinterest) {
            return `<a href="${escHtml(link)}" target="_blank" class="link-badge pinterest" onclick="event.stopPropagation()">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
                Pinterest
            </a>`;
        } else {
            const domain = new URL(link).hostname.replace('www.', '');
            return `<a href="${escHtml(link)}" target="_blank" class="link-badge generic" onclick="event.stopPropagation()">🔗 ${domain}</a>`;
        }
    } catch (e) {
        return `<a href="${escHtml(link)}" target="_blank" class="link-badge generic" onclick="event.stopPropagation()">🔗 Lien</a>`;
    }
}

function closeLightbox(e) {
    if (e && e.target.id === 'item-lightbox') {
        document.getElementById('item-lightbox').classList.remove('active');
    }
}

function closeLightboxForce() {
    document.getElementById('item-lightbox').classList.remove('active');
}

// Escape key closes lightbox
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightboxForce();
    // Enter key triggers inspiration search
    if (e.key === 'Enter' && e.target.id === 'inspo-query') {
        e.preventDefault();
        searchInspirations();
    }
});

function editFromLightbox() {
    closeLightboxForce();
    if (currentDetailItem) {
        showAddItemModal(currentDetailItem);
    }
}

function editFromDetail() {
    closeLightboxForce();
    if (currentDetailItem) showAddItemModal(currentDetailItem);
}

function getLinkSource(url) {
    const u = url.toLowerCase();
    const pin = '<svg viewBox="0 0 24 24" width="14" height="14" fill="white" style="margin-right:2px"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.15 9.42 7.6 11.18-.1-.94-.2-2.38.04-3.4.22-.92 1.4-5.9 1.4-5.9s-.36-.72-.36-1.78c0-1.66.97-2.9 2.17-2.9 1.02 0 1.52.77 1.52 1.7 0 1.03-.66 2.58-1 4.01-.28 1.2.6 2.18 1.78 2.18 2.13 0 3.77-2.25 3.77-5.5 0-2.87-2.06-4.88-5.01-4.88-3.41 0-5.42 2.56-5.42 5.2 0 1.03.4 2.13.89 2.73.1.12.11.22.08.34l-.33 1.36c-.05.22-.18.27-.4.16-1.5-.7-2.43-2.9-2.43-4.66 0-3.81 2.77-7.3 7.98-7.3 4.19 0 7.44 2.99 7.44 6.98 0 4.16-2.63 7.52-6.28 7.52-1.22 0-2.38-.64-2.77-1.39l-.75 2.88c-.27 1.05-1.01 2.36-1.5 3.16C9.57 23.81 10.76 24 12 24c6.63 0 12-5.37 12-12S18.63 0 12 0z"/></svg>';
    
    if (u.includes('pinterest')) return { label: 'Pinterest', color: '#E60023', icon: pin };
    if (u.includes('ikea')) return { label: 'IKEA', color: '#0058A3', icon: '' };
    if (u.includes('maisonsdumonde') || u.includes('maisons-du-monde')) return { label: 'Maisons du Monde', color: '#1A1A1A', icon: '' };
    if (u.includes('laredoute')) return { label: 'La Redoute', color: '#D32F2F', icon: '' };
    if (u.includes('ampm') || u.includes('am.pm')) return { label: 'AM.PM', color: '#2C2C2C', icon: '' };
    if (u.includes('habitat')) return { label: 'Habitat', color: '#E53935', icon: '' };
    if (u.includes('made.com')) return { label: 'Made.com', color: '#1B1464', icon: '' };
    if (u.includes('conforama')) return { label: 'Conforama', color: '#E30613', icon: '' };
    if (u.includes('leroy')) return { label: 'Leroy Merlin', color: '#78BE20', icon: '' };
    if (u.includes('castorama')) return { label: 'Castorama', color: '#0066CC', icon: '' };
    if (u.includes('amazon')) return { label: 'Amazon', color: '#FF9900', icon: '' };
    if (u.includes('alinea')) return { label: 'Alinéa', color: '#5C6BC0', icon: '' };
    if (u.includes('but.fr')) return { label: 'BUT', color: '#003DA5', icon: '' };
    if (u.includes('zara') && u.includes('home')) return { label: 'Zara Home', color: '#1A1A1A', icon: '' };
    if (u.includes('hm.com') || u.includes('h&m')) return { label: 'H&M Home', color: '#E50010', icon: '' };
    try { const host = new URL(url).hostname.replace('www.', ''); return { label: host, color: '#666', icon: '' }; } catch(e) {}
    return { label: 'Lien', color: '#666', icon: '' };
}

// ─── VOTES ──────────────────────────────────────────────────

function getVoterId() {
    // Use auth uid if logged in, otherwise generate/persist anonymous id
    if (currentUser?.uid) return currentUser.uid;
    let anonId = localStorage.getItem('cocon_anon_id');
    if (!anonId) {
        anonId = 'anon_' + Math.random().toString(36).slice(2, 11);
        localStorage.setItem('cocon_anon_id', anonId);
    }
    return anonId;
}

function getVoterName() {
    if (currentUser?.displayName) return currentUser.displayName;
    if (currentUser?.email) return currentUser.email.split('@')[0];
    return 'Invité';
}

function renderVoteButtons(item) {
    const votes = item.votes || {};
    const voterId = getVoterId();
    const myVote = votes[voterId]?.vote || null;

    let upVoters = [];
    let downVoters = [];
    Object.entries(votes).forEach(([id, v]) => {
        if (v.vote === 'up') upVoters.push(v.name || 'Invité');
        if (v.vote === 'down') downVoters.push(v.name || 'Invité');
    });

    const upCount = upVoters.length;
    const downCount = downVoters.length;
    const upActive = myVote === 'up' ? 'vote-active' : '';
    const downActive = myVote === 'down' ? 'vote-active' : '';
    const upTitle = upVoters.length ? upVoters.join(', ') : 'Valider';
    const downTitle = downVoters.length ? downVoters.join(', ') : 'Rejeter';

    return `
        <button class="vote-btn vote-up ${upActive}" onclick="event.stopPropagation(); toggleVote('${item.id}', 'up')" title="${escHtml(upTitle)}">
            👍${upCount > 0 ? ` <span class="vote-count">${upCount}</span>` : ''}
        </button>
        <button class="vote-btn vote-down ${downActive}" onclick="event.stopPropagation(); toggleVote('${item.id}', 'down')" title="${escHtml(downTitle)}">
            👎${downCount > 0 ? ` <span class="vote-count">${downCount}</span>` : ''}
        </button>
    `;
}

async function toggleVote(itemId, direction) {
    if (!currentProject) return;
    const voterId = getVoterId();
    const voterName = getVoterName();
    const itemRef = db.collection('projects').doc(currentProject.id).collection('items').doc(itemId);
    
    const doc = await itemRef.get();
    if (!doc.exists) return;
    
    const votes = doc.data().votes || {};
    const currentVote = votes[voterId]?.vote || null;

    if (currentVote === direction) {
        // Remove vote (toggle off)
        delete votes[voterId];
    } else {
        // Set or change vote
        votes[voterId] = { vote: direction, name: voterName };
    }

    await itemRef.update({ votes });
}

function getVoteSummary(items) {
    let validated = 0, debated = 0, rejected = 0, noVotes = 0;
    items.forEach(item => {
        const votes = item.votes || {};
        let ups = 0, downs = 0;
        Object.values(votes).forEach(v => {
            if (v.vote === 'up') ups++;
            if (v.vote === 'down') downs++;
        });
        if (ups === 0 && downs === 0) noVotes++;
        else if (downs === 0) validated++;
        else if (ups === 0) rejected++;
        else debated++;
    });
    const parts = [];
    if (validated) parts.push(`✅ ${validated}`);
    if (debated) parts.push(`⚠️ ${debated}`);
    if (rejected) parts.push(`❌ ${rejected}`);
    return parts.join(' · ');
}

// ─── INSPIRATION AI ─────────────────────────────────────────

function showInspirationModal() {
    if (!currentProject || currentRoom === null) { toast('Sélectionnez une pièce'); return; }
    document.getElementById('modal-inspiration').classList.add('active');
    
    // Generate context tags
    const room = currentProject.rooms[currentRoom];
    const style = currentProject.style || '';
    const tags = [];
    if (style) tags.push(style);
    tags.push(room.name);
    const existingCats = [...new Set(allItems.filter(i => i.roomIndex === currentRoom).map(i => i.category).filter(Boolean))];
    existingCats.forEach(c => tags.push(c.toLowerCase()));
    
    // Context-aware suggestion tags based on room
    const roomName = room.name.toLowerCase();
    let suggestionTags = [];
    
    if (roomName.includes('salon') || roomName.includes('séjour') || roomName.includes('living')) {
        suggestionTags = [`Canapé ${style}`.trim(), 'Table basse', 'Tapis', 'Suspension', 'Lampadaire', 'Coussin', 'Miroir', 'Plante verte', 'Étagère'];
    } else if (roomName.includes('chambre') || roomName.includes('bedroom')) {
        suggestionTags = [`Lit ${style}`.trim(), 'Lampe de chevet', 'Linge de lit lin', 'Tapis chambre', 'Rideau', 'Miroir', 'Plaid', 'Commode'];
    } else if (roomName.includes('cuisine') || roomName.includes('kitchen')) {
        suggestionTags = ['Robinetterie', 'Carrelage mural', 'Poignée meuble', 'Suspension cuisine', 'Tabouret bar', 'Étagère ouverte', 'Zellige'];
    } else if (roomName.includes('sdb') || roomName.includes('salle de bain') || roomName.includes('bathroom')) {
        suggestionTags = ['Meuble vasque', 'Miroir LED', 'Carrelage', 'Zellige', 'Robinetterie', 'Panier rangement', 'Porte-serviette'];
    } else if (roomName.includes('bureau') || roomName.includes('office')) {
        suggestionTags = ['Bureau bois', 'Chaise ergonomique', 'Lampe bureau', 'Étagère murale', 'Rangement', 'Plante', 'Cadre mural'];
    } else if (roomName.includes('entrée') || roomName.includes('couloir')) {
        suggestionTags = ['Miroir entrée', 'Patère', 'Banc', 'Console', 'Tapis entrée', 'Suspension', 'Rangement chaussures'];
    } else {
        suggestionTags = [`${room.name} ${style}`.trim(), 'Mobilier design', 'Luminaire', 'Décoration murale', 'Textile cosy', 'Rangement', 'Plantes', 'Peinture couleur'];
    }
    
    const tagsEl = document.getElementById('inspo-tags');
    tagsEl.innerHTML = suggestionTags.map(t => 
        `<button class="inspo-tag" onclick="document.getElementById('inspo-query').value='${escHtml(t)}'; searchInspirations()">${t}</button>`
    ).join('');
}

async function searchInspirations() {
    const query = document.getElementById('inspo-query').value.trim();
    if (!query) { toast('Tapez une recherche'); return; }
    
    const resultsEl = document.getElementById('inspo-results');
    const btn = document.getElementById('inspo-search-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="inspo-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle"></div>';
    
    resultsEl.innerHTML = `<div class="inspo-loading"><div class="inspo-spinner"></div><p style="margin-top:0.8rem; font-size:0.85rem; opacity:0.5">Recherche en cours…</p></div>`;
    
    // Small delay for perceived effort
    await new Promise(r => setTimeout(r, 400));
    
    const room = currentProject.rooms[currentRoom];
    const style = currentProject.style || 'moderne';
    const suggestions = generateLocalInspirations(query, room.name, style);
    renderInspirationResults(suggestions);
    
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Chercher`;
}

function generateLocalInspirations(query, room, style) {
    const q = query.toLowerCase();
    const s = (style || '').toLowerCase();
    
    // Rich product database with real shop links
    const products = [
        // Mobilier
        { name: 'Canapé 3 places en velours', description: 'Lignes épurées, pieds bois massif', price: 899, price_display: '899 €', source: 'made.com', link: 'https://www.made.com/fr/canapes', category: 'Mobilier', subcategory: 'Canapé', tags: 'canapé sofa salon séjour velours mid-century scandinave', emoji: '🛋️' },
        { name: 'Fauteuil lounge rétro', description: 'Assise large, tissu bouclette écru', price: 449, price_display: '449 €', source: 'laredoute.fr', link: 'https://www.laredoute.fr/lndnr/cat-fauteuil.aspx', category: 'Mobilier', subcategory: 'Fauteuil', tags: 'fauteuil salon séjour bouclette mid-century vintage', emoji: '🪑' },
        { name: 'Table basse ovale en chêne', description: 'Plateau ovale, design organique', price: 349, price_display: '349 €', source: 'maisonsdumonde.com', link: 'https://www.maisonsdumonde.com/FR/fr/c/tables-basses-2ed1', category: 'Mobilier', subcategory: 'Table', tags: 'table basse salon séjour chêne bois scandinave', emoji: '🪵' },
        { name: 'Buffet vintage en noyer', description: 'Style années 60, portes coulissantes', price: 699, price_display: '699 €', source: 'habitat.fr', link: 'https://www.habitat.fr/c/buffets-et-vaisseliers/', category: 'Mobilier', subcategory: 'Rangement', tags: 'buffet rangement salon séjour noyer vintage mid-century', emoji: '🗄️' },
        { name: 'Lit plateforme en chêne massif', description: 'Tête de lit intégrée, lignes japonaises', price: 1299, price_display: '1 299 €', source: 'made.com', link: 'https://www.made.com/fr/lits', category: 'Mobilier', subcategory: 'Lit', tags: 'lit chambre chêne bois japandi scandinave', emoji: '🛏️' },
        { name: 'Table à manger extensible', description: 'Chêne clair, 6-8 personnes', price: 799, price_display: '799 €', source: 'ikea.com', link: 'https://www.ikea.com/fr/fr/cat/tables-a-manger-21825/', category: 'Mobilier', subcategory: 'Table', tags: 'table manger salle cuisine chêne repas scandinave', emoji: '🍽️' },
        { name: 'Étagère murale modulaire', description: 'Métal noir et chêne, personnalisable', price: 189, price_display: '189 €', source: 'ikea.com', link: 'https://www.ikea.com/fr/fr/cat/etageres-murales-10382/', category: 'Mobilier', subcategory: 'Rangement', tags: 'étagère rangement mural bureau salon industriel', emoji: '📦' },
        { name: 'Chaises scandinaves lot de 2', description: 'Assise moulée, pieds hêtre naturel', price: 149, price_display: '149 €', source: 'laredoute.fr', link: 'https://www.laredoute.fr/lndnr/cat-chaises.aspx', category: 'Mobilier', subcategory: 'Chaise', tags: 'chaise cuisine salle manger scandinave bois', emoji: '🪑' },
        
        // Luminaires
        { name: 'Suspension laiton et verre fumé', description: 'Globe en verre, finition dorée', price: 129, price_display: '129 €', source: 'laredoute.fr', link: 'https://www.laredoute.fr/lndnr/cat-suspensions.aspx', category: 'Luminaire', subcategory: 'Suspension', tags: 'suspension luminaire laiton salon séjour mid-century', emoji: '💡' },
        { name: 'Lampe à poser en céramique', description: 'Base texturée, abat-jour lin naturel', price: 89, price_display: '89 €', source: 'zarahome.com', link: 'https://www.zarahome.com/fr/salon/éclairage-c1020443498.html', category: 'Luminaire', subcategory: 'Lampe', tags: 'lampe poser chambre salon céramique wabi-sabi', emoji: '🏮' },
        { name: 'Lampadaire arc design', description: 'Pied marbre, arc métal brossé', price: 249, price_display: '249 €', source: 'maisonsdumonde.com', link: 'https://www.maisonsdumonde.com/FR/fr/c/lampadaires-2ed5', category: 'Luminaire', subcategory: 'Lampadaire', tags: 'lampadaire salon séjour arc marbre design', emoji: '🪔' },
        { name: 'Applique murale articulée', description: 'Style atelier, bras orientable', price: 69, price_display: '69 €', source: 'leroymerlin.fr', link: 'https://www.leroymerlin.fr/produits/electricite-domotique/eclairage-interieur/applique-murale/', category: 'Luminaire', subcategory: 'Applique', tags: 'applique mural chambre bureau lecture industriel', emoji: '💡' },
        
        // Décoration
        { name: 'Miroir rond en rotin', description: 'Cadre tressé, Ø 60 cm', price: 79, price_display: '79 €', source: 'maisonsdumonde.com', link: 'https://www.maisonsdumonde.com/FR/fr/c/miroirs-2edu', category: 'Décoration', subcategory: 'Miroir', tags: 'miroir décoration salon chambre sdb rotin bohème', emoji: '🪞' },
        { name: 'Vases en grès lot de 3', description: 'Finition mate, tons terre', price: 45, price_display: '45 €', source: 'hm.com', link: 'https://www2.hm.com/fr_fr/maison/shop-by-product/decoration.html', category: 'Décoration', subcategory: 'Vase', tags: 'vase décoration salon grès céramique wabi-sabi japandi', emoji: '🏺' },
        { name: 'Cadres gallery wall kit', description: 'Set de 6 cadres en chêne, formats variés', price: 59, price_display: '59 €', source: 'ikea.com', link: 'https://www.ikea.com/fr/fr/cat/cadres-photo-10760/', category: 'Décoration', subcategory: 'Cadre', tags: 'cadre décoration mural gallery wall salon chambre', emoji: '🖼️' },
        { name: 'Horloge murale minimaliste', description: 'Métal noir, Ø 40 cm, sans chiffres', price: 39, price_display: '39 €', source: 'amazon.fr', link: 'https://www.amazon.fr/s?k=horloge+murale+design', category: 'Décoration', subcategory: 'Horloge', tags: 'horloge décoration mural salon minimaliste', emoji: '🕐' },
        
        // Textile
        { name: 'Tapis berbère en laine', description: 'Motifs géométriques, 160×230 cm', price: 349, price_display: '349 €', source: 'laredoute.fr', link: 'https://www.laredoute.fr/lndnr/cat-tapis.aspx', category: 'Textile', subcategory: 'Tapis', tags: 'tapis salon séjour chambre berbère laine bohème', emoji: '🧶' },
        { name: 'Parure de lit en lin lavé', description: 'Lin français, coloris naturel', price: 129, price_display: '129 €', source: 'ampm.fr', link: 'https://www.laredoute.fr/lndnr/marque-ampm.aspx', category: 'Textile', subcategory: 'Linge de lit', tags: 'lit chambre lin linge parure scandinave naturel', emoji: '🛏️' },
        { name: 'Coussins velours lot de 2', description: 'Velours côtelé, 45×45 cm', price: 35, price_display: '35 €', source: 'zarahome.com', link: 'https://www.zarahome.com/fr/salon/coussins-c1020443492.html', category: 'Textile', subcategory: 'Coussin', tags: 'coussin textile salon canapé velours décoration', emoji: '💎' },
        { name: 'Plaid en maille tricot', description: 'Coton recyclé, frange naturelle', price: 59, price_display: '59 €', source: 'hm.com', link: 'https://www2.hm.com/fr_fr/maison/shop-by-product/coussins-et-plaids.html', category: 'Textile', subcategory: 'Plaid', tags: 'plaid couverture canapé salon chambre cosy coton', emoji: '🧣' },
        { name: 'Rideaux en lin', description: 'Lin lavé, passants cachés, 140×260', price: 69, price_display: '69 € /paire', source: 'ikea.com', link: 'https://www.ikea.com/fr/fr/cat/rideaux-10700/', category: 'Textile', subcategory: 'Rideau', tags: 'rideau fenêtre lin chambre salon scandinave', emoji: '🪟' },
        
        // Sols / Carrelage
        { name: 'Carrelage imitation terrazzo', description: 'Grès cérame, 60×60, style contemporain', price: 42, price_display: '42 €/m²', source: 'leroymerlin.fr', link: 'https://www.leroymerlin.fr/produits/carrelage-parquet-sol-souple/carrelage-sol/', category: 'Sols/Carrelage', subcategory: 'Carrelage', tags: 'carrelage sol cuisine sdb terrazzo contemporain', emoji: '🔲' },
        { name: 'Parquet chêne massif', description: 'Chêne européen, lames larges, huilé mat', price: 65, price_display: '65 €/m²', source: 'castorama.fr', link: 'https://www.castorama.fr/c/parquet/NLmV2OIlaFc/', category: 'Sols/Carrelage', subcategory: 'Parquet', tags: 'parquet sol chêne bois chambre salon scandinave', emoji: '🪵' },
        { name: 'Zellige blanc artisanal', description: 'Carrelage marocain 10×10 cm, fait main', price: 89, price_display: '89 €/m²', source: 'leroymerlin.fr', link: 'https://www.leroymerlin.fr/produits/carrelage-parquet-sol-souple/carrelage-mural/', category: 'Sols/Carrelage', subcategory: 'Zellige', tags: 'zellige carrelage mural cuisine sdb marocain artisanal', emoji: '◻️' },
        
        // Peinture
        { name: 'Peinture blanc cassé mat', description: 'Finition veloutée, pièces de vie', price: 45, price_display: '45 €/2.5L', source: 'tollens.com', link: 'https://www.tollens.com/couleurs/peinture-blanc-casse', category: 'Peinture', subcategory: 'Mur', tags: 'peinture blanc mur salon chambre', emoji: '🎨' },
        { name: 'Peinture terracotta', description: 'Teinte argile chaude, finition mate', price: 49, price_display: '49 €/2.5L', source: 'leroymerlin.fr', link: 'https://www.leroymerlin.fr/produits/peinture-droguerie/peinture-couleur-interieure/', category: 'Peinture', subcategory: 'Mur', tags: 'peinture terracotta couleur mur salon chambre chaleureux', emoji: '🎨' },
        { name: 'Peinture vert sauge', description: 'Vert grisé doux, mat profond', price: 52, price_display: '52 €/2.5L', source: 'farrowandball.com', link: 'https://www.farrow-ball.com/fr/couleurs-de-peinture', category: 'Peinture', subcategory: 'Mur', tags: 'peinture vert sauge couleur mur chambre salon nature', emoji: '🎨' },
        
        // Plantes
        { name: 'Monstera Deliciosa', description: 'Plante tropicale XXL, pot en terre cuite', price: 45, price_display: '45 €', source: 'bergamotte.com', link: 'https://www.bergamotte.com/plantes', category: 'Décoration', subcategory: 'Plante', tags: 'plante monstera tropical salon décoration vert', emoji: '🌿' },
        { name: 'Olivier en pot', description: 'Arbre méditerranéen, cache-pot osier', price: 69, price_display: '69 €', source: 'bergamotte.com', link: 'https://www.bergamotte.com/plantes', category: 'Décoration', subcategory: 'Plante', tags: 'plante olivier arbre salon terrasse méditerranéen', emoji: '🫒' },
        
        // Cuisine
        { name: 'Robinet cuisine laiton brossé', description: 'Mitigeur col de cygne, douchette', price: 189, price_display: '189 €', source: 'castorama.fr', link: 'https://www.castorama.fr/c/robinet-de-cuisine/NLmV2OIlaFd/', category: 'Équipement', subcategory: 'Robinetterie', tags: 'robinet cuisine laiton équipement', emoji: '🚰' },
        { name: 'Poignées de cuisine en cuir', description: 'Lot de 6, cuir tanné et laiton', price: 42, price_display: '42 €/lot', source: 'etsy.com', link: 'https://www.etsy.com/fr/search?q=poignée+cuisine+cuir', category: 'Équipement', subcategory: 'Quincaillerie', tags: 'poignée cuisine meuble cuir laiton scandinave', emoji: '🔘' },
        
        // SDB
        { name: 'Meuble vasque en teck', description: 'Salle de bain, 80 cm, vasque intégrée', price: 599, price_display: '599 €', source: 'leroymerlin.fr', link: 'https://www.leroymerlin.fr/produits/salle-de-bains/meuble-de-salle-de-bains/', category: 'Mobilier', subcategory: 'Meuble vasque', tags: 'meuble vasque sdb salle de bain teck bois', emoji: '🚿' },
        { name: 'Miroir salle de bain LED', description: 'Anti-buée, 80×60 cm, lumière chaude', price: 149, price_display: '149 €', source: 'castorama.fr', link: 'https://www.castorama.fr/c/miroir-de-salle-de-bains/NLmV2OI/', category: 'Équipement', subcategory: 'Miroir', tags: 'miroir sdb salle de bain led lumineux', emoji: '🪞' },
    ];
    
    // Score-based matching
    const queryWords = q.split(/[\s,]+/).filter(w => w.length > 2);
    const scored = products.map(p => {
        const searchable = `${p.name} ${p.description} ${p.category} ${p.subcategory || ''} ${p.tags}`.toLowerCase();
        let score = 0;
        queryWords.forEach(word => {
            if (searchable.includes(word)) score += 3;
        });
        // Style bonus
        if (s && p.tags.includes(s)) score += 2;
        // Room bonus
        const roomLower = room.toLowerCase();
        if (p.tags.includes(roomLower) || p.tags.includes(roomLower.replace(/\s+/g, ''))) score += 2;
        return { ...p, score };
    });
    
    // Sort by score, filter minimum relevance, take top 6
    scored.sort((a, b) => b.score - a.score);
    const results = scored.filter(p => p.score >= 2).slice(0, 6);
    
    // If not enough results, pad with best generic matches
    if (results.length < 4) {
        const remaining = scored.filter(p => !results.includes(p)).slice(0, 6 - results.length);
        results.push(...remaining);
    }
    
    return results.slice(0, 6);
}

function renderInspirationResults(suggestions) {
    const resultsEl = document.getElementById('inspo-results');
    
    if (suggestions.length === 0) {
        resultsEl.innerHTML = `<div class="inspo-empty"><span style="font-size:2rem">🤷</span><p>Aucune suggestion trouvée. Essayez un autre terme.</p></div>`;
        return;
    }
    
    resultsEl.innerHTML = `<div class="inspo-grid">${suggestions.map((s, i) => {
        const hasImage = s.image_url && s.image_url.startsWith('http');
        const hasLink = s.link && s.link.startsWith('http');
        const priceDisplay = s.price_display || s.price_estimate || (s.price ? s.price + ' €' : '');
        const sourceDomain = s.source || '';
        
        return `
        <div class="inspo-card ${hasImage ? 'inspo-card-visual' : ''}">
            <div class="inspo-card-img" ${hasImage ? `style="padding:0; background:var(--cream)"` : ''}>
                ${hasImage 
                    ? `<img src="${escHtml(s.image_url)}" alt="${escHtml(s.name)}" class="inspo-card-photo" onerror="this.parentElement.innerHTML='<span>${s.emoji || getCategoryEmoji(s.category || 'Inspiration')}</span>'">`
                    : `<span>${s.emoji || getCategoryEmoji(s.category || 'Inspiration')}</span>`
                }
            </div>
            <div class="inspo-card-body">
                <h4>${hasLink ? `<a href="${escHtml(s.link)}" target="_blank" rel="noopener" class="inspo-link">${escHtml(s.name)}</a>` : escHtml(s.name)}</h4>
                <p>${escHtml(s.description || '')}</p>
                <div class="inspo-card-meta">
                    ${priceDisplay ? `<span class="inspo-price">${escHtml(priceDisplay)}</span>` : ''}
                    ${sourceDomain ? `<span class="inspo-source">${escHtml(sourceDomain)}</span>` : ''}
                </div>
                <button class="btn-add-inspo" onclick="addInspirationToRoom(${i})">+ Ajouter au moodboard</button>
            </div>
        </div>`;
    }).join('')}</div>`;
    
    window._lastInspirations = suggestions;
}

async function addInspirationToRoom(index) {
    if (!currentProject || currentRoom === null) return;
    const s = window._lastInspirations?.[index];
    if (!s) return;
    
    const price = typeof s.price === 'number' ? s.price : (parseFloat(s.price) || 0);
    
    try {
        await db.collection('projects').doc(currentProject.id).collection('items').add({
            name: s.name,
            category: s.category || 'Inspiration',
            subcategory: s.subcategory || '',
            supplier: s.source || '',
            link: s.link || '',
            price: price,
            qty: 1,
            notes: `${s.description || ''} ${s.price_display || s.price_estimate || ''}`.trim(),
            roomIndex: currentRoom,
            roomName: currentProject.rooms[currentRoom].name,
            imageUrl: s.image_url || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        toast(`"${s.name}" ajouté !`);
    } catch (err) {
        console.error('Add inspiration error:', err);
        toast('Erreur lors de l\'ajout');
    }
}

// ─── BUDGET ──────────────────────────────────────────────────

async function recalcBudget(projectId, items) {
    const total = items.reduce((sum, i) => sum + (i.price || 0) * (i.qty || 1), 0);
    try {
        await db.collection('projects').doc(projectId).update({ totalBudget: total });
    } catch (e) { /* ignore if not owner */ }
}

// ─── COMMENTS ────────────────────────────────────────────────

function showComments() {
    document.getElementById('comments-panel').classList.add('open');
}

function hideComments() {
    document.getElementById('comments-panel').classList.remove('open');
}

async function addComment(e) {
    e.preventDefault();
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) return;

    await db.collection('projects').doc(currentProject.id).collection('comments').add({
        text,
        authorId: currentUser?.uid || 'anonymous',
        authorName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Invité',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    input.value = '';
}

function renderComments(comments) {
    const list = document.getElementById('comments-list');
    const badge = document.getElementById('comment-badge');

    badge.style.display = comments.length > 0 ? 'flex' : 'none';
    badge.textContent = comments.length;

    if (comments.length === 0) {
        list.innerHTML = '<div class="comments-empty">Aucun commentaire. Soyez le premier !</div>';
        return;
    }

    list.innerHTML = comments.map(c => {
        const initials = (c.authorName || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const time = c.createdAt ? timeAgo(c.createdAt.toDate()) : '';
        return `
            <div class="comment">
                <div class="comment-avatar">${initials}</div>
                <div class="comment-body">
                    <div class="comment-header">
                        <strong>${escHtml(c.authorName)}</strong>
                        <span class="comment-time">${time}</span>
                    </div>
                    <p>${escHtml(c.text)}</p>
                </div>
            </div>
        `;
    }).join('');
    list.scrollTop = list.scrollHeight;
}

// ─── COLOR EXTRACTION ────────────────────────────────────────

function showColorExtractor() {
    document.getElementById('modal-colors').classList.add('active');
    document.getElementById('extracted-colors').style.display = 'none';
    document.getElementById('color-image-preview').innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CCC" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span>Uploadez une image d'inspiration</span>`;
}

function extractColors(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        document.getElementById('color-image-preview').innerHTML =
            `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.getElementById('color-canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            displayExtractedColors(extractDominantColors(ctx, img.width, img.height, 8));
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
}

function extractDominantColors(ctx, w, h, count) {
    const imageData = ctx.getImageData(0, 0, w, h).data;
    const colorMap = {};
    const step = Math.max(1, Math.floor((w * h) / 10000));
    for (let i = 0; i < imageData.length; i += 4 * step) {
        const r = Math.round(imageData[i] / 32) * 32;
        const g = Math.round(imageData[i + 1] / 32) * 32;
        const b = Math.round(imageData[i + 2] / 32) * 32;
        if (r + g + b < 60 || r + g + b > 700) continue;
        const key = `${r},${g},${b}`;
        colorMap[key] = (colorMap[key] || 0) + 1;
    }
    return Object.entries(colorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([key]) => { const [r, g, b] = key.split(',').map(Number); return rgbToHex(r, g, b); });
}

function displayExtractedColors(colors) {
    document.getElementById('extracted-colors').style.display = 'block';
    document.getElementById('color-swatches').innerHTML = colors.map(hex => `
        <button class="color-swatch" style="background:${hex}" onclick="addColorToProject('${hex}')" title="${hex}">
            <span class="color-swatch-hex">${hex}</span>
        </button>
    `).join('');
}

async function addColorToProject(hex) {
    if (!currentProject) return;
    const colors = [...(currentProject.colors || [])];
    if (colors.includes(hex)) { toast('Couleur déjà dans la palette'); return; }
    colors.push(hex);
    await db.collection('projects').doc(currentProject.id).update({ colors });
    toast(`${hex} ajouté !`);
}

function renderPalette() {
    const container = document.getElementById('palette-colors');
    const colors = currentProject?.colors || [];
    const paletteSection = document.getElementById('sidebar-palette');
    if (colors.length === 0) { paletteSection.style.display = 'none'; return; }
    paletteSection.style.display = 'block';
    container.innerHTML = colors.map(hex => `
        <div class="palette-color" style="background:${hex}" title="${hex} — clic pour retirer" onclick="removeColor('${hex}')"></div>
    `).join('');
}

async function removeColor(hex) {
    if (!currentProject) return;
    const colors = (currentProject.colors || []).filter(c => c !== hex);
    await db.collection('projects').doc(currentProject.id).update({ colors });
}

// ─── SHARING ─────────────────────────────────────────────────

function showShareModal() {
    if (!currentProject) return;
    document.getElementById('modal-share').classList.add('active');
    const url = `${window.location.origin}${window.location.pathname}?share=${currentProject.shareId}`;
    document.getElementById('share-link').value = url;
    document.getElementById('share-copied').style.display = 'none';
}

function copyShareLink() {
    const input = document.getElementById('share-link');
    input.select();
    navigator.clipboard.writeText(input.value);
    document.getElementById('share-copied').style.display = 'block';
    setTimeout(() => { document.getElementById('share-copied').style.display = 'none'; }, 3000);
}

async function loadSharedProject(shareId) {
    showScreen('project-screen');
    
    try {
        const snap = await db.collection('projects').where('shareId', '==', shareId).limit(1).get();
        if (snap.empty) {
            toast('Projet introuvable ou lien expiré');
            // Show a helpful message
            document.getElementById('project-main').innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;text-align:center;padding:2rem">
                    <div style="font-size:3rem;margin-bottom:1rem">🔗</div>
                    <h2 style="font-family:var(--font-heading);margin-bottom:0.5rem">Projet introuvable</h2>
                    <p style="color:var(--warm-gray);margin-bottom:1.5rem">Ce lien de partage n'est pas valide ou le projet a été supprimé.</p>
                    <button class="btn-primary-app" onclick="window.location.href='app.html'">Créer mon propre projet</button>
                </div>`;
            return;
        }
        
        const projectId = snap.docs[0].id;
        isSharedView = true;
        openProject(projectId);
    } catch (err) {
        console.error('Share load error:', err);
        toast('Erreur de chargement du projet partagé');
    }
}

// ─── EXPORT PDF ──────────────────────────────────────────────

async function exportPDF() {
    if (!currentProject) return;
    toast('Génération du PDF…');

    const snap = await db.collection('projects').doc(currentProject.id).collection('items')
        .orderBy('roomIndex', 'asc').get();
    const items = snap.docs.map(d => d.data());
    const rooms = currentProject.rooms || [];

    let html = `
        <div style="font-family: 'Helvetica Neue', sans-serif; padding: 40px; color: #1A1714;">
            <div style="text-align:center; margin-bottom: 40px;">
                <h1 style="font-size: 28px; margin-bottom: 4px;">${escHtml(currentProject.name)}</h1>
                <p style="color: #888; font-size: 14px;">${currentProject.surface ? currentProject.surface + ' m²' : ''} ${currentProject.style ? '• ' + currentProject.style : ''}</p>
                <p style="color: #C4704B; font-size: 20px; font-weight: 700; margin-top: 16px;">Budget total : ${formatPrice(currentProject.totalBudget || 0)}</p>
            </div>`;

    rooms.forEach((room, ri) => {
        const roomItems = items.filter(i => i.roomIndex === ri);
        const roomBudget = roomItems.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
        html += `
            <div style="margin-bottom: 32px; page-break-inside: avoid;">
                <h2 style="font-size: 18px; border-bottom: 2px solid #E8DDD3; padding-bottom: 8px; margin-bottom: 16px;">
                    ${room.icon || '🏠'} ${escHtml(room.name)}
                    <span style="float:right; color: #C4704B; font-size: 16px;">${formatPrice(roomBudget)}</span>
                </h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead><tr style="background: #FAF7F2; text-align: left;">
                        <th style="padding: 8px 12px; border-bottom: 1px solid #E8DDD3;">Produit</th>
                        <th style="padding: 8px 12px; border-bottom: 1px solid #E8DDD3;">Fournisseur</th>
                        <th style="padding: 8px 12px; border-bottom: 1px solid #E8DDD3;">Qté</th>
                        <th style="padding: 8px 12px; border-bottom: 1px solid #E8DDD3; text-align:right;">Prix</th>
                    </tr></thead>
                    <tbody>
                        ${roomItems.map(i => `<tr>
                            <td style="padding: 8px 12px; border-bottom: 1px solid #F0EDE8;"><strong>${escHtml(i.name)}</strong>${i.notes ? `<br><small style="color:#999">${escHtml(i.notes)}</small>` : ''}</td>
                            <td style="padding: 8px 12px; border-bottom: 1px solid #F0EDE8;">${escHtml(i.supplier || '—')}</td>
                            <td style="padding: 8px 12px; border-bottom: 1px solid #F0EDE8;">${i.qty || 1}</td>
                            <td style="padding: 8px 12px; border-bottom: 1px solid #F0EDE8; text-align:right; font-weight:600;">${formatPrice((i.price || 0) * (i.qty || 1))}</td>
                        </tr>`).join('')}
                        ${roomItems.length === 0 ? '<tr><td colspan="4" style="padding: 12px; color: #CCC; text-align: center;">Aucun élément</td></tr>' : ''}
                    </tbody>
                </table>
            </div>`;
    });

    html += `<div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #E8DDD3; color: #CCC; font-size: 11px;">
                Généré avec Cocon — ${new Date().toLocaleDateString('fr-FR')}
            </div></div>`;

    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    
    // Lazy-load html2pdf if not already loaded
    if (typeof html2pdf === 'undefined') {
        toast('Chargement de l\'export PDF...');
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }
    
    await html2pdf().set({
        margin: 0.5,
        filename: `${currentProject.name.replace(/[^a-zA-Z0-9]/g, '_')}_cocon.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
    document.body.removeChild(el);
    toast('PDF téléchargé !');
}

// ─── MODALS ──────────────────────────────────────────────────

function closeModal(event, id) {
    if (event.target === document.getElementById(id)) closeModalById(id);
}

function closeModalById(id) {
    document.getElementById(id).classList.remove('active');
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const modal = document.querySelector('.modal-overlay.active');
        if (modal) modal.classList.remove('active');
        document.querySelectorAll('.user-dropdown.open').forEach(d => d.classList.remove('open'));
        const lb = document.getElementById('item-lightbox');
        if (lb && lb.classList.contains('active')) lb.classList.remove('active');
    }
});

document.addEventListener('click', e => {
    if (!e.target.closest('.user-menu')) {
        document.querySelectorAll('.user-dropdown.open').forEach(d => d.classList.remove('open'));
    }
});

// ─── USER MENU ───────────────────────────────────────────────

function toggleUserMenu() {
    document.querySelectorAll('.user-dropdown').forEach(d => d.classList.toggle('open'));
}

function toggleSidebar() {
    document.getElementById('project-sidebar').classList.toggle('open');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) {
        document.querySelectorAll('.user-dropdown').forEach(d => d.classList.remove('open'));
    }
    // Close mobile sidebar when clicking outside
    if (!e.target.closest('.project-sidebar') && !e.target.closest('.btn-mobile-menu')) {
        const sidebar = document.getElementById('project-sidebar');
        if (sidebar) sidebar.classList.remove('open');
    }
});

// ─── TOAST ───────────────────────────────────────────────────

function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── OFFLINE DETECTION ───────────────────────────────────────
window.addEventListener('offline', () => {
    toast('⚡ Connexion perdue — les modifications ne seront pas sauvegardées');
});
window.addEventListener('online', () => {
    toast('✅ Connexion rétablie');
});

// ─── HELPERS ─────────────────────────────────────────────────

function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── DIMENSIONS & PLANS ──────────────────────────────────────

let dimensionsViewActive = false;
let roomMeasures = [];
let roomPlans = [];
let unsubMeasures = null;
let unsubPlans = null;

function toggleDimensionsView() {
    if (!currentProject || currentRoom === null) { toast('Sélectionnez une pièce'); return; }
    
    if (dimensionsViewActive) {
        hideDimensionsView();
        renderItems();
    } else {
        showDimensionsView();
    }
}

function showDimensionsView() {
    dimensionsViewActive = true;
    if (budgetViewActive) hideBudgetDashboard();
    if (exploreViewActive) hideExplorePage();
    document.getElementById('items-grid').style.display = 'none';
    document.getElementById('moodboard-view').style.display = 'none';
    document.getElementById('room-empty').style.display = 'none';
    document.getElementById('inspiration-view').style.display = 'none';
    if (document.getElementById('category-tabs')) document.getElementById('category-tabs').style.display = 'none';
    document.getElementById('dimensions-view').style.display = 'block';
    loadMeasures();
    loadPlans();
}

function hideDimensionsView() {
    dimensionsViewActive = false;
    document.getElementById('dimensions-view').style.display = 'none';
    if (unsubMeasures) { unsubMeasures(); unsubMeasures = null; }
    if (unsubPlans) { unsubPlans(); unsubPlans = null; }
}

function loadMeasures() {
    if (!currentProject || currentRoom === null) return;
    if (unsubMeasures) unsubMeasures();
    
    unsubMeasures = db.collection('projects').doc(currentProject.id)
        .collection('measures')
        .where('roomIndex', '==', currentRoom)
        .onSnapshot(snap => {
            roomMeasures = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            roomMeasures.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tb - ta;
            });
            renderMeasures();
        }, err => {
            console.error('Measures load error:', err);
            roomMeasures = [];
            renderMeasures();
        });
}

function loadPlans() {
    if (!currentProject || currentRoom === null) return;
    if (unsubPlans) unsubPlans();
    
    unsubPlans = db.collection('projects').doc(currentProject.id)
        .collection('plans')
        .where('roomIndex', '==', currentRoom)
        .onSnapshot(snap => {
            roomPlans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            roomPlans.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tb - ta;
            });
            renderPlans();
        }, err => {
            console.error('Plans load error:', err);
            roomPlans = [];
            renderPlans();
        });
}

function renderPlans() {
    const grid = document.getElementById('dimensions-plans-grid');
    if (!grid) return;
    
    if (roomPlans.length === 0) {
        grid.innerHTML = `
            <div class="dimensions-empty">
                <span style="font-size:2rem">📐</span>
                <p>Uploadez vos plans, photos de murs, relevés de mesures…</p>
            </div>`;
        return;
    }
    
    grid.innerHTML = roomPlans.map(p => `
        <div class="plan-card">
            <div class="plan-card-img" onclick="openPlanLightbox('${escHtml(p.imageUrl)}')" style="background: url(${escHtml(p.imageUrl)}) center/contain no-repeat, #F5F0EB; cursor:pointer"></div>
            <div class="plan-card-info">
                <span class="plan-card-name">${escHtml(p.name || 'Plan')}</span>
                <button class="btn-icon-xs" onclick="deletePlan('${p.id}')" title="Supprimer">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderMeasures() {
    const list = document.getElementById('dimensions-measures-list');
    if (!list) return;
    
    if (roomMeasures.length === 0) {
        list.innerHTML = `
            <div class="dimensions-empty">
                <span style="font-size:1.5rem">📏</span>
                <p>Ajoutez les dimensions de la pièce : murs, fenêtres, portes, sous-pentes…</p>
            </div>`;
        return;
    }
    
    // Calculate total surface if possible
    let summaryHtml = '';
    const room = currentProject.rooms[currentRoom];
    if (room && room.surface) {
        summaryHtml = `<div class="measures-summary">Surface déclarée : <strong>${room.surface} m²</strong></div>`;
    }
    
    list.innerHTML = summaryHtml + roomMeasures.map(m => {
        const dims = [
            m.length ? `${m.length} cm` : null,
            m.width ? `× ${m.width} cm` : null,
            m.height ? `× ${m.height} cm` : null
        ].filter(Boolean).join(' ');
        const area = (m.length && m.width) ? ` = ${((m.length * m.width) / 10000).toFixed(2)} m²` : '';
        
        return `
        <div class="measure-row">
            <div class="measure-row-icon">📏</div>
            <div class="measure-row-info">
                <div class="measure-row-label">${escHtml(m.label)}</div>
                <div class="measure-row-dims">${dims}${area}</div>
                ${m.notes ? `<div class="measure-row-notes">${escHtml(m.notes)}</div>` : ''}
            </div>
            <div class="measure-row-actions">
                <button class="btn-icon-xs" onclick="editMeasure('${m.id}')" title="Modifier">✏️</button>
                <button class="btn-icon-xs" onclick="deleteMeasure('${m.id}')" title="Supprimer">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

async function uploadPlan(event) {
    const file = event.target.files[0];
    if (!file || !currentProject || currentRoom === null) return;
    
    if (file.size > 5 * 1024 * 1024) { toast('Fichier trop lourd (5 MB max)'); return; }
    
    toast('Upload en cours...');
    
    try {
        const storageRef = firebase.storage().ref();
        const path = `projects/${currentProject.id}/plans/${Date.now()}_${file.name}`;
        const snap = await storageRef.child(path).put(file);
        const imageUrl = await snap.ref.getDownloadURL();
        
        await db.collection('projects').doc(currentProject.id).collection('plans').add({
            name: file.name.replace(/\.[^.]+$/, ''),
            imageUrl,
            storagePath: path,
            roomIndex: currentRoom,
            roomName: currentProject.rooms[currentRoom].name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        toast('Plan ajouté');
        event.target.value = '';
    } catch (err) {
        console.error('Upload plan error:', err);
        toast('Erreur lors de l\'upload');
    }
}

async function deletePlan(id) {
    if (!currentProject || !confirm('Supprimer ce plan ?')) return;
    try {
        const doc = await db.collection('projects').doc(currentProject.id).collection('plans').doc(id).get();
        const data = doc.data();
        if (data?.storagePath) {
            try { await firebase.storage().ref().child(data.storagePath).delete(); } catch (e) {}
        }
        await db.collection('projects').doc(currentProject.id).collection('plans').doc(id).delete();
        toast('Plan supprimé');
    } catch (err) {
        console.error('Delete plan error:', err);
        toast('Erreur lors de la suppression');
    }
}

function openPlanLightbox(url) {
    const lb = document.getElementById('item-lightbox');
    lb.querySelector('.lightbox-content').innerHTML = `
        <img src="${url}" style="max-width:90vw;max-height:85vh;object-fit:contain;border-radius:8px" onclick="event.stopPropagation()">
    `;
    lb.classList.add('active');
}

function showAddMeasure() {
    if (currentRoom === null) { toast('Sélectionnez une pièce'); return; }
    document.getElementById('measure-modal-title').textContent = '📏 Nouvelle mesure';
    document.getElementById('measure-submit-btn').textContent = 'Ajouter';
    document.getElementById('measure-edit-id').value = '';
    document.getElementById('measure-label').value = '';
    document.getElementById('measure-length').value = '';
    document.getElementById('measure-width').value = '';
    document.getElementById('measure-height').value = '';
    document.getElementById('measure-notes').value = '';
    document.getElementById('modal-measure').classList.add('active');
}

function editMeasure(id) {
    const m = roomMeasures.find(m => m.id === id);
    if (!m) return;
    document.getElementById('measure-modal-title').textContent = '📏 Modifier la mesure';
    document.getElementById('measure-submit-btn').textContent = 'Enregistrer';
    document.getElementById('measure-edit-id').value = id;
    document.getElementById('measure-label').value = m.label || '';
    document.getElementById('measure-length').value = m.length || '';
    document.getElementById('measure-width').value = m.width || '';
    document.getElementById('measure-height').value = m.height || '';
    document.getElementById('measure-notes').value = m.notes || '';
    document.getElementById('modal-measure').classList.add('active');
}

async function saveMeasure(e) {
    e.preventDefault();
    if (!currentProject || currentRoom === null) return;
    const btn = document.getElementById('measure-submit-btn');
    btn.disabled = true;
    
    const editId = document.getElementById('measure-edit-id').value;
    const label = document.getElementById('measure-label').value.trim();
    const length = parseFloat(document.getElementById('measure-length').value) || 0;
    const width = parseFloat(document.getElementById('measure-width').value) || 0;
    const height = parseFloat(document.getElementById('measure-height').value) || 0;
    const notes = document.getElementById('measure-notes').value.trim();
    
    if (!label) { toast('Ajoutez un nom'); btn.disabled = false; return; }
    
    const data = {
        label, length, width, height, notes,
        roomIndex: currentRoom,
        roomName: currentProject.rooms[currentRoom].name,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        if (editId) {
            await db.collection('projects').doc(currentProject.id).collection('measures').doc(editId).update(data);
            toast('Mesure modifiée');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('projects').doc(currentProject.id).collection('measures').add(data);
            toast('Mesure ajoutée');
        }
        closeModalById('modal-measure');
    } catch (err) {
        console.error('Save measure error:', err);
        toast('Erreur lors de la sauvegarde');
    } finally {
        btn.disabled = false;
    }
}

async function deleteMeasure(id) {
    if (!currentProject || !confirm('Supprimer cette mesure ?')) return;
    try {
        await db.collection('projects').doc(currentProject.id).collection('measures').doc(id).delete();
        toast('Mesure supprimée');
    } catch (err) {
        console.error('Delete measure error:', err);
        toast('Erreur lors de la suppression');
    }
}

// ─── SMART URL PARSER ────────────────────────────────────────

const SITE_PATTERNS = [
    { host: /ikea\.com/, supplier: 'IKEA', pathRegex: /\/p\/([a-z0-9-]+)-(\d{8})\/?/, nameGroup: 1, refGroup: 2, category: null },
    { host: /maisonsdumonde\.com/, supplier: 'Maisons du Monde', pathRegex: /\/([a-z0-9-]+)-(\d+)\.html/, nameGroup: 1, refGroup: 2, category: null },
    { host: /leroymerlin\.fr/, supplier: 'Leroy Merlin', pathRegex: /\/([a-z0-9-]+)\.html/, nameGroup: 1, refGroup: null, category: null },
    { host: /laredoute\.fr|ampm\.fr/, supplier: 'La Redoute / AM.PM', pathRegex: /\/ppdp\/([a-z0-9-]+)\/([A-Z0-9]+)\.aspx|\/([a-z0-9-]+)\.html/, nameGroup: 1, refGroup: 2, category: null },
    { host: /made\.com/, supplier: 'MADE.com', pathRegex: /\/fr\/([a-z0-9-]+)-([a-z0-9]+)$/, nameGroup: 1, refGroup: 2, category: null },
    { host: /tikamoon\.com/, supplier: 'Tikamoon', pathRegex: /\/([a-z0-9-]+)\.html/, nameGroup: 1, refGroup: null, category: 'Mobilier' },
    { host: /conforama\.fr/, supplier: 'Conforama', pathRegex: /\/([a-z0-9-]+)-p-([A-Z0-9]+)/, nameGroup: 1, refGroup: 2, category: null },
    { host: /habitat\.fr/, supplier: 'Habitat', pathRegex: /\/([a-z0-9-]+)-(\d+)\.html/, nameGroup: 1, refGroup: 2, category: null },
    { host: /but\.fr/, supplier: 'BUT', pathRegex: /\/([a-z0-9-]+)-(\d+)\.html/, nameGroup: 1, refGroup: 2, category: null },
    { host: /castorama\.fr/, supplier: 'Castorama', pathRegex: /\/([a-z0-9-]+)-(\d+)\.html/, nameGroup: 1, refGroup: null, category: null },
    { host: /manomano\.fr/, supplier: 'ManoMano', pathRegex: /\/([a-z0-9-]+)-(\d+)/, nameGroup: 1, refGroup: 2, category: null },
    { host: /alinea\.com/, supplier: 'Alinéa', pathRegex: /\/([a-z0-9-]+)\.html/, nameGroup: 1, refGroup: null, category: null },
    { host: /zfrancais\.fr|zfrançaise/, supplier: 'La Française', pathRegex: /\/([a-z0-9-]+)/, nameGroup: 1, refGroup: null, category: null },
    { host: /farrow-ball\.com|farrowball/, supplier: 'Farrow & Ball', pathRegex: /\/([a-z0-9-]+)/, nameGroup: 1, refGroup: null, category: 'Peinture' },
    { host: /littlegreene\.fr|little-greene/, supplier: 'Little Greene', pathRegex: /\/([a-z0-9-]+)/, nameGroup: 1, refGroup: null, category: 'Peinture' },
    { host: /ressource-peintures\.com/, supplier: 'Ressource', pathRegex: /\/([a-z0-9-]+)/, nameGroup: 1, refGroup: null, category: 'Peinture' },
    { host: /selency\.com/, supplier: 'Selency', pathRegex: /\/product\/([a-z0-9-]+)/, nameGroup: 1, refGroup: null, category: null },
    { host: /nedgis\.com/, supplier: 'Nedgis', pathRegex: /\/([a-z0-9-]+)-(\d+)\.html/, nameGroup: 1, refGroup: 2, category: 'Luminaire' },
    { host: /ffrancais|petitefriture\.com/, supplier: 'Petite Friture', pathRegex: /\/([a-z0-9-]+)/, nameGroup: 1, refGroup: null, category: null },
    { host: /muuto\.com/, supplier: 'Muuto', pathRegex: /\/([a-z0-9-]+)/, nameGroup: 1, refGroup: null, category: null },
    { host: /hay\.dk|hay\.com/, supplier: 'HAY', pathRegex: /\/([a-z0-9-]+)/, nameGroup: 1, refGroup: null, category: null },
    { host: /drawer\.fr/, supplier: 'Drawer', pathRegex: /\/([a-z0-9-]+)\.html/, nameGroup: 1, refGroup: null, category: 'Mobilier' },
    { host: /schmidt/, supplier: 'Schmidt', pathRegex: /\/([a-z0-9-]+)/, nameGroup: 1, refGroup: null, category: 'Cuisine' },
    { host: /lapeyre\.fr/, supplier: 'Lapeyre', pathRegex: /\/([a-z0-9-]+)\.html/, nameGroup: 1, refGroup: null, category: null },
    { host: /saintmaclou\.com/, supplier: 'Saint Maclou', pathRegex: /\/([a-z0-9-]+)\.html/, nameGroup: 1, refGroup: null, category: null },
    { host: /porcelanosa\.com/, supplier: 'Porcelanosa', pathRegex: /\/([a-z0-9-]+)/, nameGroup: 1, refGroup: null, category: 'Carrelage' },
    { host: /leboncoin\.fr/, supplier: 'Le Bon Coin', pathRegex: /\/([a-z0-9-]+)\/(\d+)\.htm/, nameGroup: 1, refGroup: 2, category: null },
    { host: /amazon\.fr/, supplier: 'Amazon', pathRegex: /\/dp\/([A-Z0-9]+)|\/([a-z0-9-]+)\/dp\//, nameGroup: 2, refGroup: 1, category: null },
    { host: /cdiscount\.com/, supplier: 'Cdiscount', pathRegex: /\/([a-z0-9-]+)\.html/, nameGroup: 1, refGroup: null, category: null },
];

function slugToName(slug) {
    if (!slug) return '';
    return slug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/\b(De|Du|Le|La|Les|Et|En|Au|Aux|Par|Pour|Avec|Sur|Cm|Mm|Kg)\b/g, m => m.toLowerCase())
        .trim();
}

function parseProductUrl(url) {
    if (!url || !url.startsWith('http')) return null;
    
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const path = decodeURIComponent(parsed.pathname).toLowerCase();
        
        const result = { supplier: null, name: null, ref: null, category: null };
        
        // Try each known site pattern
        for (const site of SITE_PATTERNS) {
            if (site.host.test(host)) {
                result.supplier = site.supplier;
                result.category = site.category;
                
                if (site.pathRegex) {
                    const match = parsed.pathname.match(site.pathRegex);
                    if (match) {
                        if (site.nameGroup && match[site.nameGroup]) {
                            result.name = slugToName(match[site.nameGroup]);
                        }
                        if (site.refGroup && match[site.refGroup]) {
                            result.ref = match[site.refGroup];
                        }
                    }
                }
                return result;
            }
        }
        
        // Unknown site: extract supplier from domain name
        const domainParts = host.replace('www.', '').split('.');
        if (domainParts.length > 0) {
            result.supplier = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
        }
        
        // Try to extract name from last path segment
        const segments = parsed.pathname.split('/').filter(s => s && s.length > 3);
        if (segments.length > 0) {
            const last = segments[segments.length - 1]
                .replace(/\.html?$/, '')
                .replace(/[-_]\d{5,}$/, ''); // remove trailing product IDs
            if (last.length > 3) {
                result.name = slugToName(last);
            }
        }
        
        return result;
    } catch (e) {
        return null;
    }
}

let smartLinkTimeout = null;
function handleSmartLink(url) {
    clearTimeout(smartLinkTimeout);
    const hint = document.getElementById('smart-link-hint');
    
    if (!url || url.length < 10) {
        hint.textContent = '';
        return;
    }
    
    // Debounce 300ms
    smartLinkTimeout = setTimeout(() => {
        const parsed = parseProductUrl(url);
        if (!parsed) {
            hint.textContent = '';
            return;
        }
        
        let filled = [];
        
        // Only fill empty fields (don't overwrite user input)
        if (parsed.supplier && !document.getElementById('item-input-supplier').value) {
            document.getElementById('item-input-supplier').value = parsed.supplier;
            filled.push('fournisseur');
        }
        if (parsed.name && !document.getElementById('item-input-name').value) {
            document.getElementById('item-input-name').value = parsed.name;
            filled.push('nom');
        }
        if (parsed.ref && !document.getElementById('item-input-ref').value) {
            document.getElementById('item-input-ref').value = parsed.ref;
            filled.push('réf');
        }
        if (parsed.category && !document.getElementById('item-input-category').value) {
            document.getElementById('item-input-category').value = parsed.category;
            updateSubcategoryOptions();
            filled.push('catégorie');
        }
        
        if (filled.length > 0) {
            hint.textContent = `✨ ${filled.join(', ')} pré-rempli${filled.length > 1 ? 's' : ''}`;
            hint.className = 'smart-link-hint success';
        } else if (parsed.supplier) {
            hint.textContent = `✓ ${parsed.supplier} détecté`;
            hint.className = 'smart-link-hint partial';
        }
    }, 300);
}

// ─── INSPIRATION SPLIT VIEW & POST-ITS ───────────────────────

let roomPostits = [];
let unsubPostits = null;

function renderInspirationSplitView(inspoItems) {
    const leftGrid = document.getElementById('inspo-split-items');
    
    if (inspoItems.length === 0) {
        leftGrid.innerHTML = `
            <div class="inspo-split-empty">
                <span style="font-size:2rem">📸</span>
                <p>Ajoutez des photos d'inspiration</p>
                <button class="btn-primary-app btn-sm" onclick="showAddItemModal()">+ Ajouter</button>
            </div>`;
    } else {
        leftGrid.innerHTML = inspoItems.map(item => {
            const itemJson = JSON.stringify(item).replace(/\\/g, '\\\\').replace(/'/g, "&#39;").replace(/"/g, '&quot;');
            return `
            <div class="inspo-split-card" onclick='openLightbox(JSON.parse(this.dataset.item))' data-item="${itemJson}">
                <div class="inspo-split-card-img" style="background: ${item.imageUrl ? `url(${escHtml(item.imageUrl)}) center/cover` : '#F5F0EB'}">
                    ${!item.imageUrl ? `<span style="font-size:1.5rem">${getCategoryEmoji(item.category)}</span>` : ''}
                </div>
                <div class="inspo-split-card-info">
                    <span class="inspo-split-card-name">${escHtml(item.name)}</span>
                    ${item.supplier ? `<span class="inspo-split-card-source">${escHtml(item.supplier)}</span>` : ''}
                </div>
                <div class="inspo-split-card-actions">
                    <button class="btn-icon-xs" onclick='event.stopPropagation(); showAddItemModal(JSON.parse(this.parentElement.parentElement.dataset.item))' title="Modifier">✏️</button>
                    <button class="btn-icon-xs" onclick="event.stopPropagation(); deleteItem('${item.id}')" title="Supprimer">🗑️</button>
                </div>
            </div>`;
        }).join('');
    }
    
    // Load post-its for this room
    loadPostits();
}

function loadPostits() {
    if (!currentProject || currentRoom === null) return;
    
    // Cleanup previous listener
    if (unsubPostits) unsubPostits();
    
    unsubPostits = db.collection('projects').doc(currentProject.id)
        .collection('postits')
        .where('roomIndex', '==', currentRoom)
        .onSnapshot(snap => {
            roomPostits = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort client-side to avoid needing composite index
            roomPostits.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tb - ta;
            });
            renderPostits();
        }, err => {
            console.error('Postits load error:', err);
            roomPostits = [];
            renderPostits();
        });
}

function renderPostits() {
    const board = document.getElementById('postits-board');
    if (!board) return;
    
    if (roomPostits.length === 0) {
        board.innerHTML = `
            <div class="postits-empty">
                <span style="font-size:1.5rem">📝</span>
                <p>Notez vos idées, inspirations, liens…</p>
            </div>`;
        return;
    }
    
    board.innerHTML = roomPostits.map(p => `
        <div class="postit" style="background:${p.color || '#FFF8E7'}">
            <div class="postit-header">
                <h4 class="postit-title">${escHtml(p.title)}</h4>
                <div class="postit-actions">
                    <button class="btn-icon-xs" onclick="editPostit('${p.id}')" title="Modifier">✏️</button>
                    <button class="btn-icon-xs" onclick="deletePostit('${p.id}')" title="Supprimer">×</button>
                </div>
            </div>
            ${p.content ? `<p class="postit-text">${escHtml(p.content).replace(/\n/g, '<br>')}</p>` : ''}
            ${p.createdAt ? `<span class="postit-date">${timeAgo(p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt))}</span>` : ''}
        </div>
    `).join('');
}

function showAddPostit() {
    if (currentRoom === null) { toast('Sélectionnez une pièce'); return; }
    document.getElementById('postit-modal-title').textContent = '📝 Nouvelle note';
    document.getElementById('postit-submit-btn').textContent = 'Ajouter';
    document.getElementById('postit-edit-id').value = '';
    document.getElementById('postit-title').value = '';
    document.getElementById('postit-content').value = '';
    // Reset color selection
    document.querySelectorAll('.postit-color-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.getElementById('modal-postit').classList.add('active');
}

function editPostit(id) {
    const p = roomPostits.find(p => p.id === id);
    if (!p) return;
    document.getElementById('postit-modal-title').textContent = '📝 Modifier la note';
    document.getElementById('postit-submit-btn').textContent = 'Enregistrer';
    document.getElementById('postit-edit-id').value = id;
    document.getElementById('postit-title').value = p.title || '';
    document.getElementById('postit-content').value = p.content || '';
    // Set color
    document.querySelectorAll('.postit-color-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.color === (p.color || '#FFF8E7'));
    });
    document.getElementById('modal-postit').classList.add('active');
}

function selectPostitColor(btn) {
    document.querySelectorAll('.postit-color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

async function savePostit(e) {
    e.preventDefault();
    if (!currentProject || currentRoom === null) return;
    
    const editId = document.getElementById('postit-edit-id').value;
    const title = document.getElementById('postit-title').value.trim();
    const content = document.getElementById('postit-content').value.trim();
    const colorBtn = document.querySelector('.postit-color-btn.active');
    const color = colorBtn ? colorBtn.dataset.color : '#FFF8E7';
    
    if (!title) { toast('Ajoutez un titre'); return; }
    
    const data = {
        title,
        content,
        color,
        roomIndex: currentRoom,
        roomName: currentProject.rooms[currentRoom].name,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        if (editId) {
            await db.collection('projects').doc(currentProject.id).collection('postits').doc(editId).update(data);
            toast('Note modifiée');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('projects').doc(currentProject.id).collection('postits').add(data);
            toast('Note ajoutée');
        }
        closeModalById('modal-postit');
    } catch (err) {
        console.error('Save postit error:', err);
        toast('Erreur lors de la sauvegarde');
    }
}

async function deletePostit(id) {
    if (!currentProject || !confirm('Supprimer cette note ?')) return;
    try {
        await db.collection('projects').doc(currentProject.id).collection('postits').doc(id).delete();
        toast('Note supprimée');
    } catch (err) {
        console.error('Delete postit error:', err);
        toast('Erreur lors de la suppression');
    }
}

// ─── STATUS & BUDGET HELPERS ─────────────────────────────────

function getStatusLabel(status) {
    const labels = { planned: '📋 À acheter', ordered: '📦 Commandé', delivered: '🚚 Livré', installed: '✅ Installé' };
    return labels[status] || labels.planned;
}

function getStatusShort(status) {
    const labels = { planned: 'À acheter', ordered: 'Commandé', delivered: 'Livré', installed: 'Installé' };
    return labels[status] || labels.planned;
}

function getStatusColor(status) {
    const colors = { planned: '#AAA', ordered: '#E8A838', delivered: '#5B9BD5', installed: '#6BAF6B' };
    return colors[status] || colors.planned;
}

function populatePaidByOptions() {
    const sel = document.getElementById('item-input-paid-by');
    if (!sel || !currentProject) return;
    const members = currentProject.members || [];
    const ownerName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Moi';
    // Keep first 2 fixed options (-- and Commun), build rest dynamically
    sel.innerHTML = `<option value="">— Non défini</option><option value="commun">Commun</option>`;
    // Add owner
    sel.innerHTML += `<option value="${escHtml(ownerName)}">${escHtml(ownerName)}</option>`;
    // Add known collaborators from items
    const knownPayers = [...new Set(allItems.map(i => i.paidBy).filter(p => p && p !== 'commun' && p !== ownerName))];
    knownPayers.forEach(p => {
        sel.innerHTML += `<option value="${escHtml(p)}">${escHtml(p)}</option>`;
    });
    // Add "Autre..." option
    sel.innerHTML += `<option value="__other__">+ Autre personne…</option>`;
}

// Handle paidBy "other" selection
document.addEventListener('change', (e) => {
    if (e.target.id === 'item-input-paid-by' && e.target.value === '__other__') {
        const name = prompt('Nom de la personne :');
        if (name && name.trim()) {
            const opt = document.createElement('option');
            opt.value = name.trim();
            opt.textContent = name.trim();
            e.target.insertBefore(opt, e.target.querySelector('[value="__other__"]'));
            e.target.value = name.trim();
        } else {
            e.target.value = '';
        }
    }
});

// ─── BUDGET DASHBOARD ────────────────────────────────────────

let budgetViewActive = false;

function showBudgetDashboard() {
    if (!currentProject) return;
    budgetViewActive = true;
    if (exploreViewActive) hideExplorePage();
    currentRoom = null;
    
    // Deselect rooms in sidebar
    renderProjectSidebar();
    document.getElementById('btn-budget-view').classList.add('active');
    
    // Hide room content, show budget
    document.getElementById('items-grid').style.display = 'none';
    document.getElementById('moodboard-view').style.display = 'none';
    document.getElementById('room-empty').style.display = 'none';
    document.getElementById('inspiration-view').style.display = 'none';
    document.getElementById('dimensions-view').style.display = 'none';
    if (dimensionsViewActive) hideDimensionsView();
    if (document.getElementById('category-tabs')) document.getElementById('category-tabs').style.display = 'none';
    
    const dash = document.getElementById('budget-dashboard');
    dash.style.display = 'block';
    
    // Update header
    document.getElementById('room-title').textContent = '💰 Budget & Dépenses';
    document.getElementById('room-meta').textContent = `${allItems.length} éléments au total`;
    
    // Hide room action buttons
    document.querySelector('.room-actions').style.display = 'none';
    
    renderBudgetDashboard();
}

function hideBudgetDashboard() {
    budgetViewActive = false;
    document.getElementById('budget-dashboard').style.display = 'none';
    document.getElementById('btn-budget-view').classList.remove('active');
    document.querySelector('.room-actions').style.display = '';
}

// ─── EXPLORE PAGE ────────────────────────────────────────────

let exploreViewActive = false;

const EXPLORE_DATA = [
    { cat: 'Mobilier & Décoration', icon: '🛋️', color: '#C4704B', brands: [
        { name: 'Tikamoon', highlight: true, desc: 'Bois massif authentique', url: 'https://www.tikamoon.com', logo: 'T' },
        { name: 'Drawer', desc: 'Design scandinave français', url: 'https://www.drawer.fr', logo: 'D' },
        { name: 'Made.com', highlight: true, desc: 'Mid-century accessible', url: 'https://www.made.com/fr', logo: 'M' },
        { name: 'AM.PM', highlight: true, desc: 'Classiques revisités', url: 'https://www.ampm.fr', logo: 'A' },
        { name: 'Ethnicraft', desc: 'Chêne massif belge épuré', url: 'https://www.ethnicraft.com', logo: 'E' },
        { name: 'Kann Design', desc: 'Design français contemporain', url: 'https://www.kanndesign.com', logo: 'K' },
        { name: 'Red Edition', desc: 'Vintage coloré français', url: 'https://www.rededitionparis.com', logo: 'R' },
        { name: 'Moustache', desc: "Design d'auteur décalé", url: 'https://www.moustache.fr', logo: 'M' },
        { name: 'Colonel', desc: 'Artisanal français', url: 'https://www.colonel.fr', logo: 'C' },
        { name: 'MUSIC (ex Tiptoe)', desc: 'Mobilier modulaire', url: 'https://www.music.design', logo: 'T' },
        { name: 'Selency', highlight: true, desc: 'Vintage premium en ligne', url: 'https://www.selency.com', logo: 'S' },
        { name: 'Nordal', desc: 'Scandi brut', url: 'https://www.nordal.eu', logo: 'N' },
        { name: 'Westwing', highlight: true, desc: 'Ventes privées déco premium', url: 'https://www.westwing.fr', logo: 'W' },
        { name: 'Sklum', tag: 'new', desc: 'Design tendance prix doux', url: 'https://www.sklum.com/fr', logo: 'S' },
        { name: 'NortheDeco', tag: 'new', desc: 'Déco nordique contemporaine', url: 'https://www.northedeco.com', logo: 'N' },
    ]},
    { cat: 'Cuisine', icon: '🍳', color: '#8B6F47', brands: [
        { name: 'Plum', desc: 'D2C design, configurateur en ligne', url: 'https://www.plum.fr', logo: 'P' },
        { name: 'Schmidt', highlight: true, desc: 'Sur-mesure français', url: 'https://www.schmidt.com/fr', logo: 'S' },
        { name: 'Mobalpa', desc: 'Haut de gamme français', url: 'https://www.mobalpa.com', logo: 'M' },
        { name: 'IKEA', highlight: true, desc: 'Modularité imbattable', url: 'https://www.ikea.com/fr/fr/cat/cuisines-ka002/', logo: 'I' },
        { name: 'Nobilia', desc: 'Allemand bon rapport qualité/prix', url: 'https://www.nobilia.de/fr', logo: 'N' },
        { name: 'Häcker', desc: 'Premium allemand', url: 'https://www.haecker-kuechen.com/fr', logo: 'H' },
        { name: 'Bulthaup', highlight: true, desc: 'Ultra design allemand', url: 'https://www.bulthaup.com/fr', logo: 'B' },
        { name: 'Lapeyre', desc: 'Menuiserie et cuisines', url: 'https://www.lapeyre.fr/cuisine', logo: 'L' },
        { name: 'Leroy Merlin', desc: 'Aménagement complet', url: 'https://www.leroymerlin.fr/cuisine/', logo: 'L' },
        { name: 'SoCoo\'c', desc: 'Entrée de gamme design', url: 'https://www.socooc.com', logo: 'S' },
        { name: 'Cuisinella', desc: 'Milieu de gamme solide', url: 'https://www.cuisinella.com', logo: 'C' },
        { name: 'Nolte', desc: 'Contemporain allemand', url: 'https://www.nolte-kuechen.com/fr', logo: 'N' },
    ]},
    { cat: 'Salle de bain', icon: '🚿', color: '#5B9BD5', brands: [
        { name: 'Curbo', desc: 'D2C design, packages complets', url: 'https://www.curbo.fr', logo: 'C' },
        { name: 'Aubade', desc: 'Sanitaires haut de gamme', url: 'https://www.frenchdays.aubade.fr', logo: 'A' },
        { name: 'Hansgrohe', highlight: true, desc: 'Robinetterie design allemande', url: 'https://www.hansgrohe.fr', logo: 'H' },
        { name: 'Duravit', desc: 'Épuré allemand', url: 'https://www.duravit.fr', logo: 'D' },
        { name: 'Roca', desc: 'Contemporain espagnol', url: 'https://www.roca.fr', logo: 'R' },
        { name: 'Cielo', desc: 'Céramique italienne design', url: 'https://www.ceramicacielo.it/fr', logo: 'C' },
        { name: 'Agape', highlight: true, desc: 'Ultra premium italien', url: 'https://www.agapedesign.it', logo: 'A' },
        { name: 'Alape', desc: 'Vasques minimalistes', url: 'https://www.alape.com/fr', logo: 'A' },
        { name: 'Geberit', desc: 'Solutions encastrées suisses', url: 'https://www.geberit.fr', logo: 'G' },
        { name: 'Cristina Ondyna', desc: 'Robinetterie française design', url: 'https://www.cristina-ondyna.fr', logo: 'C' },
        { name: 'Richardson', desc: "Robinetterie d'architecte", url: 'https://www.richardson.fr', logo: 'R' },
        { name: 'Porcelanosa', desc: 'Mobilier + carrelage SDB', url: 'https://www.porcelanosa.com/fr', logo: 'P' },
        { name: 'Trône Paris', tag: 'new', desc: 'WC design français', url: 'https://www.trone-paris.com', logo: 'T' },
        { name: 'Tots', tag: 'new', desc: 'Robinetterie design française', url: 'https://www.tots.fr', logo: 'T' },
        { name: 'Reuter', tag: 'new', desc: 'Marketplace SDB premium', url: 'https://www.reuter.com/fr', logo: 'R' },
        { name: 'Talka Decor', tag: 'new', desc: 'Vasques et lavabos design', url: 'https://www.talkadecor.com', logo: 'T' },
        { name: 'Béton par Nature', tag: 'new', desc: 'Vasques béton artisanales', url: 'https://www.betonparnature.fr', logo: 'B' },
        { name: 'Bleu Provence', tag: 'new', desc: 'SDB provençale raffinée', url: 'https://www.bleuprovence.com', logo: 'B' },
        { name: 'Antonio Lupi', highlight: true, desc: 'Ultra design italien', url: 'https://www.antoniolupi.it', logo: 'A' },
        { name: 'Kreoo', tag: 'new', desc: 'Marbre et pierre design', url: 'https://www.kreoo.com', logo: 'K' },
        { name: 'VitrA', tag: 'new', desc: 'Sanitaires turcs innovants', url: 'https://www.vitra.com.tr/fr', logo: 'V' },
        { name: 'Rexa Design', tag: 'new', desc: 'Minimalisme italien SDB', url: 'https://www.rexadesign.it', logo: 'R' },
        { name: 'Disenia', tag: 'new', desc: 'Douches et parois design', url: 'https://www.disenia.it', logo: 'D' },
        { name: 'CEA Design', highlight: true, desc: 'Robinetterie architecturale', url: 'https://www.ceadesign.it', logo: 'C' },
        { name: 'Agostini', tag: 'new', desc: 'Robinetterie artisanale', url: 'https://www.agostini-robinetterie.com', logo: 'A' },
        { name: 'Sawiday', tag: 'new', desc: 'SDB design en ligne', url: 'https://www.sawiday.fr', logo: 'S' },
        { name: 'Dwelli', tag: 'new', desc: 'Aménagement SDB moderne', url: 'https://www.dwelli.com', logo: 'D' },
        { name: 'Nobili', tag: 'new', desc: 'Robinetterie italienne', url: 'https://www.nobili.it', logo: 'N' },
        { name: 'Falper', tag: 'new', desc: 'Vasques et meubles SDB luxe', url: 'https://www.falper.it', logo: 'F' },
        { name: 'Quadro Design', tag: 'new', desc: 'Accessoires inox design', url: 'https://www.quadrodesign.it', logo: 'Q' },
        { name: 'Mina', tag: 'new', desc: 'Robinetterie minimaliste', url: 'https://www.mina.it', logo: 'M' },
        { name: 'Baril Design', tag: 'new', desc: 'Robinetterie canadienne', url: 'https://www.barildesign.com', logo: 'B' },
    ]},
    { cat: 'Carrelage & céramique', icon: '◻️', color: '#9B8B7A', brands: [
        { name: 'Mutina', highlight: true, desc: 'Design italien Patricia Urquiola', url: 'https://www.mutina.it', logo: 'M' },
        { name: 'Marazzi', desc: 'Céramique italienne référence', url: 'https://www.marazzi.it/fr', logo: 'M' },
        { name: 'Porcelanosa', desc: 'Premium espagnol', url: 'https://www.porcelanosa.com/fr', logo: 'P' },
        { name: 'Emery & Cie', desc: 'Zellige artisanal belge', url: 'https://www.emeryetcie.com', logo: 'E' },
        { name: 'Popham Design', highlight: true, desc: 'Ciment marocain fait main', url: 'https://www.pophamdesign.com', logo: 'P' },
        { name: 'Zelij', desc: 'Zellige marocain authentique', url: 'https://www.zelij.com', logo: 'Z' },
        { name: 'Mosaic del Sur', desc: 'Carreaux ciment artisanaux', url: 'https://www.mosaicdelsur.com', logo: 'M' },
        { name: 'Equipe Ceramicas', desc: 'Formats originaux espagnols', url: 'https://www.equipeceramicas.com', logo: 'E' },
        { name: '41zero42', desc: 'Grès cérame italien créatif', url: 'https://www.41zero42.com', logo: '4' },
        { name: 'Bisazza', desc: 'Mosaïque luxe italienne', url: 'https://www.bisazza.com', logo: 'B' },
        { name: 'Carodeco', desc: 'Spécialiste carreaux ciment', url: 'https://www.carodeco.com', logo: 'C' },
        { name: 'Saint Maclou', desc: 'Parquet et sols', url: 'https://www.saint-maclou.com', logo: 'S' },
    ]},
    { cat: 'Luminaires', icon: '💡', color: '#E8A838', brands: [
        { name: 'Nedgis', highlight: true, desc: 'Sélection design pointue', url: 'https://www.nedgis.com', logo: 'N' },
        { name: 'DCW Éditions', highlight: true, desc: 'Lampe Gras, design français', url: 'https://www.dcw-editions.fr', logo: 'D' },
        { name: 'Serge Mouille', desc: 'Icônes mid-century', url: 'https://www.sergemouille.com', logo: 'S' },
        { name: 'Flos', highlight: true, desc: 'Classiques italiens', url: 'https://www.flos.com/fr', logo: 'F' },
        { name: 'Petite Friture', desc: 'Design français émergent', url: 'https://www.petitefriture.com', logo: 'P' },
        { name: 'Muuto', desc: 'Scandinave épuré', url: 'https://www.muuto.com', logo: 'M' },
        { name: 'Hay', desc: 'Danois accessible', url: 'https://www.hay.dk', logo: 'H' },
        { name: 'Foscarini', desc: 'Vénitien organique', url: 'https://www.foscarini.com', logo: 'F' },
        { name: 'CVL Luminaires', desc: 'Bronze artisanal français', url: 'https://www.cvl-luminaires.com', logo: 'C' },
        { name: 'Sammode', desc: 'Industriel français', url: 'https://www.sammode.com', logo: 'S' },
        { name: 'Forestier', desc: 'Rotin, bambou, naturel', url: 'https://www.forestier.fr', logo: 'F' },
        { name: 'Atelier Areti', desc: 'Minimalisme géométrique', url: 'https://www.atelier-areti.com', logo: 'A' },
    ]},
    { cat: 'Peinture & couleurs', icon: '🎨', color: '#6BAF6B', brands: [
        { name: 'Farrow & Ball', highlight: true, desc: 'Couleurs cultes anglaises', url: 'https://www.farrow-ball.com/fr', logo: 'F' },
        { name: 'Little Greene', desc: 'Patrimoine britannique', url: 'https://www.littlegreene.fr', logo: 'L' },
        { name: 'Ressource', highlight: true, desc: 'Artisanales françaises', url: 'https://www.ressource-peintures.com', logo: 'R' },
        { name: 'Argile', desc: 'Minérales naturelles', url: 'https://www.argile-peinture.com', logo: 'A' },
        { name: 'Flamant', desc: 'Belges sophistiquées', url: 'https://www.flamant.com', logo: 'F' },
        { name: 'Algo', desc: 'Biosourcée bretonne', url: 'https://www.algo-paint.com', logo: 'A' },
        { name: 'Pure & Paint', desc: 'Peintures saines françaises', url: 'https://www.pureandpaint.com', logo: 'P' },
        { name: 'Tollens', desc: 'Pro française', url: 'https://www.tollens.com', logo: 'T' },
        { name: 'Dulux Valentine', desc: 'Tendances annuelles', url: 'https://www.duluxvalentine.com', logo: 'D' },
        { name: 'Sikkens', desc: 'Finitions pro', url: 'https://www.sikkens.fr', logo: 'S' },
        { name: 'Unikalo', desc: 'Éco françaises', url: 'https://www.unikalo.com', logo: 'U' },
        { name: 'Colibri', desc: 'Naturelles artisanales', url: 'https://www.colibripeinture.com', logo: 'C' },
    ]},
    { cat: 'Textile & linge', icon: '🧶', color: '#C48BA0', brands: [
        { name: 'Caravane', highlight: true, desc: 'Lin artisanal haut de gamme', url: 'https://www.caravane.fr', logo: 'C' },
        { name: 'Merci Paris', desc: 'Lin brut lifestyle', url: 'https://www.merci-merci.com', logo: 'M' },
        { name: 'Linge Particulier', desc: 'Lin français direct usine', url: 'https://www.lingeparticulier.com', logo: 'L' },
        { name: 'Society Limonta', desc: 'Lin italien luxe', url: 'https://www.societylimonta.com', logo: 'S' },
        { name: 'Harmony Textile', desc: 'Lin lavé français', url: 'https://www.harmonytextile.com', logo: 'H' },
        { name: 'Maison de Vacances', desc: 'Bohème chic', url: 'https://www.maison-de-vacances.com', logo: 'M' },
        { name: 'Dedar', desc: "Tissus italiens architecte", url: 'https://www.dedar.com', logo: 'D' },
        { name: 'Pierre Frey', highlight: true, desc: 'Éditeur textile historique', url: 'https://www.pierrefrey.com', logo: 'P' },
        { name: 'Élitis', desc: 'Tissus muraux premium', url: 'https://www.elitis.fr', logo: 'É' },
        { name: 'Maison Sarah Lavoine', desc: 'Linge coloré parisien', url: 'https://www.maisonsarahlavoine.com', logo: 'S' },
        { name: 'Tensira', desc: 'Artisanal africain', url: 'https://www.tensira.com', logo: 'T' },
        { name: 'Les Toiles du Soleil', desc: 'Tissés catalans traditionnels', url: 'https://www.toiles-du-soleil.com', logo: 'T' },
    ]},
    { cat: 'Chiné & seconde main', icon: '♻️', color: '#7A9B6B', brands: [
        { name: 'Selency', desc: 'Brocante design en ligne', url: 'https://www.selency.com', logo: 'S' },
        { name: 'Vinterior', desc: 'Vintage européen curé', url: 'https://www.vinterior.co', logo: 'V' },
        { name: 'Pamono', desc: 'Vintage international premium', url: 'https://www.pamono.com', logo: 'P' },
        { name: 'Design Market', desc: 'Mobilier design vintage', url: 'https://www.designmarket.fr', logo: 'D' },
        { name: 'The Socialite Family', desc: 'Marketplace lifestyle', url: 'https://www.thesocialitefamily.com', logo: 'T' },
        { name: '1stDibs', desc: "Pièces d'exception", url: 'https://www.1stdibs.com', logo: '1' },
        { name: 'Chairish', desc: 'Vintage américain', url: 'https://www.chairish.com', logo: 'C' },
        { name: 'Marché aux Puces St-Ouen', desc: 'En ligne', url: 'https://www.marcheauxpuces-saintouen.com', logo: 'M' },
        { name: 'Galerie Gaudion', desc: 'Curiosités et ancien', url: 'https://www.galeriegaudion.com', logo: 'G' },
        { name: 'Le Bon Coin', desc: 'Trouvailles locales', url: 'https://www.leboncoin.fr/c/ameublement', logo: 'L' },
        { name: 'Emmaüs', desc: 'Trésors petits prix', url: 'https://www.label-emmaus.co', logo: 'E' },
        { name: 'Les Puces du Design', desc: 'Expos et ventes', url: 'https://www.pucesdudesign.com', logo: 'P' },
    ]},
];

let exploreFilter = 'all';

// ─── AFFILIATE SYSTEM ────────────────────────────────────────
const AFFILIATE_CONFIG = {
    awin: {
        publisherId: '',
        advertisers: {
            'IKEA': '', 'Maisons du Monde': '', 'La Redoute / AM.PM': '', 'AM.PM': '',
            'Made.com': '', 'Tikamoon': '', 'Conforama': '', 'BUT': '',
            'Castorama': '', 'ManoMano': '', 'Alinéa': '', 'Drawer': '',
            'Saint Maclou': '', 'Selency': '', 'Nedgis': '', 'Leroy Merlin': '',
            'Lapeyre': '', 'Cdiscount': '', 'Amazon': '',
        }
    },
    cj: { websiteId: '', advertisers: {} }
};

function buildAffiliateUrl(originalUrl, brandName) {
    if (!originalUrl) return originalUrl;
    const awinPubId = AFFILIATE_CONFIG.awin.publisherId;
    const awinAdvId = AFFILIATE_CONFIG.awin.advertisers[brandName];
    if (awinPubId && awinAdvId) {
        return `https://www.awin1.com/cread.php?awinmid=${awinAdvId}&awinaffid=${awinPubId}&ued=${encodeURIComponent(originalUrl)}`;
    }
    return originalUrl;
}

function trackAffClick(brand, category) {
    try {
        db.collection('affiliate_clicks').add({
            brand, category,
            userId: currentUser?.uid || 'anonymous',
            projectId: currentProject?.id || null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { /* silent */ }
}

function hasAffiliate(brandName) {
    const a = AFFILIATE_CONFIG.awin;
    return a.publisherId && a.advertisers[brandName];
}

function getItemAffiliateUrl(item) {
    if (!item.link) return null;
    return buildAffiliateUrl(item.link, item.supplier);
}

function showExplorePage() {
    if (!currentProject) return;
    exploreViewActive = true;
    if (budgetViewActive) hideBudgetDashboard();
    currentRoom = null;
    
    renderProjectSidebar();
    document.getElementById('btn-explore-view').classList.add('active');
    
    // Hide room content
    document.getElementById('items-grid').style.display = 'none';
    document.getElementById('moodboard-view').style.display = 'none';
    document.getElementById('room-empty').style.display = 'none';
    document.getElementById('budget-dashboard').style.display = 'none';
    document.getElementById('inspiration-view').style.display = 'none';
    document.getElementById('dimensions-view').style.display = 'none';
    if (dimensionsViewActive) hideDimensionsView();
    if (document.getElementById('category-tabs')) document.getElementById('category-tabs').style.display = 'none';
    
    document.getElementById('explore-page').style.display = 'block';
    
    document.getElementById('room-title').textContent = '🧭 Explorer';
    document.getElementById('room-meta').textContent = `${EXPLORE_DATA.reduce((s, c) => s + c.brands.length, 0)} marques dans ${EXPLORE_DATA.length} univers`;
    
    document.querySelector('.room-actions').style.display = 'none';
    
    renderExplorePage();
}

function hideExplorePage() {
    exploreViewActive = false;
    document.getElementById('explore-page').style.display = 'none';
    document.getElementById('btn-explore-view').classList.remove('active');
    document.querySelector('.room-actions').style.display = '';
}

function setExploreFilter(cat) {
    exploreFilter = cat;
    renderExplorePage();
}

function renderExplorePage() {
    const page = document.getElementById('explore-page');
    
    const categories = exploreFilter === 'all' ? EXPLORE_DATA : EXPLORE_DATA.filter(c => c.cat === exploreFilter);
    
    page.innerHTML = `
        <div class="explore-filters">
            <button class="explore-filter-btn ${exploreFilter === 'all' ? 'active' : ''}" onclick="setExploreFilter('all')">Tous</button>
            ${EXPLORE_DATA.map(c => `
                <button class="explore-filter-btn ${exploreFilter === c.cat ? 'active' : ''}" onclick="setExploreFilter('${c.cat}')" style="${exploreFilter === c.cat ? 'background:' + c.color + ';color:white;border-color:' + c.color : ''}">
                    ${c.icon} ${c.cat}
                </button>
            `).join('')}
        </div>
        
        ${categories.map(cat => `
            <div class="explore-category">
                <div class="explore-cat-header">
                    <span class="explore-cat-icon" style="background:${cat.color}">${cat.icon}</span>
                    <h3>${cat.cat}</h3>
                    <span class="explore-cat-count">${cat.brands.length} marques</span>
                </div>
                <div class="explore-grid">
                    ${cat.brands.map(b => {
                        const affUrl = buildAffiliateUrl(b.url, b.name);
                        const isHighlight = b.highlight;
                        const isNew = b.tag === 'new';
                        return `
                        <a href="${affUrl}" target="_blank" rel="noopener" class="explore-card${isHighlight ? ' explore-highlight' : ''}" onclick="trackAffClick('${escHtml(b.name)}', '${escHtml(cat.cat)}');event.stopPropagation()">
                            ${isNew ? '<span class="explore-badge-new">Nouveau</span>' : ''}
                            ${isHighlight ? '<span class="explore-badge-fav">★ Coup de cœur</span>' : ''}
                            <div class="explore-card-logo" style="background:${isHighlight ? cat.color + '22' : cat.color + '10'};color:${cat.color};${isHighlight ? 'font-size:1.1rem;width:44px;height:44px' : ''}">${b.logo}</div>
                            <div class="explore-card-info">
                                <span class="explore-card-name">${escHtml(b.name)}</span>
                                <span class="explore-card-desc">${escHtml(b.desc)}</span>
                            </div>
                            <svg class="explore-card-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
                        </a>`;
                    }).join('')}
                </div>
            </div>
        `).join('')}
    `;
}


// ─── MES ENVIES (WISHLIST) ───────────────────────────────────

let wishlistViewActive = false;

function toggleWishlist() {
    if (wishlistViewActive) {
        hideWishlist();
    } else {
        showWishlist();
    }
}

function showWishlist() {
    wishlistViewActive = true;
    if (budgetViewActive) hideBudgetDashboard();
    if (exploreViewActive) hideExplorePage();
    if (dimensionsViewActive) hideDimensionsView();
    document.getElementById('items-grid').style.display = 'none';
    document.getElementById('moodboard-view').style.display = 'none';
    document.getElementById('inspiration-view').style.display = 'none';
    document.getElementById('room-empty').style.display = 'none';
    if (document.getElementById('category-tabs')) document.getElementById('category-tabs').style.display = 'none';
    
    let wv = document.getElementById('wishlist-view');
    if (!wv) {
        wv = document.createElement('div');
        wv.id = 'wishlist-view';
        wv.className = 'wishlist-view';
        document.getElementById('items-grid').parentNode.appendChild(wv);
    }
    wv.style.display = 'block';
    loadWishlistItems();
}

function hideWishlist() {
    wishlistViewActive = false;
    const wv = document.getElementById('wishlist-view');
    if (wv) wv.style.display = 'none';
}

async function loadWishlistItems() {
    if (!currentProject) return;
    const wv = document.getElementById('wishlist-view');
    
    try {
        const snap = await db.collection('projects').doc(currentProject.id).collection('wishlist').orderBy('createdAt', 'desc').get();
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderWishlist(items);
    } catch (err) {
        console.error('Load wishlist error:', err);
        renderWishlist([]);
    }
}

function renderWishlist(items) {
    const wv = document.getElementById('wishlist-view');
    
    wv.innerHTML = `
        <div class="wishlist-header">
            <div>
                <h2>💫 Mes envies</h2>
                <p class="wishlist-subtitle">Sauvegardez vos coups de cœur — liens, photos, idées</p>
            </div>
            <button class="btn-primary-app" onclick="showAddWishlistModal()">+ Ajouter une envie</button>
        </div>
        ${items.length === 0 ? `
            <div class="wishlist-empty">
                <div class="wishlist-empty-icon">💫</div>
                <h3>Votre liste d'envies est vide</h3>
                <p>Ajoutez des liens vers vos produits préférés, des inspirations Pinterest, des posts Instagram...</p>
                <button class="btn-primary-app" onclick="showAddWishlistModal()">+ Première envie</button>
            </div>
        ` : `
            <div class="wishlist-grid">
                ${items.map(item => `
                    <div class="wishlist-card">
                        ${item.imageUrl ? `<div class="wishlist-card-img" style="background-image:url('${escHtml(item.imageUrl)}')"></div>` : `<div class="wishlist-card-placeholder">${item.emoji || '💫'}</div>`}
                        <div class="wishlist-card-body">
                            <h4>${escHtml(item.title)}</h4>
                            ${item.note ? `<p class="wishlist-note">${escHtml(item.note)}</p>` : ''}
                            ${item.price ? `<span class="wishlist-price">${item.price} €</span>` : ''}
                            ${item.link ? `<a href="${escHtml(item.link)}" target="_blank" rel="noopener" class="wishlist-link" onclick="event.stopPropagation()">🔗 Voir</a>` : ''}
                        </div>
                        <button class="wishlist-delete" onclick="deleteWishlistItem('${item.id}')" title="Supprimer">×</button>
                    </div>
                `).join('')}
            </div>
        `}
    `;
}

function showAddWishlistModal() {
    document.getElementById('wishlist-title').value = '';
    document.getElementById('wishlist-link').value = '';
    document.getElementById('wishlist-note').value = '';
    document.getElementById('wishlist-price').value = '';
    document.getElementById('modal-wishlist').classList.add('active');
}

async function saveWishlistItem(e) {
    e.preventDefault();
    const title = document.getElementById('wishlist-title').value.trim();
    if (!title) { toast('Ajoutez un titre'); return; }
    
    const btn = e.target.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    
    const link = document.getElementById('wishlist-link').value.trim();
    const note = document.getElementById('wishlist-note').value.trim();
    const price = document.getElementById('wishlist-price').value.trim();
    
    // Try to detect an image from the link (Open Graph)
    let imageUrl = '';
    let emoji = '💫';
    
    // Assign emoji based on link domain
    if (link) {
        if (link.includes('pinterest')) emoji = '📌';
        else if (link.includes('instagram')) emoji = '📸';
        else if (link.includes('ikea')) emoji = '🏠';
        else if (link.includes('etsy')) emoji = '🎨';
        else emoji = '🔗';
    }
    
    try {
        await db.collection('projects').doc(currentProject.id).collection('wishlist').add({
            title, link, note,
            price: price ? parseFloat(price) : null,
            emoji, imageUrl,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModalById('modal-wishlist');
        toast('Envie ajoutée ! 💫');
        loadWishlistItems();
    } catch (err) {
        console.error('Save wishlist error:', err);
        toast('Erreur lors de la sauvegarde');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function deleteWishlistItem(id) {
    if (!confirm('Supprimer cette envie ?')) return;
    try {
        await db.collection('projects').doc(currentProject.id).collection('wishlist').doc(id).delete();
        toast('Envie supprimée');
        loadWishlistItems();
    } catch (err) {
        console.error('Delete wishlist error:', err);
        toast('Erreur');
    }
}

function renderBudgetDashboard() {
    const dash = document.getElementById('budget-dashboard');
    const rooms = currentProject.rooms || [];
    const totalBudget = allItems.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
    
    // Per-room breakdown
    const roomBreakdown = rooms.map((r, i) => {
        const roomItems = allItems.filter(item => item.roomIndex === i);
        const total = roomItems.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
        const paid = roomItems.filter(it => it.status === 'installed' || it.status === 'delivered')
            .reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
        const planned = roomItems.filter(it => it.status === 'planned' || !it.status)
            .reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
        return { name: r.name, icon: r.icon || '🏠', total, paid, planned, count: roomItems.length };
    }).filter(r => r.count > 0);
    
    const maxRoomBudget = Math.max(...roomBreakdown.map(r => r.total), 1);
    
    // Per-category breakdown
    const catMap = {};
    allItems.forEach(item => {
        const cat = item.category || 'Autre';
        if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 };
        catMap[cat].total += (item.price || 0) * (item.qty || 1);
        catMap[cat].count++;
    });
    const catBreakdown = Object.entries(catMap)
        .map(([name, d]) => ({ name, ...d, emoji: getCategoryEmoji(name) }))
        .sort((a, b) => b.total - a.total);
    
    // Status breakdown
    const statusMap = { planned: 0, ordered: 0, delivered: 0, installed: 0 };
    const statusCount = { planned: 0, ordered: 0, delivered: 0, installed: 0 };
    allItems.forEach(item => {
        const st = item.status || 'planned';
        const amount = (item.price || 0) * (item.qty || 1);
        if (statusMap[st] !== undefined) { statusMap[st] += amount; statusCount[st]++; }
    });
    const totalPaid = statusMap.delivered + statusMap.installed;
    const totalPending = statusMap.planned + statusMap.ordered;
    
    // PaidBy breakdown
    const payerMap = {};
    allItems.forEach(item => {
        if (!item.paidBy) return;
        const amount = (item.price || 0) * (item.qty || 1);
        if (!payerMap[item.paidBy]) payerMap[item.paidBy] = 0;
        payerMap[item.paidBy] += amount;
    });
    const payerBreakdown = Object.entries(payerMap).sort((a, b) => b[1] - a[1]);
    
    dash.innerHTML = `
        <!-- KPI Cards -->
        <div class="budget-kpis">
            <div class="budget-kpi">
                <div class="budget-kpi-label">Budget total estimé</div>
                <div class="budget-kpi-value">${formatPrice(totalBudget)}</div>
            </div>
            <div class="budget-kpi kpi-green">
                <div class="budget-kpi-label">Dépensé (livré + installé)</div>
                <div class="budget-kpi-value">${formatPrice(totalPaid)}</div>
                <div class="budget-kpi-pct">${totalBudget ? Math.round(totalPaid / totalBudget * 100) : 0}%</div>
            </div>
            <div class="budget-kpi kpi-orange">
                <div class="budget-kpi-label">Restant (à acheter + commandé)</div>
                <div class="budget-kpi-value">${formatPrice(totalPending)}</div>
                <div class="budget-kpi-pct">${totalBudget ? Math.round(totalPending / totalBudget * 100) : 0}%</div>
            </div>
            <div class="budget-kpi kpi-blue">
                <div class="budget-kpi-label">Éléments</div>
                <div class="budget-kpi-value">${allItems.length}</div>
                <div class="budget-kpi-pct">${rooms.length} pièces</div>
            </div>
        </div>

        <!-- Progress Bar -->
        <div class="budget-section">
            <h3>Avancement global</h3>
            <div class="budget-progress-bar">
                <div class="budget-progress-segment" style="width:${totalBudget ? (statusMap.installed / totalBudget * 100) : 0}%; background:#6BAF6B" title="Installé: ${formatPrice(statusMap.installed)}"></div>
                <div class="budget-progress-segment" style="width:${totalBudget ? (statusMap.delivered / totalBudget * 100) : 0}%; background:#5B9BD5" title="Livré: ${formatPrice(statusMap.delivered)}"></div>
                <div class="budget-progress-segment" style="width:${totalBudget ? (statusMap.ordered / totalBudget * 100) : 0}%; background:#E8A838" title="Commandé: ${formatPrice(statusMap.ordered)}"></div>
                <div class="budget-progress-segment" style="width:${totalBudget ? (statusMap.planned / totalBudget * 100) : 0}%; background:#DDD" title="À acheter: ${formatPrice(statusMap.planned)}"></div>
            </div>
            <div class="budget-progress-legend">
                <span><i style="background:#6BAF6B"></i> Installé (${statusCount.installed})</span>
                <span><i style="background:#5B9BD5"></i> Livré (${statusCount.delivered})</span>
                <span><i style="background:#E8A838"></i> Commandé (${statusCount.ordered})</span>
                <span><i style="background:#DDD;border:1px solid #CCC"></i> À acheter (${statusCount.planned})</span>
            </div>
        </div>

        <!-- Room Breakdown -->
        <div class="budget-section">
            <h3>Budget par pièce</h3>
            <div class="budget-room-bars">
                ${roomBreakdown.map(r => `
                    <div class="budget-room-row">
                        <div class="budget-room-label">
                            <span>${r.icon} ${escHtml(r.name)}</span>
                            <span class="budget-room-amount">${formatPrice(r.total)}</span>
                        </div>
                        <div class="budget-bar-track">
                            <div class="budget-bar-fill" style="width:${(r.total / maxRoomBudget * 100)}%">
                                <div class="budget-bar-paid" style="width:${r.total ? (r.paid / r.total * 100) : 0}%"></div>
                            </div>
                        </div>
                        <div class="budget-room-detail">
                            ${r.paid > 0 ? `<span class="budget-detail-paid">${formatPrice(r.paid)} dépensé</span>` : ''}
                            ${r.planned > 0 ? `<span class="budget-detail-planned">${formatPrice(r.planned)} à prévoir</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Category + Payer side by side -->
        <div class="budget-columns">
            <div class="budget-section">
                <h3>Par catégorie</h3>
                <div class="budget-cat-list">
                    ${catBreakdown.map(c => `
                        <div class="budget-cat-row">
                            <span class="budget-cat-emoji">${c.emoji}</span>
                            <span class="budget-cat-name">${escHtml(c.name)}</span>
                            <span class="budget-cat-count">${c.count}</span>
                            <span class="budget-cat-amount">${formatPrice(c.total)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="budget-section">
                <h3>Qui paye quoi</h3>
                ${payerBreakdown.length > 0 ? `
                    <div class="budget-payer-list">
                        ${payerBreakdown.map(([name, amount]) => `
                            <div class="budget-payer-row">
                                <div class="budget-payer-avatar">${name === 'commun' ? '👥' : name.charAt(0).toUpperCase()}</div>
                                <span class="budget-payer-name">${name === 'commun' ? 'Dépenses communes' : escHtml(name)}</span>
                                <span class="budget-payer-amount">${formatPrice(amount)}</span>
                            </div>
                        `).join('')}
                        ${payerBreakdown.length >= 2 ? renderPayerBalance(payerBreakdown) : ''}
                    </div>
                ` : `
                    <div class="budget-empty-payer">
                        <p>Assignez un payeur à vos éléments pour suivre qui paye quoi.</p>
                    </div>
                `}
            </div>
        </div>

        <!-- Recent items needing attention -->
        <div class="budget-section">
            <h3>À acheter prochainement</h3>
            ${renderBudgetItemList(allItems.filter(i => !i.status || i.status === 'planned').sort((a, b) => ((b.price || 0) * (b.qty || 1)) - ((a.price || 0) * (a.qty || 1))).slice(0, 8))}
        </div>
    `;
}

function renderPayerBalance(payerBreakdown) {
    // Simple 2-person balance
    const nonCommon = payerBreakdown.filter(([name]) => name !== 'commun');
    if (nonCommon.length < 2) return '';
    
    const commonTotal = payerBreakdown.find(([name]) => name === 'commun')?.[1] || 0;
    const halfCommon = commonTotal / 2;
    
    // Each person's fair share = their direct items + half of common
    const totals = nonCommon.map(([name, amount]) => ({ name, paid: amount + halfCommon }));
    const avg = totals.reduce((s, t) => s + t.paid, 0) / totals.length;
    
    const balances = totals.map(t => ({ name: t.name, diff: t.paid - avg }));
    const owes = balances.find(b => b.diff < 0);
    const owed = balances.find(b => b.diff > 0);
    
    if (!owes || !owed || Math.abs(owes.diff) < 1) return '';
    
    return `
        <div class="budget-balance">
            <div class="budget-balance-text">
                <strong>${escHtml(owes.name)}</strong> doit <strong>${formatPrice(Math.abs(owes.diff))}</strong> à <strong>${escHtml(owed.name)}</strong>
            </div>
        </div>
    `;
}

function renderBudgetItemList(items) {
    if (items.length === 0) return '<p class="budget-empty-payer">Tous les éléments sont commandés ou installés 🎉</p>';
    return `<div class="budget-item-list">
        ${items.map(item => {
            const room = currentProject.rooms[item.roomIndex];
            const amount = (item.price || 0) * (item.qty || 1);
            return `
                <div class="budget-item-row" onclick="selectRoom(${item.roomIndex})">
                    <span class="budget-item-emoji">${getCategoryEmoji(item.category)}</span>
                    <div class="budget-item-info">
                        <span class="budget-item-name">${escHtml(item.name)}</span>
                        <span class="budget-item-room">${room ? (room.icon || '🏠') + ' ' + room.name : ''} ${item.supplier ? '· ' + escHtml(item.supplier) : ''}</span>
                    </div>
                    <span class="budget-item-amount">${formatPrice(amount)}</span>
                </div>
            `;
        }).join('')}
    </div>`;
}

function formatPrice(n) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function generateShareId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// ─── PROJECT TEMPLATES ────────────────────────────────────────

const PROJECT_TEMPLATES = {
    studio: { name: 'Studio 25m²', surface: 25, rooms: [
        { name: 'Pièce principale', icon: '🛋️', surface: 18 },
        { name: 'Salle de bain', icon: '🚿', surface: 3 },
        { name: 'Cuisine', icon: '🍳', surface: 4 },
    ]},
    t2: { name: 'T2 40m²', surface: 40, rooms: [
        { name: 'Salon', icon: '🛋️', surface: 16 },
        { name: 'Chambre', icon: '🛏️', surface: 12 },
        { name: 'Cuisine', icon: '🍳', surface: 6 },
        { name: 'Salle de bain', icon: '🚿', surface: 4 },
        { name: 'Entrée', icon: '🚪', surface: 2 },
    ]},
    t3: { name: 'T3 famille 65m²', surface: 65, rooms: [
        { name: 'Salon', icon: '🛋️', surface: 22 },
        { name: 'Cuisine', icon: '🍳', surface: 10 },
        { name: 'Chambre parentale', icon: '🛏️', surface: 14 },
        { name: 'Chambre enfant', icon: '🧒', surface: 10 },
        { name: 'Salle de bain', icon: '🚿', surface: 5 },
        { name: 'Entrée', icon: '🚪', surface: 3 },
    ]},
    t4: { name: 'T4+ maison 100m²', surface: 100, rooms: [
        { name: 'Salon', icon: '🛋️', surface: 25 },
        { name: 'Cuisine', icon: '🍳', surface: 14 },
        { name: 'Salle à manger', icon: '🍽️', surface: 12 },
        { name: 'Chambre parentale', icon: '🛏️', surface: 15 },
        { name: 'Chambre enfant 1', icon: '🧒', surface: 11 },
        { name: 'Chambre enfant 2', icon: '🧒', surface: 10 },
        { name: 'Salle de bain', icon: '🚿', surface: 6 },
        { name: 'Bureau', icon: '💻', surface: 8 },
        { name: 'Entrée', icon: '🚪', surface: 4 },
        { name: 'Terrasse', icon: '🌿', surface: null },
    ]},
    loft: { name: 'Loft open-space', surface: 80, rooms: [
        { name: 'Espace de vie', icon: '🛋️', surface: 45 },
        { name: 'Mezzanine', icon: '🛏️', surface: 15 },
        { name: 'Salle de bain', icon: '🚿', surface: 6 },
        { name: 'Dressing', icon: '👔', surface: 5 },
        { name: 'Entrée', icon: '🚪', surface: 3 },
    ]}
};

let selectedTemplate = null;

function applyTemplate(key) {
    selectedTemplate = key;
    const nameInput = document.getElementById('project-input-name');
    const surfaceInput = document.getElementById('project-input-surface');
    const roomChips = document.getElementById('room-chips');
    
    if (!key) {
        if (!nameInput.dataset.userEdited) nameInput.value = '';
        surfaceInput.value = '';
        roomChips.style.display = '';
        document.querySelectorAll('#room-chips input').forEach((cb, i) => cb.checked = i < 3);
        return;
    }
    
    const t = PROJECT_TEMPLATES[key];
    if (!t) return;
    if (!nameInput.value || !nameInput.dataset.userEdited) nameInput.value = t.name;
    surfaceInput.value = t.surface;
    roomChips.style.display = 'none';
    document.querySelectorAll('#room-chips input').forEach(cb => cb.checked = false);
}

// ─── PUBLIC SHARE ────────────────────────────────────────────

function shareProject() {
    if (!currentProject) return;
    const base = `${window.location.origin}${window.location.pathname}`;
    document.getElementById('share-link').value = `${base}?share=${currentProject.shareId}`;
    document.getElementById('share-link-public').value = `${base}?view=${currentProject.shareId}`;
    document.getElementById('modal-share').classList.add('active');
}

function copyPublicLink() {
    const input = document.getElementById('share-link-public');
    input.select();
    navigator.clipboard.writeText(input.value);
    const el = document.getElementById('share-public-copied');
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 2000);
}

async function loadPublicView(shareId) {
    try {
        const snap = await db.collection('projects').where('shareId', '==', shareId).limit(1).get();
        if (snap.empty) {
            document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--cream);font-family:var(--font-body)"><div style="text-align:center;padding:2rem"><h1 style="font-family:var(--font-display);font-size:2rem;margin-bottom:0.5rem">Projet introuvable</h1><p style="color:var(--deep-brown);opacity:0.6">Ce lien de partage n'est plus valide.</p><a href="/" style="display:inline-block;margin-top:1rem;background:var(--terracotta);color:white;padding:0.6rem 1.4rem;border-radius:var(--radius-full);text-decoration:none">Découvrir Cocon</a></div></div>`;
            return;
        }
        const doc = snap.docs[0];
        const project = { id: doc.id, ...doc.data() };
        const itemsSnap = await db.collection('projects').doc(project.id).collection('items').get();
        const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPublicView(project, items);
    } catch (err) {
        console.error('Public view error:', err);
    }
}

function renderPublicView(project, items) {
    const total = items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
    const rooms = project.rooms || [];
    
    let roomsHtml = '';
    rooms.forEach((room, ri) => {
        const ri_items = items.filter(i => i.roomIndex === ri);
        if (ri_items.length === 0) return;
        roomsHtml += `<div style="margin-bottom:2rem"><h2 style="font-family:var(--font-display);font-size:1.2rem;color:var(--charcoal);margin-bottom:1rem">${room.icon || '🏠'} ${escHtml(room.name)}${room.surface ? ` <span style="font-weight:400;font-size:0.8rem;opacity:0.5">${room.surface} m²</span>` : ''}</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem">`;
        ri_items.forEach(item => {
            roomsHtml += `<div style="background:white;border-radius:12px;overflow:hidden;border:1px solid var(--border)">${item.imageUrl ? `<div style="aspect-ratio:4/3;background:url(${escHtml(item.imageUrl)}) center/cover"></div>` : `<div style="aspect-ratio:4/3;background:var(--warm-white);display:flex;align-items:center;justify-content:center;font-size:2rem">${getCategoryEmoji(item.category)}</div>`}<div style="padding:0.7rem"><div style="font-weight:600;font-size:0.82rem;color:var(--charcoal)">${escHtml(item.name)}</div>${item.supplier ? `<div style="font-size:0.72rem;color:var(--deep-brown);opacity:0.5">${escHtml(item.supplier)}</div>` : ''}${item.price ? `<div style="font-size:0.82rem;color:var(--terracotta);font-weight:600;margin-top:0.3rem">${formatPrice(item.price * (item.qty || 1))}</div>` : ''}${item.status ? `<div style="font-size:0.68rem;margin-top:0.2rem;opacity:0.5">${{'planned':'📋 Prévu','ordered':'📦 Commandé','delivered':'✅ Livré','installed':'🏠 Installé'}[item.status] || item.status}</div>` : ''}</div></div>`;
        });
        roomsHtml += '</div></div>';
    });
    
    document.body.innerHTML = `<div style="min-height:100vh;background:var(--cream);font-family:var(--font-body)"><nav style="background:white;border-bottom:1px solid var(--cream);padding:0.8rem 2rem;display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:1rem"><span style="font-family:var(--font-display);font-size:1.3rem;color:var(--charcoal)">cocon<span style="color:var(--terracotta)">.</span></span><span style="font-size:0.78rem;background:var(--warm-white);padding:0.2rem 0.6rem;border-radius:var(--radius-full);color:var(--deep-brown)">👁️ Vue publique</span></div><a href="/" style="font-size:0.78rem;color:var(--terracotta);text-decoration:none">Créer mon projet →</a></nav><main style="max-width:1000px;margin:2rem auto;padding:0 1.5rem"><div style="margin-bottom:2rem"><h1 style="font-family:var(--font-display);font-size:1.8rem;color:var(--charcoal)">${escHtml(project.name)}</h1><p style="font-size:0.85rem;color:var(--deep-brown);opacity:0.6">${project.surface ? project.surface + ' m² • ' : ''}${project.style || ''} • ${items.length} élément${items.length > 1 ? 's' : ''} • ${formatPrice(total)}</p></div>${roomsHtml}<div style="text-align:center;padding:3rem 0;border-top:1px solid var(--border);margin-top:2rem"><p style="font-size:0.82rem;color:var(--deep-brown);opacity:0.4">Partagé via Cocon — l'outil gratuit pour organiser vos projets déco</p><a href="/" style="display:inline-block;margin-top:0.8rem;background:var(--terracotta);color:white;padding:0.5rem 1.2rem;border-radius:var(--radius-full);text-decoration:none;font-size:0.82rem">Créer mon projet gratuitement</a></div></main></div>`;
    const loader = document.getElementById('loading-screen');
    if (loader) loader.remove();
}

// ─── FORGOT PASSWORD ─────────────────────────────────────────

async function forgotPassword(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    if (!email) { showAuthError('Entrez votre email pour réinitialiser.'); return; }
    try {
        await auth.sendPasswordResetEmail(email);
        showAuthError('');
        toast('Email de réinitialisation envoyé ! Vérifiez votre boîte mail.');
    } catch (err) {
        showAuthError(err.code === 'auth/user-not-found' ? 'Aucun compte avec cet email.' : err.message);
    }
}

// ─── DELETE ACCOUNT ──────────────────────────────────────────

function showDeleteAccountModal() {
    document.getElementById('delete-account-confirm').value = '';
    document.getElementById('modal-delete-account').classList.add('active');
}

async function deleteAccount() {
    if (document.getElementById('delete-account-confirm').value.trim() !== 'SUPPRIMER') {
        toast('Tapez SUPPRIMER pour confirmer'); return;
    }
    if (!currentUser) return;
    toast('Suppression en cours...');
    try {
        const projectsSnap = await db.collection('projects').where('ownerId', '==', currentUser.uid).get();
        for (const projectDoc of projectsSnap.docs) {
            for (const sub of ['items', 'comments', 'postits', 'measures', 'plans']) {
                const subSnap = await db.collection('projects').doc(projectDoc.id).collection(sub).get();
                if (subSnap.docs.length > 0) {
                    const batch = db.batch();
                    subSnap.docs.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
            }
            await db.collection('projects').doc(projectDoc.id).delete();
        }
        try { await db.collection('users').doc(currentUser.uid).delete(); } catch (e) {}
        await currentUser.delete();
        toast('Compte supprimé. Au revoir !');
        closeModalById('modal-delete-account');
        showScreen('auth-screen');
    } catch (err) {
        console.error('Delete account error:', err);
        toast(err.code === 'auth/requires-recent-login' ? 'Reconnectez-vous puis réessayez.' : 'Erreur, réessayez.');
    }
}

// ─── EXPORT DATA (RGPD) ─────────────────────────────────────

async function exportAllData() {
    if (!currentUser) return;
    toast('Export en cours...');
    try {
        const data = { exportDate: new Date().toISOString(), user: { uid: currentUser.uid, email: currentUser.email, displayName: currentUser.displayName }, projects: [] };
        const projectsSnap = await db.collection('projects').where('ownerId', '==', currentUser.uid).get();
        for (const pd of projectsSnap.docs) {
            const p = { id: pd.id, ...pd.data(), items: [], postits: [], measures: [], plans: [] };
            for (const [sub, arr] of [['items','items'],['postits','postits'],['measures','measures'],['plans','plans']]) {
                const s = await db.collection('projects').doc(pd.id).collection(sub).get();
                p[arr] = s.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            data.projects.push(p);
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `cocon-export-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Données exportées !');
    } catch (err) {
        console.error('Export error:', err);
        toast('Erreur lors de l\'export');
    }
}

// ─── FEEDBACK PANEL ────────────────────────────────────────

function getCurrentPage() {
    if (document.getElementById('project-screen')?.style.display !== 'none') return 'projet';
    if (document.getElementById('dashboard-screen')?.style.display !== 'none') return 'tableau-de-bord';
    return 'app';
}

function toggleFeedbackPanel() {
    const panel = document.getElementById('feedback-panel');
    if (!panel) return;
    panel.classList.contains('open') ? closeFeedbackPanel() : openFeedbackPanel();
}

function openFeedbackPanel() {
    const panel = document.getElementById('feedback-panel');
    if (!panel) return;
    panel.classList.add('open');
    setTimeout(() => { const ta = document.getElementById('fb-message'); if (ta) ta.focus(); }, 80);
}

function closeFeedbackPanel() {
    const panel = document.getElementById('feedback-panel');
    if (!panel) return;
    panel.classList.remove('open');
    const body = document.getElementById('fb-panel-body');
    const success = document.getElementById('fb-success');
    const errEl = document.getElementById('fb-error');
    const ta = document.getElementById('fb-message');
    const count = document.getElementById('fb-char-count');
    const btn = document.getElementById('fb-submit-btn');
    if (body) body.style.display = '';
    if (success) success.style.display = 'none';
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (ta) ta.value = '';
    if (count) count.textContent = '0';
    if (btn) btn.disabled = false;
    const firstType = document.querySelector('input[name="fb-type"]');
    if (firstType) firstType.checked = true;
}

async function sendFeedback(e) {
    e.preventDefault();
    if (!currentUser) return;
    const ta = document.getElementById('fb-message');
    const message = ta ? ta.value.trim() : '';
    const errEl = document.getElementById('fb-error');
    if (message.length < 10) {
        if (errEl) { errEl.textContent = 'Le message doit contenir au moins 10 caractères.'; errEl.style.display = 'block'; }
        return;
    }
    const type = document.querySelector('input[name="fb-type"]:checked')?.value || 'question';
    const btn = document.getElementById('fb-submit-btn');
    if (errEl) errEl.style.display = 'none';
    if (btn) btn.disabled = true;
    try {
        await db.collection('feedback').add({
            uid: currentUser.uid,
            email: currentUser.email || '',
            type,
            message,
            page: getCurrentPage(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'nouveau'
        });
        const body = document.getElementById('fb-panel-body');
        const success = document.getElementById('fb-success');
        if (body) body.style.display = 'none';
        if (success) success.style.display = 'block';
        setTimeout(closeFeedbackPanel, 3000);
    } catch (error) {
        console.error('Feedback error:', error);
        if (errEl) { errEl.textContent = 'Erreur lors de l\'envoi. Veuillez réessayer.'; errEl.style.display = 'block'; }
        if (btn) btn.disabled = false;
    }
}
// ─── ONBOARDING ──────────────────────────────────────────────

function checkOnboarding() {
    if (localStorage.getItem('cocon-onboarded')) return;
    setTimeout(() => {
        if (document.getElementById('onboarding-tips')) return;
        const ov = document.createElement('div');
        ov.id = 'onboarding-tips';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(26,23,20,0.5);z-index:999;display:flex;align-items:center;justify-content:center';
        ov.innerHTML = `<div style="background:white;border-radius:16px;padding:2rem;max-width:480px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.2)"><h2 style="font-family:var(--font-display);font-size:1.5rem;margin-bottom:0.5rem">Bienvenue sur Cocon ! 🏠</h2><p style="color:var(--deep-brown);font-size:0.85rem;margin-bottom:1.5rem">Voici comment tirer le meilleur de votre espace :</p><div style="display:flex;flex-direction:column;gap:0.8rem;margin-bottom:1.5rem"><div style="display:flex;gap:0.6rem;align-items:start"><span style="font-size:1.2rem;flex-shrink:0">🛋️</span><div><strong style="font-size:0.82rem">Pièces & Items</strong><br><span style="font-size:0.78rem;color:var(--deep-brown);opacity:0.7">Cliquez sur une pièce, puis "+ Ajouter" pour vos items.</span></div></div><div style="display:flex;gap:0.6rem;align-items:start"><span style="font-size:1.2rem;flex-shrink:0">✨</span><div><strong style="font-size:0.82rem">Inspiration & Post-its</strong><br><span style="font-size:0.78rem;color:var(--deep-brown);opacity:0.7">Onglet "Inspiration" pour photos d'inspo et notes.</span></div></div><div style="display:flex;gap:0.6rem;align-items:start"><span style="font-size:1.2rem;flex-shrink:0">📐</span><div><strong style="font-size:0.82rem">Plans & Dimensions</strong><br><span style="font-size:0.78rem;color:var(--deep-brown);opacity:0.7">Uploadez vos plans et notez les mesures cotées.</span></div></div><div style="display:flex;gap:0.6rem;align-items:start"><span style="font-size:1.2rem;flex-shrink:0">💰</span><div><strong style="font-size:0.82rem">Budget en temps réel</strong><br><span style="font-size:0.78rem;color:var(--deep-brown);opacity:0.7">Tableau de bord budget dans la sidebar.</span></div></div><div style="display:flex;gap:0.6rem;align-items:start"><span style="font-size:1.2rem;flex-shrink:0">🔗</span><div><strong style="font-size:0.82rem">Smart Link</strong><br><span style="font-size:0.78rem;color:var(--deep-brown);opacity:0.7">Collez un lien produit, les champs se remplissent seuls.</span></div></div></div><button onclick="dismissOnboarding()" style="width:100%;padding:0.7rem;background:var(--terracotta);color:white;border:none;border-radius:var(--radius-full);font-size:0.88rem;font-weight:600;cursor:pointer">C'est parti ! 🚀</button></div>`;
        document.body.appendChild(ov);
    }, 800);
}

function dismissOnboarding() {
    localStorage.setItem('cocon-onboarded', '1');
    const el = document.getElementById('onboarding-tips');
    if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// ─── COLLAB BANNER ───────────────────────────────────────────

function dismissCollabBanner() {
    const banner = document.getElementById('collab-banner');
    banner.style.transition = 'all 0.3s ease';
    banner.style.opacity = '0';
    banner.style.maxHeight = '0';
    banner.style.padding = '0';
    banner.style.margin = '0';
    banner.style.overflow = 'hidden';
    setTimeout(() => banner.style.display = 'none', 300);
    if (currentProject) {
        localStorage.setItem('collab_banner_dismissed_' + currentProject.id, 'true');
    }
}

function checkCollabBanner() {
    const banner = document.getElementById('collab-banner');
    const sharedBanner = document.getElementById('shared-banner');
    if (!currentProject) return;

    if (isSharedView) {
        // Guest viewing shared project
        if (banner) banner.style.display = 'none';
        if (sharedBanner) sharedBanner.style.display = 'flex';
    } else {
        // Owner viewing their own project
        if (sharedBanner) sharedBanner.style.display = 'none';
        if (banner) {
            const dismissed = localStorage.getItem('collab_banner_dismissed_' + currentProject.id);
            banner.style.display = dismissed ? 'none' : 'flex';
        }
    }
}

// ─── SUBCATEGORIES ───────────────────────────────────────────

const SUBCATEGORIES = {
    'Mobilier': ['Canapé', 'Fauteuil', 'Table', 'Chaise', 'Bureau', 'Lit', 'Étagère', 'Meuble TV', 'Commode', 'Table basse', 'Table de chevet', 'Banc', 'Tabouret', 'Autre'],
    'Luminaire': ['Suspension', 'Lampadaire', 'Lampe à poser', 'Applique murale', 'Spot', 'Plafonnier', 'Guirlande', 'LED', 'Autre'],
    'Textile': ['Rideau', 'Coussin', 'Tapis', 'Plaid', 'Linge de lit', 'Nappe', 'Serviette', 'Store', 'Autre'],
    'Décoration': ['Cadre', 'Miroir', 'Vase', 'Bougie', 'Horloge', 'Sculpture', 'Plante', 'Poster', 'Autre'],
    'Peinture': ['Mur', 'Plafond', 'Boiserie', 'Radiateur', 'Façade', 'Sous-couche', 'Finition', 'Autre'],
    'Revêtement sol': ['Carrelage', 'Parquet', 'Vinyle / PVC', 'Béton ciré', 'Moquette', 'Jonc de mer', 'Tomette', 'Résine', 'Autre'],
    'Revêtement mur': ['Carrelage mural', 'Faïence', 'Papier peint', 'Crépi', 'Lambris', 'Pierre de parement', 'Enduit', 'Autre'],
    'Électroménager': ['Réfrigérateur', 'Four', 'Plaque de cuisson', 'Lave-vaisselle', 'Hotte', 'Micro-ondes', 'Lave-linge', 'Sèche-linge', 'Autre'],
    'Rangement': ['Placard', 'Dressing', 'Étagère', 'Panier', 'Boîte', 'Crochets', 'Organisateur', 'Autre'],
    'Plomberie': ['Robinet', 'Douche', 'Baignoire', 'Lavabo', 'WC', 'Mitigeur', 'Colonne de douche', 'Sèche-serviette', 'Autre'],
    'Menuiserie': ['Porte', 'Fenêtre', 'Poignée', 'Plan de travail', 'Crédence', 'Plinthe', 'Moulure', 'Autre']
};

function updateSubcategoryOptions(preselect) {
    const cat = document.getElementById('item-input-category').value;
    const subRow = document.getElementById('subcategory-row');
    const subSelect = document.getElementById('item-input-subcategory');

    if (SUBCATEGORIES[cat]) {
        subRow.style.display = 'flex';
        subSelect.innerHTML = '<option value="">—</option>' +
            SUBCATEGORIES[cat].map(s => `<option${preselect === s ? ' selected' : ''}>${s}</option>`).join('');
    } else {
        subRow.style.display = 'none';
        subSelect.innerHTML = '<option value="">—</option>';
    }
}

// ─── VIEW MODE (GRID / MOODBOARD) ───────────────────────────

let currentViewMode = 'grid';

function setViewMode(mode) {
    currentViewMode = mode;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === mode));

    const grid = document.getElementById('items-grid');
    const moodboard = document.getElementById('moodboard-view');
    const categoryTabs = document.getElementById('category-tabs');

    if (mode === 'grid') {
        grid.style.display = 'grid';
        moodboard.style.display = 'none';
        if (categoryTabs) categoryTabs.style.display = 'flex';
    } else {
        grid.style.display = 'none';
        moodboard.style.display = 'block';
        if (categoryTabs) categoryTabs.style.display = 'none';
        renderMoodboardView();
    }
}

function renderMoodboardView() {
    const container = document.getElementById('moodboard-view');
    if (currentRoom === null) { container.innerHTML = ''; return; }

    const items = allItems.filter(i => i.roomIndex === currentRoom && i.imageUrl);
    if (items.length === 0) {
        container.innerHTML = `
            <div class="moodboard-empty">
                <div style="font-size:2.5rem; margin-bottom:0.5rem">🎨</div>
                <h3>Aucune image à afficher</h3>
                <p>Ajoutez des éléments avec des images pour voir votre moodboard</p>
            </div>`;
        return;
    }

    const roomName = currentProject.rooms[currentRoom]?.name || 'Pièce';
    const colors = currentProject.colors || [];
    const colorStrip = colors.length > 0 ? `
        <div class="mb-palette">
            ${colors.map(c => `<div class="mb-palette-dot" style="background:${c}" title="${c}"></div>`).join('')}
        </div>` : '';
    const totalBudget = items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);

    let html = `<div class="mb-header">
        <div class="mb-header-left">
            <h3 class="mb-title">Moodboard — ${escHtml(roomName)}</h3>
            <p class="mb-subtitle">${items.length} élément${items.length !== 1 ? 's' : ''}${totalBudget > 0 ? ' · ' + formatPrice(totalBudget) : ''}</p>
        </div>
        ${colorStrip}
    </div>`;

    // Generate collage layout positions — overlapping tiles on a fixed frame
    const n = items.length;
    const positions = generateCollagePositions(n);

    html += '<div class="mb-collage">';
    items.forEach((item, idx) => {
        const pos = positions[idx % positions.length];
        const voted = item.votes ? Object.values(item.votes) : [];
        const ups = voted.filter(v => v.vote === 'up').length;
        const downs = voted.filter(v => v.vote === 'down').length;
        let voteBadge = '';
        if (ups > 0 && downs === 0) voteBadge = '<span class="mb-vote-badge mb-vote-up">✓</span>';
        else if (downs > 0 && ups === 0) voteBadge = '<span class="mb-vote-badge mb-vote-down">✗</span>';
        else if (ups > 0 && downs > 0) voteBadge = '<span class="mb-vote-badge mb-vote-debate">?</span>';

        const itemJson = JSON.stringify(item).replace(/\\/g, '\\\\').replace(/'/g, "&#39;").replace(/"/g, '&quot;');
        html += `<div class="mb-tile" style="top:${pos.top}%;left:${pos.left}%;width:${pos.w}%;height:${pos.h}%;z-index:${pos.z}" onclick='openLightbox(JSON.parse(this.dataset.item))' data-item="${itemJson}">
            <img src="${escHtml(item.imageUrl)}" alt="${escHtml(item.name)}" loading="lazy">
            ${voteBadge}
            <div class="mb-tile-overlay">
                <span class="mb-tile-name">${escHtml(item.name)}</span>
                ${item.price ? `<span class="mb-tile-price">${formatPrice(item.price)}</span>` : ''}
                ${item.supplier ? `<span class="mb-tile-source">${escHtml(item.supplier)}</span>` : ''}
            </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function generateCollagePositions(n) {
    // Predefined collage layouts for different item counts
    // Each position: { top, left, w, h, z } in percentages
    if (n <= 3) {
        return [
            { top: 0, left: 0, w: 55, h: 65, z: 5 },
            { top: 5, left: 45, w: 50, h: 55, z: 8 },
            { top: 50, left: 15, w: 45, h: 52, z: 10 },
        ];
    }
    if (n <= 6) {
        return [
            { top: 0, left: 0, w: 42, h: 55, z: 5 },
            { top: -2, left: 38, w: 32, h: 60, z: 8 },
            { top: 0, left: 66, w: 36, h: 40, z: 4 },
            { top: 45, left: -1, w: 30, h: 40, z: 10 },
            { top: 35, left: 26, w: 28, h: 38, z: 9 },
            { top: 32, left: 52, w: 50, h: 45, z: 7 },
        ];
    }
    if (n <= 9) {
        return [
            { top: 0, left: 0, w: 42, h: 50, z: 5 },
            { top: -2, left: 38, w: 30, h: 55, z: 8 },
            { top: 0, left: 65, w: 37, h: 38, z: 4 },
            { top: 42, left: -1, w: 28, h: 38, z: 10 },
            { top: 45, left: 24, w: 26, h: 32, z: 9 },
            { top: 34, left: 48, w: 24, h: 36, z: 11 },
            { top: 30, left: 70, w: 32, h: 40, z: 7 },
            { top: 70, left: 5, w: 26, h: 32, z: 12 },
            { top: 68, left: 30, w: 42, h: 34, z: 6 },
        ];
    }
    // 10+ items: dense collage
    return [
        { top: 0, left: 0, w: 38, h: 45, z: 5 },
        { top: -2, left: 34, w: 28, h: 50, z: 8 },
        { top: 0, left: 60, w: 42, h: 35, z: 4 },
        { top: 38, left: -2, w: 26, h: 35, z: 10 },
        { top: 40, left: 22, w: 24, h: 30, z: 9 },
        { top: 32, left: 44, w: 22, h: 34, z: 11 },
        { top: 28, left: 64, w: 38, h: 38, z: 7 },
        { top: 65, left: 0, w: 24, h: 30, z: 12 },
        { top: 62, left: 22, w: 22, h: 28, z: 13 },
        { top: 60, left: 42, w: 26, h: 32, z: 6 },
        { top: 58, left: 66, w: 36, h: 35, z: 14 },
        { top: 82, left: 10, w: 30, h: 22, z: 15 },
    ];
}

function getCategoryEmoji(cat) {
    const map = { 'Mobilier': '🪑', 'Luminaire': '💡', 'Textile': '🧶', 'Décoration': '🖼️', 'Peinture': '🎨', 'Revêtement sol': '🟫', 'Revêtement mur': '🧱', 'Électroménager': '🍳', 'Rangement': '📦', 'Inspiration': '✨', 'Autre': '📎' };
    return map[cat] || '📎';
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return "à l'instant";
    if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)}h`;
    return date.toLocaleDateString('fr-FR');
}
