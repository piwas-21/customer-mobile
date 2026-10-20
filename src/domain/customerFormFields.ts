import type { CustomerForm } from '../api/customerForms';
export type CustomerField<Key extends string> = Readonly<{ key: Key; required: boolean }>;
export function customerFieldsFor<Key extends string>(
  forms: readonly CustomerForm[],
  formKey: string,
  keys: readonly Key[],
  floor: readonly Key[],
  kind = 'customer',
): CustomerField<Key>[] {
  const supported = new Set<string>(keys);
  const form = forms.find((item) => item.formKey === formKey);
  if (!form || form.fields.some((field) => !supported.has(field.fieldKey) && field.isVisible))
    throw new Error(`Unsupported ${kind} form`);
  const fields = new Map(form.fields.map((field) => [field.fieldKey, field]));
  return keys.flatMap((key) => {
    const field = fields.get(key);
    if (!field) throw new Error(`Incomplete ${kind} form`);
    const required = floor.includes(key) || field.isRequired;
    return field.isVisible || required ? [{ key, required }] : [];
  });
}
