import { Alert, Box, Button, Checkbox, FormControlLabel, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AutocompleteInput,
  BooleanInput,
  DateInput,
  DateTimeInput,
  maxLength,
  maxValue,
  minLength,
  minValue,
  NumberInput,
  NullableBooleanInput,
  Loading,
  ReferenceInput,
  required,
  SelectArrayInput,
  SelectInput,
  TextInput,
  type Validator,
} from "react-admin";
import { useFormContext, useWatch } from "react-hook-form";
import { useDescribe, useSteward } from "./context.js";
import { rowMeta } from "./dataProvider.js";
import type { ActionDesc, FormFieldDesc, InputKind, TableDesc } from "./protocol.js";
import { FormDialog } from "./actions.js";
import { NO_SORT, StewardTable } from "./table.js";
import { formInitialValues, parseDateTime, referencePageSize } from "./inputs.js";
import { QueryError } from "./feedback.js";

const choicesOf = (input: InputKind) => (input.type === "select" ? input.options.map((o) => ({ id: o.value, name: o.label })) : []);

const validatorsOf = (field: FormFieldDesc): Validator[] => [
  ...(field.required && field.input.type !== "bool" ? [field.input.type === "list" ? ((value, values) => Array.isArray(value) ? undefined : required()(value, values)) as Validator : required()] : []),
  ...(field.minLength !== null ? [minLength(field.minLength)] : []),
  ...(field.maxLength !== null ? [maxLength(field.maxLength)] : []),
  ...(field.minValue !== null ? [minValue(field.minValue)] : []),
  ...(field.maxValue !== null ? [maxValue(field.maxValue)] : []),
];

/** The inputs of the fields of a form (or of a record embedded in it, under @prefix@). */
export const FormInputs = ({
  service,
  action,
  recordKey,
  fields,
  prefix,
}: {
  service: string;
  action: ActionDesc;
  recordKey: string | null;
  fields: FormFieldDesc[];
  prefix: string;
}) => (
  <>
    {fields.map((field) => (
      <FormInput key={field.name} service={service} action={action} recordKey={recordKey} field={field} source={prefix + field.name} />
    ))}
  </>
);

const FormInput = ({
  service,
  action,
  recordKey,
  field,
  source,
}: {
  service: string;
  action: ActionDesc;
  recordKey: string | null;
  field: FormFieldDesc;
  source: string;
}) => {
  const common = { source, label: field.label, helperText: field.helperText ?? undefined, validate: validatorsOf(field), fullWidth: true };
  if (field.fields) {
    return <EmbeddedInput service={service} action={action} recordKey={recordKey} field={field} source={source} />;
  }
  const input = field.input;
  switch (input.type) {
    case "text":
      return <TextInput {...common} />;
    case "textarea":
      return <TextInput {...common} multiline minRows={3} />;
    case "number":
      return <NumberInput {...common} step={input.decimals === null ? "any" : 1 / 10 ** input.decimals} />;
    case "date":
      return <DateInput {...common} />;
    case "datetime":
      return <DateTimeInput {...common} parse={parseDateTime} />;
    case "bool":
      return field.required ? <BooleanInput {...common} defaultValue={false} /> : <NullableBooleanInput {...common} />;
    case "select":
      return <SelectInput {...common} choices={choicesOf(input)} />;
    case "reference":
      return <ReferencePicker service={service} action={action} recordKey={recordKey} field={field} source={source} resource={input.resource} />;
    case "list":
      if (input.of.type === "select") return <SelectArrayInput {...common} choices={choicesOf(input.of)} />;
      return <JsonInput {...common} />;
    case "json":
      return <JsonInput {...common} />;
  }
};

const EmbeddedInput = ({ service, action, recordKey, field, source }: {
  service: string; action: ActionDesc; recordKey: string | null; field: FormFieldDesc; source: string;
}) => {
  const { control, setValue, clearErrors } = useFormContext();
  const value = useWatch({ control, name: source });
  const enabled = field.required || value != null;
  return (
    <Box component="fieldset" sx={{ border: 1, borderColor: "divider", borderRadius: 1, px: 2, pt: 1, mb: 2 }}>
      <Typography component="legend" variant="caption" sx={{ px: 0.5 }}>{field.label}</Typography>
      {!field.required && <FormControlLabel label={`Include ${field.label}`} control={<Checkbox checked={enabled} onChange={(_, checked) => {
        setValue(source, checked ? formInitialValues(field.fields ?? []) : null, { shouldDirty: true });
        clearErrors(source);
      }} />} />}
      {enabled && <FormInputs service={service} action={action} recordKey={recordKey} fields={field.fields ?? []} prefix={`${source}.`} />}
    </Box>
  );
};

const JsonInput = (props: { source: string; label: string; helperText?: string; validate: Validator[]; fullWidth: boolean }) => (
  <TextInput
    {...props}
    multiline
    format={(v: unknown) => (v === undefined || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2))}
    parse={(v: string) => {
      try {
        return v === "" ? null : JSON.parse(v);
      } catch {
        return v;
      }
    }}
  />
);

/** A reference of a form: typed with a search as you type, or picked from the picker's table. */
const ReferencePicker = ({
  service,
  action,
  recordKey,
  field,
  source,
  resource,
}: {
  service: string;
  action: ActionDesc;
  recordKey: string | null;
  field: FormFieldDesc;
  source: string;
  resource: string;
}) => {
  const [browsing, setBrowsing] = useState(false);
  const describe = useDescribe(service);
  const place = { steward: { service, picker: { action: action.id, field: source, key: recordKey ?? undefined } } };
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
      <Box sx={{ flex: 1 }}>
        <ReferenceInput source={source} reference={resource} queryOptions={{ meta: place }} sort={NO_SORT} perPage={referencePageSize(describe.data)}>
          <AutocompleteInput
            label={field.label}
            helperText={field.helperText ?? undefined}
            validate={validatorsOf(field)}
            optionText={(r) => rowMeta(r).title ?? (typeof r.name === "string" ? r.name : String(r.id))}
            filterToQuery={(q: string) => ({ q })}
            fullWidth
          />
        </ReferenceInput>
      </Box>
      <Button sx={{ mt: 1.5 }} onClick={() => setBrowsing(true)}>
        Browse
      </Button>
      {browsing && <PickerDialog service={service} action={action} recordKey={recordKey} source={source} label={field.label} onClose={() => setBrowsing(false)} />}
    </Box>
  );
};

/** The table a reference is picked from: a click on a row sets it. */
const PickerDialog = ({
  service,
  action,
  recordKey,
  source,
  label,
  onClose,
}: {
  service: string;
  action: ActionDesc;
  recordKey: string | null;
  source: string;
  label: string;
  onClose: () => void;
}) => {
  const { client } = useSteward();
  const { setValue } = useFormContext();
  const pickers = useQuery({
    queryKey: ["steward", "pickers", service, action.id, recordKey],
    queryFn: () => client.request<Record<string, TableDesc>>(service, ["actions", action.id, "pickers"], { query: { key: recordKey } }),
    retry: false,
  });
  const table = pickers.data?.[source];
  return (
    <FormDialog width="md" title={label} onClose={onClose}>
      {pickers.error ? <QueryError error={pickers.error} retry={pickers.refetch} /> : pickers.isPending ? <Loading /> : !table ? <Alert severity="warning">This reference is not available.</Alert> : null}
      {table && (
        <StewardTable
          service={service}
          desc={table}
          picker={{ action: action.id, field: source, key: recordKey ?? undefined }}
          onPick={(record) => {
            setValue(source, record.id, { shouldDirty: true, shouldValidate: true });
            onClose();
          }}
        />
      )}
    </FormDialog>
  );
};
