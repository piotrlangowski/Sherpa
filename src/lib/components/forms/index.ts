export { default as FormDialog } from './FormDialog.svelte';
export { default as FormSection } from './FormSection.svelte';
export { default as FormField } from './FormField.svelte';
export { default as NumberField } from './NumberField.svelte';

export type FieldBadge = {
  text: string;
  tone: 'positive' | 'negative' | 'neutral' | 'muted';
};
