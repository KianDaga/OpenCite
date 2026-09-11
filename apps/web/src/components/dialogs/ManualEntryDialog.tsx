import { useEffect, useMemo, useState } from 'react';
import { accessedToday, type CSLDate, type CSLItem, type CSLItemType, type CSLName } from '@opencite/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { COMMON_EXTRA_FIELDS, COMMON_TYPES, fieldsForType, type FieldSpec } from '@/lib/cslFields';
import { useCitation, useLibraryActions, useLibraryState } from '@/state';
import { DateField, NameEditor, TextField } from './fields';

/**
 * Add or edit a reference by hand.
 *
 * Which fields appear follows the reference type, because CSL's eighty-odd
 * variables are mostly meaningless for any given one — a book has no issue
 * number. Changing the type re-shapes the form but keeps whatever was already
 * typed, so picking the wrong type first is not punished.
 */
export function ManualEntryDialog() {
  const { dialog } = useLibraryState();
  const actions = useLibraryActions();

  const open = dialog?.kind === 'manual-entry';
  const editingId = dialog?.kind === 'manual-entry' ? dialog.citationId : undefined;
  const prefill = dialog?.kind === 'manual-entry' ? dialog.prefill : undefined;
  const existing = useCitation(editingId);

  const [type, setType] = useState<CSLItemType>('webpage');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [showMore, setShowMore] = useState(false);

  // Load the reference being edited, or reset for a new one.
  useEffect(() => {
    if (!open) return;
    if (existing) {
      const { id: _id, type: existingType, ...rest } = existing.csl;
      setType(existingType);
      setValues(rest);
    } else if (!editingId) {
      const { type: seedType, ...seedValues } = prefill ?? {};
      setType((seedType as CSLItemType) ?? 'webpage');
      // A page cited by hand still needs the date it was read; filling it in is
      // both correct and one less thing to look up.
      setValues(
        seedType === 'webpage' || seedType === 'post-weblog'
          ? { accessed: accessedToday(), ...seedValues }
          : seedValues,
      );
    }
    setShowMore(false);
    // `prefill` is a fresh object each render, so it is compared by content.
  }, [open, editingId, existing, JSON.stringify(prefill)]);

  const fields = useMemo(() => fieldsForType(type), [type]);

  const extraFields = useMemo(
    () => COMMON_EXTRA_FIELDS.filter((field) => !fields.some((f) => f.name === field.name)),
    [fields],
  );

  const set = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const close = () => actions.closeDialog();

  const save = async () => {
    // Drop empties so a hand-entered reference is no messier than a fetched one.
    const csl: Record<string, unknown> = { type };
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        const names = (value as CSLName[]).filter(
          (n) => (n.family ?? '') !== '' || (n.given ?? '') !== '' || (n.literal ?? '') !== '',
        );
        if (names.length === 0) continue;
        csl[key] = names;
        continue;
      }
      csl[key] = value;
    }

    if (editingId) {
      // Send every editable key, so clearing a field actually clears it.
      const patch: Record<string, unknown> = { ...csl };
      for (const field of [...fields, ...extraFields]) {
        if (!(field.name in patch)) patch[field.name] = undefined;
      }
      await actions.updateCitation(editingId, patch as Partial<CSLItem>);
    } else {
      await actions.addCitation(csl as Omit<CSLItem, 'id'>, { allowDuplicate: true });
    }
    close();
  };

  const renderField = (field: FieldSpec) => {
    const id = `field-${field.name}`;
    if (field.kind === 'names') {
      return (
        <div key={field.name} className="sm:col-span-2">
          <NameEditor
            label={field.label}
            value={(values[field.name] as CSLName[]) ?? []}
            onChange={(next) => set(field.name, next)}
          />
        </div>
      );
    }
    if (field.kind === 'date') {
      return (
        <DateField
          key={field.name}
          id={id}
          label={field.label}
          value={values[field.name] as CSLDate | undefined}
          onChange={(next) => set(field.name, next)}
        />
      );
    }
    return (
      <TextField
        key={field.name}
        id={id}
        label={field.label}
        placeholder={field.placeholder ?? ''}
        multiline={field.kind === 'textarea'}
        className={field.wide ? 'sm:col-span-2' : undefined}
        value={(values[field.name] as string) ?? ''}
        onChange={(next) => set(field.name, next)}
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-2xl">
        <div className="flex flex-col gap-1">
          <DialogTitle>{editingId ? 'Edit reference' : 'Add a reference by hand'}</DialogTitle>
          <DialogDescription>
            {editingId
              ? 'Changes are saved to this project only.'
              : 'For sources with no URL, DOI or ISBN to look up.'}
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reference-type">Reference type</Label>
          <select
            id="reference-type"
            value={type}
            onChange={(event) => setType(event.target.value as CSLItemType)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {COMMON_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="-mx-1 grid flex-1 grid-cols-1 gap-3 overflow-y-auto px-1 sm:grid-cols-2">
          {fields.map(renderField)}

          {showMore ? (
            extraFields.map(renderField)
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground sm:col-span-2"
              onClick={() => setShowMore(true)}
            >
              More fields
            </Button>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>
            {editingId ? 'Save changes' : 'Add reference'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
