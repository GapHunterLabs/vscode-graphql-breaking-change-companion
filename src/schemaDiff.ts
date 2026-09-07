/**
 * Pure logic -- no `vscode` dependency. New niche (not a port from
 * the Kotlin catalog). Evidence: confirmed twice independently --
 * the official GraphQL VS Code extensions give validation/
 * autocompletion but no diffing against a baseline; GraphQL Inspector
 * and Kiwi.com's graphql-bc-checker are "typically integrated into
 * CI/CD pipelines rather than as VS Code extensions directly". Design
 * precedent: `Protobuf VSC` already proves the "diff schema text
 * against a git ref, inside the editor" mechanism works for a sibling
 * schema format (protobuf), via its "Check for Breaking Changes"
 * command.
 *
 * Hand-rolled structural parser for the common GraphQL SDL subset
 * (type/interface/input/enum blocks) -- not a full GraphQL grammar
 * (directives, unions, extend, descriptions are not modeled). Good
 * enough to catch the classic breaking changes without a real GraphQL
 * parser dependency.
 */

export interface FieldDef {
  name: string;
  type: string;
}

export interface TypeDef {
  kind: 'type' | 'interface' | 'input' | 'enum';
  name: string;
  fields: FieldDef[]; // populated for type/interface/input
  enumValues: string[]; // populated for enum
}

const BLOCK_START = /(type|interface|input|enum)\s+(\w+)[^{]*\{/g;
const FIELD_LINE = /^(\w+)\s*(\([^)]*\))?\s*:\s*(.+?)\s*$/;
const ENUM_VALUE_LINE = /^(\w+)\b/;

/** Finds the index just after the `{` matching the one at
 * `openBraceIndex` (which must itself be a `{`), counting nested
 * braces across the whole remaining text -- not line-based, so it
 * doesn't matter whether the block's content, or its last field,
 * happens to share a line with the opening or closing brace. */
function findMatchingCloseBrace(text: string, openBraceIndex: number): number {
  let depth = 0;
  for (let i = openBraceIndex; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

export function parseSchema(text: string): Map<string, TypeDef> {
  const types = new Map<string, TypeDef>();

  for (const match of text.matchAll(BLOCK_START)) {
    const kind = match[1] as TypeDef['kind'];
    const name = match[2];
    const openBraceIndex = match.index + match[0].length - 1; // match[0] ends with the opening '{'
    const closeBraceIndex = findMatchingCloseBrace(text, openBraceIndex);
    const inner = text.slice(openBraceIndex + 1, closeBraceIndex);

    const def: TypeDef = { kind, name, fields: [], enumValues: [] };
    for (const rawLine of inner.split('\n')) {
      const trimmed = rawLine.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      if (kind === 'enum') {
        const enumMatch = ENUM_VALUE_LINE.exec(trimmed);
        if (enumMatch) def.enumValues.push(enumMatch[1]);
      } else {
        const fieldMatch = FIELD_LINE.exec(trimmed);
        if (fieldMatch) def.fields.push({ name: fieldMatch[1], type: fieldMatch[3].replace(/@.*/, '').trim() });
      }
    }

    types.set(name, def);
  }

  return types;
}

export interface BreakingChange {
  kind: 'TYPE_REMOVED' | 'FIELD_REMOVED' | 'FIELD_TYPE_CHANGED' | 'ENUM_VALUE_REMOVED';
  typeName: string;
  fieldOrValueName?: string;
  message: string;
}

/** Compares `before` (the git baseline) against `after` (the current
 * file) and lists breaking changes -- API consumers written against
 * `before` that would now fail against `after`. v0.1 scope, honestly
 * noted: new required arguments added to an existing field are a real
 * breaking change too, but argument parsing isn't implemented here --
 * only removed types/fields/enum values and changed field types. */
export function findBreakingChanges(before: Map<string, TypeDef>, after: Map<string, TypeDef>): BreakingChange[] {
  const changes: BreakingChange[] = [];

  for (const [name, beforeType] of before) {
    const afterType = after.get(name);
    if (!afterType) {
      changes.push({ kind: 'TYPE_REMOVED', typeName: name, message: `${beforeType.kind} "${name}" was removed.` });
      continue;
    }

    if (beforeType.kind === 'enum') {
      for (const value of beforeType.enumValues) {
        if (!afterType.enumValues.includes(value)) {
          changes.push({
            kind: 'ENUM_VALUE_REMOVED',
            typeName: name,
            fieldOrValueName: value,
            message: `enum "${name}" no longer has the value "${value}".`,
          });
        }
      }
      continue;
    }

    const afterFieldsByName = new Map(afterType.fields.map((f) => [f.name, f]));
    for (const field of beforeType.fields) {
      const afterField = afterFieldsByName.get(field.name);
      if (!afterField) {
        changes.push({
          kind: 'FIELD_REMOVED',
          typeName: name,
          fieldOrValueName: field.name,
          message: `${beforeType.kind} "${name}" no longer has field "${field.name}".`,
        });
      } else if (afterField.type !== field.type) {
        changes.push({
          kind: 'FIELD_TYPE_CHANGED',
          typeName: name,
          fieldOrValueName: field.name,
          message: `${beforeType.kind} "${name}.${field.name}" changed type from "${field.type}" to "${afterField.type}".`,
        });
      }
    }
  }

  return changes;
}
