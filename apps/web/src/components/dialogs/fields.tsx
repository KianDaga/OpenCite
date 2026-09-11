import { Plus, X } from 'lucide-react';
import type { CSLDate, CSLName } from '@opencite/shared';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Editors for the two CSL shapes that are not plain strings.
 *
 * Names and dates are where hand-entered references go wrong. A name is
 * family/given (or a single literal for an organisation), and a date carries
 * its own precision — "1998" must stay "1998" rather than becoming
 * 1 January 1998, because styles print those differently. Free-text boxes
 * would let both drift, so each gets a real editor.
 */

export function NameEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CSLName[];
  onChange: (next: CSLName[]) => void;
}) {
  const names = value.length > 0 ? value : [{ family: '', given: '' }];

  const update = (index: number, patch: Partial<CSLName>) => {
    onChange(names.map((name, i) => (i === index ? { ...name, ...patch } : name)));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-col gap-1.5">
        {names.map((name, index) => {
          const isOrganisation = name.literal !== undefined;
          return (
            <div key={index} className="flex items-center gap-1.5">
              {isOrganisation ? (
                <Input
                  value={name.literal ?? ''}
                  aria-label={`${label} ${index + 1} — organisation`}
                  placeholder="Organisation name"
                  onChange={(e) => update(index, { literal: e.target.value })}
                />
              ) : (
                <>
                  <Input
                    value={name.given ?? ''}
                    aria-label={`${label} ${index + 1} — first name`}
                    placeholder="First name"
                    onChange={(e) => update(index, { given: e.target.value })}
                  />
                  <Input
                    value={name.family ?? ''}
                    aria-label={`${label} ${index + 1} — last name`}
                    placeholder="Last name"
                    onChange={(e) => update(index, { family: e.target.value })}
                  />
                </>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 px-2 text-xs text-muted-foreground"
                title={isOrganisation ? 'Switch to a person' : 'This is an organisation'}
                onClick={() =>
                  onChange(
                    names.map((n, i) =>
                      i === index
                        ? isOrganisation
                          ? { family: '', given: '' }
                          : { literal: [n.given, n.family].filter(Boolean).join(' ') }
                        : n,
                    ),
                  )
                }
              >
                {isOrganisation ? 'Person' : 'Org'}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
                disabled={names.length === 1}
                onClick={() => onChange(names.filter((_, i) => i !== index))}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground"
        onClick={() => onChange([...names, { family: '', given: '' }])}
      >
        <Plus className="h-3.5 w-3.5" /> Add another
      </Button>
    </div>
  );
}

/** `[2019, 3, 12]` → `"2019-03-12"`, `[2019]` → `"2019"`. */
export function dateToInput(date: CSLDate | undefined): string {
  if (!date) return '';
  if (date.literal) return date.literal;
  const parts = date['date-parts']?.[0];
  if (!parts?.length) return '';
  return parts.map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0'))).join('-');
}

/**
 * Reads a partial date without filling in what was not typed.
 *
 * `2019` stays a year, `2019-03` stays a year and month. Defaulting the
 * missing parts to 1 would put a day in the citation that the source never
 * claimed.
 */
export function inputToDate(input: string): CSLDate | undefined {
  const text = input.trim();
  if (!text) return undefined;

  const match = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(text);
  if (!match) return { literal: text };

  const parts = [Number(match[1])];
  if (match[2]) parts.push(Number(match[2]));
  if (match[3]) parts.push(Number(match[3]));
  return { 'date-parts': [parts as [number]] };
}

export function DateField({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: CSLDate | undefined;
  onChange: (next: CSLDate | undefined) => void;
  id: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={dateToInput(value)}
        placeholder="2019, 2019-03, or 2019-03-12"
        onChange={(e) => onChange(inputToDate(e.target.value))}
      />
      <p className="text-[11px] text-muted-foreground">
        Year alone is fine — only add what the source states.
      </p>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  id,
  placeholder,
  multiline,
  className,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  id: string;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
