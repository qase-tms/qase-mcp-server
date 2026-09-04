/**
 * Tests for qase_custom_field_upsert / qase_custom_field_delete.
 *
 * The API speaks numeric codes for `entity` and `type`; the tools speak labels
 * and map them, so a model never has to guess that a selectbox is a 3.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockGet = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    customFields: {
      createCustomField: mockCreate,
      updateCustomField: mockUpdate,
      deleteCustomField: mockDelete,
      getCustomField: mockGet,
    },
  }),
}));

import './custom-fields.js';
import { toolRegistry } from '../../utils/registry.js';

function invoke(tool: string, args: Record<string, unknown>) {
  return toolRegistry.getHandler(tool)!(args);
}

const created = () => mockCreate.mock.calls[0][0] as Record<string, unknown>;
const updated = () => mockUpdate.mock.calls[0][1] as Record<string, unknown>;

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({ data: { status: true, result: { id: 7 } } });
  mockUpdate.mockReset().mockResolvedValue({ data: { status: true } });
  mockDelete.mockReset().mockResolvedValue({ data: { status: true } });
  // The API answers with labels — `"type": "string"` — while taking numbers on
  // the way in. Verified against the live API; mocking numbers here once hid a
  // real failure behind a green test.
  mockGet
    .mockReset()
    .mockResolvedValue({ data: { status: true, result: { id: 7, entity: 'case', type: 'string' } } });
});

describe('registration', () => {
  it('registers both tools as discoverable', () => {
    expect(toolRegistry.hasTool('qase_custom_field_upsert')).toBe(true);
    expect(toolRegistry.hasTool('qase_custom_field_delete')).toBe(true);
    const listed = toolRegistry.getTools().map((t) => t.name);
    expect(listed).not.toContain('qase_custom_field_upsert');
  });

  it('marks deletion destructive so the confirmation gate covers it', () => {
    expect(toolRegistry.getTool('qase_custom_field_delete')?.annotations?.destructiveHint).toBe(
      true,
    );
  });
});

describe('creating a custom field', () => {
  it('maps the entity and type labels to the numbers the API wants', async () => {
    const result = await invoke('qase_custom_field_upsert', {
      title: 'Component',
      entity: 'case',
      type: 'string',
    });

    expect(created()).toMatchObject({ title: 'Component', entity: 0, type: 1 });
    expect(result).toEqual({ id: 7 });
  });

  it('maps every entity label', async () => {
    for (const [label, code] of [
      ['case', 0],
      ['run', 1],
      ['defect', 2],
    ] as const) {
      mockCreate.mockClear();
      await invoke('qase_custom_field_upsert', { title: 'F', entity: label, type: 'string' });
      expect(mockCreate.mock.calls[0][0]).toMatchObject({ entity: code });
    }
  });

  it('maps every type label', async () => {
    for (const [label, code] of [
      ['number', 0],
      ['string', 1],
      ['text', 2],
      ['selectbox', 3],
      ['checkbox', 4],
      ['radio', 5],
      ['multiselect', 6],
      ['url', 7],
      ['user', 8],
      ['datetime', 9],
    ] as const) {
      mockCreate.mockClear();
      const args: Record<string, unknown> = { title: 'F', entity: 'case', type: label };
      if (['selectbox', 'radio', 'multiselect'].includes(label)) args.value = ['a', 'b'];
      await invoke('qase_custom_field_upsert', args);
      expect(mockCreate.mock.calls[0][0]).toMatchObject({ type: code });
    }
  });

  it('turns a list of option titles into the shape the API expects', async () => {
    await invoke('qase_custom_field_upsert', {
      title: 'Component',
      entity: 'case',
      type: 'selectbox',
      value: ['API', 'UI'],
    });

    expect(created().value).toEqual([{ title: 'API' }, { title: 'UI' }]);
  });

  it('refuses a selectbox with no options, before calling the API', async () => {
    await expect(
      invoke('qase_custom_field_upsert', { title: 'C', entity: 'case', type: 'selectbox' }),
    ).rejects.toThrow(/value/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('requires entity and type when creating', async () => {
    await expect(invoke('qase_custom_field_upsert', { title: 'C' })).rejects.toThrow(
      /entity|type/i,
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('passes the flags and project scoping through', async () => {
    await invoke('qase_custom_field_upsert', {
      title: 'C',
      entity: 'case',
      type: 'string',
      is_required: true,
      is_filterable: true,
      projects_codes: ['DEMO'],
    });

    expect(created()).toMatchObject({
      is_required: true,
      is_filterable: true,
      projects_codes: ['DEMO'],
    });
  });
});

describe('updating a custom field', () => {
  it('updates by id and never sends entity or type — the API cannot change them', async () => {
    const result = await invoke('qase_custom_field_upsert', {
      id: 7,
      title: 'Renamed',
      entity: 'case',
      type: 'string',
    });

    expect(mockUpdate.mock.calls[0][0]).toBe(7);
    expect(updated()).toMatchObject({ title: 'Renamed' });
    expect(updated()).not.toHaveProperty('entity');
    expect(updated()).not.toHaveProperty('type');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 7 });
  });

  it('says so when the caller asks for a type that cannot be changed', async () => {
    // The field is a string; the caller asks for datetime.
    const result = (await invoke('qase_custom_field_upsert', {
      id: 7,
      title: 'Renamed',
      type: 'datetime',
    })) as { warning?: string };

    expect(result.warning).toMatch(/type/i);
    expect(updated()).not.toHaveProperty('type');
  });

  it('stays quiet when the given type matches what the field already is', async () => {
    const result = (await invoke('qase_custom_field_upsert', {
      id: 7,
      title: 'Renamed',
      type: 'string',
    })) as { warning?: string };

    expect(result.warning).toBeUndefined();
  });
});

// Verified against the live API: updating a selectbox without re-sending its
// options fails with an opaque "Data is invalid". Renaming a field is the most
// ordinary thing to do, so the options are carried over rather than demanded.
describe('updating a field whose type needs options', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({
      data: {
        status: true,
        result: {
          id: 7,
          entity: 'case',
          type: 'selectbox',
          value: '[{"id": 1, "title": "API"}, {"id": 2, "title": "UI"}]',
        },
      },
    });
  });

  it('carries the existing options over when the caller sends none', async () => {
    await invoke('qase_custom_field_upsert', { id: 7, title: 'Renamed' });

    expect(updated().value).toEqual([
      { id: 1, title: 'API' },
      { id: 2, title: 'UI' },
    ]);
  });

  it('keeps the option ids, so values already chosen on cases survive', async () => {
    await invoke('qase_custom_field_upsert', { id: 7, title: 'Renamed' });

    expect((updated().value as Array<{ id?: number }>).every((o) => o.id !== undefined)).toBe(true);
  });

  it('uses the options the caller sent instead, when there are any', async () => {
    await invoke('qase_custom_field_upsert', { id: 7, title: 'Renamed', value: ['Only'] });

    expect(updated().value).toEqual([{ title: 'Only' }]);
  });

  it('sends no options for a type that has none', async () => {
    mockGet.mockResolvedValue({
      data: { status: true, result: { id: 7, entity: 'case', type: 'string' } },
    });

    await invoke('qase_custom_field_upsert', { id: 7, title: 'Renamed' });

    expect(updated()).not.toHaveProperty('value');
  });

  it('understands a numeric type code too, not only the label', async () => {
    mockGet.mockResolvedValue({
      data: {
        status: true,
        result: { id: 7, entity: 0, type: 3, value: '[{"id": 1, "title": "API"}]' },
      },
    });

    await invoke('qase_custom_field_upsert', { id: 7, title: 'Renamed' });

    expect(updated().value).toEqual([{ id: 1, title: 'API' }]);
  });

  it('still updates when the current options cannot be read', async () => {
    mockGet.mockRejectedValue(new Error('nope'));

    await invoke('qase_custom_field_upsert', { id: 7, title: 'Renamed' });

    expect(mockUpdate).toHaveBeenCalled();
  });
});

// Verified against the live API: the update endpoint replaces the record
// rather than patching it. Renaming a field silently emptied its
// projects_codes, unscoping it from every project it belonged to.
describe('updating carries over what the caller did not mention', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({
      data: {
        status: true,
        result: {
          id: 7,
          entity: 'case',
          type: 'string',
          placeholder: 'ph',
          default_value: 'dv',
          is_filterable: true,
          is_visible: true,
          is_required: true,
          is_enabled_for_all_projects: false,
          projects_codes: ['DEMO', 'NP'],
        },
      },
    });
  });

  it('keeps the field scoped to the projects it already applied to', async () => {
    await invoke('qase_custom_field_upsert', { id: 7, title: 'Renamed' });

    expect(updated().projects_codes).toEqual(['DEMO', 'NP']);
  });

  it('keeps the flags, placeholder and default value', async () => {
    await invoke('qase_custom_field_upsert', { id: 7, title: 'Renamed' });

    expect(updated()).toMatchObject({
      placeholder: 'ph',
      default_value: 'dv',
      is_filterable: true,
      is_visible: true,
      is_required: true,
      is_enabled_for_all_projects: false,
    });
  });

  it('lets the caller override any of them', async () => {
    await invoke('qase_custom_field_upsert', {
      id: 7,
      title: 'Renamed',
      is_required: false,
      projects_codes: ['OTHER'],
    });

    expect(updated()).toMatchObject({ is_required: false, projects_codes: ['OTHER'] });
  });

  it('sends the new title, not the old one', async () => {
    await invoke('qase_custom_field_upsert', { id: 7, title: 'Renamed' });

    expect(updated().title).toBe('Renamed');
  });

  it('updates with what it was given when the field cannot be read', async () => {
    mockGet.mockRejectedValue(new Error('nope'));

    await invoke('qase_custom_field_upsert', { id: 7, title: 'Renamed' });

    expect(updated()).toEqual({ title: 'Renamed' });
  });
});

describe('qase_custom_field_delete', () => {
  it('deletes by id', async () => {
    const result = await invoke('qase_custom_field_delete', { id: 7 });

    expect(mockDelete).toHaveBeenCalledWith(7);
    expect(result).toEqual({ success: true, id: 7 });
  });
});
