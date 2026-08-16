/**
 * subjectModal.js — Accessible Subject Create/Edit Modal
 * Handles form validation, color swatch selection, and focus management.
 */

import { icons } from '../icons.js';
import {
  SUBJECT_COLOR_OPTIONS,
  SEMESTER_OPTIONS,
  subjectService,
} from '../services/subjectService.js';
import { showErrorToast } from '../services/notify.js';

/**
 * Open Create or Edit Subject Modal
 * @param {Object} options
 * @param {Object} [options.subject] - Existing subject if editing, or null for creating
 * @param {Function} options.onSave - Callback when subject is saved
 */
export function openSubjectModal({ subject = null, onSave }) {
  const isEdit = Boolean(subject);
  const availableSemesters = subjectService.getSemesters();

  // Initial values
  const initialValues = {
    code: subject ? subject.code : '',
    name: subject ? subject.name : '',
    instructor: subject ? (subject.instructor || '') : '',
    credits: subject ? subject.credits : 3,
    semester: subject ? subject.semester : (SEMESTER_OPTIONS[0] || 'Fall 2026'),
    color: subject ? (subject.color || subject.accent || 'violet') : 'violet',
    progress: subject ? subject.progress : 0,
    grade: subject ? (subject.grade || 'In Progress') : 'In Progress',
  };

  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'subjectModalTitle');

  overlay.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <div>
          <h3 class="modal-title" id="subjectModalTitle">${isEdit ? 'Edit Subject' : 'Add New Subject'}</h3>
          <p class="modal-subtitle">${isEdit ? 'Update course information and progress' : 'Enroll in a course for this semester'}</p>
        </div>
        <button class="icon-btn modal-close-btn" id="modalCloseBtn" aria-label="Close modal">
          ${icons.x(18)}
        </button>
      </div>

      <form id="subjectForm" class="modal-form" novalidate>
        <!-- Grid 2: Course Code & Subject Name -->
        <div class="form-row-2">
          <!-- Code -->
          <div class="form-group">
            <label class="form-label" for="subjectCode">
              Course Code <span class="required-star">*</span>
            </label>
            <input
              type="text"
              id="subjectCode"
              name="code"
              class="form-control"
              placeholder="e.g., CS301"
              value="${escapeHtml(initialValues.code)}"
              required
              autocomplete="off"
              style="text-transform:uppercase"
            />
            <div class="form-error-msg" id="codeError"></div>
          </div>

          <!-- Credits -->
          <div class="form-group">
            <label class="form-label" for="subjectCredits">
              Credits <span class="required-star">*</span>
            </label>
            <input
              type="number"
              id="subjectCredits"
              name="credits"
              class="form-control"
              min="1"
              max="12"
              value="${initialValues.credits}"
              required
            />
            <div class="form-error-msg" id="creditsError"></div>
          </div>
        </div>

        <!-- Full Name -->
        <div class="form-group">
          <label class="form-label" for="subjectName">
            Course Title <span class="required-star">*</span>
          </label>
          <input
            type="text"
            id="subjectName"
            name="name"
            class="form-control"
            placeholder="e.g., Data Structures & Algorithms"
            value="${escapeHtml(initialValues.name)}"
            required
            autocomplete="off"
          />
          <div class="form-error-msg" id="nameError"></div>
        </div>

        <!-- Grid 2: Instructor & Semester -->
        <div class="form-row-2">
          <!-- Instructor -->
          <div class="form-group">
            <label class="form-label" for="subjectInstructor">
              Instructor <span class="optional-tag">(Optional)</span>
            </label>
            <input
              type="text"
              id="subjectInstructor"
              name="instructor"
              class="form-control"
              placeholder="e.g., Dr. Mitchell"
              value="${escapeHtml(initialValues.instructor)}"
              autocomplete="off"
            />
          </div>

          <!-- Semester -->
          <div class="form-group">
            <label class="form-label" for="subjectSemester">
              Semester <span class="required-star">*</span>
            </label>
            <select id="subjectSemester" name="semester" class="form-control form-select" required>
              ${availableSemesters.map(sem => `
                <option value="${sem}" ${sem === initialValues.semester ? 'selected' : ''}>
                  ${sem}
                </option>
              `).join('')}
            </select>
            <div class="form-error-msg" id="semesterError"></div>
          </div>
        </div>

        <!-- Color Accent Swatches -->
        <div class="form-group">
          <label class="form-label">
            Course Color Theme
          </label>
          <div class="color-swatch-picker" role="radiogroup" aria-label="Course Color Theme">
            ${SUBJECT_COLOR_OPTIONS.map(c => `
              <label class="color-swatch-label" title="${c.label}">
                <input
                  type="radio"
                  name="subjectColor"
                  value="${c.value}"
                  ${c.value === initialValues.color ? 'checked' : ''}
                />
                <span class="color-swatch-circle" style="background:${c.hex}"></span>
              </label>
            `).join('')}
          </div>
        </div>

        <!-- Progress Slider & Target Grade -->
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="subjectProgress">
              Course Progress: <span id="progressDisplay" style="font-weight:700;color:var(--text-brand)">${initialValues.progress}%</span>
            </label>
            <input
              type="range"
              id="subjectProgress"
              name="progress"
              class="form-range"
              min="0"
              max="100"
              step="1"
              value="${initialValues.progress}"
            />
            <div class="form-error-msg" id="progressError"></div>
          </div>

          <div class="form-group">
            <label class="form-label" for="subjectGrade">
              Target / Current Grade <span class="optional-tag">(Optional)</span>
            </label>
            <input
              type="text"
              id="subjectGrade"
              name="grade"
              class="form-control"
              placeholder="e.g., A or 94%"
              value="${escapeHtml(initialValues.grade)}"
            />
          </div>
        </div>

        <!-- Modal Footer Actions -->
        <div class="form-error-banner" id="formError" role="alert" hidden></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="modalCancelBtn">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" id="modalSubmitBtn">
            ${isEdit ? `${icons.check(16)} Save Changes` : `${icons.plus(16)} Add Subject`}
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  // Focus code input
  const codeInput = overlay.querySelector('#subjectCode');
  setTimeout(() => codeInput?.focus(), 50);

  // Live slider display updater
  const progressSlider = overlay.querySelector('#subjectProgress');
  const progressDisplay = overlay.querySelector('#progressDisplay');
  progressSlider?.addEventListener('input', (e) => {
    progressDisplay.textContent = `${e.target.value}%`;
  });

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
  const form = overlay.querySelector('#subjectForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let isValid = true;

    // 1. Validate Code
    const codeVal = codeInput.value.trim().toUpperCase();
    const codeError = overlay.querySelector('#codeError');
    if (!codeVal) {
      codeInput.classList.add('is-invalid');
      codeError.textContent = 'Please enter a course code (e.g. CS301).';
      isValid = false;
    } else {
      codeInput.classList.remove('is-invalid');
      codeError.textContent = '';
    }

    // 2. Validate Name
    const nameInput = overlay.querySelector('#subjectName');
    const nameError = overlay.querySelector('#nameError');
    const nameVal = nameInput.value.trim();
    if (!nameVal) {
      nameInput.classList.add('is-invalid');
      nameError.textContent = 'Please enter the full subject title.';
      isValid = false;
    } else {
      nameInput.classList.remove('is-invalid');
      nameError.textContent = '';
    }

    // 3. Validate Credits
    const creditsInput = overlay.querySelector('#subjectCredits');
    const creditsError = overlay.querySelector('#creditsError');
    const creditsVal = parseInt(creditsInput.value, 10);
    if (isNaN(creditsVal) || creditsVal < 1 || creditsVal > 20) {
      creditsInput.classList.add('is-invalid');
      creditsError.textContent = 'Credits must be between 1 and 20.';
      isValid = false;
    } else {
      creditsInput.classList.remove('is-invalid');
      creditsError.textContent = '';
    }

    // 4. Validate Semester
    const semesterInput = overlay.querySelector('#subjectSemester');
    const semesterError = overlay.querySelector('#semesterError');
    const semesterVal = semesterInput.value.trim();
    if (!semesterVal) {
      semesterInput.classList.add('is-invalid');
      semesterError.textContent = 'Please select a semester.';
      isValid = false;
    } else {
      semesterInput.classList.remove('is-invalid');
      semesterError.textContent = '';
    }

    // 5. Validate Progress
    const progressVal = parseInt(progressSlider.value, 10);
    const progressError = overlay.querySelector('#progressError');
    if (isNaN(progressVal) || progressVal < 0 || progressVal > 100) {
      progressError.textContent = 'Progress must be between 0% and 100%.';
      isValid = false;
    } else {
      progressError.textContent = '';
    }

    if (!isValid) return;

    const selectedColorEl = overlay.querySelector('input[name="subjectColor"]:checked');
    const colorVal = selectedColorEl ? selectedColorEl.value : 'violet';

    const subjectData = {
      code: codeVal,
      name: nameVal,
      instructor: overlay.querySelector('#subjectInstructor').value.trim(),
      credits: creditsVal,
      semester: semesterVal,
      color: colorVal,
      accent: colorVal,
      progress: progressVal,
      grade: overlay.querySelector('#subjectGrade').value.trim() || 'In Progress',
    };

    // Await the (possibly async) save; keep the modal open on failure.
    const submitBtn = overlay.querySelector('#modalSubmitBtn');
    const originalBtnHtml = submitBtn.innerHTML;
    const errBox = overlay.querySelector('#formError');
    errBox.hidden = true;

    submitBtn.disabled = true;
    submitBtn.innerHTML = isEdit ? `${icons.check(16)} Saving…` : `${icons.plus(16)} Adding…`;

    try {
      if (typeof onSave === 'function') {
        await onSave(subjectData);
      }
      closeModal();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      errBox.textContent = (err && err.message) || 'Something went wrong. The subject could not be saved.';
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
