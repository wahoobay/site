// What the admin's lists share beyond the sighting screens' pager (sightings.mjs): a page of a list the Java API answers
// whole (the species, the recycle bin, the activity log), a set of checked rows (the recycle bin's restore and purge, a
// species' move), counts and lists in words, why an action failed, and the markup of a table of records, its thumbnail
// and its check box as a small VDOM (src/lib/vdom.mjs). Used by catalogue.mjs and housekeeping.mjs; a plain module, so
// the tests read it without a build (tests/admin-catalogue.test.mjs).
import { errorText } from './shell.mjs';
import { hideBroken } from './sightings.mjs';
import { ApiError, SessionExpired } from '../java-api.mjs';
import { h } from '../vdom.mjs';

/**
 * The rows of one page of a whole list.
 * @template T
 * @param {T[] | null | undefined} rows
 * @param {number} limit
 * @param {number} offset
 * @returns {T[]}
 */
export const pageSlice = (rows, limit, offset) => (Array.isArray(rows) ? rows.slice(offset, offset + limit) : []);

/**
 * An id as the API takes it: a positive whole number, else null.
 * @param {unknown} value
 * @returns {number | null}
 */
export const idOf = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * Ids as the API takes them: each once, in order, anything that is no id left out.
 * @param {unknown} values
 * @returns {number[]}
 */
export const idsOf = (values) => [...new Set((Array.isArray(values) ? values : []).map(idOf).filter((n) => n !== null))];

/**
 * A checked set with one row checked or not.
 * @param {number[]} selected
 * @param {unknown} id
 * @param {boolean} on
 * @returns {number[]}
 */
export function checked(selected, id, on) {
  const n = idOf(id);
  if (n === null) return idsOf(selected);
  return on ? idsOf([...selected, n]) : idsOf(selected).filter((x) => x !== n);
}

/**
 * A checked set with every row of a page checked or not; the other pages' rows keep their state.
 * @param {number[]} selected
 * @param {unknown[]} ids
 * @param {boolean} on
 * @returns {number[]}
 */
export function checkedAll(selected, ids, on) {
  const page = idsOf(ids);
  return on ? idsOf([...selected, ...page]) : idsOf(selected).filter((x) => !page.includes(x));
}

/**
 * How many are checked, and whether every row, or any, of the page shown is.
 * @param {number[]} selected
 * @param {unknown[]} pageIds
 * @returns {{ count: number, all: boolean, some: boolean }}
 */
export function selectionOf(selected, pageIds) {
  const set = new Set(idsOf(selected));
  const page = idsOf(pageIds);
  return { count: set.size, all: page.length > 0 && page.every((id) => set.has(id)), some: page.some((id) => set.has(id)) };
}

/**
 * After a reload, only the checked rows that are still in the list stay checked.
 * @param {number[]} selected
 * @param {unknown[]} ids
 */
export const stillThere = (selected, ids) => {
  const present = new Set(idsOf(ids));
  return idsOf(selected).filter((id) => present.has(id));
};

/**
 * Ids in words: "12", "12 and 15", "12, 15 and 18".
 * @param {unknown[]} ids
 */
export function idsText(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(String);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * A count with its noun: "1 sighting", "1,200 sightings".
 * @param {number} n
 * @param {string} one
 * @param {string} many
 */
export const plural = (n, one, many) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * Why a delete did not happen, in a notice's words: a 409 whose body names the sightings still using `subject`
 * (AdminMediaController.delete answers { error, linked_sightings }) says which and what to do; anything else is the
 * shell's errorText (the API's own words when it gave some).
 * @param {unknown} error
 * @param {string} subject what was to be deleted ("Media 21", a species' name)
 */
export function failureText(error, subject) {
  const linked = error instanceof ApiError && error.status === 409 && Array.isArray(error.body?.linked_sightings) ? error.body.linked_sightings : [];
  if (linked.length) {
    const one = linked.length === 1;
    return `${subject} is still used by ${one ? 'sighting' : 'sightings'} ${idsText(linked)}, so nothing was deleted. Move ${one ? 'it' : 'them'} to the recycle bin first.`;
  }
  return errorText(error);
}

/**
 * What a failed delete hands the shell's notify: the SessionExpired itself (any 401), so the shell ends the session as
 * every screen's failures do; else an error notice in failureText's words.
 * @param {unknown} error
 * @param {string} subject
 * @returns {unknown}
 */
export const failureNotice = (error, subject) => (error instanceof SessionExpired ? error : { tone: 'error', text: failureText(error, subject) });

// --- markup ---------------------------------------------------------------------------------------------------------

/**
 * @typedef {{ key: string, label: string, header?: boolean, cell: (row: any) => any }} Column
 */

/**
 * A table of records (.wb-table in its .wb-table-wrap, stacking into labelled cards where the wrapper is narrow): the
 * caption for screen readers, a header row, then a row per record, each cell carrying its column in data-label. The
 * column marked `header` is each row's header cell (a th scoped to the row).
 * @param {any[]} rows
 * @param {{ caption: string, columns: Column[], key: (row: any) => string | number | null }} options
 */
export const recordsTable = (rows, { caption, columns, key }) =>
  h(
    'div',
    { className: 'wb-table-wrap' },
    h(
      'table',
      { className: 'wb-table', 'data-stack': '' },
      h('caption', { className: 'wb-sr-only' }, caption),
      h('thead', null, h('tr', null, columns.map((c) => h('th', { key: c.key, scope: 'col' }, c.label)))),
      h(
        'tbody',
        null,
        rows.map((row, i) =>
          h(
            'tr',
            { key: String(key(row) ?? i) },
            columns.map((c) => h(c.header ? 'th' : 'td', { key: c.key, scope: c.header ? 'row' : undefined, 'data-label': c.label }, c.cell(row))),
          ),
        ),
      ),
    ),
  );

/**
 * A row's thumbnail (a small 4:3 picture that hides if it does not load; its address may carry the token, so it never
 * sends a Referer: plan 9, Ruling 5), or the words for none.
 * @param {{ src: string, video: boolean } | null} thumb
 * @param {string} [none]
 */
export const thumbNode = (thumb, none = 'No media') =>
  thumb
    ? h('img', {
        className: 'wb-media site-admin__thumb',
        src: thumb.src,
        alt: thumb.video ? 'Video' : '',
        width: 80,
        height: 60,
        loading: 'lazy',
        decoding: 'async',
        referrerPolicy: 'no-referrer',
        onError: hideBroken,
      })
    : none;

/**
 * A check box with its label (for screen readers only when `hideLabel`), as the review's Keep boxes are.
 * @param {{ id: string, checked: boolean, disabled?: boolean, label: string, hideLabel?: boolean, onChange: (on: boolean) => void }} options
 */
export const checkNode = ({ id, checked: on, disabled = false, label, hideLabel = false, onChange }) =>
  h(
    'span',
    { className: 'site-admin__check' },
    h('input', { type: 'checkbox', id, checked: on, disabled, onChange: (/** @type {any} */ event) => onChange(Boolean(event.target.checked)) }),
    h('label', { htmlFor: id }, hideLabel ? h('span', { className: 'wb-sr-only' }, label) : label),
  );
