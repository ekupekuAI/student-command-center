/**
 * taskModal.js — Accessible Task Create/Edit Modal & Confirm Dialog
 * Handles validation, focus management, keyboard escape, and form submission.
 */

import { icons } from '../icons.js';
import { subjectService } from '../services/subjectService.js';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../services/taskService.js';
import { showErrorToast } from '../services/notify.js';

/**
 * Open Create or Edit Task Modal
 * @param {Object} options
 * @param {Object} [options.task] - Existing task if editing, or null for creating
 * @param {Function} options.onSave - Callback when task is saved (receives form data)
 */
export function openTaskModal({ task = null, onSave }) {
  const isEdit = Boolean(task);
  const todayStr = new Date().toISOString().slice(0, 10);
  const availableSubjects = subjectService.getAllSubjects();
  const defaultSubjectId = availableSubjects.length > 0 ? availableSubjects[0].id : '';

  // Initial values
  const initialValues = {
    title: task ? task.title : '',
    description: task ? (task.description || '') : '',
    subjectId: task ? task.subjectId : defaultSubjectId,
    priority: task ? task.priority : 'medium',
    status: task ? task.status : 'todo',
    dueDate: task ? task.dueDate : todayStr,
    estimatedMinutes: task && task.estimatedMinutes ? task.estimatedMinutes : '',
  };

  // Create modal container
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'modalTitle');

  overlay.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <div>
          <h3 class="modal-title" id="modalTitle">${isEdit ? 'Edit Task' : 'Create New Task'}</h3>
          <p class="modal-subtitle">${isEdit ? 'Update task details and deadlines' : 'Add an assignment, project, or study goal'}</p>
        </div>
        <button class="icon-btn modal-close-btn" id="modalCloseBtn" aria-label="Close modal">
          ${icons.x(18)}
        </button>
      </div>

      <form id="taskForm" class="modal-form" novalidate>
        <!-- Title -->
        <div class="form-group">
          <label class="form-label" for="taskTitle">
            Task Title <span class="required-star">*</span>
          </label>
          <input
            type="text"
            id="taskTitle"
            name="title"
            class="form-control"
            placeholder="e.g., Complete Chapter 4 Homework"
            value="${escapeHtml(initialValues.title)}"
            required
            autocomplete="off"
          />
          <div class="form-error-msg" id="titleError"></div>
        </div>

        <!-- Description -->
        <div class="form-group">
          <label class="form-label" for="taskDescription">
            Description <span class="optional-tag">(Optional)</span>
          </label>
          <textarea
            id="taskDescription"
            name="description"
            class="form-control form-textarea"
            rows="3"
            placeholder="Add relevant notes, requirements, or links..."
          >${escapeHtml(initialValues.description)}</textarea>
        </div>

        <!-- Grid 2: Subject & Priority -->
        <div class="form-row-2">
          <!-- Subject -->
          <div class="form-group">
            <label class="form-label" for="taskSubject">
              Subject <span class="required-star">*</span>
            </label>
            <select id="taskSubject" name="subjectId" class="form-control form-select" required>
              ${availableSubjects.map(s => `
                <option value="${s.id}" ${s.id === initialValues.subjectId ? 'selected' : ''}>
                  ${s.code} · ${s.name}
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Priority -->
          <div class="form-group">
            <label class="form-label" for="taskPriority">
              Priority <span class="required-star">*</span>
            </label>
            <select id="taskPriority" name="priority" class="form-control form-select">
              ${PRIORITY_OPTIONS.map(p => `
                <option value="${p.value}" ${p.value === initialValues.priority ? 'selected' : ''}>
                  ${p.label} Priority
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Grid 2: Status & Due Date -->
        <div class="form-row-2">
          <!-- Status -->
          <div class="form-group">
            <label class="form-label" for="taskStatus">
              Status <span class="required-star">*</span>
            </label>
            <select id="taskStatus" name="status" class="form-control form-select">
              ${STATUS_OPTIONS.map(st => `
                <option value="${st.value}" ${st.value === initialValues.status ? 'selected' : ''}>
                  ${st.label}
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Due Date -->
          <div class="form-group">
            <label class="form-label" for="taskDueDate">
              Due Date <span class="required-star">*</span>
            </label>
            <input
              type="date"
              id="taskDueDate"
              name="dueDate"
              class="form-control"
              value="${initialValues.dueDate}"
              required
            />
            <div class="form-error-msg" id="dueDateError"></div>
          </div>
        </div>

        <!-- Estimated Time -->
        <div class="form-group">
          <label class="form-label" for="taskEstimatedTime">
            Estimated Study Time (Minutes) <span class="optional-tag">(Optional)</span>
          </label>
          <div class="input-with-icon">
            <span class="input-prefix-icon">${icons.clock(16)}</span>
            <input
              type="number"
              id="taskEstimatedTime"
              name="estimatedMinutes"
              class="form-control has-prefix"
              placeholder="e.g., 60"
              min="1"
              max="1440"
              step="5"
              value="${initialValues.estimatedMinutes}"
            />
          </div>
          <div class="form-error-msg" id="estTimeError"></div>
        </div>

        <!-- Modal Footer Actions -->
        <div class="form-error-banner" id="formError" role="alert" hidden></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="modalCancelBtn">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" id="modalSubmitBtn">
            ${isEdit ? `${icons.check(16)} Save Changes` : `${icons.plus(16)} Create Task`}
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  // Focus trap / focus first input
  const titleInput = overlay.querySelector('#taskTitle');
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

  // Form submission & validation
  const form = overlay.querySelector('#taskForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let isValid = true;

    // 1. Validate Title
    const titleVal = titleInput.value.trim();
    const titleError = overlay.querySelector('#titleError');
    if (!titleVal) {
      titleInput.classList.add('is-invalid');
      titleError.textContent = 'Please enter a task title.';
      isValid = false;
    } else {
      titleInput.classList.remove('is-invalid');
      titleError.textContent = '';
    }

    // 2. Validate Due Date
    const dueDateInput = overlay.querySelector('#taskDueDate');
    const dueDateError = overlay.querySelector('#dueDateError');
    const dueDateVal = dueDateInput.value;
    if (!dueDateVal) {
      dueDateInput.classList.add('is-invalid');
      dueDateError.textContent = 'Please select a valid due date.';
      isValid = false;
    } else {
      dueDateInput.classList.remove('is-invalid');
      dueDateError.textContent = '';
    }

    // 3. Validate Estimated Minutes
    const estInput = overlay.querySelector('#taskEstimatedTime');
    const estError = overlay.querySelector('#estTimeError');
    const estVal = estInput.value.trim();
    if (estVal) {
      const num = parseInt(estVal, 10);
      if (isNaN(num) || num <= 0) {
        estInput.classList.add('is-invalid');
        estError.textContent = 'Estimated time must be a positive number of minutes.';
        isValid = false;
      } else {
        estInput.classList.remove('is-invalid');
        estError.textContent = '';
      }
    } else {
      estInput.classList.remove('is-invalid');
      estError.textContent = '';
    }

    if (!isValid) return;

    // Extract clean values
    const taskData = {
      title: titleVal,
      description: overlay.querySelector('#taskDescription').value.trim(),
      subjectId: overlay.querySelector('#taskSubject').value,
      priority: overlay.querySelector('#taskPriority').value,
      status: overlay.querySelector('#taskStatus').value,
      dueDate: dueDateVal,
      estimatedMinutes: estVal ? parseInt(estVal, 10) : null,
    };

    // Await the (possibly async) save; keep the modal open on failure so the
    // user's input is never lost to a network error.
    const submitBtn = overlay.querySelector('#modalSubmitBtn');
    const originalBtnHtml = submitBtn.innerHTML;
    const errBox = overlay.querySelector('#formError');
    errBox.hidden = true;

    submitBtn.disabled = true;
    submitBtn.innerHTML = isEdit ? `${icons.check(16)} Saving…` : `${icons.plus(16)} Creating…`;

    try {
      if (typeof onSave === 'function') {
        await onSave(taskData);
      }
      closeModal();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      errBox.textContent = (err && err.message) || 'Something went wrong. Your task could not be saved.';
      errBox.hidden = false;
      showErrorToast(err);
    }
  });
}

/**
 * Show Accessible Confirmation Dialog
 */
export function showConfirmDialog({
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Delete',
  confirmAccent = 'danger',
  onConfirm,
}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="modal-dialog modal-dialog-sm">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="icon-btn modal-close-btn" id="confirmCloseBtn" aria-label="Close dialog">
          ${icons.x(18)}
        </button>
      </div>
      <div class="modal-body" style="padding: var(--space-4) var(--space-6)">
        <p style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5;">${message}</p>
      </div>
      <div class="modal-footer" style="padding: var(--space-4) var(--space-6) var(--space-5)">
        <button type="button" class="btn btn-secondary" id="confirmCancelBtn">
          Cancel
        </button>
        <button type="button" class="btn btn-${confirmAccent}" id="confirmActionBtn">
          ${confirmText}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function closeDialog() {
    overlay.classList.add('modal-closing');
    setTimeout(() => overlay.remove(), 180);
    document.removeEventListener('keydown', handleKeydown);
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog();
    }
  }

  document.addEventListener('keydown', handleKeydown);

  overlay.querySelector('#confirmCloseBtn')?.addEventListener('click', closeDialog);
  overlay.querySelector('#confirmCancelBtn')?.addEventListener('click', closeDialog);

  overlay.querySelector('#confirmActionBtn')?.addEventListener('click', () => {
    if (typeof onConfirm === 'function') onConfirm();
    closeDialog();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDialog();
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
