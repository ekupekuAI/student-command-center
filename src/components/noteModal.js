/**
 * noteModal.js — Accessible Note Create/Edit Modal
 * Handles note drafting, subject tagging, pinning, and field validation.
 */

import { icons } from '../icons.js';
import { subjectService } from '../services/subjectService.js';
import { showErrorToast } from '../services/notify.js';

/**
 * Open Create or Edit Note Modal
 * @param {Object} options
 * @param {Object} [options.note] - Existing note if editing, or null for creating
 * @param {Function} options.onSave - Callback when note is saved
 */
export function openNoteModal({ note = null, onSave }) {
  const isEdit = Boolean(note);
  const availableSubjects = subjectService.getAllSubjects();

  // Initial values
  const initialValues = {
    title: note ? note.title : '',
    content: note ? note.content : '',
    subjectId: note ? (note.subjectId || '') : '',
    pinned: note ? Boolean(note.pinned) : false,
  };

  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'noteModalTitle');

  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width: 620px">
      <div class="modal-header">
        <div>
          <h3 class="modal-title" id="noteModalTitle">${isEdit ? 'Edit Note' : 'Create New Note'}</h3>
          <p class="modal-subtitle">${isEdit ? 'Update lecture summary or study sheet' : 'Draft lecture notes, formulas, or review summaries'}</p>
        </div>
        <button class="icon-btn modal-close-btn" id="modalCloseBtn" aria-label="Close modal">
          ${icons.x(18)}
        </button>
      </div>

      <form id="noteForm" class="modal-form" novalidate>
        <!-- Title & Subject Grid -->
        <div class="form-row-2">
          <!-- Title -->
          <div class="form-group" style="grid-column: span 1">
            <label class="form-label" for="noteTitle">
              Note Title <span class="required-star">*</span>
            </label>
            <input
              type="text"
              id="noteTitle"
              name="title"
              class="form-control"
              placeholder="e.g., AVL Rotations & Invariants"
              value="${escapeHtml(initialValues.title)}"
              required
              autocomplete="off"
            />
            <div class="form-error-msg" id="titleError"></div>
          </div>

          <!-- Subject -->
          <div class="form-group">
            <label class="form-label" for="noteSubject">
              Associated Course
            </label>
            <select id="noteSubject" name="subjectId" class="form-control form-select">
              <option value="" ${!initialValues.subjectId ? 'selected' : ''}>General / No Subject</option>
              ${availableSubjects.map(s => `
                <option value="${s.id}" ${s.id === initialValues.subjectId ? 'selected' : ''}>
                  ${s.code} · ${s.name}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Note Content Textarea -->
        <div class="form-group">
          <label class="form-label" for="noteContent">
            Note Content <span class="required-star">*</span>
          </label>
          <textarea
            id="noteContent"
            name="content"
            class="form-control form-textarea"
            rows="9"
            style="min-height: 180px; font-family: var(--font-sans); line-height: 1.6;"
            placeholder="Write your study notes, formulas, lecture highlights, or checklists here..."
            required
          >${escapeHtml(initialValues.content)}</textarea>
          <div class="form-error-msg" id="contentError"></div>
        </div>

        <!-- Pin Checkbox -->
        <div style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-1) 0">
          <input
            type="checkbox"
            id="notePinned"
            name="pinned"
            style="width:16px;height:16px;cursor:pointer;accent-color:var(--color-brand-500)"
            ${initialValues.pinned ? 'checked' : ''}
          />
          <label for="notePinned" style="font-size:var(--text-xs);font-weight:600;color:var(--text-secondary);cursor:pointer;user-select:none">
            📌 Pin this note to the top of the list
          </label>
        </div>

        <!-- Modal Footer Actions -->
        <div class="form-error-banner" id="formError" role="alert" hidden></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="modalCancelBtn">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" id="modalSubmitBtn">
            ${isEdit ? `${icons.check(16)} Save Changes` : `${icons.plus(16)} Save Note`}
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  // Focus title input
  const titleInput = overlay.querySelector('#noteTitle');
  setTimeout(() => titleInput?.focus(), 50);

  // Close logic
  function closeModal() {
    overlay.classList.add('modal-closing');
    setTimeout(() => overlay.remove(), 180);
    document.removeEventListener('keydown', handleKeydown);
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  }

  document.addEventListener('keydown', handleKeydown);

  overlay.querySelector('#modalCloseBtn')?.addEventListener('click', closeModal);
  overlay.querySelector('#modalCancelBtn')?.addEventListener('click', closeModal);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Form submit & validation
  const form = overlay.querySelector('#noteForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let isValid = true;

    // 1. Validate Title
    const titleVal = titleInput.value.trim();
    const titleError = overlay.querySelector('#titleError');
    if (!titleVal) {
      titleInput.classList.add('is-invalid');
      titleError.textContent = 'Please enter a note title.';
      isValid = false;
    } else {
      titleInput.classList.remove('is-invalid');
      titleError.textContent = '';
    }

    // 2. Validate Content
    const contentInput = overlay.querySelector('#noteContent');
    const contentError = overlay.querySelector('#contentError');
    const contentVal = contentInput.value.trim();
    if (!contentVal) {
      contentInput.classList.add('is-invalid');
      contentError.textContent = 'Please enter some note content.';
      isValid = false;
    } else {
      contentInput.classList.remove('is-invalid');
      contentError.textContent = '';
    }

    if (!isValid) return;

    const subjectVal = overlay.querySelector('#noteSubject').value || null;
    const pinnedVal = overlay.querySelector('#notePinned').checked;

    const noteData = {
      title: titleVal,
      content: contentVal,
      subjectId: subjectVal,
      pinned: pinnedVal,
    };

    // Await the (possibly async) save; keep the modal open on failure.
    const submitBtn = overlay.querySelector('#modalSubmitBtn');
    const originalBtnHtml = submitBtn.innerHTML;
    const errBox = overlay.querySelector('#formError');
    errBox.hidden = true;

    submitBtn.disabled = true;
    submitBtn.innerHTML = isEdit ? `${icons.check(16)} Saving…` : `${icons.plus(16)} Saving…`;

    try {
      if (typeof onSave === 'function') {
        await onSave(noteData);
      }
      closeModal();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      errBox.textContent = (err && err.message) || 'Something went wrong. Your note could not be saved.';
      errBox.hidden = false;
      showErrorToast(err);
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
