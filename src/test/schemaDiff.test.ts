import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchema, findBreakingChanges } from '../schemaDiff';

const SCHEMA_V1 = `
type User {
  id: ID!
  name: String
  email: String
}

enum Role {
  ADMIN
  MEMBER
  GUEST
}
`;

test('parseSchema reads a type with its fields', () => {
  const types = parseSchema(SCHEMA_V1);
  const user = types.get('User');
  assert.ok(user);
  assert.equal(user!.kind, 'type');
  assert.deepEqual(
    user!.fields.map((f) => f.name),
    ['id', 'name', 'email'],
  );
  assert.equal(user!.fields[0].type, 'ID!');
});

test('parseSchema reads an enum with its values', () => {
  const types = parseSchema(SCHEMA_V1);
  const role = types.get('Role');
  assert.ok(role);
  assert.equal(role!.kind, 'enum');
  assert.deepEqual(role!.enumValues, ['ADMIN', 'MEMBER', 'GUEST']);
});

test('findBreakingChanges detects a removed type', () => {
  const before = parseSchema('type A { id: ID! }\ntype B { id: ID! }');
  const after = parseSchema('type A { id: ID! }');
  const changes = findBreakingChanges(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'TYPE_REMOVED');
  assert.equal(changes[0].typeName, 'B');
});

test('findBreakingChanges detects a removed field', () => {
  const before = parseSchema('type User { id: ID!\n name: String }');
  const after = parseSchema('type User { id: ID! }');
  const changes = findBreakingChanges(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'FIELD_REMOVED');
  assert.equal(changes[0].fieldOrValueName, 'name');
});

test('findBreakingChanges detects a changed field type', () => {
  const before = parseSchema('type User { age: Int }');
  const after = parseSchema('type User { age: String }');
  const changes = findBreakingChanges(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'FIELD_TYPE_CHANGED');
});

test('findBreakingChanges detects a removed enum value', () => {
  const before = parseSchema('enum Role { ADMIN\n MEMBER }');
  const after = parseSchema('enum Role { ADMIN }');
  const changes = findBreakingChanges(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'ENUM_VALUE_REMOVED');
  assert.equal(changes[0].fieldOrValueName, 'MEMBER');
});

test('findBreakingChanges reports nothing for identical schemas', () => {
  const before = parseSchema(SCHEMA_V1);
  const after = parseSchema(SCHEMA_V1);
  assert.deepEqual(findBreakingChanges(before, after), []);
});

test('findBreakingChanges does not flag an added field or type (additive, non-breaking)', () => {
  const before = parseSchema('type User { id: ID! }');
  const after = parseSchema('type User { id: ID!\n newField: String }\ntype NewType { x: ID! }');
  assert.deepEqual(findBreakingChanges(before, after), []);
});

test('findBreakingChanges does not flag a value added to an enum', () => {
  const before = parseSchema('enum Role { ADMIN }');
  const after = parseSchema('enum Role { ADMIN\n MEMBER }');
  assert.deepEqual(findBreakingChanges(before, after), []);
});
