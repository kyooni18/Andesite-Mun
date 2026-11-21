import type { MetadataProperty } from '../api/types'

/** A property value as the list of strings the inspector shows (a list shows one pill per entry). */
export function propertyDisplay(property: Pick<MetadataProperty, 'type' | 'value'>): string[] {
  const { type, value } = property
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.map(String)
  if (type === 'checkbox') return [value ? 'Yes' : 'No']
  return [String(value)]
}

/** Whether the property is a list (tags, aliases, ...) shown as pills. */
export function isListProperty(property: Pick<MetadataProperty, 'type' | 'value'>): boolean {
  return Array.isArray(property.value)
}
