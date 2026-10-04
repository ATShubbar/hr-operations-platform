import type { RequestContent } from './request-content';

// ASSIGN-01: a task was handed to the reader. The task title is shown verbatim.
export function buildTaskAssignedContent(args: { title: string }): RequestContent {
  return {
    title: { ar: 'أُسندت إليك مهمة', en: 'A task was assigned to you' },
    body: {
      ar: `أصبحت المهمة «${args.title}» مُسندة إليك.`,
      en: `"${args.title}" is now yours.`,
    },
  };
}
