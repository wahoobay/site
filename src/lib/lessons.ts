// The grades (src/content/grades.json) and the courses (src/content/lessons/*.yaml) behind /learn/.
import { getCollection, type CollectionEntry } from 'astro:content';
import gradesFile from '../content/grades.json';

export type Grade = CollectionEntry<'grades'>['data'];
export type Lesson = CollectionEntry<'lessons'>['data'];
export type LessonLink = Lesson['links'][number];

export const gradeUrl = (slug: string) => `/learn/${slug}/`;
export const lessonUrl = (slug: string) => `/learn/courses/${slug}/`;

/** What a link opens, printed after its label as plain text. */
export const KIND: Record<LessonLink['kind'], string> = {
  pdf: 'PDF',
  doc: 'Document',
  slides: 'Slides',
  form: 'Form',
  site: 'Website',
};

/** The six grades, in the order of grades.json (the old Education page's); the collection itself keeps no order. */
const ORDER = gradesFile.map((grade) => grade.slug);
export const allGrades = async (): Promise<Grade[]> =>
  (await getCollection('grades')).map((entry) => entry.data).sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));

/** Every course, by title. A course naming a grade that grades.json lacks stops the build. */
export async function allLessons(): Promise<Lesson[]> {
  const known = new Set((await allGrades()).map((grade) => grade.slug));
  const lessons = (await getCollection('lessons')).map((entry) => entry.data);
  for (const lesson of lessons) {
    const unknown = lesson.grades.filter((slug) => !known.has(slug));
    if (unknown.length > 0) throw new Error(`src/content/lessons/${lesson.slug}.yaml: no grade ${unknown.join(', ')}`);
  }
  return lessons.sort((a, b) => a.title.localeCompare(b.title));
}

/** A course's grades, in the grades' order. */
export const gradesOf = (lesson: Lesson, grades: Grade[]) => grades.filter((grade) => lesson.grades.includes(grade.slug));

/** A link to another site opens in a new tab and says so; the site's own files (/docs/…) open in place. */
export const isExternal = (url: string) => /^https?:\/\//.test(url);
