/**
 * Personnel Management Client for Twilight: 2000 GM Tool
 * Phase 2 UI Implementation
 * 
 * Handles:
 * - Roster grid with sorting and filtering
 * - Personnel detail editing
 * - Archetype-based creation
 * - Bulk operations
 * - Condition/readiness management
 */

let personnelState = {
  personnel: [],
  runtimeCampaignId: null,
  archetypes: [],
  sortBy: 'name',
  sortOrder: 'asc',
  filterCondition: null,
  filterReadiness: null
};

/**
 * Load personnel for the current runtime campaign
 */
async function loadPersonnelForCampaign(campaignId) {
  if (!campaignId) return;
  
  personnelState.runtimeCampaignId = campaignId;
  
  // Fetch personnel from runtime state via existing endpoints
  // Personnel are included in the campaign runtime backup
  try {
    // Get campaign data which includes personnel
    const response = await campaignApiRequest(`/api/campaigns/${encodeURIComponent(campaignId)}/runtime`, {
      method: "GET"
    });
    
    if (response.runtime?.personnel) {
      personnelState.personnel = response.runtime.personnel;
      renderRosterGrid();
      updateRosterStats();
    }
  } catch (error) {
    console.error('Failed to load personnel:', error);
  }
}

/**
 * Load available archetypes for personnel creation
 */
async function loadArchetypesForCampaign(campaignId) {
  if (!campaignId) return;
  
  try {
    const response = await campaignApiRequest(
      `/api/campaigns/${encodeURIComponent(campaignId)}/npc-archetypes`,
      { method: "GET" }
    );
    
    if (response.archetypes) {
      personnelState.archetypes = response.archetypes;
    }
  } catch (error) {
    console.error('Failed to load archetypes:', error);
  }
}

/**
 * Create personnel from an archetype
 */
async function createPersonnelFromArchetype(archetypeId, overrides = {}) {
  const campaignId = personnelState.runtimeCampaignId;
  if (!campaignId || !archetypeId) return null;
  
  try {
    const response = await campaignApiRequest(
      `/api/campaigns/${encodeURIComponent(campaignId)}/personnel/from-archetype`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archetypeId,
          name: overrides.name || "Unknown",
          role: overrides.role,
          condition: overrides.condition || "OK",
          readiness: overrides.readiness || "ready"
        })
      }
    );
    
    if (response.personnel) {
      personnelState.personnel.push(response.personnel);
      renderRosterGrid();
      updateRosterStats();
      showToast(`Personnel created from ${archetypeId} archetype`);
      return response.personnel;
    }
  } catch (error) {
    showToast(`Failed to create personnel: ${error.message}`);
    console.error('Failed to create personnel:', error);
  }
  
  return null;
}

/**
 * Update personnel record
 */
async function updatePersonnel(personId, updates) {
  const person = personnelState.personnel.find(p => p.id === personId);
  if (!person) return false;
  
  // Merge updates
  const updated = { ...person, ...updates };
  
  try {
    // Save to runtime state
    const campaignId = personnelState.runtimeCampaignId;
    if (!campaignId) return false;
    
    const response = await campaignApiRequest(
      `/api/campaigns/${encodeURIComponent(campaignId)}/runtime`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personnel: personnelState.personnel.map(p => 
            p.id === personId ? updated : p
          )
        })
      }
    );
    
    // Update local state
    Object.assign(person, updates);
    renderRosterGrid();
    updateRosterStats();
    showToast("Personnel record updated");
    return true;
  } catch (error) {
    showToast(`Failed to update personnel: ${error.message}`);
    console.error('Failed to update personnel:', error);
    return false;
  }
}

/**
 * Delete personnel from roster
 */
async function removePersonnel(personId) {
  if (!confirm("Remove this personnel from the roster?")) return false;
  
  try {
    const campaignId = personnelState.runtimeCampaignId;
    if (!campaignId) return false;
    
    const updated = personnelState.personnel.filter(p => p.id !== personId);
    
    const response = await campaignApiRequest(
      `/api/campaigns/${encodeURIComponent(campaignId)}/runtime`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnel: updated })
      }
    );
    
    // Update local state
    personnelState.personnel = updated;
    renderRosterGrid();
    updateRosterStats();
    showToast("Personnel removed from roster");
    return true;
  } catch (error) {
    showToast(`Failed to remove personnel: ${error.message}`);
    return false;
  }
}

/**
 * Apply condition to multiple personnel
 */
async function applyConditionBulk(personIds, condition) {
  try {
    const campaignId = personnelState.runtimeCampaignId;
    if (!campaignId) return false;
    
    const updated = personnelState.personnel.map(p =>
      personIds.includes(p.id) ? { ...p, condition } : p
    );
    
    const response = await campaignApiRequest(
      `/api/campaigns/${encodeURIComponent(campaignId)}/runtime`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnel: updated })
      }
    );
    
    // Update local state
    personIds.forEach(id => {
      const person = personnelState.personnel.find(p => p.id === id);
      if (person) person.condition = condition;
    });
    
    renderRosterGrid();
    updateRosterStats();
    showToast(`Applied ${condition} condition to ${personIds.length} personnel`);
    return true;
  } catch (error) {
    showToast(`Failed to apply condition: ${error.message}`);
    return false;
  }
}

/**
 * Reorder personnel in roster
 */
async function reorderPersonnel(personId, direction) {
  const index = personnelState.personnel.findIndex(p => p.id === personId);
  if (index === -1) return false;
  
  let newIndex = index;
  if (direction === 'up' && index > 0) {
    newIndex = index - 1;
  } else if (direction === 'down' && index < personnelState.personnel.length - 1) {
    newIndex = index + 1;
  } else {
    return false;
  }
  
  // Swap elements
  const updated = [...personnelState.personnel];
  [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
  
  // Update sort_order values to reflect new sequence
  updated.forEach((p, i) => {
    p.sort_order = i;
  });
  
  try {
    const campaignId = personnelState.runtimeCampaignId;
    if (!campaignId) return false;
    
    const response = await campaignApiRequest(
      `/api/campaigns/${encodeURIComponent(campaignId)}/runtime`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnel: updated })
      }
    );
    
    personnelState.personnel = updated;
    renderRosterGrid();
    return true;
  } catch (error) {
    console.error('Failed to reorder personnel:', error);
    return false;
  }
}

/**
 * Render the roster grid with current filters and sorting
 */
function renderRosterGrid() {
  const container = document.getElementById('roster-grid');
  if (!container) return;
  
  let filtered = [...personnelState.personnel];
  
  // Apply filters
  if (personnelState.filterCondition) {
    filtered = filtered.filter(p => p.condition === personnelState.filterCondition);
  }
  if (personnelState.filterReadiness) {
    filtered = filtered.filter(p => p.readiness === personnelState.filterReadiness);
  }
  
  // Apply sorting
  filtered.sort((a, b) => {
    let aVal = a[personnelState.sortBy] || '';
    let bVal = b[personnelState.sortBy] || '';
    
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }
    
    let comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return personnelState.sortOrder === 'asc' ? comparison : -comparison;
  });
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="panel empty-state">No personnel recorded.</div>';
    return;
  }
  
  const html = filtered.map(person => renderPersonnelCard(person)).join('');
  container.innerHTML = html;
  
  // Attach event listeners
  container.querySelectorAll('[data-action="edit-person"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const personId = e.currentTarget.dataset.personId;
      openPersonnelDetailModal(personId);
    });
  });
  
  container.querySelectorAll('[data-action="remove-person"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const personId = e.currentTarget.dataset.personId;
      removePersonnel(personId);
    });
  });
  
  container.querySelectorAll('[data-action="reorder-up"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const personId = e.currentTarget.dataset.personId;
      reorderPersonnel(personId, 'up');
    });
  });
  
  container.querySelectorAll('[data-action="reorder-down"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const personId = e.currentTarget.dataset.personId;
      reorderPersonnel(personId, 'down');
    });
  });
}

/**
 * Render a single personnel card
 */
function renderPersonnelCard(person) {
  const conditionClass = {
    'OK': 'status-ok',
    'Wounded': 'status-wounded',
    'Out of Action': 'status-eliminated'
  }[person.condition] || '';
  
  const readinessIcon = {
    'ready': '✓',
    'fatigued': '≈',
    'exhausted': '·'
  }[person.readiness] || '?';
  
  return `
    <div class="panel personnel-card">
      <div class="personnel-header">
        <div class="personnel-name">
          <strong>${escapeHtml(person.name)}</strong>
          <small>${escapeHtml(person.role || person.category || 'Unknown')}</small>
        </div>
        <div class="personnel-status ${conditionClass}">
          <span class="condition-badge">${person.condition}</span>
          <span class="readiness-badge" title="Readiness: ${person.readiness}">${readinessIcon}</span>
        </div>
      </div>
      
      <div class="personnel-stats">
        <div class="stat-line">
          <span class="label">Attributes:</span>
          <span class="value">${person.attribute_strength || 'C'}/${person.attribute_agility || 'C'}/${person.attribute_intelligence || 'C'}/${person.attribute_empathy || 'C'}</span>
        </div>
        <div class="stat-line">
          <span class="label">CUF:</span>
          <span class="value">${person.cuf_rating || 'D'}</span>
        </div>
        <div class="stat-line">
          <span class="label">Hit Cap:</span>
          <span class="value">${person.hit_cap || 4}</span>
        </div>
      </div>
      
      <div class="personnel-actions">
        <button class="button" data-action="edit-person" data-person-id="${person.id}" title="Edit personnel">Edit</button>
        <button class="button" data-action="reorder-up" data-person-id="${person.id}" title="Move up in roster">↑</button>
        <button class="button" data-action="reorder-down" data-person-id="${person.id}" title="Move down in roster">↓</button>
        <button class="button button-danger" data-action="remove-person" data-person-id="${person.id}" title="Remove from roster">Remove</button>
      </div>
    </div>
  `;
}

/**
 * Open personnel detail modal for editing
 */
function openPersonnelDetailModal(personId) {
  const person = personnelState.personnel.find(p => p.id === personId);
  if (!person) return;
  
  const modal = document.getElementById('personnel-detail-modal');
  if (!modal) {
    console.error('Personnel detail modal not found');
    return;
  }
  
  // Store personId on modal for access in handleDetailSave
  modal.dataset.personId = personId;
  
  // Populate form
  document.getElementById('detail-name').value = person.name || '';
  document.getElementById('detail-role').value = person.role || '';
  document.getElementById('detail-condition').value = person.condition || 'OK';
  document.getElementById('detail-readiness').value = person.readiness || 'ready';
  document.getElementById('detail-str').value = person.attribute_strength || 'C';
  document.getElementById('detail-agi').value = person.attribute_agility || 'C';
  document.getElementById('detail-int').value = person.attribute_intelligence || 'C';
  document.getElementById('detail-emp').value = person.attribute_empathy || 'C';
  document.getElementById('detail-cuf').value = person.cuf_rating || 'D';
  document.getElementById('detail-hit-cap').value = person.hit_cap || 4;
  document.getElementById('detail-status').textContent = '';
  
  modal.showModal();
}

/**
 * Open archetype browser modal
 */
function openArchetypeBrowserModal() {
  const modal = document.getElementById('archetype-browser-modal');
  if (!modal) {
    console.error('Archetype browser modal not found');
    return;
  }
  
  const container = document.getElementById('archetype-list');
  if (!container || personnelState.archetypes.length === 0) {
    container.innerHTML = '<div class="empty-state">No archetypes loaded.</div>';
    modal.showModal();
    return;
  }
  
  // Group by category
  const byCategory = {};
  personnelState.archetypes.forEach(a => {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  });
  
  const html = Object.entries(byCategory).map(([category, archetypes]) => `
    <div class="archetype-category">
      <h3>${escapeHtml(category)}</h3>
      <div class="archetype-grid">
        ${archetypes.map(a => `
          <button class="archetype-card" data-archetype-id="${a.id}" data-action="select-archetype">
            <strong>${escapeHtml(a.name)}</strong>
            <small>${escapeHtml(a.description || '')}</small>
            <div class="archetype-stats">
              <span>STR:${a.attributes.strength} AGI:${a.attributes.agility}</span>
              <span>INT:${a.attributes.intelligence} EMP:${a.attributes.empathy}</span>
              <span>CUF:${a.cuf_rating} HC:${a.hitCap}</span>
            </div>
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
  
  // Attach selection handler
  container.querySelectorAll('[data-action="select-archetype"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const archetypeId = e.currentTarget.dataset.archetypeId;
      modal.close();
      openArchetypeCreationForm(archetypeId);
    });
  });
  
  modal.showModal();
}

/**
 * Open form to customize and create from archetype
 */
function openArchetypeCreationForm(archetypeId) {
  const archetype = personnelState.archetypes.find(a => a.id === archetypeId);
  if (!archetype) return;
  
  const modal = document.getElementById('archetype-creation-modal');
  if (!modal) {
    console.error('Archetype creation modal not found');
    return;
  }
  
  // Store archetypeId on modal for access in handleCreationSubmit
  modal.dataset.archetypeId = archetypeId;
  
  document.getElementById('creation-archetype-name').textContent = archetype.name;
  document.getElementById('creation-name').value = '';
  document.getElementById('creation-role').value = archetype.name;
  document.getElementById('creation-condition').value = 'OK';
  document.getElementById('creation-readiness').value = 'ready';
  document.getElementById('creation-status').textContent = '';
  
  modal.showModal();
}

/**
 * Update roster statistics display
 */
function updateRosterStats() {
  const count = document.getElementById('roster-count');
  if (count) {
    count.textContent = `${personnelState.personnel.length} personnel`;
  }
  
  // Update condition summary
  const conditions = {};
  personnelState.personnel.forEach(p => {
    conditions[p.condition] = (conditions[p.condition] || 0) + 1;
  });
  
  const summary = Object.entries(conditions)
    .map(([cond, count]) => `${count} ${cond}`)
    .join(', ') || 'None recorded';
  
  const condSummary = document.getElementById('roster-condition-summary');
  if (condSummary) {
    condSummary.textContent = summary;
  }
}

/**
 * Helper to escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Handler for saving personnel detail changes
 */
async function handleDetailSave() {
  const modal = document.getElementById('personnel-detail-modal');
  const personId = modal?.dataset.personId;
  if (!personId) return;
  
  const statusEl = document.getElementById('detail-status');
  statusEl.textContent = 'Saving…';
  
  const updates = {
    name: document.getElementById('detail-name').value.trim(),
    role: document.getElementById('detail-role').value.trim(),
    condition: document.getElementById('detail-condition').value,
    readiness: document.getElementById('detail-readiness').value,
    attribute_strength: document.getElementById('detail-str').value,
    attribute_agility: document.getElementById('detail-agi').value,
    attribute_intelligence: document.getElementById('detail-int').value,
    attribute_empathy: document.getElementById('detail-emp').value,
    cuf_rating: document.getElementById('detail-cuf').value,
    hit_cap: parseInt(document.getElementById('detail-hit-cap').value, 10) || 4
  };
  
  const success = await updatePersonnel(personId, updates);
  if (success) {
    modal.close();
  } else {
    statusEl.textContent = 'Save failed';
  }
}

/**
 * Handler for creating personnel from archetype form
 */
async function handleCreationSubmit() {
  const name = document.getElementById('creation-name').value.trim();
  if (!name) {
    document.getElementById('creation-status').textContent = 'Personnel name is required';
    return;
  }
  
  const archetypeId = document.getElementById('archetype-creation-modal').dataset.archetypeId;
  if (!archetypeId) return;
  
  const personnel = await createPersonnelFromArchetype(archetypeId, {
    name,
    role: document.getElementById('creation-role').value.trim(),
    condition: document.getElementById('creation-condition').value,
    readiness: document.getElementById('creation-readiness').value
  });
  
  if (personnel) {
    document.getElementById('archetype-creation-modal').close();
  }
}

// Export for use in index.html
window.personnelClient = {
  loadPersonnelForCampaign,
  loadArchetypesForCampaign,
  createPersonnelFromArchetype,
  updatePersonnel,
  removePersonnel,
  applyConditionBulk,
  reorderPersonnel,
  openPersonnelDetailModal,
  openArchetypeBrowserModal,
  openArchetypeCreationForm,
  renderRosterGrid,
  updateRosterStats,
  handleDetailSave,
  handleCreationSubmit,
  getState: () => personnelState
};
