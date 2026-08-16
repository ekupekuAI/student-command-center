/**
 * placeholder.js — Shared factory for intentional placeholder pages.
 * Each placeholder clearly communicates what will be built, shows planned
 * features as pill chips, and provides a polished, non-generic look.
 */

import { icons } from '../icons.js';

/**
 * @param {object} config
 * @param {string} config.title
 * @param {string} config.subtitle
 * @param {string} config.iconKey      - key from icons object
 * @param {string} config.accentClass  - e.g. 'accent-violet'
 * @param {string[]} config.features   - upcoming feature pill labels
 * @param {string} [config.cta]        - optional CTA button label
 * @param {string} [config.ctaHref]    - optional CTA button href
 * @param {string} [config.phase]      - e.g. 'Phase 2'
 */
export function PlaceholderPage({
  title,
  subtitle,
  iconKey,
  accentClass,
  features = [],
  cta,
  ctaHref,
  phase = 'Phase 2',
}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'page-content';
  wrapper.style.minHeight = '100%';

  const iconSvg = icons[iconKey]?.(36) || icons.layers(36);

  wrapper.innerHTML = `
    <div class="placeholder-page">
      <div class="placeholder-icon accent-bg ${accentClass}" style="color:var(--accent)">
        ${iconSvg}
      </div>
      <div>
        <h3>${title}</h3>
        <p>${subtitle}</p>
      </div>
      ${features.length ? `
        <div class="placeholder-features">
          ${features.map(f => `
            <span class="placeholder-feature-pill">
              ${icons.check(13)} ${f}
            </span>
          `).join('')}
        </div>
      ` : ''}
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;justify-content:center">
        <span class="badge badge-brand">${phase}</span>
        ${cta ? `<button class="btn btn-primary btn-sm" onclick="window.location.hash='${ctaHref || '#/dashboard'}'">
          ${icons.arrowUp(14)} ${cta}
        </button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/dashboard'">
          ${icons.chevronLeft(14)} Back to Dashboard
        </button>
      </div>
    </div>
  `;

  return wrapper;
}
